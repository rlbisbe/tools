/**
 * Application entry point.
 * Instantiates VMs and Views, wires them together, bootstraps the app.
 */
import { on, emit } from './core/event-bus.js';
import { bridge } from './core/tauri-bridge.js';

import { FileIndexVM } from './viewmodels/file-index.vm.js';
import { DocumentVM }  from './viewmodels/document.vm.js';
import { SidebarVM }   from './viewmodels/sidebar.vm.js';
import { ToolbarVM }   from './viewmodels/toolbar.vm.js';

import { FileIndexView } from './views/file-index.view.js';
import { DocumentView }  from './views/document.view.js';
import { SidebarView }   from './views/sidebar.view.js';
import { ToolbarView }   from './views/toolbar.view.js';

async function boot() {
  // ── Instantiate VMs ────────────────────────────────────────────────────
  const fileIndexVM = new FileIndexVM();
  const documentVM  = new DocumentVM();
  const sidebarVM   = new SidebarVM();
  const toolbarVM   = new ToolbarVM();

  // ── Instantiate Views ──────────────────────────────────────────────────
  const docView     = new DocumentView(documentVM, sidebarVM);
  const fileIndexView = new FileIndexView(fileIndexVM);
  const sidebarView = new SidebarView(sidebarVM, documentVM, docView);
  const toolbarView = new ToolbarView(toolbarVM, sidebarVM);

  // ── Mount Views ────────────────────────────────────────────────────────
  fileIndexView.mount();
  docView.mount();
  sidebarView.mount();
  toolbarView.mount();

  // ── Navigation ────────────────────────────────────────────────────────
  on('file:open', async ({ filename }) => {
    showScreen('doc');
    await documentVM.open(filename);
  });

  on('nav:back', () => {
    showScreen('index');
    fileIndexVM.load();
  });

  // ── Initial load — show screen before async ops so UI is never blank ──
  showScreen('index');
  await fileIndexVM.load();

  // ── File watcher → reload if current file changed (REQ-LR-02) ────────
  // Wrapped in try/catch: watcher is optional — UI must remain usable if it fails.
  try {
    await bridge.onFileChanged(async ({ filename }) => {
      if (filename === documentVM.filename) {
        await documentVM.reload();
      } else {
        if (currentScreen() === 'index') await fileIndexVM.load();
      }
    });
    await bridge.onWatcherError(({ message }) => {
      showWatcherError(message);
    });
  } catch (err) {
    // Live reload unavailable — not fatal (REQ-LR-05)
    console.warn('File watcher unavailable:', err);
  }

  // ── Theme change → re-render Mermaid (REQ-CR-08) ─────────────────────
  document.addEventListener('theme-changed', () => {
    if (currentScreen() === 'doc') docView.rerenderMermaid?.();
  });
}

function showScreen(name) {
  document.getElementById('screen-index').hidden = name !== 'index';
  document.getElementById('screen-doc').hidden   = name !== 'doc';
}

function currentScreen() {
  return document.getElementById('screen-index').hidden ? 'doc' : 'index';
}

function showWatcherError(message) {
  let banner = document.getElementById('watcher-error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'watcher-error-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('data-testid', 'watcher-error-banner');
    document.body.prepend(banner);
  }
  banner.textContent = `File watcher error: ${message}`;
  banner.hidden = false;
}

boot().catch(err => console.error('Boot failed:', err));
