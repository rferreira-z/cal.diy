# CLAUDE.md

Convenções deste projeto. Instruções aqui têm precedência sobre comportamentos padrão.

## Horário comercial e fusos

Decisões de produto/engenharia definidas pelo dono do projeto (entrevista de 2026-09-01).

### Horário comercial padrão

- Padrão quando o usuário não configurou nada: **09:00–17:00, segunda a sexta** (mantém o default do Cal.com upstream — não alterar).
- Sem pausa de almoço bloqueada por padrão.

### Fuso horário

- Fallback quando não há fuso do usuário: **`America/Sao_Paulo`**.
- **Fuso do organizador manda** no cálculo de disponibilidade. Os slots são gerados no fuso do organizador e apenas convertidos para exibição ao convidado — nunca o contrário.
- Respeitar **DST** sempre via IANA tz database (nunca offset fixo). O Brasil não tem DST desde 2019, mas o produto atende outros fusos.
- **Feriados não são bloqueados automaticamente**; é responsabilidade do usuário marcar indisponibilidade.

### Armazenamento e conversão

- Persistir **sempre em UTC** no banco.
- Converter para o fuso local **apenas na borda**: UI, e-mails, webhooks e exports. Nenhuma conversão no meio da lógica de domínio.
- Em código novo, usar **`@calcom/dayjs`** (`packages/dayjs`) — o wrapper interno já traz os plugins `utc`/`timezone` configurados. Não importar `dayjs` direto nem introduzir `date-fns`/`date-fns-tz` em código novo (o uso existente em `packages/ui` e `packages/features` é legado).

### Exibição

- Formato **24h** como padrão (ex.: `14:00`).
- **Sempre mostrar a sigla do fuso** junto ao horário (ex.: `14:00 (BRT)`), inclusive quando organizador e convidado estão no mesmo fuso.

### Limites de agendamento

- **Antecedência mínima: 24 horas.** Nenhum agendamento novo com menos de 24h de aviso.
- **Granularidade dos slots: 30 minutos.**
- **Sem buffer padrão** antes/depois das reuniões — fica por conta da configuração do usuário.

## Procedimento de criação e execução de tarefas

Definido pelo dono do projeto (entrevista de 2026-09-08). Vale para toda tarefa neste repo.

### 1. Criação

- A fonte de verdade é o **pedido direto no chat**. Não há backlog externo; não criar issue para rastrear a tarefa.
- **Plano aprovado antes de codar, sempre.** Explorar, apresentar o plano e só executar após OK explícito (plan mode).
- Se no meio da execução o plano se mostrar errado ou incompleto: **parar, explicar o que mudou e esperar novo OK**. Não seguir adiante com plano alterado por conta própria.

### 2. Execução

- **Branch:** `tipo/descricao-curta` em kebab-case (ex.: `fix/timezone-slots-dst`, `feat/booking-buffer`). Nunca commitar na `main`.
- **Commits:** um commit por passo lógico do plano, em conventional commits (padrão do histórico do repo).
- **Escopo:** bug ou código ruim encontrado fora do escopo é **reportado, não corrigido**. Listar os achados no resumo e no PR, mantendo o diff dentro do que foi pedido.
- **Reporte:** aviso curto a cada marco (passo lógico) concluído — não executar em silêncio até o fim.

### 3. Validação (antes de considerar pronto)

Sempre no **escopo mínimo: apenas os pacotes tocados** — nunca a suíte completa do root.

1. **Type-check + lint** dos pacotes afetados (`yarn workspace @calcom/<pkg> type-check` / `lint`).
2. **Testes unitários** dos pacotes afetados (`TZ=UTC vitest run <caminho>`). Correção de bug exige teste novo cobrindo o bug.
3. **Rodar o app e verificar na UI** — subir o dev server e confirmar o comportamento na tela; teste verde não substitui isso.

### 4. Encerramento

1. Rodar **`/code-review`** no diff e corrigir o que aparecer.
2. Rodar **`/security-review`** nas mudanças da branch.
3. Abrir o **PR em `rferreira-z/cal.diy`** (nunca no parent `jaya`) e entregar o link.
4. O corpo do PR deve listar explicitamente **o que NÃO foi validado**: o que não rodou, lacunas conhecidas, o que ficou fora do escopo.

### Idioma

- **Inglês** em tudo que vai para o repo: commits, título/corpo de PR, comentários de código.
- **Português** na conversa no chat.
