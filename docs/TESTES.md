# Testes feitos

Esta lista cresce a cada fase. "Passou" = rodou e deu certo. "Fora" = não testado, com o motivo.

## Fase 1: painel com login, configurações e conhecimento (15/11/2026)

### Regras do banco: `npm run test:banco` (Postgres embutido, sem internet)

**28 testes, 28 passaram.** O schema e os dados iniciais rodam **duas vezes** seguidas, como prova de que podem ser executados de novo sem estragar nada.

| Grupo | O que foi conferido |
|---|---|
| Pessoas e papéis | O 1º login vira gestor. Quem entra sem cadastro fica bloqueado. O gestor cadastra a atendente, e o login dela é ligado sozinho. A atendente não cadastra ninguém nem muda papéis. Não dá para ficar sem gestor nem mudar o próprio papel. |
| Dados iniciais | As instruções sugeridas entram uma vez, como "versão 1 (sistema)". Os 15 itens de conhecimento do site entram **sem nenhum alerta de preço**. Rodar de novo não duplica nada. |
| Configuração e versões | Cada alteração cria uma versão com a lista do que mudou. Salvar sem mudar nada não cria versão. Voltar a uma versão cria uma versão nova igual à escolhida. A atendente não altera, não volta versão e não vê o histórico. Valores fora do limite são recusados. |
| Conhecimento | Texto com R$, %, desconto ou forma de pagamento ganha alerta. Texto comum não ganha. O alerta reaparece ao editar. Excluir guarda o texto anterior no registro. A atendente só lê. |
| Chaves | Só o gestor salva. **Ninguém lê a tabela de chaves**, nem o gestor nem um visitante. A tela mostra só os 4 últimos caracteres. O texto cifrado nunca vai para o registro. Formato inválido é recusado. |
| Emergência | A atendente pausa e só o gestor religa. Ninguém altera a pausa direto na tabela. |
| Visitante | Sem login, não lê nenhuma tabela. |

### Supabase local de verdade (Docker)

| Teste | Resultado |
|---|---|
| `schema.sql` + `dados-iniciais.sql` aplicados 2 vezes num Supabase completo (Postgres 17, Auth, API) | Passou |

### Navegador (Playwright), painel compilado para produção, contra o Supabase local

| Teste | Resultado |
|---|---|
| Login do André (1º acesso vira gestor) → Visão geral | Passou |
| Agente: salvar cria nova versão | Passou |
| Conhecimento: texto com "R$ 45,00", "30%" e "PIX" mostra o alerta antes de salvar, salva com alerta e aparece no filtro "Com alerta" | Passou |
| Conhecimento: desativar e excluir (com confirmação) | Passou |
| Transferência: horário com fim antes do início é recusado; o certo salva | Passou |
| Integrações: chave do CRM salva **criptografada**; a tela mostra só "…ab12" | Passou |
| Integrações: "Testar conexão" sem CRM no ar mostra uma mensagem clara e grava o resultado | Passou |
| Integrações: token de verificação gerado e mostrado uma única vez | Passou |
| Equipe: cadastrar atendente | Passou |
| Registro: voltar a uma versão anterior; a chave não aparece em lugar nenhum do registro | Passou |
| Botão de emergência: pausar com motivo → faixa vermelha | Passou |
| Atendente no **1º acesso** (celular 390 px): vê a faixa, não vê "Religar", tela Agente só leitura, Integrações bloqueada | Passou (após correção) |
| Gestor religa o agente | Passou |
| Celular 390 px sem rolagem para os lados | Passou |
| Conhecimento: ler o PDF real da proposta da Aurora (11 MB, 11 páginas) no navegador → 4.534 caracteres de texto, com alerta de preço (o PDF tem valores em R$) | Passou |
| Erros no console do navegador | Nenhum |

### Construção

| Teste | Resultado |
|---|---|
| `tsc --noEmit` (tipos) | Passou |
| `eslint` | Passou, sem avisos |
| `next build` | Passou |
| Pacote para o Cloudflare (`opennextjs-cloudflare build` + `wrangler deploy --dry-run`) | **2,49 MB compactado** (limite do plano grátis: 3 MB) |

### Problemas encontrados e corrigidos durante os testes

1. **1º acesso de uma pessoa:** a tela inicial podia carregar antes de o login ser ligado ao cadastro, e a faixa de "agente pausado" não aparecia.
   - Correção: o login liga o cadastro na hora da entrada, e todas as leituras esperam o perfil.
2. **"Versão 1" vazia:** a criação do banco gerava uma versão sem conteúdo. Voltar para ela apagaria as instruções.
   - Correção: a criação vira a versão 0 (fora da lista), e a 1ª versão é a dos dados iniciais.
3. **Alerta falso:** a palavra "brinde" (de "um brinde ao seu melhor momento") disparava o alerta "desconto ou brinde".
   - Correção: "brinde" saiu da regra, e o alerta passou a se chamar "desconto ou cortesia".
4. **PDF de 11 MB recusado:** o limite era 10 MB e a própria proposta da Aurora passa disso.
   - Correção: o limite subiu para 25 MB. O arquivo é lido no navegador e só o texto vai para o banco.
5. **Dados iniciais pelo `psql`:** a descrição da versão se perdia.
   - Correção: o arquivo roda dentro de uma transação.

### Ficou de fora nesta fase

| Item | Motivo |
|---|---|
| "Testar conexão" com o CRM, a OpenAI e a Meta **de verdade** | Esta sessão não alcança esses endereços: o CRM ainda não foi publicado, e `api.openai.com` e `graph.facebook.com` estão bloqueados aqui. As mensagens de erro foram testadas, mas o caminho de sucesso não. |
| Importar página do site | O endereço do site está bloqueado nesta sessão. A extração de texto foi conferida no código do site (zip v4). |
| Recuperação de senha por e-mail | Código igual ao do CRM, que já foi testado lá. |
