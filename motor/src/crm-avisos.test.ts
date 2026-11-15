import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import { avisoVerdadeiro } from "./crm-avisos.ts";

const SEGREDO = "segredo-dos-avisos-do-crm-123456";
const corpo = JSON.stringify({ id: 42, tipo: "teste.ping", dados: { mensagem: "oi" } });
const assinar = (t: number, c = corpo, s = SEGREDO) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${c}`).digest("hex")}`;

describe("avisos do CRM (X-Aurora-Assinatura)", () => {
  const agora = 1763056800;
  test("assinatura certa e recente é aceita", async () => {
    assert.equal(await avisoVerdadeiro(corpo, assinar(agora), SEGREDO, agora + 10), true);
  });
  test("corpo alterado, segredo errado, aviso velho ou sem cabeçalho: recusado", async () => {
    assert.equal(await avisoVerdadeiro(corpo + " ", assinar(agora), SEGREDO, agora), false);
    assert.equal(await avisoVerdadeiro(corpo, assinar(agora, corpo, "outro-segredo-qualquer-0000000"), SEGREDO, agora), false);
    assert.equal(await avisoVerdadeiro(corpo, assinar(agora - 400), SEGREDO, agora), false);
    assert.equal(await avisoVerdadeiro(corpo, null, SEGREDO, agora), false);
    assert.equal(await avisoVerdadeiro(corpo, assinar(agora), null, agora), false);
  });
});
