/**
 * AVISOS DO CRM: confere a assinatura (docs/API-DO-AGENTE.md do CRM, seção 6).
 *   X-Aurora-Assinatura: t=<segundos>,v1=<hex de HMAC-SHA256(segredo, t + "." + corpo)>
 * Recusa aviso sem assinatura certa ou com t mais antigo (ou mais novo) que 5 minutos.
 */
const enc = new TextEncoder();

export async function avisoVerdadeiro(corpo: string, cabecalho: string | null, segredo: string | null | undefined, agoraSeg = Date.now() / 1000) {
  if (!cabecalho || !segredo) return false;
  const partes = Object.fromEntries(
    cabecalho.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(partes.t);
  if (!partes.t || !partes.v1 || !Number.isFinite(t) || Math.abs(agoraSeg - t) > 300) return false;
  const chave = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(`${partes.t}.${corpo}`))), (b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = partes.v1.toLowerCase();
  if (esperado.length !== recebido.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}
