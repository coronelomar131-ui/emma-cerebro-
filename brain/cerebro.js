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
  // Haiku es el mas barato de la familia y le sobra para charlar de a una o dos
  // frases. Si querés mas cabeza, poné CARA_MODEL con otro modelo.
  claude: "claude-haiku-4-5",
  gemini: null,   // se elige solo, ver CANDIDATOS_GEMINI
  ollama: "llama3.2",
};

// Google va renombrando y jubilando modelos, y no todas las claves ven los
// mismos. En vez de adivinar uno, probamos en orden y nos quedamos con el
// primero que conteste. Si querés fijar uno, poné CARA_MODEL.
const CANDIDATOS_GEMINI = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

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

Podés buscar en internet cuando haga falta: noticias, clima, precios, datos que
cambian. Usalo solo si de verdad hace falta, no para cualquier cosa. Si lo que
decís salió de una búsqueda, mencionalo al pasar, sin dar una lista de fuentes.
Si te pasa un link, podés abrirlo y leerlo.

Esto es lo que sabés de él:
${PROYECTOS}`;

// Se lo pedimos así a los dos modelos: es el formato que mejor respetan y el
// único que convive con las herramientas de búsqueda.
const FORMATO = `

Contestá SIEMPRE con este formato y nada más:
EMOCION: una de ${EMOCIONES.join(", ")}
RESPUESTA: lo que le decís, en una o dos frases
ANOTAR: (opcional) algo que quieras recordar para siempre

La línea ANOTAR es tu memoria. Poné una sola cuando aparezca algo que te sirva
saber más adelante: cómo se llama alguien de su entorno, qué le gusta o le
molesta, en qué anda trabajando, una decisión que tomó, algo que te pidió que
no olvides. Escribila corta y en tercera persona, como una ficha: "Trabaja con
autopartes", "Prefiere que le hablen sin vueltas".

No anotes lo que ya está anotado, ni lo que se te pide de paso, ni el clima ni
nada que caduque en un rato. Si no hay nada que valga la pena, dejá la línea afuera.`;

/** Lo que Emma fue anotando, para que lo tenga presente. */
function conMemoria(base, notas) {
  if (!Array.isArray(notas) || !notas.length) return base;
  const lista = notas
    .filter((n) => typeof n === "string" && n.trim())
    .slice(-60)
    .map((n) => "- " + n.trim().slice(0, 300))
    .join("\n");
  if (!lista) return base;
  return `${base}

## Lo que fuiste anotando vos misma

${lista}

Eso lo escribiste vos en charlas anteriores. Usalo con naturalidad, sin aclarar
que lo tenías anotado, y sin repetirle a Omar cosas que ya sabe.`;
}

/** La fecha se calcula en cada consulta: si la dejáramos fija, envejecería. */
function conFecha(base) {
  const ahora = new Date().toLocaleString("es-AR", {
    timeZone: "America/Mexico_City",
    dateStyle: "full",
    timeStyle: "short",
  });
  return `${base}\n\nAhora mismo es: ${ahora} (hora de México).`;
}

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

/**
 * Cuando Emma puede buscar en internet, Google no deja exigirle un JSON exacto.
 * Así que aceptamos las tres formas en que un modelo suele contestar, y si
 * ninguna encaja nos quedamos con el texto tal cual.
 */
export function interpretar(texto) {
  const limpio = String(texto || "").trim();
  if (!limpio) throw new Error("El modelo no contestó nada");

  // 1) JSON, con o sin los ``` que a veces le pone alrededor
  const sinCerca = limpio.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (sinCerca.startsWith("{")) {
    try {
      const d = JSON.parse(sinCerca);
      if (d && typeof d.respuesta === "string") return d;
    } catch (err) { /* seguimos probando */ }
  }

  // 2) el formato con etiquetas, que es el que mejor respetan
  const emocion = limpio.match(/EMOCION\s*:\s*(\w+)/i);
  const anotar = limpio.match(/ANOTAR\s*:\s*(.+)/i);
  // La respuesta llega hasta donde empieza ANOTAR, si es que vino.
  const respuesta = limpio.match(/RESPUESTA\s*:\s*([\s\S]+?)(?=\n\s*ANOTAR\s*:|$)/i);
  if (respuesta) {
    return {
      emocion: emocion ? emocion[1].toLowerCase() : "neutral",
      respuesta: respuesta[1].trim(),
      anotar: anotar ? anotar[1].trim() : "",
    };
  }

  // 3) contestó en prosa y ya: lo tomamos como la respuesta
  return { emocion: "neutral", respuesta: limpio };
}

/** Un modelo chico puede inventarse una emoción: nos quedamos con algo válido igual. */
function normalizar(data, uso, textoOriginal) {
  if (!data || typeof data.respuesta !== "string" || !data.respuesta.trim()) {
    throw new Error("El modelo no devolvió una respuesta usable");
  }
  const nota = typeof data.anotar === "string" ? data.anotar.trim() : "";
  return {
    emocion: EMOCIONES.includes(data.emocion) ? data.emocion : "neutral",
    respuesta: data.respuesta.trim(),
    // Una nota vacía, muy corta o larguísima no sirve de memoria.
    anotar: nota.length > 3 && nota.length < 300 ? nota : "",
    dijiste: (typeof data.dijiste === "string" && data.dijiste.trim()) || textoOriginal || "",
    uso,
  };
}

// ---------------- Claude ----------------
let anthropic = null;

// No todos los modelos aceptan lo mismo, y mandarle a uno viejo algo que no
// entiende devuelve un error 400. Estos son los que necesitan trato especial.
const PERFILES_VIEJOS = {
  "claude-haiku-4-5": true,
  "claude-haiku-4-5-20251001": true,
  "claude-sonnet-4-5": true,
};

function perfilDe(modelo) {
  return PERFILES_VIEJOS[modelo]
    // Los modelos previos a la generación 4.6 no aceptan "effort", usan la
    // versión básica del buscador, y para razonar necesitan un presupuesto fijo.
    ? {
        aceptaEsfuerzo: false,
        buscador: "web_search_20250305",
        pensar: { type: "enabled", budget_tokens: 1500 },
        techoPensando: 3500,
      }
    : {
        aceptaEsfuerzo: true,
        buscador: "web_search_20260209",
        pensar: { type: "adaptive" },
        techoPensando: 4000,
      };
}

// Razonar antes de contestar cuesta tokens de salida, que son los caros. Por eso
// viene apagado: se prende poniendo CARA_PENSAR en "si".
const PENSAR = /^(si|sí|1|true|yes)$/i.test(process.env.CARA_PENSAR || "");

async function conClaude({ turnos, texto, modelo, notas }) {
  if (!anthropic) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropic = new Anthropic();
  }

  const elegido = modelo || MODELOS_POR_DEFECTO.claude;
  const perfil = perfilDe(elegido);

  const pedido = {
    model: elegido,
    // Las respuestas se dicen en voz alta, pero con buscador necesita aire.
    max_tokens: 2048,
    system: conFecha(conMemoria(SYSTEM, notas)) + FORMATO,
    tools: [{ type: perfil.buscador, name: "web_search" }],
  };
  // Charla corta: con esfuerzo bajo contesta más rápido y gasta menos. Los
  // modelos viejos no lo aceptan y devuelven 400 si se lo mandamos igual.
  if (perfil.aceptaEsfuerzo) pedido.output_config = { effort: "low" };

  if (PENSAR) {
    pedido.thinking = perfil.pensar;
    // El presupuesto para pensar tiene que caber dentro del techo de salida.
    pedido.max_tokens = perfil.techoPensando;
  }

  let messages = [...turnos, { role: "user", content: texto }];
  let response = null;
  let entrada = 0, salida = 0;

  // Con el buscador prendido, la API puede frenar a mitad de camino y avisar
  // con stop_reason "pause_turn". Se reanuda devolviéndole lo que llevaba.
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    response = await anthropic.messages.create({ ...pedido, messages });
    entrada += response.usage.input_tokens || 0;
    salida += response.usage.output_tokens || 0;
    if (response.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: response.content }];
  }

  if (response.stop_reason === "refusal") {
    throw new Error("Claude prefirió no contestar eso. Probá preguntándolo de otra forma.");
  }

  // Con buscador la respuesta puede venir partida en varios bloques de texto.
  const texto_salida = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return normalizar(interpretar(texto_salida), {
    modelo: elegido,
    entrada,
    salida,
  }, texto);
}

// ---------------- Gemini ----------------
let gemini = null;
let modeloElegido = null;   // el primero que funcionó, para no volver a probar

function clienteGemini() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Falta la clave. Poné GEMINI_API_KEY (se saca en aistudio.google.com/apikey)");
  }
  return gemini;
}

/** Le pregunta a Google qué modelos ve esta clave, para poder avisar bien. */
async function modelosDisponibles(ai) {
  try {
    const nombres = [];
    const pagina = await ai.models.list();
    for await (const m of pagina) {
      if (m && m.name) nombres.push(String(m.name).replace(/^models\//, ""));
      if (nombres.length >= 40) break;
    }
    return nombres.filter((n) => /flash|pro/.test(n));
  } catch (err) {
    return [];
  }
}

async function conGemini({ turnos, texto, audio, modelo, notas }) {
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

  // Google no permite exigir un JSON exacto y buscar en internet a la vez, y la
  // búsqueda vale más. Así que se lo pedimos con etiquetas en el prompt, que es
  // el formato que mejor respetan, y lo leemos con un parser tolerante.
  const config = {
    systemInstruction: conFecha(conMemoria(SYSTEM, notas)) + FORMATO,
    tools: [{ googleSearch: {} }, { urlContext: {} }],
    maxOutputTokens: 2048,
  };

  // Si nos fijaron un modelo, ese y nada más. Si no, probamos los candidatos.
  const aProbar = modelo ? [modelo] : (modeloElegido ? [modeloElegido] : CANDIDATOS_GEMINI);
  let ultimo = null;

  for (const nombre of aProbar) {
    try {
      const response = await gemini.models.generateContent({ model: nombre, contents, config });
      modeloElegido = nombre;
      const uso = response.usageMetadata || {};
      return normalizar(interpretar(response.text), {
        modelo: nombre,
        entrada: uso.promptTokenCount,
        salida: uso.candidatesTokenCount,
      }, texto);
    } catch (err) {
      // 404 = este modelo no existe para esta clave: seguimos con el próximo.
      const esNoEncontrado = err && (err.status === 404 || /NOT_FOUND|not found|is not found/i.test(err.message || ""));
      if (!esNoEncontrado) throw err;
      ultimo = err;
    }
  }

  const hay = await modelosDisponibles(gemini);
  throw new Error(hay.length
    ? `Ninguno de los modelos que probé existe para tu clave. Los que sí podés usar: ${hay.slice(0, 6).join(", ")}. Poné uno de esos en la variable CARA_MODEL.`
    : `No pude encontrar un modelo que tu clave pueda usar. ${ultimo ? ultimo.message : ""}`);
}

// ---------------- Ollama ----------------
async function conOllama({ turnos, texto, modelo, ollamaUrl, notas }) {
  let res;
  try {
    res = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        stream: false,
        format: ESQUEMA,
        messages: [{ role: "system", content: conFecha(conMemoria(SYSTEM, notas)) + FORMATO }, ...turnos, { role: "user", content: texto }],
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
  const proveedor = pedido.proveedor || "claude";
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
    notas: pedido.notas,
    turnos: limpiarHistorial(pedido.history),
    texto: pedido.texto ? pedido.texto.trim() : "",
    audio: pedido.audio,
    modelo: pedido.modelo || MODELOS_POR_DEFECTO[proveedor] || null,
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
    return modelo
      ? { code: 404, error: `El modelo "${modelo}" no existe o tu cuenta no tiene acceso.` }
      : { code: 404, error: "El modelo pedido no existe o tu cuenta no tiene acceso." };
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
