# browser-switch Docs

This folder is the product and design source of truth for V0.1.

Recommended reading order:

1. [PRODUCT_THINKING.md](./PRODUCT_THINKING.md)
   Product framing, target user, MVP boundaries, risks, and success metrics.

2. [PRD.md](./PRD.md)
   Main product requirements for the local-first Chrome/Firefox organizer with Chrome write-back.

3. [IMPORT_SOURCES.md](./IMPORT_SOURCES.md)
   Chrome and Firefox import rules, with Chrome as the V0.1 write target.

4. [CHROME_WRITEBACK_SPEC.md](./CHROME_WRITEBACK_SPEC.md)
   Required flows for writing accepted cleanup results into Google Chrome.

5. [BACKUP_RESTORE_SPEC.md](./BACKUP_RESTORE_SPEC.md)
   Backup and restore requirements for local state and Chrome write-back.

6. [UX_DESIGN.md](./UX_DESIGN.md)
   Chinese-first interface structure, screen inventory, states, labels, and review workflow.

7. [AI_CLEANUP_SPEC.md](./AI_CLEANUP_SPEC.md)
   AI cleanup input/output schema, category system, prompt strategy, safety rules, and batching behavior.

8. [V0.1_PLAN.md](./V0.1_PLAN.md)
   Implementation phases and done criteria.

## Current V0.1 Decision

V0.1 is a local-first desktop app for organizing Chrome and Firefox bookmarks, with Google Chrome as the write target.

Primary flows:

1. `读取 Google Chrome 所有收藏信息 -> AI 整理 -> 确认 -> 设置到 Google Chrome`
2. `读取 Firefox 收藏信息 -> AI 整理 -> 确认 -> 设置到 Google Chrome`

Do:

- Import Chrome bookmarks safely.
- Import Firefox bookmarks safely.
- Store imported data locally.
- Generate rule and AI cleanup proposals.
- Let the user review proposals.
- Back up Chrome before every write.
- Write accepted results directly into the Chrome bookmark bar.
- Do not create an extra `browser-switch` parent folder.
- Close and reopen Chrome automatically during write-back when needed.
- Restore Chrome bookmarks from backup when needed.
- Export cleaned HTML as a fallback.

Do not:

- Modify Firefox directly.
- Overwrite Chrome without backup and confirmation.
- Require login.
- Require a cloud server.
- Build browser extensions.
- Build multi-device sync.

## UI Decision

The app UI should be Simplified Chinese by default, with short and practical labels.

Examples:

- `导入`
- `整理`
- `待审核`
- `写入 Chrome`
- `导出`
- `设置`

The app should feel like a compact desktop utility, not a landing page.
