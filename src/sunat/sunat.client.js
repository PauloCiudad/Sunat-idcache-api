import axios from "axios";

import { env } from "../config/env.js";
import { logger } from "../infrastructure/logger.js";

const CONSULT_URL =
  "https://e-plataformaunica.sunat.gob.pe/v1/recaudacion/tributaria/" +
  "declapago/detracciones/t/consultar";

export class SunatClient {
  constructor() {
    this.http = axios.create({
      timeout: env.sunat.requestTimeoutMs,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });
  }

  async getDetracciones({ idCache, cookieHeader, fechaInicio, fechaFin }) {
    const response = await this.http.get(CONSULT_URL, {
      params: {
        fechaInicio,
        fechaFin,
        tipoCuenta: 1,
        tipoConsulta: "pagosIndividuales",
        periodo: ""
        /*_: Date.now()*/
      },
      headers: {
        Idcache: idCache,
        Idformulario: "*MENU*",
        Cookie: cookieHeader,
        Origin: "https://e-plataformaunica.sunat.gob.pe",
        Referer: "https://e-plataformaunica.sunat.gob.pe/"
      }
    });

    const payload = response.data;
    if (payload?.cod != null && Number(payload.cod) !== 200) {
      throw new Error(`SUNAT devolvió cod=${payload.cod}: ${payload.msg || "Error"}`);
    }

    const rows = Array.isArray(payload?.resultado) ? payload.resultado : [];
    logger.info("sunat.detracciones.received", {
      fechaInicio,
      fechaFin,
      cod: payload?.cod,
      msg: payload?.msg || "",
      records: rows.length,
      cookieSent: Boolean(cookieHeader)
    });
    return { payload, rows };
  }
}
