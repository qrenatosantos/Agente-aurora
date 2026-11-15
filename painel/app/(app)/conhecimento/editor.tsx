"use client";

import { AlertTriangle, FileUp, Globe, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";
import { Selo } from "@/components/ui/cartao";
import { Segmentado } from "@/components/ui/controles";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { PDF_TAMANHO_MAX, textoDoPdf } from "@/lib/ler-pdf";
import { alertasTexto } from "@/lib/texto";
import type { Conhecimento, TipoConhecimento } from "@/lib/tipos";
import { useAcao } from "@/lib/use-acao";
import { buscarPagina, salvarConhecimento } from "./actions";

const OPCOES: { valor: TipoConhecimento; rotulo: string }[] = [
  { valor: "pergunta", rotulo: "Pergunta" },
  { valor: "texto", rotulo: "Texto" },
  { valor: "arquivo", rotulo: "PDF" },
  { valor: "site", rotulo: "Site" },
];

export function EditorConhecimento({ item, aoFechar }: { item: Conhecimento | null; aoFechar: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, erros, pendente } = useAcao(salvarConhecimento, { aoSucesso: aoFechar });
  const [tipo, setTipo] = useState<TipoConhecimento>(item?.tipo ?? "pergunta");
  const [titulo, setTitulo] = useState(item?.titulo ?? "");
  const [pergunta, setPergunta] = useState(item?.pergunta ?? "");
  const [conteudo, setConteudo] = useState(item?.conteudo ?? "");
  const [fonte, setFonte] = useState(item?.fonte ?? "");
  const [lendo, iniciarLeitura] = useTransition();
  const toast = useToast();

  const alertas = alertasTexto(`${pergunta}\n${titulo}\n${conteudo}`);

  function lerPdf(arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf") return toast.erro("Escolha um arquivo PDF.");
    if (arquivo.size > PDF_TAMANHO_MAX) return toast.erro("PDF grande demais (máximo de 25 MB).");
    iniciarLeitura(async () => {
      try {
        const texto = await textoDoPdf(arquivo);
        if (texto.length < 20) {
          toast.erro("Não encontrei texto neste PDF (pode ser uma imagem escaneada). Copie o texto à mão.");
          return;
        }
        setConteudo(texto.slice(0, 60000));
        setFonte(arquivo.name);
        if (!titulo) setTitulo(arquivo.name.replace(/\.pdf$/i, "").slice(0, 200));
        toast.info(texto.length > 60000 ? "Texto lido, mas cortado em 60.000 caracteres. Revise antes de salvar." : "Texto lido. Revise antes de salvar.");
      } catch (e) {
        toast.erro(e instanceof Error ? e.message : "Não foi possível ler o PDF.");
      }
    });
  }

  function lerSite() {
    iniciarLeitura(async () => {
      const r = await buscarPagina(fonte);
      if (!r.ok) {
        toast.erro(r.mensagem);
        return;
      }
      setConteudo(r.texto);
      if (!titulo) setTitulo(r.titulo);
      toast.info("Página lida. Apague o que não interessa (menus, rodapé) e revise antes de salvar.");
    });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largo
      titulo={item ? "Editar conhecimento" : "Novo conhecimento"}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao carregando={pendente} disabled={lendo} onClick={() => form.current?.requestSubmit()}>
            Salvar
          </Botao>
        </>
      }
    >
      <form ref={form} onSubmit={onSubmit} noValidate className="space-y-4">
        {item && <input type="hidden" name="id" value={item.id} />}
        <input type="hidden" name="tipo" value={tipo} />
        {!item && <Segmentado rotulo="Tipo de conhecimento" opcoes={OPCOES} valor={tipo} aoMudar={setTipo} />}

        {tipo === "arquivo" && (
          <div className="rounded-xl border border-dashed border-borda p-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center text-sm text-texto-2">
              {lendo ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <FileUp className="size-6" aria-hidden />}
              <span>
                <b className="text-texto">Escolher PDF</b> (até 25 MB). O arquivo é lido no seu aparelho: só o texto é salvo.
              </span>
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => lerPdf(e.target.files?.[0])} disabled={lendo} />
            </label>
          </div>
        )}

        {tipo === "site" && (
          <Campo rotulo="Endereço da página" nome="fonte" erro={erros.fonte}>
            {(p) => (
              <div className="flex gap-2">
                <Entrada {...p} type="url" inputMode="url" value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="https://aurorabartendersaraxa.com.br/" />
                <Botao variante="secundario" onClick={lerSite} carregando={lendo} disabled={!fonte}>
                  <Globe className="size-4" aria-hidden /> Ler
                </Botao>
              </div>
            )}
          </Campo>
        )}
        {tipo !== "site" && <input type="hidden" name="fonte" value={fonte} />}

        <Campo rotulo="Título" nome="titulo" erro={erros.titulo} ajuda="Para você achar depois. O agente também lê.">
          {(p) => <Entrada {...p} value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />}
        </Campo>

        {tipo === "pergunta" && (
          <Campo rotulo="Pergunta do cliente" nome="pergunta" erro={erros.pergunta} ajuda="Do jeito que o cliente costuma perguntar.">
            {(p) => <Entrada {...p} value={pergunta} maxLength={1000} onChange={(e) => setPergunta(e.target.value)} placeholder="Ex.: Vocês levam o gelo?" />}
          </Campo>
        )}

        <Campo
          rotulo={tipo === "pergunta" ? "Resposta" : "Conteúdo"}
          nome="conteudo"
          erro={erros.conteudo}
          ajuda={`${conteudo.length.toLocaleString("pt-BR")} de 60.000 caracteres.`}
        >
          {(p) => <AreaTexto {...p} value={conteudo} maxLength={60000} rows={tipo === "pergunta" ? 5 : 12} onChange={(e) => setConteudo(e.target.value)} />}
        </Campo>

        {alertas.length > 0 && (
          <div role="status" className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-4" aria-hidden /> Este texto parece falar de:
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {alertas.map((a) => (
                <Selo key={a} cor="alerta">
                  {a}
                </Selo>
              ))}
            </p>
            <p className="mt-2">
              O agente só pode informar preço, condição, desconto e disponibilidade a partir do CRM. Tire esses trechos ou
              deixe claro que “os valores são enviados na proposta”.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
