import assert from "node:assert/strict";
import { test } from "node:test";
import { avaliarSaude } from "./saude.ts";

test("saúde: tudo ok = nenhum alerta", () => {
  assert.deepEqual(avaliarSaude([{ item: "openai", ok: true, detalhe: "HTTP 200" }], ["openai"]).map((a) => a.alerta), [false]);
});

test("saúde: falha de verdade = alerta, exigido ou não", () => {
  const r = avaliarSaude([{ item: "crm", ok: false, detalhe: "CRM recusou a chave (HTTP 401)" }], []);
  assert.equal(r[0].alerta, true);
});

test("saúde: não configurado só é alerta quando exigido (produção exige tudo; teste, não)", () => {
  const item = { item: "whatsapp", ok: false, detalhe: "token ou número do WhatsApp não cadastrados no painel" };
  assert.equal(avaliarSaude([item], ["banco", "openai", "whatsapp", "crm"])[0].alerta, true);
  assert.equal(avaliarSaude([item], ["banco"])[0].alerta, false);
});
