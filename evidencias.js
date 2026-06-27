import axios from "axios";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function descargarImagenWhatsApp(mediaId) {

    try {

        console.log("📷 Descargando imagen:", mediaId);

        // Obtener URL temporal desde Meta
        const mediaResponse = await axios.get(
            `https://graph.facebook.com/v23.0/${mediaId}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                },
            }
        );

        const mediaUrl = mediaResponse.data.url;

        console.log("✅ URL obtenida");

        // Descargar imagen
        const imagen = await axios.get(mediaUrl, {
            responseType: "arraybuffer",
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            },
        });

        // Crear carpeta temporal
        const carpeta = path.join(__dirname, "temp");

        if (!fs.existsSync(carpeta)) {
            fs.mkdirSync(carpeta);
        }

        // Guardar imagen
        const nombreArchivo = `${Date.now()}.jpg`;

        const ruta = path.join(carpeta, nombreArchivo);

        fs.writeFileSync(ruta, imagen.data);

        console.log("✅ Imagen guardada:", ruta);

        return ruta;

    } catch (error) {

        console.error("❌ Error descargando imagen");

        console.error(
            error.response?.data || error.message
        );

        return null;

    }

}

async function procesarImagenWhatsApp(rutaImagen) {

    console.log("📷 Procesando imagen:", rutaImagen);

    // Aquí implementaremos GPT Vision
    return {
        categoria: "general",
        prioridad: "BAJA",
        confianza: 0,
        descripcion: "",
        analisis: {}
    };

}


async function guardarEvidencia(
    incidenteId,
    tipo,
    storagePath,
    storageUrl,
    mimeType
) {

    console.log("📁 Guardando evidencia...");

    const response = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/evidencias`,
        {
            method: "POST",
            headers: {
                apikey: process.env.SUPABASE_KEY,
                Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=representation"
            },
            body: JSON.stringify({
                incidente_id: incidenteId,
                tipo,
                storage_path: storagePath,
                storage_url: storageUrl,
                mime_type: mimeType
            })
        }
    );

    const data = await response.json();

    console.log("✅ Evidencia guardada");

    console.log(data);

    return data;
}

export {
    descargarImagenWhatsApp,
    procesarImagenWhatsApp,
    guardarEvidencia
};