import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { chaveMestraConfigurada } from "@/lib/cripto";
import { obterConfigAgente } from "@/lib/dados";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import type { NomeSegredo, SituacaoSegredo } from "@/lib/tipos";
import { CartaoCrm, CartaoOpenAI, CartaoWhatsApp } from "./cartoes";

export const metadata: Metadata = { title: "Integrações" };

export default async function PaginaIntegracoes() {
  const { perfil } = await obterPerfil();
  if (!ehGestor(perfil)) redirect("/");

  const supabase = await createClient();
  const [{ data: integ, error }, { data: segredos }, { config }] = await Promise.all([
    supabase.from("integracoes").select("*").eq("unica", true).maybeSingle(),
    supabase.rpc("situacao_segredos"),
    obterConfigAgente(),
  ]);
  const chaves = Object.fromEntries(((segredos ?? []) as SituacaoSegredo[]).map((s) => [s.nome, s])) as Partial<Record<NomeSegredo, SituacaoSegredo>>;

  return (
    <>
      <CabecalhoPagina
        titulo="Integrações"
        descricao="CRM, OpenAI e WhatsApp. As chaves ficam criptografadas e nunca aparecem de novo na tela."
      />
      {!chaveMestraConfigurada() && (
        <div role="alert" className="mb-4 rounded-xl bg-perigo-suave p-3 text-sm text-perigo">
          O servidor está sem a <b>CHAVE_MESTRA</b> (variável secreta). Enquanto ela não for cadastrada, não dá para guardar
          chaves. Quem publicou o painel precisa seguir o passo “Chave-mestra” do README.
        </div>
      )}
      {error || !integ || !config ? (
        <Cartao role="alert" className="text-sm text-perigo">
          Não foi possível ler as integrações. Confira se o arquivo <code>supabase/schema.sql</code> foi executado.
        </Cartao>
      ) : (
        <div className="space-y-6">
          <CartaoCrm integ={integ} chaves={chaves} />
          <CartaoOpenAI config={config} teste={integ.teste_openai} chaves={chaves} />
          <CartaoWhatsApp integ={integ} chaves={chaves} />
        </div>
      )}
    </>
  );
}
