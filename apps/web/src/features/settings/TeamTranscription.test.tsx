/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptionSettings } from './queries/transcription-settings';
import { TeamTranscription } from './TeamTranscription';

const state = vi.hoisted(() => ({
  admin: true,
  data: undefined as TranscriptionSettings | undefined,
  queryEnabled: [] as boolean[],
  mutate: vi.fn(),
}));

vi.mock('@core/component/Toast/Toast', () => ({
  toast: { success: vi.fn(), failure: vi.fn() },
}));
vi.mock('./Team', () => ({
  useTeamViewer: () => ({
    isAdminOrOwner: () => state.admin,
    teamQuery: { isLoading: false },
  }),
}));
vi.mock('./queries/transcription-settings', () => ({
  useTranscriptionSettings: (enabled: () => boolean) => {
    state.queryEnabled.push(enabled());
    return {
      isError: false,
      get data() {
        return state.data;
      },
    };
  },
  useUpdateTranscriptionSettings: () => ({
    isPending: false,
    mutate: state.mutate,
  }),
}));

const defaults = {
  enabled: true,
  provider: 'local' as const,
  hubUrl: 'http://macro-stt-hub:8790/v1',
  model: 'parakeet' as const,
  language: null,
};

function settings(): TranscriptionSettings {
  return {
    stored: {
      enabled: null,
      provider: null,
      hubUrl: null,
      model: null,
      language: null,
      updatedBy: null,
      updatedAt: null,
    },
    effective: defaults,
    env: {
      hubApiKeySet: true,
      openaiApiKeySet: false,
      callAgentConfigured: true,
      allowedHubHosts: ['macro-stt-hub'],
      defaults,
    },
  };
}

const team = { id: 'team-1', name: 'D2D', owner_id: 'macro|owner@d2d.cloud' };

beforeEach(() => {
  state.admin = true;
  state.data = settings();
  state.queryEnabled = [];
  state.mutate.mockReset();
});
afterEach(cleanup);

describe('TeamTranscription', () => {
  it('never loads the settings for members and says who can change them', () => {
    state.admin = false;
    render(() => <TeamTranscription team={team as never} />);
    expect(state.queryEnabled).toEqual([false]);
    expect(screen.getByText(/Only team owners and admins/)).toBeTruthy();
    expect(screen.queryByText('Hub URL')).toBeNull();
  });

  it('shows secrets only as set or not set', () => {
    render(() => <TeamTranscription team={team as never} />);
    expect(screen.getByText('Hub token (DICTATION_STT_API_KEY)')).toBeTruthy();
    expect(screen.getByText('Set')).toBeTruthy();
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByText('Configured')).toBeTruthy();
  });

  it('saves a new hub URL and clears it back to the server default', () => {
    render(() => <TeamTranscription team={team as never} />);
    const input = screen.getByLabelText('Hub URL') as HTMLInputElement;
    expect(input.placeholder).toBe('http://macro-stt-hub:8790/v1');

    fireEvent.input(input, {
      target: { value: ' http://macro-stt-hub:9000/v1 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.mutate).toHaveBeenLastCalledWith(
      { hubUrl: 'http://macro-stt-hub:9000/v1' },
      expect.anything()
    );
  });

  it('turns transcription off for the team', () => {
    render(() => <TeamTranscription team={team as never} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(state.mutate).toHaveBeenLastCalledWith(
      { enabled: false },
      expect.anything()
    );
  });

  it('hides the hub section when dictation uses OpenAI', () => {
    state.data = {
      ...settings(),
      effective: { ...defaults, provider: 'cloud' },
    };
    render(() => <TeamTranscription team={team as never} />);
    expect(screen.queryByLabelText('Hub URL')).toBeNull();
  });
});
