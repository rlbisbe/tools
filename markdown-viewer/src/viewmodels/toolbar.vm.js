import { emit } from '../core/event-bus.js';
import { bridge } from '../core/tauri-bridge.js';

const RECENT_KEY = 'md-viewer-recent';
const RECENT_MAX = 8;
const THEMES = ['light', 'dark'];

/**
 * Manages toolbar state: theme, copy feedback, recent files.
 *
 * Emits:
 *   'toolbar:theme'     { theme: 'light'|'dark' }
 *   'toolbar:copy'      { state: 'idle'|'done' }
 *   'toolbar:recent'    { files: string[] }
 */
export class ToolbarVM {
  #theme = 'light';
  #recent = [];
  #currentFile = null;

  constructor() {
    this.#recent = this.#loadRecent();
    // Initialise theme from persisted preference or OS setting (REQ-NV-11)
    const saved = localStorage.getItem('md-viewer-theme');
    if (saved && THEMES.includes(saved)) {
      this.#theme = saved;
    } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      this.#theme = 'dark';
    }
  }

  get theme() { return this.#theme; }
  get recent() { return this.#recent; }

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.#theme);
    emit('toolbar:theme', { theme: this.#theme });
  }

  toggleTheme() {
    this.#theme = this.#theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('md-viewer-theme', this.#theme);
    this.applyTheme();
  }

  /** Record that a file was visited; updates recent list (REQ-NV-07). */
  trackFile(filename) {
    this.#currentFile = filename;
    this.#recent = [filename, ...this.#recent.filter(f => f !== filename)].slice(0, RECENT_MAX);
    this.#saveRecent();
    emit('toolbar:recent', { files: this.recentExcludingCurrent() });
  }

  /** Recent files excluding currently-viewed file (REQ-NV-08). */
  recentExcludingCurrent() {
    return this.#recent.filter(f => f !== this.#currentFile);
  }

  /** Copy raw markdown to clipboard (REQ-NV-02). */
  async copyMarkdown(filename) {
    try {
      const raw = await bridge.getRawMarkdown(filename);
      await navigator.clipboard.writeText(raw);
      emit('toolbar:copy', { state: 'done' });
      // Revert label after 3 seconds (REQ-NV-03)
      setTimeout(() => emit('toolbar:copy', { state: 'idle' }), 3000);
    } catch (err) {
      emit('toolbar:copy', { state: 'idle' });
    }
  }

  #loadRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  }

  #saveRecent() {
    localStorage.setItem(RECENT_KEY, JSON.stringify(this.#recent));
  }
}
