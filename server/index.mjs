import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {createStudioApi} from './api.mjs';
import {indexPath, sendHtml, serveStatic} from './static.mjs';

const projectRoot = resolve(process.cwd());
const distDir = resolve(projectRoot, 'dist');
const publicDir = resolve(projectRoot, 'public');
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '0.0.0.0';

const handleApi = createStudioApi({
  environment: process.env,
  projectRoot,
});

const server = createServer(async (request, response) => {
  try {
    if (await handleApi(request, response)) return;
    if (await serveStatic(request, response, [distDir, publicDir])) return;

    const accept = String(request.headers.accept || '');
    if (request.method === 'GET' && accept.includes('text/html')) {
      if (await sendHtml(request, response, indexPath(distDir))) return;
    }

    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end('Not found');
  } catch {
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Internal error');
    } else {
      response.end();
    }
  }
});

server.listen(port, host, () => {
  process.stdout.write(`VChat listening on http://${host}:${port}\n`);
});
