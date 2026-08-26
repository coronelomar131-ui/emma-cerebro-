/* ============================================================
 * El servidor local
 * ------------------------------------------------------------
 * Sirve la página de web/ y le agrega dos cosas:
 *
 *   POST /api/chat  → piensa una respuesta (lo mismo que api/chat.js
 *                     cuando el proyecto está publicado en internet)
 *   POST /api/face  → repite el estado de la cara por el puerto serie,
 *                     para que la OLED de verdad muestre lo mismo
 *
 *   node brain/server.js --provider gemini
 *   node brain/server.js --provider claude --serial /dev/ttyUSB0
 *   node brain/server.js --provider ollama --model llama3.2
 *
 * Las claves salen de brain/.env, o de las variables de entorno.
 * ============================================================ */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pensar, explicarError, MODELOS_POR_DEFECTO } from "./cerebro.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(here, "..", "web");

// Si hay un archivo brain/.env, las claves salen de ahí y no hace falta
// acordarse de exportarlas en cada terminal.
const ENV_FILE = path.join(here, ".env");
if (fs.existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
  console.log("Claves leídas de brain/.env");
}

// ---------------- argumentos ----------------
function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PORT = Number(arg("port", 8000));
const SERIAL_PORT = arg("serial", null);
const PROVEEDOR = arg("provider", "gemini");
const OLLAMA_URL = arg("ollama-url", "http://localhost:11434");
const MODELO = arg("model", MODELOS_POR_DEFECTO[PROVEEDOR]);

// ---------------- puente al puerto serie ----------------
// El ESP32 escucha líneas de texto: "MOOD:feliz" y "LEVEL:0.62".
let serial = null;
let ultimaEmocion = null;

function abrirSerial(dispositivo) {
  try {
    serial = fs.createWriteStream(dispositivo);
    serial.on("error", (err) => {
      console.error(`Puerto serie ${dispositivo}: ${err.message}`);
      serial = null;
    });
    console.log(`Puerto serie abierto en ${dispositivo}`);
    console.log("Si la OLED no reacciona, configurá la velocidad primero:");
    console.log(`  stty -F ${dispositivo} 115200 raw    (en macOS: stty -f ${dispositivo} 115200 raw)`);
  } catch (err) {
    console.error(`No se pudo abrir ${dispositivo}: ${err.message}`);
  }
}

function mandarALaPantalla(emocion, level) {
  if (!serial) return;
  if (emocion && emocion !== ultimaEmocion) {
    serial.write(`MOOD:${emocion}\n`);
    ultimaEmocion = emocion;
  }
  if (typeof level === "number") {
    serial.write(`LEVEL:${level.toFixed(2)}\n`);
  }
}

// ---------------- HTTP ----------------
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function leerCuerpo(req, limite = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => {
      datos += c;
      if (datos.length > limite) reject(new Error("El audio es demasiado largo."));
    });
    req.on("end", () => resolve(datos));
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const cuerpo = JSON.parse(await leerCuerpo(req));
      const salida = await pensar({
        texto: cuerpo.text,
        audio: cuerpo.audio,
        history: cuerpo.history,
        proveedor: PROVEEDOR,
        modelo: MODELO,
        ollamaUrl: OLLAMA_URL,
      });
      mandarALaPantalla(salida.emocion, null);
      console.log(`→ ${salida.dijiste || "(audio)"}`);
      console.log(`← [${salida.emocion}] ${salida.respuesta}`);
      return json(res, 200, salida);
    } catch (err) {
      const { code, error } = explicarError(err, MODELO);
      console.error("Error en /api/chat:", error);
      return json(res, code, { error });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/face") {
    try {
      const { emocion, level } = JSON.parse(await leerCuerpo(req, 1024));
      mandarALaPantalla(emocion, typeof level === "number" ? level : undefined);
      return json(res, 200, { ok: true, serial: Boolean(serial) });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  // archivos estáticos de web/
  const nombre = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const destino = path.join(WEB_DIR, nombre);
  if (!destino.startsWith(WEB_DIR)) {
    res.writeHead(403).end("Prohibido");
    return;
  }
  fs.readFile(destino, (err, contenido) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
      return;
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(destino)] || "application/octet-stream" });
    res.end(contenido);
  });
});

if (SERIAL_PORT) abrirSerial(SERIAL_PORT);

const CLAVES = { claude: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" };

server.listen(PORT, () => {
  console.log(`La cara está en http://localhost:${PORT}`);
  console.log(`Cerebro: ${PROVEEDOR} (${MODELO})`);
  const clave = CLAVES[PROVEEDOR];
  if (clave && !process.env[clave]) {
    console.log(`Ojo: ${clave} no está seteada. Ponela en brain/.env`);
  }
  if (PROVEEDOR === "ollama") {
    console.log(`Ollama esperado en ${OLLAMA_URL}. Si no lo tenés: ollama serve && ollama pull ${MODELO}`);
  }
});
