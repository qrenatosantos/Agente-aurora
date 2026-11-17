"use client";

/**
 * TROCA DE CLIENTE no topo (multi-cliente): aparece para o dono da plataforma e para quem atende mais de um cliente.
 * Quem decide se a pessoa pode abrir o cliente é o servidor (lib/auth/acoes.ts ▸ trocarCliente).
 * Depois de trocar, recarrega a seção atual já com os dados do outro cliente.
 */
import { Building2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { trocarCliente } from "@/lib/auth/acoes";

export type OpcaoCliente = { id: string; nome: string; situacao: string };

export function TrocaCliente({ atual, opcoes }: { atual: string | null; opcoes: OpcaoCliente[] }) {
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const caminho = usePathname();
  const router = useRouter();
  if (opcoes.length < 2 && atual) return null;

  return (
    <label className="relative flex min-h-11 items-center gap-2 rounded-xl border border-borda bg-superficie px-2 text-sm">
      <Building2 className="size-4 shrink-0 text-texto-2" aria-hidden />
      <span className="sr-only">Cliente</span>
      <select
        value={atual ?? ""}
        disabled={pendente}
        onChange={(e) => {
          const id = e.target.value;
          iniciar(async () => {
            const r = await trocarCliente(id);
            if (!r.ok) return toast.erro(r.mensagem ?? "Não foi possível trocar de cliente.");
            // mesma seção (ex.: /agente), já do outro cliente; telas de um item só (ex.: /simulador/123) voltam para a lista
            router.push(`/${caminho.split("/")[1] ?? ""}`);
            router.refresh();
          });
        }}
        className="max-w-40 min-w-0 truncate bg-transparent py-2 font-medium text-texto outline-none sm:max-w-56"
      >
        {!atual && <option value="">Escolha um cliente</option>}
        {opcoes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
            {c.situacao !== "ativo" ? ` (${c.situacao})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
