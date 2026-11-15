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
  (fase 2: 2,57 MB). Prefira `fetch` a SDKs grandes.
- O agente mora em `painel/lib/nucleo/` (TS puro, imports relativos com `.ts`, sem Next): o motor do WhatsApp usa o mesmo.
  Regra nova do agente = teste em `nucleo.test.ts`; mudança de comportamento = rodar `avaliacao/avaliar.ts`.
- Nas sessões na nuvem, o Node só sai pela rede com `NODE_USE_ENV_PROXY=1` (no Cloudflare não precisa).
- Antes de entregar: `npm run test:banco` e `npm run test:nucleo` (raiz), `npx tsc --noEmit`, `npm run lint`, `npm run build` (painel)
  e atualize `docs/TESTES.md`.
