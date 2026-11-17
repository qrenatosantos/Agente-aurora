# Como trabalhar com o Claude neste projeto (guia rápido do Renato)

## Começar uma sessão nova (o único passo manual)

1. No claude.ai/code, clique em **nova sessão**.
2. Escolha o repositório **`qrenatosantos/Agente-aurora`**.
3. No seletor de **ambiente**, escolha **`Agente-aurora`**, e não o `Default`.
   É nesse ambiente que estão guardadas as chaves da **Cloudflare** e da **OpenAI**. No `Default`, o Claude
   fica sem acesso e não consegue publicar nada.
4. Escolha o esforço: **alto** para planejar e **médio** para executar.
5. Escreva o pedido. Não precisa colar resumo nenhum: o Claude lê sozinho o `CLAUDE.md` e os documentos de `docs/`.

## O que já vem automático em toda sessão

| O quê | De onde vem | Precisa fazer algo? |
|---|---|---|
| Regras do projeto | `CLAUDE.md` (no repositório) | Não |
| Plugins (Cloudflare, Context7, Playwright, Claude Code Setup) | Sua conta do claude.ai | Só instalar **uma vez** |
| Conectores / MCPs (GitHub, Google Drive...) | claude.ai → Configurações → Conectores | Só ligar **uma vez** |
| Chaves (Cloudflare, OpenAI, Meta) | Ambiente `Agente-aurora` | Só escolher o ambiente certo |
| Skills do projeto (quando existirem) | pasta `.claude/skills/` do repositório | Não. Use digitando `/nome-da-skill` |

## Como "acionar" um plugin

Você não aciona. Instalado na conta, ele já está disponível, e o Claude usa quando a tarefa pede. Se quiser forçar
uma skill, digite `/` e o nome dela (por exemplo, `/claude-automation-recommender`).

## Para gastar menos

- Um assunto por sessão. Terminou, abra outra.
- Ao fim de cada trabalho grande, peça: "salve uma passagem em `docs/`". A próxima sessão começa dali.
