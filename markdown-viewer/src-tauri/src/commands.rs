use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::comment_engine::{
    delete_comment, edit_comment, insert_comment, parse_comments, strip_comments, Comment,
};
use crate::state::AppState;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Validate that `filename` is safe: ends in .md, no path separators,
/// resolves inside docs_dir (REQ-SE-02, REQ-SE-03).
fn resolve_doc(filename: &str, docs_dir: &Path) -> Result<PathBuf, String> {
    if !filename.ends_with(".md") {
        return Err("Filename must end in .md".into());
    }
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename must not contain path separators".into());
    }
    let resolved = docs_dir.join(filename);
    // Canonicalise the docs_dir; resolved need not exist yet (for new files)
    let canon_docs = docs_dir
        .canonicalize()
        .map_err(|e| format!("docs_dir not accessible: {}", e))?;
    // Use parent of resolved so the file itself need not exist
    let canon_resolved = resolved
        .parent()
        .unwrap_or(&resolved)
        .canonicalize()
        .unwrap_or_else(|_| canon_docs.clone());
    if !canon_resolved.starts_with(&canon_docs) {
        return Err("Path traversal detected".into());
    }
    Ok(resolved)
}

/// Atomic write: write to a temp file then rename (REQ-IC-09).
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("File has no parent directory")?;
    let tmp = dir.join(format!(".tmp_{}", generate_id()));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Generate a unique ID: high-res timestamp + 8 random hex chars (REQ-IC-02).
fn generate_id() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let rand_part: u64 = rand::random();
    format!("{:x}{:08x}", ts, rand_part as u32)
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// List all .md files in the docs directory, sorted alphabetically (REQ-CR-01).
#[tauri::command]
pub fn list_files(state: State<AppState>) -> Result<Vec<String>, String> {
    let docs_dir = state.docs_dir.lock().unwrap().clone();
    let mut files: Vec<String> = fs::read_dir(&docs_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.ends_with(".md") { Some(name) } else { None }
        })
        .collect();
    files.sort();
    Ok(files)
}

#[derive(Serialize)]
pub struct DocumentData {
    pub filename: String,
    pub html: String,
    pub raw: String,
    pub comments: Vec<Comment>,
}

/// Read and render a markdown file (REQ-CR-04, REQ-CR-05, REQ-CR-09).
#[tauri::command]
pub fn open_file(filename: String, state: State<AppState>) -> Result<DocumentData, String> {
    let docs_dir = state.docs_dir.lock().unwrap().clone();
    let path = resolve_doc(&filename, &docs_dir)?;
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let comments = parse_comments(&raw);
    let clean = strip_comments(&raw);
    let html = render_markdown_for_dir(&clean, &docs_dir);
    Ok(DocumentData { filename, html, raw, comments })
}

/// Render CommonMark markdown to HTML using pulldown-cmark, rewriting relative
/// image src URLs to absolute paths rooted at `docs_dir` (REQ-CR-09).
///
/// Absolute URLs (`/…`, `http://`, `https://`, `data:`) are passed through unchanged.
fn render_markdown_for_dir(markdown: &str, docs_dir: &Path) -> String {
    use pulldown_cmark::{html, CowStr, Event, Options, Parser, Tag};

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    let parser = Parser::new_ext(markdown, options);

    // Map over events: rewrite dest_url on every Image start tag.
    let events: Vec<Event<'_>> = parser
        .map(|event| match event {
            Event::Start(Tag::Image { link_type, dest_url, title, id }) => {
                let abs = make_absolute_url(&dest_url, docs_dir);
                Event::Start(Tag::Image {
                    link_type,
                    dest_url: CowStr::Boxed(abs.into_boxed_str()),
                    title,
                    id,
                })
            }
            other => other,
        })
        .collect();

    let mut html_output = String::new();
    html::push_html(&mut html_output, events.into_iter());
    html_output
}

/// Render CommonMark markdown to HTML using pulldown-cmark (no path rewriting).
/// Kept for use in unit tests that do not depend on a docs directory.
pub fn render_markdown(markdown: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

/// Rewrite a URL to an absolute filesystem path if it is relative.
/// Absolute schemes and root-relative paths are returned unchanged.
fn make_absolute_url(url: &str, docs_dir: &Path) -> String {
    if url.starts_with('/') || url.contains("://") || url.starts_with("data:") {
        return url.to_owned();
    }
    let joined = docs_dir.join(url);
    normalize_path(&joined).to_string_lossy().into_owned()
}

/// Collapse `.` and `..` components without requiring the path to exist on disk.
fn normalize_path(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out: Vec<Component<'_>> = Vec::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => { out.pop(); }
            c => out.push(c),
        }
    }
    out.iter().collect()
}

#[derive(Deserialize)]
pub struct CreateCommentArgs {
    pub filename: String,
    pub anchor: String,
    pub before: String,
    pub after: String,
    pub text: String,
}

/// Add a comment to a file (REQ-IC-06, REQ-IC-09).
#[tauri::command]
pub fn create_comment(args: CreateCommentArgs, state: State<AppState>) -> Result<Vec<Comment>, String> {
    let docs_dir = state.docs_dir.lock().unwrap().clone();
    let path = resolve_doc(&args.filename, &docs_dir)?;
    // Reload from disk — don't trust in-memory state (REQ-IC-10)
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let comment = Comment {
        id: generate_id(),
        anchor: args.anchor,
        before: args.before,
        after: args.after,
        text: args.text,
        date: current_date(),
    };
    let updated = insert_comment(&raw, &comment)?;
    atomic_write(&path, &updated)?;
    Ok(parse_comments(&updated))
}

#[derive(Deserialize)]
pub struct EditCommentArgs {
    pub filename: String,
    pub id: String,
    pub text: String,
}

/// Edit a comment's text (REQ-IC-07, REQ-IC-09).
#[tauri::command]
pub fn update_comment(args: EditCommentArgs, state: State<AppState>) -> Result<Vec<Comment>, String> {
    let docs_dir = state.docs_dir.lock().unwrap().clone();
    let path = resolve_doc(&args.filename, &docs_dir)?;
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let updated = edit_comment(&raw, &args.id, &args.text)?;
    atomic_write(&path, &updated)?;
    Ok(parse_comments(&updated))
}

#[derive(Deserialize)]
pub struct DeleteCommentArgs {
    pub filename: String,
    pub id: String,
}

/// Delete a comment (REQ-IC-08, REQ-IC-09).
#[tauri::command]
pub fn remove_comment(args: DeleteCommentArgs, state: State<AppState>) -> Result<Vec<Comment>, String> {
    let docs_dir = state.docs_dir.lock().unwrap().clone();
    let path = resolve_doc(&args.filename, &docs_dir)?;
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let updated = delete_comment(&raw, &args.id)?;
    atomic_write(&path, &updated)?;
    Ok(parse_comments(&updated))
}

/// Return the raw markdown of a file (comment annotations stripped) for clipboard (REQ-NV-02).
#[tauri::command]
pub fn get_raw_markdown(filename: String, state: State<AppState>) -> Result<String, String> {
    let docs_dir = state.docs_dir.lock().unwrap().clone();
    let path = resolve_doc(&filename, &docs_dir)?;
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(strip_comments(&raw))
}

/// Return the current configured docs directory.
#[tauri::command]
pub fn get_docs_dir(state: State<AppState>) -> String {
    state.docs_dir.lock().unwrap().to_string_lossy().into_owned()
}

/// Update the docs directory (REQ-CF-01). Creates it if absent (REQ-CF-03).
#[tauri::command]
pub fn set_docs_dir(path: String, state: State<AppState>) -> Result<(), String> {
    let new_dir = PathBuf::from(&path);
    fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;
    *state.docs_dir.lock().unwrap() = new_dir;
    Ok(())
}

fn current_date() -> String {
    // ISO 8601 date — use a simple approach without extra deps
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Seconds since epoch → YYYY-MM-DD (simplified, good enough for comments)
    let days = now / 86400;
    let mut year = 1970u32;
    let mut remaining_days = days as u32;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if remaining_days < days_in_year { break; }
        remaining_days -= days_in_year;
        year += 1;
    }
    let months = [31u32, if is_leap(year) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u32;
    for &m in &months {
        if remaining_days < m { break; }
        remaining_days -= m;
        month += 1;
    }
    format!("{:04}-{:02}-{:02}", year, month, remaining_days + 1)
}

fn is_leap(year: u32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}
