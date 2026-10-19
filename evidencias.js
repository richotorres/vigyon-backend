import axios from "axios";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Descarga una imagen desde WhatsApp y la guarda temporalmente.
 * Devuelve la ruta local del archivo.
 */
async function descargarImagenWhatsApp(mediaId) {
    try {
        const token = process.env.WHATSAPP_TOKEN;

        if (!token) {
            throw new Error("Falta la variable WHATSAPP_TOKEN.");
        }

        if (!mediaId) {
            throw new Error("No se recibió el ID de la imagen.");
        }

        console.log("Descargando imagen de WhatsApp:", mediaId);

        const mediaResponse = await axios.get(
            `https://graph.facebook.com/v23.0/${mediaId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        const mediaUrl = mediaResponse.data?.url;

        if (!mediaUrl) {
            throw new Error("Meta no devolvió la URL de la imagen.");
        }

        const imagen = await axios.get(mediaUrl, {
            responseType: "arraybuffer",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const carpeta = path.join(__dirname, "temp");

        fs.mkdirSync(carpeta, { recursive: true });

        // Nombre único para evitar conflictos entre archivos.
        const nombreArchivo =
            `imagen_${Date.now()}_${randomUUID()}.jpg`;

        const ruta = path.join(carpeta, nombreArchivo);

        fs.writeFileSync(ruta, Buffer.from(imagen.data));

        console.log("Imagen descargada correctamente:", ruta);

        return ruta;
    } catch (error) {
        console.error(
            "Error descargando imagen de WhatsApp:",
            error.response?.data || error.message
        );

        throw error;
    }
}

/**
 * La función se conserva para mantener la importación actual.
 * El análisis de imágenes con IA se implementará por separado.
 */
async function procesarImagenWhatsApp() {
    throw new Error(
        "El análisis de imágenes con IA todavía no está implementado."
    );
}

/**
 * Registra una evidencia ya subida a Supabase Storage.
 */
async function guardarEvidencia(
    incidenteId,
    tipo,
    storagePath,
    storageUrl,
    mimeType
) {
    try {
        const supabaseUrl =
            process.env.SUPABASE_URL?.replace(/\/+$/, "");

        const serviceKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !serviceKey) {
            throw new Error(
                "Falta SUPABASE_URL o SUPABASE_SERVICE_KEY."
            );
        }

        if (
            !incidenteId ||
            !tipo ||
            !storagePath ||
            !storageUrl ||
            !mimeType
        ) {
            throw new Error(
                "Faltan datos obligatorios para registrar la evidencia."
            );
        }

        const response = await axios.post(
            `${supabaseUrl}/rest/v1/evidencias`,
            {
                incidente_id: incidenteId,
                tipo,
                storage_path: storagePath,
                storage_url: storageUrl,
                mime_type: mimeType,
            },
            {
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                    "Content-Type": "application/json",
                    Prefer: "return=representation",
                },
            }
        );

        const registro = Array.isArray(response.data)
            ? response.data[0]
            : response.data;

        console.log("Evidencia registrada correctamente:", registro);

        return registro;
    } catch (error) {
        console.error(
            "Error registrando evidencia en Supabase:",
            error.response?.data || error.message
        );

        throw error;
    }
}

export {
    descargarImagenWhatsApp,
    procesarImagenWhatsApp,
    guardarEvidencia,
};