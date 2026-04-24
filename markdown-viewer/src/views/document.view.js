import { on, emit } from '../core/event-bus.js';
import { convertFileSrc } from '../core/tauri-bridge.js';

const CONTEXT_CHARS = 30;

/**
 * Renders markdown HTML, manages comment highlights, selection bubble,
 * and the comment form.
 */
export class DocumentView {
  #vm;
  #sidebarVM;
  #contentEl;    // #doc-content
  #bubbleEl;     // #comment-bubble
  #formEl;       // #comment-form
  #formInput;    // textarea inside the form
  #formAnchorEl; // span showing the anchor in the form
  #editingId = null; // comment id being edited, or null for new

  constructor(vm, sidebarVM) {
    this.#vm = vm;
    this.#sidebarVM = sidebarVM;
    this.#contentEl = document.getElementById('doc-content');
    this.#bubbleEl = document.getElementById('comment-bubble');
    this.#formEl = document.getElementById('comment-form');
    this.#formInput = document.getElementById('comment-text-input');
    this.#formAnchorEl = document.getElementById('comment-form-anchor');
  }

  mount() {
    on('doc:loaded', ({ html, comments }) => {
      this.#renderContent(html);
      this.#applyHighlights(comments);
      this.#initMermaid();
    });
    on('selection:change', sel => this.#onSelectionChange(sel));

    // Selection listener on content area (REQ-IC-15, REQ-IC-16)
    this.#contentEl.addEventListener('mouseup', () => this.#readSelection());
    document.addEventListener('selectionchange', () => {
      // Don't clear pendingSelection while the comment form is open — typing in
      // the textarea fires selectionchange with isCollapsed=true (textarea cursor),
      // but that is not a loss of the document selection (REQ-IC-20).
      if (!this.#formEl.hidden) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        this.#vm.setSelection(null);
      }
    });

    // Bubble "Add comment" button
    this.#bubbleEl.querySelector('[data-testid="add-comment-btn"]')
      .addEventListener('click', () => this.#openNewCommentForm());

    // Form submit / cancel (REQ-IC-19 — Cmd/Ctrl+Enter shortcut)
    this.#formInput.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        this.#submitForm();
      }
      if (e.key === 'Escape') this.#closeForm();
    });
    document.getElementById('comment-form-submit')
      .addEventListener('click', () => this.#submitForm());
    document.getElementById('comment-form-cancel')
      .addEventListener('click', () => this.#closeForm());

    // Focus trap inside form modal (REQ-AX-04)
    this.#formEl.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        this.#formEl.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])')
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
  }

  /** Inject rendered HTML from Rust (REQ-CR-04, REQ-CR-09). */
  #renderContent(html) {
    // The HTML comes from pulldown-cmark (server-controlled, not user-controlled)
    // so it is safe to set as innerHTML. User-controlled data (comment text) is
    // never injected here — it goes through textContent in the sidebar view.
    this.#contentEl.innerHTML = html;
    // Rust rewrites relative image paths to absolute filesystem paths.
    // Convert those to asset:// URLs that the WebView can actually load (REQ-CR-09).
    this.#contentEl.querySelectorAll('img[src^="/"]').forEach(img => {
      img.src = convertFileSrc(img.getAttribute('src'));
    });
  }

  /** Wrap anchor text occurrences in highlight spans (REQ-IC-11). */
  #applyHighlights(comments) {
    // Remove existing highlights
    this.#contentEl.querySelectorAll('.comment-anchor').forEach(el => {
      el.replaceWith(document.createTextNode(el.textContent));
    });

    comments.forEach(comment => {
      this.#highlightAnchor(comment);
    });
  }

  #highlightAnchor(comment) {
    const walker = document.createTreeWalker(this.#contentEl, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(comment.anchor);
      if (idx === -1) continue;
      const before = node.textContent.slice(0, idx);
      const after = node.textContent.slice(idx + comment.anchor.length);

      const span = document.createElement('span');
      span.className = 'comment-anchor';
      span.textContent = comment.anchor;
      span.setAttribute('data-comment-id', comment.id);
      span.setAttribute('data-testid', `anchor-${comment.id}`);
      span.setAttribute('tabindex', '0');
      span.setAttribute('role', 'button');
      span.setAttribute('aria-label', `Comment: ${comment.text}`);

      span.addEventListener('click', () => {
        this.#sidebarVM.focusComment(comment.id);
      });
      span.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') this.#sidebarVM.focusComment(comment.id);
      });

      const parent = node.parentNode;
      parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(span, node);
      parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
      break; // only highlight first occurrence (REQ-IC-04)
    }
  }

  /** Initialise/re-render Mermaid diagrams after content injection (REQ-CR-07, REQ-CR-08). */
  #initMermaid() {
    if (!window.mermaid) return;
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
    window.mermaid.initialize({ startOnLoad: false, theme });
    window.mermaid.run({ nodes: this.#contentEl.querySelectorAll('code.language-mermaid') });
  }

  /** Read the current window selection and extract context (REQ-IC-16, REQ-IC-18). */
  #readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      this.#vm.setSelection(null);
      return;
    }
    const text = sel.toString();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Extract ±30 chars of context from the text content of the content area
    const fullText = this.#contentEl.textContent;
    const anchorIdx = fullText.indexOf(text);
    const before = anchorIdx > 0
      ? fullText.slice(Math.max(0, anchorIdx - CONTEXT_CHARS), anchorIdx)
      : '';
    const after = fullText.slice(anchorIdx + text.length, anchorIdx + text.length + CONTEXT_CHARS);

    this.#vm.setSelection({ text, before, after, rect });
    this.#positionBubble(rect);
  }

  #onSelectionChange(sel) {
    if (!sel) {
      this.#bubbleEl.hidden = true;
      return;
    }
    this.#bubbleEl.hidden = false;
    this.#positionBubble(sel.rect);
  }

  /** Position bubble above the selection (REQ-IC-17). */
  #positionBubble(rect) {
    const contentRect = this.#contentEl.getBoundingClientRect();
    const bubbleWidth = this.#bubbleEl.offsetWidth || 120;
    const left = rect.left - contentRect.left + rect.width / 2 - bubbleWidth / 2;
    const top = rect.top - contentRect.top - this.#bubbleEl.offsetHeight - 8;
    this.#bubbleEl.style.left = `${Math.max(0, left)}px`;
    this.#bubbleEl.style.top = `${Math.max(0, top)}px`;
  }

  #openNewCommentForm() {
    const sel = this.#vm.pendingSelection;
    if (!sel) return;
    this.#editingId = null;
    this.#formAnchorEl.textContent = sel.text; // textContent — XSS-safe (REQ-SE-01)
    this.#formInput.value = '';
    this.#showForm();
  }

  /** Open form pre-filled for editing an existing comment. */
  openEditForm(comment) {
    this.#editingId = comment.id;
    this.#formAnchorEl.textContent = comment.anchor;
    this.#formInput.value = comment.text;
    this.#showForm();
  }

  #showForm() {
    this.#formEl.hidden = false;
    this.#formEl.setAttribute('aria-modal', 'true');
    // Ensure the input receives keystrokes immediately (REQ-IC-19)
    requestAnimationFrame(() => this.#formInput.focus());
  }

  #closeForm() {
    this.#formEl.hidden = true;
    this.#editingId = null;
  }

  async #submitForm() {
    const text = this.#formInput.value.trim();
    if (!text) return;
    if (this.#editingId) {
      await this.#vm.editComment(this.#editingId, text);
    } else {
      await this.#vm.createComment(text);
    }
    this.#closeForm();
    this.#sidebarVM.open();
  }
}
