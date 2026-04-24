import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitted = [];
vi.mock('../../src/core/event-bus.js', () => ({
  emit: (event, payload) => emitted.push({ event, payload }),
  on: vi.fn(),
  off: vi.fn(),
}));

vi.mock('../../src/core/tauri-bridge.js', () => ({
  bridge: {
    getRawMarkdown: vi.fn(),
  },
}));

// Mock browser APIs not available in Node
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] ?? null,
  setItem: (k, v) => { localStorageStore[k] = v; },
  removeItem: (k) => { delete localStorageStore[k]; },
};
global.window = {
  matchMedia: () => ({ matches: false }),
};
global.document = {
  documentElement: { setAttribute: vi.fn() },
};
Object.defineProperty(global, 'navigator', {
  value: { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } },
  writable: true,
  configurable: true,
});

import { bridge } from '../../src/core/tauri-bridge.js';
import { ToolbarVM } from '../../src/viewmodels/toolbar.vm.js';

beforeEach(() => {
  emitted.length = 0;
  Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]);
  vi.clearAllMocks();
});

describe('ToolbarVM', () => {
  it('defaults to light theme when nothing persisted', () => {
    const vm = new ToolbarVM();
    expect(vm.theme).toBe('light');
  });

  it('reads persisted theme from localStorage', () => {
    localStorageStore['md-viewer-theme'] = 'dark';
    const vm = new ToolbarVM();
    expect(vm.theme).toBe('dark');
  });

  it('toggleTheme switches light → dark', () => {
    const vm = new ToolbarVM();
    vm.toggleTheme();
    expect(vm.theme).toBe('dark');
  });

  it('toggleTheme switches dark → light', () => {
    localStorageStore['md-viewer-theme'] = 'dark';
    const vm = new ToolbarVM();
    vm.toggleTheme();
    expect(vm.theme).toBe('light');
  });

  it('toggleTheme persists to localStorage', () => {
    const vm = new ToolbarVM();
    vm.toggleTheme();
    expect(localStorageStore['md-viewer-theme']).toBe('dark');
  });

  it('toggleTheme emits toolbar:theme', () => {
    const vm = new ToolbarVM();
    vm.toggleTheme();
    expect(emitted.some(e => e.event === 'toolbar:theme' && e.payload.theme === 'dark')).toBe(true);
  });

  it('trackFile adds to recent list', () => {
    const vm = new ToolbarVM();
    vm.trackFile('a.md');
    vm.trackFile('b.md');
    expect(vm.recent).toEqual(['b.md', 'a.md']);
  });

  it('trackFile deduplicates files', () => {
    const vm = new ToolbarVM();
    vm.trackFile('a.md');
    vm.trackFile('b.md');
    vm.trackFile('a.md');
    expect(vm.recent).toEqual(['a.md', 'b.md']);
  });

  it('trackFile limits to 8 entries', () => {
    const vm = new ToolbarVM();
    for (let i = 0; i < 10; i++) vm.trackFile(`file${i}.md`);
    expect(vm.recent).toHaveLength(8);
  });

  it('recentExcludingCurrent excludes current file', () => {
    const vm = new ToolbarVM();
    vm.trackFile('a.md');
    vm.trackFile('b.md');
    vm.trackFile('c.md'); // current
    expect(vm.recentExcludingCurrent()).toEqual(['b.md', 'a.md']);
  });

  it('copyMarkdown calls bridge and emits toolbar:copy done', async () => {
    bridge.getRawMarkdown.mockResolvedValue('# Hello');
    const vm = new ToolbarVM();
    await vm.copyMarkdown('test.md');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Hello');
    expect(emitted.some(e => e.event === 'toolbar:copy' && e.payload.state === 'done')).toBe(true);
  });

  it('copyMarkdown emits idle on error', async () => {
    bridge.getRawMarkdown.mockRejectedValue(new Error('fail'));
    const vm = new ToolbarVM();
    await vm.copyMarkdown('test.md');
    expect(emitted.some(e => e.event === 'toolbar:copy' && e.payload.state === 'idle')).toBe(true);
  });
});
