# browser-switch PRD

> Version: V0.2-personal-mvp
> Date: 2026-07-08
> Primary user: Krip

## 1. Product Direction

browser-switch starts as a personal Firefox bookmark organizer.

The first version is not a cross-browser sync platform. It is a local-first desktop tool that imports a messy Firefox bookmark library, uses rules and AI to generate a cleanup plan, lets the user review the plan, and then applies the accepted changes to browser-switch's own library or exports a cleaned bookmark file.

The product goal for the first milestone is simple:

> Turn my current Firefox bookmark mess into a searchable, categorized, deduplicated bookmark knowledge base.

## 2. MVP Principles

1. Protect the original Firefox data.
   The app must never modify Firefox's `places.sqlite` directly in V0.1. It reads from a copied database file or HTML export only.

2. Optimize for one real user first.
   All flows should serve a single local user on one machine before adding accounts, cloud sync, teams, or browser extensions.

3. AI should propose, not silently rewrite.
   AI-generated titles, categories, summaries, and tags are shown as a reviewable plan. The user can accept, reject, or edit changes.

4. Rules provide a reliable baseline.
   URL normalization, duplicate detection, dead-link checks, and domain-based categories should work without an AI API key.

5. Keep the architecture upgradeable.
   Local-first V0.1 should not block later server sync, Chrome import, browser extensions, or semantic search.

## 3. In Scope For V0.1

### 3.1 Firefox Import

Required:

- Auto-detect Firefox profiles on Windows.
- Let the user select a profile if multiple profiles exist.
- Copy `places.sqlite` to an app temp/import directory before reading.
- Import bookmarks, folders, URLs, titles, timestamps, visit counts, and favicon references when available.
- Preserve original folder hierarchy.
- Record import batches so the user can compare different runs.

Fallback:

- Support importing Firefox bookmark HTML export.

Out of scope:

- Writing directly back into Firefox.
- Realtime Firefox monitoring.
- Firefox extension.

### 3.2 Local Bookmark Library

Required:

- Store imported bookmarks in a local SQLite database owned by browser-switch.
- Keep both original fields and proposed cleanup fields.
- Track status: `active`, `duplicate`, `dead`, `archived`, `deleted`.
- Track source browser and source profile.
- Keep accepted AI/rule changes separate from original imported values.

### 3.3 Rule-Based Cleanup

Required:

- Normalize URLs for comparison:
  - lowercase scheme and host
  - remove hash
  - optionally remove common tracking query params such as `utm_*`, `spm`, `fbclid`, `gclid`
  - remove trailing slash when safe
- Detect exact duplicates by normalized URL.
- Group likely duplicates by same host plus similar path/title.
- Classify by domain and keyword rules into default categories:
  - Development
  - AI Tools
  - Design
  - Productivity
  - Learning
  - News
  - Finance
  - Shopping
  - Social
  - Entertainment
  - Games
  - Life
  - Other
- Detect dead links with bounded concurrency, timeout, and retry rules.
- Prefer `HEAD`, fall back to `GET` when needed.

### 3.4 AI Organizing

Required:

- Let the user configure an API provider and key.
- Initial providers:
  - OpenAI-compatible endpoint
  - DeepSeek
  - Tongyi/Qwen-compatible endpoint
- AI input should include title, URL, domain, original folder path, and optional fetched page metadata.
- AI output per bookmark:
  - category
  - cleaned title, max 15 Chinese characters or roughly 30 English characters
  - summary, max 30 Chinese characters or roughly 60 English characters
  - 2-5 tags
  - confidence score
  - short reason for review
- Batch AI requests to control cost and rate limits.
- Cache AI results by bookmark content hash.

Out of scope for V0.1:

- Full page archiving.
- Vector semantic search.
- Fully automatic cleanup without review.

### 3.5 Review And Apply Flow

Required flow:

1. Import Firefox bookmarks.
2. Show import summary:
   - total bookmarks
   - total folders
   - duplicate candidates
   - dead-link candidates
   - uncategorized count
3. User chooses cleanup mode:
   - Quick cleanup: rules only
   - AI cleanup: rules plus AI
4. App generates a cleanup plan.
5. User reviews changes in a table/list:
   - original title vs proposed title
   - original folder vs proposed category
   - URL
   - duplicate/dead status
   - tags and summary
6. User can accept all, accept selected, reject selected, or edit selected.
7. Accepted changes update browser-switch's local library.
8. User can export cleaned bookmarks as HTML.

V0.1 apply target:

- Apply to browser-switch local library.
- Export cleaned HTML for manual import into Firefox.

Deferred apply target:

- Write back to Firefox bookmarks after backup and explicit confirmation.

### 3.6 Desktop UI

UI language:

- Default to Simplified Chinese.
- Keep labels short and practical.
- Avoid marketing copy and long in-app explanations.
- Use dense utility-style screens, not landing-page style screens.

Required layout:

- Left sidebar:
  - 总览
  - 全部
  - AI 分类
  - 原始目录
  - 重复项
  - 失效链接
  - 待审核
  - 导出
  - 设置
- Main area:
  - search bar: `搜索标题、网址、标签`
  - filters: `筛选`
  - dense bookmark list
  - cleanup/review panel
- Settings:
  - Firefox 配置
  - AI 设置
  - API Key
  - 整理规则
  - 导出路径

Interaction priorities:

- Fast search and filtering.
- Clear review states.
- Batch accept/reject.
- No destructive action without preview.

## 4. Deferred Scope

These are intentionally not part of V0.1:

- User accounts.
- Cloud server.
- Multi-device sync.
- Chrome/Edge/Safari import.
- Browser extension.
- Realtime bookmark sync.
- Direct browser write-back.
- Semantic vector search.
- Sharing folders.
- SaaS billing.

## 5. Technical Direction

### 5.1 Recommended V0.1 Architecture

Use a single desktop app first:

- Tauri 2
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui
- Rust side for local filesystem access, profile detection, and SQLite operations
- Local SQLite database
- AI API calls from the app with user-provided key

Rationale:

- The current first user does not need a server.
- Local-first reduces setup cost and privacy risk.
- Tauri can safely access Firefox profile files after user permission.
- A server can be added later when sync becomes real.

### 5.2 Future Architecture Upgrade

When sync becomes necessary:

- Keep desktop local database as an offline cache.
- Add Node.js/Fastify server.
- Add PostgreSQL for multi-user/cloud mode.
- Add WebSocket sync and device management.

## 6. Data Model

### 6.1 Bookmark

| Field | Type | Notes |
| --- | --- | --- |
| id | string | App-generated ID |
| import_batch_id | string | Source import batch |
| source_browser | string | `firefox` in V0.1 |
| source_profile | string | Firefox profile path/name |
| source_guid | string | Firefox bookmark GUID when available |
| url | string | Original URL |
| normalized_url | string | Cleanup comparison URL |
| url_hash | string | Hash of normalized URL |
| original_title | string | Imported title |
| proposed_title | string | AI/rule proposal |
| accepted_title | string | User-approved title |
| original_folder_id | string | Imported folder |
| proposed_category_id | string | AI/rule proposal |
| accepted_category_id | string | User-approved category |
| summary | string | AI summary |
| tags | string[] | AI/rule tags |
| favicon | string | Icon URL/path |
| visit_count | number | Firefox visit count when available |
| last_visited_at | number | Timestamp |
| status | enum | active/duplicate/dead/archived/deleted |
| review_status | enum | pending/accepted/rejected/edited |
| ai_confidence | number | 0-1 |
| created_at | number | App timestamp |
| updated_at | number | App timestamp |

### 6.2 Folder

| Field | Type | Notes |
| --- | --- | --- |
| id | string | App-generated ID |
| import_batch_id | string | Source batch |
| source_guid | string | Firefox folder GUID when available |
| name | string | Folder name |
| parent_id | string | Parent folder |
| path | string | Full original path |
| sort_order | number | Imported order |

### 6.3 Category

| Field | Type | Notes |
| --- | --- | --- |
| id | string | App-generated ID |
| name | string | Category name |
| description | string | Used for AI prompt/rules |
| is_default | boolean | Built-in category |
| sort_order | number | UI order |

### 6.4 CleanupPlan

| Field | Type | Notes |
| --- | --- | --- |
| id | string | App-generated ID |
| import_batch_id | string | Related import |
| mode | enum | quick/ai |
| status | enum | running/completed/failed/applied |
| stats_json | json | Summary counts |
| created_at | number | Timestamp |
| applied_at | number | Timestamp |

## 7. Acceptance Criteria For V0.1

V0.1 is acceptable when:

- The app can import the user's Firefox bookmarks from the local machine.
- The app shows the imported bookmarks with original folders.
- The app detects exact duplicate URLs.
- The app can run dead-link checks without freezing the UI.
- The app can generate AI categories, cleaned titles, summaries, and tags for a selected batch.
- The user can review proposed changes before applying them.
- Accepted changes are stored locally.
- The user can export a cleaned bookmark HTML file.
- The original Firefox profile remains untouched.

## 8. Suggested Milestones

### Milestone 1: Import And View

- Create Tauri + React app.
- Detect Firefox profiles.
- Read copied `places.sqlite`.
- Store bookmarks in local SQLite.
- Show bookmark list and original folders.

### Milestone 2: Quick Cleanup

- URL normalization.
- Duplicate detection.
- Rule categories.
- Dead-link checker.
- Cleanup summary.

### Milestone 3: AI Cleanup

- AI provider settings.
- Batch prompt and parser.
- AI result cache.
- Review queue.

### Milestone 4: Export

- Apply accepted changes to local library.
- Export cleaned HTML.
- Add import/export history.

## 9. Open Decisions

1. Whether V0.1 should use Rust SQLite only, or include a local Node service.
   Recommendation: use Rust SQLite only for V0.1.

2. Whether AI calls should fetch page content.
   Recommendation: start with title, URL, domain, and folder path; add metadata fetch as an optional enhancement.

3. Whether cleaned bookmarks should be written back to Firefox.
   Recommendation: do not write back in V0.1. Export HTML first.
