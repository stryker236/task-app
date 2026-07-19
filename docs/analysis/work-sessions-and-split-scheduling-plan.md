# Work Sessions And Split Scheduling Plan

Objetivo: preparar a app para dividir tasks grandes em várias sessões de trabalho, sem perder a separação entre deadline, evento de calendário e progresso real.

Ideia central:

```txt
task = objetivo/trabalho total
calendar event = bloco de tempo agendado
work session = trabalho planeado/feito dentro de um bloco
review = confirmação do que aconteceu depois do bloco
```

A ordem importante é: primeiro a app precisa de saber medir sessões/progresso parcial; só depois o scheduler deve começar a gerar vários blocos para a mesma task.

## Fase 1 - Work Sessions Foundation

Objetivo: criar o modelo base para trabalho planeado/feito por blocos.

Adicionar tabela:

```txt
task_work_sessions
- id
- task_id
- task_calendar_event_id nullable
- status: planned / completed / partially_completed / missed / cancelled
- planned_start_at
- planned_end_at
- planned_minutes
- completed_minutes
- note
- feedback jsonb
- created_at
- updated_at
```

Backend:

- Ao commitar um evento de task, criar `task_calendar_events` + `task_work_sessions`.
- Uma work session futura com status `planned` conta como trabalho planeado.
- Uma work session `completed` ou `partially_completed` conta para progresso.
- Uma work session `missed`/`cancelled` não conta como progresso.
- A task passa a devolver:
  - `estimatedMinutes`
  - `completedWorkMinutes`
  - `plannedFutureWorkMinutes`
  - `remainingWorkMinutes`
  - `workSessions[]`

UI:

- Task detail ganha secção `Work sessions`.
- Mostrar:
  - tempo estimado
  - tempo feito
  - tempo planeado futuro
  - tempo restante
  - sessões passadas/futuras
- Na review de scheduled tasks, ao marcar feita/não feita, atualizar a work session.

Critério de aceitação:

- Committar evento cria work session.
- Review `completed` aumenta minutos feitos.
- Review `missed` não aumenta minutos feitos.
- Task mostra progresso real separado de due date e scheduled event.

## Fase 2 - Split Config Na Task

Objetivo: permitir dizer que uma task pode ser dividida, mesmo antes do scheduler gerar múltiplos blocos automaticamente.

Adicionar campos em `tasks`:

```txt
scheduling_mode: single / split
split_min_minutes
split_max_minutes
split_target_minutes
```

Semântica:

- `single`: scheduler tenta agendar a task como um bloco.
- `split`: task pode ser dividida em sessões.
- `split_target_minutes`: tamanho ideal do bloco.
- `split_min_minutes`: menor bloco aceitável.
- `split_max_minutes`: maior bloco aceitável.

Backend:

- Validar estes campos.
- Expor na API de tasks.
- Calcular `remainingWorkMinutes`.
- Se `scheduling_mode = split`, o scheduler ainda pode inicialmente agendar apenas um próximo bloco, não todos.

UI:

- Task form/detail permite escolher:
  - modo: `single`/`split`
  - min/target/max chunk
- Mostrar aviso/estado: `Esta task pode ser dividida em sessões.`

Critério de aceitação:

- Consigo marcar uma task como split.
- Consigo configurar tamanho dos blocos.
- A task mostra remaining work com base nas sessions.

## Fase 3 - Constraint `split_task`

Objetivo: permitir regras globais por tags/status/etc. para aplicar split automaticamente.

Adicionar constraint type:

```txt
split_task
```

Payload:

```json
{
  "minChunkMinutes": 30,
  "targetChunkMinutes": 60,
  "maxChunkMinutes": 90,
  "maxChunksPerDay": 1
}
```

Scope normal:

```json
{
  "tags": ["side-project"]
}
```

Semântica:

- Esta regra não escolhe slot diretamente.
- Ela altera a forma como a task é transformada em candidatos para o scheduler.
- Pode funcionar como default para tasks que ainda não têm config explícita.
- Config explícita da task ganha prioridade sobre constraint global.

Backend:

- Adicionar ao catálogo de constraint types.
- Adicionar validação manual.
- Atualizar prompt/interpreter.
- Resolver constraints aplicáveis à task.
- Ao preparar payload para Python:
  - se task é split, enviar duração do próximo chunk em vez da task inteira
  - numa primeira versão, gerar apenas um bloco por task
  - numa versão posterior, gerar vários candidatos/blocos

Python:

- Fase inicial: não precisa saber muito sobre split.
- Recebe candidatos já com `durationMinutes` calculado pelo Node.
- Mais tarde pode suportar multi-block nativo.

UI:

- Rules editor suporta `split_task`.
- Task detail mostra rule `split_task` em `Scheduling rules`.

Critério de aceitação:

- Posso criar regra “tasks #coding podem ser divididas em blocos de 90 min”.
- Uma task afetada mostra que é splittable.
- Scheduler agenda um bloco coerente com `targetChunkMinutes`/`maxChunkMinutes`.

## Fase 4 - Multi-Block Scheduling

Objetivo: uma task grande pode gerar vários eventos/work sessions automaticamente.

Alteração de contrato:

Hoje:

```txt
1 task -> 1 scheduled item
```

Depois:

```txt
1 task -> N scheduled items
```

Resposta possível:

```json
{
  "scheduled": [
    {
      "taskId": "task-a",
      "sessionIndex": 1,
      "start": "...",
      "end": "...",
      "plannedMinutes": 90
    },
    {
      "taskId": "task-a",
      "sessionIndex": 2,
      "start": "...",
      "end": "...",
      "plannedMinutes": 90
    }
  ]
}
```

Backend:

- Gerar múltiplos eventos para a mesma task.
- Criar uma `task_work_session` por evento.
- Evitar duplicados/idempotência por task/session/run.
- Respeitar:
  - `maxChunksPerDay`
  - `minimum_spacing`
  - due date
  - deadline buffer
  - max scheduled minutes per day
  - max tasks per day

Python:

Opção A:

```txt
Node expande task em múltiplos candidatos antes de chamar Python.
Python agenda candidatos simples.
```

Opção B:

```txt
Python recebe remainingMinutes e split config.
Python devolve múltiplos blocos.
```

Recomendação inicial: escolher Opção A. É mais simples e aproveita o scheduler atual.

UI:

- Advisor preview mostra vários blocos da mesma task agrupados.
- Commit permite selecionar:
  - todos os blocos da task
  - só alguns blocos
  - blocos por dia
- Task detail mostra sessões planeadas e completadas.

Critério de aceitação:

- Uma task de 5h pode ser proposta em blocos.
- Cada bloco vira evento + work session.
- O progresso da task sabe distinguir feito, planeado futuro e restante.
- Se um bloco passar e for `missed`, só aquele bloco é marcado `missed`.
- A task continua elegível enquanto `remainingWorkMinutes > 0`.

## Constraints Relacionadas

Fazer antes ou junto da fundação:

```txt
avoid_window
deadline_buffer
max_tasks_per_day
max_scheduled_minutes_per_day
minimum_spacing
```

Fazer com split:

```txt
split_task
```

Não fazer agora:

```txt
do_not_schedule
```

## Ordem Recomendada

1. Fase 1: `task_work_sessions`.
2. Fase 2: split config na task.
3. Constraints simples:
   - `avoid_window`
   - `deadline_buffer`
   - `max_tasks_per_day`
   - `max_scheduled_minutes_per_day`
   - `minimum_spacing`
4. Fase 3: `split_task`.
5. Fase 4: multi-block scheduling.

## Princípio De Design

Não deixar o scheduler inventar vários eventos antes da app saber medir progresso real.

Primeiro sessões, depois split.