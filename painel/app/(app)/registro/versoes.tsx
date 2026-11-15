"use client";

import { Eye, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { Cartao, Selo } from "@/components/ui/cartao";
import { useConfirmar } from "@/components/ui/confirmar";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatarDataHora } from "@/lib/formatar";
import { CAMPOS_CONFIG, nomesCampos } from "@/lib/rotulos";
import type { ConfigVersaoLinha } from "@/lib/tipos";
import { restaurarVersao } from "./actions";

function valorLegivel(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    if (typeof v[0] === "string") return v.join(" · ");
    return v.map((e: { situacao?: string; cliente?: string }, i) => `${i + 1}. ${e.situacao || e.cliente || ""}`).join("\n");
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${x && typeof x === "object" ? Object.values(x).join("–") : String(x ?? "fechado")}`)
      .join("\n");
  }
  return String(v);
}

export function ListaVersoes({ versoes, atual }: { versoes: ConfigVersaoLinha[]; atual: number }) {
  const [vendo, setVendo] = useState<ConfigVersaoLinha | null>(null);
  const [pendente, iniciar] = useTransition();
  const confirmar = useConfirmar();
  const toast = useToast();

  return (
    <>
      <ul className="space-y-3">
        {versoes.map((v) => (
          <li key={v.id}>
            <Cartao className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">
                  Versão {v.numero} {v.numero === atual && <Selo cor="ok">em uso</Selo>}
                </p>
                <p className="text-sm text-texto-2">
                  {formatarDataHora(v.created_at)} · {v.autor_nome}
                </p>
                <p className="mt-1 text-sm text-texto">{v.descricao ?? (v.campos.length ? `Mudou: ${nomesCampos(v.campos)}` : "Configuração inicial")}</p>
              </div>
              <div className="flex gap-2">
                <Botao variante="secundario" onClick={() => setVendo(v)}>
                  <Eye className="size-4" aria-hidden /> Ver
                </Botao>
                {v.numero !== atual && (
                  <Botao
                    variante="secundario"
                    carregando={pendente}
                    onClick={async () => {
                      if (
                        await confirmar({
                          titulo: `Voltar para a versão ${v.numero}?`,
                          mensagem: "A configuração atual não se perde: ela continua na lista e você pode voltar para ela depois.",
                          textoConfirmar: "Voltar",
                        })
                      ) {
                        iniciar(async () => {
                          const r = await restaurarVersao(v.numero);
                          (r.ok ? toast.sucesso : toast.erro)(r.mensagem ?? "");
                        });
                      }
                    }}
                  >
                    <RotateCcw className="size-4" aria-hidden /> Voltar para esta
                  </Botao>
                )}
              </div>
            </Cartao>
          </li>
        ))}
      </ul>
      {vendo && (
        <Modal aberto largo titulo={`Versão ${vendo.numero}`} aoFechar={() => setVendo(null)}>
          <dl className="space-y-3">
            {Object.keys(CAMPOS_CONFIG)
              .filter((k) => k in vendo.dados)
              .map((k) => (
                <div key={k} className={vendo.campos.includes(k) ? "rounded-xl bg-destaque-suave p-2" : "p-2"}>
                  <dt className="text-xs font-bold tracking-wide text-texto-2 uppercase">
                    {CAMPOS_CONFIG[k]} {vendo.campos.includes(k) && <span className="text-destaque-forte">· mudou nesta versão</span>}
                  </dt>
                  <dd className="mt-0.5 max-h-48 overflow-auto text-sm whitespace-pre-wrap text-texto">
                    {valorLegivel((vendo.dados as Record<string, unknown>)[k])}
                  </dd>
                </div>
              ))}
          </dl>
        </Modal>
      )}
    </>
  );
}
