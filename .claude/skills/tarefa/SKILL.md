---
name: tarefa
description: Conduz uma tarefa de código neste repo do começo ao fim, seguindo o procedimento acordado com o dono do projeto — plano aprovado, branch, commits por passo, validação em escopo mínimo, /code-review + /security-review e PR. Use sempre que o pedido for implementar, corrigir, refatorar ou alterar código em cal.diy, e também quando o usuário digitar /tarefa.
---

# Tarefa: criação e execução

Fluxo obrigatório para trabalho de código neste repo. As convenções vivem em `CLAUDE.md`
(seção "Procedimento de criação e execução de tarefas") — esta skill é o roteiro executável delas.

Quatro fases com **portões**: não avance sem cumprir o portão da fase anterior.

## Pré-voo (uma vez, antes da Fase 1)

```bash
git branch --show-current
git status --short
git config --local user.email   # deve ser ricardoff565@gmail.com, não o endereço @syngenta
```

- Se `user.email` local não for o pessoal: `git config --local user.name rferreira-z && git config --local user.email ricardoff565@gmail.com`.
- Se houver trabalho não commitado alheio à tarefa, pergunte antes de mexer.
- Abra um ledger de achados fora do escopo no scratchpad da sessão (`achados-fora-de-escopo.md`).
  Ele alimenta o corpo do PR na Fase 4.

## Fase 1 — Criação (plano aprovado)

O pedido no chat é a fonte de verdade. **Não** crie issue para rastrear a tarefa.

1. Reafirme o escopo em uma ou duas frases: o que muda, o que explicitamente fica fora.
2. Explore o código de verdade (leia os arquivos envolvidos; não planeje de memória).
3. Entre em plan mode e apresente o plano em passos lógicos numerados — cada passo é um
   commit futuro. Inclua como cada passo será validado.
4. **Portão:** só execute após OK explícito do usuário (`ExitPlanMode` aprovado).

Se o pedido for ambíguo de um jeito que mude materialmente o trabalho, pergunte antes de planejar.

## Fase 2 — Execução

1. **Branch.** Se estiver na `main`, crie: `git checkout -b <tipo>/<descricao-curta>`
   (`fix/`, `feat/`, `chore/`, `refactor/`, `test/` + kebab-case; ex.: `fix/timezone-slots-dst`).
   **Nunca commite na `main`.**
2. Execute passo a passo do plano. Ao concluir cada passo:
   - commit em conventional commits, em **inglês**, escopo do pacote quando houver
     (ex.: `fix(features): keep organizer tz when generating slots`);
   - rodape obrigatório: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`;
   - **marco:** uma linha curta ao usuário dizendo o passo concluído e o próximo. Não execute em silêncio.
3. **Fora do escopo:** bug ou código ruim que você encontrar no caminho vai para o ledger — **reporte, não corrija**. O diff fica dentro do que foi pedido.
4. **Portão de desvio:** se o plano se mostrar errado ou incompleto, **pare**, explique o que mudou
   e espere novo OK. Não siga com um plano alterado por conta própria.

Código novo de data/hora usa `@calcom/dayjs`; persistência em UTC; ver `CLAUDE.md` para os defaults
de fuso, granularidade de slots e antecedência mínima.

## Fase 3 — Validação

Sempre em **escopo mínimo: só os pacotes tocados.** Nunca a suíte completa do root.

```bash
yarn workspace @calcom/<pkg> type-check
yarn workspace @calcom/<pkg> lint
TZ=UTC yarn vitest run <caminho/do/arquivo.test.ts>
```

1. Type-check + lint dos pacotes afetados.
2. Testes unitários dos pacotes afetados. **Correção de bug exige teste novo que cubra o bug**
   (falhando antes do fix).
3. **Rodar o app e verificar na UI.** `yarn dev` (ou a skill `run`) e confirme o comportamento na
   tela — teste verde não substitui isso. Se não der para verificar, diga explicitamente e registre
   como lacuna para o PR.

**Portão:** nada de "pronto" com type-check, lint ou teste vermelho. Reporte a saída real da
falha em vez de contornar.

## Fase 4 — Encerramento

1. `/code-review` no diff — corrija o que aparecer (novos commits, mesmo padrão).
2. `/security-review` nas mudanças da branch.
3. Push e PR **no fork, nunca no parent `jaya`**:
   ```bash
   git push -u origin HEAD
   gh pr create -R rferreira-z/cal.diy --base main --title "<conventional commit em inglês>" --body-file <arquivo>
   ```
   `gh` resolveria o base para `jaya/cal.diy` sozinho — o `-R` não é opcional.
4. Corpo do PR em **inglês**, com estas seções:
   - **What changed** — resumo e por quê.
   - **Validation** — comandos rodados e o que foi conferido na UI.
   - **Not validated / out of scope** — obrigatória: o que não rodou, lacunas conhecidas, e os
     achados do ledger. Nunca omita esta seção; se não houver nada, escreva "none".
5. Entregue o link do PR e o resumo final ao usuário, em português.

## Regras que não se negociam

- Plano aprovado antes de código; parar e revalidar quando o plano furar.
- Nunca commitar na `main`; PR sempre em `rferreira-z/cal.diy`.
- Inglês no repo (commits, PR, comentários de código); português no chat.
- Fora do escopo se reporta, não se corrige.
- Reporte fiel: se algo não foi validado ou ficou de fora, diga qual e por quê.
