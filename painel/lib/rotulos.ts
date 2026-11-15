/** Nomes amigáveis para campos da configuração e ações do registro. */
export const CAMPOS_CONFIG: Record<string, string> = {
  nome_agente: "Nome do agente",
  apresentacao: "Apresentação",
  tom: "Tom de voz",
  saudacao: "Saudação",
  instrucoes: "Instruções",
  exemplos: "Exemplos",
  gatilhos_palavras: "Gatilhos (palavras)",
  gatilhos_temas: "Gatilhos (temas)",
  max_msgs_sem_avanco: "Mensagens sem avanço",
  horario_equipe: "Horário da equipe",
  agente_24h: "Atende 24 horas",
  mensagens: "Mensagens padrão",
  espera_segundos: "Espera antes de responder",
  transcrever_audio: "Ouvir áudios",
  modelo: "Modelo da OpenAI",
  limite_mensal_usd: "Limite de gasto",
  alerta_pct: "Alerta de gasto",
  parar_no_limite: "Parar no limite",
};

export const ACOES_REGISTRO: Record<string, string> = {
  "config.alterou": "Alterou a configuração",
  "conhecimento.incluiu": "Incluiu conhecimento",
  "conhecimento.alterou": "Alterou conhecimento",
  "conhecimento.excluiu": "Excluiu conhecimento",
  "conhecimento.ativou": "Voltou a usar conhecimento",
  "conhecimento.desativou": "Deixou de usar conhecimento",
  "equipe.incluiu": "Cadastrou pessoa",
  "equipe.alterou": "Alterou pessoa",
  "equipe.removeu": "Removeu pessoa",
  "integracoes.alterou": "Alterou integrações",
  "integracoes.testou": "Testou conexão",
  "segredo.alterou": "Trocou uma chave",
  "segredo.apagou": "Apagou uma chave",
  "agente.pausou": "PAUSOU o agente",
  "agente.retomou": "Religou o agente",
};

export const NOMES_SEGREDOS: Record<string, string> = {
  crm_chave: "chave do CRM",
  crm_segredo_avisos: "segredo dos avisos do CRM",
  openai_chave: "chave da OpenAI",
  whatsapp_token: "token do WhatsApp",
  whatsapp_app_secret: "segredo do app da Meta",
  whatsapp_verify_token: "token de verificação do webhook",
};

export const nomesCampos = (campos: string[]) => campos.map((c) => CAMPOS_CONFIG[c] ?? c).join(", ");
