"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, mensagemErroBanco, sucesso } from "@/lib/acoes";
import { exigirGestor } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import type { HorarioEquipe, MensagensPadrao } from "@/lib/tipos";
import { DIAS, MENSAGENS } from "./textos";

const linhas = (maxItens: number, maxTam: number, rotulo: string) =>
  z
    .string()
    .optional()
    .transform((v) =>
      Array.from(new Set((v ?? "").split("\n").map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean))),
    )
    .refine((l) => l.length <= maxItens, `${rotulo}: máximo de ${maxItens} linhas.`)
    .refine((l) => l.every((x) => x.length <= maxTam), `${rotulo}: cada linha pode ter até ${maxTam} caracteres.`);

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function salvarTransferencia(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);

  const base = z
    .object({
      gatilhos_palavras: linhas(100, 80, "Palavras"),
      gatilhos_temas: linhas(50, 200, "Temas"),
      max_msgs_sem_avanco: z.coerce.number().int().min(3, "Mínimo de 3.").max(50, "Máximo de 50."),
      agente_24h: z.enum(["sim", "nao"]).transform((v) => v === "sim"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!base.success) return falha("Confira os campos destacados.", errosDoZod(base.error));

  const erros: Record<string, string> = {};
  const horario: HorarioEquipe = {};
  for (const d of DIAS) {
    const aberto = formData.get(`dia-${d.id}-aberto`) === "sim";
    const inicio = String(formData.get(`dia-${d.id}-inicio`) ?? "");
    const fim = String(formData.get(`dia-${d.id}-fim`) ?? "");
    if (!aberto) {
      horario[d.id] = null;
      continue;
    }
    if (!HORA.test(inicio) || !HORA.test(fim)) erros[`dia-${d.id}`] = `${d.nome}: informe início e fim (HH:MM).`;
    else if (fim <= inicio) erros[`dia-${d.id}`] = `${d.nome}: o fim precisa ser depois do início.`;
    else horario[d.id] = { inicio, fim };
  }

  const mensagens: MensagensPadrao = {};
  for (const m of MENSAGENS) {
    const v = String(formData.get(`msg-${m.id}`) ?? "").replace(/\r\n/g, "\n").trim();
    if (v.length > 1000) erros[`msg-${m.id}`] = "Máximo de 1.000 caracteres.";
    else if (!v) erros[`msg-${m.id}`] = "Escreva a mensagem.";
    else mensagens[m.id] = v;
  }
  if (Object.keys(erros).length) return falha("Confira os campos destacados.", erros);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agente_config")
    .update({ ...base.data, horario_equipe: horario, mensagens })
    .eq("unica", true)
    .select("versao")
    .maybeSingle();
  if (error) return falha(mensagemErroBanco(error));
  if (!data) return falha("Sem permissão para alterar a configuração.");

  revalidatePath("/transferencia");
  revalidatePath("/registro");
  return sucesso(`Salvo. Esta é a versão ${data.versao} da configuração.`);
}
