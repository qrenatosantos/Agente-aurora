/**
 * Funções de texto puras (servidor e navegador).
 *
 * `alertasTexto` é a MESMA regra da função alertas_texto() do banco (supabase/schema.sql),
 * usada aqui só para mostrar o aviso enquanto o gestor digita. Quem vale é o banco.
 */

/** Minúsculas e sem acento. */
export function normalizar(t: string) {
  return (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const REGRAS: [string, RegExp[]][] = [
  ["valor em reais", [/r\$\s*\d/, /\d+(\.\d{3})*,\d{2}\s*(reais|r\$)?/, /\b\d+\s*reais\b/, /\breais\b/]],
  ["percentual", [/\d+([.,]\d+)?\s*%/, /\bpor cento\b/]],
  ["menção a preço", [/\b(preco|precos|custa|custam|custo|valor do|valor da|valores|investimento|tabela de)\b/]],
  ["desconto ou cortesia", [/\b(desconto|descontos|promocao|promocoes|cupom|cortesia|gratis|gratuito)\b/]],
  ["forma de pagamento", [/\b(entrada|sinal|parcela|parcelas|parcelado|parcelamento|a vista|pix|boleto|cartao|pagamento|saldo)\b/]],
  ["cancelamento ou multa", [/\b(multa|cancelamento|cancelar|reembolso|estorno|rescisao)\b/]],
  ["disponibilidade de data", [/\b(disponibilidade|data livre|datas livres|agenda livre|vaga|vagas|lotad[ao])\b/]],
];

export function alertasTexto(texto: string): string[] {
  const t = normalizar(texto);
  return REGRAS.filter(([, rs]) => rs.some((r) => r.test(t))).map(([nome]) => nome);
}
