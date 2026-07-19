# Phase 3 Prompt - Constraint `split_task`

Quero implementar a Fase 3 do plano `Work Sessions And Split Scheduling`.

Referências:
- `docs/analysis/work-sessions-and-split-scheduling-plan.md`
- Fase 1: `task_work_sessions`
- Fase 2: split config explícita na task

Objetivo desta fase:
Adicionar uma scheduler rule/constraint `split_task` para aplicar split automaticamente por scope, por exemplo tags/status/prioridade, sem ainda obrigar multi-block scheduling completo.

## Constraint Type

Adicionar ao catálogo:

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

Scope típico:

```json
{
  "tags": ["side-project"]
}
```

Categoria sugerida:

```txt
scheduling_shape
```

Semântica:
- Esta rule não escolhe diretamente um slot.
- Ela define como uma task pode ser transformada em um ou mais candidatos de scheduling.
- Nesta fase, pode gerar apenas o próximo bloco da task.
- Config explícita na task deve ganhar prioridade sobre `split_task` global.
- Se a task já tem `scheduling_mode = split`, usar a config da task primeiro.
- Se a task é `single`/sem config mas uma rule `split_task` aplica, usar a config da rule como effective split config.

## Backend

Atualizar:
- migration/catalog `scheduler_constraint_types`
- fallback constraint types no interpreter
- prompt do scheduler rule interpreter
- validação manual em `schedulerRuleRoutes`
- resolução de applicable rules no detalhe da task
- preparação do payload para o Python scheduler

Validações:
- `minChunkMinutes > 0`
- `targetChunkMinutes >= minChunkMinutes`
- `maxChunkMinutes >= targetChunkMinutes`
- `maxChunksPerDay >= 1` quando presente
- limites práticos: 15-240 minutos por chunk

Preparação do scheduler:
- resolver constraints aplicáveis à task
- determinar `effectiveSplitConfig`
- se aplicável, calcular `durationMinutes` do próximo bloco com base em remaining work
- manter task como um único candidato nesta fase

## Python Scheduler

Evitar alterar muito o Python nesta fase.

O Python pode continuar a receber uma task simples com `durationMinutes` já calculado pelo Node.

Adicionar suporte Python a `split_task` só se for útil para `appliedConstraintIds`; nesse caso, deve ser uma constraint não bloqueante que apenas aparece como aplicada quando relevante. O ideal é manter a lógica de shape no Node.

## Frontend

Atualizar editor de rules/constraints:
- mostrar `split_task`
- permitir editar min/target/max chunk e maxChunksPerDay

Task detail:
- mostrar `split_task` nas scheduling rules aplicáveis
- mostrar quando a task está a usar split por regra global vs config explícita

Advisor preview:
- quando uma task for agendada como bloco split, indicar isso de forma compacta

## Critérios de aceitação

- Posso criar/editar rule `split_task` manualmente.
- Interpreter consegue gerar `split_task` a partir de texto como “tasks #coding podem ser divididas em blocos de 90 minutos”.
- Uma task afetada mostra effective split config no detalhe.
- Scheduler agenda um próximo bloco coerente com a config.
- Config explícita da task ganha prioridade sobre rule global.
- Build/typecheck/testes relevantes passam.

## Fora do escopo desta fase

Não implementar ainda:
- múltiplos blocos por task na mesma resposta do scheduler
- agrupamento visual avançado de blocos no preview
- algoritmo Python multi-block nativo