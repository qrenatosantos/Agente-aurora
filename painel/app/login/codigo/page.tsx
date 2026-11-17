import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { TelaAuth } from "@/components/tela-auth";
import { sessaoEsperandoCodigo } from "@/lib/banco/pessoas.ts";
import { destinoSeguro } from "@/lib/rotas";
import { banco, lerCookieSessao } from "@/lib/servidor";
import { FormCodigo } from "./form-codigo";

export const metadata: Metadata = { title: "Código de confirmação" };

/** 2º passo do login: o código do aplicativo autenticador (só para quem ligou as duas etapas). */
export default async function PaginaCodigo({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection();
  const { next } = await searchParams;
  const pendente = await sessaoEsperandoCodigo(await banco(), await lerCookieSessao());
  if (!pendente) redirect("/login");
  return (
    <TelaAuth>
      <FormCodigo nome={pendente.nome} next={destinoSeguro(next)} />
    </TelaAuth>
  );
}
