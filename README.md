# Agente SDR (molde) — primeiro cliente: Aurora Bartenders

Atendimento automático no WhatsApp, com o **painel** onde o gestor configura, treina e acompanha o agente.
**Tudo na Cloudflare** (Workers + D1 + Durable Objects). Projeto **separado do CRM**: o agente fala com o CRM só
pela API dele, com uma chave de permissões limitadas.

- Plano do motor e decisões: [`docs/PLANO-THINK.md`](docs/PLANO-THINK.md) (e o plano original em [`docs/PLANO.md`](docs/PLANO.md))
- Pedidos de mudança no CRM: [`docs/PEDIDOS-CRM.md`](docs/PEDIDOS-CRM.md)
- Testes feitos: [`docs/TESTES.md`](docs/TESTES.md)

## Situação

| Fase | Entrega | Situação |
|---|---|---|
| 1 | **Motor** com o Cloudflare Think, com as regras garantidas por código; bateria com IA real **45/45** | **Pronta** |
| 1b | **Painel na Cloudflare**: banco D1, login próprio (e-mail e senha), simulador falando com o motor | **Pronta** |
| 2 | WhatsApp: receber, juntar mensagens, "digitando", responder, áudio | **Pronta** (falta o teste com o número da Meta) |
| 3 | Avisos do CRM, caixa de entrada e transferências | — |
| 4 | Retomadas, custos e LGPD | — |
| 5 | Molde para novos clientes (um comando) e publicação automática | — |
| 6 | Piloto acompanhado | — |

## Pastas

```
motor/                  Worker do AGENTE (Cloudflare Think): uma conversa = um Durable Object.
  src/conversa.ts       o laço da IA pelo Think + memória da conversa; as regras vêm do núcleo
  src/index.ts          webhook do WhatsApp (/whatsapp/webhook, com assinatura) e rotas internas (/interno/*)
  src/whatsapp.ts       Meta Cloud API só com fetch: assinatura, leitura dos avisos, envio, "digitando", áudio
  src/ambiente.ts       lê do banco do painel a configuração e as chaves (abertas com a CHAVE_MESTRA)
painel/                 Worker do PAINEL (Next.js 16 via OpenNext).
  banco/migracoes/      estrutura do banco D1 (uma migração por arquivo; nunca editar um já aplicado)
  lib/banco/            quem pode o quê: uma função por operação, sempre com quem está agindo (+ testes)
  lib/nucleo/           O AGENTE: instruções, ferramentas (API do CRM), regras antes/depois da IA.
                        TypeScript puro: o motor e o painel usam o mesmo código.
  app/(app)/simulador/  conversar com o agente como cliente (passa pelo motor)
clientes/aurora/        dados do cliente (instruções iniciais e conhecimento). Nada disso fica no código.
avaliacao/              bateria com a IA de verdade (avaliar.ts) e os últimos resultados
scripts/                utilitários (repassar-openai.mjs: só para testes nas sessões na nuvem)
docs/                   planos, pedidos ao CRM, testes
```

## Testes

```bash
npm run test:banco          # regras do banco do painel (D1/SQLite em memória, sem internet)
npm run test:nucleo         # regras do agente, com IA e CRM falsos (grátis)
npm run test:motor          # canal WhatsApp (assinatura e leitura dos avisos da Meta)
cd painel && npx tsc --noEmit && npm run lint && npm run build
cd motor && npx tsc --noEmit && npm run tamanho

# Bateria com a IA de verdade (custa alguns centavos de dólar), no MOTOR rodando localmente:
cd motor && npx wrangler dev          # em outro terminal
MOTOR_SEGREDO=... CRM_URL=https://endereco-do-crm CRM_CHAVE=aur_... OPENAI_CHAVE=sk-... \
  node avaliacao/avaliar.ts gpt-6-luna --rodadas 3 --motor http://localhost:8787
```

## Rodar no computador

Precisa do Node.js 22 ou mais novo.

```bash
cd motor && npm install && cp .dev.vars.example .dev.vars    # preencha SEGREDO_INTERNO
npx wrangler dev                                             # motor em http://localhost:8787

cd painel && npm install && cp .dev.vars.example .dev.vars   # preencha os 3 segredos (o SEGREDO_INTERNO igual ao do motor)
npx wrangler d1 migrations apply aurora-agente --local
npx wrangler d1 execute aurora-agente --local --file=../clientes/aurora/dados-iniciais.sql
npx opennextjs-cloudflare build && npx wrangler dev --port 8790
```

Abra http://localhost:8790: o painel vazio leva a **/instalar**, onde se cria o 1º gestor com o `CODIGO_INSTALACAO`.

## Como dar acesso a alguém

1. O gestor abre **Equipe ▸ Nova pessoa** e cadastra o nome e o e-mail.
2. O painel mostra um **link** (vale 48 horas, uma vez só). O gestor envia à pessoa (por WhatsApp, por exemplo).
3. A pessoa cria a própria senha pelo link e já entra.

Esqueceu a senha? O gestor usa **Gerar link de senha** na linha da pessoa.

## Segurança, em resumo

- **Chaves das integrações** (OpenAI, Meta, CRM): ficam só cifradas no banco, com a `CHAVE_MESTRA` do servidor;
  nunca vão para o navegador; a tela mostra apenas os 4 últimos caracteres.
- **Login**: senhas com PBKDF2 (o banco nunca vê a senha); sessões com código aleatório (no banco, só o hash);
  limite de tentativas erradas por e-mail e por endereço de rede.
- **Regras de acesso** em código, num lugar só (`painel/lib/banco/`), com testes para cada uma:
  - o **gestor** altera tudo;
  - o **atendente** consulta as telas, usa o simulador e pode **pausar** o agente;
  - só o gestor religa o agente; nunca fica sem gestor; ninguém muda o próprio papel.
- **Motor**: sem acesso público às conversas; só as rotas internas, com `SEGREDO_INTERNO`.
- **Registro**: cada alteração fica guardada (quem, quando e o quê). A configuração do agente tem versões.
