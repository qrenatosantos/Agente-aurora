/**
 * WHATSAPP (Meta Cloud API), só com fetch.
 *
 * - assinaturaValida: confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo com o App Secret).
 *   Sem assinatura certa, o aviso é ignorado.
 * - lerMensagens: tira do aviso da Meta só o que interessa (mensagens recebidas).
 * - ClienteWhatsApp: enviar texto, mostrar "digitando" (marca como lida) e baixar mídia (áudio).
 * Referência: developers.facebook.com/docs/whatsapp/cloud-api (webhooks, messages, media).
 */

const enc = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compara em tempo constante (não dá pistas a quem tenta adivinhar a assinatura). */
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function assinaturaValida(corpo: string, cabecalho: string | null, appSecret: string | null | undefined) {
  if (!cabecalho || !appSecret || !cabecalho.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = "sha256=" + hex(await crypto.subtle.sign("HMAC", chave, enc.encode(corpo)));
  return iguais(esperado, cabecalho.trim().toLowerCase());
}

export type MensagemRecebida = {
  /** id da mensagem na Meta ("wamid..."): usado para não processar a mesma duas vezes */
  wamid: string;
  /** número de quem mandou, só dígitos, com o 55 (como a Meta entrega) */
  de: string;
  nome: string | null;
  /** número da empresa que recebeu (para conferir que é o nosso) */
  phoneNumberId: string;
  tipo: "texto" | "audio" | "midia" | "botao" | "outro";
  texto: string | null;
  midiaId: string | null;
  /** ISO */
  em: string;
};

type AvisoMeta = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string };
          voice?: { id?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
};

/** Mensagens recebidas num aviso da Meta (ignora confirmações de entrega e leitura). */
export function lerMensagens(json: unknown): MensagemRecebida[] {
  const aviso = json as AvisoMeta;
  if (aviso?.object !== "whatsapp_business_account") return [];
  const r: MensagemRecebida[] = [];
  for (const e of aviso.entry ?? []) {
    for (const c of e.changes ?? []) {
      if (c.field !== "messages" || !c.value) continue;
      const v = c.value;
      const nomes = new Map((v.contacts ?? []).map((x) => [x.wa_id ?? "", x.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        if (!m.id || !m.from) continue;
        const de = m.from.replace(/\D/g, "");
        let tipo: MensagemRecebida["tipo"] = "outro";
        let texto: string | null = null;
        let midiaId: string | null = null;
        if (m.type === "text") (tipo = "texto"), (texto = m.text?.body ?? "");
        else if (m.type === "audio" || m.type === "voice") (tipo = "audio"), (midiaId = m.audio?.id ?? m.voice?.id ?? null);
        else if (m.type === "button") (tipo = "botao"), (texto = m.button?.text ?? "");
        else if (m.type === "interactive") (tipo = "botao"), (texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "");
        else if (["image", "video", "document", "sticker", "location", "contacts"].includes(m.type ?? "")) tipo = "midia";
        const ts = Number(m.timestamp);
        r.push({
          wamid: m.id,
          de,
          nome: nomes.get(m.from) ?? null,
          phoneNumberId: v.metadata?.phone_number_id ?? "",
          tipo,
          texto,
          midiaId,
          em: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
        });
      }
    }
  }
  return r;
}

export class ErroWhatsApp extends Error {
  readonly status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

export class ClienteWhatsApp {
  private readonly raiz: string;
  private readonly token: string;
  private readonly phoneNumberId: string;
  constructor(token: string, phoneNumberId: string, versao = "v23.0", base = "https://graph.facebook.com") {
    this.token = token;
    this.phoneNumberId = phoneNumberId;
    this.raiz = `${base.replace(/\/+$/, "")}/${versao}`;
  }

  private async post(caminho: string, corpo: unknown) {
    const r = await fetch(`${this.raiz}/${caminho}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number }; messages?: { id: string }[] };
    if (!r.ok) throw new ErroWhatsApp(json.error?.message ?? `A Meta respondeu ${r.status}.`, r.status);
    return json;
  }

  /** Envia um texto. Devolve o id da mensagem enviada. */
  async enviarTexto(para: string, texto: string) {
    const j = await this.post(`${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: para,
      type: "text",
      text: { body: texto.slice(0, 4096), preview_url: true },
    });
    return j.messages?.[0]?.id ?? null;
  }

  /** Marca a mensagem do cliente como lida e mostra "digitando…" (some ao responder ou após ~25 s). */
  async digitando(wamid: string) {
    await this.post(`${this.phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: wamid, typing_indicator: { type: "text" } });
  }

  /** Baixa uma mídia (ex.: áudio) pelo id. */
  async baixarMidia(midiaId: string): Promise<{ dados: ArrayBuffer; tipo: string }> {
    const info = await fetch(`${this.raiz}/${midiaId}`, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(15000) });
    const j = (await info.json().catch(() => ({}))) as { url?: string; mime_type?: string };
    if (!info.ok || !j.url) throw new ErroWhatsApp("Não foi possível achar o áudio na Meta.", info.status);
    const arq = await fetch(j.url, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(30000) });
    if (!arq.ok) throw new ErroWhatsApp("Não foi possível baixar o áudio.", arq.status);
    return { dados: await arq.arrayBuffer(), tipo: j.mime_type ?? "audio/ogg" };
  }
}

/** Transcreve um áudio com a OpenAI. O arquivo não é guardado: só o texto segue. */
export async function transcrever(audio: { dados: ArrayBuffer; tipo: string }, chave: string, base = "https://api.openai.com", modelo = "gpt-transcribe") {
  const form = new FormData();
  form.append("file", new Blob([audio.dados], { type: audio.tipo }), audio.tipo.includes("mpeg") ? "audio.mp3" : "audio.ogg");
  form.append("model", modelo);
  form.append("language", "pt");
  const r = await fetch(`${base.replace(/\/+$/, "")}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
    signal: AbortSignal.timeout(45000),
  });
  const j = (await r.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message ?? `Transcrição falhou (${r.status}).`);
  return (j.text ?? "").trim();
}
