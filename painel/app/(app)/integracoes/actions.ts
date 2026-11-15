"use server";

/**
 * Integrações: só o gestor. Chaves digitadas são CRIPTOGRAFADAS aqui no servidor antes de ir
 * para o banco; campo de chave vazio = manter a que já está salva. Nenhuma chave volta para a tela.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, mensagemErroBanco, sucesso } from "@/lib/acoes";
import { chaveMestraConfigurada, cifrar, finalDaChave } from "@/lib/cripto";
import { lerSegredo, testarCrm, testarOpenAI, testarWhatsApp } from "@/lib/integracoes";
import { exigirGestor } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import type { Json, NomeSegredo, ResultadoTeste } from "@/lib/tipos";

type Supa = Awaited<ReturnType<typeof createClient>>;

const SEM_CHAVE_MESTRA = "O servidor está sem a CHAVE_MESTRA (variável secreta). Sem ela não dá para guardar chaves com segurança. Veja o README.";

async function guardar(supabase: Supa, nome: NomeSegredo, valor: string) {
  const limpo = valor.trim();
  if (!limpo) return null;
  const { error } = await supabase.rpc("salvar_segredo", { p_nome: nome, p_cifrado: await cifrar(limpo, nome), p_final: finalDaChave(limpo) });
  return error ? mensagemErroBanco(error) : null;
}

function revalidar() {
  revalidatePath("/integracoes");
  revalidatePath("/");
}

// ---------------------------------------------------------------- CRM
const esquemaCrm = z.object({
  crm_url: z
    .string()
    .trim()
    .transform((v) => v.replace(/\/+$/, ""))
    .refine((v) => /^https?:\/\/[^\s/]+(:\d+)?$/.test(v), "Informe só o endereço do CRM, sem caminho (ex.: https://crm.aurorabartendersaraxa.com.br)."),
  crm_chave: z.string().optional().default("").refine((v) => !v.trim() || /^aur_[a-f0-9]{48}$/.test(v.trim()), "A chave do CRM começa com aur_ e tem 52 caracteres."),
  crm_segredo_avisos: z.string().optional().default("").refine((v) => v.trim().length === 0 || v.trim().length >= 16, "O segredo dos avisos parece curto demais."),
});

export async function salvarCrm(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  const d = esquemaCrm.safeParse(Object.fromEntries(formData));
  if (!d.success) return falha("Confira os campos destacados.", errosDoZod(d.error));
  if ((d.data.crm_chave.trim() || d.data.crm_segredo_avisos.trim()) && !chaveMestraConfigurada()) return falha(SEM_CHAVE_MESTRA);

  const supabase = await createClient();
  const { error } = await supabase.from("integracoes").update({ crm_url: d.data.crm_url }).eq("unica", true);
  if (error) return falha(mensagemErroBanco(error));
  for (const [nome, valor] of [["crm_chave", d.data.crm_chave], ["crm_segredo_avisos", d.data.crm_segredo_avisos]] as const) {
    const erro = await guardar(supabase, nome, valor);
    if (erro) return falha(erro);
  }
  revalidar();
  return sucesso("CRM salvo. Agora clique em “Testar conexão”.");
}

// ---------------------------------------------------------------- OpenAI
const esquemaOpenAI = z.object({
  openai_chave: z.string().optional().default("").refine((v) => !v.trim() || /^sk-[A-Za-z0-9_-]{20,}$/.test(v.trim()), "A chave da OpenAI começa com sk-."),
  modelo: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._:-]{1,79}$/, "Nome de modelo inválido."),
  limite_mensal_usd: z.coerce.number("Informe o limite em dólares.").min(1, "Mínimo de US$ 1.").max(10000, "Máximo de US$ 10.000."),
  alerta_pct: z.coerce.number().int().min(10, "Entre 10% e 100%.").max(100, "Entre 10% e 100%."),
  parar_no_limite: z.enum(["sim", "nao"]).transform((v) => v === "sim"),
});

export async function salvarOpenAI(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  const d = esquemaOpenAI.safeParse(Object.fromEntries(formData));
  if (!d.success) return falha("Confira os campos destacados.", errosDoZod(d.error));
  if (d.data.openai_chave.trim() && !chaveMestraConfigurada()) return falha(SEM_CHAVE_MESTRA);

  const supabase = await createClient();
  const { openai_chave, ...config } = d.data;
  const { error } = await supabase.from("agente_config").update(config).eq("unica", true);
  if (error) return falha(mensagemErroBanco(error));
  const erro = await guardar(supabase, "openai_chave", openai_chave);
  if (erro) return falha(erro);
  revalidar();
  revalidatePath("/registro");
  return sucesso("OpenAI salva. Agora clique em “Testar conexão”.");
}

// ---------------------------------------------------------------- WhatsApp
const id = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{5,30}$/.test(v), `${rotulo}: só números (copie do painel da Meta).`);

const esquemaWhats = z.object({
  whatsapp_phone_number_id: id("Identificação do número"),
  whatsapp_waba_id: id("Identificação da conta"),
  whatsapp_numero: z.string().trim().max(30, "Máximo de 30 caracteres.").transform((v) => v || null),
  whatsapp_graph_versao: z.string().trim().regex(/^v\d{1,3}\.\d$/, "Versão no formato v23.0."),
  whatsapp_token: z.string().optional().default("").refine((v) => !v.trim() || v.trim().length >= 30, "O token parece curto demais."),
  whatsapp_app_secret: z.string().optional().default("").refine((v) => !v.trim() || /^[a-f0-9]{32}$/i.test(v.trim()), "O segredo do app tem 32 letras e números."),
});

export async function salvarWhatsApp(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  const d = esquemaWhats.safeParse(Object.fromEntries(formData));
  if (!d.success) return falha("Confira os campos destacados.", errosDoZod(d.error));
  const { whatsapp_token, whatsapp_app_secret, ...dados } = d.data;
  if ((whatsapp_token.trim() || whatsapp_app_secret.trim()) && !chaveMestraConfigurada()) return falha(SEM_CHAVE_MESTRA);

  const supabase = await createClient();
  const { error } = await supabase.from("integracoes").update(dados).eq("unica", true);
  if (error) return falha(mensagemErroBanco(error));
  for (const [nome, valor] of [["whatsapp_token", whatsapp_token], ["whatsapp_app_secret", whatsapp_app_secret]] as const) {
    const erro = await guardar(supabase, nome, valor);
    if (erro) return falha(erro);
  }
  revalidar();
  return sucesso("WhatsApp salvo. Agora clique em “Testar conexão”.");
}

/** Gera o "token de verificação" que se cola na Meta. Aparece UMA vez. */
export async function gerarTokenVerificacao(): Promise<{ ok: true; token: string } | { ok: false; mensagem: string }> {
  const g = await exigirGestor();
  if ("erro" in g) return { ok: false, mensagem: g.erro };
  if (!chaveMestraConfigurada()) return { ok: false, mensagem: SEM_CHAVE_MESTRA };
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = "aurora_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const supabase = await createClient();
  const erro = await guardar(supabase, "whatsapp_verify_token", token);
  if (erro) return { ok: false, mensagem: erro };
  revalidar();
  return { ok: true, token };
}

export async function apagarChave(nome: NomeSegredo): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  const supabase = await createClient();
  const { error } = await supabase.rpc("apagar_segredo", { p_nome: nome });
  if (error) return falha(mensagemErroBanco(error));
  revalidar();
  return sucesso("Chave apagada.");
}

// ---------------------------------------------------------------- Testes
export async function testarConexao(servico: "crm" | "openai" | "whatsapp"): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  if (!chaveMestraConfigurada()) return falha(SEM_CHAVE_MESTRA);
  const supabase = await createClient();
  const [{ data: integ }, { data: config }] = await Promise.all([
    supabase.from("integracoes").select("*").eq("unica", true).maybeSingle(),
    supabase.from("agente_config").select("modelo").eq("unica", true).maybeSingle(),
  ]);
  if (!integ) return falha("Sem permissão.");

  let resultado: ResultadoTeste;
  try {
    if (servico === "crm") {
      const chave = await lerSegredo("crm_chave");
      resultado = !integ.crm_url || !chave ? { ok: false, mensagem: "Preencha o endereço e a chave do CRM antes de testar." } : await testarCrm(integ.crm_url, chave);
    } else if (servico === "openai") {
      const chave = await lerSegredo("openai_chave");
      resultado = !chave ? { ok: false, mensagem: "Cadastre a chave da OpenAI antes de testar." } : await testarOpenAI(chave, config?.modelo ?? "gpt-6.1-terra");
    } else {
      const token = await lerSegredo("whatsapp_token");
      resultado =
        !token || !integ.whatsapp_phone_number_id
          ? { ok: false, mensagem: "Preencha a identificação do número e o token antes de testar." }
          : await testarWhatsApp(integ.whatsapp_graph_versao, integ.whatsapp_phone_number_id, token);
    }
  } catch {
    resultado = { ok: false, mensagem: "Não foi possível abrir a chave guardada. A CHAVE_MESTRA do servidor mudou? Digite a chave de novo." };
  }

  await supabase.rpc("gravar_teste_integracao", { p_servico: servico, p_resultado: resultado as unknown as Json });
  revalidar();
  return resultado.ok ? sucesso(resultado.mensagem) : falha(resultado.mensagem ?? "Falhou.");
}
