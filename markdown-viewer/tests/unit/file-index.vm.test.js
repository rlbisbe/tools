import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the event bus ────────────────────────────────────────────────────────
const emitted = [];
vi.mock('../../src/core/event-bus.js', () => ({
  emit: (event, payload) => emitted.push({ event, payload }),
  on: vi.fn(),
  off: vi.fn(),
}));

// ── Mock tauri-bridge ─────────────────────────────────────────────────────────
vi.mock('../../src/core/tauri-bridge.js', () => ({
  bridge: {
    listFiles: vi.fn(),
  },
}));

import { bridge } from '../../src/core/tauri-bridge.js';
import { FileIndexVM } from '../../src/viewmodels/file-index.vm.js';

beforeEach(() => {
  emitted.length = 0;
  vi.clearAllMocks();
});

describe('FileIndexVM', () => {
  it('loads files and emits files:loaded', async () => {
    bridge.listFiles.mockResolvedValue(['a.md', 'b.md']);
    const vm = new FileIndexVM();
    await vm.load();
    expect(vm.files).toEqual(['a.md', 'b.md']);
    expect(emitted.some(e => e.event === 'files:loaded')).toBe(true);
  });

  it('emits files:error on failure', async () => {
    bridge.listFiles.mockRejectedValue(new Error('disk error'));
    const vm = new FileIndexVM();
    await vm.load();
    expect(emitted.some(e => e.event === 'files:error')).toBe(true);
  });

  it('sets cursor to 0 after loading files', async () => {
    bridge.listFiles.mockResolvedValue(['a.md', 'b.md', 'c.md']);
    const vm = new FileIndexVM();
    await vm.load();
    expect(vm.cursor).toBe(0);
  });

  it('sets cursor to -1 when no files', async () => {
    bridge.listFiles.mockResolvedValue([]);
    const vm = new FileIndexVM();
    await vm.load();
    expect(vm.cursor).toBe(-1);
  });

  it('moveCursor clamps at boundaries', async () => {
    bridge.listFiles.mockResolvedValue(['a.md', 'b.md', 'c.md']);
    const vm = new FileIndexVM();
    await vm.load();

    vm.moveCursor(-10);
    expect(vm.cursor).toBe(0);

    vm.moveCursor(100);
    expect(vm.cursor).toBe(2);
  });

  it('moveCursor emits files:cursor', async () => {
    bridge.listFiles.mockResolvedValue(['a.md', 'b.md']);
    const vm = new FileIndexVM();
    await vm.load();
    emitted.length = 0;
    vm.moveCursor(1);
    expect(emitted.some(e => e.event === 'files:cursor' && e.payload.cursor === 1)).toBe(true);
  });

  it('open emits file:open with filename', () => {
    const vm = new FileIndexVM();
    vm.open('readme.md');
    expect(emitted.some(e => e.event === 'file:open' && e.payload.filename === 'readme.md')).toBe(true);
  });

  it('openCurrent opens file at cursor', async () => {
    bridge.listFiles.mockResolvedValue(['a.md', 'b.md', 'c.md']);
    const vm = new FileIndexVM();
    await vm.load();
    vm.moveCursor(2); // cursor = 2 → 'c.md'
    emitted.length = 0;
    vm.openCurrent();
    expect(emitted.some(e => e.event === 'file:open' && e.payload.filename === 'c.md')).toBe(true);
  });

  it('openCurrent does nothing when cursor is -1', () => {
    const vm = new FileIndexVM();
    // no load called → cursor = -1
    vm.openCurrent();
    expect(emitted.some(e => e.event === 'file:open')).toBe(false);
  });
});
