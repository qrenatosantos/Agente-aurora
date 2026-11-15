import { Lock } from "lucide-react";

/** Faixa para quem é atendente: pode ver, mas só o gestor altera. */
export function AvisoSoGestor() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl bg-info-suave p-3 text-sm text-info">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>Você pode consultar esta tela. Só o gestor faz alterações.</p>
    </div>
  );
}
