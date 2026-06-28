# Task App

Aplicação de gestão de tarefas para uso pessoal/desktop, com frontend React/Vite, backend Node.js/Express e persistência PostgreSQL no Supabase.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Base de dados: PostgreSQL no Supabase
- Migrations: Supabase CLI
- AI Advisor: OpenAI API opcional
- Sem login/autenticação nesta versão

## Funcionalidades principais

- Vistas Kanban, Fila, Fila rápida, Cobranças prováveis e Arquivadas
- Filtros independentes por vista
- Tags reutilizáveis, com filtro multi-tag e remoção de tags não usadas
- Prioridades, prazos, favoritos, checklist e estimativa opcional
- Relações entre cartões e dependências/blockers
- Bloqueios impedem concluir uma task enquanto dependências ou checklist estiverem pendentes
- Histórico de progresso editável
- Arquivar/restaurar tasks e arquivar em massa tasks `done`/`cancelled`
- Quick queue local para lembretes de curto prazo
- AI Advisor com buffer de propostas: aceitar/ignorar individualmente ou em massa

## Estrutura

```text
task-app/
  backend/
    ai/
    db/
    middleware/
    routes/
    scripts/
    tasks/
    server.js
    package.json

  frontend/
    src/
      components/
      constants/
      hooks/
      styles/
      utils/
      App.jsx
      api.js
    package.json

  supabase/
    migrations/
    config.toml
    seed.sql

  package.json
  docker-compose.yml
```

## Pré-requisitos

- Node.js 20+
- npm 10+
- Docker Desktop, apenas se usares Docker Compose ou Supabase local
- Projeto Supabase com connection string PostgreSQL

## Configuração inicial

Instalar dependências da raiz, backend e frontend:

```bash
npm install
cd backend
npm install
cd ../frontend
npm install
```

Configurar backend:

```bash
cd backend
copy .env.example .env
```

Define no `backend/.env`:

```text
DATABASE_URL=postgresql://...
DATABASE_SSL=true
CORS_ORIGIN=http://localhost:5173
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_API_KEY` é opcional. Sem chave, o endpoint `/advisor` continua a funcionar com regras locais, mas as propostas AI não ficam disponíveis.

Testar ligação à base de dados:

```bash
cd backend
npm run db:check
```

## Executar localmente

Terminal 1:

```bash
cd backend
npm run dev
```

Backend:

```text
http://localhost:4000
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Em desenvolvimento, o frontend usa `/api` e o Vite faz proxy para `http://127.0.0.1:4000`.

## Docker Compose

A base de dados continua no Supabase. O Compose corre apenas frontend e backend localmente.

```bash
docker compose up --build
```

Serviços:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
Health:   http://localhost:4000/health
```

Parar:

```bash
docker compose down
```

## Migrations com Supabase CLI

As migrations vivem em:

```text
supabase/migrations/
```

O histórico remoto já foi alinhado com as migrations existentes:

```text
20260621000000_normalize_tags.sql
20260622000000_add_task_archiving.sql
20260622000100_expand_task_model.sql
```

Login/link do projeto:

```bash
npm run db:login
npm run db:link
```

Ver estado:

```bash
npm run db:migration:list
```

Criar nova migration:

```bash
npm run db:migration:new -- nome_da_migracao
```

Editar o ficheiro criado em `supabase/migrations/`.

Aplicar migrations pendentes na Supabase remota:

```bash
npm run db:push
```

Exportar schema remoto para consulta:

```bash
npm run db:dump:file
```

Isto cria `schema-current.sql`, que está ignorado pelo Git.

Regra: evitar alterações manuais de schema no Dashboard da Supabase. Alterações de schema devem entrar como migrations SQL.

## API

### Health

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/` | Info básica da API |
| `GET` | `/health` | Verifica API e ligação à base de dados |

### Tasks

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/tasks` | Listar, filtrar e ordenar tasks |
| `POST` | `/tasks` | Criar task |
| `GET` | `/tasks/:id` | Obter task |
| `PUT` | `/tasks/:id` | Atualizar task |
| `DELETE` | `/tasks/:id` | Eliminar task |
| `POST` | `/tasks/:id/duplicate` | Duplicar task como `new` |
| `POST` | `/tasks/:id/archive` | Arquivar task |
| `DELETE` | `/tasks/:id/archive` | Restaurar task arquivada |
| `POST` | `/tasks/archive-bulk` | Arquivar todas as tasks de um status |
| `PATCH` | `/tasks/:id/checklist/:itemId` | Alternar item de checklist |
| `POST` | `/tasks/:id/progress` | Adicionar log de progresso |
| `PUT` | `/tasks/:id/progress/:entryId` | Editar log de progresso |
| `POST` | `/tasks/:id/blockers` | Criar task que bloqueia a task indicada |

Filtros de `GET /tasks`:

- `status=new|in_progress|waiting|done|cancelled`
- `priority=1|2|3|4`
- `overdue=true`
- `today=true`
- `noDueDate=true`
- `hideBlocked=true`
- `hideDone=true`
- `hideCancelled=true`
- `archived=true`
- `tag=nome` pode repetir
- `search=texto`
- `sort=priority|dueDateTime|createdAt|updatedAt|requestedBy|status`

Exemplos:

```text
GET /tasks?status=new&sort=priority
GET /tasks?priority=4&overdue=true
GET /tasks?tag=excel&tag=preços
GET /tasks?archived=true
```

### Tags

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/tags` | Listar/pesquisar tags reutilizáveis |
| `DELETE` | `/tags/:id` | Apagar tag sem uso |

### Advisor / AI

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/advisor?limit=5` | Sugestão simples do que fazer a seguir |
| `POST` | `/ai/advisor/request` | Gerar propostas AI a partir de um pedido |
| `POST` | `/ai/commands/preview` | Validar/preview de comandos AI |
| `POST` | `/ai/commands/apply` | Aplicar comandos AI aceites |

O backend limita pedidos AI de geração a `3` requests por `10` segundos por cliente/IP.

O Advisor não aplica alterações sozinho. Ele gera propostas que aparecem num buffer no frontend; o utilizador aceita ou ignora cada proposta.

## Modelo de dados principal

Campos principais expostos pela API:

```js
{
  id,
  title,
  notes,
  priority,
  status,
  dueDateTime,
  estimatedMinutes,
  isFavorite,
  tags,
  blockedByTaskIds,
  relations,
  checklistItems,
  createdAt,
  updatedAt,
  completedAt,
  cancelledAt,
  archivedAt,
  isArchived,
  activityLog
}
```

Status válidos:

```text
new
in_progress
waiting
done
cancelled
```

Prioridades:

```text
1 = baixa
2 = média
3 = alta
4 = urgente
```

## Importação de JSON antigo

Para importar uma vez `backend/tasks.json` para uma base vazia:

```bash
cd backend
npm run db:import-json
```

O importador recusa correr se a tabela `tasks` já tiver dados.

## Build

Frontend:

```bash
cd frontend
npm run build
```

Backend syntax check:

```bash
cd backend
node --check server.js
```

## Deploy

### Backend

O `backend/Dockerfile` corre a API Express.

Variáveis típicas:

```text
PORT=8000
DATABASE_URL=postgresql://...
DATABASE_SSL=true
DATABASE_POOL_MAX=5
CORS_ORIGIN=https://frontend.example.com
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AI_RATE_LIMIT_WINDOW_MS=10000
AI_RATE_LIMIT_MAX=3
```

Health check:

```text
/health
```

### Frontend

O `frontend/Dockerfile` compila o frontend e serve com Nginx.

Variável:

```text
BACKEND_URL=https://backend.example.com
```

O browser usa `/api`; o Nginx encaminha para `BACKEND_URL`.
