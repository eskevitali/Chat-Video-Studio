#!/usr/bin/env python3
"""Register vchat.lokvita.org in Nginx Proxy Manager (KIDer)."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB = Path("/data/database.sqlite")
CONF_DIR = Path("/data/nginx/proxy_host")
DOMAIN = "vchat.lokvita.org"
FORWARD_HOST = "vchat"
FORWARD_PORT = 4173
ADVANCED = "client_max_body_size 12m;\nproxy_read_timeout 300s;\nproxy_send_timeout 300s;\n"


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def http_conf(host_id: int) -> str:
    return f"""# ------------------------------------------------------------
# {DOMAIN}
# ------------------------------------------------------------


server {{
  set $forward_scheme http;
  set $server         "{FORWARD_HOST}";
  set $port           {FORWARD_PORT};

  listen 80;
  listen [::]:80;

  server_name {DOMAIN};

  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/block-exploits.conf;

  client_max_body_size 12m;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  access_log /data/logs/proxy-host-{host_id}_access.log proxy;
  error_log /data/logs/proxy-host-{host_id}_error.log warn;

  location / {{
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_http_version 1.1;
    include conf.d/include/proxy.conf;
  }}

  include /data/nginx/custom/server_proxy[.]conf;
}}
"""


def ssl_conf(host_id: int, cert_id: int) -> str:
    return f"""# ------------------------------------------------------------
# {DOMAIN}
# ------------------------------------------------------------


map $scheme $hsts_header {{
    https   "max-age=63072000; preload";
}}

server {{
  set $forward_scheme http;
  set $server         "{FORWARD_HOST}";
  set $port           {FORWARD_PORT};

  listen 80;
  listen [::]:80;

  listen 443 ssl;
  listen [::]:443 ssl;

  server_name {DOMAIN};
  http2 on;

  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/ssl-cache.conf;
  include conf.d/include/ssl-ciphers.conf;
  ssl_certificate /etc/letsencrypt/live/npm-{cert_id}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/npm-{cert_id}/privkey.pem;

  include conf.d/include/block-exploits.conf;
  include conf.d/include/force-ssl.conf;

  client_max_body_size 12m;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $http_connection;
  proxy_http_version 1.1;

  access_log /data/logs/proxy-host-{host_id}_access.log proxy;
  error_log /data/logs/proxy-host-{host_id}_error.log warn;

  location / {{
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_http_version 1.1;
    include conf.d/include/proxy.conf;
  }}

  include /data/nginx/custom/server_proxy[.]conf;
}}
"""


def main() -> None:
    import sys

    mode = sys.argv[1] if len(sys.argv) > 1 else "http"
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id, certificate_id FROM proxy_host WHERE domain_names = ? AND is_deleted = 0",
        (f'["{DOMAIN}"]',),
    ).fetchone()

    now = utcnow()
    if existing:
        host_id = int(existing["id"])
        cur.execute(
            """UPDATE proxy_host SET modified_on=?, forward_host=?, forward_port=?,
               forward_scheme='http', enabled=1, ssl_forced=?, advanced_config=?,
               allow_websocket_upgrade=1, block_exploits=1, http2_support=1,
               meta='{"nginx_online":true,"nginx_err":null}'
               WHERE id=?""",
            (now, FORWARD_HOST, FORWARD_PORT, 1 if mode == "ssl" else 0, ADVANCED, host_id),
        )
    else:
        cur.execute(
            """INSERT INTO proxy_host (
                 created_on, modified_on, owner_user_id, is_deleted, domain_names,
                 forward_host, forward_port, access_list_id, certificate_id, ssl_forced,
                 caching_enabled, block_exploits, advanced_config, meta,
                 allow_websocket_upgrade, http2_support, forward_scheme, enabled,
                 locations, hsts_enabled, hsts_subdomains
               ) VALUES (?, ?, 1, 0, ?, ?, ?, 0, 0, 0, 0, 1, ?,
                 '{"nginx_online":true,"nginx_err":null}', 1, 1, 'http', 1, '[]', 0, 0)""",
            (now, now, f'["{DOMAIN}"]', FORWARD_HOST, FORWARD_PORT, ADVANCED),
        )
        host_id = int(cur.lastrowid)

    cert_id = 0
    if mode == "ssl":
        cert = cur.execute(
            "SELECT id FROM certificate WHERE domain_names = ? AND is_deleted = 0",
            (f'["{DOMAIN}"]',),
        ).fetchone()
        if cert:
            cert_id = int(cert["id"])
        else:
            cur.execute(
                """INSERT INTO certificate (
                     created_on, modified_on, owner_user_id, is_deleted, provider,
                     nice_name, domain_names, expires_on, meta
                   ) VALUES (?, ?, 1, 0, 'letsencrypt', ?, ?, datetime('now', '+90 days'),
                     '{"nginx_online":true,"nginx_err":null}')""",
                (now, now, DOMAIN, f'["{DOMAIN}"]'),
            )
            cert_id = int(cur.lastrowid)
        cur.execute(
            "UPDATE proxy_host SET certificate_id=?, ssl_forced=1, http2_support=1 WHERE id=?",
            (cert_id, host_id),
        )

    conn.commit()
    CONF_DIR.mkdir(parents=True, exist_ok=True)
    conf = ssl_conf(host_id, cert_id) if mode == "ssl" else http_conf(host_id)
    (CONF_DIR / f"{host_id}.conf").write_text(conf, encoding="utf-8")
    print(f"host_id={host_id}")
    print(f"cert_id={cert_id}")
    print(f"mode={mode}")


if __name__ == "__main__":
    main()
