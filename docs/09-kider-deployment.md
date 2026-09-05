# Деплой VChat на KIDer

Целевой URL: `https://vchat.lokvita.org`  
Сервер: `ssh kider` (`jestex@KIDer`, `49.13.23.4`)  
Каталог: `/home/jestex/vchat`  
Контейнер: `vchat` в сети `nginx_default`

## Что не трогать

- compose `lokvita` / `lokvita-sandbox`
- `kiderstudio-control-*`, n8n, Eggent, Ollama
- живые proxy host 1–6 в NPM

## Состав

| Файл в репе | Назначение |
|---|---|
| `Dockerfile` | Node 20, Chromium, сборка SPA, `node server/index.mjs` |
| `docker-compose.yml` | сервис `vchat`, тома медиа, `shm_size`, лимит RAM |
| `.dockerignore` | без `node_modules`, `.venv-xtts`, локальных дублей |

Переменные контейнера (не секреты ElevenLabs):

```dotenv
PUBLIC_ORIGIN=https://vchat.lokvita.org
PORT=4173
CHROME_PATH=/usr/bin/chromium
CHROME_NO_SANDBOX=1
RENDER_CONCURRENCY=1
```

## Процедура

На кабине:

```bash
cd /home/violes/GPT_Project/chat-video-studio
pnpm test && pnpm build
git push origin main
```

На KIDer:

```bash
ssh kider
git clone https://github.com/eskevitali/Chat-Video-Studio.git /home/jestex/vchat
# или: git -C /home/jestex/vchat pull --ff-only
cd /home/jestex/vchat
docker compose up -d --build
docker compose ps
curl -sS http://127.0.0.1:4173/api/health
# если порт на хост не публикуется — curl из сети nginx:
docker exec nginx_proxy_manager wget -qO- http://vchat:4173/api/health
```

NPM (после того как контейнер отвечает):

1. HTTP proxy `vchat.lokvita.org` → `vchat:4173`.
2. ACME: certbot `npm-7` на этот hostname.
3. Включить SSL + force SSL, как у `sandbox.lokvita.org`.
4. `client_max_body_size 12m;` и `proxy_read_timeout 300s;` в server/location.

DNS A `vchat.lokvita.org` уже указывает на `49.13.23.4` (World4You).

## Проверка

```bash
curl -sSI https://vchat.lokvita.org/api/health
# с телефона: открыть сайт, настройки, импорт, одна озвучка, короткий MP4
```

Логи: `docker logs -f vchat`  
Рендер тяжёлый: не запускать параллельно с другими тяжёлыми задачами студии.

## Откат

```bash
cd /home/jestex/vchat
docker compose down
# тома generated/uploads/renders сохраняются, пока не docker volume rm
```

Proxy host в NPM можно выключить (`enabled=0`), не удаляя соседние хосты.
