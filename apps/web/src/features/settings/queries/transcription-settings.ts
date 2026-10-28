/**
 * Team transcription settings (Settings › Team › Transcription), served by
 * GET/PUT `/transcription/settings` on the document storage service. Owners
 * and admins only; every value a team has not set (`null` in `stored`)
 * follows the server env, and secrets are only reported as set or not set.
 */

import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchWithToken } from '@core/util/fetchWithToken';
import { throwOnErr } from '@core/util/result';
import { dssFetch } from '@service-storage/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

export type SttProvider = 'local' | 'cloud';
export type SttModel = 'parakeet' | 'whisper';

export type EffectiveTranscriptionSettings = {
  enabled: boolean;
  provider: SttProvider;
  hubUrl: string | null;
  model: SttModel;
  language: string | null;
};

export type TranscriptionSettings = {
  stored: {
    enabled: boolean | null;
    provider: SttProvider | null;
    hubUrl: string | null;
    model: SttModel | null;
    language: string | null;
    updatedBy: string | null;
    updatedAt: string | null;
  };
  effective: EffectiveTranscriptionSettings;
  env: {
    hubApiKeySet: boolean;
    openaiApiKeySet: boolean;
    callAgentConfigured: boolean;
    allowedHubHosts: string[];
    defaults: EffectiveTranscriptionSettings;
  };
};

/** Omitted fields keep their value; `null` returns one to the server default. */
export type TranscriptionSettingsPatch = Partial<{
  enabled: boolean | null;
  provider: SttProvider | null;
  hubUrl: string | null;
  model: SttModel | null;
  language: string | null;
}>;

const QUERY_KEY = ['transcription', 'settings'] as const;

/** Keep the server's validation message ("Hub host … is not allowed"). */
async function serverMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return {
    code: 'HTTP_ERROR' as const,
    message: body?.message ?? `HTTP error! status: ${response.status}`,
  };
}

export function useTranscriptionSettings(enabled: Accessor<boolean>) {
  return useQuery(() => ({
    queryKey: QUERY_KEY,
    enabled: enabled(),
    queryFn: () =>
      throwOnErr(() =>
        dssFetch<TranscriptionSettings>('/transcription/settings', {
          method: 'GET',
        })
      ),
  }));
}

export function useUpdateTranscriptionSettings() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    // One write at a time, so each patch applies on top of the last.
    scope: { id: 'transcription-settings' },
    mutationFn: (patch: TranscriptionSettingsPatch) =>
      throwOnErr(() =>
        fetchWithToken<TranscriptionSettings>(
          `${SERVER_HOSTS['document-storage-service']}/transcription/settings`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
            errorResponseHandler: serverMessage,
          }
        )
      ),
    onSuccess: (settings) => queryClient.setQueryData(QUERY_KEY, settings),
  }));
}
