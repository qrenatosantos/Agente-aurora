import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { TelaAuth } from "@/components/tela-auth";
import { meuCadastro } from "@/lib/banco/pessoas.ts";
import { atorAtual, banco } from "@/lib/servidor";
import { FormDuasEtapas } from "./form-duas-etapas";

export const metadata: Metadata = { title: "Confirmação em duas etapas" };

/**
 * Ligar a CONFIRMAÇÃO EM DUAS ETAPAS (código do aplicativo autenticador no celular).
 * Obrigatória para o dono da plataforma: sem ela, o painel manda para cá antes de qualquer outra tela.
 */
export default async function PaginaSeguranca() {
  await connection();
  const ator = await atorAtual();
  if (!ator) redirect("/login");
  const eu = await meuCadastro(await banco(), ator);
  return (
    <TelaAuth>
      {eu?.duas_etapas ? (
        <div className="text-center">
          <ShieldCheck className="mx-auto size-10 text-marca-forte" aria-hidden />
          <h1 className="mt-2 text-lg font-semibold text-texto">Duas etapas ligadas</h1>
          <p className="mt-1 text-sm text-texto-2">Cada login pede o código do aplicativo do seu celular.</p>
          <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-marca-forte hover:underline">
            Ir para o painel
          </Link>
        </div>
      ) : (
        <FormDuasEtapas obrigatoria={Boolean(eu?.dono)} />
      )}
    </TelaAuth>
  );
}
