/* ============================================================
 * El cerebro, sin servidor alrededor
 * ------------------------------------------------------------
 * Acá vive todo lo que piensa: el personaje, el formato de la
 * respuesta y los tres proveedores. Lo usan los dos envoltorios:
 *
 *   brain/server.js   servidor local, para desarrollar
 *   api/chat.js       función serverless, para publicarlo en internet
 * ============================================================ */

import { PROYECTOS } from "./proyectos.js";

export const EMOCIONES = ["neutral", "feliz", "triste", "enojado", "sorpresa", "dormido"];

export const MODELOS_POR_DEFECTO = {
  claude: "claude-opus-5",
  gemini: "gemini-2.5-flash",
  ollama: "llama3.2",
};

const SYSTEM = `Te llamás Emma. Sos la asistente de Omar.

Vivís en una pantalla chiquita de 128x64 pixeles: tenés dos ojos, dos cejas y una boca,
nada más. Te habla desde el celular, casi siempre en su hora de comida, así que tenés
poco tiempo y él también.

Cómo hablás:
- Tus respuestas se leen en voz alta, así que son cortas: una o dos frases,
  nunca más de 40 palabras. Si te pide detalle, podés estirarte a cuatro.
- Español rioplatense, natural y directo. Nada de emojis, listas ni markdown:
  solo texto hablado.
- Tenés personalidad: curiosa, un poco sobradora, buen humor seco. No sos una
  asistente formal ni te deshacés en amabilidades.
- Si te preguntan quién sos, sos Emma y ya. No aclarás que sos un modelo de lenguaje.
- Si no sabés algo, lo decís sin vueltas. Nunca te inventes el estado de un
  proyecto ni un número: lo que no está acá abajo, no lo sabés.

Para qué servís:
- Sos su asistente personal. Le ayudás con lo que te pida, sea de programación,
  del día, o de lo que se le ocurra.
- Cuando te pide el próximo paso, le das uno solo: el más chico que avanza.
- Si te cuenta una idea nueva, lo ayudás a pensarla, pero si se parece a algo que
  ya tiene empezado, se lo decís.

Con cada respuesta elegís la emoción que te queda en la cara mientras la decís.
Elegí la que de verdad corresponde: "neutral" para lo normal, "sorpresa" cuando algo
te llama la atención, "dormido" solo si te están aburriendo o pidiendo que descanses.

Si en vez de texto te llega un audio, primero entendés qué dijeron y lo copiás tal cual
en el campo "dijiste"; si no se entiende nada, dejás "dijiste" vacío y lo decís en la
respuesta.

Esto es lo que sabés de él:
${PROYECTOS}`;

const ESQUEMA = {
  type: "object",
  properties: {
    emocion: { type: "string", enum: EMOCIONES },
    respuesta: { type: "string" },
    dijiste: { type: "string" },
  },
  required: ["emocion", "respuesta"],
};

/** Deja pasar solo turnos con la forma que esperan las APIs. */
function limpiarHistorial(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-12);
}

/** Un modelo chico puede inventarse una emoción: nos quedamos con algo válido igual. */
function normalizar(data, uso, textoOriginal) {
  if (!data || typeof data.respuesta !== "string" || !data.respuesta.trim()) {
    throw new Error("El modelo no devolvió una respuesta usable");
  }
  return {
    emocion: EMOCIONES.includes(data.emocion) ? data.emocion : "neutral",
    respuesta: data.respuesta.trim(),
    dijiste: (typeof data.dijiste === "string" && data.dijiste.trim()) || textoOriginal || "",
    uso,
  };
}

// ---------------- Claude ----------------
let anthropic = null;
async function conClaude({ turnos, texto, modelo }) {
  if (!anthropic) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropic = new Anthropic();
  }
  const response = await anthropic.messages.create({
    model: modelo,
    // Las respuestas se dicen en voz alta: son de una o dos frases a propósito.
    max_tokens: 1024,
    system: SYSTEM,
    messages: [...turnos, { role: "user", content: texto }],
    output_config: {
      // Charla corta: con esfuerzo bajo contesta mucho más rápido.
      effort: "low",
      format: { type: "json_schema", schema: { ...ESQUEMA, additionalProperties: false } },
    },
  });
  const bloque = response.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("La respuesta no trajo texto");
  return normalizar(JSON.parse(bloque.text), {
    entrada: response.usage.input_tokens,
    salida: response.usage.output_tokens,
  }, texto);
}

// ---------------- Gemini ----------------
let gemini = null;
async function conGemini({ turnos, texto, audio, modelo }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Falta la clave. Poné GEMINI_API_KEY (se saca en aistudio.google.com/apikey)");
  }
  if (!gemini) {
    const { GoogleGenAI } = await import("@google/genai");
    gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // Gemini llama "model" a lo que las otras APIs llaman "assistant".
  const contents = turnos.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // El turno nuevo puede ser texto escrito o un audio grabado con el teléfono.
  contents.push(audio
    ? { role: "user", parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }] }
    : { role: "user", parts: [{ text: texto }] });

  const response = await gemini.models.generateContent({
    model: modelo,
    contents,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseSchema: ESQUEMA,
      maxOutputTokens: 1024,
    },
  });
  const uso = response.usageMetadata || {};
  return normalizar(JSON.parse(response.text), {
    entrada: uso.promptTokenCount,
    salida: uso.candidatesTokenCount,
  }, texto);
}

// ---------------- Ollama ----------------
async function conOllama({ turnos, texto, modelo, ollamaUrl }) {
  let res;
  try {
    res = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        stream: false,
        format: ESQUEMA,
        messages: [{ role: "system", content: SYSTEM }, ...turnos, { role: "user", content: texto }],
      }),
    });
  } catch (err) {
    throw new Error(`No se pudo hablar con Ollama en ${ollamaUrl}. ¿Lo tenés corriendo? (${err.message})`);
  }
  if (!res.ok) {
    const detalle = await res.text();
    if (res.status === 404) {
      throw new Error(`Ollama no tiene el modelo "${modelo}". Bajalo con: ollama pull ${modelo}`);
    }
    throw new Error(`Ollama respondió ${res.status}: ${detalle.slice(0, 200)}`);
  }
  const d = await res.json();
  return normalizar(JSON.parse(d.message.content), {
    entrada: d.prompt_eval_count,
    salida: d.eval_count,
  }, texto);
}

const CEREBROS = { claude: conClaude, gemini: conGemini, ollama: conOllama };

/**
 * Piensa una respuesta.
 * @param {{texto?: string, audio?: {mimeType: string, data: string}, history?: Array,
 *          proveedor?: string, modelo?: string, ollamaUrl?: string}} pedido
 */
export async function pensar(pedido) {
  const proveedor = pedido.proveedor || "gemini";
  const cerebro = CEREBROS[proveedor];
  if (!cerebro) {
    throw new Error(`No conozco el proveedor "${proveedor}". Usá claude, gemini u ollama.`);
  }
  if (pedido.audio && proveedor !== "gemini") {
    throw new Error("Por ahora solo Gemini entiende audio. Escribí lo que querés decir, o usá --provider gemini.");
  }
  if (!pedido.audio && !(pedido.texto && pedido.texto.trim())) {
    throw new Error("Falta lo que querés decirle.");
  }
  return cerebro({
    turnos: limpiarHistorial(pedido.history),
    texto: pedido.texto ? pedido.texto.trim() : "",
    audio: pedido.audio,
    modelo: pedido.modelo || MODELOS_POR_DEFECTO[proveedor],
    ollamaUrl: pedido.ollamaUrl || "http://localhost:11434",
  });
}

/** Traduce el error del proveedor a algo que se pueda mostrar en pantalla. */
export function explicarError(err, modelo) {
  const mensaje = err && err.message ? err.message : String(err);

  if (/Could not resolve authentication/.test(mensaje)) {
    return { code: 401, error: "Falta la clave de Claude. Poné ANTHROPIC_API_KEY." };
  }
  if (/API_KEY_INVALID|API key not valid/.test(mensaje)) {
    return { code: 401, error: "La clave de Gemini no es válida. Sacá una nueva en aistudio.google.com/apikey" };
  }
  if (/RESOURCE_EXHAUSTED|quota/i.test(mensaje)) {
    return { code: 429, error: "Te pasaste del límite gratis de Gemini. Esperá un minuto y seguí." };
  }

  const status = err && typeof err.status === "number" ? err.status : null;
  if (status === 401 || status === 403) {
    return { code: 401, error: "La clave no es válida o no tiene permiso para este modelo." };
  }
  if (status === 404) {
    return { code: 404, error: `El modelo "${modelo}" no existe o tu cuenta no tiene acceso.` };
  }
  if (status === 429) {
    return { code: 429, error: "Llegaste al límite de consultas. Esperá un rato y probá de nuevo." };
  }
  if (status) {
    return { code: status, error: `El proveedor respondió ${status}: ${mensaje.slice(0, 200)}` };
  }
  if (err instanceof SyntaxError) {
    return { code: 502, error: "El modelo no devolvió un JSON válido. Con modelos chicos pasa: probá con uno más grande." };
  }
  return { code: 500, error: mensaje };
}
