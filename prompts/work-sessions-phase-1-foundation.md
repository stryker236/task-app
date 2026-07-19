# Phase 1 Prompt - Work Sessions Foundation

Quero implementar a Fase 1 do plano `Work Sessions And Split Scheduling`.

Referência principal:
- `docs/analysis/work-sessions-and-split-scheduling-plan.md`

Objetivo desta fase:
Criar a fundação de `task_work_sessions` para representar trabalho planeado/feito por blocos, sem ainda implementar split automático multi-bloco.

## Semântica

Separar claramente:

```txt
task = objetivo/trabalho total
calendar event = bloco de tempo agendado
work session = trabalho planeado/feito dentro de um bloco
review = confirmação do que aconteceu depois do bloco
```

`dueDateTime` continua a ser apenas deadline. Não deve ser atualizado por commit de calendário.

## Modelo de dados

Adicionar migration para tabela:

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

Regras:
- `task_id` referencia `tasks(id)` com `ON DELETE CASCADE`.
- `task_calendar_event_id` referencia `task_calendar_events(id)` com comportamento adequado para preservar histórico quando possível.
- `planned_end_at > planned_start_at`.
- `planned_minutes > 0`.
- `completed_minutes >= 0`.
- `completed_minutes` pode ser menor que `planned_minutes` para `partially_completed`.
- Criar indexes por `task_id`, `task_calendar_event_id`, `status`, `planned_start_at`.

## Backend

Implementar funções DB/API necessárias para:
- criar work session ao commitar evento de task
- listar work sessions por task
- derivar métricas por task:
  - `completedWorkMinutes`
  - `plannedFutureWorkMinutes`
  - `remainingWorkMinutes`
  - `workSessions[]`

Ao commitar um evento de task:
- criar `task_calendar_events`
- criar `task_work_sessions` com `status = planned`
- associar a work session ao `task_calendar_event_id`
- `planned_minutes` deve vir da duração do evento
- `completed_minutes = 0`
- não mexer em `dueDateTime`

Na review de scheduled task:
- se review `completed`, marcar work session como `completed` e `completed_minutes = planned_minutes`, salvo se houver input explícito diferente
- se review `missed`, marcar work session como `missed` e `completed_minutes = 0`
- se for necessário, suportar `partially_completed` com `completed_minutes` manual
- notas/feedback devem ficar associados à work session e ao evento/review quando aplicável

## API/Types

Atualizar types partilhados e responses de task para incluir scheduling/work session info derivada.

Evitar duplicar lógica complexa no frontend. O backend deve devolver os campos derivados quando possível.

## Frontend

No detalhe da task, adicionar secção `Work sessions` com:
- tempo estimado
- tempo feito
- tempo planeado futuro
- tempo restante
- sessões passadas/futuras
- estado de cada sessão
- link/evento associado quando existir

Na view `A rever`:
- ao marcar feita/não feita, atualizar também a work session associada
- manter due date separada do scheduled time

## Critérios de aceitação

- Committar evento de task cria `task_calendar_events` e `task_work_sessions`.
- Task detail mostra work sessions e métricas de progresso parcial.
- Review `completed` aumenta minutos feitos.
- Review `missed` não aumenta minutos feitos.
- Task mostra progresso real separado de due date e scheduled event.
- Tasks com evento futuro continuam scheduled.
- Eventos passados revistos não bloqueiam novo scheduling.
- Build/typecheck relevantes passam.

## Fora do escopo desta fase

Não implementar ainda:
- `split_task` constraint
- multi-block scheduling
- scheduler a devolver vários blocos para a mesma task
- alterações grandes no algoritmo Python