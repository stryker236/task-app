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


## Developing style

Avoid creating functions that accept `unknown` types unless necessary. Instead, use specific types like `string`, `number`, or `Date` to ensure type safety and clarity in your code.


