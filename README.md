# Task App

Aplicação local de gestão de tarefas para desktop, com frontend React/Vite, API Node.js/Express e persistência num ficheiro JSON.

## Funcionalidades

- Vistas Kanban, Fila e Cobranças Prováveis
- Pesquisa, filtros combináveis e ordenação
- Criação, edição, eliminação, duplicação e alteração rápida de estado
- Registo rápido de progresso e histórico cronológico por tarefa
- Contadores de hoje, atrasadas, à espera e sem prazo
- Notas Markdown com pré-visualização em tempo real
- Dependências selecionadas através de pesquisa (nunca é necessário escrever IDs)
- Gestão bidirecional de relações: `bloqueada por` e `esta tarefa bloqueia`
- Estado de conclusão das dependências, destaque de bloqueio e indicador `Ready`
- Datas automáticas de criação, atualização, conclusão e cancelamento
- Persistência local em `backend/tasks.json`

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior

## Executar

Abra dois terminais a partir desta pasta.

Backend:

```bash
cd backend
npm install
npm run dev
```

A API fica disponível em `http://localhost:4000`.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Abra o endereço apresentado pelo Vite (normalmente `http://localhost:5173`).

Para criar uma build de produção do frontend:

```bash
cd frontend
npm run build
```

Em desenvolvimento, o frontend envia pedidos para `/api` e o Vite encaminha-os localmente para `http://127.0.0.1:4000`. Assim, clientes remotos, incluindo dispositivos Tailscale, só precisam de abrir o endereço do frontend. Para uma implantação de produção sem o proxy Vite, defina `VITE_API_URL` com o endereço público da API antes de compilar.

## API

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/tasks` | Listar, filtrar e ordenar tarefas |
| `POST` | `/tasks` | Criar tarefa |
| `GET` | `/tasks/:id` | Obter uma tarefa |
| `PUT` | `/tasks/:id` | Atualizar uma tarefa |
| `DELETE` | `/tasks/:id` | Eliminar uma tarefa |
| `POST` | `/tasks/:id/duplicate` | Duplicar uma tarefa como `novo` |
| `POST` | `/tasks/:id/progress` | Adicionar uma mensagem ao histórico de progresso |
| `PUT` | `/tasks/:id/progress/:entryId` | Editar uma mensagem de progresso mantendo revisões |
| `POST` | `/tasks/:id/blockers` | Criar uma tarefa e adicioná-la como bloqueio da tarefa indicada |

Filtros disponíveis em `GET /tasks`:

- `status=novo|em_curso|a_espera|feito|cancelado`
- `priority=1|2|3|4`
- `requestedBy=nome`
- `needToAsk=nome`
- `overdue=true`
- `today=true`
- `noDueDate=true`
- `hideBlocked=true`
- `tag=etiqueta`
- `search=texto`
- `sort=priority|dueDateTime|createdAt|updatedAt|requestedBy|status`

Os parâmetros podem ser combinados. Exemplos:

```text
GET /tasks?status=a_espera&needToAsk=Carlos
GET /tasks?priority=4&overdue=true
GET /tasks?today=true&sort=priority
GET /tasks?search=ficheiro&status=em_curso
```

## Armazenamento

O backend cria `backend/tasks.json` automaticamente se não existir. As escritas usam um ficheiro temporário e substituição para reduzir o risco de deixar JSON parcialmente escrito. Ao eliminar uma tarefa, a respetiva referência também é removida das dependências das restantes tarefas.

`blockedByTaskIds` continua a ser a relação canónica guardada. O formulário também envia `blocksTaskIds` como campo virtual; o backend converte-o em `blockedByTaskIds` nas tarefas selecionadas, sem duplicar relações no armazenamento.

O projeto inclui dados de exemplo. Para começar sem tarefas, pare o backend e substitua o conteúdo de `backend/tasks.json` por:

```json
[]
```
