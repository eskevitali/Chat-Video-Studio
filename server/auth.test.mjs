import {describe, expect, it} from 'vitest';
import {createAuth, displayNameFor, isLokvitaMember, parseCookies, safeEqual} from './auth.mjs';

const member = {
  id: '11111111-2222-3333-4444-555555555555',
  email: 'a@lokvita.org',
  membershipStatus: 'PARTICIPANT',
  isAdmin: false,
  profile: {givenName: 'Анна', familyName: 'Коваль', chosenName: ''},
};

describe('auth helpers', () => {
  it('читает cookie и сравнивает секреты', () => {
    expect(parseCookies('vchat_session=abc; other=1')).toEqual({vchat_session: 'abc', other: '1'});
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secret', 'wrong')).toBe(false);
  });

  it('пускает участника и члена, отклоняет бывшего', () => {
    expect(isLokvitaMember(member)).toBe(true);
    expect(isLokvitaMember({...member, membershipStatus: 'ACTIVE_MEMBER'})).toBe(true);
    expect(isLokvitaMember({...member, membershipStatus: 'FORMER_MEMBER'})).toBe(false);
    expect(isLokvitaMember({...member, isAdmin: true, membershipStatus: 'FORMER_MEMBER'})).toBe(true);
    expect(displayNameFor(member)).toBe('Анна Коваль');
  });

  it('создаёт сессию после успешного входа в кабинет Lokvita', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({user: member, sessionToken: 'lokvita-secret'}),
    });
    const auth = createAuth({LOKVITA_API_URL: 'http://lokvita-gateway:8080'}, fetchImpl);
    const result = await auth.login('a@lokvita.org', 'long-password', '10.0.0.1');
    expect(result.ok).toBe(true);
    expect(result.username).toBe('Анна Коваль');
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('не пускает, если кабинет отклонил пароль или статус не участник', async () => {
    const denied = createAuth({LOKVITA_API_URL: 'http://lokvita-gateway:8080'}, async () => ({
      ok: false,
      json: async () => ({message: 'Неверный email или пароль', statusCode: 401}),
    }));
    await expect(denied.login('a@lokvita.org', 'nope', '10.0.0.2')).resolves.toMatchObject({ok: false});

    const former = createAuth({LOKVITA_API_URL: 'http://lokvita-gateway:8080'}, async () => ({
      ok: true,
      json: async () => ({user: {...member, membershipStatus: 'FORMER_MEMBER'}}),
    }));
    const blocked = await former.login('a@lokvita.org', 'long-password', '10.0.0.3');
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/участникам/);
  });
});
