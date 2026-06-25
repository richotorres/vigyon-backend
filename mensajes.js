import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export async function mensajeYaProcesado(messageId) {

  try {

    console.log("================================");
    console.log("VERIFICANDO MENSAJE");
    console.log("ID:", messageId);
    console.log("================================");

    const response = await axios.get(

      `${process.env.SUPABASE_URL}/rest/v1/mensajes_procesados?message_id=eq.${encodeURIComponent(messageId)}&select=id`,

      {

        headers: {

          apikey:
            process.env.SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_KEY}`

        }

      }

    );

    console.log("Respuesta de Supabase:");
    console.log(response.data);

    if (response.data.length > 0) {

      console.log("🚫 MENSAJE YA EXISTE");
      console.log("================================");

      return true;

    }

    console.log("✅ MENSAJE NUEVO");
    console.log("Guardando en Supabase...");

    const guardar = await axios.post(

      `${process.env.SUPABASE_URL}/rest/v1/mensajes_procesados`,

      {

        message_id: messageId

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
            "return=representation"

        }

      }

    );

    console.log("Registro creado:");
    console.log(guardar.data);

    console.log("================================");

    return false;

  } catch (error) {

    console.log("================================");
    console.log("❌ ERROR EN mensajes.js");
    console.log(
      error.response?.status
    );
    console.log(
      error.response?.data ||
      error.message
    );
    console.log("================================");

    return false;

  }

}