import assert from "node:assert/strict";
import { test } from "node:test";
import { lerStatus } from "./saude.ts";

test("saúde: 2xx e 3xx passam", () => {
  assert.equal(lerStatus("OpenAI", 200), "HTTP 200");
});

test("saúde: sem resposta, chave recusada, erro do serviço e 4xx viram falha com mensagem clara", () => {
  assert.throws(() => lerStatus("CRM", 0), /CRM não respondeu/);
  assert.throws(() => lerStatus("OpenAI", 401), /recusou a chave/);
  assert.throws(() => lerStatus("Meta (WhatsApp)", 403), /recusou a chave/);
  assert.throws(() => lerStatus("CRM", 503), /com problema \(HTTP 503\)/);
  assert.throws(() => lerStatus("CRM", 429), /HTTP 429/);
});
