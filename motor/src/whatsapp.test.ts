/**
 * Testes do canal WhatsApp, sem internet:  npm run test:motor  (na raiz)
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import { assinaturaValida, lerMensagens } from "./whatsapp.ts";

const SEGREDO = "0123456789abcdef0123456789abcdef";
const assinar = (corpo: string, segredo = SEGREDO) => "sha256=" + createHmac("sha256", segredo).update(corpo).digest("hex");

const aviso = (mensagens: unknown[], phoneNumberId = "111") =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ wa_id: "5534988887777", profile: { name: "Carla" } }], messages: mensagens } }] }],
  });

describe("assinatura dos avisos da Meta (X-Hub-Signature-256)", () => {
  const corpo = aviso([{ id: "wamid.1", from: "5534988887777", timestamp: "1763200000", type: "text", text: { body: "Oi" } }]);
  test("assinatura certa é aceita", async () => {
    assert.equal(await assinaturaValida(corpo, assinar(corpo), SEGREDO), true);
  });
  test("corpo alterado, segredo errado, sem cabeçalho ou sem segredo: recusado", async () => {
    assert.equal(await assinaturaValida(corpo.replace("Oi", "Oi!"), assinar(corpo), SEGREDO), false);
    assert.equal(await assinaturaValida(corpo, assinar(corpo, "outro-segredo-qualquer-123456789"), SEGREDO), false);
    assert.equal(await assinaturaValida(corpo, null, SEGREDO), false);
    assert.equal(await assinaturaValida(corpo, assinar(corpo), null), false);
    assert.equal(await assinaturaValida(corpo, "sha1=abc", SEGREDO), false);
  });
});

describe("leitura dos avisos", () => {
  test("texto, áudio, botão e imagem", () => {
    const m = lerMensagens(
      JSON.parse(
        aviso([
          { id: "wamid.1", from: "5534988887777", timestamp: "1763200000", type: "text", text: { body: "Quero um orçamento" } },
          { id: "wamid.2", from: "5534988887777", timestamp: "1763200005", type: "audio", audio: { id: "midia-9" } },
          { id: "wamid.3", from: "5534988887777", timestamp: "1763200006", type: "interactive", interactive: { button_reply: { title: "Sim" } } },
          { id: "wamid.4", from: "5534988887777", timestamp: "1763200007", type: "image", image: { id: "img" } },
        ]),
      ),
    );
    assert.deepEqual(
      m.map((x) => [x.wamid, x.tipo, x.texto, x.midiaId]),
      [
        ["wamid.1", "texto", "Quero um orçamento", null],
        ["wamid.2", "audio", null, "midia-9"],
        ["wamid.3", "botao", "Sim", null],
        ["wamid.4", "midia", null, null],
      ],
    );
    assert.equal(m[0].nome, "Carla");
    assert.equal(m[0].phoneNumberId, "111");
    assert.equal(m[0].em, new Date(1763200000 * 1000).toISOString());
  });
  test("confirmações de entrega/leitura e avisos de outro tipo não viram mensagem", () => {
    const status = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.x", status: "read" }] } }] }] });
    assert.deepEqual(lerMensagens(JSON.parse(status)), []);
    assert.deepEqual(lerMensagens({ object: "page" }), []);
    assert.deepEqual(lerMensagens(null), []);
  });
});
