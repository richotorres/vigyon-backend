import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

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
      const text = message.text?.body || "";

      console.log("Mensaje de:", from);
      console.log("Texto:", text);

      /*
      ========================================
      BOTÓN DE PÁNICO BÁSICO
      ========================================
      */

      if (
        text.toLowerCase().includes("ayuda") ||
        text.toLowerCase().includes("emergencia") ||
        text.toLowerCase().includes("sos")
      ) {
        await sendWhatsAppMessage(
          from,
          "🚨 ALERTA VIGYON ACTIVADA\n\n📍 Comparte tu ubicación.\n🎤 Envía un audio corto.\n👮 Un operador revisará tu caso."
        );
      } else {
        await sendWhatsAppMessage(
          from,
          "✅ VIGYON IA recibió tu mensaje.\n\n🚨 Si es una emergencia escribe:\nAYUDA\nSOS\nEMERGENCIA"
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