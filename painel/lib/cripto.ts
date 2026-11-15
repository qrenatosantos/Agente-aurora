/**
 * CRIPTOGRAFIA DAS CHAVES das integrações (OpenAI, Meta, CRM).
 *
 * - AES-GCM de 256 bits (Web Crypto: funciona no Node e no Cloudflare Workers).
 * - A chave-mestra fica SÓ na variável secreta CHAVE_MESTRA do servidor (Cloudflare ▸ Secrets).
 *   O banco guarda apenas o texto cifrado: quem ler o banco não consegue usar as chaves.
 * - O nome da chave entra como "dado associado": um texto cifrado de "openai_chave" não pode
 *   ser trocado de lugar com o de "whatsapp_token".
 * - Formato guardado: "v1:<iv em base64>:<cifrado em base64>".
 */
import "server-only";

const PREFIXO = "v1";

function base64ParaBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesParaBase64(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function chaveMestraConfigurada() {
  try {
    return base64ParaBytes(process.env.CHAVE_MESTRA?.trim() ?? "").length === 32;
  } catch {
    return false;
  }
}

async function chaveMestra() {
  const bruta = process.env.CHAVE_MESTRA?.trim() ?? "";
  let bytes: Uint8Array;
  try {
    bytes = base64ParaBytes(bruta);
  } catch {
    bytes = new Uint8Array();
  }
  if (bytes.length !== 32) {
    throw new Error("CHAVE_MESTRA ausente ou inválida no servidor (precisa ter 32 bytes em base64: openssl rand -base64 32).");
  }
  return crypto.subtle.importKey("raw", bytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function cifrar(texto: string, nome: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(nome) },
    await chaveMestra(),
    new TextEncoder().encode(texto),
  );
  return `${PREFIXO}:${bytesParaBase64(iv)}:${bytesParaBase64(new Uint8Array(dados))}`;
}

export async function decifrar(cifrado: string, nome: string): Promise<string> {
  const [versao, iv, dados] = cifrado.split(":");
  if (versao !== PREFIXO || !iv || !dados) throw new Error("Formato de chave guardada desconhecido.");
  const claro = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ParaBytes(iv) as BufferSource, additionalData: new TextEncoder().encode(nome) },
    await chaveMestra(),
    base64ParaBytes(dados) as BufferSource,
  );
  return new TextDecoder().decode(claro);
}

/** Últimos 4 caracteres, para a pessoa reconhecer qual chave está salva. */
export const finalDaChave = (texto: string) => texto.trim().slice(-4);
