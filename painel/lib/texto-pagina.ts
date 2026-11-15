/**
 * Baixa uma página de site e extrai o TEXTO legível (sem menus de código, scripts e estilos),
 * para virar conhecimento do agente. Sem bibliotecas: expressões simples, suficientes para
 * páginas institucionais como a da Aurora.
 *
 * Proteções: só http(s); sem endereços internos (no Cloudflare o flag
 * global_fetch_strictly_public também bloqueia); 15 s de limite; até 2 MB de HTML.
 */
import "server-only";

const LIMITE_BYTES = 2 * 1024 * 1024;

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodificarEntidades(t: string) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

export function htmlParaTexto(html: string) {
  const tituloBruto = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  let corpo = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  corpo = corpo
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr|dd|dt|blockquote|summary|details|figcaption)>/gi, "\n")
    .replace(/<(li)[^>]*>/gi, "\n• ")
    .replace(/<(h[1-6])[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");
  const texto = decodificarEntidades(corpo)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { titulo: decodificarEntidades(tituloBruto).replace(/\s+/g, " ").trim(), texto };
}

function enderecoInterno(host: string) {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h.startsWith("[")
  );
}

export async function textoDaPagina(
  endereco: string,
): Promise<{ ok: true; titulo: string; texto: string } | { ok: false; mensagem: string }> {
  let url: URL;
  try {
    url = new URL(endereco.trim());
  } catch {
    return { ok: false, mensagem: "Endereço inválido. Use o endereço completo, começando com https://" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, mensagem: "Use um endereço http:// ou https://" };
  if (enderecoInterno(url.hostname)) return { ok: false, mensagem: "Esse endereço não é de um site público." };

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "AuroraAgente/1.0 (importar conhecimento)", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, mensagem: `O site respondeu com erro ${r.status}.` };
    const tipo = r.headers.get("content-type") ?? "";
    if (!/text\/html|xhtml/.test(tipo)) return { ok: false, mensagem: "Esse endereço não é uma página de texto (HTML)." };
    const corpo = await r.arrayBuffer();
    if (corpo.byteLength > LIMITE_BYTES) return { ok: false, mensagem: "Página grande demais (mais de 2 MB)." };
    const { titulo, texto } = htmlParaTexto(new TextDecoder("utf-8").decode(corpo));
    if (texto.length < 20) return { ok: false, mensagem: "Não encontrei texto nessa página." };
    return { ok: true, titulo: titulo.slice(0, 200) || url.hostname, texto: texto.slice(0, 60000) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout|aborted/i.test(msg)) return { ok: false, mensagem: "O site demorou demais para responder." };
    return { ok: false, mensagem: "Não foi possível abrir o site agora." };
  }
}
