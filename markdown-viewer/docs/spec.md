# Markdown Viewer — Product Specification

## Status: v2 — 2026-04-18

---

## 1. Scope

Markdown Viewer is a local application that renders `.md` files from a configurable directory. It provides live reload on file changes, inline comments, dark mode, and navigation with quick-switch and copy-to-clipboard. The spec is platform-neutral — implementations may be a web server (Node.js + browser), a native desktop app (macOS, Windows, Linux), or a mobile app, provided they satisfy the requirements below.

---

## 2. Core Rendering

### 2.1 File Index

- **REQ-CR-01** — The system SHALL present a file index listing all `.md` files found in the configured docs directory, sorted alphabetically.
- **REQ-CR-02** — WHEN the docs directory contains no `.md` files, the index SHALL display a message indicating no files were found.
- **REQ-CR-03** — Each file in the index SHALL be selectable to open its rendered view.

### 2.2 Markdown Rendering

- **REQ-CR-04** — The system SHALL parse and render `.md` files using a CommonMark-compliant parser.
- **REQ-CR-05** — The system SHALL strip inline comment annotations (`<!-- @comment: ... -->`) from the markdown before rendering, so comments are invisible in the rendered output.
- **REQ-CR-06** — The system SHALL pass the CommonMark conformance test suite.

### 2.3 Mermaid Diagrams

- **REQ-CR-07** — WHEN a fenced code block has the language identifier `mermaid`, the system SHALL render it as a Mermaid diagram.
- **REQ-CR-08** — WHEN the user toggles the theme, the system SHALL re-render all Mermaid diagrams using the appropriate theme variant (`default` for light, `dark` for dark mode).

---

## 3. Live Reload

- **REQ-LR-01** — The system SHALL watch the docs directory for file-system changes.
- **REQ-LR-02** — WHEN any `.md` file in the docs directory is created, modified, or deleted, the system SHALL update the file index and, if the changed file is currently displayed, reload its rendered content.
- **REQ-LR-03** — The system SHALL use native OS file-system events (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows) by default.
- **REQ-LR-04** — WHERE native file-system events are unavailable or unreliable (e.g. networked drives — NFS, SMB, CIFS), the system SHALL support a polling fallback at configurable intervals (default: 1 second).
- **REQ-LR-05** — IF the file-system watcher encounters an error (e.g. directory deleted, permissions revoked), THEN the system SHALL display a user-visible error and stop watching until the user reconfigures the docs directory.

---

## 4. Inline Comments

### 4.1 Storage Format

- **REQ-IC-01** — Comments SHALL be stored as HTML comment tags in the markdown file, immediately after the anchored text: `<!-- @comment: {"id":"...","anchor":"...","before":"...","after":"...","text":"...","date":"..."} -->`.
- **REQ-IC-02** — Each comment SHALL have a unique `id` (generated as a combination of a high-resolution timestamp and a cryptographically random component to prevent collisions under rapid creation), the selected `anchor` text, up to 30 characters of `before` and `after` context, the comment `text`, and an ISO 8601 `date`.
- **REQ-IC-03** — Comments SHALL be invisible in rendered output and preserved on disk for round-trip safety. The system SHALL verify round-trip safety: parsing a file's comments and re-serialising them SHALL produce byte-identical comment tags.

### 4.2 Anchor Matching

- **REQ-IC-04** — The system SHALL locate the anchor text in the **comment-stripped** markdown (i.e. after removing all `<!-- @comment: ... -->` tags) using a progressive fallback strategy, trying in order: `before + anchor + after`, `anchor + after`, `before + anchor`, `anchor` alone. The system SHALL match the **first occurrence** found by the first strategy that succeeds.
- **REQ-IC-05** — IF none of the fallback searches match, THEN the system SHALL report an error to the user indicating the anchor text was not found. The error mechanism is platform-specific (e.g. HTTP 422 for a web server, an alert or inline error for a native app).

### 4.3 Comment CRUD

- **REQ-IC-06** — The system SHALL support creating a comment with fields: `file`, `anchor`, `text`, and optional `before`/`after` context.
- **REQ-IC-07** — The system SHALL support editing a comment's text, identified by `file` and `id`.
- **REQ-IC-08** — The system SHALL support deleting a comment, identified by `file` and `id`.
- **REQ-IC-09** — WHEN a comment is created, edited, or deleted, the system SHALL write the updated file to disk atomically (write to a temporary file, then rename) to prevent partial writes on crash.
- **REQ-IC-10** — WHEN the file on disk changes (whether from a local comment operation or an external edit), the system SHALL reload the document content and re-parse comments, rather than relying on in-memory state.

### 4.4 Comment UI

- **REQ-IC-11** — WHEN a document is displayed, the system SHALL highlight all comment anchors in the rendered text with a visible background tint and underline decoration.
- **REQ-IC-12** — The system SHALL display a comment sidebar that slides in from the trailing edge, listing all comments with their anchor text, note, and date.
- **REQ-IC-13** — WHEN the user clicks a highlighted anchor, the system SHALL open the sidebar and scroll to the corresponding comment.
- **REQ-IC-14** — WHEN the user clicks a comment row in the sidebar, the system SHALL scroll the document to the highlighted anchor.
- **REQ-IC-15** — The rendered markdown content SHALL support interactive text selection — the user SHALL be able to click and drag to select an arbitrary range of text within the document body. The selected text SHALL be visually highlighted by the platform's native selection colour.
- **REQ-IC-16** — The system SHALL observe selection changes in the rendered content and SHALL be able to read the selected string programmatically. IF the rendering technology does not natively expose selection events, THEN the implementation SHALL use a component that does (e.g. `NSTextView` on macOS, `<textarea>` on the web, `UITextView` on iOS).
- **REQ-IC-17** — WHEN the user has selected text in the rendered markdown, the system SHALL display a floating action (bubble, popover, or context menu item) offering "Add comment". The action SHALL be positioned directly above the selection, horizontally centred on the selected range, and SHALL NOT overlap or obscure the selected text. The action SHALL be rendered in the same coordinate space as the selection and SHALL remain correctly positioned regardless of scroll offset.
- **REQ-IC-18** — WHEN the user activates the "Add comment" action, the system SHALL capture the selected text as the anchor, extract up to 30 characters of surrounding context (before and after), and open a comment form pre-filled with that anchor text.
- **REQ-IC-19** — The comment form SHALL support both creating new comments and editing existing ones, with `Cmd/Ctrl+Enter` as a keyboard shortcut for submission. WHEN the form opens, the text input field SHALL accept keystrokes into its text model without requiring a click — the user SHALL be able to start typing immediately. (A blinking caret alone is not sufficient; the implementation must ensure the input component is the active receiver of keyboard events.)
- **REQ-IC-20** — AFTER a comment is saved via the form, the system SHALL reload the document, highlight the new anchor, and open the comment sidebar.

---

## 5. Navbar / Toolbar

- **REQ-NV-01** — Every screen SHALL display a navigation area with: a way to return to the file index, the current document title (when viewing a document), and action controls.

### 5.1 Copy as Markdown

- **REQ-NV-02** — On document views, the system SHALL provide a "Copy MD" action that copies the raw markdown (with comment annotations stripped) to the platform clipboard.
- **REQ-NV-03** — WHEN the copy action completes, the system SHALL provide brief visual feedback (e.g. label change to "Copied!", checkmark icon) that reverts within 3 seconds.

### 5.2 Comments Toggle

- **REQ-NV-04** — On document views, the system SHALL provide a "Comments" action that toggles the comment sidebar.
- **REQ-NV-05** — WHEN comments exist, the action label SHALL display the comment count (e.g. "2 comments").

### 5.3 Recent Files

- **REQ-NV-06** — The system SHALL provide a "Recent" action that shows the last 8 visited document files.
- **REQ-NV-07** — Recent files SHALL be persisted across sessions using the platform's standard persistence mechanism (e.g. `localStorage`, `UserDefaults`, shared preferences) and updated on every document view.
- **REQ-NV-08** — The recent files list SHALL exclude the currently viewed file.

### 5.4 Dark Mode

- **REQ-NV-09** — The system SHALL provide a theme toggle control (moon/sun icon or equivalent).
- **REQ-NV-10** — WHEN toggled, the system SHALL switch to the alternate theme and persist the preference.
- **REQ-NV-11** — The system SHALL initialise the theme from persisted preference or the OS-level appearance setting before first paint, to prevent a flash of the wrong theme.

---

## 6. Dark Mode Theming

- **REQ-DM-01** — The system SHALL define all colours through a theming abstraction (e.g. CSS custom properties, semantic system colours, or a colour token map) so that every colour used in the UI is theme-aware.
- **REQ-DM-02** — The system SHALL provide a dark theme override that replaces every colour token.
- **REQ-DM-03** — Theme transitions SHALL be smooth (e.g. 0.2-second animation or system-provided transition).
- **REQ-DM-04** — All rendered markdown content — including headings, body text, code blocks, blockquotes, list bullets, links, table text, and comment highlights — SHALL use theme-aware colours and SHALL remain legible in both light and dark modes. Specifically, body text SHALL have a contrast ratio of at least 4.5:1 against the background in both themes.
- **REQ-DM-05** — IF the system embeds rendered content in a text view or attributed string, THEN all text colours, background colours, and decorations in that content SHALL adapt when the theme changes, without requiring a manual reload.
- **REQ-DM-06** — The system SHALL NOT use hardcoded colour values (e.g. `#000000`, `rgb(0,0,0)`, `NSColor.black`, `Color.black`) for text or backgrounds in rendered content. All colours SHALL be resolved through the platform's semantic colour system (e.g. CSS custom properties, `NSColor.labelColor`, `Color.primary`) or a shared colour token map.

---

## 7. Security

- **REQ-SE-01** — The system SHALL NOT interpret user-controlled data (comment text, anchor text, filenames) as executable code, markup, or format strings. On the web, this means no `innerHTML` with user data; in native apps, this means no unescaped interpolation into attributed strings, shell commands, or SQL.
- **REQ-SE-02** — The system SHALL validate that requested filenames end in `.md`, contain no path separators (`/`, `\`), and resolve within the configured docs directory, to prevent path traversal.
- **REQ-SE-03** — IF a resolved file path falls outside the docs directory, THEN the system SHALL reject the request and not read or write the file.
- **REQ-SE-04** — WHERE the system serves content over HTTP, it SHALL escape `<` and `>` in JSON embedded in `<script>` blocks and SHALL escape `&`, `<`, `>`, `"` in HTML output.

---

## 8. Configuration

- **REQ-CF-01** — The system SHALL allow the user to configure the docs directory. The mechanism is platform-specific: environment variable, settings UI, folder picker, command-line argument, or equivalent.
- **REQ-CF-02** — The system SHALL provide a sensible default docs directory (e.g. `./docs` for a server, `~/Documents/MarkdownDocs` for a desktop app).
- **REQ-CF-03** — WHEN the configured docs directory does not exist, the system SHALL create it.
- **REQ-CF-04** — WHERE the system operates as an HTTP server, it SHALL accept `PORT` (default: `3000`) and `USE_POLLING` (default: `false`) configuration via environment variables.

---

## 9. Accessibility and Keyboard Navigation

- **REQ-AX-01** — All interactive elements (buttons, toggles, list items, comment entries, text inputs) SHALL be reachable and activatable via keyboard alone, using `Tab` / `Shift+Tab` for focus traversal and `Enter` or `Space` for activation.
- **REQ-AX-02** — The system SHALL assign a stable, unique accessibility identifier to every interactive element and every semantically distinct region (document content area, sidebar, comment form, floating action, toolbar buttons). These identifiers SHALL be documented and SHALL NOT change across versions without a major version bump.
- **REQ-AX-03** — The comment sidebar SHALL be navigable via arrow keys (up/down to move between entries) when it has focus.
- **REQ-AX-04** — WHEN a modal or sheet (e.g. the comment form) is open, focus SHALL be trapped within it — `Tab` SHALL NOT move focus to elements behind the modal. `Escape` SHALL dismiss the modal.
- **REQ-AX-05** — The system SHALL support screen reader announcements: theme changes, comment save/delete confirmations, and error messages SHALL be announced to assistive technologies (e.g. `aria-live` on the web, `NSAccessibilityNotification` on macOS).
- **REQ-AX-06** — The file index SHALL be navigable via arrow keys (up/down to move between files) and `Enter` to open the selected file.

---

## 10. Architecture

This section describes the logical components and their responsibilities. Implementations may organise these into files, modules, or classes as appropriate for the platform.

### 10.1 Logical Components

| Component | Responsibility |
|---|---|
| **File Index** | Lists `.md` files in the docs directory, sorted alphabetically |
| **Markdown Parser** | Parses markdown source into a renderable structure (AST, HTML, attributed string, or equivalent) |
| **Comment Engine** | Pure data transforms: parse, strip, insert, edit, delete comment tags in raw markdown. No I/O, no UI. |
| **Renderer** | Converts parsed markdown into the platform's display format, applying theme colours and comment highlights |
| **File Watcher** | Monitors the docs directory for changes and notifies the application |
| **State Manager** | Owns the current docs directory, selected file, parsed content, comments, recent files, and theme preference |
| **UI Shell** | Toolbar/navbar, sidebar, document area, comment form, theme toggle |

### 10.2 Data Flow

1. User selects a file → State Manager reads raw markdown from disk
2. Comment Engine strips comment tags → Renderer converts to display format
3. Comment Engine parses comment tags → Renderer applies highlights at anchor positions
4. File Watcher detects change → State Manager re-reads file → steps 2–3 repeat
5. User creates/edits/deletes a comment → Comment Engine transforms raw markdown → State Manager writes to disk atomically → File Watcher triggers reload

### 10.3 App Identity (Native)

- **REQ-AR-01** — WHERE the system is a native desktop or mobile application, it SHALL have a stable bundle identifier (e.g. `com.example.markdownviewer`) defined in its application manifest (e.g. `Info.plist`, `AndroidManifest.xml`). This identifier SHALL be used for user preferences, window restoration, and automation targeting.

---

## 11. Testing

- **REQ-TS-01** — Every feature or bug fix SHALL include tests.
- **REQ-TS-02** — The Comment Engine (parse, strip, insert, edit, delete) SHALL be covered by unit tests, including round-trip tests (insert → parse → strip restores original).
- **REQ-TS-03** — The Renderer SHALL be tested to verify that every text run in the output has a theme-aware foreground colour (no `nil`, no hardcoded black/white).
- **REQ-TS-04** — The markdown parser SHALL pass the CommonMark conformance test suite.
- **REQ-TS-05** — Text input components used in comment forms SHALL be verified by a test that simulates keystrokes and asserts the text model receives them. A blinking caret alone is not sufficient — the test SHALL fail if keystrokes are not reflected in the text model.
- **REQ-TS-06** — Selection stability SHALL be verified by a test that sets a selection range, triggers a state change that would cause a re-render, and asserts the selection range is unchanged.
- **REQ-TS-07** — Floating action positioning SHALL be verified by a test that displays the action at a known selection rect and asserts the action's bounds do not overlap the selection rect.
- **REQ-TS-08** — The acceptance tests in Section 12 SHALL be automatable via the platform's UI testing framework (e.g. Playwright for web, Appium or XCUITest for macOS, Espresso for Android).
- **REQ-TS-09** — Each UI test SHALL run against an isolated environment: a fresh temporary docs directory, no shared state with other tests.

---

## 12. Acceptance Tests

Each acceptance test maps to one or more requirements. An implementation is not complete until every test in this section passes. Tests are described as **Given / When / Then** scenarios and must be automatable.

### 12.1 Text Selection Stability

> Covers: REQ-IC-15, REQ-IC-16

**AT-SEL-01 — Selection persists after mouseup**
- **Given** a document is open with at least one paragraph of text
- **When** the user clicks and drags to select a word in the document body
- **Then** the selected text remains highlighted (platform selection colour) for at least 5 seconds without clearing, flickering, or being replaced

**AT-SEL-02 — Selection survives UI state changes**
- **Given** a document is open
- **When** the user selects text, causing the "Add comment" action to appear
- **Then** the original text selection SHALL remain intact — it SHALL NOT be cleared, re-rendered, or reset by the appearance of the action or any internal state change

**AT-SEL-03 — Selected string is readable**
- **Given** a document containing the text "Hello world"
- **When** the user selects the word "world"
- **Then** the system reports "world" as the selected text (not empty, not the full paragraph, not a stale value)

### 12.2 Comment Creation Flow

> Covers: REQ-IC-16, REQ-IC-17, REQ-IC-18, REQ-IC-19, REQ-IC-20

**AT-COM-01 — Floating action appears above selection**
- **Given** a document is open with at least one paragraph of text
- **When** the user selects a word in the document body
- **Then** a floating "Add comment" action appears within 500ms. The action SHALL be positioned directly above the selected text (its bottom edge above the selection's top edge), horizontally centred on the selection. The action SHALL NOT overlap or cover the selected text. The action SHALL be fully visible within the viewport

**AT-COM-02 — Floating action disappears on deselection**
- **Given** the "Add comment" action is visible
- **When** the user clicks elsewhere to clear the selection
- **Then** the action disappears

**AT-COM-03 — Comment form opens with anchor and focused input**
- **Given** the user has selected the text "important" and the action is visible
- **When** the user clicks the "Add comment" action
- **Then** a comment form opens, pre-filled with the anchor text "important", and the text input field accepts keystrokes into its text model without requiring a click

**AT-COM-04 — Comment round-trip**
- **Given** the comment form is open with anchor "important"
- **When** the user types "review this" (without clicking the text field first) and submits the form
- **Then** the document reloads, "important" is highlighted as a comment anchor, the comment sidebar contains an entry with anchor "important" and text "review this", and the underlying `.md` file contains a `<!-- @comment: {...} -->` tag

**AT-COM-05 — Context capture**
- **Given** a document containing "The quick brown fox jumps over"
- **When** the user selects "brown fox" and submits a comment
- **Then** the saved comment's `before` field contains up to 30 characters ending with "quick " and the `after` field contains up to 30 characters starting with " jumps"

**AT-COM-06 — Duplicate anchor text**
- **Given** a document containing "the cat sat" on line 1 and "the cat slept" on line 5
- **When** the user selects "the cat" on line 5 and submits a comment with before/after context
- **Then** the comment is anchored to the occurrence on line 5 (matched via the `before`/`after` context), not line 1

### 12.3 Dark Mode Legibility

> Covers: REQ-DM-04, REQ-DM-05, REQ-DM-06

**AT-DM-01 — Body text visible in dark mode**
- **Given** a document containing a paragraph, a heading, a code block, and a list
- **When** the system is in dark mode
- **Then** all text elements are visible — no text has the same colour as its background. Every text run SHALL have a luminance contrast ratio of at least 4.5:1 against its immediate background

**AT-DM-02 — Theme switch does not require reload**
- **Given** a document is displayed in light mode
- **When** the user switches to dark mode
- **Then** all text, backgrounds, and decorations update to dark-mode colours without the user needing to re-select the document or restart the application

**AT-DM-03 — Code blocks legible in both themes**
- **Given** a document with a fenced code block
- **When** viewed in light mode and then in dark mode
- **Then** the code text is legible in both — the code foreground colour differs from the code background colour by at least 4.5:1 contrast ratio in each theme

### 12.4 Comment Sidebar

> Covers: REQ-IC-11, REQ-IC-12, REQ-IC-13, REQ-IC-14

**AT-SB-01 — Anchors highlighted on load**
- **Given** a document with two existing comments on different words
- **When** the document is opened
- **Then** both anchor words are visually highlighted (background tint + underline)

**AT-SB-02 — Sidebar lists all comments**
- **Given** a document with 3 comments
- **When** the user opens the comment sidebar
- **Then** the sidebar lists 3 entries, each showing the anchor text, comment body, and date

**AT-SB-03 — Click anchor opens sidebar**
- **Given** a document with a highlighted comment anchor
- **When** the user clicks the anchor
- **Then** the sidebar opens and scrolls to the corresponding comment entry

**AT-SB-04 — Click sidebar scrolls to anchor**
- **Given** the sidebar is open with a comment whose anchor is off-screen
- **When** the user clicks the comment entry in the sidebar
- **Then** the document scrolls to bring the highlighted anchor into view

### 12.5 Comment Edit and Delete

> Covers: REQ-IC-07, REQ-IC-08

**AT-ED-01 — Edit persists**
- **Given** a document with a comment containing text "old note"
- **When** the user clicks Edit on that comment, changes the text to "new note", and submits
- **Then** the sidebar shows "new note" and the `.md` file on disk contains "new note" in the comment tag

**AT-ED-02 — Delete removes comment**
- **Given** a document with 2 comments
- **When** the user deletes one comment and confirms
- **Then** the sidebar shows 1 comment, the anchor highlight is removed, and the `.md` file no longer contains the deleted comment tag

### 12.6 Copy as Markdown

> Covers: REQ-NV-02, REQ-NV-03

**AT-CP-01 — Copy strips annotations**
- **Given** a document containing inline comment tags
- **When** the user activates "Copy MD"
- **Then** the clipboard contains the markdown text with all `<!-- @comment: ... -->` tags removed

**AT-CP-02 — Button feedback**
- **Given** the "Copy MD" action shows its default label
- **When** the user activates it
- **Then** visual feedback appears (e.g. "Copied!" label, checkmark) and reverts within 3 seconds

### 12.7 Keyboard Navigation

> Covers: REQ-AX-01, REQ-AX-03, REQ-AX-04, REQ-AX-06

**AT-KB-01 — Tab navigates toolbar actions**
- **Given** a document is open
- **When** the user presses Tab repeatedly
- **Then** focus moves through the toolbar actions (Copy MD, Comments, Recent, Theme toggle) in order, with a visible focus indicator on each

**AT-KB-02 — File index keyboard navigation**
- **Given** the file index is displayed with 3 files
- **When** the user presses the down arrow key 2 times and then Enter
- **Then** the third file is opened

**AT-KB-03 — Comment sidebar keyboard navigation**
- **Given** the sidebar is open with 3 comments
- **When** the user focuses the sidebar and presses the down arrow key
- **Then** the next comment entry is focused, with a visible focus indicator

**AT-KB-04 — Modal traps focus**
- **Given** the comment form is open
- **When** the user presses Tab repeatedly
- **Then** focus cycles within the form (text input, Cancel, Save) and does not move to elements behind it. Pressing Escape closes the form.

### 12.8 Error Handling

> Covers: REQ-IC-05, REQ-LR-05

**AT-ER-01 — Anchor not found**
- **Given** a comment whose anchor text has been removed from the document by an external edit
- **When** the document is reloaded
- **Then** the comment appears in the sidebar with a visual indicator that its anchor is orphaned (e.g. strikethrough, warning icon), and no highlight appears in the document body

**AT-ER-02 — File watcher error**
- **Given** the docs directory is being watched
- **When** the docs directory is deleted or becomes inaccessible
- **Then** the system displays a user-visible error message and does not crash

---

## Appendix A — Conventions

### A.1 RFC 2119 Key Words

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

### A.2 EARS Requirement Patterns

| Pattern | Template |
|---|---|
| Ubiquitous | The \<system\> SHALL \<action\>. |
| Event-driven | WHEN \<trigger\> the \<system\> SHALL \<action\>. |
| State-driven | WHILE \<state\> the \<system\> SHALL \<action\>. |
| Optional feature | WHERE \<feature\> is supported, the \<system\> SHALL \<action\>. |
| Unwanted behaviour | IF \<condition\> THEN the \<system\> SHALL \<action\>. |
