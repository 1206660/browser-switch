# browser-switch Docs

This folder is the product and design source of truth for V0.1.

Recommended reading order:

1. [PRODUCT_THINKING.md](./PRODUCT_THINKING.md)
   Product framing, target user, MVP boundaries, risks, and success metrics.

2. [PRD.md](./PRD.md)
   Main product requirements for the local-first Firefox bookmark organizer.

3. [UX_DESIGN.md](./UX_DESIGN.md)
   Chinese-first interface structure, screen inventory, states, labels, and review workflow.

4. [AI_CLEANUP_SPEC.md](./AI_CLEANUP_SPEC.md)
   AI cleanup input/output schema, category system, prompt strategy, safety rules, and batching behavior.

5. [V0.1_PLAN.md](./V0.1_PLAN.md)
   Implementation phases and done criteria.

## Current V0.1 Decision

V0.1 is a local-first desktop app for cleaning the user's Firefox bookmarks.

Do:

- Import Firefox bookmarks safely.
- Store imported data locally.
- Generate rule and AI cleanup proposals.
- Let the user review proposals.
- Export cleaned HTML.

Do not:

- Modify Firefox directly.
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
- `导出`
- `设置`

The app should feel like a compact desktop utility, not a landing page.

