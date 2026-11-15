# Agente SDR da Aurora Bartenders

Atendimento automático da Aurora no WhatsApp, com o **painel** onde o André configura, treina e
acompanha o agente. Projeto **separado do CRM**: o agente fala com o CRM só pela API dele, com
uma chave de permissões limitadas.

- Plano aprovado: [`docs/PLANO.md`](docs/PLANO.md)
- Pedidos de mudança no CRM: [`docs/PEDIDOS-CRM.md`](docs/PEDIDOS-CRM.md)
- Testes feitos: [`docs/TESTES.md`](docs/TESTES.md)

## Situação

| Fase | Entrega | Situação |
|---|---|---|
| 1 | Painel: login, papéis, Agente, Conhecimento, Transferência e horários, Integrações (chaves criptografadas), Equipe, Registro com versões, botão de emergência | **Pronta** |
| 2 | Agente no **Simulador**, falando com o CRM de verdade; regras garantidas por código; bateria com IA real (gpt-6-luna 45/45) | **Pronta** |
| 3 | WhatsApp com o número de teste da Meta | Próxima |
| 4 | Caixa de entrada, transferências e avisos do CRM | — |
| 5 | Retomadas, modelos da Meta, correções, métricas e custos | — |
| 6 | Piloto acompanhado e publicação | — |

## Pastas

```
painel/                 Next.js 16 (mesma base e padrões do CRM). Publicado no Cloudflare Workers.
  app/(app)/            telas logadas: Visão geral, agente, conhecimento, transferencia,
                        integracoes, equipe, registro
  lib/nucleo/           O AGENTE: instruções, ferramentas (API do CRM), regras por código, OpenAI.
                        TypeScript puro: o motor do WhatsApp (fase 3) usa o mesmo código.
  app/(app)/simulador/  conversar com o agente como cliente (lê o CRM; gravar é opcional, só gestor)
  lib/cripto.ts         criptografia das chaves (AES-GCM com a CHAVE_MESTRA do servidor)
  lib/integracoes.ts    "testar conexão" com o CRM, a OpenAI e a Meta
  public/vendor/        PDF.js (lê PDF no navegador; fora do pacote do servidor)
supabase/
  schema.sql            banco do agente (projeto Supabase PRÓPRIO, nunca o do CRM)
  dados-iniciais.sql    instruções sugeridas, mensagens padrão e conhecimento do site
  testes/               regras do banco (npm run test:banco)
avaliacao/              bateria de regras com a IA de verdade (avaliar.ts) e o último RESULTADO.md
docs/                   plano, pedidos ao CRM, testes
```

## Como montar o painel (fase 1)

Você precisa de: uma conta grátis no Supabase (o 2º projeto da conta da Aurora) e o Node.js 20 ou mais novo para rodar no computador.

1. **Supabase ▸ New project.** Nome `aurora-agente`, região **South America (São Paulo)**. Guarde a senha do banco.
2. **SQL Editor ▸ New query.** Cole todo o [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Depois faça o mesmo com o [`supabase/dados-iniciais.sql`](supabase/dados-iniciais.sql). Os dois podem rodar de novo sem estragar nada.
3. **Authentication ▸ Users ▸ Add user.** Crie o login do André (marque **Auto Confirm User**). **O primeiro login vira gestor.**
4. **Authentication ▸ Sign In / Providers.** Desligue **Allow new users to sign up**.
5. **Variáveis** (arquivo `painel/.env.local` no computador; no Cloudflare, na fase 6). Veja [`painel/.env.example`](painel/.env.example):
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: do projeto **do agente**;
   - **Chave-mestra** `CHAVE_MESTRA`: gere com `openssl rand -base64 32`. Ela criptografa as chaves da OpenAI, da Meta e do CRM.
     - É **segredo**: no Cloudflare, cadastre como *Secret*.
     - Se for perdida, basta digitar as chaves de novo em Integrações.
6. No computador:
   ```bash
   cd painel
   npm install
   npm run dev        # abre em http://localhost:3000
   ```
7. **Outras pessoas:** o gestor cadastra o e-mail em **Equipe**. Depois, crie o login no Supabase com o **mesmo e-mail**. Quem entrar sem cadastro fica bloqueado.

## Testes

```bash
npm install
npm run test:banco          # regras do banco (PGlite, sem internet)
npm run test:nucleo         # regras do agente, com IA e CRM falsos (grátis)
cd painel && npx tsc --noEmit && npm run lint && npm run build

# Bateria com a IA de verdade (custa alguns centavos de dólar):
CRM_URL=https://endereco-do-crm CRM_CHAVE=aur_... OPENAI_CHAVE=sk-... \
  node avaliacao/avaliar.ts gpt-6-luna gpt-4o-mini --rodadas 3
```

O Simulador precisa, em Integrações, do endereço e da chave do CRM e da chave da OpenAI.

## Segurança, em resumo

- **Chaves:**
  - as chaves das integrações nunca ficam no código nem no navegador;
  - no banco, ficam só cifradas, e nenhum papel lê a tabela de chaves;
  - a tela mostra apenas os 4 últimos caracteres.
- **Sem a chave mestra do Supabase:** o painel não usa a `service_role` do Supabase. Todas as regras ficam no banco (RLS e funções), como no CRM.
- **Papéis:**
  - o **gestor** altera tudo;
  - o **atendente** consulta as telas e pode **pausar** o agente;
  - só o gestor religa o agente.
- **Registro:** cada alteração fica guardada (quem, quando e o quê). A configuração do agente tem versões e pode voltar a qualquer uma.
