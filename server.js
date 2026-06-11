import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();

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
  res.status(200).send("VIGYON IA Backend funcionando 🚀");
});

/*
========================================
WEBHOOK VERIFICATION
========================================
*/

app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      console.log("Webhook verificado correctamente ✅");

      return res.status(200).send(challenge);
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

const sendWhatsAppMessage = async (to, message) => {
  try {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        messaging_product: "whatsapp",
        to: to,
        text: {
          body: message,
        },
      },
    });

    console.log("Mensaje enviado correctamente ✅");

  } catch (error) {

    console.log(
      "Error enviando mensaje:",
      error.response?.data || error.message
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
  ubicacion = null
) => {

  try {

    console.log("SUPABASE_URL:", process.env.SUPABASE_URL);

    const response = await axios.post(
      `${process.env.SUPABASE_URL}/rest/v1/incidentes`,
      {
        telefono,
        mensaje,
        tipo_delito: tipoDelito,
        prioridad,
        ubicacion,
      },
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );

    console.log("Incidente guardado en Supabase ✅");
    console.log(response.data);

  } catch (error) {

    console.log("ERROR SUPABASE ❌");

    console.log(
      error.response?.data || error.message
    );
  }
};

/*
========================================
ANALIZAR EMERGENCIA CON IA
========================================
*/

const analizarEmergencia = async (mensaje) => {

  try {

    const completion = await openai.chat.completions.create({
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
      completion.choices[0].message.content
    );

  } catch (error) {

    console.log(
      "Error OpenAI:",
      error.response?.data || error.message
    );

    return {
      tipo_delito: "desconocido",
      prioridad: "media",
    };
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
      "Mensaje recibido:",
      JSON.stringify(req.body, null, 2)
    );

    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message) {

      const from = message.from;

      /*
      ========================================
      MENSAJE TEXTO
      ========================================
      */

      if (message.type === "text") {

        const text = message.text?.body || "";

        console.log("Mensaje de:", from);
        console.log("Texto:", text);

        const analisis = await analizarEmergencia(text);

        console.log("Analisis IA:", analisis);

        await guardarIncidente(
          from,
          text,
          analisis.tipo_delito,
          analisis.prioridad
        );

        await sendWhatsAppMessage(
          from,
          `🚨 VIGYON IA detectó una posible emergencia.\n\nTipo: ${analisis.tipo_delito}\nPrioridad: ${analisis.prioridad}\n\n📍 Envía tu ubicación.\n🎤 Envía un audio corto.\n👮 Un operador revisará tu caso.`
        );
      }

      /*
      ========================================
      UBICACION
      ========================================
      */

      if (message.type === "location") {

        const latitude = message.location.latitude;
        const longitude = message.location.longitude;

        const ubicacion = `${latitude}, ${longitude}`;

        console.log("Ubicación:", ubicacion);

        await guardarIncidente(
          from,
          "Ubicación recibida",
          "ubicacion",
          "alta",
          ubicacion
        );

        await sendWhatsAppMessage(
          from,
          `📍 Ubicación recibida correctamente.\n\nUn operador revisará tu caso lo antes posible.`
        );
      }
    }

    res.sendStatus(200);

  } catch (error) {

    console.log("Error webhook:", error);

    res.sendStatus(500);
  }
});

/*
========================================
START SERVER
========================================
*/

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});