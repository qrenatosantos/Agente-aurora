/**
 * Tipos das tabelas e funções do banco do agente (supabase/schema.sql), no formato do
 * `supabase gen types`. Ao mudar o schema, atualize aqui também.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Tabela<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type PerfilLinha = {
  id: string;
  user_id: string | null;
  email: string;
  nome: string;
  papel: "gestor" | "atendente";
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type Exemplo = { situacao: string; cliente: string; agente: string };

/** Horário da equipe: chave = dia da semana (0 = domingo … 6 = sábado). */
export type HorarioEquipe = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { inicio: string; fim: string } | null>>;

export type MensagensPadrao = Partial<
  Record<"aviso_automatico" | "fora_horario" | "transferencia" | "erro" | "midia" | "sair_confirmacao", string>
>;

export type AgenteConfigLinha = {
  id: string;
  unica: boolean;
  nome_agente: string;
  apresentacao: string;
  tom: string;
  saudacao: string;
  instrucoes: string;
  exemplos: Exemplo[];
  gatilhos_palavras: string[];
  gatilhos_temas: string[];
  max_msgs_sem_avanco: number;
  horario_equipe: HorarioEquipe;
  agente_24h: boolean;
  mensagens: MensagensPadrao;
  espera_segundos: number;
  transcrever_audio: boolean;
  modelo: string;
  limite_mensal_usd: number;
  alerta_pct: number;
  parar_no_limite: boolean;
  versao: number;
  created_at: string;
  updated_at: string;
};

export type ConfigVersaoLinha = {
  id: number;
  numero: number;
  dados: Partial<AgenteConfigLinha>;
  campos: string[];
  descricao: string | null;
  autor_id: string | null;
  autor_nome: string;
  created_at: string;
};

export type TipoConhecimento = "pergunta" | "texto" | "arquivo" | "site";

export type ConhecimentoLinha = {
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

export type ResultadoTeste = { ok: boolean; em?: string; mensagem?: string; detalhes?: Json };

export type IntegracoesLinha = {
  id: string;
  unica: boolean;
  crm_url: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_numero: string | null;
  whatsapp_graph_versao: string;
  teste_crm: ResultadoTeste | null;
  teste_openai: ResultadoTeste | null;
  teste_whatsapp: ResultadoTeste | null;
  created_at: string;
  updated_at: string;
};

export type NomeSegredo =
  | "crm_chave"
  | "crm_segredo_avisos"
  | "openai_chave"
  | "whatsapp_token"
  | "whatsapp_app_secret"
  | "whatsapp_verify_token";

export type SituacaoSegredo = { nome: NomeSegredo; final: string | null; atualizado_em: string; atualizado_por: string | null };

export type OperacaoLinha = {
  id: string;
  unica: boolean;
  pausado: boolean;
  pausado_em: string | null;
  pausado_por: string | null;
  motivo: string | null;
  updated_at: string;
};

export type RegistroLinha = {
  id: number;
  created_at: string;
  ator_tipo: "humano" | "agente" | "sistema";
  ator_id: string | null;
  ator_nome: string;
  acao: string;
  alvo: string | null;
  detalhes: Record<string, Json>;
};

export type MensagemSimulacao = {
  papel: "cliente" | "agente" | "sistema";
  texto: string;
  em: string;
  rastro?: import("./nucleo/tipos.ts").PassoRastro[];
  uso?: import("./nucleo/tipos.ts").UsoModelo;
};

export type SimulacaoLinha = {
  id: string;
  criado_por: string | null;
  criado_por_nome: string;
  titulo: string;
  modelo: string;
  gravar_crm: boolean;
  mensagens: MensagemSimulacao[];
  estado: import("./nucleo/tipos.ts").EstadoConversa;
  custo_usd: number;
  tokens: number;
  created_at: string;
  updated_at: string;
};

export type UsoIaLinha = {
  id: number;
  created_at: string;
  origem: "simulador" | "agente" | "teste";
  modelo: string;
  entrada: number;
  cache: number;
  saida: number;
  custo_usd: number;
  simulacao_id: string | null;
  ator_id: string | null;
};

export type Database = {
  public: {
    Tables: {
      perfis: Tabela<PerfilLinha>;
      agente_config: Tabela<AgenteConfigLinha>;
      config_versoes: Tabela<ConfigVersaoLinha>;
      conhecimento: Tabela<ConhecimentoLinha>;
      integracoes: Tabela<IntegracoesLinha>;
      operacao: Tabela<OperacaoLinha>;
      registro: Tabela<RegistroLinha>;
      simulacoes: Tabela<SimulacaoLinha>;
      uso_ia: Tabela<UsoIaLinha>;
    };
    Views: { [_ in never]: never };
    Functions: {
      meu_perfil: { Args: Record<string, never>; Returns: Json };
      sou_gestor: { Args: Record<string, never>; Returns: boolean };
      restaurar_versao: { Args: { p_numero: number }; Returns: number };
      alertas_texto: { Args: { p: string }; Returns: string[] };
      salvar_segredo: { Args: { p_nome: NomeSegredo; p_cifrado: string; p_final: string }; Returns: undefined };
      apagar_segredo: { Args: { p_nome: NomeSegredo }; Returns: undefined };
      situacao_segredos: { Args: Record<string, never>; Returns: SituacaoSegredo[] };
      segredo_cifrado: { Args: { p_nome: NomeSegredo }; Returns: string | null };
      gravar_teste_integracao: { Args: { p_servico: "crm" | "openai" | "whatsapp"; p_resultado: Json }; Returns: undefined };
      pausar_agente: { Args: { p_motivo?: string | null }; Returns: undefined };
      retomar_agente: { Args: Record<string, never>; Returns: undefined };
      registrar_uso_ia: {
        Args: { p_origem: "simulador" | "teste"; p_modelo: string; p_entrada: number; p_cache: number; p_saida: number; p_custo: number; p_simulacao?: string | null };
        Returns: undefined;
      };
      gasto_mes_usd: { Args: Record<string, never>; Returns: number };
      endereco_crm: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Perfil = PerfilLinha;
export type AgenteConfig = AgenteConfigLinha;
export type Conhecimento = ConhecimentoLinha;
