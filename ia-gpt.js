
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ========================================
// CONFIGURACIÓN GENERAL
// ========================================

const MODELO_IA = "gpt-4.1-mini";

const CATEGORIAS_VALIDAS = [
  "robo",
  "violencia intrafamiliar",
  "suicidio",
  "secuestro",
  "disparos",
  "accidente",
  "incendio",
  "extorsion",
  "hueco vial",
  "general",
];

const PRIORIDADES_VALIDAS = [
  "CRITICA",
  "ALTA",
  "MEDIA",
  "BAJA",
];

function normalizarConfianza(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numero)));
}

function resultadoGeneral() {
  return {
    categoria: "general",
    prioridad: "BAJA",
    confianza: 0,
  };
}

// ========================================
// ANALIZAR MENSAJES DE TEXTO Y AUDIO
// ========================================

export async function analizarConGPT(texto) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Falta la variable OPENAI_API_KEY.");
    }

    const completion = await openai.chat.completions.create({
      model: MODELO_IA,
      temperature: 0,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: `
Eres el motor de clasificación de emergencias de VIGYON IA.

Analiza el mensaje completo y su contexto. No clasifiques
por palabras aisladas.

Identifica situaciones creíbles que puedan afectar a personas,
su integridad, su patrimonio o la seguridad vial.

CATEGORÍAS PERMITIDAS:
robo, violencia intrafamiliar, suicidio, secuestro, disparos,
accidente, incendio, extorsion, hueco vial, general.

PRIORIDADES PERMITIDAS:
CRITICA, ALTA, MEDIA, BAJA.

CRITICA:
Disparos activos, secuestro en curso, intento de suicidio en curso,
incendio con personas en riesgo o accidente con heridos graves.

ALTA:
Robo en proceso, violencia intrafamiliar con posible peligro,
persona armada en una situación amenazante o extorsión creíble.

MEDIA:
Hueco vial peligroso o accidente sin heridos graves conocidos.

BAJA:
Consultas, información o mensajes sin riesgo identificable.

REGLAS:
- No clasifiques como delito los chistes, la ficción, el sarcasmo
  ni las situaciones figuradas sobre animales u objetos.
- No inventes hechos que el mensaje no menciona.
- Si existe una posible emergencia, pero faltan datos, no la
  descartes automáticamente.
- Ante una situación ambigua que pueda ocultar un peligro,
  utiliza "general" y prioridad "BAJA", pero la revisión humana
  debe determinar si hace falta investigar.
- La confianza es una estimación, no una garantía.
- No afirmes que las autoridades fueron notificadas.

Devuelve exclusivamente un JSON válido con esta estructura:
{
  "categoria": "general",
  "prioridad": "BAJA",
  "confianza": 10
}
`,
        },
        {
          role: "user",
          content: String(texto || ""),
        },
      ],
    });

    const contenido =
      completion.choices[0]?.message?.content;

    if (!contenido) {
      throw new Error("La IA no devolvió contenido.");
    }

    const resultado = JSON.parse(contenido);

    if (
      !CATEGORIAS_VALIDAS.includes(resultado.categoria) ||
      !PRIORIDADES_VALIDAS.includes(resultado.prioridad)
    ) {
      throw new Error(
        "La IA devolvió una categoría o prioridad inválida."
      );
    }

    return {
      categoria: resultado.categoria,
      prioridad: resultado.prioridad,
      confianza: normalizarConfianza(resultado.confianza),
    };
  } catch (error) {
    console.error(
      "ERROR GPT TEXTO:",
      error.response?.data || error.message
    );

    return resultadoGeneral();
  }
}

// ========================================
// ANALIZAR FOTOGRAFÍAS
// ========================================

export async function analizarImagenConGPT(
  rutaImagen,
  contexto = ""
) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Falta la variable OPENAI_API_KEY.");
    }

    if (!rutaImagen) {
      throw new Error("No se indicó la ruta de la fotografía.");
    }

    // 1. Leer la imagen temporal descargada de WhatsApp.
    const archivo = await fs.readFile(rutaImagen);

    if (!archivo.length) {
      throw new Error("La fotografía está vacía.");
    }

    // 2. Identificar el formato de la imagen.
    const extension = path.extname(rutaImagen).toLowerCase();

    const tiposImagen = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    const mimeType = tiposImagen[extension];

    if (!mimeType) {
      throw new Error(
        `Formato de imagen no compatible: ${extension}`
      );
    }

    // 3. Convertir la imagen a Base64 para enviarla a la IA.
    const imagenBase64 = archivo.toString("base64");
    const dataUrl =
      `data:${mimeType};base64,${imagenBase64}`;

    // 4. Analizar visualmente la fotografía.
    const completion = await openai.chat.completions.create({
      model: MODELO_IA,
      temperature: 0,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: `
Eres el analista visual de VIGYON IA, un sistema de apoyo
para revisar posibles emergencias.

Analiza la fotografía y describe únicamente lo que se puede
observar. No inventes personas, armas, heridas, delitos ni daños.

Distingue entre:
1. Lo que aparece claramente en la fotografía.
2. Lo que no se puede confirmar.
3. El riesgo que podría existir según el contexto disponible.

CATEGORÍAS PERMITIDAS:
robo, violencia intrafamiliar, suicidio, secuestro, disparos,
accidente, incendio, extorsion, hueco vial, general.

PRIORIDADES PERMITIDAS:
CRITICA, ALTA, MEDIA, BAJA.

CRITICA:
Señales visuales claras de peligro inmediato para la vida.
La imagen por sí sola no siempre permite confirmar la gravedad.

ALTA:
Indicios relevantes de una posible amenaza o delito en curso.

MEDIA:
Peligro o daño que merece atención, sin evidencia suficiente
de riesgo inmediato crítico.

BAJA:
Objeto cotidiano o imagen sin emergencia visible ni riesgo
identificable a partir de la información disponible.

REGLAS IMPORTANTES:
- Una fotografía de un lavamanos, una silla, una puerta u otro
  objeto cotidiano no constituye por sí misma una emergencia.
- No deduzcas un delito únicamente porque alguien envíe una foto.
- Un hueco vial puede ser peligroso cuando se observa en una vía.
- No confundas un objeto aislado con una situación de emergencia.
- La ausencia de señales visibles no demuestra que no exista peligro.
- Ten en cuenta el contexto escrito que aporta el ciudadano.
- Si la fotografía es ambigua, no inventes información.
- Si existe un posible peligro, recomienda revisión humana.
- Si no hay señales de emergencia y no se aporta contexto de riesgo,
  puedes clasificar como "general" y prioridad "BAJA".
- Si el contexto es insuficiente para descartar un peligro posible,
  establece "requiere_revision": true.
- No marques automáticamente como falso un reporte por no mostrar
  una emergencia evidente.
- No afirmes que las autoridades fueron notificadas.
- La confianza mide la seguridad de la interpretación visual,
  no la certeza de que haya ocurrido un delito.

Devuelve exclusivamente un JSON válido con esta estructura:
{
  "descripcion_visual": "Descripción concreta de lo observado",
  "categoria": "general",
  "prioridad": "BAJA",
  "confianza": 50,
  "justificacion": "Explicación de la clasificación y de sus límites",
  "requiere_revision": true
}

La descripción debe ser clara y breve.
La justificación debe explicar por qué se recomienda esa prioridad.
"requiere_revision" debe ser true si hay indicios de peligro,
si la imagen es ambigua o si falta contexto importante.
`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Contexto aportado por el ciudadano: ${
                  String(contexto || "").trim() || "No aportado"
                }`,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    // 5. Comprobar y validar la respuesta de la IA.
    const contenido =
      completion.choices[0]?.message?.content;

    if (!contenido) {
      throw new Error(
        "La IA no devolvió un análisis visual."
      );
    }

    const resultado = JSON.parse(contenido);

    if (
      !CATEGORIAS_VALIDAS.includes(resultado.categoria) ||
      !PRIORIDADES_VALIDAS.includes(resultado.prioridad) ||
      typeof resultado.descripcion_visual !== "string" ||
      !resultado.descripcion_visual.trim() ||
      typeof resultado.justificacion !== "string" ||
      !resultado.justificacion.trim() ||
      typeof resultado.requiere_revision !== "boolean"
    ) {
      throw new Error(
        "La IA devolvió un análisis visual incompleto o inválido."
      );
    }

    const analisis = {
      descripcion_visual:
        resultado.descripcion_visual.trim(),
      categoria: resultado.categoria,
      prioridad: resultado.prioridad,
      confianza: normalizarConfianza(resultado.confianza),
      justificacion:
        resultado.justificacion.trim(),
      requiere_revision: resultado.requiere_revision,
    };

    console.log("ANÁLISIS VISUAL GPT:", analisis);

    return analisis;
  } catch (error) {
    console.error(
      "ERROR GPT IMAGEN:",
      error.response?.data || error.message
    );

    // Si falla la IA, no descartamos la evidencia.
    // El servidor debe conservarla y solicitar revisión humana.
    return {
      descripcion_visual:
        "No fue posible analizar la fotografía automáticamente.",
      categoria: "general",
      prioridad: "BAJA",
      confianza: 0,
      justificacion:
        "El análisis visual falló. Se requiere revisión manual; este error no demuestra que el reporte sea falso ni que no exista peligro.",
      requiere_revision: true,
    };
  }
}
