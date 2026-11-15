import type { Metadata } from "next";
import { AvisoSoGestor } from "@/components/aviso-so-gestor";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { listarConhecimento } from "@/lib/banco/conhecimento.ts";
import { atorAtual, banco } from "@/lib/servidor";
import { ListaConhecimento } from "./lista";

export const metadata: Metadata = { title: "Conhecimento" };

export default async function PaginaConhecimento() {
  const { perfil } = await obterPerfil();
  const data = await listarConhecimento(await banco(), await atorAtual()).catch(() => null);
  const error = data === null;
  const gestor = ehGestor(perfil);
  return (
    <>
      <CabecalhoPagina
        titulo="Conhecimento"
        descricao="O que o agente consulta para tirar dúvidas: perguntas e respostas, textos, PDFs e páginas do site."
      />
      {!gestor && <AvisoSoGestor />}
      <div className="mb-4 rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
        <b>Preço, condição de pagamento, desconto e disponibilidade de data NÃO entram aqui</b>: o agente só pode informar o que vem
        do CRM. O sistema marca com um alerta os textos que parecem falar disso, para você revisar.
      </div>
      {error ? (
        <Cartao role="alert" className="text-sm text-perigo">
          Não foi possível ler o conhecimento. Confira se o banco do painel foi criado (veja o README).
        </Cartao>
      ) : (
        <ListaConhecimento itens={data ?? []} podeEditar={gestor} />
      )}
    </>
  );
}
