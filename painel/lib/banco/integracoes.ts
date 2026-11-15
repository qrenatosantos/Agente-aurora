/**
 * INTEGRAÇÕES (o que NÃO é segredo) e SEGREDOS (cifrados pelo painel com a CHAVE_MESTRA, que não está no banco).
 * Só o gestor vê e altera. O texto cifrado nunca vai para o navegador nem para o registro.
 * Exceção: o simulador (qualquer pessoa ativa) usa a chave da OpenAI e a do CRM, só no servidor.
 */
import { agora, type Ator, type Banco, converter, ErroRegra, exigirAtivo, exigirGestor, registrar, traduzirErro } from "./base.ts";

export const NOMES_SEGREDOS = ["crm_chave", "crm_segredo_avisos", "openai_chave", "whatsapp_token", "whatsapp_app_secret", "whatsapp_verify_token"] as const;
export type NomeSegredo = (typeof NOMES_SEGREDOS)[number];
const DO_SIMULADOR: NomeSegredo[] = ["openai_chave", "crm_chave"];

export type ResultadoTeste = { ok: boolean; em?: string; mensagem?: string; detalhes?: unknown };
export type Integracoes = {
  crm_url: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_numero: string | null;
  whatsapp_graph_versao: string;
  teste_crm: ResultadoTeste | null;
  teste_openai: ResultadoTeste | null;
  teste_whatsapp: ResultadoTeste | null;
  updated_at: string;
};
export type SituacaoSegredo = { nome: NomeSegredo; final: string | null; atualizado_em: string; atualizado_por: string | null };

const CAMPOS = ["crm_url", "whatsapp_phone_number_id", "whatsapp_waba_id", "whatsapp_numero", "whatsapp_graph_versao"] as const;

export async function lerIntegracoesInterno(db: Banco): Promise<Integracoes> {
  const r = await db.prepare("select * from integracoes where id = 1").first();
  return converter<Integracoes>(r, [], ["teste_crm", "teste_openai", "teste_whatsapp"])!;
}

export async function lerIntegracoes(db: Banco, ator: Ator) {
  exigirGestor(ator, "Só o gestor vê as integrações.");
  return lerIntegracoesInterno(db);
}

export async function salvarIntegracoes(db: Banco, ator: Ator, d: Partial<Pick<Integracoes, (typeof CAMPOS)[number]>>) {
  exigirGestor(ator, "Só o gestor altera as integrações.");
  const antes = await lerIntegracoesInterno(db);
  const mudou = CAMPOS.filter((k) => d[k] !== undefined && d[k] !== antes[k]);
  if (!mudou.length) return;
  const antesR = Object.fromEntries(mudou.map((k) => [k, antes[k]]));
  const depoisR = Object.fromEntries(mudou.map((k) => [k, d[k]]));
  try {
    await db.batch([
      db.prepare(`update integracoes set ${mudou.map((k) => `${k} = ?`).join(", ")}, updated_at = ? where id = 1`).bind(...mudou.map((k) => d[k]), agora()),
      registrar(db, ator, "integracoes.alterou", "Integrações", { antes: antesR, depois: depoisR }),
    ]);
  } catch (e) {
    traduzirErro(e);
  }
}

function conferirNome(nome: string): asserts nome is NomeSegredo {
  if (!(NOMES_SEGREDOS as readonly string[]).includes(nome)) throw new ErroRegra("Chave desconhecida.");
}

export async function salvarSegredo(db: Banco, ator: Ator, nome: string, cifrado: string, final: string | null) {
  exigirGestor(ator, "Só o gestor altera as chaves das integrações.");
  conferirNome(nome);
  if (!/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(cifrado) || cifrado.length > 8000) throw new ErroRegra("Formato de chave cifrada inválido.");
  const fim = (final ?? "").slice(-4) || null;
  await db.batch([
    db
      .prepare(
        `insert into segredos (nome, cifrado, final, atualizado_em, atualizado_por) values (?, ?, ?, ?, ?)
         on conflict (nome) do update set cifrado = excluded.cifrado, final = excluded.final, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
      )
      .bind(nome, cifrado, fim, agora(), ator.nome),
    // o registro diz QUAL chave mudou, nunca o valor
    registrar(db, ator, "segredo.alterou", nome, { final: fim }),
  ]);
}

export async function apagarSegredo(db: Banco, ator: Ator, nome: string) {
  exigirGestor(ator, "Só o gestor altera as chaves das integrações.");
  conferirNome(nome);
  const r = await db.prepare("delete from segredos where nome = ?").bind(nome).run();
  if (r.meta.changes) await registrar(db, ator, "segredo.apagou", nome, {}).run();
}

export async function situacaoSegredos(db: Banco, ator: Ator): Promise<SituacaoSegredo[]> {
  exigirGestor(ator, "Só o gestor vê as chaves.");
  const r = await db.prepare("select nome, final, atualizado_em, atualizado_por from segredos order by nome").all<SituacaoSegredo>();
  return r.results;
}

/** Texto cifrado de UMA chave, para o SERVIDOR decifrar. Gestor: todas. Atendente: só as do simulador. */
export async function segredoCifrado(db: Banco, ator: Ator, nome: string): Promise<string | null> {
  exigirAtivo(ator);
  conferirNome(nome);
  if (ator.papel !== "gestor" && !DO_SIMULADOR.includes(nome)) throw new ErroRegra("Sem permissão.");
  return segredoCifradoInterno(db, nome);
}

/** Sem conferir quem é: só para o motor (WhatsApp), que roda sem pessoa logada. */
export async function segredoCifradoInterno(db: Banco, nome: NomeSegredo): Promise<string | null> {
  const r = await db.prepare("select cifrado from segredos where nome = ?").bind(nome).first<{ cifrado: string }>();
  return r?.cifrado ?? null;
}

/** Endereço do CRM para quem usa o simulador. */
export async function enderecoCrm(db: Banco, ator: Ator): Promise<string | null> {
  exigirAtivo(ator);
  return (await lerIntegracoesInterno(db)).crm_url;
}

export async function gravarTesteIntegracao(db: Banco, ator: Ator, servico: "crm" | "openai" | "whatsapp", resultado: ResultadoTeste) {
  exigirGestor(ator, "Só o gestor testa as integrações.");
  if (!["crm", "openai", "whatsapp"].includes(servico)) throw new ErroRegra("Serviço desconhecido.");
  const valor = { em: agora(), ...resultado };
  await db.batch([
    db.prepare(`update integracoes set teste_${servico} = ? where id = 1`).bind(JSON.stringify(valor)),
    registrar(db, ator, "integracoes.testou", servico, { ok: Boolean(resultado.ok), mensagem: (resultado.mensagem ?? "").slice(0, 300) }),
  ]);
}
