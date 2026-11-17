/**
 * NÚCLEO DO AGENTE — tipos compartilhados pelo simulador (painel) e pelo motor (WhatsApp).
 *
 * Regras deste pasta (lib/nucleo):
 *  - TypeScript "puro": sem Next, sem React, sem "@/..." (imports relativos com .ts),
 *    para rodar no painel, no Cloudflare Worker do motor e nos testes do Node.
 *  - Nada aqui lê variáveis de ambiente nem o banco: tudo chega por parâmetro.
 */

export type Papel = "cliente" | "agente" | "sistema";

export type MensagemConversa = {
  papel: Papel;
  texto: string;
  em: string; // ISO
  /** Para "agente": quem escreveu de fato (pessoa pelo painel = "humano"). */
  autor?: "agente" | "humano";
};

/** Configuração do agente (linha de agente_config) — só o que o núcleo usa. */
export type ConfigAgente = {
  nome_agente: string;
  apresentacao: string;
  tom: string;
  saudacao: string;
  instrucoes: string;
  exemplos: { situacao: string; cliente: string; agente: string }[];
  gatilhos_palavras: string[];
  gatilhos_temas: string[];
  max_msgs_sem_avanco: number;
  horario_equipe: Partial<Record<string, { inicio: string; fim: string } | null>>;
  agente_24h: boolean;
  mensagens: Partial<Record<"aviso_automatico" | "fora_horario" | "transferencia" | "erro" | "midia" | "sair_confirmacao" | "proposta_aprovada" | "retomada_aberta" | "retomada_nao_aberta", string>>;
  modelo: string;
};

export type ItemConhecimento = { titulo: string; pergunta: string | null; conteudo: string };

/** Estado da conversa guardado entre um turno e outro. */
export type EstadoConversa = {
  negocio_id: string | null;
  codigo: string | null;
  contato_id: string | null;
  telefone: string | null;
  atendimento: "agente" | "humano";
  /** O cliente pediu para não receber mais mensagens. */
  optout: boolean;
  /** Dados da festa (lidos do CRM ou, no simulador, o que o agente "gravaria"). */
  evento: Record<string, unknown>;
  contato: { nome?: string | null; email?: string | null; cidade?: string | null };
  proposta: { id: string | null; numero: string | null; status: string; simulada: boolean; total: number | null; preco_pendente: boolean | null } | null;
  /** Mensagens do cliente seguidas sem nenhum dado novo da festa. */
  msgs_sem_avanco: number;
  /** O aviso de atendimento automático já foi enviado nesta conversa. */
  avisou_automatico: boolean;
  /** Valores em reais que o CRM informou nesta conversa (o agente só pode citar estes). */
  valores_do_crm: number[];
  transferido_motivo: string | null;
  /** Proposta (id) sobre a qual a Cecília já perguntou o que o cliente quer mudar. */
  mudanca_perguntada?: string | null;
  /** Última data (e horário) que a agenda mostrou sem vaga. */
  agenda_cheia?: string | null;
  /** Data sem vaga para a qual a Cecília já perguntou se o cliente tem outra opção. */
  alternativa_perguntada?: string | null;
};

export const estadoInicial = (parcial: Partial<EstadoConversa> = {}): EstadoConversa => ({
  negocio_id: null,
  codigo: null,
  contato_id: null,
  telefone: null,
  atendimento: "agente",
  optout: false,
  evento: {},
  contato: {},
  proposta: null,
  msgs_sem_avanco: 0,
  avisou_automatico: false,
  valores_do_crm: [],
  transferido_motivo: null,
  ...parcial,
});

/** Uma consulta ou gravação feita durante o turno (para a tela "por que respondeu"). */
export type PassoRastro = {
  tipo: "ferramenta" | "regra" | "filtro" | "aviso";
  nome: string;
  /** Ferramenta: "leitura" (CRM de verdade), "gravacao" (feita no CRM), "simulada" (só mostrada). */
  efeito?: "leitura" | "gravacao" | "simulada" | "nenhum";
  argumentos?: unknown;
  resultado?: unknown;
  detalhe?: string;
  erro?: string;
};

export type UsoModelo = { modelo: string; entrada: number; cache: number; saida: number; custo_usd: number | null; chamadas: number };

export type ResultadoTurno = {
  /** Mensagens a enviar ao cliente (vazio = não responde). */
  respostas: string[];
  estado: EstadoConversa;
  rastro: PassoRastro[];
  uso: UsoModelo;
  /** Por que não respondeu (quando respostas está vazio). */
  silencio?: string;
};
