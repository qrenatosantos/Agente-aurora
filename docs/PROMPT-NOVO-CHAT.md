# Prompt para a nova sessão (agente com Cloudflare Think)

**Abra a sessão no ambiente "Agente-aurora"**: a chave da OpenAI já está guardada nele (segredo de rede de
`api.openai.com`).

Cole tudo abaixo da linha numa sessão nova do Claude Code com o repositório `qrenatosantos/Agente-aurora`
(ramo `claude/new-session-vdr8pz`, ou o `main` se ele já tiver sido juntado). Se a sessão tiver o plugin da
Cloudflare, melhor. Se não, ela pede uma chave da API da Cloudflare pelo formulário seguro.

---

Olá! Sou o Renato. **Não sou programador**: fale comigo em português, de forma simples, com resumos curtos.
Quando precisar de uma decisão minha, explique as opções e diga qual recomenda.

## Contexto
Estou construindo o **agente SDR da Aurora Bartenders** (atendimento automático no WhatsApp, ligado ao CRM da Aurora).
Uma sessão anterior já fez muita coisa neste repositório. **Leia antes de qualquer coisa**:
1. `docs/PASSAGEM-PARA-THINK.md`: o resumo de tudo e o que reaproveitar;
2. `docs/PLANO.md`: as decisões aprovadas;
3. `docs/TESTES.md` e `avaliacao/RESULTADO.md`: o que já foi provado;
4. `docs/PEDIDOS-CRM.md`: o que falta no CRM;
5. `CLAUDE.md`: as regras do projeto.

O CRM fica em `qrenatosantos/Aurora`. **Não altere.** Use só a API dele (`docs/API-DO-AGENTE.md` daquele repositório).

## O que eu quero agora
Construir o "motor" do agente com o **Cloudflare Think** (Agents SDK), **reaproveitando**:
- o núcleo (`painel/lib/nucleo/`): ferramentas, instruções, regras fixas e regras por código antes e depois da IA;
- os testes e a bateria com IA de verdade;
- o painel (configuração, conhecimento, simulador, integrações, emergência).

O Think substitui o laço da IA, a memória e a fila por conversa. As regras **não podem** passar a depender só da IA.
A IA continua sendo a da OpenAI (`gpt-6-luna`), com a minha chave.

Quero que seja **fácil de configurar, manter e replicar para outros clientes**, cada um em sua própria instalação
(veja a seção 10 da passagem). Olhe os exemplos do repositório `cloudflare/agents` citados na seção 9, em especial o
`chat-sdk-messenger` com o adaptador `@chat-adapter/whatsapp`.

## Ordem de trabalho
1. **Primeiro, só diagnóstico e plano** (sem código):
   - como o Think vai receber as regras "antes" e "depois" da IA;
   - como ligar o WhatsApp (avaliar o `@chat-adapter/whatsapp` do Chat SDK);
   - como vai ficar o molde para replicar para outros clientes (instalação por cliente, assistente de novo cliente,
     publicação automática com testes) e se o banco fica no D1 ou no Supabase;
   - como o painel e o simulador conversam com o agente Think;
   - tamanho do Worker e custos;
   - riscos de ele ser experimental.
   Consulte a documentação atual do Think e cite as fontes.
2. Depois da minha aprovação, por fases testáveis:
   1. agente Think rodando a **mesma bateria** de `avaliacao/avaliar.ts` (meta: o mesmo 45/45 do `gpt-6-luna`);
   2. WhatsApp com o número de teste da Meta;
   3. avisos do CRM, caixa de entrada e transferências;
   4. retomadas, custos e LGPD;
   5. piloto.
3. Commit e push a cada etapa.

## Plugins da Cloudflare instalados
- **Skills e documentação da Cloudflare:** consulte antes de codar, principalmente `agents-sdk`, `durable-objects`,
  `workers-best-practices`, `wrangler`/`cf-cli` e `workers-development`. Para o painel em Next.js, consulte
  `nextjs-on-cloudflare` (ela compara vinext × OpenNext; hoje o painel usa OpenNext).
- **Conexão com a minha conta Cloudflare:** use para consultar, publicar e ver logs.
  - **Antes de criar, apagar ou alterar qualquer recurso da conta** (Worker, banco, domínio, segredo), me diga o
    que vai fazer e espere eu confirmar.
  - Nada pago sem me dizer o custo antes.

## Regras
- **Nada inventado:** preço, data, disponibilidade e condição só do CRM.
- Não contrate serviços pagos sem me dizer o custo antes.
- Segredos (tokens da Meta, chave da OpenAI, chave do CRM, chave da Cloudflare) só pelo formulário seguro. Nunca no chat
  nem no código.
- Na dúvida, pesquise na documentação oficial e cite a fonte.
