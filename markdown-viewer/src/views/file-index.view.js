import { on } from '../core/event-bus.js';

/**
 * Renders the file index list and wires keyboard navigation.
 * Accessibility identifiers: data-testid attributes (REQ-AX-02).
 */
export class FileIndexView {
  #vm;
  #root; // the #file-index element

  constructor(vm) {
    this.#vm = vm;
    this.#root = document.getElementById('file-index');
  }

  mount() {
    on('files:loaded', ({ files }) => this.#render(files));
    on('files:error', ({ message }) => this.#renderError(message));
    on('files:cursor', ({ cursor }) => this.#updateCursor(cursor));

    // Keyboard navigation on the list (REQ-AX-06)
    this.#root.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.#vm.moveCursor(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this.#vm.moveCursor(-1); }
      if (e.key === 'Enter')     { e.preventDefault(); this.#vm.openCurrent(); }
    });
  }

  #render(files) {
    this.#root.innerHTML = '';
    if (files.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'empty-message';
      msg.textContent = 'No markdown files found in the docs directory.';
      msg.setAttribute('data-testid', 'file-index-empty');
      this.#root.appendChild(msg);
      return;
    }

    const list = document.createElement('ul');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Markdown files');
    list.setAttribute('data-testid', 'file-list');

    files.forEach((filename, i) => {
      const item = document.createElement('li');
      item.textContent = filename;
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', i === 0 ? '0' : '-1');
      item.setAttribute('data-testid', `file-item-${filename}`);
      item.setAttribute('aria-selected', i === this.#vm.cursor ? 'true' : 'false');
      item.addEventListener('click', () => this.#vm.open(filename));
      list.appendChild(item);
    });

    this.#root.appendChild(list);
    // Give focus to the list so arrow keys work immediately
    const firstItem = list.querySelector('li');
    if (firstItem) firstItem.focus();
  }

  #renderError(message) {
    this.#root.innerHTML = '';
    const err = document.createElement('p');
    err.className = 'error-message';
    err.setAttribute('role', 'alert');
    err.setAttribute('data-testid', 'file-index-error');
    err.textContent = `Error loading files: ${message}`;
    this.#root.appendChild(err);
  }

  #updateCursor(cursor) {
    const items = this.#root.querySelectorAll('[role="option"]');
    items.forEach((item, i) => {
      const active = i === cursor;
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      item.setAttribute('tabindex', active ? '0' : '-1');
      if (active) item.focus();
    });
  }
}
