/** Horário da equipe (fuso de Brasília): está aberto agora? quando volta? */
import type { ConfigAgente } from "./tipos.ts";

const FUSO = "America/Sao_Paulo";
const NOMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type Horario = ConfigAgente["horario_equipe"];

/** Dia da semana (0 = domingo) e minutos desde 00:00, no fuso de Brasília. */
function agoraLocal(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { dia, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function equipeAtendendo(h: Horario, d = new Date()) {
  const { dia, minutos } = agoraLocal(d);
  const hoje = h[String(dia)];
  return Boolean(hoje && minutos >= min(hoje.inicio) && minutos < min(hoje.fim));
}

/** "hoje às 14:00", "amanhã às 09:00", "segunda às 09:00"; null se a equipe não tem horário. */
export function proximoHorario(h: Horario, d = new Date()): string | null {
  const { dia, minutos } = agoraLocal(d);
  for (let i = 0; i < 8; i++) {
    const di = (dia + i) % 7;
    const faixa = h[String(di)];
    if (!faixa) continue;
    if (i === 0 && minutos >= min(faixa.inicio)) {
      if (minutos < min(faixa.fim)) return "agora";
      continue;
    }
    const quando = i === 0 ? "hoje" : i === 1 ? "amanhã" : NOMES[di];
    return `${quando} às ${faixa.inicio}`;
  }
  return null;
}

/** Mensagem para o cliente quando a conversa passa para uma pessoa. */
export function mensagemTransferencia(cfg: Pick<ConfigAgente, "horario_equipe" | "mensagens">, d = new Date()) {
  const padrao = cfg.mensagens.transferencia ?? "Vou chamar alguém da nossa equipe para continuar com você.";
  if (equipeAtendendo(cfg.horario_equipe, d)) return padrao;
  const prox = proximoHorario(cfg.horario_equipe, d);
  if (!prox || !cfg.mensagens.fora_horario) return padrao;
  return cfg.mensagens.fora_horario.replace(/\{proximo_horario\}/g, prox);
}
