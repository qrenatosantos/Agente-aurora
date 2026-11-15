import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { chaveMestraConfigurada } from "@/lib/cripto";
import { obterConfigAgente } from "@/lib/dados";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { lerIntegracoes, situacaoSegredos } from "@/lib/banco/integracoes.ts";
import { atorAtual, banco } from "@/lib/servidor";
import type { NomeSegredo, SituacaoSegredo } from "@/lib/tipos";
import { CartaoCrm, CartaoOpenAI, CartaoWhatsApp } from "./cartoes";

export const metadata: Metadata = { title: "Integrações" };

export default async function PaginaIntegracoes() {
  const { perfil } = await obterPerfil();
  if (!ehGestor(perfil)) redirect("/");

  const db = await banco();
  const ator = await atorAtual();
  const [integ, segredos, { config }] = await Promise.all([
    lerIntegracoes(db, ator).catch(() => null),
    situacaoSegredos(db, ator).catch(() => []),
    obterConfigAgente(),
  ]);
  const error = !integ;
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
          Não foi possível ler as integrações. Confira se o banco do painel foi criado (veja o README).
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
