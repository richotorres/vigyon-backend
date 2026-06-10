import express from "express";
import dotenv from "dotenv";
import cors from "cors";

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

    if (
      mode === "subscribe" &&
      token === verify_token
    ) {

      console.log("Webhook verificado correctamente ✅");

      return res.status(200).send(challenge);

    } else {

      return res.sendStatus(403);

    }
  }

  return res.sendStatus(400);
});

/*
========================================
RECEIVE WHATSAPP MESSAGES
========================================
*/

app.post("/webhook", (req, res) => {

  console.log(
    "Mensaje recibido:",
    JSON.stringify(req.body, null, 2)
  );

  res.sendStatus(200);
});

/*
========================================
START SERVER
========================================
*/

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});