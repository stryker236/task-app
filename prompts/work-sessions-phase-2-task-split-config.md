# Phase 2 Prompt - Split Config Na Task

Quero implementar a Fase 2 do plano `Work Sessions And Split Scheduling`.

Referências:
- `docs/analysis/work-sessions-and-split-scheduling-plan.md`
- Fase 1 já deve existir: `task_work_sessions` e métricas de progresso parcial.

Objetivo desta fase:
Permitir configurar numa task se ela pode ser dividida em sessões, sem ainda exigir que o scheduler gere vários blocos automaticamente.

## Modelo de dados

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
- `split_target_minutes`: tamanho ideal de cada sessão.
- `split_min_minutes`: menor sessão aceitável.
- `split_max_minutes`: maior sessão aceitável.

Validações:
- `scheduling_mode` default `single`.
- `split_*` podem ser nullable para tasks `single`.
- Para tasks `split`, validar:
  - `split_min_minutes > 0`
  - `split_target_minutes >= split_min_minutes`
  - `split_max_minutes >= split_target_minutes`
  - respeitar limites práticos do scheduler, por exemplo 15 a 240 minutos por bloco

## Backend

Atualizar:
- mappers DB/API de tasks
- validação de create/update task
- shared types
- responses usadas por task list/detail/advisor

Calcular e devolver:
- `completedWorkMinutes`
- `plannedFutureWorkMinutes`
- `remainingWorkMinutes`
- `effectiveSchedulingMode`
- `effectiveSplitConfig`

Nesta fase, se uma task `split` for enviada para scheduling:
- ainda pode ser agendada como apenas o próximo bloco
- `durationMinutes` enviado ao Python deve ser baseado em `remainingWorkMinutes` limitado pelo split config
- exemplo: `durationMinutes = min(remainingWorkMinutes, split_target_minutes ou split_max_minutes)`

Não gerar múltiplos blocos ainda.

## Frontend

Atualizar task form/detail:
- permitir escolher modo `single`/`split`
- permitir configurar min/target/max chunk
- mostrar estado `Esta task pode ser dividida em sessões`
- mostrar remaining work vindo das work sessions

UX:
- esconder campos split quando modo é `single`, ou mostrar colapsado
- deixar claro que estimated duration é duração total estimada, não duração do próximo bloco
- due date continua deadline
- scheduled events/work sessions continuam separados

## Scheduler/Advisor

Atualizar preparação do payload no Node:
- se task é `single`, comportamento igual ao atual
- se task é `split`, enviar duração do próximo bloco, não a duração total restante se exceder max/target
- manter `taskId` original
- preview deve indicar que está a agendar uma sessão/bloco da task

Python deve poder continuar sem alterações grandes nesta fase.

## Critérios de aceitação

- Consigo marcar uma task como `split`.
- Consigo configurar min/target/max chunk.
- Task detail mostra config split e remaining work.
- Scheduler propõe no máximo um próximo bloco para uma task split nesta fase.
- O bloco proposto respeita a config de chunk.
- Commit cria work session como na Fase 1.
- Build/typecheck relevantes passam.

## Fora do escopo desta fase

Não implementar ainda:
- `split_task` como rule global
- multi-block scheduling automático
- múltiplos eventos para a mesma task numa só proposta