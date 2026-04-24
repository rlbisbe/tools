import { on } from '../core/event-bus.js';

/**
 * Renders the comment sidebar and wires edit/delete actions.
 */
export class SidebarView {
  #vm;
  #docVM;
  #docView;
  #sidebarEl;
  #listEl;
  #countEl; // badge on the toolbar button

  constructor(sidebarVM, docVM, docView) {
    this.#vm = sidebarVM;
    this.#docVM = docVM;
    this.#docView = docView;
    this.#sidebarEl = document.getElementById('comment-sidebar');
    this.#listEl = document.getElementById('sidebar-list');
    this.#countEl = document.getElementById('comments-count');
  }

  mount() {
    on('sidebar:toggle', ({ open, comments }) => {
      this.#sidebarEl.hidden = !open;
      this.#render(comments);
      this.#updateCount(comments.length);
    });
    on('sidebar:focus', ({ commentId }) => this.#scrollToComment(commentId));
    on('doc:loaded', ({ comments }) => {
      this.#vm.updateComments(comments);
      this.#updateCount(comments.length);
    });

    // Arrow key navigation (REQ-AX-03)
    this.#listEl.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.#vm.moveCursor(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this.#vm.moveCursor(-1); }
    });
  }

  #render(comments) {
    this.#listEl.innerHTML = '';
    comments.forEach((comment, i) => {
      const item = document.createElement('div');
      item.className = 'sidebar-comment';
      item.setAttribute('data-comment-id', comment.id);
      item.setAttribute('data-testid', `sidebar-comment-${comment.id}`);
      item.setAttribute('tabindex', '0');
      item.setAttribute('role', 'listitem');

      const anchor = document.createElement('span');
      anchor.className = 'comment-anchor-label';
      anchor.textContent = comment.anchor; // textContent — XSS-safe

      const body = document.createElement('p');
      body.className = 'comment-body';
      body.textContent = comment.text; // textContent — XSS-safe

      const date = document.createElement('time');
      date.className = 'comment-date';
      date.textContent = comment.date;
      date.setAttribute('datetime', comment.date);

      const actions = document.createElement('div');
      actions.className = 'comment-actions';

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.setAttribute('data-testid', `edit-comment-${comment.id}`);
      editBtn.addEventListener('click', () => this.#docView.openEditForm(comment));

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.setAttribute('data-testid', `delete-comment-${comment.id}`);
      deleteBtn.addEventListener('click', () => this.#docVM.deleteComment(comment.id));

      actions.append(editBtn, deleteBtn);
      item.append(anchor, body, date, actions);

      // Click comment row → scroll document to anchor (REQ-IC-14)
      item.addEventListener('click', (e) => {
        if (e.target === editBtn || e.target === deleteBtn) return;
        const anchorEl = document.querySelector(`[data-comment-id="${comment.id}"].comment-anchor`);
        anchorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      this.#listEl.appendChild(item);
    });
  }

  #updateCount(count) {
    if (this.#countEl) {
      this.#countEl.textContent = count > 0 ? String(count) : '';
      this.#countEl.hidden = count === 0;
    }
  }

  #scrollToComment(commentId) {
    const item = this.#listEl.querySelector(`[data-comment-id="${commentId}"]`);
    if (item) {
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      item.focus();
    }
  }
}
