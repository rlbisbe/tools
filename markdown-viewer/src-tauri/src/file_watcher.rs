use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use notify_debouncer_mini::{new_debouncer, DebounceEventResult, DebouncedEvent};
use tauri::{AppHandle, Emitter};

/// Payload emitted to the frontend on file change.
#[derive(Clone, serde::Serialize)]
pub struct FileChangedPayload {
    pub kind: String, // "created" | "modified" | "deleted"
    pub filename: String,
}

/// Payload emitted when the watcher encounters a fatal error (REQ-LR-05).
#[derive(Clone, serde::Serialize)]
pub struct WatcherErrorPayload {
    pub message: String,
}

pub struct Watcher {
    // Holds the debouncer alive for the duration of watching
    _debouncer: Arc<Mutex<Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>>>,
}

impl Watcher {
    /// Start watching `docs_dir`, emitting Tauri events to `app_handle`.
    /// Uses native OS events (REQ-LR-03); polling not used in this initial
    /// implementation (polling support can be added via USE_POLLING env var).
    pub fn start(app_handle: AppHandle, docs_dir: PathBuf) -> Result<Self, String> {
        let handle = app_handle.clone();
        let handle2 = app_handle.clone();
        let dir = docs_dir.clone();

        let debouncer = new_debouncer(
            Duration::from_millis(300),
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        for event in events {
                            if let Some(payload) = event_to_payload(&event, &dir) {
                                let _ = handle.emit("file-changed", payload);
                            }
                        }
                    }
                    Err(error) => {
                        let _ = handle.emit(
                            "watcher-error",
                            WatcherErrorPayload { message: error.to_string() },
                        );
                    }
                }
            },
        )
        .map_err(|e| e.to_string())?;

        // We need to add the watch path — but debouncer takes &mut self,
        // so we store it wrapped and watch in a thread.
        let debouncer_arc = Arc::new(Mutex::new(Some(debouncer)));
        let debouncer_clone = debouncer_arc.clone();
        let watch_dir = docs_dir.clone();

        thread::spawn(move || {
            if let Ok(mut guard) = debouncer_clone.lock() {
                if let Some(ref mut d) = *guard {
                    if let Err(e) = d.watcher().watch(
                        &watch_dir,
                        notify::RecursiveMode::NonRecursive,
                    ) {
                        // Emit watcher-error if we can't start watching
                        let _ = handle2.emit(
                            "watcher-error",
                            WatcherErrorPayload { message: e.to_string() },
                        );
                    }
                }
            }
        });

        Ok(Self { _debouncer: debouncer_arc })
    }
}

fn event_to_payload(event: &DebouncedEvent, docs_dir: &PathBuf) -> Option<FileChangedPayload> {
    let path = event.path.clone();
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return None;
    }
    // Only emit events for files directly in docs_dir (not subdirs)
    if path.parent() != Some(docs_dir.as_path()) {
        return None;
    }
    let filename = path.file_name()?.to_string_lossy().into_owned();
    // notify-debouncer-mini uses a single event kind per debounced event
    // We emit "modified" for all changes; the frontend re-reads the file list
    Some(FileChangedPayload {
        kind: "modified".to_string(),
        filename,
    })
}
