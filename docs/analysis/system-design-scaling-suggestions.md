# System Design Scaling Suggestions

Contexto: esta nota assume que a app pode crescer de uma fase de teste com cerca de 20 pessoas para uma produção com cerca de 1000 pessoas.

O objetivo não é adicionar complexidade cedo demais. O objetivo é evitar decisões que fiquem caras de corrigir quando houver mais utilizadores, mais dados, Android + web, Google Calendar, AI/advisor e scheduling a correr em paralelo.

## 1. Separar melhor os domínios

A app já tem vários domínios:

- tasks
- scheduling
- Google Calendar
- advisor/AI
- rotinas
- scheduled review
- productivity/XP
- settings

Cada domínio devia ter fronteiras mais claras:

- routes próprias
- services próprios
- tipos/shared contracts claros
- migrations associadas
- documentação curta de responsabilidades

Exemplo desejado:

```txt
backend/
  tasks/
  scheduling/
  calendar/
  advisor/
  routines/
  productivity/
  settings/
```

Isto ajuda quando o projeto crescer e quando web + Android consumirem a mesma API.

## 2. Introduzir autenticação e multi-user a sério

Esta é provavelmente a mudança mais importante antes de várias pessoas usarem a app.

Quase todas as tabelas devem ter `user_id` diretamente ou pertencer a uma entidade que tenha `user_id`.

Exemplos:

```txt
tasks.user_id
tags.user_id
scheduler_rules.user_id
periodic_tasks.user_id
task_calendar_events.user_id
app_settings.user_id
google_connections.user_id
```

Decisões a fazer:

- Uma pessoa corresponde a uma conta?
- Vai haver workspaces/equipas?
- Tags são pessoais ou partilhadas?
- Calendários Google são por utilizador?
- Rules/advisor memory são pessoais ou globais?

Para 20 pessoas, a opção mais simples é `user_id` em tudo. Para 1000, pode evoluir depois para workspaces.

## 3. Background jobs para operações lentas

Operações lentas não devem bloquear sempre o request HTTP.

Modelo desejado:

```txt
Frontend -> API cria job -> responde rápido
Worker -> processa Google/AI/scheduler
Frontend -> consulta status do job
```

Candidatos fortes a background jobs:

- criar muitos eventos no Google Calendar
- atualizar cache do calendário
- gerar propostas do advisor
- processar feedback
- recalcular scheduling
- sincronizar eventos externos

Para começar, pode ser uma tabela `jobs` simples. Mais tarde, pode evoluir para uma queue real como BullMQ/Redis, Cloud Tasks, Supabase Edge Functions ou equivalente.

## 4. Cache e sync do Google Calendar mais formal

A cache do Google Calendar deve ser um subsistema explícito.

Tabelas possíveis:

```txt
google_calendar_cache
google_calendar_sync_runs
google_calendar_events_cache
```

Guardar pelo menos:

- user id
- calendar id
- time range
- fetched at
- expires at
- sync status
- errors
- etag/sync token, se aplicável

Isto evita bater constantemente na API do Google e facilita diagnosticar bugs de calendário stale.

## 5. Modelo de scheduling mais auditável

Scheduling é uma parte central da app e é difícil de explicar/debugar.

Guardar mais histórico ajudaria muito:

```txt
schedule_runs
schedule_run_tasks
schedule_run_constraints
schedule_run_decisions
```

Perguntas que o sistema devia conseguir responder:

- Porque esta task foi proposta?
- Porque esta task não foi proposta?
- Que regra bloqueou?
- Que slots foram considerados?
- Que constraints ganharam/perderam?

Isto é útil mesmo com poucos utilizadores, porque reduz muito o tempo de debug.

## 6. Separar command de state

Para ações importantes, vale a pena pensar em comandos/eventos de domínio.

Exemplos:

```txt
TaskCreated
TaskScheduled
CalendarEventCommitted
ScheduledTaskReviewed
TaskMissed
TaskCompleted
AdvisorProposalAccepted
```

Não é necessário fazer event sourcing completo. Mas uma boa tabela de activity/eventos ajuda em:

- histórico
- auditoria
- XP
- debugging
- futuras features de advisor

## 7. Observabilidade mínima

Mesmo sem logs/debug viewer no Android, o backend precisa de observabilidade.

Para produção, guardar/logar:

- request id por request
- logs estruturados JSON
- duração das operações
- erros Google separados
- erros AI separados
- scheduler run id
- job id
- user id nos logs, com cuidado de privacidade

Com 1000 utilizadores isto torna-se obrigatório para perceber lentidão, quotas e bugs intermitentes.

## 8. Rate limits e quotas

Como a app usa Google Calendar e AI, deve proteger custos e quotas.

Sugestões:

- rate limit por user
- limitar refresh manual do calendário
- limitar geração de advisor
- cache agressiva quando possível
- backoff/retry para Google API
- idempotency keys para commits de calendário

Commits de eventos devem ser idempotentes para evitar duplicados no Google Calendar.

## 9. Configuração por ambiente

Separar claramente:

```txt
development
staging
production
```

Cada ambiente deve ter:

- base de dados própria
- Google OAuth próprio
- secrets próprios
- logs próprios
- URL/API própria

Antes de produção real, deveria existir pelo menos staging.

## 10. API contracts mais estáveis

Com web + Android, a API passa a ser um contrato importante.

Sugestões:

- OpenAPI/Swagger
- versionamento leve, por exemplo `/api/v1`
- shared types gerados ou muito bem mantidos
- respostas consistentes de erro
- paginação em listas
- filtros claros
- contratos documentados

Isto evita que o Android parta quando a web muda.

## Ordem de prioridade sugerida

1. Multi-user/user_id em tudo.
2. Background jobs para Google/AI/scheduler.
3. Idempotência no commit de eventos.
4. Schedule runs auditáveis.
5. Cache Google Calendar formal.
6. API contracts para web + Android.
7. Observabilidade estruturada.
8. Staging/prod separados.

## Decisão mais importante

Antes de crescer para várias pessoas, o modelo de dados tem de saber claramente de quem é cada coisa.

Corrigir ownership/multi-user tarde é muito mais caro do que preparar isso cedo.