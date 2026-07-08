# Import Sources

## 1. V0.1 Browser Scope

V0.1 supports two local import sources and one write target.

Import sources:

1. Google Chrome
2. Firefox

Write target:

1. Google Chrome

Chrome is included early because the user may test browser-switch on a less important bookmark library before importing Firefox and writing the cleaned result into Chrome.

## 2. Shared Import Rules

All browser imports must follow the same safety model:

- Read from a copied source file only.
- Never modify Firefox files directly.
- Modify Chrome only through the confirmed Chrome write-back flow.
- Create an import backup before parsing.
- Preserve original folder hierarchy.
- Record source browser, profile, and import batch.
- Keep original imported values even after cleanup proposals are accepted.

## 3. Google Chrome Import

### Profile Location On Windows

Default root:

```text
%LOCALAPPDATA%\Google\Chrome\User Data
```

Common profiles:

```text
Default
Profile 1
Profile 2
```

Bookmark file:

```text
Bookmarks
```

The `Bookmarks` file is JSON.

### What To Import

- Bookmark folders.
- Bookmark URLs.
- Bookmark titles.
- Date added.
- Folder hierarchy.
- Source profile name/path.

Chrome timestamp note:

- Chrome stores timestamps as WebKit time: microseconds since 1601-01-01 UTC.
- Convert to Unix/app timestamps during import.

### Chrome Import Advantages

- Easier and safer to parse than Firefox SQLite.
- Good for first real testing.
- Does not require SQLite source parsing.
- Works even if the bookmark set is disposable.

### Chrome Import Limitations

- Visit count is not in the `Bookmarks` JSON file.
- Favicon data is separate.
- Chrome may rewrite the file while running, so browser-switch should copy before reading.

## 4. Firefox Import

### Profile Location On Windows

Default root:

```text
%APPDATA%\Mozilla\Firefox\Profiles
```

Main database:

```text
places.sqlite
```

### What To Import

- Bookmark folders.
- Bookmark URLs.
- Bookmark titles.
- Date added / modified.
- Visit count when available.
- Last visited when available.
- Folder hierarchy.
- Firefox GUID when available.
- Source profile name/path.

### Firefox Import Notes

- Always copy `places.sqlite` before reading.
- Ignore profiles whose `places.sqlite` is missing or empty; Firefox can leave stale/empty profile folders behind.
- Prefer the profile pointed to by Firefox `profiles.ini` before falling back to name-based sorting.
- If copy fails, ask the user to close Firefox and retry.
- Do not write into `places.sqlite` in V0.1.

## 5. Import Source Selection UI

First-run import screen:

Title:

- `导入书签`

Browser selector:

- `Google Chrome`
- `Firefox`
- `HTML 文件`

Suggested helper text:

- Chrome: `先整理 Chrome，再写回 Chrome`
- Firefox: `整理 Firefox，确认后写入 Chrome`
- HTML: `从浏览器导出的书签文件导入`

Actions:

- `自动查找`
- `手动选择`
- `导入`

## 6. Import Order Recommendation

Recommended development order:

1. Chrome `Bookmarks` JSON import.
2. Bookmark list rendering.
3. Quick cleanup on Chrome data.
4. AI cleanup on selected Chrome bookmarks.
5. Write accepted Chrome cleanup result to Chrome bookmark bar.
6. Firefox `places.sqlite` import.
7. Write accepted Firefox cleanup result to Chrome bookmark bar.

This lets the product become testable sooner while keeping the final Firefox cleanup goal intact.

## 7. Acceptance Criteria

Import source support is acceptable when:

- The app can detect Chrome profiles on Windows.
- The app can import Chrome `Bookmarks` JSON.
- The app can detect Firefox profiles on Windows.
- The app can import copied Firefox `places.sqlite`.
- Each import creates a source backup.
- The user can choose which browser/profile to import.
- Imported bookmarks show source browser and original folder path.
