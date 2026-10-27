/**
 * Open-source mic noise suppression for browser calls.
 *
 * Replaces LiveKit Cloud's Krisp filter, which only works against LiveKit
 * Cloud. RNNoise (xiph/rnnoise, BSD) runs as WASM inside an AudioWorklet via
 * @sapphi-red/web-noise-suppressor (MIT), so it works against any LiveKit
 * server, including self-hosted ones.
 *
 * RNNoise processes 48 kHz frames, so the filter owns a 48 kHz AudioContext
 * rather than borrowing LiveKit's, whose rate follows the output device.
 */
import {
  loadRnnoise,
  RnnoiseWorkletNode,
} from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from 'livekit-client';

const SAMPLE_RATE = 48_000;

let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;

function loadWasmBinary(): Promise<ArrayBuffer> {
  wasmBinaryPromise ??= loadRnnoise({
    url: rnnoiseWasmUrl,
    simdUrl: rnnoiseSimdWasmUrl,
  }).catch((error: unknown) => {
    // A transient fetch failure must not poison later attempts.
    wasmBinaryPromise = null;
    throw error;
  });
  return wasmBinaryPromise;
}

export function isRnnoiseNoiseFilterSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof WebAssembly !== 'undefined'
  );
}

export type RnnoiseNoiseFilterProcessor = TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> & {
  setEnabled(enabled: boolean): Promise<void>;
  isEnabled(): boolean;
};

type Graph = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  rnnoise: RnnoiseWorkletNode;
  destination: MediaStreamAudioDestinationNode;
};

export function RnnoiseNoiseFilter(): RnnoiseNoiseFilterProcessor {
  let graph: Graph | null = null;
  let enabled = true;

  function wire(g: Graph) {
    g.source.disconnect();
    g.rnnoise.disconnect();
    if (enabled) {
      g.source.connect(g.rnnoise);
      g.rnnoise.connect(g.destination);
    } else {
      g.source.connect(g.destination);
    }
  }

  async function teardown() {
    const g = graph;
    graph = null;
    processor.processedTrack = undefined;
    if (!g) return;
    g.source.disconnect();
    g.rnnoise.disconnect();
    g.rnnoise.destroy();
    for (const track of g.destination.stream.getTracks()) track.stop();
    await g.context.close().catch(() => {});
  }

  async function build(track: MediaStreamTrack) {
    const wasmBinary = await loadWasmBinary();
    const context = new AudioContext({
      sampleRate: SAMPLE_RATE,
      latencyHint: 'interactive',
    });
    try {
      await context.audioWorklet.addModule(rnnoiseWorkletUrl);
      const g: Graph = {
        context,
        source: context.createMediaStreamSource(new MediaStream([track])),
        rnnoise: new RnnoiseWorkletNode(context, {
          wasmBinary,
          maxChannels: 1,
        }),
        destination: context.createMediaStreamDestination(),
      };
      wire(g);
      // Calls start from a user gesture, but the context can still be
      // created suspended (e.g. autoplay policy after a reconnect).
      if (context.state === 'suspended') await context.resume();
      graph = g;
      processor.processedTrack = g.destination.stream.getAudioTracks()[0];
    } catch (error) {
      await context.close().catch(() => {});
      throw error;
    }
  }

  const processor: RnnoiseNoiseFilterProcessor = {
    name: 'rnnoise-noise-filter',
    processedTrack: undefined,
    async init(opts) {
      await teardown();
      await build(opts.track);
    },
    async restart(opts) {
      await teardown();
      await build(opts.track);
    },
    async destroy() {
      await teardown();
    },
    async setEnabled(value) {
      enabled = value;
      if (graph) wire(graph);
    },
    isEnabled() {
      return enabled;
    },
  };

  return processor;
}
