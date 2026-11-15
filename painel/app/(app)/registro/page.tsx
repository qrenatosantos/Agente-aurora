import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CabecalhoPagina, Cartao, Selo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { formatarDataHora } from "@/lib/formatar";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { ACOES_REGISTRO, NOMES_SEGREDOS, nomesCampos } from "@/lib/rotulos";
import { lerConfig, listarVersoes } from "@/lib/banco/config.ts";
import { listarRegistro } from "@/lib/banco/operacao.ts";
import { atorAtual, banco } from "@/lib/servidor";
import type { RegistroLinha } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { ListaVersoes } from "./versoes";

export const metadata: Metadata = { title: "Registro e versões" };

const ABAS = [
  { id: "versoes", nome: "Versões da configuração" },
  { id: "atividades", nome: "Registro de atividades" },
] as const;

function resumo(r: RegistroLinha) {
  const d = r.detalhes as Record<string, unknown>;
  if (r.acao === "config.alterou") return `${r.alvo}: ${nomesCampos((d.campos as string[]) ?? [])}${d.descricao ? ` (${d.descricao})` : ""}`;
  if (r.acao.startsWith("segredo.")) return NOMES_SEGREDOS[r.alvo ?? ""] ?? r.alvo;
  if (r.acao === "integracoes.testou") return `${r.alvo?.toUpperCase()}: ${d.ok ? "ok" : "falhou"}${d.mensagem ? ` · ${d.mensagem}` : ""}`;
  if (r.acao === "agente.pausou" && d.motivo) return `Motivo: ${d.motivo}`;
  return r.alvo ?? "";
}

export default async function PaginaRegistro({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { perfil } = await obterPerfil();
  if (!ehGestor(perfil)) redirect("/");
  const { aba: abaBruta } = await searchParams;
  const aba = abaBruta === "atividades" ? "atividades" : "versoes";

  return (
    <>
      <CabecalhoPagina titulo="Registro e versões" descricao="Toda mudança fica guardada: quem fez, quando e o quê. A configuração do agente pode voltar a qualquer versão." />
      <nav aria-label="Abas" className="mb-4 flex gap-2 overflow-x-auto">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/registro?aba=${a.id}`}
            aria-current={aba === a.id ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
              aba === a.id ? "border-marca bg-marca text-marca-texto" : "border-borda bg-superficie text-texto hover:bg-superficie-2",
            )}
          >
            {a.nome}
          </Link>
        ))}
      </nav>
      {aba === "versoes" ? <Versoes /> : <Atividades />}
    </>
  );
}

async function Versoes() {
  const db = await banco();
  const ator = await atorAtual();
  const [data, atual] = await Promise.all([listarVersoes(db, ator, 200).catch(() => null), lerConfig(db, ator).catch(() => null)]);
  if (!data) return <Cartao className="text-sm text-perigo">Não foi possível ler as versões.</Cartao>;
  if (!data.length) return <EstadoVazio titulo="Nenhuma versão ainda" />;
  return <ListaVersoes versoes={data} atual={atual?.versao ?? 0} />;
}

async function Atividades() {
  const data = await listarRegistro(await banco(), await atorAtual(), { limite: 300 }).catch(() => null);
  if (!data) return <Cartao className="text-sm text-perigo">Não foi possível ler o registro.</Cartao>;
  if (!data.length) return <EstadoVazio titulo="Nada registrado ainda" />;
  return (
    <Cartao className="p-0 sm:p-0">
      <ul className="divide-y divide-borda">
        {data.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:gap-4">
            <time className="shrink-0 text-xs text-texto-2 sm:w-36" dateTime={r.created_at}>
              {formatarDataHora(r.created_at)}
            </time>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-texto">
                <b>{r.ator_nome}</b> {(ACOES_REGISTRO[r.acao] ?? r.acao).toLowerCase()}
                {r.ator_tipo !== "humano" && (
                  <Selo className="ml-2" cor={r.ator_tipo === "agente" ? "info" : "neutro"}>
                    {r.ator_tipo === "agente" ? "agente" : "sistema"}
                  </Selo>
                )}
              </p>
              <p className="truncate text-sm text-texto-2">{resumo(r)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
