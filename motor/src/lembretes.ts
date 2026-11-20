/**
 * LEMBRETES DA PROPOSTA: quando a Cecília pode mandar.
 * - Só entre 8h e 21h (horário de Brasília). Fora disso, fica para as 8h seguintes.
 * - Só enquanto a conversa é gratuita: até 23,5 h depois da última mensagem do cliente (janela de 24 h da Meta,
 *   com folga). Se o próximo horário permitido cair fora da janela, o lembrete não é mandado.
 */
const BRASILIA = -3; // sem horário de verão desde 2019
export const INICIO = 8;
export const FIM = 21;
export const JANELA_HORAS = 23.5;

/** O próximo instante permitido (agora mesmo, se já estiver entre 8h e 21h). */
export function proximoHorarioPermitido(agora: Date): Date {
  const br = new Date(agora.getTime() + BRASILIA * 3600_000);
  const h = br.getUTCHours() + br.getUTCMinutes() / 60;
  if (h >= INICIO && h < FIM) return agora;
  const alvo = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() + (h >= FIM ? 1 : 0), INICIO - BRASILIA, 0, 0));
  return alvo;
}

/** Decide o que fazer com um lembrete agora: mandar, reagendar para um horário, ou desistir (com o motivo). */
export function quandoMandar(agora: Date, ultimaDoCliente: Date): { acao: "mandar" } | { acao: "reagendar"; em: Date } | { acao: "desistir"; motivo: string } {
  const limite = ultimaDoCliente.getTime() + JANELA_HORAS * 3600_000;
  const quando = proximoHorarioPermitido(agora);
  if (quando.getTime() > limite) return { acao: "desistir", motivo: "fora da janela de 24 h (a Meta cobraria)" };
  return quando.getTime() === agora.getTime() ? { acao: "mandar" } : { acao: "reagendar", em: quando };
}

/**
 * Proposta aprovada, mas o cliente não fala há mais de 24 h: a Meta não deixa a Cecília mandar mensagem livre.
 * O recado vai para a equipe (tarefa no CRM), com o link, para alguém mandar pelo WhatsApp da empresa.
 */
export function recadoForaDaJanela(d: { numero?: string | null; link?: string | null; horas: number }): string {
  const prop = d.numero ? `A proposta ${d.numero}` : "A proposta";
  const envio = d.link
    ? `Mande este link ao cliente pelo WhatsApp da empresa: ${d.link}`
    : "Abra a proposta no CRM, use \"Enviar\" e mande o link ao cliente pelo WhatsApp da empresa.";
  return `${prop} foi aprovada, mas o cliente não fala com a Cecília há ${Math.round(d.horas)} h e o WhatsApp só deixa ela mandar mensagem até 24 h depois da última mensagem do cliente. ${envio}`;
}
