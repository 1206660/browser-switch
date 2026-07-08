# Chrome Write-Back Spec

## 1. Required User Flow

V0.1 should support two practical flows.

### Flow 1: Clean Chrome Into Chrome

```text
读取 Google Chrome 所有收藏信息
-> AI 整理
-> 用户确认
-> 设置到 Google Chrome
```

Purpose:

- Use Chrome as the first low-risk test browser.
- Verify import, AI organization, review, backup, and write-back on less important bookmarks.

### Flow 2: Move Cleaned Firefox Bookmarks Into Chrome

```text
读取 Firefox 收藏信息
-> AI 整理
-> 用户确认
-> 设置到 Google Chrome
```

Purpose:

- Keep Firefox source data untouched.
- Use Chrome as the unified cleaned bookmark target.
- Let the user migrate from messy Firefox bookmarks into a cleaned Chrome structure.

## 2. Chrome Is The V0.1 Write Target

V0.1 write-back target:

- Google Chrome bookmarks.

V0.1 source browsers:

- Google Chrome.
- Firefox.

V0.1 must not write to:

- Firefox `places.sqlite`.
- Edge.
- Safari.
- Cloud sync services.

## 3. Safety Requirements

Before writing to Chrome, browser-switch must:

1. Identify the target Chrome profile.
2. Copy the current Chrome `Bookmarks` file as a backup.
3. Create a browser-switch app-state backup.
4. Generate a dry-run diff.
5. Ask the user to confirm.
6. Check whether Chrome appears to be running.
7. Prefer writing only when Chrome is closed.
8. Write atomically:
   - write new file to temp path
   - validate JSON
   - replace `Bookmarks`

If Chrome is running:

- Show `请关闭 Chrome 后再写入`
- Allow `重新检测`
- Do not write by default.

## 4. Write Modes

### Replace Managed Folder

Recommended V0.1 mode.

browser-switch writes cleaned bookmarks under one top-level Chrome folder:

```text
browser-switch
```

Inside it:

```text
browser-switch/
  AI 分类/
  原始目录/
  待确认/
```

Behavior:

- Existing Chrome bookmarks outside the `browser-switch` folder remain untouched.
- On next write, browser-switch replaces only its managed folder.
- This avoids destroying the user's existing Chrome structure.

### Merge Into Chrome Root

Deferred.

This mode can place cleaned folders directly into Chrome's bookmark bar or other bookmarks. It is riskier and should wait until managed-folder write-back is reliable.

## 5. Target Structure

Default write structure:

```text
browser-switch/
  AI 分类/
    开发技术/
    AI 工具/
    设计素材/
    效率工具/
    学习资料/
    ...
  待确认/
  失效链接/
```

Rules:

- Accepted items go into `AI 分类/<category>`.
- Rejected items are not written by default.
- Unreviewed items go into `待确认` only if the user enables `包含未审核`.
- Dead links go into `失效链接` only if the user enables `包含失效链接`.
- Duplicate items write only the kept item by default.

## 6. Chrome Bookmark JSON Notes

Chrome bookmark file:

```text
%LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Bookmarks
```

Important fields:

- `roots.bookmark_bar`
- `roots.other`
- `roots.synced`
- `children`
- `type`: `folder` or `url`
- `name`
- `url`
- `date_added`
- `guid` when present

Write strategy:

- Preserve existing root objects and metadata.
- Find or create the top-level managed folder under `other` by default.
- Replace only that managed folder's children.
- Generate new IDs/guids if needed.
- Preserve original URLs.
- Use accepted title as Chrome bookmark `name`.

## 7. Confirmation Screen

Before write-back, show:

- Target browser: `Google Chrome`
- Target profile path.
- Write mode: `写入 browser-switch 文件夹`
- Total bookmarks to write.
- Folders to create.
- Duplicates skipped.
- Dead links skipped or included.
- Backup path.

Buttons:

- `写入 Chrome`
- `取消`
- `打开备份文件夹`

Warning:

`写入前会自动备份 Chrome 收藏夹。请先关闭 Chrome。`

## 8. Restore From Chrome Backup

Required for V0.1 because Chrome is a write target.

Restore flow:

1. User opens `设置 -> 备份`.
2. Selects a Chrome write-back backup.
3. App asks user to close Chrome.
4. App copies current Chrome `Bookmarks` as a pre-restore backup.
5. App restores selected `Bookmarks` backup.
6. App validates JSON.
7. App shows `已还原 Chrome 收藏夹`.

UI actions:

- `还原 Chrome`
- `打开备份`
- `重新检测 Chrome`

## 9. Acceptance Criteria

Chrome write-back is acceptable when:

- The app can read Chrome bookmarks from a copied `Bookmarks` file.
- The app can generate an AI cleanup plan from Chrome bookmarks.
- The app can write accepted Chrome cleanup results into a managed Chrome folder.
- The app can read Firefox bookmarks and write accepted results into the managed Chrome folder.
- The app creates a Chrome `Bookmarks` backup before every write.
- The app can restore Chrome `Bookmarks` from a backup.
- Existing Chrome bookmarks outside the managed folder remain untouched.
- Firefox is never modified in V0.1.

