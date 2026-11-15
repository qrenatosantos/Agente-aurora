import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AvisoSoGestor } from "@/components/aviso-so-gestor";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { obterConfigAgente } from "@/lib/dados";
import { formatarDataHora } from "@/lib/formatar";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { REGRAS_FIXAS } from "@/lib/regras-fixas";
import { FormAgente } from "./form-agente";

export const metadata: Metadata = { title: "Agente" };

export default async function PaginaAgente() {
  const [{ config, erro }, { perfil }] = await Promise.all([obterConfigAgente(), obterPerfil()]);
  const gestor = ehGestor(perfil);

  return (
    <>
      <CabecalhoPagina
        titulo="Agente"
        descricao="Quem ele é, como fala e o que deve fazer. As regras fixas no fim da página valem sempre."
      />
      {!gestor && <AvisoSoGestor />}
      {erro || !config ? (
        <Cartao role="alert" className="text-sm text-perigo">
          Não foi possível ler a configuração do agente. Confira se o arquivo <code>supabase/schema.sql</code> foi executado.
        </Cartao>
      ) : (
        <>
          <p className="mb-4 text-sm text-texto-2">
            Versão {config.versao} · alterada em {formatarDataHora(config.updated_at)}.{" "}
            {gestor && (
              <Link href="/registro" className="font-semibold text-marca-forte underline-offset-2 hover:underline">
                Ver versões anteriores
              </Link>
            )}
          </p>
          <FormAgente config={config} podeEditar={gestor} />
        </>
      )}

      <Cartao className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-5 text-marca-forte" aria-hidden />
          <h2 className="text-lg font-semibold text-texto">Regras fixas (não editáveis)</h2>
        </div>
        <p className="mb-4 text-sm text-texto-2">
          Valem acima das instruções. Várias também são garantidas pelo sistema ou pelo CRM, e não só pela obediência da IA.
        </p>
        <ol className="space-y-3">
          {REGRAS_FIXAS.map((r, i) => (
            <li key={r.titulo} className="rounded-xl border border-borda p-3">
              <p className="font-semibold text-texto">
                {i + 1}. {r.titulo}
              </p>
              <p className="mt-1 text-sm text-texto">{r.texto}</p>
              <p className="mt-1 text-xs text-texto-2">Garantia: {r.garantia}</p>
            </li>
          ))}
        </ol>
      </Cartao>
    </>
  );
}
