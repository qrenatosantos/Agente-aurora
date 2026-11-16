# Agente SDR (molde; 1º cliente: Aurora) — regras para quem for mexer neste projeto

- **Leia primeiro `docs/SITUACAO.md`** (o que está no ar, decisões recentes e pendências) e mantenha-o atualizado.
- Fale com o Renato em português, de forma simples (ele não é programador). Respostas curtas.
- **Nunca altere o CRM** (`qrenatosantos/Aurora`). Faltou algo na API? Escreva em `docs/PEDIDOS-CRM.md` e avise.
- O agente fala com o CRM **só pela API** (`/api/v1`, chave `aur_...`). Nunca acessa o banco do CRM.
- Decisão do Renato (15/11/2026): **tudo na Cloudflare** (Workers + D1 + Durable Objects), login próprio por
  e-mail e senha. Plano e motivos em `docs/PLANO-THINK.md`.
- **Molde para vários clientes:** nada do cliente no código. Dados do cliente ficam em `clientes/<cliente>/` e na
  configuração (banco e segredos).

## Painel (`painel/`)
- Segue os padrões do CRM (`COMO-ESTENDER.md` de lá): leitura em Server Components, gravação em Server Actions com
  zod + `EstadoAcao`, tokens de cor, alvos de toque de 44px.
- Next.js 16 é mais novo que o seu treinamento: leia `painel/node_modules/next/dist/docs/` antes de usar algo novo.
- **Quem pode o quê mora em `painel/lib/banco/`** (uma função por operação, sempre recebendo o `Ator`). Regra nova
  ou mudada = teste em `painel/lib/banco/banco.test.ts` (`npm run test:banco`). Nunca consulte o banco direto de uma
  tela ou ação: passe por `lib/banco/`.
- Banco D1: mudança de estrutura = **arquivo novo** em `painel/banco/migracoes/` (`0002_...sql`). Nunca edite uma
  migração já aplicada.
- Em `catch` de Server Component/Action, chame `unstable_rethrow(e)` antes de tratar o erro (senão o Next perde
  redirecionamentos e páginas dinâmicas).
- Chaves de integrações: só cifradas (`painel/lib/cripto.ts`). Segredos do Worker (`CHAVE_MESTRA`,
  `CODIGO_INSTALACAO`, `SEGREDO_INTERNO`) só com `wrangler secret put`, nunca no código.
- Limite do Cloudflare grátis: 3 MB compactados. Confira com `npx opennextjs-cloudflare build && npx wrangler deploy --dry-run`
  (fase 1b: 2,21 MB). Prefira `fetch` a SDKs grandes.

## Agente (`painel/lib/nucleo/` e `motor/`)
- O núcleo é TS puro (imports relativos com `.ts`, sem Next): o motor e o painel usam o mesmo.
  Regra nova do agente = teste em `nucleo.test.ts`; mudança de comportamento = rodar a bateria no motor.
- **Regras só em `processarTurno` (agente.ts).** O laço da IA é trocável (`MotorIA` em `motor-ia.ts`): `motorOpenAI`
  (laço próprio, plano B) ou o Cloudflare Think (`motor/src/conversa.ts`). Nunca ponha regra dentro do laço.
- `motor/` usa o Think (experimental): versões **fixas** no `package.json`. Atualizar só com `npm run test:nucleo` +
  bateria no motor (`node avaliacao/avaliar.ts gpt-6-luna --rodadas 3 --motor ...`) dando 45/45.
  Tamanho: `cd motor && npm run tamanho` (1,32 MB).
- O motor não expõe WebSocket nem `routeAgentRequest`: só `/whatsapp/webhook` (assinatura da Meta conferida) e as
  rotas `/interno/*` com `SEGREDO_INTERNO`. Lê o mesmo D1 do painel, só pelas funções "interno" de `lib/banco/`.
- Publicação: pelo GitHub (`.github/workflows/publicar.yml`), não daqui (o proxy da sessão estraga o envio dos
  arquivos estáticos do painel). Segredos dos Workers: `wrangler secret put` daqui funciona.

## Sessões na nuvem
- O Node só sai pela rede com `NODE_USE_ENV_PROXY=1` (no Cloudflare não precisa).
- O `wrangler dev` não passa pelo proxy que injeta a chave da OpenAI: rode `scripts/repassar-openai.mjs` e use
  `OPENAI_BASE_URL=http://127.0.0.1:8789` no `motor/.dev.vars` (só testes).
- A chave da Cloudflare fica como segredo de rede do ambiente (`api.cloudflare.com`): use
  `CLOUDFLARE_API_TOKEN=proxy-injected` e `CLOUDFLARE_ACCOUNT_ID=...` no `wrangler`.

## Antes de entregar
`npm run test:banco`, `npm run test:nucleo` e `npm run test:motor` (raiz); `npx tsc --noEmit`, `npm run lint`, `npm run build` (painel);
`npx tsc --noEmit` (motor); e atualize `docs/TESTES.md`.
