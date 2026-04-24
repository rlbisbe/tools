/**
 * Single seam for all Tauri calls.
 *
 * Uses window.__TAURI__ (injected by Tauri when withGlobalTauri=true).
 * In tests, Playwright injects window.__TAURI_MOCK__ before the page loads
 * and this module routes calls through it instead.
 *
 * No bare npm imports — this file works in a plain browser for E2E testing.
 */

function invoke(cmd, args) {
  if (window.__TAURI_MOCK__) return window.__TAURI_MOCK__.invoke(cmd, args);
  return window.__TAURI__.core.invoke(cmd, args);
}

function listen(event, handler) {
  if (window.__TAURI_MOCK__) {
    return window.__TAURI_MOCK__.listen(event, handler);
  }
  return window.__TAURI__.event.listen(event, handler);
}

/**
 * Convert an absolute filesystem path to a URL the WebView can load via the
 * asset protocol (https://asset.localhost/…). In tests the path is already
 * an absolute string that the plain HTTP server can serve, so it's returned
 * unchanged.
 */
export function convertFileSrc(path) {
  if (window.__TAURI_MOCK__) return path;
  return window.__TAURI__.core.convertFileSrc(path);
}

export const bridge = {
  listFiles:       ()       => invoke('list_files'),
  openFile:        (filename) => invoke('open_file', { filename }),
  createComment:   (args)   => invoke('create_comment', { args }),
  updateComment:   (args)   => invoke('update_comment', { args }),
  removeComment:   (args)   => invoke('remove_comment', { args }),
  getRawMarkdown:  (filename) => invoke('get_raw_markdown', { filename }),
  getDocsDir:      ()       => invoke('get_docs_dir'),
  setDocsDir:      (path)   => invoke('set_docs_dir', { path }),

  onFileChanged:  (handler) => listen('file-changed',  e => handler(e.payload ?? e)),
  onWatcherError: (handler) => listen('watcher-error', e => handler(e.payload ?? e)),
};
