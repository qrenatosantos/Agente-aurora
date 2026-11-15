/**
 * Chamada à OpenAI (Chat Completions com ferramentas), só com fetch.
 *
 * - Modelos gpt-4*: aceitam temperature, não aceitam reasoning_effort.
 * - Modelos mais novos (gpt-5*, gpt-6*): com ferramentas no Chat Completions exigem
 *   reasoning_effort "none" (testado em 15/11/2026 com gpt-6-luna).
 * - store: false → a OpenAI não guarda a conversa para o painel dela.
 */
export type MensagemIA =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChamadaFerramenta[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChamadaFerramenta = { id: string; type: "function"; function: { name: string; arguments: string } };
export type DefinicaoFerramenta = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export type RespostaIA = {
  mensagem: { content: string | null; tool_calls?: ChamadaFerramenta[] };
  uso: { entrada: number; cache: number; saida: number };
};

/**
 * Preços em US$ por 1 milhão de tokens (entrada, entrada em cache, saída).
 * Fontes: developers.openai.com/api/docs/pricing (11/2026) e páginas de cada modelo.
 * Sem preço de cache publicado → conta como entrada normal (estimativa para mais).
 */
export const PRECOS: Record<string, { entrada: number; cache: number; saida: number }> = {
  "gpt-4o-mini": { entrada: 0.15, cache: 0.075, saida: 0.6 },
  "gpt-6-luna": { entrada: 0.1, cache: 0.1, saida: 0.5 },
  "gpt-5.4-nano": { entrada: 0.2, cache: 0.02, saida: 1.25 },
  "gpt-6.1-terra": { entrada: 1, cache: 0.05, saida: 5 },
  "gpt-6.1-sol": { entrada: 2, cache: 2, saida: 10 },
};

export function custoUsd(modelo: string, u: { entrada: number; cache: number; saida: number }): number | null {
  const p = PRECOS[modelo] ?? PRECOS[Object.keys(PRECOS).find((k) => modelo.startsWith(k + "-")) ?? ""];
  if (!p) return null;
  const semCache = Math.max(0, u.entrada - u.cache);
  return (semCache * p.entrada + u.cache * p.cache + u.saida * p.saida) / 1_000_000;
}

export class ErroIA extends Error {
  readonly status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

export async function chamarModelo(opcoes: {
  chave: string;
  modelo: string;
  mensagens: MensagemIA[];
  ferramentas?: DefinicaoFerramenta[];
  maxTokens?: number;
  tempoMs?: number;
  endereco?: string;
}): Promise<RespostaIA> {
  const antigo = opcoes.modelo.startsWith("gpt-4");
  const corpo: Record<string, unknown> = {
    model: opcoes.modelo,
    messages: opcoes.mensagens,
    max_completion_tokens: opcoes.maxTokens ?? 700,
    store: false,
    ...(antigo ? { temperature: 0.4 } : { reasoning_effort: "none" }),
  };
  if (opcoes.ferramentas?.length) {
    corpo.tools = opcoes.ferramentas;
    corpo.parallel_tool_calls = false;
  }
  let r: Response;
  try {
    r = await fetch((opcoes.endereco ?? "https://api.openai.com") + "/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${opcoes.chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(opcoes.tempoMs ?? 45000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ErroIA(/timeout|abort/i.test(msg) ? "A OpenAI demorou demais para responder." : "Não foi possível falar com a OpenAI.", 0);
  }
  const json = (await r.json().catch(() => ({}))) as {
    choices?: { message: RespostaIA["mensagem"] }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    error?: { message?: string };
  };
  if (!r.ok || !json.choices?.[0]) {
    const base = json.error?.message ?? `erro ${r.status}`;
    const amigavel =
      r.status === 401
        ? "A OpenAI recusou a chave."
        : r.status === 429
          ? "A OpenAI recusou por limite de uso ou falta de crédito."
          : r.status === 404
            ? `O modelo "${opcoes.modelo}" não está disponível para esta chave.`
            : `A OpenAI respondeu com erro: ${base}`;
    throw new ErroIA(amigavel, r.status);
  }
  return {
    mensagem: json.choices[0].message,
    uso: {
      entrada: json.usage?.prompt_tokens ?? 0,
      cache: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      saida: json.usage?.completion_tokens ?? 0,
    },
  };
}
