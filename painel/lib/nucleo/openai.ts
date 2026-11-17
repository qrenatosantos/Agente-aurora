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
 * Fontes: developers.openai.com/api/docs/pricing e help.openai.com/en/articles/20001415 (11/2026).
 * Sem preço de cache publicado → conta como entrada normal (estimativa para mais).
 */
export const PRECOS: Record<string, { entrada: number; cache: number; saida: number }> = {
  "gpt-4o-mini": { entrada: 0.15, cache: 0.075, saida: 0.6 },
  "gpt-6-luna": { entrada: 0.1, cache: 0.01, saida: 0.5 },
  "gpt-5.4-nano": { entrada: 0.2, cache: 0.02, saida: 1.25 },
  "gpt-6.1-terra": { entrada: 1, cache: 0.05, saida: 5 },
  "gpt-6.1-sol": { entrada: 2, cache: 0.1, saida: 10 },
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

/** Quanto a IA "pensa" antes de responder. "none" = responde direto (mais barato e rápido). */
export type Esforco = "none" | "low" | "medium" | "high";

type OpcoesChamada = {
  chave: string;
  modelo: string;
  mensagens: MensagemIA[];
  ferramentas?: DefinicaoFerramenta[];
  maxTokens?: number;
  tempoMs?: number;
  endereco?: string;
  /** Raciocínio. Com ferramentas, só a API Responses aceita raciocínio (a Chat Completions recusa). */
  esforco?: Esforco;
};

function erroAmigavel(status: number, base: string, modelo: string) {
  return status === 401
    ? "A OpenAI recusou a chave."
    : status === 429
      ? "A OpenAI recusou por limite de uso ou falta de crédito."
      : status === 404
        ? `O modelo "${modelo}" não está disponível para esta chave.`
        : `A OpenAI respondeu com erro: ${base}`;
}

async function postar(opcoes: OpcoesChamada, caminho: string, corpo: unknown) {
  try {
    return await fetch((opcoes.endereco ?? "https://api.openai.com") + caminho, {
      method: "POST",
      headers: { Authorization: `Bearer ${opcoes.chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(opcoes.tempoMs ?? 60000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ErroIA(/timeout|abort/i.test(msg) ? "A OpenAI demorou demais para responder." : "Não foi possível falar com a OpenAI.", 0);
  }
}

/**
 * API Responses (developers.openai.com/api/docs/guides/reasoning): a mesma conversa e as mesmas ferramentas,
 * convertidas para o formato dela, e a resposta convertida de volta para o formato da Chat Completions.
 * Os passos de raciocínio não são guardados (store: false) nem reenviados: cada chamada pensa de novo.
 */
async function chamarResponses(opcoes: OpcoesChamada): Promise<RespostaIA> {
  const entrada: unknown[] = [];
  for (const m of opcoes.mensagens) {
    if (m.role === "tool") entrada.push({ type: "function_call_output", call_id: m.tool_call_id, output: m.content });
    else if (m.role === "assistant") {
      if (m.content) entrada.push({ role: "assistant", content: m.content });
      for (const c of m.tool_calls ?? []) entrada.push({ type: "function_call", call_id: c.id, name: c.function.name, arguments: c.function.arguments });
    } else entrada.push({ role: m.role === "system" ? "developer" : "user", content: m.content });
  }
  const corpo: Record<string, unknown> = {
    model: opcoes.modelo,
    input: entrada,
    reasoning: { effort: opcoes.esforco },
    // o raciocínio também conta como saída: folga para pensar e ainda responder
    max_output_tokens: (opcoes.maxTokens ?? 500) + 4000,
    store: false,
  };
  if (opcoes.ferramentas?.length) {
    corpo.tools = opcoes.ferramentas.map((f) => ({ type: "function", name: f.function.name, description: f.function.description, parameters: f.function.parameters, strict: false }));
    corpo.parallel_tool_calls = false;
  }
  const r = await postar(opcoes, "/v1/responses", corpo);
  const json = (await r.json().catch(() => ({}))) as {
    output?: { type: string; content?: { type: string; text?: string }[]; call_id?: string; name?: string; arguments?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
    error?: { message?: string };
  };
  if (!r.ok || !json.output) throw new ErroIA(erroAmigavel(r.status, json.error?.message ?? `erro ${r.status}`, opcoes.modelo), r.status);
  const texto = json.output
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
  const chamadas: ChamadaFerramenta[] = json.output
    .filter((o) => o.type === "function_call")
    .map((o) => ({ id: o.call_id ?? "", type: "function", function: { name: o.name ?? "", arguments: o.arguments ?? "{}" } }));
  return {
    mensagem: { content: texto || null, ...(chamadas.length ? { tool_calls: chamadas } : {}) },
    uso: { entrada: json.usage?.input_tokens ?? 0, cache: json.usage?.input_tokens_details?.cached_tokens ?? 0, saida: json.usage?.output_tokens ?? 0 },
  };
}

export async function chamarModelo(opcoes: OpcoesChamada): Promise<RespostaIA> {
  const antigo = opcoes.modelo.startsWith("gpt-4");
  if (!antigo && opcoes.esforco && opcoes.esforco !== "none") return chamarResponses(opcoes);
  const corpo: Record<string, unknown> = {
    model: opcoes.modelo,
    messages: opcoes.mensagens,
    max_completion_tokens: opcoes.maxTokens ?? 500,
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
