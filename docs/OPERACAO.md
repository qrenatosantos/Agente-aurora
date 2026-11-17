# Operação: ambientes, alertas, cópias e restauração (Fase 0 da plataforma)

Criado em 17/11/2026. Vale para a Cecília (produção) e para o ambiente de testes.

## 1. Os dois ambientes

| | **Produção (a Cecília real)** | **Testes** |
|---|---|---|
| Ramo do GitHub que publica | `claude/serene-faraday-w06f6u` (e `main`) | `plataforma` |
| Painel | https://aurora-agente-painel.q-renatosantos.workers.dev | https://aurora-agente-painel-teste.q-renatosantos.workers.dev |
| Motor | https://aurora-motor.q-renatosantos.workers.dev | https://aurora-motor-teste.q-renatosantos.workers.dev |
| Vigia | `aurora-vigia` (saúde a cada 5 min) | `aurora-vigia-teste` (a cada 30 min) |
| Banco D1 | `aurora-agente` (0a0e06bd-…) | `aurora-agente-teste` (16b38927-…) |
| WhatsApp | número de teste da Meta, assinado no motor real | nenhum (o webhook da Meta aponta só para a produção) |
| Segredos dos Workers | os de sempre | **próprios** (CHAVE_MESTRA, SEGREDO_INTERNO, CODIGO_INSTALACAO, VIGIA_SEGREDO) |

- A publicação (`.github/workflows/publicar.yml`) escolhe o ambiente pelo ramo: `--env teste` no `plataforma`, `--env=` (a
  produção) nos outros. Mudança só em `docs/` não publica nada.
- Nos arquivos `wrangler.jsonc` (painel, motor, vigia), o ambiente de testes está em `"env": { "teste": … }`.
- **Daqui da nuvem** o painel não publica (o proxy estraga o envio dos arquivos estáticos): publique pelo GitHub. Motor,
  vigia, segredos e comandos do banco funcionam daqui com
  `NODE_USE_ENV_PROXY=1 CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=5a292fc980c65378451156ed927154d4`.

### O banco de testes
- Em 17/11 recebeu uma **cópia da produção** (mesmas pessoas e senhas, configuração v13, conhecimento, registro).
- Depois da cópia: `delete from segredos; delete from sessoes; update operacao set pausado = 1`. As chaves da produção
  são cifradas com a CHAVE_MESTRA da produção e **não abrem** no teste. Para o Simulador do teste funcionar, cadastre as
  chaves (OpenAI, CRM) de novo no painel de testes, em Integrações.
- Agente do teste fica **pausado** (segurança). Ele não tem WhatsApp, então não fala com ninguém de verdade.

## 2. Alertas por e-mail

| O quê | Como |
|---|---|
| **E-mail** | Regra de aviso "Agente: erro nos programas (Issues)" (Notificações, id 609c978e…), e-mail do Renato, ligada a duas **automações dos Issues** (criadas pela API em 17/11): "erro novo" (1ª ocorrência) e "erro voltou depois de 1 h". Valem para todos os programas da conta |
| Issues | Ligado nos programas (`observability.issues.enabled`): erro não tratado, resposta 5xx ou `console.error` vira um Issue (Workers ▸ programa ▸ Issues). Sem automação, Issue **não** manda e-mail |
| Falha da IA numa conversa real | O núcleo já manda a mensagem de erro e passa para a equipe. O motor agora também registra `console.error("[falha da IA] …")`, e isso vira Issue e e-mail |
| Teste de saúde | O **vigia** (`vigia/`), a cada 5 min: painel e motor no ar (endereço público) e, pela ligação interna `Saude` do motor (`motor/src/saude.ts`): banco, OpenAI (lista modelos, sem custo), WhatsApp (lê o número na Meta; pega token vencido) e CRM (busca que não acha nada). Problema = `console.error("[alerta] …")` → e-mail |

- No teste, o vigia só exige o banco (`EXIGIR=banco`). O que não está configurado lá não gera alerta.
- O mesmo erro repetido fica num Issue só (um e-mail). Se ele some por 1 h e volta, chega outro e-mail. Depois de
  consertar, marque o Issue como **Resolvido** (Workers ▸ programa ▸ Issues); se voltar, chega e-mail de novo.
- Teste feito em 17/11: erro provocado no vigia de produção às 16h47 UTC → e-mail enviado 20 s depois (histórico de Notificações).
- **Provocar um alerta de propósito** (para conferir o e-mail):
  `curl -X POST -H "Authorization: Bearer <VIGIA_SEGREDO>" https://aurora-vigia.q-renatosantos.workers.dev/provocar-erro`.
  O VIGIA_SEGREDO só existe na Cloudflare; para trocar: `cd vigia && npx wrangler secret put VIGIA_SEGREDO [--env teste]`.
- Outras rotas manuais do vigia (mesmo segredo): `POST /saude` (roda o teste agora) e `POST /copiar` (faz a cópia agora).

## 3. Cópias do banco

Duas camadas:

1. **Time Travel do D1** (automático, 30 dias, plano pago): volta o banco inteiro para qualquer minuto.
2. **Cópia semanal no R2** (vigia, toda segunda 03h17 de Brasília): arquivo SQL em `aurora-copias/aurora-agente/AAAA-MM-DD.sql`
   (e `aurora-agente-teste/…` para o teste). O formato é de `vigia/src/copia.ts`: apaga os dados de cada tabela e grava
   os da cópia. Não inclui a tabela de migrações. Guardado por 90 dias (regra de ciclo de vida do R2).

### Restaurar (escolha o caso)

**A. Errei algo nas últimas horas ou dias (até 30 dias):** Time Travel.
```
cd painel
npx wrangler d1 time-travel info aurora-agente --env=                              # ponto atual (bookmark)
npx wrangler d1 time-travel restore aurora-agente --env= --timestamp=2026-11-17T12:00:00Z
```
A restauração devolve um "bookmark" que desfaz a própria restauração, se precisar.

**B. Restaurar uma cópia semanal (ou levar a produção para o teste):**
1. Baixe a cópia: `npx wrangler r2 object get aurora-copias/aurora-agente/2026-11-24.sql --remote --file copia.sql`
   (ou pelo painel da Cloudflare ▸ R2 ▸ aurora-copias).
2. O banco de destino precisa ter **as mesmas migrações** da cópia:
   `npx wrangler d1 migrations apply <banco> --remote --env=<ambiente>`.
3. Restaure: `npx wrangler d1 execute <banco> --remote --env=<ambiente> --file copia.sql -y`.
4. Se o destino for o **teste**: apague os segredos e as sessões e pause (seção 1).
5. Confira: `npx wrangler d1 export <banco> --remote --no-schema --output depois.sql` e compare as linhas.

**Ensaio feito em 17/11/2026:** export da produção → cópia no formato do vigia (`gerarCopia`) → restaurada no
`aurora-agente-teste` com o passo B.3 → export do teste comparado linha a linha com o da produção: **123 de 123 iguais**.

## 4. Quando algo quebrar (roteiro curto)

1. Chegou e-mail da Cloudflare: abra o Issue (o link vem no e-mail) e leia a mensagem `[alerta] …` ou `[falha da IA] …`.
2. Chave recusada (OpenAI, Meta, CRM): cadastre a chave de novo no painel, em Integrações.
3. Programa fora do ar depois de uma publicação: Cloudflare ▸ Workers ▸ programa ▸ **Deployments** ▸ voltar à versão
   anterior (um clique); depois corrija com calma no ramo de testes.
4. Cecília falando besteira depois de mudar Instruções: painel ▸ Registro ▸ versões ▸ voltar para a anterior.
5. Emergência: botão de pausa do agente no painel (as mensagens vão para a equipe).

## 5. Multi-cliente e duas etapas (Fase 1 da plataforma, 17/11/2026 — por enquanto só no ambiente de testes)

- **Clientes:** cada empresa é um cliente (apelido curto, ex.: `aurora`). Tudo no banco tem `cliente_id`. O dono da
  plataforma (Renato) vê todos em **Estúdio ▸ Clientes** e troca de cliente no topo. A equipe de um cliente só vê o dele.
- **WhatsApp:** um endereço só (`/whatsapp/webhook`) para todos. O motor descobre o cliente pelo **número que recebeu a
  mensagem** (Integrações ▸ WhatsApp ▸ Phone number ID de cada cliente) e confere a assinatura com o app secret dele.
  Conversas: `<cliente>:wa-<telefone>`; a Aurora (convertida da instalação antiga) mantém `wa-<telefone>`.
- **Avisos do CRM:** `POST /crm/avisos` (o motor acha o cliente pela assinatura) ou `POST /crm/avisos/<cliente>`.
  Reprocessar um aviso: `POST /interno/aviso {"conversa":"avisos","cliente":"aurora","id":123}`.
- **Saúde:** o vigia confere OpenAI, WhatsApp e CRM de cada cliente ativo (o detalhe começa com `[cliente]`). Cliente
  sem número de WhatsApp ainda (sendo configurado) não gera alerta por chave faltando.
- **Pausar um cliente** (Estúdio ▸ Clientes ▸ Pausar): o agente dele não responde ninguém. **Encerrar**: a equipe dele
  perde o acesso. Nada é apagado.

### Confirmação em duas etapas (dono da plataforma)
- Obrigatória para o dono: sem ela, o painel abre direto a tela "Confirmação em duas etapas" (QR code para o Google
  Authenticator). Depois, todo login pede o código de 6 números do celular.
- **Perdeu o celular?** Desligue as duas etapas pelo banco e ligue de novo no próximo login (troque `--env teste` e o
  nome do banco para a produção quando ela tiver a Fase 1):
  ```
  cd painel
  npx wrangler d1 execute aurora-agente-teste --remote --env teste --command "update pessoas set totp_ativo = 0, totp_cifrado = null where dono = 1"
  ```
- O segredo do aplicativo fica cifrado com a `CHAVE_MESTRA` (se ela mudar, faça o mesmo comando e ligue de novo).
