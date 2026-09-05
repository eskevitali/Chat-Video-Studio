import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {createWorkspace, projectDurationMs} from './workspace.mjs';
import {createEditorSnapshot} from '../src/persistence/editor-snapshot.ts';

const tinyProject = {
  title: 'Тест',
  fps: 30,
  messages: [{
    id: 'm1',
    role: 'user',
    author: 'A',
    text: 'Привет',
    prePauseMs: 100,
    typingDurationMs: 200,
    postPauseMs: 100,
    take: {id: 't1', durationMs: 800, words: [{text: 'Привет', startMs: 0, endMs: 800}]},
  }],
};

describe('workspace', () => {
  it('считает длительность сценария', () => {
    expect(projectDurationMs(tinyProject)).toBe(100 + 200 + 500 + 800 + 100);
  });

  it('хранит не больше двух проектов и удаляет медиа вместе с проектом', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vchat-ws-'));
    const workspace = createWorkspace({
      root,
      environment: {WORKSPACE_DIR: join(root, 'data/users')},
    });
    const snapshot = createEditorSnapshot(tinyProject);
    const first = await workspace.create('user-a', snapshot);
    const second = await workspace.create('user-a', snapshot);
    await expect(workspace.create('user-a', snapshot)).rejects.toThrow(/не больше 2/);
    expect(await workspace.owns('user-a', first.id)).toBe(true);
    await workspace.remove('user-a', first.id);
    expect(await workspace.owns('user-a', first.id)).toBe(false);
    expect((await workspace.list('user-a')).map((item) => item.id)).toEqual([second.id]);
    await rm(root, {recursive: true, force: true});
  });

  it('отклоняет проект длиннее часа', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vchat-ws-'));
    const workspace = createWorkspace({
      root,
      environment: {WORKSPACE_DIR: join(root, 'data/users'), WORKSPACE_MAX_DURATION_MS: '1000'},
    });
    await expect(workspace.create('user-a', createEditorSnapshot(tinyProject))).rejects.toThrow(/60 минут|длиннее/);
    await rm(root, {recursive: true, force: true});
  });
});
