import {randomBytes, timingSafeEqual} from 'node:crypto';

const COOKIE = 'vchat_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MEMBER_STATUSES = new Set(['PARTICIPANT', 'ACTIVE_MEMBER']);

export const parseCookies = (header) => {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[name] = part.slice(index + 1).trim();
    }
  }
  return cookies;
};

export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
};

export const displayNameFor = (user) => {
  const profile = user?.profile && typeof user.profile === 'object' ? user.profile : {};
  const chosen = String(profile.chosenName || '').trim();
  if (chosen) return chosen;
  const full = [profile.givenName, profile.familyName].map((value) => String(value || '').trim()).filter(Boolean).join(' ');
  if (full) return full;
  return String(user?.email || '').trim() || 'Участник';
};

export const isLokvitaMember = (user) => {
  if (!user || typeof user !== 'object') return false;
  if (user.isAdmin) return true;
  return MEMBER_STATUSES.has(String(user.membershipStatus || ''));
};

const clientAddress = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || 'unknown';
};

const cookieHeader = (token, {secure, maxAge}) => {
  const parts = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
};

export const createAuth = (environment = {}, fetchImplementation = fetch) => {
  const apiRoot = String(environment.LOKVITA_API_URL || '').trim().replace(/\/$/, '');
  const enabled = Boolean(apiRoot);
  const secure = String(environment.PUBLIC_ORIGIN || '').startsWith('https://');
  const sessions = new Map();
  const failures = new Map();

  const prune = () => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    for (const [address, record] of failures) {
      if (record.resetAt <= now) failures.delete(address);
    }
  };

  const sessionOf = (request) => {
    prune();
    const token = parseCookies(request.headers.cookie)[COOKIE];
    if (!token) return null;
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  };

  const locked = (address) => {
    const record = failures.get(address);
    if (!record) return false;
    if (record.resetAt <= Date.now()) {
      failures.delete(address);
      return false;
    }
    return record.count >= MAX_FAILURES;
  };

  const rememberFailure = (address) => {
    const now = Date.now();
    const record = failures.get(address);
    if (!record || record.resetAt <= now) {
      failures.set(address, {count: 1, resetAt: now + FAILURE_WINDOW_MS});
      return;
    }
    record.count += 1;
  };

  const login = async (email, password, address) => {
    if (!enabled) return {ok: true, username: 'local', token: null};
    if (locked(address)) return {ok: false, error: 'Слишком много попыток. Подождите несколько минут.'};

    const trimmedEmail = String(email || '').trim();
    if (!trimmedEmail.includes('@') || !password) {
      rememberFailure(address);
      return {ok: false, error: 'Укажите email и пароль участника Lokvita.'};
    }

    let upstream;
    try {
      upstream = await fetchImplementation(`${apiRoot}/api/auth/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({email: trimmedEmail, password}),
      });
    } catch {
      return {ok: false, error: 'Кабинет Lokvita сейчас недоступен. Попробуйте позже.'};
    }

    let payload = {};
    try {
      payload = await upstream.json();
    } catch {
      payload = {};
    }

    if (!upstream.ok) {
      rememberFailure(address);
      const detail = typeof payload.message === 'string' ? payload.message : payload.error;
      return {ok: false, error: detail || 'Неверный email или пароль.'};
    }

    const user = payload.user;
    if (!isLokvitaMember(user)) {
      rememberFailure(address);
      return {ok: false, error: 'VChat доступен участникам Lokvita.'};
    }

    failures.delete(address);
    const token = randomBytes(32).toString('hex');
    const session = {
      username: displayNameFor(user),
      email: String(user.email || trimmedEmail),
      membershipStatus: String(user.membershipStatus || ''),
      token,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessions.set(token, session);
    return {ok: true, username: session.username, token, membershipStatus: session.membershipStatus};
  };

  return {
    enabled,
    sessionOf,
    clientAddress,
    attachSessionCookie(response, token) {
      if (!token) return;
      response.setHeader('Set-Cookie', cookieHeader(token, {
        secure,
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      }));
    },
    clearSessionCookie(response) {
      response.setHeader('Set-Cookie', cookieHeader('', {secure, maxAge: 0}));
    },
    logout(request) {
      const token = parseCookies(request.headers.cookie)[COOKIE];
      if (token) sessions.delete(token);
    },
    login,
  };
};
