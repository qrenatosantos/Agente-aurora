/**
 * CONHECIMENTO (o agente consulta para tirar dúvidas).
 * Preço, condição, desconto e disponibilidade SÓ podem vir do CRM: o texto que parece falar disso
 * ganha ALERTAS, para o gestor revisar. Todos leem; só o gestor altera. Excluir guarda o texto no registro.
 */
import { alertasTexto } from "../texto.ts";
import { agora, type Ator, type Banco, converter, ErroRegra, exigirAtivo, exigirGestor, novoId, registrar, traduzirErro } from "./base.ts";

export type TipoConhecimento = "pergunta" | "texto" | "arquivo" | "site";
export type Conhecimento = {
  id: string;
  tipo: TipoConhecimento;
  titulo: string;
  pergunta: string | null;
  conteudo: string;
  fonte: string | null;
  ativo: boolean;
  alertas: string[];
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

/** Sinais de preço, condição comercial, desconto e disponibilidade (mesma regra do aviso na tela). */
export { alertasTexto };

const linha = (r: Record<string, unknown> | null) => converter<Conhecimento>(r, ["ativo"], ["alertas"]);

export async function listarConhecimento(db: Banco, ator: Ator): Promise<Conhecimento[]> {
  exigirAtivo(ator);
  const r = await db.prepare("select * from conhecimento order by tipo, titulo").all();
  return r.results.map((x) => linha(x)!);
}

/** Só os itens ativos, no formato do agente (uso interno: motor e simulador). */
export async function conhecimentoDoAgente(db: Banco) {
  const r = await db.prepare("select titulo, pergunta, conteudo from conhecimento where ativo = 1 order by tipo, titulo").all<{ titulo: string; pergunta: string | null; conteudo: string }>();
  return r.results;
}

type Dados = { tipo: TipoConhecimento; titulo: string; pergunta?: string | null; conteudo: string; fonte?: string | null; ativo?: boolean };

function preparar(d: Dados) {
  const titulo = d.titulo.trim();
  const conteudo = d.conteudo.trim();
  const pergunta = d.pergunta?.trim() || null;
  const fonte = d.fonte?.trim() || null;
  if (d.tipo === "pergunta" && !pergunta) throw new ErroRegra("Escreva a pergunta.");
  if (d.tipo === "site" && !/^https?:\/\//.test(fonte ?? "")) throw new ErroRegra("Informe o endereço da página (começando com http).");
  const alertas = alertasTexto(`${pergunta ?? ""}\n${titulo}\n${conteudo}`);
  return { titulo, conteudo, pergunta, fonte, alertas };
}

export async function incluirConhecimento(db: Banco, ator: Ator, d: Dados) {
  exigirGestor(ator, "Só o gestor altera o conhecimento.");
  const p = preparar(d);
  const id = novoId();
  try {
    await db.batch([
      db
        .prepare("insert into conhecimento (id, tipo, titulo, pergunta, conteudo, fonte, ativo, alertas, criado_por) values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, d.tipo, p.titulo, p.pergunta, p.conteudo, p.fonte, d.ativo === false ? 0 : 1, JSON.stringify(p.alertas), ator.id),
      registrar(db, ator, "conhecimento.incluiu", p.titulo, { id, tipo: d.tipo, alertas: p.alertas }),
    ]);
  } catch (e) {
    traduzirErro(e);
  }
  return { id, alertas: p.alertas };
}

export async function alterarConhecimento(db: Banco, ator: Ator, id: string, d: Partial<Dados>) {
  exigirGestor(ator, "Só o gestor altera o conhecimento.");
  const antes = linha(await db.prepare("select * from conhecimento where id = ?").bind(id).first());
  if (!antes) throw new ErroRegra("Item não encontrado.");
  const novo = { tipo: antes.tipo, titulo: d.titulo ?? antes.titulo, pergunta: d.pergunta !== undefined ? d.pergunta : antes.pergunta, conteudo: d.conteudo ?? antes.conteudo, fonte: d.fonte !== undefined ? d.fonte : antes.fonte, ativo: d.ativo ?? antes.ativo };
  const p = preparar(novo);
  const mudouTexto = p.titulo !== antes.titulo || p.pergunta !== antes.pergunta || p.conteudo !== antes.conteudo;
  const mudouAlgo = mudouTexto || novo.ativo !== antes.ativo || p.fonte !== antes.fonte;
  if (!mudouAlgo) return { alertas: antes.alertas };
  const acao = !mudouTexto && p.fonte === antes.fonte ? (novo.ativo ? "conhecimento.ativou" : "conhecimento.desativou") : "conhecimento.alterou";
  try {
    await db.batch([
      db
        .prepare("update conhecimento set titulo = ?, pergunta = ?, conteudo = ?, fonte = ?, ativo = ?, alertas = ?, updated_at = ? where id = ?")
        .bind(p.titulo, p.pergunta, p.conteudo, p.fonte, novo.ativo ? 1 : 0, JSON.stringify(p.alertas), agora(), id),
      registrar(db, ator, acao, p.titulo, { id, antes: { titulo: antes.titulo, pergunta: antes.pergunta, conteudo: antes.conteudo } }),
    ]);
  } catch (e) {
    traduzirErro(e);
  }
  return { alertas: p.alertas };
}

export async function excluirConhecimento(db: Banco, ator: Ator, id: string) {
  exigirGestor(ator, "Só o gestor altera o conhecimento.");
  const antes = linha(await db.prepare("select * from conhecimento where id = ?").bind(id).first());
  if (!antes) return;
  await db.batch([
    db.prepare("delete from conhecimento where id = ?").bind(id),
    registrar(db, ator, "conhecimento.excluiu", antes.titulo, {
      id,
      tipo: antes.tipo,
      antes: { titulo: antes.titulo, pergunta: antes.pergunta, conteudo: antes.conteudo, fonte: antes.fonte },
    }),
  ]);
}
