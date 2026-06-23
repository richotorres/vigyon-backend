import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import FormData from "form-data";
import OpenAI from "openai";
import {
  analizarConGPT
} from "./ia-gpt.js";

dotenv.config();

console.log(
  "🚨 SERVER MODIFICADO 999 🚨"
);

console.log(
  "OPENAI KEY:",
  process.env.OPENAI_API_KEY
);

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    console.log(
      "Mensaje enviado correctamente ✅"
    );

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
  prioridad
) => {

  try {

    const url =
      "https://oszjlipttlqvyqwffrdc.supabase.co/rest/v1/incidentes";


      console.log(
  "SUPABASE_URL:",
  process.env.SUPABASE_URL
);


    const response =
      await axios.post(

        url,

        {
          telefono,
          mensaje,
          tipo_delito:
            tipoDelito,

          prioridad,
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
BUSCAR INCIDENTE ACTIVO
========================================
*/

const buscarIncidenteActivo = async (
  telefono
) => {

  try {

    const response =
      await axios.get(

        `https://oszjlipttlqvyqwffrdc.supabase.co/rest/v1/incidentes?telefono=eq.${telefono}&estado=eq.pendiente&order=id.desc&limit=1`,

        {
          headers: {

            apikey:
              process.env.SUPABASE_SERVICE_KEY,

            Authorization:
              `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );

    return response.data[0];

  } catch (error) {

    console.log(
      "Error buscando incidente activo ❌"
    );

    return null;
  }
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

      `https://oszjlipttlqvyqwffrdc.supabase.co/rest/v1/incidentes?id=eq.${incidenteId}`,

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

      `https://oszjlipttlqvyqwffrdc.supabase.co/rest/v1/incidentes?id=eq.${incidenteId}`,

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

const actualizarAudio = async (
  incidenteId,
  audioUrl
) => {

  try {

    await axios.patch(

      `https://oszjlipttlqvyqwffrdc.supabase.co/rest/v1/incidentes?id=eq.${incidenteId}`,

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

/*
========================================
DESCARGAR IMAGEN WHATSAPP
========================================
*/

const descargarImagenWhatsApp = async (
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


    const imageUrl =
      mediaResponse.data.url;

    console.log(
      "URL imagen obtenida ✅"
    );

    return imageUrl;

  } catch (error) {

    console.log(
      "Error obteniendo imagen ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );

    return null;
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

const subirImagenSupabase = async (
  imageUrl
) => {

  try {

    const imageResponse =
      await axios.get(
        imageUrl,
        {
          responseType: "arraybuffer",
          headers: {
            Authorization:
              `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
        }
      );

    const nombreArchivo =
      `evidencia_${Date.now()}.jpg`;

    await axios.post(

      `${process.env.SUPABASE_URL}/storage/v1/object/evidencias/${nombreArchivo}`,

      imageResponse.data,

      {
        headers: {

          apikey:
            process.env.SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,

          "Content-Type":
            "image/jpeg",
        },
      }
    );

    const publicUrl =
      `${process.env.SUPABASE_URL}/storage/v1/object/public/evidencias/${nombreArchivo}`;

    console.log(
      "Imagen subida a Storage ✅"
    );

    return publicUrl;

  } catch (error) {

    console.log(
      "Error subiendo imagen ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );

    return null;
  }
};

const subirAudioSupabase = async (
  audioUrl
) => {

  try {

    const audioResponse =
      await axios.get(
        audioUrl,
        {
          responseType: "arraybuffer",
          headers: {
            Authorization:
              `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
        }
      );

    const nombreArchivo =
      `audio_${Date.now()}.ogg`;

    await axios.post(

      `${process.env.SUPABASE_URL}/storage/v1/object/audios/${nombreArchivo}`,

      audioResponse.data,

      {
        headers: {

          apikey:
            process.env.SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,

          "Content-Type":
            "audio/ogg",
        },
      }
    );

    const publicUrl =
      `${process.env.SUPABASE_URL}/storage/v1/object/public/audios/${nombreArchivo}`;

    console.log(
      "Audio subido a Storage ✅"
    );

    return publicUrl;

  } catch (error) {

    console.log(
      "Error subiendo audio ❌"
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
ANALIZAR EMERGENCIA CON IA
========================================
*/

const analizarEmergencia = async (
  mensaje
) => {

  try {

    const completion =
      await openai.chat.completions.create({

        model: "gpt-4.1-mini",

        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",

            content: `
Eres una IA de emergencias de Colombia.

Debes detectar:
- tipo_delito
- prioridad

Prioridades:
- baja
- media
- alta

Si NO es una emergencia real:
- tipo_delito = "ninguno"
- prioridad = "baja"

Responde SOLO en JSON.

Ejemplo:
{
  "tipo_delito": "atraco",
  "prioridad": "alta"
}
`,
          },

          {
            role: "user",
            content: mensaje,
          },
        ],
      });

    return JSON.parse(
      completion
        .choices[0]
        .message
        .content
    );

  } catch (error) {

    console.log(
      "Error OpenAI:",
      error.response?.data ||
      error.message
    );

    return {
      tipo_delito:
        "desconocido",

      prioridad:
        "media",
    };
  }
};


console.log("VERSION NUEVA CARGADA 🚀");
console.log(
  "VERSION IMAGEN STORAGE 777 🚀"
);
/*
========================================
RECEIVE WHATSAPP MESSAGES
========================================
*/

app.post("/webhook", async (req, res) => {

  try {

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

      console.log(
  "TIPO MENSAJE:",
  message?.type
);

    if (!message) {

      return res.sendStatus(200);
    }
console.log(
  "PASO 1 🚀"
);

console.log(
  "MESSAGE COMPLETO:",
  JSON.stringify(message)
);

console.log(
  "PASO 2 🚀"
);

const from =
  message.from;

console.log(
  "PASO 3 🚀",
  from
);

console.log(
  "ANTES DE BLOQUES 🚀",
  message.type
);
    /*
    ========================================
    MENSAJE TEXTO
    ========================================
    */

    if (
      message.type === "text"
    ) {

      throw new Error(
  "PRUEBA GPT"
);

      console.log(
  "ENTRO AL BLOQUE TEXT 🚀"
);

      const text =
        message.text?.body || "";

        const resultadoGPT =
  await analizarConGPT(text);

  console.log(
  "GPT FUNCION EJECUTADA 🚀"
);

console.log(
  "GPT:",
  resultadoGPT
);

//return res.sendStatus(200);

      console.log(
        "Mensaje de:",
        from
      );

      console.log(
        "Texto:",
        text
      );

      const analisis =
        await analizarEmergencia(
          text
        );

      console.log(
        "Analisis IA:",
        analisis
      );

      const incidente =
        await guardarIncidente(
          from,
          text,
          analisis.tipo_delito,
          analisis.prioridad
        );

      if (!incidente) {

        return res.sendStatus(200);
      }

      if (
        analisis.tipo_delito === "ninguno"
      ) {

        await sendWhatsAppMessage(
          from,

          `✅ Mensaje recibido.\n\nVIGYON IA no detectó una emergencia crítica.`
        );

      } else {

        await sendWhatsAppMessage(
          from,

          `🚨 VIGYON IA detectó una posible emergencia.\n\nTipo: ${analisis.tipo_delito}\nPrioridad: ${analisis.prioridad}\n\n📍 Envía tu ubicación.\n🎤 Envía un audio corto.\n👮 Un operador revisará tu caso.`
        );
      }

      return res.sendStatus(200);
    }

    /*
========================================
IMAGEN
========================================
*/

if (
  message.type === "image"
) {

  console.log(
    "Imagen recibida 📷"
  );

  console.log(
    message.image
  );

  const incidente =
    await guardarIncidente(
      from,
      "EVIDENCIA FOTOGRAFICA",
      "evidencia",
      "alta"
    );

  console.log(
  "Incidente imagen:",
  incidente
);

console.log(
  "ENTRE A DESCARGA 🚀"
);

const imageUrl =
  await descargarImagenWhatsApp(
    message.image.id
  );

console.log(
  "IMAGE URL:",
  imageUrl
);

try {

  console.log(
    "PRUEBA A 🚀"
  );


} catch(error) {

  console.log(
    "ERROR PRUEBA 🚨"
  );

  console.log(error);

}

  console.log(
  "PRUEBA A 🚀"
);

  if (
    imageUrl &&
    incidente
  ) {

    const publicUrl =
      await subirImagenSupabase(
        imageUrl
      );

    if (
      publicUrl
    ) {

      await actualizarImagen(
        incidente.id,
        publicUrl
      );

      console.log(
        "Imagen asociada al incidente ✅"
      );
    }
  }

  await sendWhatsAppMessage(
    from,
    "📷 Imagen recibida.\n\n📍 Ahora envía tu ubicación para asociarla al caso."
  );

  return res.sendStatus(200);
}

/*
====================================
AUDIO
====================================
*/

if (
  message.type === "audio"
) {

  console.log(
    "Audio recibido 🎤"
  );

  console.log(
    message.audio
  );

  const incidente =
    await guardarIncidente(
      from,
      "AUDIO RECIBIDO",
      "audio",
      "alta"
    );

  console.log(
    "Incidente audio:",
    incidente
  );

  const audioUrl =
    await descargarAudioWhatsApp(
      message.audio.id
    );

  console.log(
    "AUDIO URL:",
    audioUrl
  );

  if (
    audioUrl &&
    incidente
  ) {

    const publicUrl =
      await subirAudioSupabase(
        audioUrl
      );

    if (
      publicUrl
    ) {

      await actualizarAudio(
        incidente.id,
        publicUrl
      );

      console.log(
        "Audio asociado al incidente ✅"
      );
    }
  }

  await sendWhatsAppMessage(
    from,
    "🎤 Audio recibido.\n\n📍 Ahora envía tu ubicación para asociarla al caso."
  );

  return res.sendStatus(200);
}

    /*
    ========================================
    UBICACION
    ========================================
    */

    if (
      message.type === "location"
    ) {

      const latitude =
        message.location.latitude;

      const longitude =
        message.location.longitude;

      const ubicacion =
        `${latitude}, ${longitude}`;

      const googleMaps =
        `https://maps.google.com/?q=${latitude},${longitude}`;

      console.log(
        "Ubicación:",
        ubicacion
      );

      const incidenteActivo =
        await buscarIncidenteActivo(
          from
        );

      if (!incidenteActivo) {

        console.log(
          "No existe incidente activo ❌"
        );

        return res.sendStatus(200);
      }

      await actualizarUbicacion(
        incidenteActivo.id,
        ubicacion,
        googleMaps
      );

      await sendWhatsAppMessage(
        from,

        `📍 Ubicación recibida correctamente.\n\n🗺️ ${googleMaps}\n\n🚔 Las autoridades fueron notificadas.`
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