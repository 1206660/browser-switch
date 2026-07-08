# browser-switch

本地优先的 Chrome / Firefox 收藏夹 AI 整理工具。

当前 V0.1 方向：

1. 读取 Google Chrome 收藏信息。
2. 整理并确认。
3. 写入 Google Chrome 的 `browser-switch` 托管文件夹。
4. 读取 Firefox 收藏信息。
5. 整理并确认。
6. 写入 Google Chrome。

## 技术栈

- Tauri 2
- Rust
- React 18
- TypeScript
- Tailwind CSS

## 开发

```bash
pnpm install
pnpm tauri:dev
```

## 前端构建

```bash
pnpm build
```

## Windows 打包

```bash
pnpm tauri:build
```

输出位置：

- `src-tauri/target/release/browser-switch.exe`
- `src-tauri/target/release/bundle/msi/browser-switch_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/browser-switch_0.1.0_x64-setup.exe`

## 当前实现

- 中文桌面界面。
- Chrome profile 检测。
- Firefox profile 检测。
- Chrome `Bookmarks` JSON 导入。
- Firefox `places.sqlite` 导入。
- 本地规则整理和重复项标记。
- 写入 Chrome 前检测 Chrome 进程。
- 写入 Chrome 前自动备份 `Bookmarks`。
- 仅替换 Chrome 中的 `browser-switch` 托管文件夹。

