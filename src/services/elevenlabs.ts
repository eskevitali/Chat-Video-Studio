import type {CharacterAlignment} from './alignment';

export type ElevenLabsSpeechResponse = {
  audio_base64: string;
  alignment: CharacterAlignment | null;
  normalized_alignment: CharacterAlignment | null;
};

export type ElevenLabsRequest = {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId: string;
};

export const generateSpeechWithTimestamps = async (
  request: ElevenLabsRequest,
  fetchImplementation: typeof fetch = fetch,
): Promise<ElevenLabsSpeechResponse> => {
  if (!request.apiKey) throw new Error('ElevenLabs API key не настроен.');
  if (!request.voiceId) throw new Error('ElevenLabs voice ID не настроен.');
  if (!request.text.trim()) throw new Error('Нельзя сгенерировать пустую реплику.');

  const response = await fetchImplementation(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': request.apiKey,
      },
      body: JSON.stringify({text: request.text, model_id: request.modelId}),
    },
  );

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json() as {detail?: {message?: string} | string};
      detail = typeof body.detail === 'string' ? body.detail : body.detail?.message || detail;
    } catch {
      // Не включаем тело неизвестного ответа: оно может содержать чувствительные данные.
    }
    throw new Error(`ElevenLabs: ${detail}`);
  }

  const payload = await response.json() as ElevenLabsSpeechResponse;
  if (!payload.audio_base64 || !payload.alignment) {
    throw new Error('ElevenLabs не вернул аудио или исходные тайминги.');
  }
  return payload;
};
