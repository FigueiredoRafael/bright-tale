/**
 * Unit tests for the mock AI provider queue (T1.13).
 *
 * Covers: queue ordering (FIFO), dequeue on empty queue, reset,
 * call counter increments, and snapshot.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue,
  dequeue,
  queueLength,
  nextCallNumber,
  resetAll,
  snapshot,
} from '../__mocks__/queue.js';

beforeEach(() => {
  resetAll();
});

describe('enqueue / dequeue — ordering', () => {
  it('returns entries in FIFO order', () => {
    enqueue('brainstorm', { kind: 'success', payload: { ideas: ['first'] } });
    enqueue('brainstorm', { kind: 'success', payload: { ideas: ['second'] } });
    enqueue('brainstorm', { kind: 'success', payload: { ideas: ['third'] } });

    expect(dequeue('brainstorm')).toMatchObject({ payload: { ideas: ['first'] } });
    expect(dequeue('brainstorm')).toMatchObject({ payload: { ideas: ['second'] } });
    expect(dequeue('brainstorm')).toMatchObject({ payload: { ideas: ['third'] } });
  });

  it('returns undefined when queue is empty', () => {
    expect(dequeue('brainstorm')).toBeUndefined();
  });

  it('returns undefined after exhausting all entries', () => {
    enqueue('research', { kind: 'success', payload: { data: 1 } });
    dequeue('research');
    expect(dequeue('research')).toBeUndefined();
  });

  it('queues for different stages are independent', () => {
    enqueue('brainstorm', { kind: 'success', payload: { stage: 'b' } });
    enqueue('research', { kind: 'success', payload: { stage: 'r' } });

    expect(dequeue('research')).toMatchObject({ payload: { stage: 'r' } });
    expect(dequeue('brainstorm')).toMatchObject({ payload: { stage: 'b' } });
  });
});

describe('queueLength', () => {
  it('returns 0 for an empty queue', () => {
    expect(queueLength('review')).toBe(0);
  });

  it('tracks enqueued entries', () => {
    enqueue('review', { kind: 'success', payload: { score: 78 } });
    enqueue('review', { kind: 'success', payload: { score: 92 } });
    expect(queueLength('review')).toBe(2);

    dequeue('review');
    expect(queueLength('review')).toBe(1);

    dequeue('review');
    expect(queueLength('review')).toBe(0);
  });
});

describe('failure entries', () => {
  it('stores and returns failure entries correctly', () => {
    enqueue('production', { kind: 'failure', failureKind: 'quota_429', message: 'rate limit hit' });
    const entry = dequeue('production');
    expect(entry).toMatchObject({ kind: 'failure', failureKind: 'quota_429', message: 'rate limit hit' });
  });

  it('queues mixed success and failure entries in order', () => {
    enqueue('assets', { kind: 'success', payload: { url: 'img.png' } });
    enqueue('assets', { kind: 'failure', failureKind: 'timeout', message: 'took too long' });
    enqueue('assets', { kind: 'success', payload: { url: 'img2.png' } });

    expect(dequeue('assets')?.kind).toBe('success');
    expect(dequeue('assets')?.kind).toBe('failure');
    expect(dequeue('assets')?.kind).toBe('success');
  });
});

describe('nextCallNumber', () => {
  it('starts at 1 for the first call', () => {
    expect(nextCallNumber('brainstorm')).toBe(1);
  });

  it('increments on each call', () => {
    expect(nextCallNumber('brainstorm')).toBe(1);
    expect(nextCallNumber('brainstorm')).toBe(2);
    expect(nextCallNumber('brainstorm')).toBe(3);
  });

  it('counters are independent per stage', () => {
    nextCallNumber('brainstorm');
    nextCallNumber('research');
    nextCallNumber('research');
    expect(nextCallNumber('brainstorm')).toBe(2);
    expect(nextCallNumber('research')).toBe(3);
  });
});

describe('resetAll', () => {
  it('clears all queues', () => {
    enqueue('brainstorm', { kind: 'success', payload: {} });
    enqueue('review', { kind: 'success', payload: {} });
    resetAll();

    expect(dequeue('brainstorm')).toBeUndefined();
    expect(dequeue('review')).toBeUndefined();
  });

  it('resets call counters back to zero', () => {
    nextCallNumber('brainstorm');
    nextCallNumber('brainstorm');
    resetAll();

    expect(nextCallNumber('brainstorm')).toBe(1);
  });
});

describe('snapshot', () => {
  it('returns empty record when nothing has been used', () => {
    expect(snapshot()).toEqual({});
  });

  it('reflects enqueued entries', () => {
    enqueue('brainstorm', { kind: 'success', payload: {} });
    enqueue('brainstorm', { kind: 'success', payload: {} });
    enqueue('review', { kind: 'failure', failureKind: 'quota_429', message: 'limit' });

    const state = snapshot();
    expect(state['brainstorm']?.pending).toBe(2);
    expect(state['review']?.pending).toBe(1);
  });

  it('reflects call totals after dequeue', () => {
    enqueue('research', { kind: 'success', payload: {} });
    nextCallNumber('research');
    dequeue('research');

    const state = snapshot();
    expect(state['research']?.totalCalls).toBe(1);
    expect(state['research']?.pending).toBe(0);
  });
});
