# Situação atual (leia primeiro) — atualizado em 16/11/2026

Resumo vivo do projeto, para qualquer sessão continuar sem perder contexto. Detalhes: `PLANO-THINK.md` (decisões),
`TESTES.md` (o que foi provado), `PEDIDOS-CRM.md` (CRM), `CLAUDE.md` (regras de trabalho).

## No ar (conta Cloudflare do Renato, plano Workers Paid)
- Painel: https://aurora-agente-painel.q-renatosantos.workers.dev (login e-mail/senha; gestor: Renato).
- Motor (Cecília): https://aurora-motor.q-renatosantos.workers.dev — webhook do WhatsApp `/whatsapp/webhook`,
  avisos do CRM `/crm/avisos`, rotas internas `/interno/*` (SEGREDO_INTERNO).
- Banco D1 `aurora-agente` (região ENAM). Migrações 0001–0004.
- Publicação: GitHub Actions (`.github/workflows/publicar.yml`) a cada push no ramo `claude/serene-faraday-w06f6u`.
  Segredo no GitHub: CLOUDFLARE_API_TOKEN. Segredos dos Workers: CHAVE_MESTRA (painel e motor), SEGREDO_INTERNO.
- CRM publicado (projeto `qrenatosantos/Aurora`, Supabase + Cloudflare), integrado: chave do agente, segredo dos avisos.
- WhatsApp: número de TESTE da Meta (+1 555 142-3124); só entrega para destinatários cadastrados (Renato, André…).
  App "SDR Aurora" assinado na WABA (subscribed_apps); webhook verificado; campo messages assinado.

## Cecília (configuração da Aurora no painel, versões no Registro)
- Nome Cecília, "agente de atendimento da Aurora Bartenders"; NÃO oferece falar com pessoa (só se o cliente pedir);
  se perguntarem "é robô?", diz com sinceridade que é assistente virtual (decisão discutida com o Renato).
- Mensagens em balões (um por parágrafo); pacotes um por mensagem com emoji; emojis equilibrados no resto.
- Proposta só com: nome do cliente, tipo, data/mês, cidade, convidados, HORAS DE BAR e pacote (trava no código).
- Preço menor: oferece diminuir horas ou copos descartáveis; só transfere se recusar e insistir.
- Pedido do site: acha pelo "Ref. XXXX" (código do pedido no CRM) e continua de onde o site parou.
- Proposta aprovada no CRM ("Só aprovar" ou "Aprovar e enviar") → Cecília manda o link, mesmo com a conversa em
  atendimento humano (lê o link da proposta se o CRM não deixar o agente marcar como enviada). Reprocessar um aviso:
  `POST /interno/aviso {conversa:"avisos", id}`; lembretes: não abriu em 120 min / abriu e não
  respondeu em 30 min; só 8h–21h e dentro da janela grátis de 24 h.
- Pacotes num parágrafo só são separados por código (um balão por pacote; util.ts separarPacotes).
- Drinks soltos em vez de pacote: explica o pacote que cobre e oferece proposta personalizada (só os drinks
  escolhidos); nunca escolhe pelo cliente; confirma o resumo antes de preparar a proposta.
- Equipe devolve a conversa ("Passar para o agente") → a Cecília responde as mensagens que ficaram sem resposta
  (dentro das 24 h). Mudança na proposta: recusada = monta outra; enviada = pergunta o que muda antes de passar
  (trava no código). Pedido C5 ao CRM: rota para o agente refazer proposta enviada.
- Pergunta sobre prazo da proposta: "até o final do dia"; depois das 19h, "até amanhã às 14h"; nunca transfere por isso (config v11).
- O Renato ajusta treinamento direto nas Instruções do painel. Ajuste pequeno = sem bateria com IA (economia).

## Pendências
- CRM: aprovar as regras de preço (Catálogo ▸ Calculadora) e confirmar condições (Configurações ▸ Propostas e agenda).
  Até lá, propostas vêm "Preço a definir" e o gestor põe o valor antes de aprovar.
- CRM ▸ Configurações ▸ Propostas e agenda ▸ "WhatsApp que recebe os clientes pela proposta" = número da Cecília
  (hoje o de teste, 15551423124; trocar quando houver o definitivo). Vazio = vai para o WhatsApp da empresa (André).
- Número definitivo (decisão do Renato/André): chip novo só da Cecília (simples; o site troca o "wa" na config) OU
  número do André em coexistência (exige Provedor de Tecnologia ou parceira; cuidado: amigos/família receberiam a Cecília).
- Fase 3 restante: aviso ao André no WhatsApp (proposta para aprovar; transferência), caixa de entrada no painel,
  André assumindo pela conversa (coexistência). CRM "Leads novos do site vão para" = Agente quando o número for definitivo.
- Fase 4: modelos da Meta (mensagens fora das 24 h), LGPD (apagar dados ao receber contato.dados_apagados), custos.
- Política de privacidade (S1) publicada antes de clientes reais.

## Testes locais nesta nuvem
`/tmp/claude-0/subir-tudo.sh` (sessões anteriores) sobe: Docker + Supabase do CRM de testes + CRM (porta 3200) +
repassador OpenAI (8789) + Graph falso (8792) + motor (8787) com D1 local em /tmp/claude-0/estado-local.
Se a sessão for nova, refazer conforme `TESTES.md` (seções da fase 1 e 2).
