use chrono::Utc;
use reqwest::Client;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const AI_MAX_OUTPUT_TOKENS: u32 = 8192;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BrowserProfile {
    browser: String,
    name: String,
    path: String,
    bookmark_path: String,
    is_write_target: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BookmarkRecord {
    id: String,
    source_browser: String,
    source_profile: String,
    title: String,
    url: String,
    folder_path: String,
    category: String,
    tags: Vec<String>,
    status: String,
    date_added: Option<i64>,
    visit_count: Option<i64>,
}

#[derive(Debug, Serialize)]
struct ImportResult {
    source_browser: String,
    profile_name: String,
    backup_path: String,
    folders: usize,
    bookmarks: Vec<BookmarkRecord>,
}

#[derive(Debug, Serialize)]
struct ChromeWriteResult {
    target_profile: String,
    backup_path: String,
    written_count: usize,
    folder_count: usize,
    managed_folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AiSettings {
    base_url: String,
    model: String,
    api_key: String,
    #[serde(default)]
    cleanup_instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AiSuggestion {
    id: String,
    category: String,
    title: String,
    summary: String,
    tags: Vec<String>,
    confidence: f64,
    reason: String,
    exclude: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AnalysisFolderAdvice {
    path: String,
    decision: String,
    reason: String,
    priority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AnalysisCandidate {
    title: String,
    url: String,
    folder_path: String,
    action: String,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BookmarkAnalysisReport {
    summary: String,
    folders: Vec<AnalysisFolderAdvice>,
    candidates: Vec<AnalysisCandidate>,
    actions: Vec<String>,
}

#[derive(Default)]
struct ChromeFolderNode {
    children: BTreeMap<String, ChromeFolderNode>,
    bookmarks: Vec<BookmarkRecord>,
}

#[tauri::command]
fn detect_chrome_profiles() -> Result<Vec<BrowserProfile>, String> {
    let local_app_data =
        env::var("LOCALAPPDATA").map_err(|_| "无法读取 LOCALAPPDATA".to_string())?;
    let root = PathBuf::from(local_app_data)
        .join("Google")
        .join("Chrome")
        .join("User Data");

    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut profiles = Vec::new();
    for entry in fs::read_dir(&root).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let bookmark_path = path.join("Bookmarks");
        if bookmark_path.exists() {
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Chrome Profile")
                .to_string();

            profiles.push(BrowserProfile {
                browser: "chrome".to_string(),
                name,
                path: path_to_string(&path),
                bookmark_path: path_to_string(&bookmark_path),
                is_write_target: true,
            });
        }
    }

    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(profiles)
}

#[tauri::command]
fn detect_firefox_profiles() -> Result<Vec<BrowserProfile>, String> {
    let app_data = env::var("APPDATA").map_err(|_| "无法读取 APPDATA".to_string())?;
    let firefox_root = PathBuf::from(app_data).join("Mozilla").join("Firefox");
    let root = firefox_root.join("Profiles");

    if !root.exists() {
        return Ok(Vec::new());
    }

    let default_profile_path = firefox_default_profile_path(&firefox_root);
    let mut profiles = Vec::new();
    for entry in fs::read_dir(&root).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let bookmark_path = path.join("places.sqlite");
        if bookmark_path.exists() {
            let metadata = fs::metadata(&bookmark_path).map_err(|err| err.to_string())?;
            if metadata.len() == 0 {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Firefox Profile")
                .to_string();

            profiles.push(BrowserProfile {
                browser: "firefox".to_string(),
                name,
                path: path_to_string(&path),
                bookmark_path: path_to_string(&bookmark_path),
                is_write_target: false,
            });
        }
    }

    profiles.sort_by(|a, b| {
        firefox_profile_rank(a, default_profile_path.as_deref())
            .cmp(&firefox_profile_rank(b, default_profile_path.as_deref()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(profiles)
}

fn firefox_default_profile_path(firefox_root: &Path) -> Option<PathBuf> {
    let ini_path = firefox_root.join("profiles.ini");
    let raw = fs::read_to_string(ini_path).ok()?;

    for line in raw.lines() {
        let line = line.trim();
        let Some(value) = line.strip_prefix("Default=") else {
            continue;
        };
        if value == "1" || value.is_empty() {
            continue;
        }

        let normalized = value.replace('/', std::path::MAIN_SEPARATOR_STR);
        let path = PathBuf::from(normalized);
        return Some(if path.is_absolute() {
            path
        } else {
            firefox_root.join(path)
        });
    }

    None
}

fn firefox_profile_rank(profile: &BrowserProfile, default_profile_path: Option<&Path>) -> usize {
    let path = PathBuf::from(&profile.path);
    if default_profile_path.is_some_and(|default_path| default_path == path) {
        return 0;
    }

    let name = profile.name.to_lowercase();
    if name.contains("default-release") {
        1
    } else if name == "default" || name.ends_with(".default") {
        2
    } else {
        3
    }
}

#[tauri::command]
fn import_chrome_bookmarks(
    app: AppHandle,
    profile_path: String,
    profile_name: String,
) -> Result<ImportResult, String> {
    let bookmark_path = PathBuf::from(&profile_path).join("Bookmarks");
    if !bookmark_path.exists() {
        return Err("没有找到 Chrome Bookmarks 文件".to_string());
    }

    let backup_path = backup_file(&app, "chrome", &profile_name, &bookmark_path)?;
    let raw = fs::read_to_string(&backup_path).map_err(|err| err.to_string())?;
    let value: Value =
        serde_json::from_str(&raw).map_err(|err| format!("Chrome 书签 JSON 解析失败: {err}"))?;

    let mut bookmarks = Vec::new();
    let mut folders = 0usize;
    if let Some(roots) = value.get("roots").and_then(Value::as_object) {
        for node in roots.values() {
            collect_chrome_node(
                node,
                Vec::new(),
                &profile_name,
                &mut bookmarks,
                &mut folders,
            );
        }
    }

    Ok(ImportResult {
        source_browser: "chrome".to_string(),
        profile_name,
        backup_path: path_to_string(&backup_path),
        folders,
        bookmarks,
    })
}

#[tauri::command]
fn import_firefox_bookmarks(
    app: AppHandle,
    profile_path: String,
    profile_name: String,
) -> Result<ImportResult, String> {
    let places_path = PathBuf::from(&profile_path).join("places.sqlite");
    if !places_path.exists() {
        return Err("没有找到 Firefox places.sqlite".to_string());
    }

    let backup_path = backup_file(&app, "firefox", &profile_name, &places_path)?;
    copy_if_exists(
        &places_path.with_extension("sqlite-wal"),
        &backup_path.with_extension("sqlite-wal"),
    )?;
    copy_if_exists(
        &places_path.with_extension("sqlite-shm"),
        &backup_path.with_extension("sqlite-shm"),
    )?;

    let connection =
        Connection::open(&backup_path).map_err(|err| format!("无法打开 Firefox 数据库: {err}"))?;
    let folders = load_firefox_folders(&connection)?;
    let mut bookmarks = Vec::new();

    let mut statement = connection
        .prepare(
            "SELECT b.guid, b.parent, COALESCE(b.title, p.title, p.url), p.url, b.dateAdded, p.visit_count
             FROM moz_bookmarks b
             LEFT JOIN moz_places p ON b.fk = p.id
             WHERE b.type = 1 AND p.url IS NOT NULL
             ORDER BY b.position ASC",
        )
        .map_err(|err| err.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let guid: String = row.get(0)?;
            let parent: i64 = row.get(1)?;
            let title: String = row.get(2)?;
            let url: String = row.get(3)?;
            let date_added: Option<i64> = row.get(4)?;
            let visit_count: Option<i64> = row.get(5)?;
            Ok((guid, parent, title, url, date_added, visit_count))
        })
        .map_err(|err| err.to_string())?;

    for row in rows {
        let (guid, parent, title, url, date_added, visit_count) =
            row.map_err(|err| err.to_string())?;
        let folder_path = firefox_folder_path(parent, &folders);
        let category = rule_category(&title, &url, &folder_path);
        let tags = default_tags(&url, &category);
        bookmarks.push(BookmarkRecord {
            id: guid,
            source_browser: "firefox".to_string(),
            source_profile: profile_name.clone(),
            title,
            url,
            folder_path,
            category,
            tags,
            status: "正常".to_string(),
            date_added: date_added.map(|value| value / 1000),
            visit_count,
        });
    }

    Ok(ImportResult {
        source_browser: "firefox".to_string(),
        profile_name,
        backup_path: path_to_string(&backup_path),
        folders: folders.len(),
        bookmarks,
    })
}

#[tauri::command]
fn check_chrome_running() -> bool {
    chrome_running()
}

#[tauri::command]
fn load_ai_settings(app: AppHandle) -> Result<Option<AiSettings>, String> {
    let path = ai_settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|err| format!("读取 AI 设置失败: {err}"))?;
    let settings = serde_json::from_str::<AiSettings>(&raw)
        .map_err(|err| format!("AI 设置解析失败: {err}"))?;
    Ok(Some(settings))
}

#[tauri::command]
fn save_ai_settings(app: AppHandle, settings: AiSettings) -> Result<(), String> {
    let path = ai_settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&settings).map_err(|err| err.to_string())?;
    fs::write(path, raw).map_err(|err| format!("保存 AI 设置失败: {err}"))
}

#[tauri::command]
fn write_chrome_bookmarks(
    app: AppHandle,
    profile_path: String,
    bookmarks: Vec<BookmarkRecord>,
) -> Result<ChromeWriteResult, String> {
    let target = PathBuf::from(&profile_path).join("Bookmarks");
    if !target.exists() {
        return Err("没有找到目标 Chrome Bookmarks 文件".to_string());
    }

    let killed_chrome = if chrome_running() {
        kill_chrome()?;
        thread::sleep(Duration::from_millis(1200));
        true
    } else {
        false
    };

    let backup_path = backup_chrome_writeback(&app, &target)?;
    let raw = fs::read_to_string(&target).map_err(|err| err.to_string())?;
    let mut value: Value =
        serde_json::from_str(&raw).map_err(|err| format!("Chrome 书签 JSON 解析失败: {err}"))?;
    let mut next_id = max_chrome_id(&value) + 1;
    let category_folders = build_chrome_category_folders(&bookmarks, &mut next_id);
    let folder_count = category_folders.len();

    let roots = value
        .get_mut("roots")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Chrome Bookmarks 缺少 roots".to_string())?;
    remove_legacy_browser_switch_folders(roots);
    let bookmark_bar = roots
        .get_mut("bookmark_bar")
        .ok_or_else(|| "Chrome Bookmarks 缺少 bookmark_bar 节点".to_string())?;
    let children = bookmark_bar
        .get_mut("children")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Chrome 书签栏缺少 children".to_string())?;

    // The write target is the Chrome bookmark bar. The user expects the reviewed
    // result to replace the pre-cleanup bookmark bar, not sit beside it.
    children.clear();
    children.extend(category_folders);

    let serialized = serde_json::to_string_pretty(&value).map_err(|err| err.to_string())?;
    let temp_path = target.with_file_name("Bookmarks.browser-switch.tmp");
    fs::write(&temp_path, serialized).map_err(|err| err.to_string())?;

    let validation_raw = fs::read_to_string(&temp_path).map_err(|err| err.to_string())?;
    let _: Value =
        serde_json::from_str(&validation_raw).map_err(|err| format!("写入前校验失败: {err}"))?;

    fs::remove_file(&target).map_err(|err| format!("替换 Chrome Bookmarks 失败: {err}"))?;
    fs::rename(&temp_path, &target).map_err(|err| format!("写入 Chrome Bookmarks 失败: {err}"))?;

    if killed_chrome {
        open_chrome();
    }

    Ok(ChromeWriteResult {
        target_profile: profile_path,
        backup_path: path_to_string(&backup_path),
        written_count: bookmarks.len(),
        folder_count,
        managed_folder: "书签栏".to_string(),
    })
}

#[tauri::command]
fn restore_chrome_backup(
    app: AppHandle,
    profile_path: String,
    backup_path: String,
) -> Result<String, String> {
    if chrome_running() {
        return Err("请关闭 Chrome 后再还原".to_string());
    }

    let target = PathBuf::from(&profile_path).join("Bookmarks");
    let backup = PathBuf::from(&backup_path);
    if !backup.exists() {
        return Err("备份文件不存在".to_string());
    }

    let _: Value =
        serde_json::from_str(&fs::read_to_string(&backup).map_err(|err| err.to_string())?)
            .map_err(|err| format!("备份 JSON 校验失败: {err}"))?;

    let pre_restore = backup_chrome_writeback(&app, &target)?;
    fs::copy(&backup, &target).map_err(|err| format!("还原 Chrome 失败: {err}"))?;
    Ok(path_to_string(&pre_restore))
}

#[tauri::command]
async fn organize_bookmarks_ai(
    settings: AiSettings,
    bookmarks: Vec<BookmarkRecord>,
) -> Result<Vec<AiSuggestion>, String> {
    if settings.api_key.trim().is_empty() {
        return Err("请先填写 API Key".to_string());
    }
    if settings.base_url.trim().is_empty() {
        return Err("请先填写接口地址".to_string());
    }
    if settings.model.trim().is_empty() {
        return Err("请先填写模型名称".to_string());
    }
    if bookmarks.is_empty() {
        return Err("没有可整理的书签".to_string());
    }

    let endpoint = chat_completions_endpoint(&settings.base_url);
    let input_items: Vec<Value> = bookmarks
        .iter()
        .map(|bookmark| {
            json!({
                "id": bookmark.id,
                "title": bookmark.title,
                "url": bookmark.url,
                "domain": domain_of(&bookmark.url),
                "original_folder_path": bookmark.folder_path,
                "source_browser": bookmark.source_browser
            })
        })
        .collect();

    let prompt = json!({
        "directory_hierarchy": {
            "公司": ["项目/<项目名>", "开发技术", "办公协作", "设计素材", "AI 工具"],
            "家庭": ["生活日常", "购物消费", "投资理财", "健康医疗", "房车出行"],
            "个人": ["学习成长", "效率工具", "资料库", "账号服务"],
            "休闲": ["游戏", "影音娱乐", "社交社区", "新闻资讯"],
            "其他": ["待确认"]
        },
        "rules": {
            "category": "category 必须是目录路径，用 / 分隔，例如 公司/项目/browser-switch、公司/开发技术、家庭/购物消费、休闲/游戏、个人/学习成长、其他/待确认。能识别项目名时优先放入 公司/项目/<项目名>。",
            "title": "改良标题：中文尽量不超过15字，英文尽量不超过30字符；保留产品名/项目名；去掉站点噪音后缀如 - 知乎、| GitHub、- Google Search；不要编造。",
            "summary": "中文摘要不超过30字，用来说明这个页面是做什么的",
            "tags": "返回2到5个具体标签，不要返回网站、工具、资源这类泛词",
            "exclude": "如果用户要求清理掉、删除、不再保留某类书签，将对应项 exclude 设为 true",
            "output": "只返回JSON，不要Markdown，不要解释"
        },
        "user_instruction": settings.cleanup_instruction,
        "items": input_items
    });

    let body = json!({
        "model": settings.model,
        "temperature": 0.2,
        "max_tokens": AI_MAX_OUTPUT_TOKENS,
        "response_format": { "type": "json_object" },
        "messages": [
            {
                "role": "system",
                "content": "你是一个中文书签整理助手。你只生成整理建议，不删除、不移动真实书签。category 必须返回目录路径，用 / 分隔，适合直接写入 Chrome 书签栏的嵌套文件夹。输出必须是 JSON，格式为 {\"items\":[{\"id\":\"...\",\"category\":\"公司/项目/项目名\",\"title\":\"...\",\"summary\":\"...\",\"tags\":[\"...\"],\"confidence\":0.8,\"reason\":\"...\",\"exclude\":false}]}。如果用户要求清理掉某个主题，对匹配书签返回 exclude:true。"
            },
            {
                "role": "user",
                "content": prompt.to_string()
            }
        ]
    });

    let client = Client::new();
    let response = client
        .post(endpoint)
        .bearer_auth(settings.api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("AI 请求失败: {err}"))?;

    let status = response.status();
    let response_json: Value = response
        .json()
        .await
        .map_err(|err| format!("AI 响应解析失败: {err}"))?;

    if !status.is_success() {
        return Err(format!("AI 请求失败: HTTP {status}, {response_json}"));
    }

    let content = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| format!("AI 响应缺少 message.content: {response_json}"))?;

    let parsed = parse_ai_content(content)?;
    let items = parsed
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| "AI JSON 缺少 items 数组".to_string())?;

    let mut suggestions = Vec::new();
    for item in items {
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "AI 返回项缺少 id".to_string())?
            .to_string();
        suggestions.push(AiSuggestion {
            id,
            category: item
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or("其他")
                .trim()
                .to_string(),
            title: item
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string(),
            summary: item
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string(),
            tags: item
                .get("tags")
                .and_then(Value::as_array)
                .map(|tags| {
                    tags.iter()
                        .filter_map(Value::as_str)
                        .map(|tag| tag.trim().to_string())
                        .filter(|tag| !tag.is_empty())
                        .take(5)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
            confidence: item
                .get("confidence")
                .and_then(Value::as_f64)
                .unwrap_or(0.5)
                .clamp(0.0, 1.0),
            reason: item
                .get("reason")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string(),
            exclude: item
                .get("exclude")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        });
    }

    Ok(suggestions)
}

#[tauri::command]
async fn analyze_bookmarks_ai(
    settings: AiSettings,
    bookmarks: Vec<BookmarkRecord>,
) -> Result<BookmarkAnalysisReport, String> {
    if settings.api_key.trim().is_empty() {
        return Err("请先填写 API Key".to_string());
    }
    if bookmarks.is_empty() {
        return Err("没有可分析的书签".to_string());
    }

    let endpoint = chat_completions_endpoint(&settings.base_url);
    let input = build_analysis_input(&bookmarks, &settings.cleanup_instruction);
    let body = json!({
        "model": settings.model,
        "temperature": 0.15,
        "max_tokens": AI_MAX_OUTPUT_TOKENS,
        "response_format": { "type": "json_object" },
        "messages": [
            {
                "role": "system",
                "content": "你是一个中文收藏夹诊断顾问。你要站在 2026 年 AI 工具普及后的使用场景下，判断哪些收藏夹/链接已经低价值、重复、过时、可删除或应归档。不要泛泛而谈，要给出目录级建议和具体候选项。输出必须是 JSON：{\"summary\":\"...\",\"folders\":[{\"path\":\"...\",\"decision\":\"清理|归档|保留|重组\",\"reason\":\"...\",\"priority\":\"高|中|低\"}],\"candidates\":[{\"title\":\"...\",\"url\":\"...\",\"folder_path\":\"...\",\"action\":\"删除|归档|保留|待确认\",\"reason\":\"...\"}],\"actions\":[\"...\"]}。"
            },
            {
                "role": "user",
                "content": input.to_string()
            }
        ]
    });

    let client = Client::new();
    let response = client
        .post(endpoint)
        .bearer_auth(settings.api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("AI 诊断请求失败: {err}"))?;

    let status = response.status();
    let response_json: Value = response
        .json()
        .await
        .map_err(|err| format!("AI 诊断响应解析失败: {err}"))?;

    if !status.is_success() {
        return Err(format!("AI 诊断失败: HTTP {status}, {response_json}"));
    }

    let content = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| format!("AI 诊断响应缺少 message.content: {response_json}"))?;

    let parsed = parse_ai_content(content)?;
    serde_json::from_value::<BookmarkAnalysisReport>(parsed)
        .map_err(|err| format!("AI 诊断 JSON 解析失败: {err}"))
}

fn collect_chrome_node(
    node: &Value,
    folder: Vec<String>,
    profile_name: &str,
    bookmarks: &mut Vec<BookmarkRecord>,
    folders: &mut usize,
) {
    match node.get("type").and_then(Value::as_str) {
        Some("folder") => {
            *folders += 1;
            let name = node.get("name").and_then(Value::as_str).unwrap_or("未命名");
            let mut next_folder = folder;
            if !name.is_empty() && !["书签栏", "其他书签", "移动设备书签"].contains(&name)
            {
                next_folder.push(name.to_string());
            }

            if let Some(children) = node.get("children").and_then(Value::as_array) {
                for child in children {
                    collect_chrome_node(
                        child,
                        next_folder.clone(),
                        profile_name,
                        bookmarks,
                        folders,
                    );
                }
            }
        }
        Some("url") => {
            let title = node
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("未命名")
                .to_string();
            let url = node
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if url.is_empty() {
                return;
            }

            let folder_path = if folder.is_empty() {
                "Chrome".to_string()
            } else {
                folder.join("/")
            };
            let category = rule_category(&title, &url, &folder_path);
            let tags = default_tags(&url, &category);
            let id = node
                .get("guid")
                .and_then(Value::as_str)
                .map(ToString::to_string)
                .unwrap_or_else(|| stable_id(&url));

            bookmarks.push(BookmarkRecord {
                id,
                source_browser: "chrome".to_string(),
                source_profile: profile_name.to_string(),
                title,
                url,
                folder_path,
                category,
                tags,
                status: "正常".to_string(),
                date_added: node
                    .get("date_added")
                    .and_then(Value::as_str)
                    .and_then(chrome_time_to_unix_ms),
                visit_count: None,
            });
        }
        _ => {}
    }
}

fn load_firefox_folders(connection: &Connection) -> Result<HashMap<i64, (i64, String)>, String> {
    let mut folders = HashMap::new();
    let mut statement = connection
        .prepare("SELECT id, parent, COALESCE(title, '') FROM moz_bookmarks WHERE type = 2")
        .map_err(|err| err.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let parent: i64 = row.get(1)?;
            let title: String = row.get(2)?;
            Ok((id, parent, title))
        })
        .map_err(|err| err.to_string())?;

    for row in rows {
        let (id, parent, title) = row.map_err(|err| err.to_string())?;
        folders.insert(id, (parent, title));
    }

    Ok(folders)
}

fn firefox_folder_path(parent_id: i64, folders: &HashMap<i64, (i64, String)>) -> String {
    let mut names = Vec::new();
    let mut current = parent_id;
    let mut guard = 0;

    while let Some((parent, title)) = folders.get(&current) {
        if !title.is_empty() && !is_firefox_system_root(current) {
            names.push(title.clone());
        }
        if *parent == current || *parent == 0 {
            break;
        }
        current = *parent;
        guard += 1;
        if guard > 20 {
            break;
        }
    }

    names.reverse();
    if names.is_empty() {
        "Firefox".to_string()
    } else {
        names.join("/")
    }
}

fn is_firefox_system_root(folder_id: i64) -> bool {
    matches!(folder_id, 1..=6)
}

fn build_chrome_category_folders(bookmarks: &[BookmarkRecord], next_id: &mut u64) -> Vec<Value> {
    let mut root = ChromeFolderNode::default();
    for bookmark in bookmarks {
        let path = category_path(&bookmark.category);
        insert_chrome_folder_path(&mut root, &path, bookmark.clone());
    }

    chrome_folder_children_to_json(&root, next_id)
}

fn category_path(category: &str) -> Vec<String> {
    let parts = category
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    if parts.is_empty() {
        vec!["其他".to_string()]
    } else {
        parts
    }
}

fn insert_chrome_folder_path(
    node: &mut ChromeFolderNode,
    path: &[String],
    bookmark: BookmarkRecord,
) {
    let mut current = node;
    for part in path {
        current = current.children.entry(part.clone()).or_default();
    }
    current.bookmarks.push(bookmark);
}

fn chrome_folder_children_to_json(node: &ChromeFolderNode, next_id: &mut u64) -> Vec<Value> {
    let mut values = Vec::new();

    for (name, child) in &node.children {
        let mut children = chrome_folder_children_to_json(child, next_id);
        children.extend(child.bookmarks.iter().map(|item| {
            json!({
                "date_added": chrome_time_now(),
                "date_last_used": "0",
                "guid": Uuid::new_v4().to_string(),
                "id": next_chrome_id(next_id),
                "name": item.title,
                "type": "url",
                "url": item.url
            })
        }));

        values.push(json!({
            "children": children,
            "date_added": chrome_time_now(),
            "date_last_used": "0",
            "date_modified": chrome_time_now(),
            "guid": Uuid::new_v4().to_string(),
            "id": next_chrome_id(next_id),
            "name": name,
            "type": "folder"
        }));
    }

    values
}

fn remove_legacy_browser_switch_folders(roots: &mut serde_json::Map<String, Value>) {
    for root in roots.values_mut() {
        if let Some(children) = root.get_mut("children").and_then(Value::as_array_mut) {
            children.retain(|child| {
                child.get("name").and_then(Value::as_str) != Some("browser-switch")
            });
        }
    }
}

fn max_chrome_id(value: &Value) -> u64 {
    let own = value
        .get("id")
        .and_then(Value::as_str)
        .and_then(|id| id.parse::<u64>().ok())
        .unwrap_or(0);

    let child_max = value
        .get("children")
        .and_then(Value::as_array)
        .map(|children| children.iter().map(max_chrome_id).max().unwrap_or(0))
        .unwrap_or(0);

    let root_max = value
        .get("roots")
        .and_then(Value::as_object)
        .map(|roots| roots.values().map(max_chrome_id).max().unwrap_or(0))
        .unwrap_or(0);

    own.max(child_max).max(root_max)
}

fn next_chrome_id(next_id: &mut u64) -> String {
    let id = *next_id;
    *next_id += 1;
    id.to_string()
}

fn rule_category(title: &str, url: &str, folder_path: &str) -> String {
    let text = format!("{} {} {}", title, url, folder_path).to_lowercase();
    let rules = [
        (
            "AI 工具",
            [
                "openai", "chatgpt", "deepseek", "qwen", "claude", "gemini", "ai",
            ]
            .as_slice(),
        ),
        (
            "开发技术",
            [
                "github",
                "docs",
                "developer",
                "api",
                "rust",
                "react",
                "typescript",
                "npm",
                "stackoverflow",
            ]
            .as_slice(),
        ),
        (
            "设计素材",
            ["figma", "dribbble", "behance", "icon", "font", "design"].as_slice(),
        ),
        (
            "效率工具",
            ["notion", "linear", "trello", "calendar", "todo", "workflow"].as_slice(),
        ),
        (
            "学习资料",
            ["course", "tutorial", "learn", "book", "wiki", "medium"].as_slice(),
        ),
        (
            "新闻资讯",
            ["news", "36kr", "sspai", "theverge", "bbc", "nytimes"].as_slice(),
        ),
        (
            "投资理财",
            ["finance", "stock", "crypto", "binance", "tradingview"].as_slice(),
        ),
        (
            "购物电商",
            ["taobao", "tmall", "jd.com", "amazon", "shop"].as_slice(),
        ),
        (
            "社交社区",
            ["twitter", "x.com", "reddit", "weibo", "zhihu", "discord"].as_slice(),
        ),
        (
            "影音娱乐",
            ["youtube", "bilibili", "netflix", "music", "video"].as_slice(),
        ),
        ("游戏", ["steam", "game", "epicgames", "ign"].as_slice()),
        (
            "工作办公",
            ["office", "docs.google", "slack", "teams", "feishu", "lark"].as_slice(),
        ),
    ];

    for (category, keywords) in rules {
        if keywords.iter().any(|keyword| text.contains(keyword)) {
            return category.to_string();
        }
    }

    "其他".to_string()
}

fn default_tags(url: &str, category: &str) -> Vec<String> {
    let domain = url
        .split("//")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or(url)
        .trim_start_matches("www.")
        .to_string();

    if domain.is_empty() {
        vec![category.to_string()]
    } else {
        vec![category.to_string(), domain]
    }
}

fn build_analysis_input(bookmarks: &[BookmarkRecord], instruction: &str) -> Value {
    let mut folder_counts: HashMap<String, usize> = HashMap::new();
    let mut domain_counts: HashMap<String, usize> = HashMap::new();
    let mut category_counts: HashMap<String, usize> = HashMap::new();

    for bookmark in bookmarks {
        *folder_counts
            .entry(if bookmark.folder_path.trim().is_empty() {
                "未分类".to_string()
            } else {
                bookmark.folder_path.clone()
            })
            .or_default() += 1;
        *domain_counts.entry(domain_of(&bookmark.url)).or_default() += 1;
        *category_counts
            .entry(bookmark.category.clone())
            .or_default() += 1;
    }

    let samples = bookmarks
        .iter()
        .filter(|bookmark| likely_cleanup_candidate(bookmark))
        .take(220)
        .map(|bookmark| {
            json!({
                "title": bookmark.title,
                "url": bookmark.url,
                "domain": domain_of(&bookmark.url),
                "folder_path": bookmark.folder_path,
                "category": bookmark.category,
                "status": bookmark.status
            })
        })
        .collect::<Vec<_>>();

    json!({
        "user_instruction": instruction,
        "analysis_goal": "判断当前 AI 年代哪些收藏夹/链接低价值、过时、重复、可删除或应归档。尤其关注购物电商、旧游戏、过时工具、重复资讯、旧教程、已被 AI/新工具替代的资料。",
        "total_bookmarks": bookmarks.len(),
        "top_folders": top_counts(folder_counts, 80),
        "top_domains": top_counts(domain_counts, 80),
        "top_categories": top_counts(category_counts, 60),
        "candidate_samples": samples,
        "decision_policy": {
            "清理": "明显不再需要、用户明确不要、低价值入口页、旧游戏/购物/活动页",
            "归档": "可能有历史价值但低频使用，不应占书签栏主位置",
            "保留": "仍有工具/项目/账号/参考价值",
            "重组": "目录混杂，需要拆分到公司/家庭/个人/休闲等层级"
        }
    })
}

fn top_counts(counts: HashMap<String, usize>, limit: usize) -> Vec<Value> {
    let mut values = counts.into_iter().collect::<Vec<_>>();
    values.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    values
        .into_iter()
        .take(limit)
        .map(|(name, count)| json!({ "name": name, "count": count }))
        .collect()
}

fn likely_cleanup_candidate(bookmark: &BookmarkRecord) -> bool {
    let text = format!(
        "{} {} {} {}",
        bookmark.title, bookmark.url, bookmark.folder_path, bookmark.category
    )
    .to_lowercase();

    [
        "taobao",
        "tmall",
        "jd.com",
        "amazon",
        "shop",
        "coupon",
        "steam",
        "epicgames",
        "warcraft",
        "wow",
        "魔兽",
        "购物",
        "电商",
        "游戏",
        "团购",
        "促销",
        "活动",
        "下载",
        "破解",
        "旧版",
        "deprecated",
        "404",
    ]
    .iter()
    .any(|keyword| text.contains(keyword))
}

fn chat_completions_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

fn parse_ai_content(content: &str) -> Result<Value, String> {
    if let Ok(value) = serde_json::from_str::<Value>(content) {
        return Ok(value);
    }

    let start = content
        .find('{')
        .ok_or_else(|| "AI 响应不是 JSON".to_string())?;
    let end = content
        .rfind('}')
        .ok_or_else(|| "AI 响应不是完整 JSON".to_string())?;
    serde_json::from_str::<Value>(&content[start..=end])
        .map_err(|err| format!("AI JSON 解析失败: {err}"))
}

fn domain_of(url: &str) -> String {
    url.split("//")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_string()
}

fn backup_file(
    app: &AppHandle,
    browser: &str,
    profile_name: &str,
    source: &Path,
) -> Result<PathBuf, String> {
    let file_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "源文件名无效".to_string())?;
    let dir = app_data_dir(app)?
        .join("backups")
        .join("imports")
        .join(format!(
            "{}_{}_{}",
            timestamp(),
            browser,
            sanitize(profile_name)
        ));
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let target = dir.join(file_name);
    fs::copy(source, &target).map_err(|err| format!("备份源文件失败: {err}"))?;
    Ok(target)
}

fn backup_chrome_writeback(app: &AppHandle, source: &Path) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?
        .join("backups")
        .join("chrome-writeback")
        .join(timestamp());
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let target = dir.join("Bookmarks");
    fs::copy(source, &target).map_err(|err| format!("备份 Chrome Bookmarks 失败: {err}"))?;
    Ok(target)
}

fn ai_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("config").join("ai-settings.json"))
}

fn copy_if_exists(source: &Path, target: &Path) -> Result<(), String> {
    if source.exists() {
        fs::copy(source, target).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn chrome_running() -> bool {
    if cfg!(target_os = "windows") {
        let output = Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq chrome.exe"])
            .output();

        if let Ok(output) = output {
            let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
            return text.contains("chrome.exe");
        }
    }

    false
}

fn kill_chrome() -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let status = Command::new("taskkill")
            .args(["/IM", "chrome.exe", "/F"])
            .status()
            .map_err(|err| format!("关闭 Chrome 失败: {err}"))?;

        if !status.success() && chrome_running() {
            return Err("无法关闭 Chrome，请手动关闭后重试".to_string());
        }
    }

    Ok(())
}

fn open_chrome() {
    if cfg!(target_os = "windows") {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", "chrome"])
            .spawn();
    }
}

fn chrome_time_now() -> String {
    let unix_micros = Utc::now().timestamp_micros();
    (unix_micros + 11_644_473_600_i64 * 1_000_000).to_string()
}

fn chrome_time_to_unix_ms(value: &str) -> Option<i64> {
    let chrome_micros = value.parse::<i64>().ok()?;
    Some((chrome_micros - 11_644_473_600_i64 * 1_000_000) / 1000)
}

fn timestamp() -> String {
    Utc::now().format("%Y%m%d_%H%M%S").to_string()
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() {
                char
            } else {
                '_'
            }
        })
        .collect()
}

fn stable_id(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn firefox_folder_path_skips_system_roots() {
        let folders = HashMap::from([
            (1, (0, String::new())),
            (2, (1, "menu".to_string())),
            (3, (1, "toolbar".to_string())),
            (30, (3, "乐动内网".to_string())),
            (210, (30, "Golang".to_string())),
            (900, (2, "常用工具".to_string())),
        ]);

        assert_eq!(firefox_folder_path(30, &folders), "乐动内网");
        assert_eq!(firefox_folder_path(210, &folders), "乐动内网/Golang");
        assert_eq!(firefox_folder_path(900, &folders), "常用工具");
    }

    #[test]
    fn chrome_folder_path_skips_system_roots() {
        let tree = serde_json::json!({
            "type": "folder",
            "name": "书签栏",
            "children": [
                {
                    "type": "folder",
                    "name": "乐动内网",
                    "children": [
                        {
                            "type": "url",
                            "name": "内网工具",
                            "url": "http://192.168.2.244/"
                        }
                    ]
                }
            ]
        });
        let mut bookmarks = Vec::new();
        let mut folders = 0;

        collect_chrome_node(&tree, Vec::new(), "Default", &mut bookmarks, &mut folders);

        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].folder_path, "乐动内网");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_chrome_profiles,
            detect_firefox_profiles,
            import_chrome_bookmarks,
            import_firefox_bookmarks,
            check_chrome_running,
            load_ai_settings,
            save_ai_settings,
            write_chrome_bookmarks,
            restore_chrome_backup,
            organize_bookmarks_ai,
            analyze_bookmarks_ai
        ])
        .run(tauri::generate_context!())
        .expect("error while running browser-switch");
}
