import { on, emit } from '../core/event-bus.js';

/**
 * Renders the toolbar: theme toggle, copy MD, comments toggle, recent files.
 */
export class ToolbarView {
  #vm;
  #sidebarVM;
  #themeBtn;
  #copyBtn;
  #commentsBtn;
  #recentBtn;
  #recentDropdown;
  #backBtn;

  constructor(toolbarVM, sidebarVM) {
    this.#vm = toolbarVM;
    this.#sidebarVM = sidebarVM;
    this.#themeBtn = document.getElementById('theme-toggle');
    this.#copyBtn = document.getElementById('copy-md-btn');
    this.#commentsBtn = document.getElementById('comments-btn');
    this.#recentBtn = document.getElementById('recent-btn');
    this.#recentDropdown = document.getElementById('recent-dropdown');
    this.#backBtn = document.getElementById('back-btn');
  }

  mount() {
    // Apply persisted theme before first paint (REQ-NV-11)
    this.#vm.applyTheme();

    on('toolbar:theme', ({ theme }) => this.#updateThemeIcon(theme));
    on('toolbar:copy', ({ state }) => this.#updateCopyLabel(state));
    on('toolbar:recent', ({ files }) => this.#renderRecent(files));
    on('doc:loaded', ({ filename }) => {
      this.#vm.trackFile(filename);
      this.#showDocActions(true);
      // Store filename on the title element so copy-md-btn can read it
      const titleEl = document.getElementById('doc-title');
      if (titleEl) {
        titleEl.textContent = filename;
        titleEl.dataset.filename = filename;
      }
    });
    on('files:loaded', () => this.#showDocActions(false));

    this.#themeBtn.addEventListener('click', () => this.#vm.toggleTheme());
    this.#copyBtn.addEventListener('click', () => {
      const filename = document.getElementById('doc-title')?.dataset.filename;
      if (filename) this.#vm.copyMarkdown(filename);
    });
    this.#commentsBtn.addEventListener('click', () => this.#sidebarVM.toggle());
    this.#recentBtn.addEventListener('click', () => this.#toggleRecent());
    this.#backBtn?.addEventListener('click', () => emit('nav:back', {}));

    // Close recent dropdown on outside click
    document.addEventListener('click', e => {
      if (!this.#recentBtn.contains(e.target) && !this.#recentDropdown.contains(e.target)) {
        this.#recentDropdown.hidden = true;
      }
    });
  }

  #updateThemeIcon(theme) {
    this.#themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    this.#themeBtn.setAttribute('data-testid', 'theme-toggle');
    this.#themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    // Re-render mermaid diagrams on theme change (REQ-CR-08)
    document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
  }

  #updateCopyLabel(state) {
    this.#copyBtn.textContent = state === 'done' ? '✓ Copied!' : '📋 Copy MD';
    this.#copyBtn.setAttribute('aria-label', state === 'done' ? 'Copied to clipboard' : 'Copy markdown');
  }

  #toggleRecent() {
    this.#recentDropdown.hidden = !this.#recentDropdown.hidden;
  }

  #renderRecent(files) {
    this.#recentDropdown.innerHTML = '';
    if (files.length === 0) {
      const msg = document.createElement('p');
      msg.textContent = 'No recent files';
      msg.className = 'recent-empty';
      this.#recentDropdown.appendChild(msg);
      return;
    }
    files.forEach(filename => {
      const item = document.createElement('button');
      item.className = 'recent-item';
      item.textContent = filename;
      item.setAttribute('data-testid', `recent-item-${filename}`);
      item.addEventListener('click', () => {
        this.#recentDropdown.hidden = true;
        emit('file:open', { filename });
      });
      this.#recentDropdown.appendChild(item);
    });
  }

  #showDocActions(visible) {
    [this.#copyBtn, this.#commentsBtn, this.#recentBtn].forEach(btn => {
      if (btn) btn.hidden = !visible;
    });
    if (this.#backBtn) this.#backBtn.hidden = !visible;
  }
}
