/**
 * Senhas e códigos aleatórios (Web Crypto: funciona no Cloudflare e no Node).
 *
 * - Senha: PBKDF2-SHA256 com sal aleatório. 100.000 rodadas = o máximo que o Cloudflare Workers aceita.
 * - Sessão e links: código aleatório de 32 bytes; no banco fica só o SHA-256 dele.
 */
const ITERACOES = 100_000;
const enc = new TextEncoder();

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const deB64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function derivar(senha: string, sal: Uint8Array, iteracoes: number) {
  const chave = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, chave, 256);
  return new Uint8Array(bits);
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACOES}$${b64(sal)}$${b64(await derivar(senha, sal, ITERACOES))}`;
}

/** Compara em tempo constante. Hash nulo/inválido = sempre falso (mas gasta o mesmo tempo). */
export async function conferirSenha(senha: string, hash: string | null): Promise<boolean> {
  const partes = (hash ?? "").split("$");
  const valido = partes.length === 4 && partes[0] === "pbkdf2";
  const iteracoes = valido ? Number(partes[1]) : ITERACOES;
  const sal = valido ? deB64(partes[2]) : new Uint8Array(16);
  const esperado = valido ? deB64(partes[3]) : new Uint8Array(32);
  const obtido = await derivar(senha, sal, iteracoes);
  if (obtido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < obtido.length; i++) dif |= obtido[i] ^ esperado[i];
  return valido && dif === 0;
}

/** Regras mínimas de senha (mensagem pronta ou null se estiver boa). */
export function problemaSenha(senha: string): string | null {
  if (senha.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (senha.length > 200) return "Senha longa demais.";
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return "Use letras e números na senha.";
  return null;
}

export const codigoAleatorio = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

export async function hashCodigo(codigo: string) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(codigo))));
}

/** Compara dois textos em tempo constante (ex.: código de instalação). */
export async function iguaisSeguro(a: string, b: string) {
  const [x, y] = await Promise.all([hashCodigo(a), hashCodigo(b)]);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) dif |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return dif === 0;
}
