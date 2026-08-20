import assert from "node:assert/strict";
import test from "node:test";

import { mapDetraccion } from "../src/repositories/detracciones.mapper.js";

test("mapea respuesta camelCase a columnas Oracle", () => {
  const mapped = mapDetraccion({
    numPres: "12",
    codUsuarioSol: "USR",
    desProv: "Proveedor",
    numRucProveedor: "20123456789",
    fecPagoDesc: "19/08/2026",
    mtoDeposito: "125.500",
    numSerie: "F01",
    codTipCta: "1"
  });

  assert.equal(mapped.num_press, 12);
  assert.equal(mapped.cod_usuario_sol, "USR");
  assert.equal(mapped.des_prov, "Proveedor");
  assert.equal(mapped.num_ruc_proveedor, 20123456789);
  assert.equal(mapped.fec_pago_desc.getFullYear(), 2026);
  assert.equal(mapped.mto_deposito, 125.5);
  assert.equal(mapped.num_serie, "F01");
  assert.equal(mapped.cod_tipcta, 1);
});

test("no genera usr_crea ni fec_crea", () => {
  const mapped = mapDetraccion({});
  assert.equal(Object.hasOwn(mapped, "usr_crea"), false);
  assert.equal(Object.hasOwn(mapped, "fec_crea"), false);
});

test("mapea el contrato real de SUNAT", () => {
  const mapped = mapDetraccion({
    num_pres: 7829678056,
    cod_usuario_sol: "RDCB1234",
    cod_tipcomprobante: "01",
    num_ruc_proveedor: "20170291345",
    per_tributario: "202608",
    fec_pago_desc: "2026-08-19",
    num_npd: " ",
    mto_deposito_desc: "722.00",
    num_cuenta: "00101083330",
    mto_deposito: 722,
    num_comprobante: "00008817",
    fec_pago: 1787168226000,
    num_serie: "F320"
  });

  assert.equal(mapped.num_press, 7829678056);
  assert.equal(mapped.cod_tipcomprobante, 1);
  assert.equal(mapped.num_npd, null);
  assert.equal(mapped.num_cuenta, 101083330);
  assert.equal(mapped.num_comprobante, 8817);
  assert.equal(mapped.fec_pago_desc.getFullYear(), 2026);
  assert.equal(mapped.fec_pago_desc.getMonth(), 7);
  assert.equal(mapped.fec_pago_desc.getDate(), 19);
  assert.equal(mapped.num_serie, "F320");
});
