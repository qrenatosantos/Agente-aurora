"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/cartao";
import { useConfirmar } from "@/components/ui/confirmar";
import { useToast } from "@/components/ui/toast";
import type { ConversaWhatsApp } from "@/lib/banco/avisos.ts";
import { formatarDataHora, formatarTelefone } from "@/lib/formatar";
import { zerarConversaWhatsApp } from "./actions";

/** Testes no WhatsApp: zera a conversa de um número para começar do zero. */
export function ZerarWhatsApp({ conversas }: { conversas: ConversaWhatsApp[] }) {
  const confirmar = useConfirmar();
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Cartao className="p-0 sm:p-0">
      <h2 className="border-b border-borda px-4 py-3 text-sm font-semibold text-texto">Testes no WhatsApp</h2>
      <p className="px-4 pt-3 text-xs text-texto-2">
        Zerar apaga a memória da Cecília com esse número. Antes, marque no CRM o pedido antigo como perdido; senão ela continua nele.
      </p>
      {conversas.length ? (
        <ul className="divide-y divide-borda">
          {conversas.map((c) => (
            <li key={c.conversa} className="flex items-center justify-between gap-2 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-texto">{formatarTelefone(c.telefone)}</p>
                <p className="text-xs text-texto-2">{c.ultima_do_cliente ? `Última msg: ${formatarDataHora(c.ultima_do_cliente)}` : "Sem mensagem registrada"}</p>
              </div>
              <Botao
                variante="fantasma"
                className="min-h-11 shrink-0 px-3 text-perigo"
                disabled={pendente}
                aria-label={`Zerar a conversa de ${formatarTelefone(c.telefone)}`}
                onClick={async () => {
                  const ok = await confirmar({
                    titulo: "Zerar esta conversa?",
                    mensagem: "A Cecília esquece tudo o que conversou com esse número. O CRM não muda. Não dá para desfazer.",
                    perigo: true,
                    textoConfirmar: "Zerar",
                  });
                  if (!ok) return;
                  iniciar(async () => {
                    const r = await zerarConversaWhatsApp(c.conversa);
                    if (r.ok) {
                      toast.sucesso(r.mensagem ?? "Conversa zerada.");
                      router.refresh();
                    } else toast.erro(r.mensagem ?? "");
                  });
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                <span className="ml-1 text-sm">Zerar</span>
              </Botao>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-texto-2">Nenhuma conversa no WhatsApp ainda.</p>
      )}
    </Cartao>
  );
}
