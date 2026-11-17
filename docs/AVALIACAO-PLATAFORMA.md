# Avaliação: `matheusmontelro/plataforma-agentes-ia` e o caminho para a plataforma de agentes

Escrito em 17/11/2026. Código lido: a versão pública de 02/08/2026 (4 commits, licença MIT).

> **Atenção:** esta avaliação foi feita olhando o ramo antigo (`claude/new-session-vdr8pz`). O projeto atual
> (Cecília no ar, motor na Cloudflare, banco D1) está no ramo `claude/serene-faraday-w06f6u`, e o estado dele
> está em `docs/SITUACAO.md`. A conclusão não muda. Ao planejar, use o estado atual: o passo 1 da seção 7
> ("terminar o agente no Think") já está em grande parte feito.

---

## 1. Resposta curta

**Não use a plataforma como base. Copie dela uma ideia: a "ficha do agente".**

- A plataforma é grande e completa no papel: CRM, fluxos, campanhas, agenda, criador de agentes. Só que ela
  roda num **servidor próprio ligado 24 horas**, com Python, PostgreSQL, Redis e Celery. Isso **não roda
  no Cloudflare**. Para usar, você teria de abandonar o Cloudflare, ou reescrever quase tudo.
- O WhatsApp dela é **não oficial** (WAHA, conectado por QR code). Com esse tipo de conexão, o número
  pode ser **banido pela Meta**. O seu agente já usa a API oficial da Meta, que é o certo para cliente pagante.
- Ela foi **tirada de um produto de clínicas**: são 115 arquivos que falam de consulta, paciente, no-show e
  nutrição. Adaptar isso para bar de eventos, loja ou imobiliária dá mais trabalho do que parece.
- **A parte boa:** o "criador de agentes" dela descreve cada agente numa **ficha padronizada**: identidade,
  objetivo, regras, exemplos, objeções, ferramentas, quando passar para humano e travas de segurança. A
  partir dessa ficha, monta o prompt em seções. **É exatamente o jeito modular que faltou no prompt da
  Cecília.** Vamos adotar essa ideia, escrita no nosso formato.

**Recomendação:** construir a plataforma em cima do que você já tem: o painel, o núcleo do agente, os testes
e o Cloudflare Think. Do projeto open source, levamos a ficha do agente e usamos o código de Google
Agenda como referência.

---

## 2. O que é a ferramenta (fatos)

| Item | O que encontrei |
|---|---|
| Licença | MIT: pode usar, copiar e vender, inclusive comercialmente |
| Autor e histórico | Um autor; 4 commits, todos de 01 e 02/08/2026. Publicada como "edição educacional" |
| Tamanho | ~152 mil linhas de Python + ~89 mil de TypeScript (o seu agente é bem menor) |
| Onde roda | Servidor próprio (VPS) com Python 3.12, PostgreSQL, Redis e Celery, ligado 24h |
| Telas | React: dashboard, CRM em Kanban, chat, criador de agentes, fluxos, campanhas, agenda, integrações |
| IA | OpenAI (Agents SDK + LangChain + módulos "legados", tudo junto) |
| WhatsApp | WAHA, Z-API e Evolution: **todos não oficiais** |
| Google Agenda | Tem (OAuth, horários livres, marcar, Google Meet) |
| API para eu operar por fora | Tem API (FastAPI) e o criador de agentes recebe a ficha em JSON. Mas só funciona com o servidor dela no ar |
| Testes | 55 arquivos de teste, mas a verificação automática do GitHub **não roda nenhum**. Ela só confere se o código compila, se o banco é criado e se há segredos expostos |

## 3. Nota por parte (0 a 10)

| Parte | Nota | Por quê |
|---|---|---|
| Funcionalidades | 8 | Tem muita coisa pronta: CRM, fluxos, campanhas, agenda, áudio, vários agentes |
| Ficha e prompt do agente | 8 | Bem pensados (seção 4). É o melhor do projeto |
| Pronta para usar em cliente | 3 | Precisa de servidor, troca de marca, desligar o que é de clínica e configurar o WAHA. Os testes não rodam sozinhos |
| Encaixe no seu jeito de trabalhar (Cloudflare, sem servidor) | 1 | Não roda no Cloudflare. Reescrever seria um projeto novo |
| Segurança do WhatsApp | 3 | Só tem conexão não oficial, com risco de banimento do número |
| Manutenção a longo prazo | 3 | Um autor e código com várias camadas antigas misturadas (Flask + FastAPI, LangChain + Agents SDK). Vem com bibliotecas pesadas de aprendizado de máquina (transformers, scipy) que um agente de atendimento não usa |
| Facilidade para você (não programador) | 4 | As telas são bonitas, mas instalar e manter o servidor exige programador |

## 4. O que vale copiar: a "ficha do agente"

O arquivo `backend/agents_sdk/agent_builder/schemas.py` define a ficha. O `prompt_compiler.py` transforma a
ficha num prompt dividido em seções fixas. Em resumo:

| Seção da ficha | O que contém |
|---|---|
| Identidade | nome, papel, idioma, tom, tipo de negócio |
| Canal | WhatsApp, estilo das mensagens, máximo de frases por resposta, fuso horário |
| Objetivo | meta principal, o que é sucesso, o que é fracasso |
| Técnica | regras de conversa, restrições, método de qualificação (BANT, SPIN...) |
| Exemplos | pares "cliente disse / agente respondeu" |
| Objeções | "achou caro" → estratégia de resposta |
| Política de ferramentas | quando usar cada ferramenta, o que ela exige, se tem efeito colateral, se pode repetir |
| Passagem para humano | para quem e quando |
| Travas (guardrails) | checagens antes e depois da IA: bloquear, transferir, esconder dado |
| Modelo | qual modelo, temperatura, esforço de raciocínio |

**O que vamos fazer diferente (e melhor):**
1. **Travas no código, não só no prompt.** Na ficha deles, a maioria das travas vira texto para a IA
   obedecer. No seu agente, "nunca inventar preço" é garantido por código, e isso fica.
2. **Números fora do prompt.** O seu `REGRAS-DE-ATENDIMENTO.md` já faz isso certo: preço, agenda e condição
   vêm do sistema do cliente, toda vez. O prompt só diz *como agir*.
3. **Toda ficha passa pela bateria de testes** antes de ir ao ar. Lá não existe isso.

## 5. Como montar um agente profissional (as camadas)

Cada informação mora num lugar só. É o que deixa o agente barato, previsível e fácil de replicar.

| Camada | Onde mora | Exemplo na Aurora | Muda por cliente? |
|---|---|---|---|
| 1. **Travas** (o que nunca pode acontecer) | Código (`regras-fixas.ts` + checagens antes e depois da IA) | não inventar R$; parar se pedir "não me mande mais" | Não, só se liga ou desliga |
| 2. **Identidade e objetivo** | Ficha → topo do prompt | "Você é a Cecília, da Aurora; meta: chegar a uma proposta" | Sim |
| 3. **Regras de atendimento** (como agir) | Ficha → prompt, em lista numerada curta | "achou caro: 1) menos horas; 2) sem vidraria" | Sim |
| 4. **Conhecimento** (perguntas frequentes, políticas) | Base de conhecimento no painel, **consultada pelo agente por ferramenta** quando precisa | "vocês levam gelo?" | Sim |
| 5. **Dados vivos** (preço, agenda, estoque) | Sistema do cliente, lido pela API | pacotes e calculadora do CRM | Integração muda |
| 6. **Ferramentas** | Código, com descrição de "quando usar" | criar proposta, transferir, consultar agenda | Escolhe da lista |
| 7. **Exemplos** | Ficha → final da parte fixa do prompt | 3 a 5 conversas-modelo | Sim |
| 8. **Situação atual** | Montada a cada mensagem, **no fim** do prompt | "proposta em rascunho; data 12/06 bloqueada" | Automático |
| 9. **Bateria de avaliação** | `avaliacao/`: situações + resultado esperado | "insiste no preço → passa para a equipe" | Base comum + casos do cliente |

**Regras de ouro para modelos baratos (OpenAI):**
- **Prompt curto e fixo primeiro, a parte que muda por último.** A OpenAI cobra menos pela parte repetida
  (cache). O seu `prompt.ts` já segue isso.
- **Conhecimento grande não vai no prompt.** Hoje todo o conhecimento entra em toda mensagem. Com 10
  perguntas tudo bem. Com 200, fica caro e o modelo se perde. Solução: uma ferramenta "consultar
  conhecimento".
- **Exemplos valem mais que explicação.** Um bom exemplo de "cliente achou caro" ensina mais que um
  parágrafo de instruções.
- **Toda regra crítica tem teste.** Mudou a ficha, roda a bateria: 15 situações, menos de US$ 0,05.

## 6. A plataforma "plug and play" que eu recomendo

```
Ficha do cliente (preenchida no painel, ou por mim pela API do painel)
        │
        ▼
Núcleo do agente (o mesmo para todos)  ──►  travas em código
        │                                  ferramentas: CRM, Google Agenda, transferir
        ▼
Cloudflare Think (um agente por cliente, uma memória por conversa)
        │
        ▼
WhatsApp oficial da Meta
```

- **Um painel para vários clientes:** cada cliente tem a ficha, o conhecimento, as integrações e o número de
  WhatsApp dele. Hoje o painel é só da Aurora. Torná-lo multi-cliente é a maior mudança.
- **Integrações como "peças":** CRM da Aurora, Google Agenda e, no futuro, outros. A ficha diz quais peças o
  agente usa.
- **API do painel para mim:** criar cliente, preencher a ficha, subir conhecimento, rodar a bateria. Assim eu
  opero por dentro, sem mexer em código, e você só confere nas telas.

## 7. Skills (as receitas) e a ordem de construção

| # | Skill | Faz | Só termina quando |
|---|---|---|---|
| 1 | `novo-cliente` | Entrevista você sobre o cliente e gera a ficha | a ficha passa na validação |
| 2 | `montar-conhecimento` | Organiza o material do cliente (PDF, site, perguntas) na base | cada item tem título e fonte |
| 3 | `conectar-whatsapp` | Passo a passo na Meta: número, token permanente, webhook | mandou e recebeu uma mensagem de teste |
| 4 | `conectar-agenda` | Liga o Google Agenda do cliente | leu os horários livres e marcou e apagou um evento de teste |
| 5 | `conectar-sistema` | Liga o CRM ou o sistema do cliente pela API | leu um dado de teste |
| 6 | `testar-agente` | Roda a bateria (base + casos do cliente) | passou em 100% das travas |
| 7 | `publicar` | Põe no ar no Cloudflare | conferiu tamanho, saúde e uma conversa real |
| 8 | `ajustar-agente` | Muda regra, tom ou exemplo | a bateria passou de novo |

**Ordem de construção:**
1. Terminar o agente da Aurora no Cloudflare Think (`PASSAGEM-PARA-THINK.md`). É o cliente piloto.
2. Reorganizar o prompt nas camadas da seção 5, com a ficha, e o conhecimento como ferramenta.
3. Painel multi-cliente + API do painel.
4. Integração com o Google Agenda.
5. Escrever as skills 1 a 8 e o `docs/MANUAL.md`, testando cada uma com um **segundo cliente fictício** do zero.

## 8. O que eu preciso de você

- Confirmar a recomendação: **não adotar** a plataforma e copiar a ficha.
- O "template de agente" da outra conversa não chegou. Se era o modelo inicial do Cloudflare Think, não precisa
  mandar. Se era outra coisa, mande o link ou o arquivo.
