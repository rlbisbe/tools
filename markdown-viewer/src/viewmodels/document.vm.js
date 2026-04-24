import { emit } from '../core/event-bus.js';
import { bridge } from '../core/tauri-bridge.js';

/**
 * Manages the currently-open document: content, comments, and text selection.
 *
 * Emits:
 *   'doc:loaded'      { filename, html, raw, comments }
 *   'doc:error'       { message }
 *   'doc:comments'    { comments }
 *   'selection:change' { text, before, after, rect } | null
 */
export class DocumentVM {
  #filename = null;
  #html = '';
  #raw = '';
  #comments = [];
  #pendingSelection = null; // { text, before, after }

  get filename() { return this.#filename; }
  get html() { return this.#html; }
  get raw() { return this.#raw; }
  get comments() { return this.#comments; }
  get pendingSelection() { return this.#pendingSelection; }

  async open(filename) {
    try {
      const data = await bridge.openFile(filename);
      this.#filename = data.filename;
      this.#html = data.html;
      this.#raw = data.raw;
      this.#comments = data.comments;
      emit('doc:loaded', { filename: data.filename, html: data.html, raw: data.raw, comments: data.comments });
    } catch (err) {
      emit('doc:error', { message: String(err) });
    }
  }

  /** Called by the View when the user's text selection changes. */
  setSelection(selection) {
    // selection: { text, before, after, rect } or null
    this.#pendingSelection = selection;
    emit('selection:change', selection);
  }

  async createComment(text) {
    if (!this.#pendingSelection || !this.#filename) return;
    const { text: anchor, before, after } = this.#pendingSelection;
    try {
      const comments = await bridge.createComment({
        filename: this.#filename,
        anchor,
        before,
        after,
        text,
      });
      this.#comments = comments;
      // Reload document from disk (REQ-IC-10)
      await this.open(this.#filename);
      emit('doc:comments', { comments });
    } catch (err) {
      emit('doc:error', { message: String(err) });
    }
  }

  async editComment(id, newText) {
    if (!this.#filename) return;
    try {
      const comments = await bridge.updateComment({
        filename: this.#filename,
        id,
        text: newText,
      });
      this.#comments = comments;
      await this.open(this.#filename);
      emit('doc:comments', { comments });
    } catch (err) {
      emit('doc:error', { message: String(err) });
    }
  }

  async deleteComment(id) {
    if (!this.#filename) return;
    try {
      const comments = await bridge.removeComment({
        filename: this.#filename,
        id,
      });
      this.#comments = comments;
      await this.open(this.#filename);
      emit('doc:comments', { comments });
    } catch (err) {
      emit('doc:error', { message: String(err) });
    }
  }

  /** Reload the document from disk — called on file-watcher events. */
  async reload() {
    if (this.#filename) await this.open(this.#filename);
  }
}
