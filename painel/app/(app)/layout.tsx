/**
 * Layout de TODAS as páginas logadas (pasta app/(app)/ — o "(app)" não aparece na URL).
 * Monta o "app shell": sidebar (computador), barra inferior (celular), topo com a logo,
 * o BOTÃO DE EMERGÊNCIA (pausar o agente) e a faixa vermelha quando o agente está pausado.
 */
import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { BottomNav } from "@/components/shell/bottom-nav";
import { BotaoEmergencia, FaixaPausado } from "@/components/shell/emergencia";
import { MenuUsuario } from "@/components/shell/menu-usuario";
import { Sidebar } from "@/components/shell/sidebar";
import { LogoNegocio } from "@/components/logo-negocio";
import { TemaToggle } from "@/components/ui/tema-toggle";
import { obterOperacao } from "@/lib/dados";
import { obterMarca } from "@/lib/marca-servidor";
import { SUBTITULO_MENU } from "@/lib/navegacao";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { GuardaCliente } from "@/components/shell/guarda-cliente";
import { TrocaCliente } from "@/components/shell/troca-cliente";
import { clientesDoAtor, faltaDuasEtapas } from "@/lib/banco/pessoas.ts";
import { atorAtual, banco } from "@/lib/servidor";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const [marca, { perfil, erro: erroPerfil }] = await Promise.all([obterMarca(), obterPerfil()]);
  // Segunda barreira (a primeira é o proxy.ts): sem sessão válida, volta para o login.
  if (!perfil && !erroPerfil) redirect("/login");
  const db = await banco();
  const ator = await atorAtual();
  // Dono da plataforma: o Estúdio só abre com a confirmação em duas etapas ligada.
  if (await faltaDuasEtapas(db, ator)) redirect("/seguranca");
  const clientes = await clientesDoAtor(db, ator);
  const email = perfil?.email ?? "";
  const operacao = perfil?.ativo && ator?.cliente ? await obterOperacao() : null;
  const bloqueado = perfil !== null && !perfil.ativo;
  const gestor = ehGestor(perfil);
  const dono = Boolean(ator?.dono);
  const dadosMarca = { nome: marca.nome, subtitulo: SUBTITULO_MENU, logoUrl: marca.logoUrl };

  return (
    <>
      <GuardaCliente cliente={ator?.cliente ?? null} />
      <Sidebar marca={dadosMarca} gestor={gestor} dono={dono} />

      <div className="md:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-borda bg-fundo/90 px-4 backdrop-blur sm:gap-3 sm:px-6 nao-imprimir">
          <LogoNegocio nome={marca.nome} logoUrl={marca.logoUrl} className="md:hidden" />
          {/* com a troca de cliente no topo, o nome já aparece nela */}
          <p className={`min-w-0 flex-1 truncate font-semibold text-texto md:font-medium md:text-texto-2 ${clientes.length > 1 ? "invisible" : ""}`}>{marca.nome}</p>
          <TrocaCliente atual={ator?.cliente ?? null} opcoes={clientes.map((c) => ({ id: c.id, nome: c.nome, situacao: c.situacao }))} />
          {perfil?.ativo && operacao && !operacao.cliente_pausado && <BotaoEmergencia pausado={operacao.pausado} gestor={gestor} />}
          <TemaToggle />
          <MenuUsuario email={email} nome={perfil?.nome} gestor={gestor} />
        </header>

        {perfil?.ativo && operacao?.pausado && <FaixaPausado operacao={operacao} gestor={gestor} />}

        {erroPerfil && (
          <div role="alert" className="mx-4 mt-4 rounded-xl bg-alerta-suave p-3 text-sm text-alerta sm:mx-6">
            Não foi possível ler o banco do painel. Confira se o banco D1 foi criado e se o arquivo{" "}
            <code>painel/banco/schema.sql</code> foi aplicado (veja o README).
          </div>
        )}

        <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pb-10">
          {bloqueado ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-borda bg-superficie px-6 py-12 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-perigo-suave text-perigo">
                <UserX className="size-7" aria-hidden />
              </div>
              <h1 className="text-lg font-semibold text-texto">Seu acesso ainda não foi liberado</h1>
              <p className="mt-1 max-w-sm text-sm text-texto-2">
                Peça ao gestor para cadastrar o seu e-mail ({email}) na tela Equipe e ativar o seu acesso.
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <BottomNav marca={dadosMarca} gestor={gestor} dono={dono} />
    </>
  );
}
