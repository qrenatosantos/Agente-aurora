import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoPagina, Cartao, Selo } from "@/components/ui/cartao";
import { obterConfigAgente } from "@/lib/dados";
import { formatarDataHora } from "@/lib/formatar";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { listarConversasWhatsApp } from "@/lib/banco/avisos.ts";
import { lerSimulacao, listarSimulacoes } from "@/lib/banco/operacao.ts";
import { atorAtual, banco } from "@/lib/servidor";
import type { SimulacaoLinha } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { validacaoUuid } from "./util";
import { Conversa } from "./conversa";
import { NovaSimulacao } from "./nova";
import { ZerarWhatsApp } from "./zerar-whatsapp";

export const metadata: Metadata = { title: "Simulador" };

export default async function PaginaSimulador({ searchParams }: { searchParams: Promise<{ id?: string; pergunta?: string; nova?: string }> }) {
  const { perfil } = await obterPerfil();
  const gestor = ehGestor(perfil);
  const { id, pergunta, nova } = await searchParams;
  const db = await banco();
  const ator = await atorAtual();
  const [lista, { config }] = await Promise.all([listarSimulacoes(db, ator, 30).catch(() => []), obterConfigAgente()]);
  const atualId = id && validacaoUuid(id) ? id : null;
  const atual = atualId ? ((await lerSimulacao(db, ator, atualId).catch(() => null)) as SimulacaoLinha | null) : null;
  const mostrarNova = !atual || nova === "1";
  const conversasWa = gestor ? await listarConversasWhatsApp(db, ator).catch(() => []) : [];

  return (
    <>
      <CabecalhoPagina
        titulo="Simulador"
        descricao="Converse com o agente como se fosse um cliente. Ele lê o CRM de verdade (agenda, catálogo, preço), mas por padrão não grava nada."
      />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="order-2 space-y-3 lg:order-1">
          <Link
            href="/simulador?nova=1"
            className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-borda bg-superficie px-4 text-sm font-semibold text-marca-forte hover:bg-superficie-2"
          >
            + Nova simulação
          </Link>
          <Cartao className="p-0 sm:p-0">
            <h2 className="border-b border-borda px-4 py-3 text-sm font-semibold text-texto">Simulações recentes</h2>
            {lista?.length ? (
              <ul className="max-h-[28rem] divide-y divide-borda overflow-y-auto">
                {lista.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/simulador?id=${s.id}`}
                      aria-current={s.id === atual?.id ? "page" : undefined}
                      className={cn("block px-4 py-3 hover:bg-superficie-2", s.id === atual?.id && "bg-marca-suave")}
                    >
                      <p className="truncate text-sm font-medium text-texto">{s.titulo}</p>
                      <p className="text-xs text-texto-2">
                        {s.criado_por_nome} · {formatarDataHora(s.updated_at)} · {s.modelo}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-texto-2">Nenhuma ainda.</p>
            )}
          </Cartao>
          {gestor && <ZerarWhatsApp conversas={conversasWa} />}
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          {mostrarNova ? (
            <NovaSimulacao gestor={gestor} modeloPadrao={config?.modelo ?? "gpt-4o-mini"} pergunta={pergunta ?? ""} />
          ) : (
            <>
              {atual.gravar_crm && (
                <div className="mb-3 rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
                  <b>Esta simulação grava no CRM de verdade</b>: cria um pedido de teste (“SIMULADOR · teste”) e registra a conversa.
                  Marque-o como perdido ou exclua depois.
                </div>
              )}
              <Conversa key={atual.id} simulacao={atual} perguntaInicial={pergunta ?? ""} />
              <p className="mt-2 text-xs text-texto-2">
                Modelo: {atual.modelo} · Custo desta simulação: US$ {Number(atual.custo_usd).toFixed(4)} ·{" "}
                <Selo>{atual.gravar_crm ? "grava no CRM" : "não grava no CRM"}</Selo>
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
