import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { proximoHorarioPermitido, quandoMandar, recadoForaDaJanela } from "./lembretes.ts";

// horários em UTC: Brasília = UTC-3 (14:00Z = 11h em Brasília)
describe("lembretes da proposta: quando mandar", () => {
  test("entre 8h e 21h de Brasília: manda na hora", () => {
    const agora = new Date("2026-11-16T14:00:00Z");
    assert.equal(proximoHorarioPermitido(agora).toISOString(), agora.toISOString());
    assert.deepEqual(quandoMandar(agora, new Date("2026-11-16T13:00:00Z")), { acao: "mandar" });
  });
  test("depois das 21h: fica para as 8h do dia seguinte", () => {
    const agora = new Date("2026-11-17T01:30:00Z"); // 22h30 de 16/11 em Brasília
    assert.equal(proximoHorarioPermitido(agora).toISOString(), "2026-11-17T11:00:00.000Z"); // 8h de 17/11
  });
  test("de madrugada: fica para as 8h do mesmo dia", () => {
    const agora = new Date("2026-11-17T06:00:00Z"); // 3h em Brasília
    assert.equal(proximoHorarioPermitido(agora).toISOString(), "2026-11-17T11:00:00.000Z");
  });
  test("se as 8h já passam da janela de 24 h, desiste (não paga mensagem)", () => {
    const agora = new Date("2026-11-17T01:30:00Z");
    const r = quandoMandar(agora, new Date("2026-11-16T10:00:00Z")); // janela vai até 17/11 09:30Z, antes das 11:00Z
    assert.equal(r.acao, "desistir");
    const ok = quandoMandar(agora, new Date("2026-11-16T22:00:00Z"));
    assert.deepEqual(ok, { acao: "reagendar", em: new Date("2026-11-17T11:00:00.000Z") });
  });
});

describe("proposta aprovada fora da janela de 24 h", () => {
  test("o recado para a equipe traz a proposta, as horas e o link (ou como pegar o link)", () => {
    const r = recadoForaDaJanela({ numero: "PROP-2026-0004", link: "https://x.test/proposta/abc", horas: 26.2 });
    assert.match(r, /PROP-2026-0004 foi aprovada/);
    assert.match(r, /há 26 h/);
    assert.match(r, /https:\/\/x\.test\/proposta\/abc/);
    assert.match(recadoForaDaJanela({ horas: 30 }), /use "Enviar"/);
  });
});
