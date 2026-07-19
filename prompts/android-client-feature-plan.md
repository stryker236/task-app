# Android Client Feature Plan

Quero criar um cliente Android para a minha app Task Organizer, reutilizando o backend/API existente. Não quero refazer o backend. O objetivo é implementar no Android as features principais da versão web, mas com UX própria para mobile.

Importante:
- Não quero logs/debug viewer no Android.
- Não quero simplesmente copiar o layout web.
- O Android deve consumir as APIs existentes sempre que possível.
- Se algum endpoint faltar ou estiver demasiado acoplado à web, sugerir apenas ajustes pequenos no backend.
- Priorizar uma experiência mobile limpa, rápida e prática.

## Features Android pretendidas

### 1. Tasks

Implementar:
- Lista de tasks.
- Kanban por status.
- Criar task.
- Editar task.
- Apagar/arquivar task, se já existir na web.
- Alterar status.
- Alterar prioridade.
- Alterar estimated duration.
- Marcar como favorita.
- Tags.
- Due date/deadline.
- Notas/descrição.
- Checklist/subtasks.
- Relações/dependências entre tasks, se estiverem expostas na API.
- Histórico/notas da task, se fizer sentido em mobile.

Atenção:
- `dueDateTime` deve ser mostrado como deadline.
- Não mostrar due date como se fosse horário agendado.

### 2. Scheduling real da task

Na task, mostrar claramente:
- Estado: scheduled / not scheduled.
- Próximo evento agendado, se existir.
- Start/end do evento.
- Calendário.
- Link para abrir no Google Calendar.
- Eventos anteriores, se fizer sentido.
- Separação clara entre deadline e scheduled time.

Regras:
- Uma task com evento futuro associado está scheduled.
- Uma task com evento passado e ainda aberta deve poder voltar a ser elegível conforme a lógica do backend.
- O Android deve refletir o estado vindo da API, não recalcular tudo localmente se o backend já devolver essa informação.

### 3. Rules / constraints aplicáveis à task

No detalhe da task, mostrar:
- Scheduler rules que afetam aquela task.
- Texto original da rule.
- Interpretação.
- Tipo de constraint.
- Hard/soft.
- Payload relevante.
- Se foi aplicada na última proposta, quando essa informação existir.

A UI deve ser compacta:
- Secção “Scheduling rules”.
- Cards expansíveis ou bottom sheet.
- Evitar JSON cru quando possível, mas permitir ver detalhes.

### 4. Advisor / propostas

Implementar uma área de Advisor para:
- Ver propostas de scheduling.
- Ver propostas por task.
- Abrir detalhe da proposta.
- Aceitar proposta.
- Ignorar proposta.
- Abrir task associada.
- Dar feedback à proposta.
- Commit de um conjunto custom de eventos.
- Commit por dia.
- Commit individual, se já existir.
- Distinguir visualmente tasks normais e pausas.

Não implementar:
- Logs/debug viewer.

### 5. Calendário

Implementar calendário mobile com:
- Vista semanal.
- Vista diária, se fizer sentido.
- Botão para saltar para a semana atual.
- Eventos do Google Calendar.
- Eventos propostos pelo advisor.
- Eventos já commited.
- Pausas com cor diferente.
- Abrir evento.
- Abrir task associada.
- Ajustar horário de propostas em incrementos de 15 minutos.

Atenção UX:
- Não copiar drag-and-drop desktop diretamente.
- Em mobile, usar long press, bottom sheet, steppers de 15 minutos, ou outro padrão adequado.
- Deve ser claro quando estou a editar uma proposta vs evento já criado.

### 6. Commit de eventos para Google Calendar

Implementar:
- Aceitar eventos propostos.
- Commit individual.
- Commit por dia.
- Commit de seleção custom.
- Após commit, atualizar o estado/cache do calendário.
- Criar eventos de task com reminder Google Calendar de 30 minutos antes.
- Pausas não devem ter reminder.
- Guardar associação task-event conforme backend.
- Não alterar `dueDateTime` da task ao fazer commit.

### 7. Scheduled review / A rever

Implementar uma view “A rever” para tasks cujo evento agendado já passou e ainda não estão concluídas/canceladas/arquivadas.

Cada item deve mostrar:
- Task.
- Horário agendado que passou.
- Calendário/evento associado.
- Due date, separada do scheduled time.
- Regras que afetaram o agendamento, se disponíveis.

Ações:
- Marcar como feita.
- Marcar como não concluída.
- Adicionar nota.
- Guardar feedback estruturado.
- Reagendar, se existir fluxo/API.

Comportamento:
- Se marcar como feita, task fica done e ganha XP.
- Se marcar como não concluída, perde XP/penalty, sai da pool de review e volta a poder ser reagendada.
- Notas e feedback ficam guardados para consulta futura.

### 8. Rotinas periódicas

Implementar:
- Lista de rotinas.
- Criar rotina.
- Editar rotina.
- Ativar/desativar rotina.
- Editar target count.
- Editar estimated minutes.
- Editar tags/prioridade.
- Editar constraints das rotinas.
- Ver próximas ocorrências.
- Abrir ocorrência no calendário.
- Cancelar/skipper ocorrência, se existir API.

A UI de constraints deve ser mobile-first:
- Allowed days.
- Allowed windows.
- Max occurrences per day.
- Min spacing.
- Preferências, se existirem.

### 9. Settings

Implementar settings úteis no Android:
- Calendário default.
- Cores dos calendários.
- Cores da app, se expostas nas settings.
- Duração default de evento.
- Working hours.
- Preferências de UI mobile.
- Definições relacionadas com advisor/scheduling, se já existirem.

Não implementar:
- Logs/debug viewer.

### 10. Google Calendar

Implementar:
- Ver estado da ligação Google.
- Conectar/reconectar Google se necessário.
- Atualizar calendário/cache.
- Abrir eventos no Google Calendar.
- Respeitar TTL/cache do backend.
- Ao carregar em “Atualizar”, pedir ao backend para refrescar a cache com o calendário atual.

Atenção:
- OAuth Android pode precisar de configuração própria.
- Se for demasiado complexo no MVP, permitir usar ligação Google já feita na web/backend.

### 11. Notificações

Implementar:
- Eventos criados no Google Calendar para tasks devem ter reminder de 30 minutos antes, via backend/Google Calendar.
- Pausas não têm reminder.
- Notificações locais Android são opcionais e podem ficar para fase posterior.

### 12. Fora do escopo

Não implementar no Android:
- Logs/debug viewer.
- Tabelas densas de logs por request.
- Ferramentas internas de debugging.
- Layout web 1:1.
- Funcionalidades admin que não façam sentido em mobile.

## Entregável esperado

Quero que analises o projeto atual e proponhas/implements um plano Android em fases:

1. Escolher stack recomendada.
   - Preferência: React Native + Expo, salvo se houver motivo forte contra.
2. Mapear APIs existentes que já suportam cada feature.
3. Identificar pequenos endpoints/ajustes backend necessários.
4. Criar estrutura inicial do app Android.
5. Implementar primeiro MVP:
   - navegação
   - tasks/lista/kanban
   - detalhe da task
   - criar/editar task
   - scheduling status da task
6. Depois avançar para:
   - advisor
   - calendário
   - commit de eventos
   - review
   - rotinas
   - settings

Critérios de qualidade:
- UX mobile própria.
- Separação clara entre due date e scheduled time.
- Reutilizar tipos/shared contracts quando possível.
- Não duplicar lógica complexa do backend no cliente.
- Não implementar logs/debug viewer.
- Código organizado por features.
- Preparado para crescer sem ficar confuso.