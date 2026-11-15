"use client";

import { Pencil, Plus, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, Selo } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/controles";
import { Modal } from "@/components/ui/modal";
import type { Perfil } from "@/lib/tipos";
import { useAcao } from "@/lib/use-acao";
import { salvarPessoa } from "./actions";

export function ListaEquipe({ pessoas, meuId }: { pessoas: Perfil[]; meuId: string }) {
  const [editando, setEditando] = useState<Perfil | "nova" | null>(null);
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
                {!p.user_id && <Selo cor="alerta">Ainda não entrou</Selo>}
                <Botao variante="fantasma" className="min-h-10 px-3" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                  <Pencil className="size-4" aria-hidden />
                </Botao>
              </div>
            </Cartao>
          </li>
        ))}
      </ul>
      {editando && <EditorPessoa pessoa={editando === "nova" ? null : editando} souEu={editando !== "nova" && editando.id === meuId} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function EditorPessoa({ pessoa, souEu, aoFechar }: { pessoa: Perfil | null; souEu: boolean; aoFechar: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, erros, pendente } = useAcao(salvarPessoa, { aoSucesso: aoFechar });
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
        <Campo rotulo="E-mail (o mesmo do login)" nome="email" erro={erros.email} ajuda={pessoa ? "O e-mail não muda depois do cadastro." : undefined}>
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
