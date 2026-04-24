import { emit } from '../core/event-bus.js';

/**
 * Manages comment sidebar visibility and focused comment.
 *
 * Emits:
 *   'sidebar:toggle'  { open: boolean, comments }
 *   'sidebar:focus'   { commentId: string }
 */
export class SidebarVM {
  #open = false;
  #comments = [];
  #focusedId = null;
  #cursor = -1; // keyboard cursor within sidebar

  get isOpen() { return this.#open; }
  get comments() { return this.#comments; }
  get focusedId() { return this.#focusedId; }
  get cursor() { return this.#cursor; }

  updateComments(comments) {
    this.#comments = comments;
    emit('sidebar:toggle', { open: this.#open, comments });
  }

  toggle() {
    this.#open = !this.#open;
    emit('sidebar:toggle', { open: this.#open, comments: this.#comments });
  }

  open() {
    this.#open = true;
    emit('sidebar:toggle', { open: true, comments: this.#comments });
  }

  /** Focus a specific comment (scroll to it in the sidebar). */
  focusComment(commentId) {
    this.#focusedId = commentId;
    this.#cursor = this.#comments.findIndex(c => c.id === commentId);
    this.open();
    emit('sidebar:focus', { commentId });
  }

  /** Move keyboard cursor within the sidebar. */
  moveCursor(delta) {
    if (this.#comments.length === 0) return;
    this.#cursor = Math.max(0, Math.min(this.#comments.length - 1, this.#cursor + delta));
    const comment = this.#comments[this.#cursor];
    if (comment) emit('sidebar:focus', { commentId: comment.id });
  }
}
