# Agente SDR da Aurora — regras para quem for mexer neste projeto

- Fale com o Renato em português, de forma simples (ele não é programador).
- **Nunca altere o CRM** (`qrenatosantos/Aurora`). Faltou algo na API? Escreva em `docs/PEDIDOS-CRM.md` e avise.
- O agente fala com o CRM **só pela API** (`/api/v1`, chave `aur_...`). Nunca acessa o banco do CRM.
- `painel/` segue os padrões do CRM (`COMO-ESTENDER.md` de lá): leitura em Server Components, gravação
  em Server Actions com zod + `EstadoAcao`, tokens de cor, alvos de toque de 44px.
- Next.js 16 é mais novo que o seu treinamento: leia `painel/node_modules/next/dist/docs/` antes de usar algo novo.
- Regra importante mora no banco (`supabase/schema.sql`). Mudou uma regra? Ajuste `supabase/testes/regras.test.mjs`.
- Sem `service_role` do Supabase. Chaves de integrações: só cifradas (`painel/lib/cripto.ts`).
- Limite do Cloudflare grátis: 3 MB compactados. Confira com `npx opennextjs-cloudflare build && npx wrangler deploy --dry-run`
  (fase 1: 2,49 MB). Prefira `fetch` a SDKs grandes.
- Antes de entregar: `npm run test:banco` (raiz), `npx tsc --noEmit`, `npm run lint`, `npm run build` (painel)
  e atualize `docs/TESTES.md`.
