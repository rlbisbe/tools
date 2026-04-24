import { emit } from '../core/event-bus.js';
import { bridge } from '../core/tauri-bridge.js';

/**
 * Manages the file index: list of .md files and keyboard selection cursor.
 *
 * Emits:
 *   'files:loaded'   { files: string[] }
 *   'files:error'    { message: string }
 *   'file:open'      { filename: string }
 */
export class FileIndexVM {
  #files = [];
  #cursor = -1; // keyboard-focused index (-1 = none)

  get files() { return this.#files; }
  get cursor() { return this.#cursor; }

  async load() {
    try {
      this.#files = await bridge.listFiles();
      this.#cursor = this.#files.length > 0 ? 0 : -1;
      emit('files:loaded', { files: this.#files });
    } catch (err) {
      emit('files:error', { message: String(err) });
    }
  }

  /** Open a file by filename. */
  open(filename) {
    emit('file:open', { filename });
  }

  /** Open the file at the current cursor position. */
  openCurrent() {
    if (this.#cursor >= 0 && this.#cursor < this.#files.length) {
      this.open(this.#files[this.#cursor]);
    }
  }

  /** Move cursor up/down. Returns new cursor index. */
  moveCursor(delta) {
    if (this.#files.length === 0) return -1;
    this.#cursor = Math.max(0, Math.min(this.#files.length - 1, this.#cursor + delta));
    emit('files:cursor', { cursor: this.#cursor });
    return this.#cursor;
  }
}
