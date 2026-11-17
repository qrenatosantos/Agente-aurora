"use client";

import qrcode from "qrcode-generator";
import { QrCode, Smartphone } from "lucide-react";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { ativarDuasEtapas, gerarQrDuasEtapas, sair } from "@/lib/auth/acoes";
import { useAcao } from "@/lib/use-acao";

/** Desenho do QR code (SVG gerado aqui no navegador, a partir do endereço otpauth://). */
function Qr({ texto }: { texto: string }) {
  const q = qrcode(0, "M");
  q.addData(texto);
  q.make();
  // SVG gerado pela biblioteca a partir do nosso texto (otpauth://), nada vindo de fora
  return <div className="mx-auto w-52 rounded-xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} />;
}

export function FormDuasEtapas({ obrigatoria }: { obrigatoria: boolean }) {
  const [qr, setQr] = useState<{ otpauth: string; segredo: string } | null>(null);
  const [erroQr, setErroQr] = useState<string | null>(null);
  const [gerando, iniciar] = useTransition();
  const { estado, onSubmit, pendente } = useAcao(ativarDuasEtapas, { toast: false });

  const gerar = () =>
    iniciar(async () => {
      const r = await gerarQrDuasEtapas();
      if (r.ok && r.dados?.otpauth) {
        setQr({ otpauth: r.dados.otpauth, segredo: r.dados.segredo ?? "" });
        setErroQr(null);
      } else setErroQr(r.mensagem ?? "Não foi possível gerar o QR code.");
    });

  return (
    <div>
      <h1 className="text-lg font-semibold text-texto">Confirmação em duas etapas</h1>
      <p className="mt-1 text-sm text-texto-2">
        {obrigatoria ? "Para abrir o Estúdio, ligue antes a confirmação em duas etapas. " : ""}
        Depois disso, cada login pede também um código de 6 números do seu celular.
      </p>

      <ol className="mt-4 space-y-4 text-sm text-texto">
        <li className="flex gap-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-marca-forte" aria-hidden />
          <span>
            <b>1.</b> No celular, instale o aplicativo <b>Google Authenticator</b> (grátis, na Play Store ou na App Store).
          </span>
        </li>
        <li className="flex gap-3">
          <QrCode className="mt-0.5 size-5 shrink-0 text-marca-forte" aria-hidden />
          <div className="min-w-0 flex-1">
            <p>
              <b>2.</b> Toque em <b>Mostrar QR code</b>. No aplicativo, toque no <b>+</b> e em <b>Ler código QR</b>, e aponte a câmera para o
              quadrado.
            </p>
            {!qr ? (
              <Botao variante="secundario" className="mt-2 w-full" onClick={gerar} carregando={gerando}>
                Mostrar QR code
              </Botao>
            ) : (
              <div className="mt-3 space-y-2">
                <Qr texto={qr.otpauth} />
                <p className="text-center text-xs text-texto-2">
                  Não consegue ler? No aplicativo, escolha “Inserir chave de configuração” e digite:
                  <span className="mt-1 block break-all font-mono text-texto select-all">{qr.segredo}</span>
                </p>
              </div>
            )}
            {erroQr && (
              <p role="alert" className="mt-2 rounded-xl bg-perigo-suave p-3 text-perigo">
                {erroQr}
              </p>
            )}
          </div>
        </li>
      </ol>

      {qr && (
        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          <Campo rotulo="3. Digite o código de 6 números que apareceu no aplicativo" nome="codigo" erro={estado.erros?.codigo}>
            {(p) => <Entrada {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" className="text-center font-mono text-lg tracking-widest" />}
          </Campo>
          {estado.mensagem && !estado.ok && (
            <p role="alert" className="rounded-xl bg-perigo-suave p-3 text-sm text-perigo">
              {estado.mensagem}
            </p>
          )}
          <Botao type="submit" carregando={pendente} className="w-full">
            Ligar as duas etapas
          </Botao>
        </form>
      )}

      <form action={sair} className="mt-4 text-center">
        <button type="submit" className="inline-flex min-h-11 items-center text-sm font-medium text-texto-2 hover:underline">
          Sair
        </button>
      </form>
    </div>
  );
}
