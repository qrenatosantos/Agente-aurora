/** Dias da semana e mensagens padrão da tela Transferência e horários. */
import type { HorarioEquipe, MensagensPadrao } from "@/lib/tipos";

export const DIAS: { id: keyof HorarioEquipe; nome: string }[] = [
  { id: "1", nome: "Segunda" },
  { id: "2", nome: "Terça" },
  { id: "3", nome: "Quarta" },
  { id: "4", nome: "Quinta" },
  { id: "5", nome: "Sexta" },
  { id: "6", nome: "Sábado" },
  { id: "0", nome: "Domingo" },
];

export const MENSAGENS: { id: keyof MensagensPadrao; titulo: string; ajuda: string }[] = [
  {
    id: "aviso_automatico",
    titulo: "Aviso de atendimento automático",
    ajuda: "Vai junto da primeira resposta de cada conversa (exigência da LGPD e da Meta).",
  },
  { id: "transferencia", titulo: "Ao passar para uma pessoa", ajuda: "Enviada quando o agente transfere o atendimento." },
  {
    id: "fora_horario",
    titulo: "Transferência fora do horário da equipe",
    ajuda: "Use {proximo_horario} para o sistema escrever quando a equipe volta (ex.: “segunda às 09:00”).",
  },
  { id: "midia", titulo: "Imagem, figurinha, vídeo ou arquivo", ajuda: "O agente não abre esses arquivos: responde com esta mensagem." },
  { id: "erro", titulo: "Quando algo dá errado", ajuda: "Se a IA ou o CRM ficarem fora do ar. A conversa também vai para a equipe." },
  { id: "sair_confirmacao", titulo: "Quando o cliente pede para não receber mensagens", ajuda: "Confirmação final. Depois disso o agente não escreve mais." },
];
