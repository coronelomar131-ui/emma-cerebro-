/* ============================================================
 * La misma cabeza, pero publicada en internet
 * ------------------------------------------------------------
 * Vercel convierte cada archivo de api/ en una función. Esta
 * atiende POST /api/chat, igual que el servidor local.
 *
 * La clave se configura en el panel de Vercel, en Environment
 * Variables. Nunca viaja al teléfono.
 * ============================================================ */

import { pensar, explicarError, MODELOS_POR_DEFECTO } from "../brain/cerebro.js";

const PROVEEDOR = process.env.CARA_PROVIDER || "claude";
const MODELO = process.env.CARA_MODEL || MODELOS_POR_DEFECTO[PROVEEDOR];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Usá POST." });
    return;
  }
  try {
    // Vercel ya parsea el JSON; si algún día no lo hace, lo leemos igual.
    const cuerpo = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const salida = await pensar({
      texto: cuerpo.text,
      audio: cuerpo.audio,
      history: cuerpo.history,
      proveedor: PROVEEDOR,
      modelo: MODELO,
    });
    res.status(200).json(salida);
  } catch (err) {
    const { code, error } = explicarError(err, MODELO);
    res.status(code).json({ error });
  }
}
