# AI Cleanup Spec

## 1. Purpose

AI cleanup turns raw Firefox bookmarks into reviewable organization proposals.

The AI does not directly rewrite or delete bookmarks. It proposes:

- 分类
- 新标题
- 摘要
- 标签
- 置信度
- 原因

The user reviews and applies proposals in browser-switch.

## 1.1 User Cleanup Instruction

The UI must include a free-form text box named `整理要求`.

Examples:

- `帮我清理掉魔兽世界，我不玩了`
- `不要保留购物网站`
- `把 AI 工具单独整理清楚`

Behavior:

- The text is sent to the AI prompt as `user_instruction`.
- If the instruction asks to remove or exclude a topic, matching bookmarks should be marked as excluded and not selected for write-back.
- Local rule fallback should handle obvious exclusion requests, such as `魔兽世界`, `WoW`, `World of Warcraft`, and `Warcraft`.
- The instruction is saved locally with AI settings and must not be committed to Git.

## 2. Cleanup Modes

### 快速整理

No AI required.

Includes:

- URL 规范化
- 重复检测
- 域名/关键词分类
- 跟踪参数清理建议
- 死链检测

Use when:

- API Key is not configured.
- User wants a quick first pass.
- Large bookmark library should be analyzed cheaply.

### AI 整理

Rules plus AI.

Includes:

- AI 分类
- AI 标题
- AI 摘要
- AI 标签
- Low-confidence review reasons

Use when:

- User wants better category/title quality.
- Rule classification is too coarse.
- Bookmarks have noisy titles or unclear folder structure.

## 3. AI Input

Per bookmark input:

| Field | Required | Notes |
| --- | --- | --- |
| id | yes | Local bookmark ID |
| title | yes | Original imported title |
| url | yes | Original URL |
| domain | yes | Parsed host |
| original_folder_path | yes | Full Firefox folder path |
| normalized_url | yes | Used for duplicate context |
| visit_count | no | Useful for importance |
| last_visited_at | no | Useful for stale bookmarks |
| page_meta_title | no | Optional fetched title |
| page_meta_description | no | Optional fetched description |

For V0.1, do not fetch full page content by default. Title, URL, domain, folder path, and optional metadata are enough for the first AI pass.

## 4. AI Output Schema

The model must return JSON only.

```json
{
  "items": [
    {
      "id": "bookmark-id",
      "category": "开发技术",
      "title": "React 组件库",
      "summary": "shadcn/ui 组件文档",
      "tags": ["React", "组件", "UI"],
      "confidence": 0.86,
      "reason": "标题和域名都指向前端 UI 组件文档"
    }
  ]
}
```

Validation rules:

- `id` must match an input ID.
- `category` must be one of the configured categories unless custom category generation is enabled.
- `title` is required and should be short.
- `summary` can be empty only when the item is unclear.
- `tags` must contain 2-5 items.
- `confidence` must be between 0 and 1.
- `reason` should be short.

Invalid model output should not be applied. Mark affected items as `AI 失败` and allow retry.

## 5. Default Directory Hierarchy

Use Chinese directory paths in UI and AI prompts. The AI returns `category` as a folder path separated by `/`.

| Directory Path | Description |
| --- | --- |
| 公司/项目/<项目名> | Project-specific tools, repos, docs, dashboards |
| 公司/开发技术 | Programming, docs, frameworks, libraries, APIs |
| 公司/办公协作 | Work docs, collaboration, company tools |
| 公司/设计素材 | Design systems, icons, UI inspiration, Figma resources |
| 公司/AI 工具 | AI apps, models, prompts, agents, AI services |
| 家庭/生活日常 | Travel, food, health, local services |
| 家庭/购物消费 | Shopping, product pages, coupons, marketplaces |
| 家庭/投资理财 | Stocks, crypto, finance, business, markets |
| 个人/学习成长 | Courses, tutorials, books, knowledge articles |
| 个人/效率工具 | Productivity tools, automation, browser tools |
| 休闲/游戏 | Games, game tools, modding, game docs |
| 休闲/影音娱乐 | Video, music, streaming, entertainment |
| 休闲/社交社区 | Social networks, forums, communities |
| 其他/待确认 | Unclear or mixed items |

Directory icons should be stable by directory meaning. For example, `公司` uses a briefcase icon, `家庭` uses a home icon, `休闲/游戏` uses a game icon, and `公司/开发技术` uses a code icon.

## 6. Title Rules

AI title should be concise and readable in a dense list.

Rules:

- Chinese title: max 15 Chinese characters when possible.
- English title: roughly max 30 characters when possible.
- Remove noisy suffixes:
  - `- 知乎`
  - `| GitHub`
  - `- Google Search`
  - browser-added or site-added clutter
- Keep essential brand/product names.
- Do not invent a different product name.
- If the original title is already clean, keep it.

Examples:

| Original | Better |
| --- | --- |
| `shadcn/ui - Beautifully designed components...` | `shadcn/ui 文档` |
| `GitHub - rust-lang/rust: Empowering everyone...` | `Rust 源码仓库` |
| `OpenAI Platform` | `OpenAI 平台` |

## 7. Summary Rules

Summary should help the user decide whether the bookmark is useful.

Rules:

- Chinese: max 30 Chinese characters.
- English: roughly max 60 characters.
- Avoid marketing wording.
- Do not repeat title unless no extra signal exists.
- Mention what the page is for.

Examples:

- `Tauri 桌面应用开发文档`
- `React 组件库安装与用法`
- `AI 聊天模型接口文档`

## 8. Tag Rules

Tags should improve filtering, not duplicate every category.

Rules:

- 2-5 tags.
- Prefer specific nouns.
- Allow Chinese or English based on actual topic.
- Keep common technical names as English, such as `React`, `Rust`, `SQLite`.
- Avoid vague tags:
  - `网站`
  - `工具`
  - `文章`
  - `资源`

Good:

- `React`
- `Tauri`
- `书签`
- `自动化`
- `设计系统`

Bad:

- `有用`
- `网页`
- `其他`

## 9. Confidence Rules

Confidence determines review priority.

| Range | Meaning | UI Behavior |
| --- | --- | --- |
| 0.85-1.00 | High confidence | Can be bulk accepted after quick scan |
| 0.60-0.84 | Medium confidence | Normal review |
| 0.00-0.59 | Low confidence | Show first in review queue |

AI should lower confidence when:

- URL is a short link.
- Title is generic.
- Domain is unfamiliar.
- Original folder conflicts with inferred category.
- Page metadata is missing.
- Bookmark looks like a login/account page.

## 10. Prompt Strategy

Batch prompt should include:

- Product context.
- Category list.
- Strict JSON output schema.
- Title, summary, and tag limits.
- Requirement to avoid destructive suggestions.
- Input list.

System intent:

```text
你是一个中文书签整理助手。你只生成整理建议，不删除、不移动真实书签。
输出必须是 JSON。界面面向中文用户，标题和摘要要短。
```

User content shape:

```json
{
  "categories": ["开发技术", "AI 工具", "设计素材"],
  "items": [
    {
      "id": "b1",
      "title": "GitHub - tauri-apps/tauri",
      "url": "https://github.com/tauri-apps/tauri",
      "domain": "github.com",
      "original_folder_path": "工具/桌面应用"
    }
  ]
}
```

## 11. Batching

Recommended V0.1 defaults:

- Batch size: 20-40 bookmarks.
- The user-facing operation processes all selected bookmarks; batching is an internal implementation detail.
- Retry failed batch once.
- If a batch fails JSON validation, retry with smaller batch size.
- Cache results by hash of title + URL + folder path + category version.

Progress states:

- `排队中`
- `请求中`
- `解析中`
- `已完成`
- `失败`

## 12. Safety Rules

AI must never decide these actions alone:

- Delete bookmark.
- Permanently remove duplicate.
- Mark link as dead without network check.
- Write changes to Firefox.
- Write changes to Chrome without backup, preview, and user confirmation.
- Export without user action.

AI may suggest:

- `可能重复`
- `建议归类`
- `建议标题`
- `建议保留`
- `建议稍后检查`

## 13. Review Priority

Review queue should sort by practical risk:

1. Dead or unreachable links.
2. Duplicate groups.
3. Low-confidence AI items.
4. Items with large title/category changes.
5. High-confidence simple changes.

This prevents the user from wasting time reviewing easy items first.

## 14. First Useful AI Feature

The first AI feature to implement should be:

> Run AI cleanup on selected bookmarks and show proposals in 待审核.

Do not start with a huge all-bookmarks automation flow. Selected-batch AI cleanup is easier to test, cheaper, and safer.
