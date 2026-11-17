/**
 * CÓDIGO DO APLICATIVO AUTENTICADOR (TOTP, RFC 6238): a "confirmação em duas etapas" do login do Estúdio.
 * Funciona com Google Authenticator, Microsoft Authenticator, Authy e similares (6 dígitos, a cada 30 s, SHA-1).
 * Puro (Web Crypto): roda no Cloudflare e nos testes do Node.
 */
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const PASSO_SEGUNDOS = 30;
export const DIGITOS = 6;

export function paraBase32(bytes: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Uint8Array<ArrayBuffer> {
  const limpo = texto.toUpperCase().replace(/[\s=-]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let valor = 0;
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error("Código secreto inválido.");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

/** Segredo novo (20 bytes = 160 bits, o recomendado), em base32. */
export const novoSegredoTotp = () => paraBase32(crypto.getRandomValues(new Uint8Array(20)));

export const passoAtual = (agoraMs = Date.now()) => Math.floor(agoraMs / 1000 / PASSO_SEGUNDOS);

/** Código de um passo (HOTP do RFC 4226). */
export async function codigoDoPasso(segredoBase32: string, passo: number, digitos = DIGITOS): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", deBase32(segredoBase32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const contador = new Uint8Array(8);
  let n = passo;
  for (let i = 7; i >= 0; i--) {
    contador[i] = n & 255;
    n = Math.floor(n / 256);
  }
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", chave, contador));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digitos).padStart(digitos, "0");
}

/**
 * Confere o código digitado aceitando o passo anterior e o seguinte (relógio do celular um pouco adiantado ou atrasado).
 * Devolve o passo que bateu (para não aceitar o mesmo código de novo) ou null.
 */
export async function conferirCodigoTotp(segredoBase32: string, digitado: string, agoraMs = Date.now()): Promise<number | null> {
  const limpo = digitado.replace(/\s/g, "");
  if (!/^\d{6}$/.test(limpo)) return null;
  const p = passoAtual(agoraMs);
  for (const passo of [p - 1, p, p + 1]) if ((await codigoDoPasso(segredoBase32, passo)) === limpo) return passo;
  return null;
}

/** Endereço que o aplicativo lê pelo QR code (otpauth://). */
export function enderecoOtpauth(segredoBase32: string, conta: string, emissor: string) {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredoBase32}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_SEGUNDOS}`;
}
