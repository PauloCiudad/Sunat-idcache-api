import { env } from "../config/env.js";

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, X-API-Key";

export function createCorsMiddleware({ origins = env.cors.origins } = {}) {
  const allowedOrigins = new Set(origins);
  const allowAll = allowedOrigins.has("*");

  return function corsMiddleware(req, res, next) {
    const origin = req.get("origin");

    // CORS solo aplica a navegadores. Scripts, health checks y servicios sin
    // cabecera Origin siguen usando la API normalmente.
    if (!origin) return next();

    res.vary("Origin");
    if (!allowAll && !allowedOrigins.has(origin)) {
      return res.status(403).json({
        ok: false,
        message: "Origen no permitido por CORS"
      });
    }

    res.set("Access-Control-Allow-Origin", allowAll ? "*" : origin);
    res.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.set("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  };
}
