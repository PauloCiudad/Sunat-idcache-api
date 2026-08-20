import "dotenv/config";

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import {
  cerrarBrowser,
  consultarDetraccionesHoy,
  ejecutarEnCola,
  fechaActualPeru,
  obtenerIdCacheSunat
} from "./sunat.service.js";

const app = express();

const PORT = Number(process.env.PORT || 4000);

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json());

function validarConfiguracion() {
  const variables = [
    "API_KEY",
    "SUNAT_RUC",
    "SUNAT_USUARIO_SOL",
    "SUNAT_CLAVE_SOL"
  ];

  const faltantes = variables.filter(
    variable => !process.env[variable]
  );

  if (faltantes.length) {
    throw new Error(
      `Faltan variables de entorno: ${faltantes.join(", ")}`
    );
  }
}

function autenticarApiKey(req, res, next) {
  const apiKey = req.header("x-api-key");

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      ok: false,
      mensaje: "API key inválida"
    });
  }

  next();
}

const limitador = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    mensaje: "Demasiadas solicitudes. Intente nuevamente."
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    servicio: "sunat-detracciones-api",
    fechaPeru: fechaActualPeru()
  });
});

app.post(
  "/api/sunat/id-cache",
  autenticarApiKey,
  limitador,
  async (req, res) => {
    try {
      const resultado = await ejecutarEnCola(obtenerIdCacheSunat);
      return res.status(200).json(resultado);
    } catch (error) {
      console.error(error);

      return res.status(502).json({
        ok: false,
        msg: "No se pudo obtener idCache desde SUNAT",
        detalle:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined
      });
    }
  }
);

app.post(
  "/api/sunat/detracciones/hoy",
  autenticarApiKey,
  limitador,
  async (req, res) => {
    try {
      const resultado = await ejecutarEnCola(
        consultarDetraccionesHoy
      );

      /*
       * Devuelve íntegramente la respuesta de SUNAT:
       * {
       *   cod: 200,
       *   msg: "",
       *   resultado: [...]
       * }
       */
      return res.status(200).json(resultado);
    } catch (error) {
      console.error(error);

      return res.status(502).json({
        ok: false,
        cod: 502,
        msg: "No se pudo completar la consulta en SUNAT",
        detalle:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined,
        resultado: []
      });
    }
  }
);

async function apagarServidor(signal) {
  console.log(`Recibida señal ${signal}. Cerrando...`);

  await cerrarBrowser();

  process.exit(0);
}

process.on("SIGINT", () => {
  apagarServidor("SIGINT");
});

process.on("SIGTERM", () => {
  apagarServidor("SIGTERM");
});

try {
  validarConfiguracion();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `API ejecutándose en http://localhost:${PORT}`
    );
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
