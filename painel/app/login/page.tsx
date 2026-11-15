import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { TelaAuth } from "@/components/tela-auth";
import { precisaInstalar } from "@/lib/banco/pessoas.ts";
import { destinoSeguro } from "@/lib/rotas";
import { atorAtual, banco } from "@/lib/servidor";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection(); // sempre na hora (lê o banco), nunca uma página pronta do build
  const { next } = await searchParams; // no Next 16, searchParams é uma Promise
  if (await precisaInstalar(await banco())) redirect("/instalar");
  if (await atorAtual()) redirect(destinoSeguro(next));
  return (
    <TelaAuth>
      <FormLogin next={destinoSeguro(next)} />
    </TelaAuth>
  );
}
