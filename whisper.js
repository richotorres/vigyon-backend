import dotenv from "dotenv";
import OpenAI from "openai";
import axios from "axios";
import fs from "fs";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribirAudio(audioUrl) {

  console.log(
    "WHISPER INICIADO 🎤"
  );

  try {

    // Descargar audio desde WhatsApp

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

    console.log(
      "AUDIO DESCARGADO ✅"
    );

    // Guardarlo temporalmente

    const nombreArchivo =
      "audio_temp.ogg";

    fs.writeFileSync(
      nombreArchivo,
      audioResponse.data
    );

    console.log(
      "AUDIO GUARDADO EN DISCO ✅"
    );

    // Enviar a Whisper

    const transcripcion =
      await openai.audio.transcriptions.create({

        file:
          fs.createReadStream(
            nombreArchivo
          ),

        model:
          "gpt-4o-mini-transcribe"

      });

    console.log(
      "TRANSCRIPCION:"
    );

    console.log(
      transcripcion.text
    );

    // Todavía NO borrar el archivo.
    // Lo haremos cuando comprobemos
    // que todo funciona correctamente.

    return transcripcion.text;

  } catch (error) {

    console.log(
      "ERROR WHISPER ❌"
    );

    console.log(
      error.response?.data ||
      error.message
    );

    return null;

  }

}