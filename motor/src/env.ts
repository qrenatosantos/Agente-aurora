import type { Banco } from "../../painel/lib/banco/base.ts";
import type { Conversa } from "./conversa.ts";

export type Env = {
  Conversa: DurableObjectNamespace<Conversa>;
  /** O mesmo banco D1 do painel (configuração, conhecimento, chaves cifradas, uso da IA). */
  DB: Banco;
  /** A mesma CHAVE_MESTRA do painel: abre as chaves guardadas (OpenAI, CRM, WhatsApp). */
  CHAVE_MESTRA: string;
  /** Segredo das chamadas internas (painel → motor, e a bateria de testes). */
  SEGREDO_INTERNO: string;
  /** Só para testes locais: outro endereço para a OpenAI, sem o /v1 (ex.: http://127.0.0.1:8789). Vazio = api.openai.com. */
  OPENAI_BASE_URL?: string;
  /** Só para testes locais: outro endereço para a Graph API da Meta. Vazio = graph.facebook.com. */
  GRAPH_BASE_URL?: string;
};
