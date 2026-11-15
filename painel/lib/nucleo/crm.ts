/**
 * Cliente da API do CRM (docs/API-DO-AGENTE.md do CRM). Só fetch, sem bibliotecas.
 * Resposta: { status, dados } ou { status, erro: { codigo, mensagem } }.
 */
export type RespostaCrm<T = unknown> = { status: number; dados?: T; erro?: { codigo: string; mensagem: string } };

export class ClienteCrm {
  private readonly raiz: string;
  private readonly chave: string;
  private readonly tempoMs: number;
  constructor(endereco: string, chave: string, tempoMs = 12000) {
    this.raiz = endereco.replace(/\/+$/, "") + "/api/v1";
    this.chave = chave;
    this.tempoMs = tempoMs;
  }

  async chamar<T = unknown>(metodo: "GET" | "POST" | "PATCH" | "PUT", caminho: string, corpo?: unknown): Promise<RespostaCrm<T>> {
    try {
      const r = await fetch(this.raiz + caminho, {
        method: metodo,
        headers: { Authorization: `Bearer ${this.chave}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(this.tempoMs),
        cache: "no-store",
      });
      const json = (await r.json().catch(() => ({}))) as { dados?: T; erro?: { codigo: string; mensagem: string } };
      return { status: r.status, dados: json.dados, erro: json.erro };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 0, erro: { codigo: "rede", mensagem: /timeout|abort/i.test(msg) ? "O CRM demorou para responder." : "Não foi possível falar com o CRM." } };
    }
  }

  get = <T = unknown>(caminho: string) => this.chamar<T>("GET", caminho);
  post = <T = unknown>(caminho: string, corpo?: unknown) => this.chamar<T>("POST", caminho, corpo ?? {});
  patch = <T = unknown>(caminho: string, corpo: unknown) => this.chamar<T>("PATCH", caminho, corpo);
  put = <T = unknown>(caminho: string, corpo: unknown) => this.chamar<T>("PUT", caminho, corpo);
}

/** Formatos usados pelo agente (subconjunto do que o CRM devolve). */
export type PacoteCrm = { id: string; nome: string; slogan: string | null; descricao: string | null; drinks: { id: string; nome: string; alcoolico: boolean; descricao: string | null }[] };
export type CondicoesCrm = {
  empresa: Record<string, unknown>;
  condicoes: Record<string, number | string | null>;
  agenda: { capacidade_simultanea: number };
  precos_aprovados: boolean;
  condicoes_confirmadas: boolean;
};
export type NegocioCrm = {
  id: string;
  codigo: string;
  status: string;
  atendimento: "agente" | "humano";
  etapa: { nome: string };
  evento: Record<string, unknown> | null;
  contato: { id: string; nome: string; telefone: string | null; email: string | null; cidade: string | null } | null;
  propostas?: { id: string; numero: string; status: string; total: number; preco_pendente: boolean }[];
  tags: string[];
};

/** Celular brasileiro: devolve as duas formas (com e sem o 9 extra), só dígitos, sem o 55. */
export function variantesTelefone(tel: string): string[] {
  let d = tel.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") return [d, d.slice(0, 2) + d.slice(3)];
  if (d.length === 10 && /[6-9]/.test(d[2])) return [d.slice(0, 2) + "9" + d.slice(2), d];
  return [d];
}
