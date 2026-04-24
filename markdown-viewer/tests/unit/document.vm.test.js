import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitted = [];
vi.mock('../../src/core/event-bus.js', () => ({
  emit: (event, payload) => emitted.push({ event, payload }),
  on: vi.fn(),
  off: vi.fn(),
}));

vi.mock('../../src/core/tauri-bridge.js', () => ({
  bridge: {
    openFile: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    removeComment: vi.fn(),
  },
}));

import { bridge } from '../../src/core/tauri-bridge.js';
import { DocumentVM } from '../../src/viewmodels/document.vm.js';

const fakeDoc = {
  filename: 'test.md',
  html: '<p>Hello</p>',
  raw: '# Hello',
  comments: [],
};

beforeEach(() => {
  emitted.length = 0;
  vi.clearAllMocks();
});

describe('DocumentVM', () => {
  it('open loads file and emits doc:loaded', async () => {
    bridge.openFile.mockResolvedValue(fakeDoc);
    const vm = new DocumentVM();
    await vm.open('test.md');
    expect(vm.filename).toBe('test.md');
    expect(vm.html).toBe('<p>Hello</p>');
    expect(emitted.some(e => e.event === 'doc:loaded')).toBe(true);
  });

  it('open emits doc:error on failure', async () => {
    bridge.openFile.mockRejectedValue(new Error('not found'));
    const vm = new DocumentVM();
    await vm.open('missing.md');
    expect(emitted.some(e => e.event === 'doc:error')).toBe(true);
  });

  it('setSelection stores selection and emits selection:change', () => {
    const vm = new DocumentVM();
    const sel = { text: 'hello', before: 'say ', after: ' world', rect: {} };
    vm.setSelection(sel);
    expect(vm.pendingSelection).toEqual(sel);
    expect(emitted.some(e => e.event === 'selection:change')).toBe(true);
  });

  it('setSelection null clears pending and emits null', () => {
    const vm = new DocumentVM();
    vm.setSelection({ text: 'x', before: '', after: '', rect: {} });
    emitted.length = 0;
    vm.setSelection(null);
    expect(vm.pendingSelection).toBeNull();
    expect(emitted.find(e => e.event === 'selection:change').payload).toBeNull();
  });

  it('createComment calls bridge and reloads doc', async () => {
    bridge.openFile.mockResolvedValue({ ...fakeDoc, comments: [{ id: '1', anchor: 'Hello', before: '', after: '', text: 'note', date: '2026-01-01' }] });
    bridge.createComment.mockResolvedValue([{ id: '1', anchor: 'Hello', before: '', after: '', text: 'note', date: '2026-01-01' }]);
    const vm = new DocumentVM();
    await vm.open('test.md');
    vm.setSelection({ text: 'Hello', before: '', after: '', rect: {} });
    emitted.length = 0;
    await vm.createComment('note');
    expect(bridge.createComment).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'test.md',
      anchor: 'Hello',
      text: 'note',
    }));
    expect(bridge.openFile).toHaveBeenCalledTimes(2); // initial open + reload
  });

  it('createComment does nothing without pending selection', async () => {
    bridge.openFile.mockResolvedValue(fakeDoc);
    const vm = new DocumentVM();
    await vm.open('test.md');
    await vm.createComment('note');
    expect(bridge.createComment).not.toHaveBeenCalled();
  });

  it('editComment calls bridge.updateComment', async () => {
    bridge.openFile.mockResolvedValue(fakeDoc);
    bridge.updateComment.mockResolvedValue([]);
    const vm = new DocumentVM();
    await vm.open('test.md');
    await vm.editComment('id1', 'updated text');
    expect(bridge.updateComment).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'test.md',
      id: 'id1',
      text: 'updated text',
    }));
  });

  it('deleteComment calls bridge.removeComment', async () => {
    bridge.openFile.mockResolvedValue(fakeDoc);
    bridge.removeComment.mockResolvedValue([]);
    const vm = new DocumentVM();
    await vm.open('test.md');
    await vm.deleteComment('id2');
    expect(bridge.removeComment).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'test.md',
      id: 'id2',
    }));
  });

  it('reload re-opens the current file', async () => {
    bridge.openFile.mockResolvedValue(fakeDoc);
    const vm = new DocumentVM();
    await vm.open('test.md');
    await vm.reload();
    expect(bridge.openFile).toHaveBeenCalledTimes(2);
  });

  it('reload does nothing when no file is open', async () => {
    const vm = new DocumentVM();
    await vm.reload();
    expect(bridge.openFile).not.toHaveBeenCalled();
  });
});
