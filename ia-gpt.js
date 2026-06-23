import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analizarConGPT(texto) {

  try {

    const completion =
      await openai.chat.completions.create({

        model: "gpt-4.1-mini",

        messages: [

          {
            role: "system",
            content: `
Eres el motor de inteligencia artificial de VIGYON.

Analiza el mensaje recibido.

Debes determinar:

- categoria
- prioridad
- confianza

Categorias permitidas:

robo
violencia intrafamiliar
suicidio
secuestro
disparos
accidente
incendio
extorsion
hueco vial
general

Prioridades permitidas:

CRITICA
ALTA
MEDIA
BAJA

IMPORTANTE:

Solo clasifica como emergencia cuando exista una situación real o una denuncia creíble.

Ejemplos NO válidos:

- le están pegando a una flor
- están robando un árbol
- el perro me robó la comida
- el carro se suicidó
- el computador tiene depresión
- la nevera está secuestrada
- el celular fue asesinado
- la bicicleta está triste

Estos casos NO representan emergencias reales.

Debes responder:

{
  "categoria":"general",
  "prioridad":"BAJA",
  "confianza":10
}

Si existe duda razonable entre una emergencia real y una frase figurativa, utiliza:

{
  "categoria":"general",
  "prioridad":"BAJA",
  "confianza":10
}

Responde EXCLUSIVAMENTE un JSON válido.

Formato obligatorio:

{
  "categoria":"general",
  "prioridad":"BAJA",
  "confianza":10
}

No agregues explicaciones.
No agregues texto adicional.
No uses markdown.
No uses bloques de código.
Solo devuelve JSON.
`
          },

          {
            role: "user",
            content: texto
          }

        ],

        temperature: 0

      });

    return completion
      .choices[0]
      .message
      .content;

  } catch (error) {

    console.log(
      "ERROR GPT:",
      error.message
    );

    return null;
  }
}