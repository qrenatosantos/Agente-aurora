/**
 * CRIPTOGRAFIA DAS CHAVES das integrações (OpenAI, Meta, CRM). Puro: recebe a chave-mestra por parâmetro,
 * para servir ao painel (lib/cripto.ts) e ao motor (que lê as chaves do mesmo banco).
 *
 * - AES-GCM de 256 bits (Web Crypto). Formato guardado: "v1:<iv em base64>:<cifrado em base64>".
 * - O nome da chave entra como "dado associado": o texto cifrado de "openai_chave" não pode ser trocado de
 *   lugar com o de "whatsapp_token".
 */
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

export function chaveMestraValida(chaveB64: string | undefined) {
  try {
    return base64ParaBytes(chaveB64?.trim() ?? "").length === 32;
  } catch {
    return false;
  }
}

async function importar(chaveB64: string | undefined) {
  if (!chaveMestraValida(chaveB64)) {
    throw new Error("CHAVE_MESTRA ausente ou inválida no servidor (precisa ter 32 bytes em base64: openssl rand -base64 32).");
  }
  return crypto.subtle.importKey("raw", base64ParaBytes(chaveB64!.trim()) as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function cifrarCom(chaveB64: string | undefined, texto: string, nome: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(nome) }, await importar(chaveB64), new TextEncoder().encode(texto));
  return `${PREFIXO}:${bytesParaBase64(iv)}:${bytesParaBase64(new Uint8Array(dados))}`;
}

export async function decifrarCom(chaveB64: string | undefined, cifrado: string, nome: string): Promise<string> {
  const [versao, iv, dados] = cifrado.split(":");
  if (versao !== PREFIXO || !iv || !dados) throw new Error("Formato de chave guardada desconhecido.");
  const claro = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ParaBytes(iv) as BufferSource, additionalData: new TextEncoder().encode(nome) },
    await importar(chaveB64),
    base64ParaBytes(dados) as BufferSource,
  );
  return new TextDecoder().decode(claro);
}
