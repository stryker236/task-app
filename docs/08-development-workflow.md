# Development Workflow

## Local Setup

Install dependencies:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

Run local services:

```bash
npm run dev:local
```

## Validation

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

Backend:

```bash
cd backend
npm run typecheck
npm test
```

Python scheduler:

```bash
cd python-scheduler-service
python -m unittest
```

## Migrations

Migrations live in:

```text
supabase/migrations/
```

When schema changes:

1. Create a timestamped migration.
2. Update `docs/02-data-model.md`.
3. Update affected domain docs.
4. Run backend typecheck.
5. If possible, run migration locally or through Supabase tooling.

## Documentation Update Rule

- Schema change: update `02-data-model.md`.
- Scheduling behavior change: update `03-scheduling-model.md`.
- Google Calendar behavior change: update `04-google-calendar.md`.
- Advisor behavior change: update `05-ai-advisor.md`.
- API change: update `07-backend-api.md`.
- Important architecture/product decision: add entry to `09-decisions.md`.
