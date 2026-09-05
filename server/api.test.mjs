import {describe, expect, it} from 'vitest';
import {allowedOrigins, isAllowedOrigin, sanitizeApiKey, sanitizeVoiceId} from './api.mjs';

describe('studio API guards', () => {
  it('разрешает loopback и PUBLIC_ORIGIN', () => {
    const environment = {PUBLIC_ORIGIN: 'https://vchat.lokvita.org'};
    expect(isAllowedOrigin(undefined, environment)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4173', environment)).toBe(true);
    expect(isAllowedOrigin('https://vchat.lokvita.org', environment)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', environment)).toBe(false);
    expect(allowedOrigins(environment).has('https://vchat.lokvita.org')).toBe(true);
  });

  it('санитизирует ключ и Voice ID', () => {
    expect(sanitizeApiKey('  sk_abc  ')).toBe('sk_abc');
    expect(sanitizeApiKey('a'.repeat(300))).toBe('');
    expect(sanitizeVoiceId('21m00Tcm4TlvDq8ikWAM')).toBe('21m00Tcm4TlvDq8ikWAM');
    expect(sanitizeVoiceId('../etc')).toBe('');
  });
});
