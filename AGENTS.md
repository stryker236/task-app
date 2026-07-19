# AGENTS.md

## Editing Rules For Codex Agents

- Prefer `apply_patch` for manual file edits whenever it is available.
- If `apply_patch` is unavailable on Windows and PowerShell must be used, avoid inline string replacements that contain JSX/TSX quotes.
- Do not use Bash-style escaping such as `\"` inside PowerShell double-quoted strings. In PowerShell, escaped double quotes are written as `` `" ``.
- For TSX/JSX/HTML edits through PowerShell, use single-quoted here-strings (`@' ... '@`) for the search and replacement text.
- Keep replacements small and verify the changed snippet immediately after editing.
- If a replacement marker is not found, stop and inspect the exact file content before trying another write.
- Do not rewrite large files with ad hoc scripts when a focused patch or smaller targeted edit is enough.

## Verification

- After UI edits, run the frontend build when practical: `npm run build` from `frontend/`.
- After backend TypeScript edits, run the backend typecheck/build command used by the repo.
## Development Lessons

- Before implementing a fix, identify which layer owns the bug: visual interaction, frontend state, API payload, backend business logic, scheduler logic, database state, or external service behavior.
- Do not claim an interaction bug is fixed only because TypeScript/build passes. For UI behavior, inspect the exact component props and, when possible, verify the behavior path end-to-end.
- Distinguish pre-drop UI behavior from post-drop persistence. For calendar dragging, `snapDuration` affects the visual hit grid, while handlers and scheduler constraints affect what persists after drop.
- When the user says a fix still does not work, re-evaluate the objective instead of defending the previous implementation. Restate the observed mismatch in concrete terms before changing code.
- For domain-model changes, settle the semantics first. Example: `dueDateTime` means deadline; `task_calendar_events` means scheduled time. Do not mix these concepts in patches.
- Prefer derived state when possible. Example: a task is effectively scheduled when it has a current/future linked calendar event, not merely because it has any historical calendar event.
- When adding features over existing data, preserve historical records and change the eligibility/query logic instead of deleting useful history.
- Keep large specs in `prompts/` as Markdown files and reference them by filename during implementation.
- After every targeted edit, inspect the modified snippet before running broad validation.
- If a PowerShell replacement marker is not found, do not keep guessing. Read the exact nearby lines with line numbers, then patch by a narrow verified range.
- Avoid broad rewrites while the worktree is dirty or while multiple related features are in progress. Make one domain-level change at a time and validate before continuing.
- When integrating with Google Calendar, be explicit about external behavior: event `reminders` create Google Calendar reminders, but mobile notification delivery still depends on the user's device/calendar notification settings.
- After creating or deleting Google Calendar events, refresh the relevant calendar event cache/range with a forced refresh so the UI reflects the external state.
- Do not update task deadlines as a side effect of creating calendar events. Scheduling and deadline changes must be separate, intentional actions.


