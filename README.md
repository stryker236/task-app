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
- Assistente de trabalho em `/advisor`, com OpenAI opcional e fallback por regras locais
- Datas automáticas de criação, atualização, conclusão e cancelamento
- Persistência PostgreSQL no Supabase

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior

## Executar

Abra dois terminais a partir desta pasta.

## Migrations da base de dados

O projeto usa o fluxo oficial da Supabase CLI para gerir alterações de schema por código. As migrations vivem em:

```text
supabase/migrations/
```

Instalar dependências da raiz do projeto:

```bash
npm install
```

Primeira configuração da CLI:

```bash
npm run db:login
npm run db:link
```

O `db:link` vai pedir para escolher/indicar o projeto Supabase. Isto cria o link local; não deve ser commitado se contiver dados sensíveis.

Criar uma nova migration:

```bash
npm run db:migration:new -- nome_da_migracao
```

Isto cria um ficheiro SQL em `supabase/migrations/`. Edita esse ficheiro manualmente com o SQL necessário.

Aplicar migrations pendentes na Supabase remota:

```bash
npm run db:push
```

Ver estado das migrations:

```bash
npm run db:migration:list
```

Exportar o schema remoto atual para consulta:

```bash
npm run db:dump:file
```

Se alguma alteração tiver sido feita manualmente no dashboard e precisares de a trazer para código:

```bash
npm run db:pull
```

Regra importante: depois de começares a usar migrations, evita alterar o schema diretamente no dashboard da Supabase. Faz alterações em ficheiros SQL e aplica com `npm run db:push`.

### Primeiro uso com uma base Supabase já existente

Se a base remota já tem alterações aplicadas manualmente, não corras `npm run db:push` às cegas. A Supabase compara os ficheiros em `supabase/migrations/` com o histórico remoto em `supabase_migrations.schema_migrations`. Se o schema já existe mas o histórico não sabe disso, o push pode falhar com erros de objetos já existentes.

Fluxo seguro:

```bash
npm run db:login
npm run db:link
npm run db:migration:list
npm run db:dump:file
```

Depois compara `schema-current.sql` com as migrations existentes. Se as migrations já foram aplicadas manualmente, tens duas opções:

1. criar uma baseline nova com `npm run db:pull`; ou
2. marcar migrations antigas como aplicadas com `supabase migration repair`.

Neste caso pede-me ajuda antes de correr `db:push`, porque depende do estado real da tua base remota.

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

### Executar frontend e backend com Docker Compose

A base de dados continua no Supabase; o Compose executa apenas frontend e backend localmente. Confirme primeiro que `backend/.env` contém uma `DATABASE_URL` válida.

```bash
docker compose up --build
```

Serviços disponíveis:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
Health:   http://localhost:4000/health
```

Ver logs:

```bash
docker compose logs -f
```

Parar os serviços:

```bash
docker compose down
```

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
| `GET` | `/tags` | Listar ou pesquisar o catálogo reutilizável de tags |
| `GET` | `/advisor` | Sugerir as proximas tarefas a executar |
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
- `tag=etiqueta` (pode repetir; todas as tags selecionadas são obrigatórias)
- `search=texto`
- `sort=priority|dueDateTime|createdAt|updatedAt|requestedBy|status`

Os parâmetros podem ser combinados. Exemplos:

```text
GET /tasks?status=waiting&needToAsk=Carlos
GET /tasks?priority=4&overdue=true
GET /tasks?today=true&sort=priority
GET /tasks?search=ficheiro&status=in_progress
```

### Assistente AI

O endpoint `GET /advisor?limit=5` analisa tarefas ativas, prioridades, prazos, dependencias, checklist e estado `waiting`.

Se `OPENAI_API_KEY` estiver definido no backend, o endpoint chama a API da OpenAI para devolver um plano curto em JSON. Se a chave estiver ausente ou a chamada falhar, o backend devolve sugestoes calculadas por regras locais, por isso a app continua operacional.

Configuracao opcional no `backend/.env`:

```text
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
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
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
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

### Migração do catálogo de tags

Antes de executar esta versão do backend, aplica as migrations via Supabase CLI com `npm run db:push`. A migration relevante está em:

```text
supabase/migrations/20260621000000_normalize_tags.sql
```

A migração cria `tags(id, name, normalized_name)`, converte `task_tags` para usar `tag_id`, preserva as associações existentes e junta variantes que diferem apenas em maiúsculas/minúsculas ou espaços. Execute-a primeiro num ambiente de teste ou depois de criar um backup.

`blockedByTaskIds` continua a ser a relação canónica. O formulário também envia `blocksTaskIds` como campo virtual; o backend converte-o em registos de `task_dependencies` sem duplicar relações.

Para importar uma única vez o ficheiro `backend/tasks.json` para uma base de dados vazia:

```bash
cd backend
npm run db:import-json
```

O importador recusa executar quando a tabela `tasks` já contém dados. IDs antigos que não sejam UUID são convertidos e as dependências são remapeadas automaticamente. Guarde `tasks.json` como backup até confirmar a importação.
