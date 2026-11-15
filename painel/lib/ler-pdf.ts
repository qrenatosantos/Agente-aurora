/**
 * Extrai o TEXTO de um PDF no NAVEGADOR, com o PDF.js (Mozilla) servido pelo próprio painel
 * em /vendor/pdfjs-4.10.38/. O arquivo não sai do computador: só o texto vai para o banco.
 * Fica fora do pacote do servidor (o limite do Cloudflare grátis é 3 MB).
 */
const BASE = "/vendor/pdfjs-4.10.38";
export const PDF_TAMANHO_MAX = 25 * 1024 * 1024;

type Item = { str?: string; hasEOL?: boolean };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Item[] }> }>;
      destroy: () => Promise<void>;
    }>;
  };
};

export async function textoDoPdf(arquivo: File): Promise<string> {
  if (arquivo.size > PDF_TAMANHO_MAX) throw new Error("PDF grande demais (máximo de 25 MB).");
  const pdfjs = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}/pdf.min.mjs`)) as PdfJs;
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  try {
    const paginas: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const conteudo = await (await doc.getPage(n)).getTextContent();
      const linha = conteudo.items.map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : "")).join("");
      paginas.push(linha.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
    }
    return paginas.filter(Boolean).join("\n\n").trim();
  } finally {
    await doc.destroy();
  }
}
