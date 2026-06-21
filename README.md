# Task App

Aplicação de gestão de tarefas para desktop, com frontend React/Vite, API Node.js/Express e persistência PostgreSQL no Supabase.

## Funcionalidades

- Vistas Kanban, Fila e Cobranças Prováveis
- Pesquisa, filtros combináveis e ordenação
- Criação, edição, eliminação, duplicação e alteração rápida de estado
- Registo rápido de progresso e histórico cronológico por tarefa
- Contadores de hoje, atrasadas, à espera e sem prazo
- Dependências selecionadas através de pesquisa (nunca é necessário escrever IDs)
- Gestão bidirecional de relações: `bloqueada por` e `esta tarefa bloqueia`
- Estado de conclusão das dependências, destaque de bloqueio e indicador `Ready`
- Datas automáticas de criação, atualização, conclusão e cancelamento
- Persistência PostgreSQL no Supabase

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior

## Executar

Abra dois terminais a partir desta pasta.

Backend:

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

A API fica disponível em `http://localhost:4000`.

Antes de iniciar, copie a connection string apresentada em **Supabase Dashboard → Connect** para `DATABASE_URL` no ficheiro `.env`. Se a ligação direta não funcionar na sua rede, utilize a connection string do **Session pooler**. Nunca coloque `.env` ou a password da base de dados no Git.

Teste apenas a ligação com:

```bash
npm run db:check
```

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

- `status=new|in_progress|waiting|done|cancelled`
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
GET /tasks?status=waiting&needToAsk=Carlos
GET /tasks?priority=4&overdue=true
GET /tasks?today=true&sort=priority
GET /tasks?search=ficheiro&status=in_progress
```

## Deploy do backend no Koyeb

O `Dockerfile` em `backend/` cria uma imagem de produção apenas com o backend e executa-a como utilizador não-root. O respetivo `.dockerignore` impede que `.env`, `tasks.json` e `node_modules` sejam incluídos na imagem.

Depois de publicar o repositório no GitHub:

1. No Koyeb, escolha **Create Web Service** e selecione o repositório.
2. Escolha **Dockerfile** como builder, defina `backend` como work directory e use `Dockerfile` como Dockerfile path.
3. Configure a porta HTTP como `8000` e o health check HTTP como `/health`.
4. Defina `DATABASE_URL` com a connection string PostgreSQL do Supabase. Se a ligação direta não estiver disponível a partir da região Koyeb, use a connection string do **Session pooler** apresentada em **Supabase → Connect**.
5. Defina `CORS_ORIGIN` com a origem HTTPS exata do frontend, sem barra final. Pode indicar várias origens separadas por vírgulas.
6. Faça o deploy e confirme que `/health` responde com `status: ok`.

Variáveis de ambiente no Koyeb:

```text
DATABASE_URL=postgresql://...
DATABASE_SSL=true
DATABASE_POOL_MAX=5
CORS_ORIGIN=https://task-app-frontend.example.com
```

O container usa `PORT=8000` por omissão, mas respeita qualquer valor `PORT` fornecido pelo Koyeb. O frontend de produção deve ser compilado com:

```text
VITE_API_URL=https://your-task-app-api.koyeb.app
```

Verificação depois do deploy:

```text
https://your-task-app-api.koyeb.app/health
https://your-task-app-api.koyeb.app/tasks
```

### Deploy do frontend no Koyeb

Crie um segundo Web Service a partir do mesmo repositório:

1. Escolha **Dockerfile** como builder.
2. Defina `frontend` como work directory e use `Dockerfile` como Dockerfile path.
3. Configure a porta HTTP `8000`, a rota `/` e o health check `/health`.
4. Defina `BACKEND_URL` com o URL HTTPS do backend, sem barra final.

```text
BACKEND_URL=https://taskmanager-utzqe3ir.b4a.run
```

O frontend usa `/api` no browser e o Nginx encaminha esses pedidos para `BACKEND_URL`. Como o pedido do browser permanece na origem do frontend, não é necessário recompilar a aplicação quando o URL do backend muda. O proxy remove o header `Origin`; `CORS_ORIGIN` continua a ser necessário apenas para clientes browser que acedam diretamente ao domínio do backend.

## Base de dados e importação

O backend usa as tabelas `tasks`, `task_dependencies`, `task_tags`, `task_activity` e `task_activity_revisions` do schema Supabase. Frontend, API e base de dados usam diretamente os mesmos estados e tipos de atividade ingleses, sem mapping em runtime.

`blockedByTaskIds` continua a ser a relação canónica. O formulário também envia `blocksTaskIds` como campo virtual; o backend converte-o em registos de `task_dependencies` sem duplicar relações.

Para importar uma única vez o ficheiro `backend/tasks.json` para uma base de dados vazia:

```bash
cd backend
npm run db:import-json
```

O importador recusa executar quando a tabela `tasks` já contém dados. IDs antigos que não sejam UUID são convertidos e as dependências são remapeadas automaticamente. Guarde `tasks.json` como backup até confirmar a importação.
