import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {settingsFileId} from './user-settings.mjs';

export const MAX_PROJECTS = 2;
export const MAX_DURATION_MS = 60 * 60 * 1000;

export const projectDurationMs = (project) => {
  const typingSpeed = Number(project?.video?.typingSpeed) > 0 ? Number(project.video.typingSpeed) : 1;
  let cursor = 0;
  for (const message of project?.messages || []) {
    cursor += (Number(message.prePauseMs) || 0)
      + (Number(message.typingDurationMs) || 0) / typingSpeed
      + 500
      + (Number(message.take?.durationMs) || 0)
      + (Number(message.postPauseMs) || 0);
  }
  return cursor;
};

const safeId = (value) => settingsFileId(value);

export const createWorkspace = ({root, environment = {}} = {}) => {
  const usersRoot = resolve(environment.WORKSPACE_DIR || resolve(root || process.cwd(), 'data/users'));
  const publicRoot = resolve(root || process.cwd(), 'public/workspace');
  const maxProjects = Number(environment.WORKSPACE_MAX_PROJECTS) || MAX_PROJECTS;
  const maxDurationMs = Number(environment.WORKSPACE_MAX_DURATION_MS) || MAX_DURATION_MS;

  const userDir = (userId) => resolve(usersRoot, safeId(userId));
  const indexPath = (userId) => resolve(userDir(userId), 'index.json');
  const snapshotPath = (userId, projectId) => resolve(userDir(userId), `${safeId(projectId)}.json`);
  const mediaDir = (projectId) => resolve(publicRoot, safeId(projectId));

  const readIndex = async (userId) => {
    try {
      const raw = JSON.parse(await readFile(indexPath(userId), 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  };

  const writeIndex = async (userId, items) => {
    await mkdir(userDir(userId), {recursive: true, mode: 0o700});
    await writeFile(indexPath(userId), `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  };

  const metaOf = (projectId, snapshot) => ({
    id: projectId,
    title: String(snapshot.project?.title || 'Без названия').slice(0, 120),
    durationMs: projectDurationMs(snapshot.project),
    updatedAt: snapshot.savedAt || new Date().toISOString(),
  });

  return {
    maxProjects,
    maxDurationMs,
    async list(userId) {
      if (!safeId(userId)) return [];
      return readIndex(userId);
    },
    async owns(userId, projectId) {
      const id = safeId(projectId);
      if (!safeId(userId) || !id) return false;
      const items = await readIndex(userId);
      return items.some((item) => item.id === id);
    },
    async load(userId, projectId) {
      const id = safeId(projectId);
      if (!id) throw new Error('Нет проекта.');
      if (!(await this.owns(userId, id))) throw new Error('Проект не найден.');
      const snapshot = JSON.parse(await readFile(snapshotPath(userId, id), 'utf8'));
      return snapshot;
    },
    async create(userId, snapshot) {
      if (!safeId(userId)) throw new Error('Нет учётки.');
      const items = await readIndex(userId);
      if (items.length >= maxProjects) {
        throw new Error(`Можно хранить не больше ${maxProjects} проектов. Удалите один, чтобы создать новый.`);
      }
      const durationMs = projectDurationMs(snapshot.project);
      if (durationMs > maxDurationMs) {
        throw new Error(`Проект длиннее ${Math.max(1, Math.round(maxDurationMs / 60000))} мин. Сократите сценарий.`);
      }
      const id = `p${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const saved = {...snapshot, savedAt: new Date().toISOString()};
      await mkdir(userDir(userId), {recursive: true, mode: 0o700});
      await mkdir(mediaDir(id), {recursive: true});
      await writeFile(snapshotPath(userId, id), `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
      const meta = metaOf(id, saved);
      await writeIndex(userId, [...items, meta]);
      return {id, ...meta, snapshot: saved};
    },
    async save(userId, projectId, snapshot) {
      const id = safeId(projectId);
      if (!(await this.owns(userId, id))) throw new Error('Проект не найден.');
      const durationMs = projectDurationMs(snapshot.project);
      if (durationMs > maxDurationMs) {
        throw new Error(`Проект длиннее ${Math.max(1, Math.round(maxDurationMs / 60000))} мин. Сократите сценарий.`);
      }
      const saved = {...snapshot, savedAt: new Date().toISOString()};
      await writeFile(snapshotPath(userId, id), `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
      const items = await readIndex(userId);
      const meta = metaOf(id, saved);
      await writeIndex(userId, items.map((item) => item.id === id ? meta : item));
      return {id, ...meta};
    },
    async remove(userId, projectId) {
      const id = safeId(projectId);
      if (!(await this.owns(userId, id))) throw new Error('Проект не найден.');
      const items = await readIndex(userId);
      await writeIndex(userId, items.filter((item) => item.id !== id));
      await rm(snapshotPath(userId, id), {force: true});
      await rm(mediaDir(id), {recursive: true, force: true});
      return {ok: true, id};
    },
    mediaDirectory(projectId, kind, messageId) {
      const id = safeId(projectId);
      const folder = kind === 'uploads' ? 'uploads' : kind === 'renders' ? 'renders' : 'generated';
      const extra = messageId ? [folder, safeId(messageId)] : [folder];
      const directory = resolve(mediaDir(id), ...extra);
      if (!directory.startsWith(`${mediaDir(id)}/` ) && directory !== mediaDir(id)) {
        throw new Error('Некорректный путь медиа.');
      }
      return directory;
    },
    mediaUrl(projectId, relative) {
      return `workspace/${safeId(projectId)}/${relative.replace(/^\/+/, '')}`;
    },
    publicFile(projectId, parts) {
      const id = safeId(projectId);
      const relative = parts.map((part) => safeId(part)).filter(Boolean);
      const file = resolve(mediaDir(id), ...relative);
      const base = mediaDir(id);
      if (file !== base && !file.startsWith(`${base}/`)) return null;
      return existsSync(file) ? file : null;
    },
  };
};
