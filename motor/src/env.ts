import type { Conversa } from "./conversa.ts";

export type Env = {
  Conversa: DurableObjectNamespace<Conversa>;
  /** Segredo das chamadas internas (painel → motor, e a bateria de testes). */
  SEGREDO_INTERNO: string;
  /** Só para testes locais: outro endereço para a OpenAI, sem o /v1 (ex.: http://127.0.0.1:8789). Vazio = api.openai.com. */
  OPENAI_BASE_URL?: string;
};
