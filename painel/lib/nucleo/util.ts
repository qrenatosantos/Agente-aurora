/** Funções de texto e números usadas pelas regras do agente (puras, testadas em util.test.ts). */

/** Minúsculas e sem acento. */
export function normalizar(t: string) {
  return (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** O texto contém alguma das palavras/frases? Ignora maiúsculas, acentos e pontuação. Devolve a que bateu. */
export function contemAlguma(texto: string, lista: string[]): string | null {
  const t = ` ${normalizar(texto).replace(/[^a-z0-9]+/g, " ").trim()} `;
  for (const item of lista) {
    const p = normalizar(item).replace(/[^a-z0-9]+/g, " ").trim();
    if (p && t.includes(` ${p} `)) return item;
  }
  return null;
}

/**
 * Valores em REAIS escritos num texto: "R$ 1.600,00", "R$1600", "1.600 reais", "R$ 45".
 * Devolve os números (1600, 45). Não pega percentuais, horas nem quantidades de convidados.
 */
export function valoresEmReais(texto: string): number[] {
  const t = texto.replace(/ /g, " ");
  const achados: number[] = [];
  const num = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?`;
  const padroes = [new RegExp(String.raw`R\$\s*${num}`, "gi"), new RegExp(String.raw`${num}\s*(?:reais|real)\b`, "gi")];
  for (const re of padroes) {
    for (const m of t.matchAll(re)) {
      const inteiro = m[1].replace(/\./g, "");
      const centavos = m[2] ? m[2].padEnd(2, "0") : "00";
      const v = Number(`${inteiro}.${centavos}`);
      if (Number.isFinite(v) && !achados.some((a) => Math.abs(a - v) < 0.005)) achados.push(v);
    }
  }
  return achados;
}

/** Junta todos os números de campos com cara de dinheiro (preco, total, valor…) de uma resposta do CRM. */
export function valoresMonetarios(obj: unknown, acc: number[] = []): number[] {
  if (Array.isArray(obj)) obj.forEach((o) => valoresMonetarios(o, acc));
  else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "number" && /preco|total|valor|subtotal|entrada|saldo|taxa/i.test(k) && v > 0) acc.push(v);
      else valoresMonetarios(v, acc);
    }
  }
  return acc;
}

/** Valores citados que NÃO vieram do CRM (tolerância de 1 centavo). */
export function valoresSemBase(resposta: string, permitidos: number[]): number[] {
  return valoresEmReais(resposta).filter((v) => !permitidos.some((p) => Math.abs(p - v) < 0.01));
}

/** Pedido para não receber mais mensagens (conferido por código, antes da IA). */
const PEDIDOS_PARAR = [
  "nao quero mais receber",
  "nao me mande mais",
  "nao me mandem mais",
  "nao mande mais mensagem",
  "nao mandem mais mensagem",
  "pare de me mandar",
  "parem de me mandar",
  "para de me mandar",
  "pare de mandar mensagem",
  "parem de mandar mensagem",
  "nao quero receber mensagens",
  "me tire da lista",
  "me tira da lista",
  "descadastrar",
  "remover meu numero",
  "sair da lista",
];
export const pediuParaParar = (texto: string) => contemAlguma(texto, PEDIDOS_PARAR) !== null || /^\s*(parar|pare|sair|stop)\s*[.!]?\s*$/i.test(texto);

export function dataISO(d: Date, fuso = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Se a IA repetiu a mesma resposta duas vezes seguidas na mesma mensagem, fica uma só. */
export function removerRepeticao(texto: string) {
  const t = texto.trim();
  const meio = Math.floor(t.length / 2);
  for (let k = meio - 3; k <= meio + 3; k++) {
    if (k <= 20 || k >= t.length) continue;
    const a = t.slice(0, k).trim();
    const b = t.slice(k).trim();
    if (a === b) return a;
  }
  return t;
}
