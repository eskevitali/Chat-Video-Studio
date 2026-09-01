import type {Plugin} from 'vite';

export interface SerialQueue {
  add<T>(task: () => T | Promise<T>): Promise<T>;
  readonly size: number;
}

export function createSerialQueue(maxSize?: number): SerialQueue;
export function elevenLabsTtsPlugin(environment: Record<string, string>): Plugin;
