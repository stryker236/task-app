# Phase 4 Prompt - Multi-Block Scheduling

Quero implementar a Fase 4 do plano `Work Sessions And Split Scheduling`.

Referências:
- `docs/analysis/work-sessions-and-split-scheduling-plan.md`
- Fase 1: `task_work_sessions`
- Fase 2: split config na task
- Fase 3: `split_task` constraint

Objetivo desta fase:
Permitir que uma task grande gere vários blocos/eventos/work sessions numa mesma proposta de scheduling.

## Mudança De Contrato

Hoje:

```txt
1 task -> 1 scheduled item
```

Depois:

```txt
1 task -> N scheduled items
```

Resposta esperada, ou equivalente compatível:

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

Preservar compatibilidade onde possível. Se for necessário alterar types/API, atualizar todos os callers.

## Estratégia Recomendada

Usar abordagem inicial:

```txt
Node expande uma task split em múltiplos candidatos simples.
Python agenda candidatos simples.
Node reagrupa os resultados por task original.
```

Evitar reescrever o algoritmo Python nesta fase, salvo se for claramente necessário.

## Backend

Ao preparar scheduler candidates:
- calcular `remainingWorkMinutes`
- resolver effective split config
- gerar candidatos artificiais por bloco, por exemplo:
  - `split:<taskId>:1`
  - `split:<taskId>:2`
- cada candidato tem:
  - referência para `originalTaskId`
  - `sessionIndex`
  - `durationMinutes`
  - due date da task original
  - constraints aplicáveis herdadas da task original

Regras:
- respeitar `maxChunksPerDay`
- respeitar `minimum_spacing`, quando existir
- respeitar due date
- respeitar `deadline_buffer`, quando existir
- respeitar `max_tasks_per_day`
- respeitar `max_scheduled_minutes_per_day`
- não gerar blocos além de `remainingWorkMinutes`
- não gerar blocos que dupliquem future planned sessions já existentes

Commit:
- cada bloco aceite cria um Google Calendar event
- cada bloco aceite cria uma `task_work_session`
- cada work session aponta para o respetivo `task_calendar_event_id`
- idempotência por task/session/run para evitar duplicados
- due date não muda

## Python Scheduler

Idealmente continuar simples:
- recebe candidatos já expandidos
- agenda cada candidato como se fosse uma task normal
- respeita busy intervals e constraints existentes
- devolve scheduled/reserved/unscheduled

Se necessário, adicionar campos opcionais ao retorno:
- `originalTaskId`
- `sessionIndex`
- `plannedMinutes`

Mas se Node conseguir mapear pelo id artificial, pode evitar alterar o Python.

## Frontend

Advisor preview:
- agrupar vários blocos da mesma task
- mostrar cada bloco com data/hora/duração
- permitir selecionar:
  - todos os blocos da task
  - só alguns blocos
  - blocos por dia
  - seleção custom global

Calendar preview:
- mostrar blocos como eventos separados
- deixar claro que pertencem à mesma task
- manter pausas com cor distinta

Task detail:
- mostrar sessões planeadas e completadas
- mostrar tempo restante depois das sessões futuras/feitas

Scheduled review:
- cada bloco é revisto individualmente
- se um bloco for `missed`, só esse bloco é marcado como missed
- se um bloco for `completed`, só esse bloco contribui para completed minutes

## Critérios de aceitação

- Uma task de 5h pode gerar vários blocos numa proposta.
- Os blocos respeitam min/target/max chunk.
- Os blocos respeitam capacidade diária e spacing.
- Cada bloco aceite vira evento + work session.
- Consigo aceitar subset de blocos.
- Task detail mostra progresso correto depois do commit.
- Review funciona por bloco individual.
- A task continua elegível enquanto `remainingWorkMinutes > 0`.
- A task deixa de ser elegível quando não há remaining work ou está done/cancelled/archived.
- Build/typecheck/testes relevantes passam.

## Riscos A Verificar

- Não criar eventos duplicados no Google Calendar.
- Não contar planned future work como completed work.
- Não deixar um bloco missed bloquear a task para sempre.
- Não misturar due date com scheduled time.
- Não tornar o preview difícil de usar quando uma task gera muitos blocos.