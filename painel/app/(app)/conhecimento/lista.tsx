"use client";

import { AlertTriangle, BookOpen, FileText, Globe, MessageCircleQuestion, Pencil, Plus, Search, Trash2, Type } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { Entrada } from "@/components/ui/campo";
import { Cartao, Selo } from "@/components/ui/cartao";
import { useConfirmar } from "@/components/ui/confirmar";
import { Chip, Interruptor } from "@/components/ui/controles";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { useToast } from "@/components/ui/toast";
import { normalizar } from "@/lib/texto";
import type { Conhecimento, TipoConhecimento } from "@/lib/tipos";
import { alternarAtivo, excluirConhecimento } from "./actions";
import { EditorConhecimento } from "./editor";

export const TIPOS: Record<TipoConhecimento, { nome: string; icone: typeof Type }> = {
  pergunta: { nome: "Pergunta e resposta", icone: MessageCircleQuestion },
  texto: { nome: "Texto", icone: Type },
  arquivo: { nome: "Arquivo PDF", icone: FileText },
  site: { nome: "Página do site", icone: Globe },
};

type Filtro = "todos" | TipoConhecimento | "alerta" | "desativados";
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "pergunta", nome: "Perguntas" },
  { id: "texto", nome: "Textos" },
  { id: "arquivo", nome: "PDFs" },
  { id: "site", nome: "Site" },
  { id: "alerta", nome: "Com alerta" },
  { id: "desativados", nome: "Desativados" },
];

const sem = (t: string) => normalizar(t);

export function ListaConhecimento({ itens, podeEditar }: { itens: Conhecimento[]; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Conhecimento | "novo" | null>(null);

  const visiveis = useMemo(() => {
    const b = sem(busca.trim());
    return itens.filter((i) => {
      if (filtro === "alerta" && !i.alertas.length) return false;
      if (filtro === "desativados" && i.ativo) return false;
      if (filtro !== "todos" && filtro !== "alerta" && filtro !== "desativados" && i.tipo !== filtro) return false;
      return !b || sem(`${i.titulo} ${i.pergunta ?? ""} ${i.conteudo}`).includes(b);
    });
  }, [itens, filtro, busca]);

  const contagem = (f: Filtro) =>
    f === "todos" ? itens.length : f === "alerta" ? itens.filter((i) => i.alertas.length).length : f === "desativados" ? itens.filter((i) => !i.ativo).length : itens.filter((i) => i.tipo === f).length;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-2" aria-hidden />
          <label htmlFor="busca-conhecimento" className="sr-only">
            Buscar no conhecimento
          </label>
          <Entrada id="busca-conhecimento" type="search" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>
        {podeEditar && (
          <Botao onClick={() => setEditando("novo")}>
            <Plus className="size-4" aria-hidden /> Adicionar
          </Botao>
        )}
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar">
        {FILTROS.map((f) => (
          <Chip key={f.id} ativo={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.nome} <span className="opacity-70">{contagem(f.id)}</span>
          </Chip>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <EstadoVazio
          icone={BookOpen}
          titulo={itens.length ? "Nada encontrado" : "Nenhum conhecimento ainda"}
          descricao={itens.length ? "Mude o filtro ou a busca." : "Comece pelas perguntas que os clientes mais fazem."}
        />
      ) : (
        <ul className="space-y-3">
          {visiveis.map((i) => (
            <ItemConhecimento key={i.id} item={i} podeEditar={podeEditar} aoEditar={() => setEditando(i)} />
          ))}
        </ul>
      )}

      {editando && <EditorConhecimento item={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function ItemConhecimento({ item, podeEditar, aoEditar }: { item: Conhecimento; podeEditar: boolean; aoEditar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const confirmar = useConfirmar();
  const Icone = TIPOS[item.tipo].icone;

  const executar = (fn: () => Promise<{ ok: boolean; mensagem?: string }>) =>
    iniciar(async () => {
      const r = await fn();
      if (r.mensagem) (r.ok ? toast.sucesso : toast.erro)(r.mensagem);
    });

  return (
    <li>
      <Cartao className={item.ativo ? "" : "opacity-70"}>
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca-forte">
            <Icone className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-texto">{item.titulo}</h2>
              <Selo>{TIPOS[item.tipo].nome}</Selo>
              {!item.ativo && <Selo cor="neutro">Desativado</Selo>}
            </div>
            {item.pergunta && <p className="mt-1 text-sm font-medium text-texto">“{item.pergunta}”</p>}
            <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-texto-2">{item.conteudo}</p>
            {item.fonte && <p className="mt-1 truncate text-xs text-texto-2">Fonte: {item.fonte}</p>}
            {item.alertas.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-alerta">
                <AlertTriangle className="size-4" aria-hidden />
                <span className="font-semibold">Revisar:</span>
                {item.alertas.map((a) => (
                  <Selo key={a} cor="alerta">
                    {a}
                  </Selo>
                ))}
              </p>
            )}
          </div>
        </div>
        {podeEditar && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-3">
            <Interruptor
              ligado={item.ativo}
              disabled={pendente}
              onClick={() => executar(() => alternarAtivo(item.id, !item.ativo))}
              rotulo={<span className="text-sm">{item.ativo ? "Em uso" : "Fora de uso"}</span>}
              aria-label={`${item.titulo}: em uso pelo agente`}
            />
            <div className="flex gap-1">
              <Botao variante="fantasma" onClick={aoEditar} className="min-h-10 px-3">
                <Pencil className="size-4" aria-hidden /> Editar
              </Botao>
              <Botao
                variante="fantasma"
                className="min-h-10 px-3 text-perigo"
                disabled={pendente}
                onClick={async () => {
                  if (await confirmar({ titulo: `Excluir “${item.titulo}”?`, mensagem: "O texto anterior fica guardado no Registro.", perigo: true, textoConfirmar: "Excluir" })) {
                    executar(() => excluirConhecimento(item.id));
                  }
                }}
                aria-label={`Excluir ${item.titulo}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Botao>
            </div>
          </div>
        )}
      </Cartao>
    </li>
  );
}
