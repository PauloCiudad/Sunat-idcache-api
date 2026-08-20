const FIELD_ALIASES = {
  num_press: ["numPress", "numPres"],
  cod_usuario_sol: ["codUsuarioSol"],
  des_prov: ["desProv"],
  cod_tipcomprobante: ["codTipcomprobante", "codTipComprobante"],
  num_ruc_proveedor: ["numRucProveedor"],
  per_tributario: ["perTributario"],
  fec_pago_desc: ["fecPagoDesc"],
  num_npd: ["numNpd", "numNPD"],
  des_adq: ["desAdq"],
  num_constancia: ["numConstancia"],
  tip_bien: ["tipBien"],
  tip_operacion: ["tipOperacion"],
  num_doc_adq: ["numDocAdq"],
  mto_deposito_desc: ["mtoDepositoDesc"],
  num_cuenta: ["numCuenta"],
  mto_deposito: ["mtoDeposito"],
  num_comprobante: ["numComprobante"],
  fec_pago: ["fecPago"],
  tip_doc_adq: ["tipDocAdq"],
  num_serie: ["numSerie"],
  origen_desc: ["origenDesc"],
  cod_tipcta: ["codTipcta", "codTipCta"]
};

const NUMBER_FIELDS = new Set([
  "num_press", "cod_tipcomprobante", "num_ruc_proveedor", "per_tributario",
  "num_npd", "num_constancia", "tip_bien", "tip_operacion", "num_doc_adq",
  "mto_deposito_desc", "num_cuenta", "mto_deposito", "num_comprobante",
  "fec_pago", "tip_doc_adq", "cod_tipcta"
]);

function normalizeKey(key) {
  return key.replaceAll("_", "").toLowerCase();
}

function findValue(source, dbField) {
  const normalized = new Map(
    Object.entries(source).map(([key, value]) => [normalizeKey(key), value])
  );
  const aliases = [dbField, ...(FIELD_ALIASES[dbField] || [])];

  for (const alias of aliases) {
    if (normalized.has(normalizeKey(alias))) {
      return normalized.get(normalizeKey(alias));
    }
  }
  return null;
}

function nullable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function toNumber(value, field) {
  value = nullable(value);
  if (value === null) return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  if (!Number.isFinite(parsed)) {
    throw new Error(`SUNAT devolvió un número inválido para ${field}`);
  }
  return parsed;
}

function toDate(value) {
  value = nullable(value);
  if (value === null) return null;
  if (value instanceof Date) return value;

  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("SUNAT devolvió una fecha inválida para fec_pago_desc");
  }
  return parsed;
}

export function mapDetraccion(source) {
  const result = {};
  for (const field of Object.keys(FIELD_ALIASES)) {
    const value = findValue(source, field);
    if (field === "fec_pago_desc") result[field] = toDate(value);
    else if (NUMBER_FIELDS.has(field)) result[field] = toNumber(value, field);
    else result[field] = nullable(value) == null ? null : String(value).trim();
  }
  return result;
}
