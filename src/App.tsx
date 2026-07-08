import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import {
  ArchiveRestore,
  Bot,
  Briefcase,
  ChevronRight,
  CheckCircle2,
  Chrome,
  Code2,
  Coffee,
  DatabaseBackup,
  DollarSign,
  Download,
  FileJson,
  Folder,
  FolderTree,
  Gamepad2,
  Gauge,
  GraduationCap,
  Home,
  Library,
  Loader2,
  Newspaper,
  Palette,
  Play,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UploadCloud,
  Users,
  Wrench,
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

type BookmarkTreeNode = {
  name: string;
  path: string;
  children: Map<string, BookmarkTreeNode>;
  bookmarks: ViewBookmark[];
};

type Notice = {
  type: "ok" | "warn" | "error";
  text: string;
};

type AiSettings = {
  base_url: string;
  model: string;
  api_key: string;
  cleanup_instruction: string;
};

type AiSuggestion = {
  id: string;
  category: string;
  title: string;
  summary: string;
  tags: string[];
  confidence: number;
  reason: string;
  exclude: boolean;
};

const defaultAiSettings: AiSettings = {
  base_url: "https://api.deepseek.com",
  model: "deepseek-chat",
  api_key: "",
  cleanup_instruction: ""
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
  const [selectedSourceProfilePath, setSelectedSourceProfilePath] = useState("");
  const [targetProfilePath, setTargetProfilePath] = useState("");
  const [bookmarks, setBookmarks] = useState<ViewBookmark[]>([]);
  const [importInfo, setImportInfo] = useState<ImportResult | null>(null);
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState("总览");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [chromeRunning, setChromeRunning] = useState(false);
  const [lastWrite, setLastWrite] = useState<ChromeWriteResult | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [aiSettingsLoaded, setAiSettingsLoaded] = useState(false);

  useEffect(() => {
    void refreshProfiles();
    void loadPersistedAiSettings();
  }, []);

  useEffect(() => {
    if (!aiSettingsLoaded) {
      return;
    }
    localStorage.setItem("browser-switch.ai-settings", JSON.stringify(aiSettings));
    void invoke("save_ai_settings", { settings: aiSettings });
  }, [aiSettings, aiSettingsLoaded]);

  const sourceProfiles = source === "chrome" ? chromeProfiles : firefoxProfiles;
  const selectedSourceProfile = sourceProfiles.find((profile) => profile.path === selectedSourceProfilePath) ?? sourceProfiles[0];
  const selectedCount = bookmarks.filter((item) => item.selected).length;
  const duplicateCount = bookmarks.filter((item) => item.status === "重复").length;
  const categoryCount = new Set(bookmarks.map((item) => item.category)).size;
  const targetProfile = chromeProfiles.find((profile) => profile.path === targetProfilePath) ?? chromeProfiles[0];
  const writeCount = bookmarks.filter((item) => item.selected && item.status !== "重复").length;

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
  const reviewGroups = useMemo(() => groupBookmarksForReview(filteredBookmarks), [filteredBookmarks]);
  const originalTree = useMemo(() => buildBookmarkTree(filteredBookmarks, "folder"), [filteredBookmarks]);
  const categoryTree = useMemo(() => buildBookmarkTree(filteredBookmarks, "category"), [filteredBookmarks]);

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
        const defaultChrome = preferredProfile(chrome);
        setTargetProfilePath(defaultChrome.path);
        if (source === "chrome") {
          setSelectedSourceProfilePath(defaultChrome.path);
        }
      }
      if (firefox.length > 0 && source === "firefox") {
        setSelectedSourceProfilePath(preferredProfile(firefox).path);
      }
      setNotice({ type: "ok", text: `已找到 Chrome ${chrome.length} 个配置，Firefox ${firefox.length} 个配置` });
    } catch (error) {
      setNotice({ type: "error", text: String(error) });
    } finally {
      setLoading(false);
    }
  }

  async function loadPersistedAiSettings() {
    try {
      const settings = await invoke<AiSettings | null>("load_ai_settings");
      if (settings) {
        setAiSettings({ ...defaultAiSettings, ...settings });
      }
    } catch {
      // LocalStorage remains a fallback for older builds.
    } finally {
      setAiSettingsLoaded(true);
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
        const excluded = shouldExcludeByInstruction(item, aiSettings.cleanup_instruction);
        return {
          ...item,
          title,
          status: excluded ? "已排除" : duplicate ? "重复" : "正常",
          category: inferCategory(item),
          tags: makeTags(item.url, item.category),
          summary: mode === "ai" ? makeSummary({ ...item, title }) : item.summary,
          selected: !duplicate && !excluded
        };
      })
    );
    setActiveNav("待审核");
    setNotice({
      type: "ok",
      text: mode === "ai" ? "已生成 AI 整理建议，可确认后写入 Chrome" : "已完成快速整理，可继续 AI 整理"
    });
  }

  async function runAiCleanup() {
    if (bookmarks.length === 0) {
      setNotice({ type: "warn", text: "请先导入书签" });
      return;
    }

    const targets = bookmarks.filter((item) => item.selected && item.status !== "重复");
    if (targets.length === 0) {
      setNotice({ type: "warn", text: "没有可整理的选中书签" });
      return;
    }

    if (!aiSettings.api_key.trim()) {
      setNotice({ type: "warn", text: "未填写 API Key，已改用本地规则整理" });
      runCleanup("ai");
      return;
    }

    setLoading(true);
    setNotice({ type: "ok", text: `正在请求 AI 整理 ${targets.length} 条书签...` });
    try {
      const suggestions: AiSuggestion[] = [];
      const batches = chunkArray(targets, 40);
      for (let index = 0; index < batches.length; index += 1) {
        setNotice({ type: "ok", text: `正在请求 AI：第 ${index + 1}/${batches.length} 批` });
        const batchSuggestions = await invoke<AiSuggestion[]>("organize_bookmarks_ai", {
          settings: aiSettings,
          bookmarks: batches[index]
        });
        suggestions.push(...batchSuggestions);
      }
      const suggestionMap = new Map(suggestions.map((item) => [item.id, item]));
      const seen = new Map<string, string>();

      setBookmarks((current) =>
        current.map((item) => {
          const normalized = normalizeUrl(item.url);
          const duplicate = seen.has(normalized);
          if (!duplicate) {
            seen.set(normalized, item.id);
          }

          const suggestion = suggestionMap.get(item.id);
          if (!suggestion) {
          return {
            ...item,
            status: duplicate ? "重复" : item.status,
            selected: !duplicate && item.selected
          };
        }

          const excluded = suggestion.exclude || shouldExcludeByInstruction(item, aiSettings.cleanup_instruction);
          return {
            ...item,
            title: suggestion.title || item.title,
            category: suggestion.category || item.category,
            tags: suggestion.tags.length > 0 ? suggestion.tags : item.tags,
            summary: suggestion.summary || item.summary,
            status: excluded ? "已排除" : duplicate ? "重复" : "正常",
            selected: !duplicate && !excluded
          };
        })
      );
      setActiveNav("待审核");
      setNotice({ type: "ok", text: `AI 整理完成：${suggestions.length} 条，确认后可写入 Chrome` });
    } catch (error) {
      setNotice({ type: "error", text: String(error) });
    } finally {
      setLoading(false);
    }
  }

  async function refreshChromeState() {
    const running = await invoke<boolean>("check_chrome_running");
    setChromeRunning(running);
    setNotice({
      type: running ? "warn" : "ok",
      text: running ? "检测到 Chrome 正在运行，写入时会自动关闭并重启" : "Chrome 未运行，可以写入"
    });
  }

  async function writeToChrome() {
    if (!targetProfile) {
      setNotice({ type: "error", text: "没有可写入的 Chrome 配置" });
      return;
    }

    const running = await invoke<boolean>("check_chrome_running");
    setChromeRunning(running);
    const accepted = bookmarks.filter((item) => item.selected && item.status !== "重复");
    if (accepted.length === 0) {
      setNotice({ type: "warn", text: "没有可写入的已确认书签" });
      return;
    }

    const confirmed = window.confirm(
      `将写入 ${accepted.length} 条书签到 Chrome 书签栏。\n写入前会清空当前书签栏，再写入审核后的分类目录。\n如果 Chrome 正在运行，会先强制关闭，写完后重新打开。\n写入前会自动备份 Chrome 收藏夹。确认继续？`
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
      setNotice({ type: "ok", text: `已写入 Chrome 书签栏：${result.written_count} 条，备份已创建` });
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
                    onClick={() => {
                      setSource("chrome");
                      if (chromeProfiles.length > 0) {
                        setSelectedSourceProfilePath(preferredProfile(chromeProfiles).path);
                      }
                    }}
                  >
                    Google Chrome
                  </button>
                  <button
                    className={clsx("seg", source === "firefox" && "seg-active")}
                    onClick={() => {
                      setSource("firefox");
                      if (firefoxProfiles.length > 0) {
                        setSelectedSourceProfilePath(preferredProfile(firefoxProfiles).path);
                      }
                    }}
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
                        className={clsx(
                          "w-full rounded-md border bg-bg p-3 text-left hover:border-primary/60",
                          selectedSourceProfile?.path === profile.path ? "border-primary/70 shadow-focus" : "border-border"
                        )}
                        key={`${profile.browser}-${profile.path}`}
                        onClick={() => setSelectedSourceProfilePath(profile.path)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {profile.name}
                            {isDefaultProfile(profile) && <span className="ml-2 text-xs text-blue-200">默认</span>}
                          </span>
                          <span className="rounded bg-panel2 px-2 py-0.5 text-xs text-muted">
                            {profile.browser === "chrome" ? "可写入" : "只读取"}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted">{profile.path}</div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  className="btn-primary mt-3 w-full"
                  disabled={!selectedSourceProfile || loading}
                  onClick={() => selectedSourceProfile && void importSelectedProfile(selectedSourceProfile)}
                >
                  导入选中配置
                </button>
              </Panel>

              <Panel title="AI 整理" icon={<Sparkles size={16} />}>
                <label className="mb-1 block text-xs text-muted">接口地址</label>
                <input
                  className="input mb-2"
                  onChange={(event) => setAiSettings((current) => ({ ...current, base_url: event.target.value }))}
                  placeholder="https://api.deepseek.com"
                  value={aiSettings.base_url}
                />
                <label className="mb-1 block text-xs text-muted">模型</label>
                <input
                  className="input mb-2"
                  onChange={(event) => setAiSettings((current) => ({ ...current, model: event.target.value }))}
                  placeholder="deepseek-chat"
                  value={aiSettings.model}
                />
                <label className="mb-1 block text-xs text-muted">API Key</label>
                <input
                  className="input"
                  onChange={(event) => setAiSettings((current) => ({ ...current, api_key: event.target.value }))}
                  placeholder="sk-..."
                  type="password"
                  value={aiSettings.api_key}
                />
                <label className="mb-1 mt-3 block text-xs text-muted">整理要求</label>
                <textarea
                  className="input min-h-20 resize-none py-2"
                  onChange={(event) =>
                    setAiSettings((current) => ({ ...current, cleanup_instruction: event.target.value }))
                  }
                  placeholder="例如：帮我清理掉魔兽世界，我不玩了"
                  value={aiSettings.cleanup_instruction}
                />
                <div className="mt-2 text-xs leading-5 text-muted">
                  支持 OpenAI-compatible 接口。整理要求会随 AI 请求提交，本地也会先排除明确不要的主题。
                </div>
                <button className="btn-primary mt-3 w-full" onClick={() => void runAiCleanup()} disabled={bookmarks.length === 0 || loading}>
                  <Bot size={16} />
                  开始整理
                </button>
                <div className="mt-2 text-xs leading-5 text-muted">
                  未配置 API Key 时会自动使用本地规则。真实 AI 会自动分批处理全部选中书签。
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
                  <Stat label="将写入" value={writeCount} />
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
                  {chromeRunning ? "Chrome 正在运行，写入时会自动关闭并重启。" : "写入时会清空书签栏，再写入审核后的分类目录。"}
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
                ) : activeNav === "待审核" ? (
                  <div className="divide-y divide-border">
                    {reviewGroups.map(([category, items]) => (
                      <ReviewGroup category={category} items={items} key={category} onToggle={toggleSelected} />
                    ))}
                  </div>
                ) : activeNav === "AI 分类" ? (
                  <TreeView node={categoryTree} onToggle={toggleSelected} />
                ) : (
                  <TreeView node={originalTree} onToggle={toggleSelected} />
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ReviewGroup({
  category,
  items,
  onToggle
}: {
  category: string;
  items: ViewBookmark[];
  onToggle: (id: string) => void;
}) {
  const Icon = categoryIcon(category);

  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-panel2 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-bg text-blue-200">
            <Icon size={15} />
          </span>
          {category}
        </div>
        <span className="rounded bg-bg px-2 py-0.5 text-xs text-muted">{items.length} 条</span>
      </div>
      {items.map((bookmark) => (
        <BookmarkRow
          bookmark={bookmark}
          key={`${bookmark.source_browser}-${bookmark.id}-${bookmark.url}`}
          onToggle={onToggle}
        />
      ))}
    </section>
  );
}

function TreeView({ node, onToggle, depth = 0 }: { node: BookmarkTreeNode; onToggle: (id: string) => void; depth?: number }) {
  const children = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const bookmarks = [...node.bookmarks].sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

  return (
    <div>
      {children.map((child) => {
        const Icon = categoryIcon(child.name);
        return (
          <section key={child.path}>
            <div
              className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-panel2 px-4 py-2 text-sm font-medium"
              style={{ paddingLeft: `${16 + depth * 18}px` }}
            >
              <ChevronRight className="text-muted" size={14} />
              <span className="grid h-7 w-7 place-items-center rounded-md bg-bg text-blue-200">
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate">{child.name}</span>
              <span className="rounded bg-bg px-2 py-0.5 text-xs text-muted">{countTreeBookmarks(child)} 条</span>
            </div>
            <TreeView node={child} onToggle={onToggle} depth={depth + 1} />
          </section>
        );
      })}
      {bookmarks.map((bookmark) => (
        <div
          className="tree-bookmark"
          key={`${bookmark.source_browser}-${bookmark.id}-${bookmark.url}`}
          style={{ paddingLeft: `${26 + depth * 18}px` }}
        >
          <BookmarkRow bookmark={bookmark} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}

function categoryIcon(category: string) {
  if (category.includes("公司")) return Briefcase;
  if (category.includes("家庭")) return Home;
  if (category.includes("个人")) return Users;
  if (category.includes("休闲")) return Coffee;
  if (category.includes("资料")) return Library;
  if (category.includes("开发")) return Code2;
  if (category.includes("AI")) return Bot;
  if (category.includes("设计")) return Palette;
  if (category.includes("效率")) return Wrench;
  if (category.includes("学习")) return GraduationCap;
  if (category.includes("新闻")) return Newspaper;
  if (category.includes("投资") || category.includes("理财")) return DollarSign;
  if (category.includes("购物")) return ShoppingCart;
  if (category.includes("社交")) return Users;
  if (category.includes("影音") || category.includes("娱乐")) return Play;
  if (category.includes("游戏")) return Gamepad2;
  if (category.includes("生活")) return Home;
  if (category.includes("工作")) return Settings;
  return Folder;
}

function BookmarkRow({ bookmark, onToggle }: { bookmark: ViewBookmark; onToggle: (id: string) => void }) {
  return (
    <div className="bookmark-row">
      <input
        checked={bookmark.selected}
        className="mt-1 h-4 w-4 accent-primary"
        onChange={() => onToggle(bookmark.id)}
        type="checkbox"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium">{bookmark.title}</div>
          <Badge tone={bookmark.status === "重复" || bookmark.status === "已排除" ? "warn" : "ok"}>{bookmark.status}</Badge>
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
  if (/(browser-switch|slientresolve|logicmerger|项目|project)/.test(text)) return "公司/项目/待命名项目";
  if (/(openai|chatgpt|deepseek|claude|gemini|qwen|ai)/.test(text)) return "公司/AI 工具";
  if (/(github|docs|developer|api|rust|react|typescript|npm|stackoverflow)/.test(text)) return "公司/开发技术";
  if (/(figma|dribbble|behance|icon|font|design)/.test(text)) return "公司/设计素材";
  if (/(notion|linear|trello|calendar|todo|workflow)/.test(text)) return "个人/效率工具";
  if (/(course|tutorial|learn|book|wiki|medium)/.test(text)) return "个人/学习成长";
  if (/(finance|stock|crypto|tradingview|bank)/.test(text)) return "家庭/投资理财";
  if (/(taobao|tmall|jd.com|amazon|shop|购物)/.test(text)) return "家庭/购物消费";
  if (/(youtube|bilibili|netflix|music|video)/.test(text)) return "休闲/影音娱乐";
  if (/(steam|game|epicgames|ign|warcraft|wow|魔兽)/.test(text)) return "休闲/游戏";
  if (/(twitter|x.com|reddit|weibo|zhihu|discord)/.test(text)) return "休闲/社交社区";
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

function groupBookmarksForReview(bookmarks: ViewBookmark[]) {
  const groups = new Map<string, ViewBookmark[]>();
  for (const bookmark of bookmarks.filter((item) => item.selected && item.status !== "重复")) {
    const category = bookmark.category.trim() || "其他";
    groups.set(category, [...(groups.get(category) ?? []), bookmark]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
}

function buildBookmarkTree(bookmarks: ViewBookmark[], mode: "folder" | "category") {
  const root: BookmarkTreeNode = { name: "root", path: "", children: new Map(), bookmarks: [] };

  for (const bookmark of bookmarks) {
    const parts =
      mode === "category"
        ? (bookmark.category.trim() || "其他/待确认")
            .split("/")
            .map((part) => part.trim())
            .filter(Boolean)
        : (bookmark.folder_path || "未分类")
            .split("/")
            .map((part) => part.trim())
            .filter(Boolean);

    let current = root;
    for (const part of parts.length > 0 ? parts : ["未分类"]) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.children.get(part);
      if (!child) {
        child = { name: part, path, children: new Map(), bookmarks: [] };
        current.children.set(part, child);
      }
      current = child;
    }
    current.bookmarks.push(bookmark);
  }

  return root;
}

function countTreeBookmarks(node: BookmarkTreeNode): number {
  let count = node.bookmarks.length;
  for (const child of node.children.values()) {
    count += countTreeBookmarks(child);
  }
  return count;
}

function preferredProfile(profiles: BrowserProfile[]) {
  return profiles.find(isDefaultProfile) ?? profiles[0];
}

function isDefaultProfile(profile: BrowserProfile) {
  const name = profile.name.toLowerCase();
  return name === "default" || name.includes("default-release") || name.includes(".default");
}

function shouldExcludeByInstruction(bookmark: BookmarkRecord, instruction: string) {
  const normalizedInstruction = instruction.trim().toLowerCase();
  if (!normalizedInstruction) {
    return false;
  }

  const text = `${bookmark.title} ${bookmark.url} ${bookmark.folder_path} ${bookmark.tags.join(" ")}`.toLowerCase();
  const removeIntent = /(清理|删除|去掉|不要|不保留|不写入|排除|不玩了|不看了)/.test(normalizedInstruction);
  if (!removeIntent) {
    return false;
  }

  const keywordGroups = [
    ["魔兽世界", "魔兽", "world of warcraft", "warcraft", "wow"],
    ["游戏", "game", "steam", "epicgames"],
    ["购物", "电商", "taobao", "tmall", "jd.com", "amazon"],
    ["视频", "影音", "娱乐", "youtube", "bilibili"]
  ];

  for (const group of keywordGroups) {
    if (group.some((keyword) => normalizedInstruction.includes(keyword))) {
      return group.some((keyword) => text.includes(keyword));
    }
  }

  const looseTerms = normalizedInstruction
    .replace(/[，。,.!?！？()（）]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 2 && !/(帮我|清理|删除|去掉|不要|不保留|不写入|排除|我不|不玩了|不看了)/.test(term));

  return looseTerms.some((term) => text.includes(term));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem("browser-switch.ai-settings");
    if (!raw) {
      return defaultAiSettings;
    }
    return { ...defaultAiSettings, ...JSON.parse(raw) };
  } catch {
    return defaultAiSettings;
  }
}

export default App;
