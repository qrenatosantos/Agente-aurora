"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, mensagemErroBanco, sucesso } from "@/lib/acoes";
import { exigirGestor } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import { ehUuid } from "@/lib/validacao";

const esquema = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(2, "Informe o nome.").max(80, "Máximo de 80 caracteres."),
  email: z.email("Informe um e-mail válido.").transform((v) => v.trim().toLowerCase()),
  papel: z.enum(["gestor", "atendente"], "Escolha o papel."),
  ativo: z.enum(["sim", "nao"]).transform((v) => v === "sim"),
});

export async function salvarPessoa(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  const d = esquema.safeParse(Object.fromEntries(formData));
  if (!d.success) return falha("Confira os campos destacados.", errosDoZod(d.error));
  const { id, ...dados } = d.data;
  const supabase = await createClient();
  if (id && ehUuid(id)) {
    // o e-mail não muda depois do cadastro (o login é ligado por ele)
    const { error } = await supabase.from("perfis").update({ nome: dados.nome, papel: dados.papel, ativo: dados.ativo }).eq("id", id);
    if (error) return falha(mensagemErroBanco(error));
  } else {
    const { error } = await supabase.from("perfis").insert(dados);
    if (error) {
      if (error.code === "23505") return falha("Já existe uma pessoa com este e-mail.", { email: "E-mail já cadastrado." });
      return falha(mensagemErroBanco(error));
    }
  }
  revalidatePath("/equipe");
  return sucesso(id ? "Alterações salvas." : "Pessoa cadastrada. Crie o login dela no Supabase com o mesmo e-mail.");
}
