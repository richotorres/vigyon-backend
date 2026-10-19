import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import {
  analizarConGPT,
  analizarImagenConGPT
} from "./ia-gpt.js";
import {
  transcribirAudio
} from "./whisper.js";
import {
  mensajeYaProcesado
} from "./mensajes.js";
import {
  descargarImagenWhatsApp,
  guardarEvidencia
} from "./evidencias.js";

import fs from "fs";
import { randomUUID } from "node:crypto";

dotenv.config();

// Mantiene el proyecto de Supabase actual como respaldo, pero prefiere la variable de entorno.
const SUPABASE_URL_BASE = (
  process.env.SUPABASE_URL ||
  "https://oszjlipttlqvyqwffrdc.supabase.co"
).replace(/\/+$/, "");
const SUPABASE_REST_URL = `${SUPABASE_URL_BASE}/rest/v1`;

// Selección temporal por teléfono cuando el remitente tiene varios casos abiertos.
// Persiste mientras este proceso del backend esté en ejecución.
const seleccionCasoPorTelefono = new Map();
const VENTANA_ASOCIACION_EVIDENCIAS_MS = 24 * 60 * 60 * 1000;

const app = express();

app.use(cors());
app.use(express.json());

/*
========================================
ROOT
========================================
*/

app.get("/", (req, res) => {

  res
    .status(200)
    .send("VIGYON IA Backend funcionando 🚀");
});

/*
========================================
WEBHOOK VERIFICATION
========================================
*/

app.get("/webhook", (req, res) => {

  const verify_token =
    process.env.VERIFY_TOKEN;

  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];

  if (mode && token) {

    if (
      mode === "subscribe" &&
      token === verify_token
    ) {

      console.log(
        "Webhook verificado correctamente ✅"
      );

      return res
        .status(200)
        .send(challenge);

    } else {

      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
});

/*
========================================
SEND WHATSAPP MESSAGE
========================================
*/

const sendWhatsAppMessage = async (
  to,
  message
) => {

  try {

    await axios({
      method: "POST",

      url:
        `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,

      headers: {
        Authorization:
          `Bearer ${process.env.WHATSAPP_TOKEN}`,

        "Content-Type":
          "application/json",
      },

      data: {
        messaging_product:
          "whatsapp",

        to: to,

        text: {
          body: message,
        },
      },
    });

   console.log("========== WHATSAPP ==========");
console.log(message);
console.log("==============================");

  } catch (error) {

    console.log(
      "Error enviando mensaje:",
      error.response?.data ||
      error.message
    );
  }
};

/*
========================================
GUARDAR INCIDENTE EN SUPABASE
========================================
*/

const guardarIncidente = async (
  telefono,
  mensaje,
  tipoDelito,
  prioridad,
  categoriaGPT = null,
  prioridadGPT = null,
  confianzaGPT = null
) => {

  try {

    const url = `${SUPABASE_REST_URL}/incidentes`;



    const response =
      await axios.post(
  url,
  {
    telefono,

    mensaje,

    tipo_delito:
      tipoDelito,

    prioridad,

    categoria_gpt:
      categoriaGPT,

    prioridad_gpt:
      prioridadGPT,

    confianza_gpt:
      confianzaGPT
  },

        {
          headers: {

            apikey:
              process.env.SUPABASE_SERVICE_KEY,

            Authorization:
              `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,

            "Content-Type":
              "application/json",

            Prefer:
              "return=representation",
          },
        }
      );

    console.log(
      "Incidente guardado en Supabase ✅"
    );

    return response.data[0];

  } catch (error) {

    console.log(
      "ERROR SUPABASE ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );

    return null;
  }
};

/*
========================================
BUSCAR INCIDENTES ABIERTOS / ASOCIACION
========================================
*/

const normalizarValor = (valor) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const confianzaComoNumero = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;

  const texto = normalizarValor(valor);
  if (["alta", "alto", "high", "alta confianza", "high confidence"].includes(texto)) return 0.9;
  if (["media", "medio", "medium", "confianza media"].includes(texto)) return 0.65;
  if (["baja", "bajo", "low", "baja confianza", "low confidence"].includes(texto)) return 0.3;

  const esPorcentaje = typeof valor === "string" && valor.includes("%");
  const numero = Number(String(valor).replace("%", "").trim());
  if (!Number.isFinite(numero) || numero < 0) return null;
  // Admite 0.92, 92 y "92%", según el formato del clasificador.
  if (esPorcentaje || (numero > 1 && numero <= 100)) return numero / 100;
  return numero;
};

const estadosCerrados = new Set([
  "resuelto",
  "resuelta",
  "cerrado",
  "cerrada",
  "finalizado",
  "finalizada",
  "completado",
  "completada",
  "closed",
  "resolved",
  "completed",
  "cancelado",
  "cancelada",
  "cancelled",
  "canceled",
  "descartado",
  "descartada"
]);

const incidenteEstaCerrado = (incidente) =>
  estadosCerrados.has(normalizarValor(incidente?.estado));

const incidenteEsGeneral = (incidente) =>
  normalizarValor(incidente?.categoria_gpt) === "general" ||
  normalizarValor(incidente?.tipo_delito) === "general";

const incidenteEsReciente = (incidente) => {
  if (!incidente?.created_at) return true;

  const fecha = Date.parse(incidente.created_at);
  if (!Number.isFinite(fecha)) return true;

  const antiguedad = Date.now() - fecha;
  return antiguedad >= -60_000 && antiguedad <= VENTANA_ASOCIACION_EVIDENCIAS_MS;
};

const listarIncidentesAbiertos = async (telefono) => {
  try {
    const response = await axios.get(
      `${SUPABASE_REST_URL}/incidentes`,
      {
        params: {
          telefono: `eq.${telefono}`,
          order: "id.desc",
          limit: 100
        },
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        }
      }
    );

    return (response.data || []).filter((incidente) =>
      !incidenteEstaCerrado(incidente) &&
      !incidenteEsGeneral(incidente) &&
      incidenteEsReciente(incidente)
    );
  } catch (error) {
    console.error(
      "Error buscando incidentes abiertos:",
      error.response?.data || error.message
    );
    return null;
  }
};

const buscarIncidentePropioAbierto = async (incidenteId, telefono) => {
  try {
    const response = await axios.get(
      `${SUPABASE_REST_URL}/incidentes`,
      {
        params: {
          id: `eq.${incidenteId}`,
          telefono: `eq.${telefono}`,
          limit: 1
        },
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        }
      }
    );

    const incidente = response.data?.[0];
    if (!incidente || incidenteEstaCerrado(incidente)) return null;
    return incidente;
  } catch (error) {
    console.error(
      "Error validando el incidente seleccionado:",
      error.response?.data || error.message
    );
    return null;
  }
};

const resolverIncidenteParaMensaje = async (telefono) => {
  const seleccionadoId = seleccionCasoPorTelefono.get(telefono);

  if (seleccionadoId) {
    const seleccionado = await buscarIncidentePropioAbierto(seleccionadoId, telefono);
    if (seleccionado) {
      return { incidente: seleccionado, ambiguo: false, seleccionInvalida: false };
    }

    seleccionCasoPorTelefono.delete(telefono);
    return { incidente: null, ambiguo: false, seleccionInvalida: true, incidentes: [] };
  }

  const abiertos = await listarIncidentesAbiertos(telefono);
  if (!Array.isArray(abiertos)) {
    return { incidente: null, ambiguo: false, seleccionInvalida: false, errorConsulta: true, incidentes: [] };
  }
  if (abiertos.length === 1) {
    return { incidente: abiertos[0], ambiguo: false, seleccionInvalida: false };
  }
  if (abiertos.length > 1) {
    return { incidente: null, ambiguo: true, seleccionInvalida: false, incidentes: abiertos };
  }

  return { incidente: null, ambiguo: false, seleccionInvalida: false, incidentes: [] };
};

const mensajeSeleccionCaso = (incidentes = []) => {
  const ids = incidentes.slice(0, 10).map((item) => `#${item.id}`).join(", ");
  const listado = ids ? `\nCasos abiertos recientes: ${ids}.` : "";

  return `⚠️ Este número tiene más de un incidente abierto y no quiero asociar tu evidencia al caso equivocado.${listado}\n\nEscribe CASO seguido del número del incidente (por ejemplo: CASO 123) y después vuelve a enviar la fotografía, el audio o la ubicación. La selección seguirá activa hasta que escribas CANCELAR CASO.`;
};

/*
========================================
ACTUALIZAR UBICACION
========================================
*/

const actualizarUbicacion = async (
  incidenteId,
  ubicacion,
  googleMaps
) => {

  try {

    await axios.patch(

      `${SUPABASE_REST_URL}/incidentes?id=eq.${incidenteId}`,

      {
        ubicacion,
        google_maps:
          googleMaps,
      },

      {
        headers: {

          apikey:
            process.env.SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,

          "Content-Type":
            "application/json",

          Prefer:
            "return=representation",
        },
      }
    );

    console.log(
      "Ubicación actualizada ✅"
    );

  } catch (error) {

    console.log(
      "Error actualizando ubicación ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );
  }
};

/*
========================================
ACTUALIZAR IMAGEN
========================================
*/

const actualizarImagen = async (
  incidenteId,
  imagenUrl
) => {

  try {

    await axios.patch(

      `${SUPABASE_REST_URL}/incidentes?id=eq.${incidenteId}`,

      {
        imagen_url: imagenUrl
      },

      {
        headers: {

          apikey:
            process.env.SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,

          "Content-Type":
            "application/json",

          Prefer:
            "return=representation",
        },
      }
    );

    console.log(
      "Imagen actualizada ✅"
    );

  } catch (error) {

    console.log(
      "Error actualizando imagen ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );
  }
};

// Guarda el análisis visual en las columnas confirmadas de la tabla incidentes.
const actualizarAnalisisImagen = async (incidenteId, analisis) => {
  try {
    const datos = {
      descripcion_visual: analisis?.descripcion_visual || null,
      justificacion_prioridad: analisis?.justificacion || null,
      requiere_revision: Boolean(analisis?.requiere_revision)
    };

    await axios.patch(
      `${SUPABASE_REST_URL}/incidentes?id=eq.${incidenteId}`,
      datos,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }
      }
    );

    console.log("Análisis visual guardado en Supabase ✅");
  } catch (error) {
    // Un error al guardar el análisis no debe impedir guardar la evidencia.
    console.error(
      "Error guardando análisis visual:",
      error.response?.data || error.message
    );
  }
};

const actualizarAudio = async (
  incidenteId,
  audioUrl
) => {

  try {

    await axios.patch(

      `${SUPABASE_REST_URL}/incidentes?id=eq.${incidenteId}`,

      {
        audio_url: audioUrl
      },

      {
        headers: {

          apikey:
            process.env.SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,

          "Content-Type":
            "application/json",

          Prefer:
            "return=representation",
        },
      }
    );

    console.log(
      "Audio actualizado ✅"
    );

  } catch (error) {

    console.log(
      "Error actualizando audio ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );
  }
}; 

const actualizarAnalisisAudio = async (
  incidenteId,
  mensaje,
  tipoDelito,
  prioridad,
  categoriaGPT,
  prioridadGPT,
  confianzaGPT
) => {

  try {

    await axios.patch(

      `${SUPABASE_REST_URL}/incidentes?id=eq.${incidenteId}`,

      {

        mensaje,

        tipo_delito: tipoDelito,

        prioridad,

        categoria_gpt: categoriaGPT,

        prioridad_gpt: prioridadGPT,

        confianza_gpt: confianzaGPT

      },

      {

        headers: {

          apikey:
            process.env.SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,

          "Content-Type":
            "application/json"

        }

      }

    );

    console.log(
      "Analisis del audio actualizado ✅"
    );

  } catch (error) {

    console.log(
      "ERROR ACTUALIZANDO ANALISIS ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );

  }

};



const descargarAudioWhatsApp = async (
  mediaId
) => {

  try {

    const mediaResponse =
      await axios.get(
        `https://graph.facebook.com/v20.0/${mediaId}`,
        {
          headers: {
            Authorization:
              `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
        }
      );

    const audioUrl =
      mediaResponse.data.url;

    console.log(
      "URL audio obtenida ✅"
    );

    return audioUrl;

  } catch (error) {

    console.log(
      "Error obteniendo audio ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );

    return null;
  }
};

const subirImagenSupabase = async (rutaLocalImagen, incidenteId) => {
  try {
    const imageBuffer = fs.readFileSync(rutaLocalImagen);
    const nombreArchivo = `incidente_${incidenteId}_imagen_${Date.now()}_${randomUUID()}.jpg`;

    await axios.post(
      `${SUPABASE_URL_BASE}/storage/v1/object/evidencias/${nombreArchivo}`,
      imageBuffer,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "false"
        }
      }
    );

    const publicUrl = `${SUPABASE_URL_BASE}/storage/v1/object/public/evidencias/${nombreArchivo}`;
    console.log("Imagen subida a Storage ✅", nombreArchivo);

    return {
      publicUrl,
      storagePath: nombreArchivo,
      mimeType: "image/jpeg"
    };
  } catch (error) {
    console.error(
      "Error subiendo imagen a Supabase Storage:",
      error.response?.data || error.message
    );
    return null;
  }
};

const subirAudioSupabase = async (audioUrl, incidenteId, mimeTypeRecibido = "audio/ogg") => {
  try {
    const audioResponse = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
      }
    });

    const mimeType = String(mimeTypeRecibido || "audio/ogg").split(";")[0].trim();
    const extension = mimeType.includes("mpeg") ? "mp3" :
      mimeType.includes("mp4") ? "m4a" :
      mimeType.includes("wav") ? "wav" : "ogg";
    const nombreArchivo = `incidente_${incidenteId}_audio_${Date.now()}_${randomUUID()}.${extension}`;

    await axios.post(
      `${SUPABASE_URL_BASE}/storage/v1/object/audios/${nombreArchivo}`,
      Buffer.from(audioResponse.data),
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": mimeType || "audio/ogg",
          "x-upsert": "false"
        }
      }
    );

    const publicUrl = `${SUPABASE_URL_BASE}/storage/v1/object/public/audios/${nombreArchivo}`;
    console.log("Audio subido a Storage ✅", nombreArchivo);

    return {
      publicUrl,
      storagePath: nombreArchivo,
      mimeType: mimeType || "audio/ogg"
    };
  } catch (error) {
    console.error(
      "Error subiendo audio a Supabase Storage:",
      error.response?.data || error.message
    );
    return null;
  }
};

/*
========================================
RECEIVE WHATSAPP MESSAGES
========================================
*/

app.post("/webhook", async (req, res) => {

  try {
        console.log(
"NUEVO WEBHOOK"
);

    console.log(
      "Mensaje recibido:",
      JSON.stringify(
        req.body,
        null,
        2
      )
    );


    const message =
      req.body?.entry?.[0]
      ?.changes?.[0]
      ?.value?.messages?.[0];

      if (!message) {

  console.log("Webhook de estado recibido.");

  return res.sendStatus(200);

}

      console.log("================================");
console.log("MESSAGE ID:", message?.id);
console.log("TYPE:", message?.type);
console.log("FROM:", message?.from);
console.log("================================");

      if (await mensajeYaProcesado(message.id)) {

  console.log("🚫 Mensaje duplicado ignorado:", message.id);

  return res.sendStatus(200);

}

console.log(
  "MESSAGE COMPLETO:",
  JSON.stringify(message)
);

const from =
  message.from;

    /*
    ========================================
    MENSAJE TEXTO
    ========================================
    */

    if (message.type === "text") {
      const text = message.text?.body?.trim() || "";

      if (/^CANCELAR\s+CASO$/i.test(text)) {
        seleccionCasoPorTelefono.delete(from);
        await sendWhatsAppMessage(
          from,
          "✅ Selección de incidente cancelada. Cuando envíes una nueva evidencia, VIGYON IA buscará un único caso abierto reciente. Si hay varios, te pedirá elegir para evitar mezclarlos."
        );
        return res.sendStatus(200);
      }

      const comandoCaso = text.match(/^CASO\s*#?\s*(\d+)$/i);
      if (comandoCaso) {
        const incidenteId = comandoCaso[1];
        const incidente = await buscarIncidentePropioAbierto(incidenteId, from);

        if (!incidente) {
          await sendWhatsAppMessage(
            from,
            `⚠️ No encontré un incidente abierto con el número ${incidenteId} asociado a este teléfono. Revisa el número o envía CANCELAR CASO para quitar la selección actual.`
          );
          return res.sendStatus(200);
        }

        seleccionCasoPorTelefono.set(from, String(incidente.id));
        await sendWhatsAppMessage(
          from,
          `✅ Seleccionaste el incidente #${incidente.id}. Las próximas fotografías, audios y ubicaciones se asociarán a este caso hasta que elijas otro con CASO <número> o escribas CANCELAR CASO. Envía ahora la evidencia relacionada con este incidente.`
        );
        return res.sendStatus(200);
      }

      const resultadoGPT = await analizarConGPT(text);
      console.log("ANÁLISIS GPT TEXTO:", resultadoGPT);

      const categoria = normalizarValor(resultadoGPT?.categoria);
      const confianza = confianzaComoNumero(resultadoGPT?.confianza);
      const generalConfirmado = categoria === "general" && confianza !== null && confianza >= 0.85;

      if (generalConfirmado) {
        // Solo descartar como general cuando el propio clasificador devuelve confianza alta.
        await sendWhatsAppMessage(
          from,
          "ℹ️ Este mensaje no parece describir una emergencia o incidente operativo. Este canal está destinado a reportes concretos de situaciones que requieran atención. Si necesitas reportar una situación, describe qué ocurrió, dónde sucede y si alguien está en peligro. Si hay peligro inmediato, comunícate con las líneas oficiales de emergencia."
        );
        return res.sendStatus(200);
      }

      const requiereRevisionManual = !categoria || categoria === "general";
      const categoriaGuardar = requiereRevisionManual ? "por_revisar" : resultadoGPT.categoria;
      const prioridadGuardar = requiereRevisionManual
        ? "media"
        : String(resultadoGPT.prioridad || "alta").toLowerCase();

      // Un texto clasificado como nuevo incidente inicia un caso nuevo, no se anexa por error al seleccionado antes.
      seleccionCasoPorTelefono.delete(from);

      const incidente = await guardarIncidente(
        from,
        text,
        categoriaGuardar,
        prioridadGuardar,
        categoriaGuardar,
        requiereRevisionManual ? "Por revisar" : resultadoGPT.prioridad,
        resultadoGPT?.confianza ?? null
      );

      if (!incidente) {
        await sendWhatsAppMessage(
          from,
          "⚠️ Recibí tu mensaje, pero no pude guardar el reporte en este momento. Intenta enviarlo nuevamente en unos minutos."
        );
        return res.sendStatus(200);
      }

      if (requiereRevisionManual) {
        await sendWhatsAppMessage(
          from,
          `⚠️ Registré el reporte #${incidente.id} para revisión manual porque la clasificación automática no pudo confirmar la categoría con suficiente confianza.\n\n📍 Envía tu ubicación y describe cualquier detalle que ayude al operador. Puedes adjuntar fotografías o audios relacionados.`
        );
      } else {
        await sendWhatsAppMessage(
          from,
          `🚨 Registré el incidente #${incidente.id}.\n\nTipo: ${resultadoGPT.categoria}\nPrioridad: ${resultadoGPT.prioridad || "Por revisar"}\n\n📍 Envía tu ubicación.\n🎤 Puedes enviar un audio y 📷 fotografías relacionadas.\n👮 Un operador revisará el caso.`
        );
      }

      return res.sendStatus(200);
    }

    /*
========================================
IMAGEN
========================================
*/

    if (message.type === "image") {
      const asociacion = await resolverIncidenteParaMensaje(from);

      if (asociacion.errorConsulta) {
        await sendWhatsAppMessage(
          from,
          "⚠️ No pude consultar los incidentes abiertos ahora mismo. Para no asociar la evidencia al caso equivocado, vuelve a enviarla en unos minutos."
        );
        return res.sendStatus(200);
      }

      if (asociacion.seleccionInvalida) {
        await sendWhatsAppMessage(
          from,
          "⚠️ El incidente seleccionado ya no está disponible o fue cerrado. Envía CASO <número> para elegir un caso abierto y luego vuelve a enviar la fotografía."
        );
        return res.sendStatus(200);
      }

      if (asociacion.ambiguo) {
        await sendWhatsAppMessage(from, mensajeSeleccionCaso(asociacion.incidentes));
        return res.sendStatus(200);
      }

      let incidente = asociacion.incidente;
      const esEvidenciaAdicional = Boolean(incidente);

      if (!incidente) {
        incidente = await guardarIncidente(
          from,
          "EVIDENCIA FOTOGRAFICA",
          "evidencia",
          "alta"
        );
      }

      if (!incidente) {
        await sendWhatsAppMessage(
          from,
          "⚠️ No pude crear o localizar el incidente para guardar la fotografía. Intenta nuevamente en unos minutos."
        );
        return res.sendStatus(200);
      }

      let rutaLocalImagen = null;
      let evidenciaGuardada = false;

      try {
        rutaLocalImagen = await descargarImagenWhatsApp(message.image?.id);
        if (!rutaLocalImagen) throw new Error("No se obtuvo la ruta temporal de la imagen.");

        // Analiza la imagen antes de borrar el archivo temporal. El resultado es apoyo para revisión humana.
        try {
          const analisisVisual = await analizarImagenConGPT(
            rutaLocalImagen,
            message.image?.caption || ""
          );

          console.log("ANÁLISIS VISUAL:", analisisVisual);
          await actualizarAnalisisImagen(incidente.id, analisisVisual);
        } catch (error) {
          console.error(
            "No se pudo completar el análisis visual; se continuará guardando la imagen:",
            error.response?.data || error.message
          );
        }

        const subida = await subirImagenSupabase(rutaLocalImagen, incidente.id);
        if (!subida?.publicUrl || !subida?.storagePath) {
          throw new Error("No se pudo subir la imagen a Supabase Storage.");
        }

        await actualizarImagen(incidente.id, subida.publicUrl);

        try {
          await guardarEvidencia(
            incidente.id,
            "imagen",
            subida.storagePath,
            subida.publicUrl,
            subida.mimeType || "image/jpeg"
          );
          evidenciaGuardada = true;
        } catch (error) {
          console.error(
            "La imagen se subió, pero no se pudo insertar su registro en evidencias:",
            error.response?.data || error.message
          );
        }
      } catch (error) {
        console.error(
          "Error procesando la imagen:",
          error.response?.data || error.message
        );
        await sendWhatsAppMessage(
          from,
          `⚠️ No pude guardar la fotografía del incidente #${incidente.id}. Por favor, vuelve a enviarla. Si el caso sigue abierto, intentaré asociarla al mismo incidente.`
        );
        return res.sendStatus(200);
      } finally {
        if (rutaLocalImagen) {
          try {
            await fs.promises.unlink(rutaLocalImagen);
          } catch (error) {
            if (error.code !== "ENOENT") {
              console.warn("No se pudo eliminar la imagen temporal:", error.message);
            }
          }
        }
      }

      const mensajeConfirmacion = esEvidenciaAdicional
        ? `✅ Fotografía agregada al incidente #${incidente.id}. Puedes seguir enviando otras evidencias de este mismo caso.`
        : `✅ Se creó el incidente #${incidente.id} y se recibió la fotografía. Puedes enviar más evidencias del mismo caso.\n\n📍 Envía tu ubicación para completar el reporte.`;

      await sendWhatsAppMessage(
        from,
        evidenciaGuardada
          ? mensajeConfirmacion
          : `${mensajeConfirmacion}\n\n⚠️ La imagen quedó en almacenamiento, pero hubo un problema registrando sus datos para consulta; un operador deberá verificarla.`
      );

      return res.sendStatus(200);
    }

/*
====================================
AUDIO
====================================
*/

    if (message.type === "audio") {
      const asociacion = await resolverIncidenteParaMensaje(from);

      if (asociacion.errorConsulta) {
        await sendWhatsAppMessage(
          from,
          "⚠️ No pude consultar los incidentes abiertos ahora mismo. Para no asociar la evidencia al caso equivocado, vuelve a enviarla en unos minutos."
        );
        return res.sendStatus(200);
      }

      if (asociacion.seleccionInvalida) {
        await sendWhatsAppMessage(
          from,
          "⚠️ El incidente seleccionado ya no está disponible o fue cerrado. Envía CASO <número> para elegir un caso abierto y luego vuelve a enviar el audio."
        );
        return res.sendStatus(200);
      }

      if (asociacion.ambiguo) {
        await sendWhatsAppMessage(from, mensajeSeleccionCaso(asociacion.incidentes));
        return res.sendStatus(200);
      }

      const audioUrl = await descargarAudioWhatsApp(message.audio?.id);
      if (!audioUrl) {
        await sendWhatsAppMessage(
          from,
          "⚠️ No pude descargar el audio de WhatsApp. Por favor, vuelve a enviarlo."
        );
        return res.sendStatus(200);
      }

      let textoAudio = "";
      let resultadoGPT = null;

      try {
        textoAudio = String(await transcribirAudio(audioUrl) || "").trim();
        if (textoAudio) {
          resultadoGPT = await analizarConGPT(textoAudio);
        }
      } catch (error) {
        console.error(
          "No se pudo transcribir/clasificar el audio; se conservará para revisión:",
          error.response?.data || error.message
        );
      }

      const categoriaAudio = normalizarValor(resultadoGPT?.categoria);
      const confianzaAudio = confianzaComoNumero(resultadoGPT?.confianza);
      const generalAudioConfirmado = categoriaAudio === "general" && confianzaAudio !== null && confianzaAudio >= 0.85;
      const requiereRevisionAudio = !categoriaAudio || categoriaAudio === "general";
      const esEvidenciaAdicional = Boolean(asociacion.incidente);

      // No descartar un audio como irrelevante si la confianza no es alta: se conserva para revisión humana.
      if (!esEvidenciaAdicional && generalAudioConfirmado) {
        await sendWhatsAppMessage(
          from,
          "ℹ️ El audio no parece describir una emergencia o incidente operativo. Por eso no abrí un caso nuevo. Si necesitas reportar una situación real, describe qué ocurrió y dónde sucede. Si el audio sí corresponde a una emergencia, vuelve a enviarlo o acompáñalo con una descripción escrita."
        );
        return res.sendStatus(200);
      }

      let incidente = asociacion.incidente;
      if (!incidente) {
        const categoriaGuardar = requiereRevisionAudio ? "por_revisar" : resultadoGPT.categoria;
        const prioridadGuardar = requiereRevisionAudio
          ? "media"
          : String(resultadoGPT?.prioridad || "alta").toLowerCase();

        incidente = await guardarIncidente(
          from,
          textoAudio || "AUDIO RECIBIDO - PENDIENTE DE REVISION",
          categoriaGuardar || "audio",
          prioridadGuardar,
          categoriaGuardar || null,
          requiereRevisionAudio ? "Por revisar" : (resultadoGPT?.prioridad || null),
          resultadoGPT?.confianza ?? null
        );
      }

      if (!incidente) {
        await sendWhatsAppMessage(
          from,
          "⚠️ No pude crear o localizar un incidente para conservar el audio. Intenta enviarlo nuevamente en unos minutos."
        );
        return res.sendStatus(200);
      }

      const subida = await subirAudioSupabase(
        audioUrl,
        incidente.id,
        message.audio?.mime_type || "audio/ogg"
      );

      if (!subida?.publicUrl || !subida?.storagePath) {
        await sendWhatsAppMessage(
          from,
          `⚠️ No pude guardar el audio del incidente #${incidente.id}. Por favor, vuelve a enviarlo.`
        );
        return res.sendStatus(200);
      }

      await actualizarAudio(incidente.id, subida.publicUrl);

      let evidenciaGuardada = false;
      try {
        await guardarEvidencia(
          incidente.id,
          "audio",
          subida.storagePath,
          subida.publicUrl,
          subida.mimeType || message.audio?.mime_type || "audio/ogg"
        );
        evidenciaGuardada = true;
      } catch (error) {
        console.error(
          "El audio se subió, pero no se pudo insertar su registro en evidencias:",
          error.response?.data || error.message
        );
      }

      if (textoAudio) {
        const mensajeAnterior = String(incidente.mensaje || "").trim();
        const mensajeActualizado = esEvidenciaAdicional && mensajeAnterior
          ? `${mensajeAnterior}\n\n[Audio adicional]: ${textoAudio}`
          : textoAudio;

        // Un audio clasificado como general no debe degradar la categoría de un incidente ya abierto.
        if (esEvidenciaAdicional && (!resultadoGPT || categoriaAudio === "general")) {
          await actualizarAnalisisAudio(
            incidente.id,
            mensajeActualizado,
            incidente.tipo_delito || "evidencia",
            incidente.prioridad || "alta",
            incidente.categoria_gpt ?? null,
            incidente.prioridad_gpt ?? null,
            incidente.confianza_gpt ?? null
          );
        } else if (!esEvidenciaAdicional && requiereRevisionAudio) {
          await actualizarAnalisisAudio(
            incidente.id,
            mensajeActualizado,
            "por_revisar",
            "media",
            "por_revisar",
            "Por revisar",
            resultadoGPT?.confianza ?? null
          );
        } else if (resultadoGPT) {
          await actualizarAnalisisAudio(
            incidente.id,
            mensajeActualizado,
            resultadoGPT.categoria,
            String(resultadoGPT.prioridad || "alta").toLowerCase(),
            resultadoGPT.categoria,
            resultadoGPT.prioridad,
            resultadoGPT.confianza ?? null
          );
        }
      }

      let confirmacion;
      if (esEvidenciaAdicional) {
        confirmacion = `✅ Audio agregado al incidente #${incidente.id}. Puedes seguir enviando otras evidencias relacionadas con este caso.`;
      } else if (requiereRevisionAudio && textoAudio) {
        confirmacion = `⚠️ Registré el audio en el caso #${incidente.id} para revisión manual porque la clasificación automática no pudo confirmar si corresponde a un incidente.\n\n📍 Envía tu ubicación si corresponde.`;
      } else if (resultadoGPT && categoriaAudio !== "general") {
        confirmacion = `🚨 Registré el incidente #${incidente.id}.\n\nTipo: ${resultadoGPT.categoria}\nPrioridad: ${resultadoGPT.prioridad || "Por revisar"}\n\n📍 Envía tu ubicación. Un operador revisará el caso.`;
      } else {
        confirmacion = `✅ Guardé el audio en el incidente #${incidente.id}, pero no se pudo obtener una transcripción automática. Un operador deberá revisarlo.\n\n📍 Envía tu ubicación si corresponde.`;
      }

      if (!evidenciaGuardada) {
        confirmacion += "\n\n⚠️ El archivo está en almacenamiento, pero hubo un problema registrando sus datos para consulta.";
      }

      await sendWhatsAppMessage(from, confirmacion);
      return res.sendStatus(200);
    }

    /*
    ========================================
    UBICACION
    ========================================
    */

    if (message.type === "location") {
      const latitude = message.location?.latitude;
      const longitude = message.location?.longitude;

      if (latitude == null || longitude == null) {
        await sendWhatsAppMessage(from, "⚠️ No pude leer las coordenadas. Vuelve a compartir tu ubicación desde WhatsApp.");
        return res.sendStatus(200);
      }

      const ubicacion = `${latitude}, ${longitude}`;
      const googleMaps = `https://maps.google.com/?q=${latitude},${longitude}`;
      const asociacion = await resolverIncidenteParaMensaje(from);

      if (asociacion.errorConsulta) {
        await sendWhatsAppMessage(
          from,
          "⚠️ No pude consultar los incidentes abiertos ahora mismo. Para no asociar la evidencia al caso equivocado, vuelve a enviarla en unos minutos."
        );
        return res.sendStatus(200);
      }

      if (asociacion.seleccionInvalida) {
        await sendWhatsAppMessage(
          from,
          "⚠️ El incidente seleccionado ya no está disponible o fue cerrado. Envía CASO <número> para elegir un caso abierto y comparte nuevamente tu ubicación."
        );
        return res.sendStatus(200);
      }

      if (asociacion.ambiguo) {
        await sendWhatsAppMessage(from, mensajeSeleccionCaso(asociacion.incidentes));
        return res.sendStatus(200);
      }

      if (!asociacion.incidente) {
        await sendWhatsAppMessage(
          from,
          "ℹ️ Recibí la ubicación, pero no encontré un reporte abierto reciente para asociarla. Primero describe la situación por mensaje o audio; después podrás compartir la ubicación."
        );
        return res.sendStatus(200);
      }

      await actualizarUbicacion(asociacion.incidente.id, ubicacion, googleMaps);
      await sendWhatsAppMessage(
        from,
        `📍 Ubicación asociada al incidente #${asociacion.incidente.id}.\n\n🗺️ ${googleMaps}\n\n🚔 Un operador podrá revisar el reporte y su ubicación.`
      );
      return res.sendStatus(200);
    }

    return res.sendStatus(200);

  } catch (error) {

    console.log(
      "Error webhook:",
      error
    );

    return res.sendStatus(500);
  }
});

/*
========================================
START SERVER
========================================
*/

const PORT =
  process.env.PORT || 10000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Servidor corriendo en puerto ${PORT}`
    );
  }
);