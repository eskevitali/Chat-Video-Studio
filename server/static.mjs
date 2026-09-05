import {createReadStream, promises as fs} from 'node:fs';
import {extname, join, resolve} from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const parseRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (match[1] === '' && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  return {start, end: Math.min(end, size - 1)};
};

const safeJoin = (root, urlPath) => {
  const relative = urlPath.replace(/^\/+/, '');
  const candidate = resolve(root, relative);
  const base = resolve(root);
  if (candidate !== base && !candidate.startsWith(`${base}/`)) return null;
  return candidate;
};

export const sendFile = async (request, response, filePath) => {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) return false;

  const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  response.setHeader('Content-Type', mime);
  response.setHeader('Accept-Ranges', 'bytes');

  const range = parseRange(request.headers.range, stats.size);
  if (request.headers.range && !range) {
    response.statusCode = 416;
    response.setHeader('Content-Range', `bytes */${stats.size}`);
    response.end();
    return true;
  }

  if (range) {
    response.statusCode = 206;
    response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stats.size}`);
    response.setHeader('Content-Length', String(range.end - range.start + 1));
    createReadStream(filePath, {start: range.start, end: range.end}).pipe(response);
    return true;
  }

  response.statusCode = 200;
  response.setHeader('Content-Length', String(stats.size));
  createReadStream(filePath).pipe(response);
  return true;
};

export const serveStatic = async (request, response, roots) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  let urlPath = String(request.url || '/').split('?')[0];
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    return false;
  }
  if (urlPath.includes('\0') || urlPath.includes('\\')) return false;
  if (urlPath.endsWith('/')) urlPath = `${urlPath}index.html`;

  for (const root of roots) {
    const filePath = safeJoin(root, urlPath);
    if (!filePath) continue;
    try {
      if (await sendFile(request, response, filePath)) return true;
    } catch {
      // Пробуем следующий корень.
    }
  }
  return false;
};

export const sendHtml = async (request, response, filePath) => {
  response.setHeader('Cache-Control', 'no-store');
  return sendFile(request, response, filePath);
};

export const indexPath = (distDir) => join(distDir, 'index.html');
