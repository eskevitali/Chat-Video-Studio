import {describe, expect, it, vi} from 'vitest';
import {generateSpeechWithTimestamps} from './elevenlabs';

describe('generateSpeechWithTimestamps', () => {
  it('не отправляет запрос без ключа', async () => {
    const mockedFetch = vi.fn();
    await expect(generateSpeechWithTimestamps({apiKey: '', voiceId: 'voice', text: 'Тест', modelId: 'model'}, mockedFetch))
      .rejects.toThrow(/API key/);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('передаёт ключ только в заголовке', async () => {
    const mockedFetch = vi.fn(async () => new Response(JSON.stringify({
      audio_base64: 'YXVkaW8=',
      alignment: {
        characters: ['Т'],
        character_start_times_seconds: [0],
        character_end_times_seconds: [.1],
      },
      normalized_alignment: null,
    }), {status: 200, headers: {'Content-Type': 'application/json'}}));

    await generateSpeechWithTimestamps({apiKey: 'secret', voiceId: 'voice', text: 'Т', modelId: 'model'}, mockedFetch);
    const [url, options] = mockedFetch.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit | undefined];
    expect(String(url)).not.toContain('secret');
    expect((options?.headers as Record<string, string>)['xi-api-key']).toBe('secret');
  });
});
