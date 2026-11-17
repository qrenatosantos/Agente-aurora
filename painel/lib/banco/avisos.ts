/**
 * AVISOS DO CRM (webhooks). Gravados pelo motor, sem pessoa logada; só o gestor lê no painel.
 * O id é o do próprio CRM: aviso repetido (o CRM reenvia se não receber 2xx) não entra de novo.
 */
import { type Ator, type Banco, converter, ErroRegra, exigirGestor, registrar } from "./base.ts";

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

// ------------------------------------------------------------------ pedido ↔ conversa do WhatsApp (uso do motor)
export async function ligarConversaInterno(db: Banco, d: { negocioId: string; conversa: string; telefone: string; ultimaDoCliente: string | null }) {
  await db
    .prepare(
      `insert into conversas_whatsapp (negocio_id, conversa, telefone, ultima_do_cliente, atualizado_em) values (?, ?, ?, ?, ?)
       on conflict (negocio_id) do update set conversa = excluded.conversa, telefone = excluded.telefone,
         ultima_do_cliente = coalesce(excluded.ultima_do_cliente, conversas_whatsapp.ultima_do_cliente), atualizado_em = excluded.atualizado_em`,
    )
    .bind(d.negocioId, d.conversa, d.telefone, d.ultimaDoCliente, new Date().toISOString())
    .run();
}

export async function conversaDoNegocioInterno(db: Banco, negocioId: string) {
  return db.prepare("select conversa, telefone, ultima_do_cliente from conversas_whatsapp where negocio_id = ?").bind(negocioId).first<{ conversa: string; telefone: string; ultima_do_cliente: string | null }>();
}

export async function marcarAvisoProcessadoInterno(db: Banco, id: number, resultado: string) {
  await db
    .prepare("update avisos_crm set processado_em = ?, dados = json_set(dados, '$._resultado', ?) where id = ?")
    .bind(new Date().toISOString(), resultado.slice(0, 300), id)
    .run();
}

export type ConversaWhatsApp = { conversa: string; telefone: string; ultima_do_cliente: string | null; pedidos: number };

/** Conversas do WhatsApp que o agente já atendeu (uma linha por telefone). Só o gestor. */
export async function listarConversasWhatsApp(db: Banco, ator: Ator): Promise<ConversaWhatsApp[]> {
  exigirGestor(ator, "Só o gestor vê as conversas do WhatsApp.");
  const r = await db
    .prepare(
      `select conversa, max(telefone) telefone, max(ultima_do_cliente) ultima_do_cliente, count(*) pedidos
       from conversas_whatsapp group by conversa order by max(atualizado_em) desc limit 100`,
    )
    .all<ConversaWhatsApp>();
  return r.results ?? [];
}

/**
 * Zera uma conversa do WhatsApp (para testar de novo do zero): esquece a ligação com os pedidos do CRM.
 * A memória da conversa no motor é apagada pela ação da tela. O CRM não é tocado. Só o gestor.
 */
export async function zerarConversaWhatsApp(db: Banco, ator: Ator, conversa: string): Promise<number> {
  exigirGestor(ator, "Só o gestor zera conversas do WhatsApp.");
  if (!/^wa-\d{8,15}$/.test(conversa)) throw new ErroRegra("Conversa inválida.");
  const r = await db.prepare("delete from conversas_whatsapp where conversa = ?").bind(conversa).run();
  await registrar(db, ator, "whatsapp.zerou", conversa, { pedidos_desligados: r.meta.changes }).run();
  return r.meta.changes;
}
