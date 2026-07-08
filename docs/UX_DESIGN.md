# UX Design

## 1. Design Direction

browser-switch V0.1 is a Chinese-first desktop utility for cleaning Chrome and Firefox bookmarks, then writing accepted results into Google Chrome.

The interface should be calm, dense, and direct. It should not feel like a marketing website. The user opens it to finish a task: import bookmarks, organize them, review changes, and export a clean result.

## 2. UI Language

### Language

- Default UI language: Simplified Chinese.
- Text style: short, practical, low-noise.
- Avoid explanatory paragraphs inside the app.
- Prefer nouns and verbs the user already knows.

### Tone

Use:

- 导入
- 整理
- 审核
- 导出
- 写入 Chrome
- 重试
- 跳过
- 应用
- 还原

Avoid:

- 释放您的生产力
- 智能赋能收藏体验
- 全新一代书签管理方式
- 让 AI 为您保驾护航

### Naming

Product name can stay English: `browser-switch`.

Chinese feature names:

| Concept | UI Text |
| --- | --- |
| All bookmarks | 全部 |
| AI categories | AI 分类 |
| Original folders | 原始目录 |
| Duplicates | 重复项 |
| Dead links | 失效链接 |
| Review queue | 待审核 |
| Settings | 设置 |
| Quick cleanup | 快速整理 |
| AI cleanup | AI 整理 |
| Export | 导出 |

## 3. Visual Style

### Layout

- Desktop app with fixed left sidebar and flexible content area.
- Dense list as the default view.
- Cards only for summary metrics and repeated bookmark items in card mode.
- Avoid large hero areas.
- Avoid decorative gradients or abstract backgrounds.

### Theme

Default: dark theme.

Recommended palette:

- App background: near-black neutral, not blue-heavy.
- Sidebar: slightly darker/lighter than main background.
- Border: subtle gray.
- Primary action: electric blue.
- Warning: amber.
- Danger: red.
- Success: green.
- Tag color: muted neutral with small accent dot.

Light theme can be added later.

### Density

Default density: compact.

Bookmark list row height target:

- Compact: 52-60 px.
- Comfortable: 68-76 px.

The app should be useful with thousands of bookmarks, so information density matters.

## 4. App Shell

### Sidebar

Items:

1. 总览
2. 全部
3. AI 分类
4. 原始目录
5. 重复项
6. 失效链接
7. 待审核
8. 写入 Chrome
9. 导出
10. 设置

Each item shows a count when useful:

- 全部 `1,284`
- 重复项 `36`
- 失效链接 `18`
- 待审核 `412`

Bottom area:

- Current profile name.
- Last import time.
- Small `重新导入` action.

### Top Bar

Elements:

- Search input placeholder: `搜索标题、网址、标签`
- Filter button: `筛选`
- Primary action: `开始整理`

Optional later:

- Command palette.
- View switch: list/card/grid.

## 5. First-Run Flow

### Screen: Welcome / Import

Purpose:

Get Chrome or Firefox bookmarks into the app safely.

Main copy:

- Title: `导入书签`
- Description: `导入时只读取副本，确认后再写入 Chrome。`

Source choices:

- `Google Chrome`
- `Firefox`
- `HTML 文件`

Helper text:

- Chrome: `先整理 Chrome，再写回 Chrome`
- Firefox: `整理 Firefox，确认后写入 Chrome`

Primary actions:

- `自动查找`
- `选择文件`

Profile list columns:

- 名称
- 路径
- 最近修改
- 书签数 if detectable

Buttons:

- `导入`
- `取消`

States:

- Loading: `正在查找浏览器配置...`
- Empty: `没有找到浏览器配置`
- Error: `无法读取配置`

### Screen: Import Summary

Shown after import.

Metric cards:

- 书签
- 文件夹
- 重复项
- 可能失效
- 待分类

Primary actions:

- `快速整理`
- `AI 整理`

Secondary actions:

- `先看看`
- `重新导入`

## 6. Main Bookmark List

### Row Content

Each row shows:

- favicon or generated fallback icon
- title
- domain
- URL preview
- category
- tags
- status badges
- last visited or created time

Compact row example:

```text
[图标] shadcn/ui 文档        ui.shadcn.com       开发技术  #React #组件
       https://ui.shadcn.com/docs                 原始: 工具/前端
```

### Row Actions

Visible on hover or selection:

- 打开
- 编辑
- 标记
- 删除

For V0.1, `删除` means deleting from browser-switch local library only, not Firefox.

### Filters

Filter groups:

- 状态: 全部 / 正常 / 重复 / 失效 / 已删除
- 来源: Firefox profile
- 分类: AI category
- 审核: 待审核 / 已接受 / 已拒绝 / 已编辑
- 时间: 最近添加 / 很久未访问

Sort:

- 添加时间
- 标题
- 域名
- 访问次数
- AI 置信度

## 7. Cleanup Entry

### Start Cleanup Panel

Panel title:

- `整理书签`

Mode selector:

- `快速整理`
  - Short help: `去重、分类、查失效`
- `AI 整理`
  - Short help: `重命名、摘要、标签`

Scope selector:

- `全部书签`
- `当前筛选`
- `已选中`

Options:

- `检测失效链接`
- `清理跟踪参数`
- `生成摘要`
- `生成标签`

Primary button:

- `开始`

### Progress

Progress copy should be specific:

- `正在分析网址`
- `正在检测重复项`
- `正在检测失效链接`
- `正在请求 AI`
- `正在生成整理方案`

Progress details:

- processed count
- failed count
- estimated remaining if available

Actions:

- `暂停`
- `继续`
- `停止`

## 8. Review Queue

This is the most important screen in V0.1.

### Purpose

Show proposed changes clearly enough that the user can approve a large batch without losing control.

### Default View

Use a table with expandable detail rows.

Columns:

- checkbox
- 状态
- 原标题
- 新标题
- 原目录
- 新分类
- 标签
- 置信度
- 操作

Actions:

- `接受`
- `拒绝`
- `编辑`
- `打开`

Bulk actions:

- `接受选中`
- `拒绝选中`
- `接受当前筛选`

### Review Filters

Important filters:

- 高置信度
- 低置信度
- 标题变更
- 分类变更
- 重复项
- 失效链接
- AI 失败

Recommended default:

- Show low-confidence and risky items first.
- Let high-confidence items be accepted in bulk.

### Detail Drawer

When a row is opened:

- Original title.
- Proposed title.
- URL.
- Original folder path.
- Proposed category.
- Tags.
- Summary.
- AI reason.
- Duplicate group if any.
- Link status if checked.

Buttons:

- `接受`
- `拒绝`
- `保存修改`

### Status Labels

| Status | UI Text |
| --- | --- |
| pending | 待审核 |
| accepted | 已接受 |
| rejected | 已拒绝 |
| edited | 已编辑 |
| duplicate | 重复 |
| dead | 失效 |
| active | 正常 |
| ai_failed | AI 失败 |

## 9. Duplicate Review

Duplicate groups should be shown as groups, not isolated rows.

Group header:

- Domain.
- Normalized URL.
- Count.

Each duplicate item:

- Title.
- Original folder.
- Created/modified time.
- Visit count.

Recommended keep rule:

1. Prefer item with higher visit count.
2. Prefer item with better folder context.
3. Prefer earliest item if otherwise equal.

UI actions:

- `保留此项`
- `合并为一项`
- `全部保留`

V0.1 should mark duplicates in local library and export only the accepted kept item unless configured otherwise.

## 10. Dead Link Review

Dead link states:

- `正常`
- `重定向`
- `超时`
- `404`
- `服务器错误`
- `无法确认`

Do not delete dead links automatically.

Actions:

- `打开验证`
- `标记失效`
- `保留`
- `稍后再查`

## 11. Write To Chrome Screen

Purpose:

Write accepted cleanup results into Google Chrome.

Title:

- `写入 Chrome`

Summary:

- 来源: `Google Chrome` or `Firefox`
- 目标: `Google Chrome`
- 配置: target profile path
- 写入方式: `直接写入书签栏`

Preview metrics:

- 将写入
- 将创建文件夹
- 跳过重复项
- 跳过失效链接
- 未审核项目

Options:

- `包含未审核项目`
- `包含失效链接`
- `写入前打开备份文件夹`

Primary action:

- `写入 Chrome`

Secondary actions:

- `预览`
- `取消`
- `打开备份`

Required warning:

- `写入前会自动备份 Chrome 收藏夹，并清空当前书签栏后写入整理结果。Chrome 正在运行时会自动关闭，写完后重新打开。`

If Chrome appears to be running:

- `Chrome 正在运行，写入时会自动关闭并重启`
- Button: `重新检测`

Success state:

- `已写入 Chrome`
- `已备份原收藏夹`
- Actions:
  - `打开备份`
  - `还原 Chrome`

## 12. Export Screen

Purpose:

Export a cleaned bookmark HTML file as a fallback and portable backup.

Options:

- `按 AI 分类导出`
- `保留原始目录`
- `包含未审核项目`
- `排除重复项`
- `排除失效链接`

Primary action:

- `导出 HTML`

Success state:

- `已导出`
- Show file path.
- Action: `打开文件夹`

Warning:

- `导出的文件不会自动覆盖浏览器收藏夹。`

## 13. Settings

Sections:

### 浏览器

- 当前配置
- 配置路径
- 重新扫描
- 手动选择

### AI

- 服务商
- 接口地址
- 模型
- API Key
- 整理要求
- 测试连接

Button labels:

- `保存`
- `测试`
- `清空`

整理要求 placeholder:

- `例如：帮我清理掉魔兽世界，我不玩了`

### 整理规则

- URL 清理参数.
- 默认分类.
- 死链检测超时.
- 并发数.

### 外观

- 主题: 深色 / 浅色 / 跟随系统
- 密度: 紧凑 / 标准

### 备份

- 备份列表
- 还原 browser-switch
- 还原 Chrome
- 打开备份文件夹

## 13. Empty States

Keep empty states short.

| Screen | Empty Text | Action |
| --- | --- | --- |
| 全部 | `还没有导入书签` | `导入书签` |
| 重复项 | `没有发现重复项` | none |
| 失效链接 | `还没有检测失效链接` | `开始检测` |
| 待审核 | `没有待审核项目` | `开始整理` |
| AI 分类 | `还没有 AI 分类` | `AI 整理` |

## 14. Error States

Error messages should say what happened and what to do next.

Examples:

- `无法复制 places.sqlite。请关闭 Firefox 后重试。`
- `无法读取 Chrome 书签。请关闭 Chrome 后重试。`
- `AI 请求失败。请检查 API Key 或接口地址。`
- `写入 Chrome 失败。已保留备份，可稍后还原。`
- `导出失败。请检查目标文件夹权限。`
- `部分链接检测失败，可稍后重试。`

## 15. Keyboard Shortcuts

V0.1 useful shortcuts:

- `Ctrl+K`: 搜索
- `Ctrl+I`: 导入
- `Ctrl+R`: 开始整理
- `Ctrl+W`: 写入 Chrome
- `Ctrl+E`: 导出
- `Enter`: 打开选中书签
- `A`: 接受选中审核项
- `X`: 拒绝选中审核项

Shortcuts should not be required to use the app.

## 16. Screen Inventory

Required V0.1 screens:

1. 导入
2. 总览
3. 全部书签
4. AI 分类
5. 原始目录
6. 重复项
7. 失效链接
8. 待审核
9. 写入 Chrome
10. 导出
11. 设置

Recommended build order:

1. App shell.
2. 导入.
3. 全部书签.
4. 总览.
5. 待审核.
6. 写入 Chrome.
7. 导出.
8. 设置.
9. 重复项 and 失效链接 refinement.
