# Backup And Restore Spec

## 1. Purpose

Backup and restore are required in V0.1 because bookmark cleanup is risky by nature.

The user must be able to test browser-switch on low-value Chrome bookmarks first, then safely import the real Firefox library and write cleaned results into Chrome without fear of losing previous bookmarks.

Core rule:

> No cleanup result should become irreversible.

## 2. Backup Levels

### Level 1: Source Snapshot

Before each import, browser-switch creates a source snapshot.

For Firefox:

- Copy `places.sqlite`.
- Copy related favicon DB when available.
- Record source profile path.
- Record copy time.
- Store copy under browser-switch app data.

For Chrome:

- Copy the `Bookmarks` JSON file.
- Copy `Favicons` when available.
- Record source profile path.
- Record copy time.
- Store copy under browser-switch app data.

These snapshots are read-only evidence of the original browser state at import time.

### Level 2: App Library Backup

Before applying a cleanup plan, browser-switch creates a local app backup:

- current local SQLite database state
- accepted/rejected review decisions
- cleanup plan metadata
- category configuration

This allows browser-switch itself to roll back to the state before a cleanup was applied.

### Level 3: Chrome Write-Back Backup

Before writing accepted results to Chrome, browser-switch creates a Chrome write-back backup:

- current target Chrome `Bookmarks` file
- target profile path
- write mode
- cleanup plan ID
- timestamp

This backup is required because Chrome is the V0.1 write target.

### Level 4: Export Backup

Every HTML export is recorded as an export backup:

- exported file path
- export options
- timestamp
- source import batch
- cleanup plan ID

The app should keep a visible export history so the user can reopen or re-export a previous cleaned version.

## 3. Restore Targets

### Restore App State

Required in V0.1.

The user can restore browser-switch local data to:

- before an import
- before a cleanup plan was applied
- before a bulk review action

UI text:

- `还原到此版本`
- `查看备份`
- `恢复前预览`

### Restore Chrome Bookmarks

Required in V0.1.

V0.1 Chrome restore path:

1. Choose a Chrome write-back backup.
2. Ask the user to close Chrome.
3. Create a pre-restore backup of the current Chrome `Bookmarks` file.
4. Restore the selected `Bookmarks` backup.
5. Validate JSON.
6. Show completion.

Firefox restore remains manual/export-only in V0.1.

Direct Firefox restore may be added later, but only with:

- explicit backup
- dry-run diff
- confirmation
- browser closed check

## 4. Backup History UI

Add a `备份` section under `设置`, and a shortcut from `导出`.

Columns:

- 时间
- 类型
- 来源
- 数量
- 说明
- 操作

Types:

- `导入前备份`
- `整理前备份`
- `写入 Chrome 前备份`
- `导出记录`

Actions:

- `查看`
- `还原`
- `还原 Chrome`
- `导出`
- `打开文件夹`

## 5. Restore Flow

1. User opens `设置 -> 备份`.
2. Selects a backup.
3. App shows restore preview:
   - bookmark count
   - folder count
   - accepted changes count
   - duplicate/dead status count
4. User clicks `还原到此版本`.
5. App creates one more backup of current state before restoring.
6. Restore applies to browser-switch local database.
7. App shows success and updated counts.

Required warning:

For local restore:

`还原只影响 browser-switch 本地数据，不会直接修改浏览器收藏夹。`

For Chrome restore:

`将使用备份覆盖当前 Chrome 收藏夹。请先关闭 Chrome。`

## 6. Safety Rules

- Do not overwrite Firefox files in V0.1.
- Only overwrite Chrome `Bookmarks` after explicit user confirmation.
- Do not delete backup files automatically in V0.1.
- Do not allow restore without creating a pre-restore backup.
- Show backup timestamp and source browser clearly.
- Store backups in app data, not inside browser profile directories.

## 7. Suggested Storage

App data structure:

```text
browser-switch/
  data/
    app.sqlite
  backups/
    imports/
      2026-07-08_164500_firefox_default/
      2026-07-08_170100_chrome_default/
    app-state/
      2026-07-08_171000_before_cleanup.sqlite
    chrome-writeback/
      2026-07-08_171500_before_chrome_write_Bookmarks
    exports/
      2026-07-08_172000_cleaned-bookmarks.html
```

## 8. Acceptance Criteria

Backup and restore are acceptable when:

- Every import creates a source snapshot.
- Every cleanup apply creates an app-state backup.
- Every Chrome write-back creates a Chrome `Bookmarks` backup.
- The user can view backup history.
- The user can restore browser-switch local state to a previous version.
- The user can restore Chrome bookmarks from a write-back backup.
- Restore creates a backup of the current state first.
- No restore operation writes directly to Firefox in V0.1.
