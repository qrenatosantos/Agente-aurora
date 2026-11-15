"use client";

import { Copy, KeyRound, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, Selo } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/controles";
import { useConfirmar } from "@/components/ui/confirmar";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { Perfil } from "@/lib/tipos";
import { useAcao } from "@/lib/use-acao";
import { gerarLink, removerPessoa, salvarPessoa } from "./actions";

export function ListaEquipe({ pessoas, meuId }: { pessoas: Perfil[]; meuId: string }) {
  const [editando, setEditando] = useState<Perfil | "nova" | null>(null);
  const [link, setLink] = useState<{ link: string; nome: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const confirmar = useConfirmar();

  const novoLink = (p: Perfil) =>
    iniciar(async () => {
      const r = await gerarLink(p.id);
      if (r.ok && r.dados?.link) setLink({ link: r.dados.link, nome: p.nome });
      else toast.erro(r.mensagem ?? "Não foi possível gerar o link.");
    });

  const remover = async (p: Perfil) => {
    if (!(await confirmar({ titulo: `Remover ${p.nome}?`, mensagem: "A pessoa perde o acesso ao painel na hora. O registro do que ela fez continua guardado.", textoConfirmar: "Remover", perigo: true }))) return;
    iniciar(async () => {
      const r = await removerPessoa(p.id);
      if (r.ok) toast.sucesso(r.mensagem ?? "Removida.");
      else toast.erro(r.mensagem ?? "Não foi possível remover.");
    });
  };
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Botao onClick={() => setEditando("nova")}>
          <Plus className="size-4" aria-hidden /> Nova pessoa
        </Botao>
      </div>
      <ul className="space-y-3">
        {pessoas.map((p) => (
          <li key={p.id}>
            <Cartao className="flex flex-wrap items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-marca-suave text-marca-forte">
                <UserRound className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">
                  {p.nome} {p.id === meuId && <span className="text-sm font-normal text-texto-2">(você)</span>}
                </p>
                <p className="truncate text-sm text-texto-2">{p.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Selo cor={p.papel === "gestor" ? "marca" : "neutro"}>{p.papel === "gestor" ? "Gestor" : "Atendente"}</Selo>
                {!p.ativo && <Selo cor="perigo">Bloqueado</Selo>}
                {!p.tem_senha && <Selo cor="alerta">Ainda não criou a senha</Selo>}
                <Botao variante="fantasma" className="min-h-10 px-3" onClick={() => novoLink(p)} disabled={pendente} aria-label={`Gerar link de senha para ${p.nome}`} title="Gerar link de senha">
                  <KeyRound className="size-4" aria-hidden />
                </Botao>
                <Botao variante="fantasma" className="min-h-10 px-3" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                  <Pencil className="size-4" aria-hidden />
                </Botao>
                {p.id !== meuId && (
                  <Botao variante="fantasma" className="min-h-10 px-3" onClick={() => remover(p)} disabled={pendente} aria-label={`Remover ${p.nome}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </Botao>
                )}
              </div>
            </Cartao>
          </li>
        ))}
      </ul>
      {editando && (
        <EditorPessoa
          pessoa={editando === "nova" ? null : editando}
          souEu={editando !== "nova" && editando.id === meuId}
          aoFechar={() => setEditando(null)}
          aoCriar={(l) => {
            setEditando(null);
            setLink(l);
          }}
        />
      )}
      {link && <JanelaLink link={link.link} nome={link.nome} aoFechar={() => setLink(null)} />}
    </>
  );
}

/** Mostra o link de senha para o gestor copiar e enviar (aparece uma vez só). */
function JanelaLink({ link, nome, aoFechar }: { link: string; nome: string; aoFechar: () => void }) {
  const toast = useToast();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.sucesso("Link copiado.");
    } catch {
      toast.erro("Não deu para copiar. Selecione o link e copie.");
    }
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Link de senha para ${nome}`} rodape={<Botao onClick={aoFechar}>Pronto</Botao>}>
      <p className="text-sm text-texto-2">
        Envie este link para {nome} (por WhatsApp, por exemplo). Por ele, a pessoa cria a própria senha. Vale por <b>48 horas</b> e uma vez
        só. <b>Ele não aparece de novo</b>: se perder, gere outro.
      </p>
      <p className="mt-3 break-all rounded-xl bg-superficie-2 p-3 font-mono text-xs text-texto select-all">{link}</p>
      <Botao variante="secundario" className="mt-3 w-full" onClick={copiar}>
        <Copy className="size-4" aria-hidden /> Copiar link
      </Botao>
    </Modal>
  );
}

function EditorPessoa({
  pessoa,
  souEu,
  aoFechar,
  aoCriar,
}: {
  pessoa: Perfil | null;
  souEu: boolean;
  aoFechar: () => void;
  aoCriar: (l: { link: string; nome: string }) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, erros, pendente } = useAcao(salvarPessoa, {
    aoSucesso: (estado) => (estado.dados?.link ? aoCriar({ link: estado.dados.link, nome: estado.dados.nome ?? "" }) : aoFechar()),
  });
  const [ativo, setAtivo] = useState(pessoa?.ativo ?? true);
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={pessoa ? `Editar ${pessoa.nome}` : "Nova pessoa"}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao carregando={pendente} onClick={() => form.current?.requestSubmit()}>
            Salvar
          </Botao>
        </>
      }
    >
      <form ref={form} onSubmit={onSubmit} noValidate className="space-y-4">
        {pessoa && <input type="hidden" name="id" value={pessoa.id} />}
        <Campo rotulo="Nome" nome="nome" erro={erros.nome}>
          {(p) => <Entrada {...p} defaultValue={pessoa?.nome ?? ""} maxLength={80} />}
        </Campo>
        <Campo rotulo="E-mail (usado para entrar)" nome="email" erro={erros.email} ajuda={pessoa ? "O e-mail não muda depois do cadastro." : undefined}>
          {(p) => <Entrada {...p} type="email" inputMode="email" defaultValue={pessoa?.email ?? ""} readOnly={Boolean(pessoa)} />}
        </Campo>
        {souEu ? (
          <>
            <input type="hidden" name="papel" value={pessoa?.papel} />
            <input type="hidden" name="ativo" value="sim" />
            <p className="text-sm text-texto-2">Você não pode mudar o seu próprio papel nem se bloquear.</p>
          </>
        ) : (
          <>
            <Campo rotulo="Papel" nome="papel" erro={erros.papel}>
              {(p) => (
                <Selecao {...p} defaultValue={pessoa?.papel ?? "atendente"}>
                  <option value="atendente">Atendente (consulta e atende conversas)</option>
                  <option value="gestor">Gestor (tudo, inclusive integrações)</option>
                </Selecao>
              )}
            </Campo>
            <input type="hidden" name="ativo" value={ativo ? "sim" : "nao"} />
            <Interruptor ligado={ativo} onClick={() => setAtivo((v) => !v)} rotulo="Acesso liberado" />
          </>
        )}
      </form>
    </Modal>
  );
}
