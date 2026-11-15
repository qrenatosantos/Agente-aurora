# Pedidos de mudança no CRM (para levar à sessão do CRM)

Aprovados pelo Renato em 15/11/2026. Nenhum deles impede o agente de começar: cada item diz
o que o agente faz enquanto o pedido não for atendido.

Você pode colar o texto abaixo da linha na sessão do CRM.

---

Olá! O agente SDR da Aurora (projeto separado, que fala com o CRM só pela API) precisa destes
ajustes no CRM. Siga os padrões do `COMO-ESTENDER.md`:
- regra no banco;
- teste em `supabase/testes/regras.test.mjs`;
- rota em `lib/api/rotas-agente.ts`;
- `docs/API-DO-AGENTE.md` atualizado.

## C1. Devolver o atendimento ao agente pela API (prioridade média)

**O que:** nova rota `POST /api/v1/negocios/:id/encaminhar-agente`, corpo `{ "motivo": "...", "autor": "Nome da pessoa" }`.
- Ela faz o mesmo que o botão "Passar para o agente" da ficha do negócio:
  - passa `atendimento` para `agente`;
  - grava a passagem;
  - dispara o aviso `atendimento.encaminhado_agente`.
- Exige uma **permissão nova, `atendimento.devolver`**, que **não** vem marcada por padrão na tela de criar chave.
- Registra no `agente_log` e na Auditoria o nome da pessoa (`autor`) que pediu no painel.

**Por quê:** o painel do agente tem a caixa de entrada das conversas. O André precisa conseguir devolver uma conversa ao agente por lá, sem abrir o CRM.
- A permissão fica numa **segunda chave, só do painel**.
- A chave usada pela IA não terá essa permissão. Assim, o agente nunca consegue "pegar" uma conversa sozinho.

**Enquanto não existir:** o André devolve pelo botão do CRM, e o painel mostra o link para a ficha do negócio.

## C2. Celular brasileiro com e sem o 9 extra (prioridade média)

**O que:** fazer `tel_norm()` e as buscas por telefone (`GET /negocios?telefone=`, `GET /contatos?telefone=`, reaproveitamento de contato em `POST /negocios` e `POST /contatos`) tratarem como o mesmo número:
- `34 98893-5223` (11 dígitos, com o 9);
- `34 8893-5223` (10 dígitos, sem o 9).

Regra: DDD + 8 dígitos começando por 6, 7, 8 ou 9 é celular → comparar como DDD + 9 + 8 dígitos.

**Por quê:** a API do WhatsApp entrega alguns números brasileiros antigos **sem o 9**. Sem isso, o mesmo cliente pode virar dois contatos e dois pedidos.

**Confirmado num teste com a cópia do CRM:** `GET /negocios?telefone=3400001111` não acha o contato `34900001111`.

**Enquanto não existir:** o agente busca as duas versões do número antes de criar qualquer coisa. Isso resolve no agente, mas o CRM continua sujeito ao problema em outros caminhos, como o cadastro manual.

## C3. "Não quer receber mensagens" no contato (prioridade baixa)

**O que:** campos no contato, graváveis pela API (`PATCH /contatos/:id`) e visíveis na ficha do contato:
- `nao_contatar` (sim/não), `nao_contatar_em` (data/hora) e `nao_contatar_motivo` (texto curto);
- `aceita_retomadas` (sim/não) e `aceita_retomadas_em` (data/hora): consentimento para mensagens de retomada.

Também incluir esses campos na resposta de `GET /contatos/:id` e `GET /negocios/:id`.

**Por quê:** pela LGPD e pelas regras da Meta, quem pediu para parar não pode receber retomadas. O André precisa ver isso no CRM, e a informação deve valer para todos os canais.

**Enquanto não existir:** o agente guarda isso só no banco dele e põe a etiqueta `nao-contatar` no negócio (`PATCH /negocios/:id`, `tags`).

## C4. Foto dos drinks na API (opcional)

**O que:** incluir `foto_url` (endereço público) em `GET /catalogo/drinks` e nos drinks de `GET /catalogo/pacotes`.

**Por quê:** para o agente mandar a foto do drink quando o cliente pedir.

**Enquanto não existir:** o agente não envia fotos.

## S1. Política de privacidade: completar o item "Atendimento automatizado" (antes do piloto)

O arquivo `integracao-site/politica-de-privacidade.md` já tem o item. Falta dizer:
- que as mensagens do WhatsApp passam pela **Meta (WhatsApp Business Platform)**;
- que o texto das conversas é processado pela **OpenAI (Estados Unidos)**, que atua como operadora: não usa os dados para treinar os modelos e guarda registros de segurança por até 30 dias;
- que por isso há **transferência internacional de dados** (LGPD, art. 33);
- que a pessoa pode pedir para **não receber mais mensagens** a qualquer momento, e a partir daí não recebe retomadas;
- que as conversas com o agente seguem o **mesmo prazo de guarda** dos pedidos (12 meses para quem não fechou) e são apagadas quando a pessoa pede.

**Quando publicar:** antes de o agente atender o primeiro cliente real (fase 6, piloto). Não publique antes disso.
