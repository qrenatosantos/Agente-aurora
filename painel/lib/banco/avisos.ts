/**
 * AVISOS DO CRM (webhooks). Gravados pelo motor, sem pessoa logada; só o gestor lê no painel.
 * O id é o do próprio CRM: aviso repetido (o CRM reenvia se não receber 2xx) não entra de novo.
 */
import { type Ator, type Banco, converter, exigirGestor } from "./base.ts";

export type AvisoCrm = {
  id: number;
  tipo: string;
  criado_em?: string | null;
  negocio_id?: string | null;
  proposta_id?: string | null;
  contato_id?: string | null;
  dados?: Record<string, unknown> | null;
};

/** Guarda o aviso. Devolve true se é novo, false se já tinha chegado. */
export async function guardarAvisoInterno(db: Banco, a: AvisoCrm): Promise<boolean> {
  if (!Number.isInteger(a.id) || a.id <= 0 || typeof a.tipo !== "string" || !a.tipo) throw new Error("Aviso sem id ou tipo.");
  const r = await db
    .prepare("insert or ignore into avisos_crm (id, tipo, negocio_id, proposta_id, contato_id, dados, criado_em) values (?, ?, ?, ?, ?, ?, ?)")
    .bind(a.id, a.tipo.slice(0, 60), a.negocio_id ?? null, a.proposta_id ?? null, a.contato_id ?? null, JSON.stringify(a.dados ?? {}), a.criado_em ?? null)
    .run();
  return r.meta.changes === 1;
}

export type LinhaAviso = Required<Omit<AvisoCrm, "dados">> & { dados: Record<string, unknown>; recebido_em: string; processado_em: string | null };

export async function listarAvisos(db: Banco, ator: Ator, limite = 50): Promise<LinhaAviso[]> {
  exigirGestor(ator, "Só o gestor vê os avisos do CRM.");
  const r = await db.prepare("select * from avisos_crm order by id desc limit ?").bind(Math.min(Math.max(limite, 1), 200)).all();
  return r.results.map((x) => converter<LinhaAviso>(x, [], ["dados"])!);
}
