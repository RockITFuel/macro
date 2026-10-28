import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchWithToken } from '@core/util/fetchWithToken';

/** A rejected request that has not reached Whisper and can safely be retried. */
export class DictationCapacityError extends Error {
  readonly code = 'DICTATION_CAPACITY';

  constructor(readonly retryAfterMs: number) {
    super('Dictation is busy. Please try again shortly.');
    this.name = 'DictationCapacityError';
  }
}

export function transcribeDictation(
  audio: Blob,
  language: string,
  signal: AbortSignal
) {
  const hint = language.split('-')[0].toLowerCase();
  const query = /^[a-z]{2}$/.test(hint)
    ? `?language=${encodeURIComponent(hint)}`
    : '';
  return fetchWithToken<
    { text: string },
    'DICTATION_CAPACITY' | 'DICTATION_RATE_LIMITED' | 'DICTATION_DISABLED'
  >(
    `${SERVER_HOSTS['document-storage-service']}/dictation/transcribe${query}`,
    {
      method: 'POST',
      body: audio,
      signal,
      headers: { 'Content-Type': audio.type },
      retry: { maxTries: 1 },
      errorResponseHandler: async (response) => {
        const retryAfter = response.headers.get('Retry-After');
        // DSS sends delay-seconds only for capacity rejections, before Whisper.
        if (response.status === 503 && retryAfter && /^\d+$/.test(retryAfter)) {
          return new DictationCapacityError(Number(retryAfter) * 1_000);
        }
        // Signed-in users get 403 only when their team turned transcription off.
        if (response.status === 403) {
          return {
            code: 'DICTATION_DISABLED',
            message:
              'Dictation is turned off for your team. A team owner or admin can turn it on in Settings › Team › Transcription.',
          };
        }
        if (response.status === 429) {
          return {
            code: 'DICTATION_RATE_LIMITED',
            message: 'Dictation limit reached. Please try again later.',
          };
        }
        return {
          code: 'HTTP_ERROR',
          message:
            'Transcription failed. Select the checkmark to retry, or cancel.',
        };
      },
    }
  );
}
