pub mod comment_engine;
pub mod commands;
pub mod file_watcher;
pub mod state;

use std::fs;
use std::path::PathBuf;

use commands::{
    create_comment, get_docs_dir, get_raw_markdown, list_files, open_file, remove_comment,
    set_docs_dir, update_comment,
};
use file_watcher::Watcher;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let docs_dir = default_docs_dir();
    fs::create_dir_all(&docs_dir).expect("Failed to create docs directory");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new(docs_dir.clone()))
        .setup(move |app| {
            // Allow the docs directory via the asset protocol so images with
            // absolute paths (rewritten by render_markdown_for_dir, REQ-CR-09)
            // can be loaded by the WebView via https://asset.localhost/…
            if let Err(e) = app.asset_protocol_scope().allow_directory(&docs_dir, true) {
                log::warn!("Could not allow docs dir in asset scope: {}", e);
            }

            let handle = app.handle().clone();
            let dir = docs_dir.clone();
            // Start file watcher — errors are emitted as events, not panics (REQ-LR-05)
            match Watcher::start(handle, dir) {
                Ok(watcher) => {
                    app.manage(watcher);
                }
                Err(e) => {
                    log::error!("Failed to start file watcher: {}", e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_files,
            open_file,
            create_comment,
            update_comment,
            remove_comment,
            get_raw_markdown,
            get_docs_dir,
            set_docs_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Default docs directory: ~/Documents/MarkdownDocs (REQ-CF-02).
fn default_docs_dir() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("MarkdownDocs")
}
