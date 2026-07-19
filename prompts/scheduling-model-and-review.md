# Scheduling Model, Task Scheduling State, And Scheduled Review

Quero melhorar o modelo de scheduling das tasks para separar claramente “deadline/due date” de “scheduled time”.

## 1. Separar due date de scheduled date

- `dueDateTime` deve continuar a representar apenas deadline/data limite da task.
- Quando aceito/commito uma proposta de evento no Google Calendar, a task NAO deve ter o `dueDateTime` atualizado para o horario do evento.
- O horario agendado deve ser guardado numa associacao propria de calendario/scheduling, por exemplo em `task_calendar_events` ou num campo derivado a partir dessa tabela.

## 2. Mostrar na propria task se ela esta efetivamente scheduled

- Na lista/kanban/detalhe da task, quero conseguir ver se a task tem evento de calendario ativo associado.
- Mostrar pelo menos:
  - estado: scheduled / not scheduled
  - data/hora de inicio
  - data/hora de fim
  - calendario
  - link para abrir no Google Calendar, se existir
- Isto deve usar a associacao real criada no commit, nao a due date.

## 3. Eligibility para reagendamento

- Uma task com evento associado no futuro deve ser considerada ja scheduled e nao deve voltar a ser proposta pelo advisor.
- Se o evento agendado ja passou e a task ainda nao esta concluida/cancelada/arquivada, a task deve voltar a ficar elegivel para scheduling.
- Eventos passados podem continuar no historico/associacao, mas nao devem bloquear novas propostas.
- A logica de elegibilidade deve considerar apenas eventos futuros ou atuais como “scheduled”.
- Se houver multiplos eventos associados, usar o proximo evento futuro como scheduled efetivo.

## 4. Regras que afetam uma task

- No detalhe da task, quero ver quais scheduler rules/constraints afetam especificamente aquela task.
- Deve incluir regras globais que se aplicam a task, regras por tags, regras por titulo, regras de rotina se for uma rotina, e regras manuais/fixed constraints quando existirem.
- Para cada rule mostrar:
  - texto original da regra
  - interpretacao
  - tipo de constraint
  - hard/soft
  - payload relevante
  - se foi aplicada na ultima proposta de scheduling, quando essa informacao existir
- Isto deve ser visivel diretamente na task, nao apenas nos logs/debug.

## 5. Semantica esperada

- `dueDateTime` = deadline.
- `scheduled event` = compromisso real no calendario.
- `priority_boost/preferred_window` influencia escolha de slot, mas nao altera deadline.
- `allowed_window hard=true` restringe slots validos.
- Commit no calendario cria evento e associacao a task, mas nao mexe na due date.
- Se o scheduled event expirar sem a task estar feita, a task volta a ser candidata ao scheduling.

## 6. UI

- Na task card/list/detalhe, mostrar um indicador claro de “Scheduled”.
- No detalhe, mostrar a seccao “Scheduling” com:
  - proximo evento agendado
  - eventos anteriores, se fizer sentido
  - regras aplicaveis
  - botao/link para abrir o evento Google
- Evitar mostrar due dates como se fossem agendamentos.

## 7. Backend/API

- Ajustar APIs de tasks para devolverem informacao de scheduling derivada dos eventos associados.
- Ajustar o advisor/scheduler para ignorar apenas tasks com eventos futuros, nao tasks que apenas tenham eventos antigos.
- Ajustar o commit de `create_calendar_event` para nao fazer patch de `dueDateTime`.
- Garantir que o relacionamento task-event continua a ser guardado.
- Se necessario, adicionar testes para:
  - commit de evento nao altera dueDateTime
  - task com evento futuro nao e elegivel
  - task com evento passado volta a ser elegivel
  - regras aplicaveis aparecem na task
  - due date e scheduled event aparecem separados na UI

## 8. Review pos-agendamento / tarefas que ja deviam ter acontecido

Quero uma view dedicada para tasks cujo horario agendado ja passou e que ainda nao foram concluidas/canceladas/arquivadas.

Objetivo:

- Quando chega a altura em que uma task agendada ja devia ter sido feita, ela deve aparecer numa pool/view de “A rever” ou “Scheduled review”.
- Esta pool deve servir para eu confirmar o que aconteceu com a task depois do slot agendado.

Criterios para entrar na pool:

- A task tem um evento de calendario associado.
- O evento terminou no passado.
- A task ainda nao esta `done`, `cancelled` ou arquivada.
- A task ainda nao foi revista para esse evento especifico.

Acoes disponiveis por item:

1. Marcar como feita
- A task passa para `done`.
- Ganha pontos/XP.
- Guardar atividade/nota do tipo “scheduled task completed”.
- O evento fica registado como concluido/revisto.

2. Dizer que nao ficou feita
- A task continua aberta.
- Perco pontos/XP ou e registado um penalty.
- A task sai desta pool para nao ficar a incomodar repetidamente pelo mesmo evento.
- A task volta a ficar elegivel para reagendamento futuro.
- Guardar atividade/nota do tipo “scheduled task missed / not completed”.

3. Adicionar notas
- Posso escrever notas livres sobre o que aconteceu.
- As notas ficam associadas a task e, idealmente, ao evento agendado especifico.
- Estas notas devem poder ser consultadas no historico da task.

4. Feedback estruturado opcional
- Alem da nota livre, posso indicar motivos estruturados, por exemplo:
  - acordei tarde
  - demorei mais do que esperado
  - horario nao era bom
  - estava sem energia
  - dependencia bloqueou
  - prioridade mudou
  - evento externo interferiu
- Estes motivos nao precisam inicialmente de alterar automaticamente regras futuras, mas devem ser guardados de forma estruturada para uso posterior.

Efeito no scheduling:

- Uma task marcada como feita deixa de ser elegivel para scheduling.
- Uma task marcada como nao feita volta a ser elegivel para scheduling, porque o evento antigo ja foi revisto e ja nao conta como scheduled ativo.
- O advisor/scheduler deve ignorar eventos passados revistos ao decidir se a task esta scheduled.
- Eventos passados nao revistos colocam a task na pool de review, nao diretamente em novas propostas.

Pontos/XP:

- Se concluo a task no review, ganho pontos.
- Se digo que nao ficou feita, perco pontos ou recebo um penalty configuravel.
- O sistema deve registar o motivo do ganho/perda de pontos.

Futuro: feedback a influenciar regras

- Quero guardar o feedback de forma que no futuro possa afetar agendamentos.
- Exemplo:
  - Se varias vezes eu marco “acordei tarde” em tasks agendadas cedo, o advisor pode sugerir uma nova rule do tipo “evitar manha cedo” ou “preferir depois das 10:00”.
  - Se varias tasks ficam incompletas porque demoraram mais, o sistema pode sugerir aumentar duracao estimada.
  - Se um horario falha repetidamente para uma tag, o sistema pode sugerir mudar `preferred_window` dessa tag.
- Inicialmente, isto pode ser apenas armazenamento de feedback + notas + historico.
- Mais tarde, o advisor pode analisar esse historico e propor novas rules, mas nao deve criar regras automaticamente sem validacao do utilizador.

UI esperada:

- Criar uma view “A rever” / “Review”.
- Cada item mostra:
  - task
  - horario agendado que passou
  - calendario/evento associado
  - due date, se existir, separada do scheduled time
  - regras que afetaram aquele agendamento, se disponiveis
- Acoes:
  - Done / concluida
  - Nao concluida
  - Reagendar
  - Adicionar nota
  - Guardar feedback
- Depois de rever um item, ele sai da pool.

Modelo de dados sugerido:

- Guardar estado de review por evento associado, nao apenas por task.
- Algo como:
  - `task_calendar_events.reviewStatus`: pending / completed / missed / skipped
  - `reviewedAt`
  - `reviewNote`
  - `reviewFeedback`
  - `xpDelta`
- Assim, uma task pode ter historico de varios agendamentos e reviews.

## Criterio de aceitacao

- Ao aceitar uma proposta de calendario, vejo a task como scheduled.
- A due date original da task nao muda.
- A task deixa de aparecer em novas propostas enquanto o evento futuro existir.
- Depois do evento passar e a task continuar aberta, ela pode voltar a ser proposta.
- Consigo abrir uma task e ver quais regras de scheduling a estao a afetar.
- Quando um evento agendado termina e a task nao esta feita, aparece na view de review.
- Posso marcar como feita e ganhar pontos.
- Posso marcar como nao feita, perder pontos, tirar notas, e a task volta a poder ser reagendada.
- A due date continua separada do scheduled time.
- O feedback fica guardado para consulta futura e para potencial uso em sugestoes de regras.
