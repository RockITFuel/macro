import { toast } from '@core/component/Toast/Toast';
import type { Team as TeamSummary } from '@service-auth/generated/schemas/team';
import { Button, Tabs, ToggleSwitch } from '@ui';
import {
  createEffect,
  createSignal,
  For,
  type JSX,
  Match,
  Show,
  Switch,
} from 'solid-js';
import { SettingsSelect } from './components/settings-select';
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from './primitives';
import {
  type SttModel,
  type SttProvider,
  type TranscriptionSettings,
  type TranscriptionSettingsPatch,
  useTranscriptionSettings,
  useUpdateTranscriptionSettings,
} from './queries/transcription-settings';
import { useTeamViewer } from './Team';

const PROVIDER_OPTIONS: { value: SttProvider; label: string }[] = [
  { value: 'local', label: 'Local hub' },
  { value: 'cloud', label: 'OpenAI' },
];

const MODEL_OPTIONS: { id: SttModel; name: string }[] = [
  { id: 'parakeet', name: 'Parakeet (every worker)' },
  { id: 'whisper', name: 'Whisper (faster-whisper workers only)' },
];

const AUTO_LANGUAGE = 'auto';
const LANGUAGE_OPTIONS = [
  { id: AUTO_LANGUAGE, name: 'Automatic' },
  { id: 'nl', name: 'Dutch' },
  { id: 'en', name: 'English' },
  { id: 'de', name: 'German' },
  { id: 'fr', name: 'French' },
  { id: 'es', name: 'Spanish' },
];

/** Team › Transcription: speech-to-text for the team's calls and dictation. */
export function TeamTranscription(props: { team: TeamSummary }) {
  const { isAdminOrOwner, teamQuery } = useTeamViewer(() => props.team);
  const settings = useTranscriptionSettings(isAdminOrOwner);

  return (
    <SettingsPage
      title="Transcription"
      description="How your team's calls and dictation are turned into text."
    >
      <Switch>
        <Match when={teamQuery.isLoading}>
          <span class="text-xs text-ink-muted">Loading…</span>
        </Match>
        <Match when={!isAdminOrOwner()}>
          <SettingsSection>
            <SettingsCard>
              <p class="px-4 py-3 text-sm text-ink-muted">
                Only team owners and admins can see and change transcription
                settings.
              </p>
            </SettingsCard>
          </SettingsSection>
        </Match>
        <Match when={settings.isError}>
          <SettingsSection>
            <SettingsCard>
              <p class="px-4 py-3 text-sm text-ink-muted">
                Transcription settings could not be loaded.
              </p>
            </SettingsCard>
          </SettingsSection>
        </Match>
        <Match when={settings.data} keyed>
          {(data) => <TranscriptionForm settings={data} />}
        </Match>
      </Switch>
    </SettingsPage>
  );
}

function ServerDefault(props: { children: JSX.Element }) {
  return <span class="text-ink-muted"> Server default: {props.children}.</span>;
}

function TranscriptionForm(props: { settings: TranscriptionSettings }) {
  const update = useUpdateTranscriptionSettings();
  const effective = () => props.settings.effective;
  const env = () => props.settings.env;
  const stored = () => props.settings.stored;

  const save = (patch: TranscriptionSettingsPatch) => {
    if (update.isPending) return;
    update.mutate(patch, {
      onError: (error) => toast.failure(error.message),
    });
  };

  const [hubUrl, setHubUrl] = createSignal('');
  createEffect(() => setHubUrl(stored().hubUrl ?? ''));
  const hubUrlChanged = () => hubUrl().trim() !== (stored().hubUrl ?? '');
  const saveHubUrl = () => {
    if (!hubUrlChanged()) return;
    save({ hubUrl: hubUrl().trim() === '' ? null : hubUrl().trim() });
  };

  const languageName = (code: string | null) =>
    LANGUAGE_OPTIONS.find((option) => option.id === (code ?? AUTO_LANGUAGE))
      ?.name ?? code;

  return (
    <>
      <SettingsSection title="Transcription">
        <SettingsCard>
          <SettingsRow
            label="Transcribe calls and dictation"
            description={
              <>
                Off: calls get no transcript and dictation is unavailable for
                everyone on the team.
                <Show when={!env().callAgentConfigured}>
                  {' '}
                  Calls are not transcribed on this server
                  (LIVEKIT_TRANSCRIPTION_AGENT_NAME is not set).
                </Show>
              </>
            }
          >
            <ToggleSwitch
              size="md"
              checked={effective().enabled}
              disabled={update.isPending}
              onChange={(enabled) => save({ enabled })}
            />
          </SettingsRow>
          <SettingsRow
            label="Dictation provider"
            description={
              <>
                Local hub keeps audio on your own machines (Parakeet workers).
                OpenAI uses Whisper in the cloud. Calls always use the call
                transcription agent.
                <ServerDefault>
                  {env().defaults.provider === 'local' ? 'local hub' : 'OpenAI'}
                </ServerDefault>
              </>
            }
            stackOnNarrow
          >
            <Tabs
              touch="segmented"
              aria-label="Dictation provider"
              size="sm"
              value={effective().provider}
              options={PROVIDER_OPTIONS.map((option) => ({
                ...option,
                disabled:
                  update.isPending ||
                  (option.value === 'local' && !env().hubApiKeySet) ||
                  (option.value === 'cloud' && !env().openaiApiKeySet),
              }))}
              onChange={(provider: SttProvider) => save({ provider })}
            />
          </SettingsRow>
          <SettingsRow
            label="Dictation language"
            description={
              <>
                Used when the browser does not say which language is spoken.
                Parakeet recognises Dutch and English on its own.
              </>
            }
            stackOnNarrow
          >
            <SettingsSelect
              label="Dictation language"
              class="w-48"
              options={LANGUAGE_OPTIONS}
              value={effective().language ?? AUTO_LANGUAGE}
              disabled={update.isPending}
              onChange={(id) =>
                save({ language: id === AUTO_LANGUAGE ? null : id })
              }
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <Show when={effective().provider === 'local'}>
        <SettingsSection title="Local hub">
          <SettingsCard>
            <SettingsRow
              label="Hub URL"
              description={
                <>
                  OpenAI-compatible API of the speech-to-text hub. Allowed
                  hosts: {env().allowedHubHosts.join(', ') || 'none'}.
                  <Show when={env().defaults.hubUrl}>
                    {(url) => <ServerDefault>{url()}</ServerDefault>}
                  </Show>
                </>
              }
              stackOnNarrow
            >
              <div class="flex w-full min-w-0 items-center gap-2 @[460px]/settings-page:w-80">
                <input
                  type="url"
                  class="settings-input min-w-0 flex-1"
                  aria-label="Hub URL"
                  placeholder={
                    env().defaults.hubUrl ?? 'http://macro-stt-hub:8790/v1'
                  }
                  value={hubUrl()}
                  onInput={(e) => setHubUrl(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveHubUrl()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hubUrlChanged() || update.isPending}
                  onClick={saveHubUrl}
                >
                  Save
                </Button>
              </div>
            </SettingsRow>
            <SettingsRow
              label="Model"
              description="Model the hub routes dictation to."
              stackOnNarrow
            >
              <SettingsSelect
                label="Model"
                class="w-64"
                options={MODEL_OPTIONS}
                value={effective().model}
                disabled={update.isPending}
                onChange={(id) => save({ model: id as SttModel })}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      </Show>

      <SettingsSection
        title="Server"
        description="Secrets and the call agent are set in the server environment, not here."
      >
        <SettingsCard>
          <For
            each={[
              {
                label: 'Hub token (DICTATION_STT_API_KEY)',
                ok: env().hubApiKeySet,
                yes: 'Set',
                no: 'Not set',
              },
              {
                label: 'OpenAI key (OPENAI_API_KEY)',
                ok: env().openaiApiKeySet,
                yes: 'Set',
                no: 'Not set',
              },
              {
                label: 'Call transcription agent',
                ok: env().callAgentConfigured,
                yes: 'Configured',
                no: 'Not configured',
              },
            ]}
          >
            {(row) => (
              <SettingsRow label={row.label}>
                <span
                  class="text-sm"
                  classList={{
                    'text-ink': row.ok,
                    'text-ink-muted': !row.ok,
                  }}
                >
                  {row.ok ? row.yes : row.no}
                </span>
              </SettingsRow>
            )}
          </For>
          <Show when={stored().updatedAt}>
            {(updatedAt) => (
              <p class="px-4 pb-3 text-xs text-ink-muted">
                Last changed {new Date(updatedAt()).toLocaleString()}
                {stored().updatedBy
                  ? ` by ${stored().updatedBy?.replace(/^macro\|/, '')}`
                  : ''}
                . Language: {languageName(effective().language)}.
              </p>
            )}
          </Show>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
