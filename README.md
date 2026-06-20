# Task App

Aplicação local de gestão de tarefas para desktop, com frontend React/Vite, API Node.js/Express e persistência num ficheiro JSON.

## Funcionalidades

- Vistas Kanban, Fila e Cobranças Prováveis
- Pesquisa, filtros combináveis e ordenação
- Criação, edição, eliminação, duplicação e alteração rápida de estado
- Contadores de hoje, atrasadas, à espera e sem prazo
- Notas Markdown com pré-visualização em tempo real
- Dependências selecionadas através de pesquisa (nunca é necessário escrever IDs)
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

Por omissão, o frontend usa `http://localhost:4000`. Para usar outro endereço, defina `VITE_API_URL` antes de iniciar ou compilar o frontend.

## API

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/tasks` | Listar, filtrar e ordenar tarefas |
| `POST` | `/tasks` | Criar tarefa |
| `GET` | `/tasks/:id` | Obter uma tarefa |
| `PUT` | `/tasks/:id` | Atualizar uma tarefa |
| `DELETE` | `/tasks/:id` | Eliminar uma tarefa |
| `POST` | `/tasks/:id/duplicate` | Duplicar uma tarefa como `novo` |

Filtros disponíveis em `GET /tasks`:

- `status=novo|em_curso|a_espera|feito|cancelado`
- `priority=1|2|3|4`
- `requestedBy=nome`
- `needToAsk=nome`
- `overdue=true`
- `today=true`
- `noDueDate=true`
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

O projeto inclui dados de exemplo. Para começar sem tarefas, pare o backend e substitua o conteúdo de `backend/tasks.json` por:

```json
[]
```
