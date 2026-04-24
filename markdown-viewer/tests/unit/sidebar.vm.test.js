import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitted = [];
vi.mock('../../src/core/event-bus.js', () => ({
  emit: (event, payload) => emitted.push({ event, payload }),
  on: vi.fn(),
  off: vi.fn(),
}));

import { SidebarVM } from '../../src/viewmodels/sidebar.vm.js';

const comments = [
  { id: 'a', anchor: 'foo', before: '', after: '', text: 'note a', date: '2026-01-01' },
  { id: 'b', anchor: 'bar', before: '', after: '', text: 'note b', date: '2026-01-01' },
  { id: 'c', anchor: 'baz', before: '', after: '', text: 'note c', date: '2026-01-01' },
];

beforeEach(() => {
  emitted.length = 0;
});

describe('SidebarVM', () => {
  it('starts closed', () => {
    const vm = new SidebarVM();
    expect(vm.isOpen).toBe(false);
  });

  it('toggle opens and closes', () => {
    const vm = new SidebarVM();
    vm.toggle();
    expect(vm.isOpen).toBe(true);
    vm.toggle();
    expect(vm.isOpen).toBe(false);
  });

  it('open always opens', () => {
    const vm = new SidebarVM();
    vm.open();
    vm.open();
    expect(vm.isOpen).toBe(true);
  });

  it('toggle emits sidebar:toggle', () => {
    const vm = new SidebarVM();
    vm.toggle();
    expect(emitted.some(e => e.event === 'sidebar:toggle' && e.payload.open === true)).toBe(true);
  });

  it('updateComments stores comments and emits', () => {
    const vm = new SidebarVM();
    vm.updateComments(comments);
    expect(vm.comments).toHaveLength(3);
    expect(emitted.some(e => e.event === 'sidebar:toggle')).toBe(true);
  });

  it('focusComment opens sidebar and emits sidebar:focus', () => {
    const vm = new SidebarVM();
    vm.updateComments(comments);
    emitted.length = 0;
    vm.focusComment('b');
    expect(vm.isOpen).toBe(true);
    expect(emitted.some(e => e.event === 'sidebar:focus' && e.payload.commentId === 'b')).toBe(true);
  });

  it('focusComment sets cursor to correct index', () => {
    const vm = new SidebarVM();
    vm.updateComments(comments);
    vm.focusComment('c'); // index 2
    expect(vm.cursor).toBe(2);
  });

  it('moveCursor moves to next comment and emits focus', () => {
    const vm = new SidebarVM();
    vm.updateComments(comments);
    vm.focusComment('a'); // cursor = 0
    emitted.length = 0;
    vm.moveCursor(1);
    expect(vm.cursor).toBe(1);
    expect(emitted.some(e => e.event === 'sidebar:focus' && e.payload.commentId === 'b')).toBe(true);
  });

  it('moveCursor clamps at boundaries', () => {
    const vm = new SidebarVM();
    vm.updateComments(comments);
    vm.moveCursor(-10);
    expect(vm.cursor).toBe(0);
    vm.moveCursor(100);
    expect(vm.cursor).toBe(2);
  });

  it('moveCursor does nothing with no comments', () => {
    const vm = new SidebarVM();
    vm.moveCursor(1);
    expect(emitted.some(e => e.event === 'sidebar:focus')).toBe(false);
  });
});
