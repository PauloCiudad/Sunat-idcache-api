import { env } from "../config/env.js";

export function requireApiKey(req, res, next) {
  if (req.header("x-api-key") !== env.apiKey) {
    return res.status(401).json({ ok: false, message: "API key inválida" });
  }
  next();
}
