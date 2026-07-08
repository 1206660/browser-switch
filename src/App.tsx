import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import {
  ArchiveRestore,
  Bot,
  CheckCircle2,
  Chrome,
  DatabaseBackup,
  Download,
  FileJson,
  FolderTree,
  Gauge,
  Loader2,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BrowserName = "chrome" | "firefox";

type BrowserProfile = {
  browser: BrowserName;
  name: string;
  path: string;
  bookmark_path: string;
  is_write_target: boolean;
};

type BookmarkRecord = {
  id: string;
  source_browser: BrowserName;
  source_profile: string;
  title: string;
  url: string;
  folder_path: string;
  category: string;
  tags: string[];
  status: string;
  date_added?: number | null;
  visit_count?: number | null;
};

type ImportResult = {
  source_browser: BrowserName;
  profile_name: string;
  backup_path: string;
  folders: number;
  bookmarks: BookmarkRecord[];
};

type ChromeWriteResult = {
  target_profile: string;
  backup_path: string;
  written_count: number;
  folder_count: number;
  managed_folder: string;
};

type ViewBookmark = BookmarkRecord & {
  selected: boolean;
  summary: string;
};

type Notice = {
  type: "ok" | "warn" | "error";
  text: string;
};

const navItems = [
  ["总览", Gauge],
  ["全部", FolderTree],
  ["AI 分类", Sparkles],
  ["重复项", ArchiveRestore],
  ["待审核", CheckCircle2],
  ["写入 Chrome", UploadCloud],
  ["设置", Settings]
] as const;

function App() {
  const [chromeProfiles, setChromeProfiles] = useState<BrowserProfile[]>([]);
  const [firefoxProfiles, setFirefoxProfiles] = useState<BrowserProfile[]>([]);
  const [source, setSource] = useState<BrowserName>("chrome");
  const [targetProfilePath, setTargetProfilePath] = useState("");
  const [bookmarks, setBookmarks] = useState<ViewBookmark[]>([]);
  const [importInfo, setImportInfo] = useState<ImportResult | null>(null);
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState("总览");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [chromeRunning, setChromeRunning] = useState(false);
  const [lastWrite, setLastWrite] = useState<ChromeWriteResult | null>(null);

  useEffect(() => {
    void refreshProfiles();
  }, []);

  const sourceProfiles = source === "chrome" ? chromeProfiles : firefoxProfiles;
  const selectedCount = bookmarks.filter((item) => item.selected).length;
  const duplicateCount = bookmarks.filter((item) => item.status === "重复").length;
  const categoryCount = new Set(bookmarks.map((item) => item.category)).size;
  const targetProfile = chromeProfiles.find((profile) => profile.path === targetProfilePath) ?? chromeProfiles[0];

  const filteredBookmarks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    let items = bookmarks;

    if (activeNav === "重复项") {
      items = items.filter((item) => item.status === "重复");
    }
    if (activeNav === "待审核") {
      items = items.filter((item) => item.selected);
    }
    if (activeNav === "AI 分类") {
      items = [...items].sort((a, b) => a.category.localeCompare(b.category, "zh-CN"));
    }

    if (!keyword) {
      return items;
    }

    return items.filter((item) => {
      const text = `${item.title} ${item.url} ${item.category} ${item.tags.join(" ")} ${item.folder_path}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [activeNav, bookmarks, query]);

  async function refreshProfiles() {
    setLoading(true);
    try {
      const [chrome, firefox] = await Promise.all([
        invoke<BrowserProfile[]>("detect_chrome_profiles"),
        invoke<BrowserProfile[]>("detect_firefox_profiles")
      ]);
      setChromeProfiles(chrome);
      setFirefoxProfiles(firefox);
      if (chrome.length > 0) {
        setTargetProfilePath(chrome[0].path);
      }
      setNotice({ type: "ok", text: `已找到 Chrome ${chrome.length} 个配置，Firefox ${firefox.length} 个配置` });
    } catch (error) {
      setNotice({ type: "error", text: String(error) });
    } finally {
      setLoading(false);
    }
  }

  async function importSelectedProfile(profile: BrowserProfile) {
    setLoading(true);
    setNotice(null);
    try {
      const command = profile.browser === "chrome" ? "import_chrome_bookmarks" : "import_firefox_bookmarks";
      const result = await invoke<ImportResult>(command, {
        profilePath: profile.path,
        profileName: profile.name
      });
      setImportInfo(result);
      setBookmarks(
        result.bookmarks.map((bookmark) => ({
          ...bookmark,
          selected: true,
          summary: makeSummary(bookmark)
        }))
      );
      setActiveNav("全部");
      setNotice({
        type: "ok",
        text: `已导入 ${result.bookmarks.length} 条书签，导入前备份已创建`
      });
    } catch (error) {
      setNotice({ type: "error", text: String(error) });
    } finally {
      setLoading(false);
    }
  }

  function runCleanup(mode: "quick" | "ai") {
    const seen = new Map<string, string>();
    setBookmarks((current) =>
      current.map((item) => {
        const normalized = normalizeUrl(item.url);
        const duplicate = seen.has(normalized);
        if (!duplicate) {
          seen.set(normalized, item.id);
        }

        const title = mode === "ai" ? cleanTitle(item.title, item.url) : item.title;
        return {
          ...item,
          title,
          status: duplicate ? "重复" : "正常",
          category: inferCategory(item),
          tags: makeTags(item.url, item.category),
          summary: mode === "ai" ? makeSummary({ ...item, title }) : item.summary,
          selected: !duplicate
        };
      })
    );
    setActiveNav("待审核");
    setNotice({
      type: "ok",
      text: mode === "ai" ? "已生成 AI 整理建议，可确认后写入 Chrome" : "已完成快速整理，可继续 AI 整理"
    });
  }

  async function refreshChromeState() {
    const running = await invoke<boolean>("check_chrome_running");
    setChromeRunning(running);
    setNotice({
      type: running ? "warn" : "ok",
      text: running ? "检测到 Chrome 正在运行，请关闭后再写入" : "Chrome 未运行，可以写入"
    });
  }

  async function writeToChrome() {
    if (!targetProfile) {
      setNotice({ type: "error", text: "没有可写入的 Chrome 配置" });
      return;
    }

    const running = await invoke<boolean>("check_chrome_running");
    setChromeRunning(running);
    if (running) {
      setNotice({ type: "warn", text: "请关闭 Chrome 后再写入" });
      return;
    }

    const accepted = bookmarks.filter((item) => item.selected && item.status !== "重复");
    if (accepted.length === 0) {
      setNotice({ type: "warn", text: "没有可写入的已确认书签" });
      return;
    }

    const confirmed = window.confirm(
      `将写入 ${accepted.length} 条书签到 Chrome 的 browser-switch 文件夹。\n写入前会自动备份 Chrome 收藏夹。确认继续？`
    );
    if (!confirmed) {
      return;
    }

    setLoading(true);
    try {
      const result = await invoke<ChromeWriteResult>("write_chrome_bookmarks", {
        profilePath: targetProfile.path,
        bookmarks: accepted
      });
      setLastWrite(result);
      setNotice({ type: "ok", text: `已写入 Chrome：${result.written_count} 条，备份已创建` });
    } catch (error) {
      setNotice({ type: "error", text: String(error) });
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(id: string) {
    setBookmarks((current) =>
      current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  }

  function selectAllVisible(selected: boolean) {
    const visible = new Set(filteredBookmarks.map((item) => item.id));
    setBookmarks((current) => current.map((item) => (visible.has(item.id) ? { ...item, selected } : item)));
  }

  return (
    <main className="h-screen bg-bg text-text">
      <div className="grid h-full grid-cols-[236px_1fr]">
        <aside className="border-r border-border bg-panel px-3 py-4">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white">
              <Chrome size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold">browser-switch</div>
              <div className="text-xs text-muted">AI 收藏整理</div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map(([label, Icon]) => (
              <button
                className={clsx(
                  "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                  activeNav === label ? "bg-panel2 text-white shadow-focus" : "text-muted hover:bg-panel2 hover:text-text"
                )}
                key={label}
                onClick={() => setActiveNav(label)}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {label === "全部" && <span className="text-xs">{bookmarks.length}</span>}
                {label === "重复项" && duplicateCount > 0 && <span className="text-xs">{duplicateCount}</span>}
                {label === "待审核" && selectedCount > 0 && <span className="text-xs">{selectedCount}</span>}
              </button>
            ))}
          </nav>

          <div className="mt-6 rounded-lg border border-border bg-bg p-3 text-xs text-muted">
            <div className="mb-1 text-text">写入目标</div>
            <div className="truncate">{targetProfile?.name ?? "未找到 Chrome"}</div>
            <div className="mt-2 truncate">{targetProfile?.path ?? "-"}</div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-border bg-bg px-5">
            <div className="relative min-w-[320px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input
                className="h-9 w-full rounded-md border border-border bg-panel pl-9 pr-3 text-sm outline-none focus:shadow-focus"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、网址、标签"
                value={query}
              />
            </div>
            <button className="btn-secondary" onClick={() => void refreshProfiles()}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
              重新扫描
            </button>
            <button className="btn-primary" onClick={() => runCleanup("ai")} disabled={bookmarks.length === 0}>
              <Bot size={16} />
              AI 整理
            </button>
          </header>

          {notice && (
            <div
              className={clsx(
                "mx-5 mt-4 rounded-md border px-3 py-2 text-sm",
                notice.type === "ok" && "border-green-500/30 bg-green-500/10 text-green-200",
                notice.type === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-200",
                notice.type === "error" && "border-red-500/30 bg-red-500/10 text-red-200"
              )}
            >
              {notice.text}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-4 p-5">
            <div className="space-y-4 overflow-auto">
              <Panel title="导入书签" icon={<Download size={16} />}>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    className={clsx("seg", source === "chrome" && "seg-active")}
                    onClick={() => setSource("chrome")}
                  >
                    Google Chrome
                  </button>
                  <button
                    className={clsx("seg", source === "firefox" && "seg-active")}
                    onClick={() => setSource("firefox")}
                  >
                    Firefox
                  </button>
                </div>
                <div className="space-y-2">
                  {sourceProfiles.length === 0 ? (
                    <div className="empty">没有找到{source === "chrome" ? " Chrome" : " Firefox"}配置</div>
                  ) : (
                    sourceProfiles.map((profile) => (
                      <button
                        className="w-full rounded-md border border-border bg-bg p-3 text-left hover:border-primary/60"
                        key={`${profile.browser}-${profile.path}`}
                        onClick={() => void importSelectedProfile(profile)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{profile.name}</span>
                          <span className="rounded bg-panel2 px-2 py-0.5 text-xs text-muted">
                            {profile.browser === "chrome" ? "可写入" : "只读取"}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted">{profile.path}</div>
                      </button>
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="整理动作" icon={<Sparkles size={16} />}>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary" onClick={() => runCleanup("quick")} disabled={bookmarks.length === 0}>
                    快速整理
                  </button>
                  <button className="btn-primary" onClick={() => runCleanup("ai")} disabled={bookmarks.length === 0}>
                    AI 整理
                  </button>
                </div>
                <div className="mt-3 text-xs leading-5 text-muted">
                  当前版本先用本地规则模拟 AI 整理链路：分类、清理标题、标记重复项。模型 API 会在下一步接入。
                </div>
              </Panel>

              <Panel title="写入 Chrome" icon={<UploadCloud size={16} />}>
                <label className="mb-2 block text-xs text-muted">目标配置</label>
                <select
                  className="mb-3 h-9 w-full rounded-md border border-border bg-bg px-2 text-sm outline-none"
                  onChange={(event) => setTargetProfilePath(event.target.value)}
                  value={targetProfilePath}
                >
                  {chromeProfiles.map((profile) => (
                    <option key={profile.path} value={profile.path}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="将写入" value={selectedCount - duplicateCount} />
                  <Stat label="分类" value={categoryCount} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary" onClick={() => void refreshChromeState()}>
                    <ShieldCheck size={16} />
                    检测
                  </button>
                  <button className="btn-primary" onClick={() => void writeToChrome()} disabled={bookmarks.length === 0}>
                    写入 Chrome
                  </button>
                </div>
                <div className="mt-3 text-xs text-muted">
                  {chromeRunning ? "Chrome 正在运行，需关闭后写入。" : "默认只替换 Chrome 中的 browser-switch 文件夹。"}
                </div>
                {lastWrite && (
                  <div className="mt-3 rounded-md border border-border bg-bg p-2 text-xs text-muted">
                    <div className="text-green-200">上次写入成功</div>
                    <div className="mt-1 truncate">备份：{lastWrite.backup_path}</div>
                  </div>
                )}
              </Panel>
            </div>

            <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-panel">
              <div className="grid grid-cols-4 gap-3 border-b border-border p-4">
                <Stat label="书签" value={bookmarks.length} />
                <Stat label="文件夹" value={importInfo?.folders ?? 0} />
                <Stat label="重复项" value={duplicateCount} />
                <Stat label="待写入" value={selectedCount} />
              </div>

              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{activeNav}</div>
                  <div className="text-xs text-muted">
                    {importInfo ? `来源：${importInfo.source_browser} / ${importInfo.profile_name}` : "先导入 Chrome 或 Firefox"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => selectAllVisible(true)} disabled={filteredBookmarks.length === 0}>
                    全选
                  </button>
                  <button className="btn-secondary" onClick={() => selectAllVisible(false)} disabled={filteredBookmarks.length === 0}>
                    清空
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {filteredBookmarks.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-muted">
                    <div className="text-center">
                      <FileJson className="mx-auto mb-3" size={32} />
                      <div>还没有可显示的书签</div>
                    </div>
                  </div>
                ) : (
                  filteredBookmarks.slice(0, 2000).map((bookmark) => (
                    <div className="bookmark-row" key={`${bookmark.source_browser}-${bookmark.id}-${bookmark.url}`}>
                      <input
                        checked={bookmark.selected}
                        className="mt-1 h-4 w-4 accent-primary"
                        onChange={() => toggleSelected(bookmark.id)}
                        type="checkbox"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium">{bookmark.title}</div>
                          <Badge tone={bookmark.status === "重复" ? "warn" : "ok"}>{bookmark.status}</Badge>
                          <Badge>{bookmark.category}</Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted">{bookmark.url}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                          <span className="truncate">原目录：{bookmark.folder_path || "-"}</span>
                          <span>{bookmark.summary}</span>
                        </div>
                      </div>
                      {bookmark.selected ? (
                        <CheckCircle2 className="text-green-300" size={18} />
                      ) : (
                        <XCircle className="text-muted" size={18} />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-bg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" }) {
  return (
    <span
      className={clsx(
        "shrink-0 rounded px-1.5 py-0.5 text-[11px]",
        tone === "neutral" && "bg-panel2 text-muted",
        tone === "ok" && "bg-green-500/10 text-green-200",
        tone === "warn" && "bg-amber-500/10 text-amber-200"
      )}
    >
      {children}
    </span>
  );
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "spm"].forEach((key) =>
      parsed.searchParams.delete(key)
    );
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function cleanTitle(title: string, url: string) {
  const domain = domainOf(url);
  return title
    .replace(/\s[-|]\s(知乎|GitHub|Google Search|YouTube|Bilibili|哔哩哔哩).*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, domain.includes("github.com") ? 32 : 24);
}

function inferCategory(item: BookmarkRecord) {
  const text = `${item.title} ${item.url} ${item.folder_path}`.toLowerCase();
  if (/(openai|chatgpt|deepseek|claude|gemini|qwen|ai)/.test(text)) return "AI 工具";
  if (/(github|docs|developer|api|rust|react|typescript|npm|stackoverflow)/.test(text)) return "开发技术";
  if (/(figma|dribbble|behance|icon|font|design)/.test(text)) return "设计素材";
  if (/(notion|linear|trello|calendar|todo|workflow)/.test(text)) return "效率工具";
  if (/(course|tutorial|learn|book|wiki|medium)/.test(text)) return "学习资料";
  if (/(youtube|bilibili|netflix|music|video)/.test(text)) return "影音娱乐";
  if (/(steam|game|epicgames|ign)/.test(text)) return "游戏";
  return item.category || "其他";
}

function makeSummary(item: Pick<BookmarkRecord, "url" | "category" | "title">) {
  const domain = domainOf(item.url);
  return `${item.category} / ${domain || item.title}`.slice(0, 36);
}

function makeTags(url: string, category: string) {
  const domain = domainOf(url);
  return domain ? [category, domain] : [category];
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default App;

