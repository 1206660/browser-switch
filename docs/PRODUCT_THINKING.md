# Product Thinking

## 1. Current Product Bet

browser-switch should first win by solving one painful, concrete job:

> I have a large, messy Firefox bookmark library. Help me turn it into something I can search, trust, and reuse.

The first useful version is closer to a local cleanup workbench than a sync platform. It should feel like opening a messy drawer, seeing what is inside, asking AI to propose an organized structure, and approving the parts that look right.

## 2. Primary User

The primary user is a heavy bookmark collector using Firefox on Windows.

Observed assumptions:

- Hundreds or thousands of bookmarks.
- Many old pages are dead.
- Many duplicates exist because the same page was saved multiple times.
- Folder names are inconsistent or outdated.
- Some bookmarks were saved with noisy page titles.
- The user wants AI assistance, but still wants control before changes are applied.
- Privacy matters because bookmarks reveal work, research, interests, and accounts.

## 3. Core Jobs To Be Done

### Job 1: Understand The Mess

When I open the app, I want to know how bad my bookmark library is, so I can decide what cleanup to run.

Signals:

- Total bookmarks.
- Number of folders.
- Duplicate candidates.
- Dead-link candidates.
- Unknown or uncategorized items.
- Top domains.
- Old bookmarks not visited recently.

### Job 2: Clean Without Fear

When I run cleanup, I want the tool to show suggestions before applying them, so I do not lose useful bookmarks or break my Firefox data.

Signals:

- Original data is always visible.
- Proposed changes are separate.
- Bulk operations can be filtered.
- Export is reversible and does not touch Firefox directly.

### Job 3: Find Things Again

When I search later, I want to find a bookmark by topic, tool name, domain, tag, or rough memory, so old saved links become useful again.

Signals:

- Title cleanup.
- Categories.
- Tags.
- Summaries.
- Full text search over URL/title/tags/summary.

### Job 4: Build A Better Bookmark Structure

When the app organizes bookmarks, I want categories that match how I actually think, so the result is not just another arbitrary folder tree.

Signals:

- Category structure is editable.
- AI suggestions include confidence and reasons.
- Similar bookmarks cluster together.
- Original folders remain available as a fallback view.

## 4. Product Strategy

### Start Local

Local-first is the correct starting point because:

- The user has one immediate machine and one messy Firefox profile.
- Reading Firefox data is inherently local.
- Bookmarks are private.
- Server sync adds complexity before the core organizer has proven value.

### Keep AI Bounded

AI should be used where it is strong:

- Rename noisy titles.
- Infer category from URL, title, domain, and original folder.
- Generate short summaries.
- Generate tags.
- Explain questionable decisions.

AI should not control destructive operations in V0.1:

- No silent deletes.
- No direct Firefox write-back.
- No automatic category overwrite without review.

### Prefer A Workbench Over A Wizard

A setup wizard is useful for first import, but the core product should be a workbench:

- Browse bookmarks.
- Run cleanup jobs.
- Review proposals.
- Filter risky items.
- Export results.

This gives the user control and makes repeated cleanup possible.

## 5. MVP Boundaries

### Must Have

- Firefox profile detection.
- Safe import from copied `places.sqlite`.
- Local database.
- Original folder view.
- Duplicate detection.
- Dead-link detection.
- AI cleanup proposals.
- Review queue.
- HTML export.

### Should Have

- Import summary dashboard.
- Category management.
- Rule-based fallback categories.
- AI result cache.
- Retry failed AI jobs.
- Dense list view with fast filtering.

### Nice To Have

- Visual cleanup report.
- Top-domain insights.
- Recent import history.
- Keyboard command palette.
- Theme and density settings.

### Not For V0.1

- User login.
- Official cloud.
- Cross-device sync.
- Browser extension.
- Chrome/Edge/Safari support.
- Direct write-back into Firefox.
- Semantic vector search.
- Full-page archive.

## 6. Risk Register

| Risk | Why It Matters | Product Response |
| --- | --- | --- |
| AI misclassifies bookmarks | Bad categories reduce trust | Show confidence, reason, and review queue |
| User fears data loss | Bookmarks may be personally important | Never modify Firefox DB; export only |
| Dead-link checks are slow | Thousands of bookmarks can take time | Queue with progress, timeout, concurrency |
| Firefox DB is locked | Firefox may be running | Copy DB first; show clear error if copy fails |
| Bookmark titles are multilingual | User may have Chinese and English links | Prompt and title limits must support both |
| Too many review items | Manual review can become tedious | Filter by confidence/risk and accept visible |
| Categories feel generic | AI output can be bland | Allow custom categories and merge/split later |

## 7. Success Metrics

V0.1 should be judged by practical outcomes:

- Import succeeds on the user's real Firefox profile.
- At least 90% of bookmarks are visible with correct URLs and folders.
- Exact duplicates are identified reliably.
- Dead-link checker completes without freezing the UI.
- AI proposals are good enough that the user accepts a meaningful batch.
- Exported HTML imports into Firefox successfully.
- The user can find previously lost bookmarks through search/category/tag.

## 8. Product Shape After V0.1

If V0.1 works, expand in this order:

1. Improve category editing and rule customization.
2. Add Chrome/Edge import.
3. Add direct write-back with backup and dry-run diff.
4. Add browser extension for new bookmarks.
5. Add semantic search.
6. Add sync service only after local organizer is valuable.

