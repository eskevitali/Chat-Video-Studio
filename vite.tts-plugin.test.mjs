import {describe, expect, it} from 'vitest';
import {createSerialQueue} from './vite.tts-plugin.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return {promise, resolve};
};

describe('TTS serial queue', () => {
  it('never runs two jobs at the same time', async () => {
    const queue = createSerialQueue();
    const firstGate = deferred();
    const events = [];

    const first = queue.add(async () => {
      events.push('first:start');
      await firstGate.promise;
      events.push('first:end');
      return 'first';
    });
    const second = queue.add(async () => {
      events.push('second:start');
      return 'second';
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    expect(queue.size).toBe(2);

    firstGate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    expect(queue.size).toBe(0);
  });

  it('continues after a failed job', async () => {
    const queue = createSerialQueue();
    const failed = queue.add(() => { throw new Error('failure'); });
    const next = queue.add(() => 'completed');

    await expect(failed).rejects.toThrow('failure');
    await expect(next).resolves.toBe('completed');
  });

  it('rejects jobs beyond the configured limit', async () => {
    const queue = createSerialQueue(1);
    const gate = deferred();
    const first = queue.add(() => gate.promise);

    await expect(queue.add(() => 'extra')).rejects.toThrow('Очередь озвучки заполнена');
    gate.resolve();
    await first;
  });
});
