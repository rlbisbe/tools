use std::path::PathBuf;
use std::sync::Mutex;

/// Central app state managed by Tauri.
pub struct AppState {
    pub docs_dir: Mutex<PathBuf>,
}

impl AppState {
    pub fn new(docs_dir: PathBuf) -> Self {
        Self {
            docs_dir: Mutex::new(docs_dir),
        }
    }
}
