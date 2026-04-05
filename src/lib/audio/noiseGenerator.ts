/**
 * Ambient sound player.
 * Uses high-quality looping audio files from free CDN sources.
 * Falls back to Web Audio API synthesis if loading fails.
 */

import type { AmbientTrack } from '@/types';

// ── Audio URLs — royalty-free ambient loops ──────────────────────────────────
// Sourced from Pixabay (royalty-free, no attribution required)
const AUDIO_URLS: Record<AmbientTrack, string> = {
  brown:    'https://archive.org/download/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise/BrownianNoise_64kb.mp3',
  rainfall: 'https://cdn.jsdelivr.net/gh/bradtraversy/ambient-sound-mixer@main/audio/rain.mp3',
  forest:   'https://cdn.jsdelivr.net/gh/bradtraversy/ambient-sound-mixer@main/audio/birds.mp3',
  ocean:    'https://cdn.jsdelivr.net/gh/bradtraversy/ambient-sound-mixer@main/audio/ocean.mp3',
};

// ── State ────────────────────────────────────────────────────────────────────

let activeAudio: { track: AmbientTrack; element: HTMLAudioElement } | null = null;
let fallbackCtx: AudioContext | null = null;
let fallbackPlayer: { track: AmbientTrack; stop: () => void; setVolume: (v: number) => void } | null = null;

// ── Main API ─────────────────────────────────────────────────────────────────

export function playTrack(track: AmbientTrack, volume = 0.6): void {
  // Stop current
  stopTrack();

  // Try HTML Audio element first (real audio files)
  const url = AUDIO_URLS[track];
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.crossOrigin = 'anonymous';

  // On successful load, play
  audio.addEventListener('canplaythrough', () => {
    audio.play().catch(() => {
      // If autoplay blocked, try fallback
      useFallback(track, volume);
    });
  }, { once: true });

  // On error, fall back to synthesis
  audio.addEventListener('error', () => {
    useFallback(track, volume);
  }, { once: true });

  audio.load();
  activeAudio = { track, element: audio };
}

export function stopTrack(): void {
  if (activeAudio) {
    activeAudio.element.pause();
    activeAudio.element.src = '';
    activeAudio = null;
  }
  if (fallbackPlayer) {
    fallbackPlayer.stop();
    fallbackPlayer = null;
  }
}

export function setTrackVolume(volume: number): void {
  const v = Math.max(0, Math.min(1, volume));
  if (activeAudio) {
    activeAudio.element.volume = v;
  }
  if (fallbackPlayer) {
    fallbackPlayer.setVolume(v);
  }
}

export function getActiveTrack(): AmbientTrack | null {
  return activeAudio?.track ?? fallbackPlayer?.track ?? null;
}

// ── Fallback: Web Audio API synthesis ────────────────────────────────────────

function getAudioContext(): AudioContext {
  if (!fallbackCtx) fallbackCtx = new AudioContext();
  if (fallbackCtx.state === 'suspended') fallbackCtx.resume();
  return fallbackCtx;
}

function createNoiseBuffer(ctx: AudioContext, brown = false, seconds = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * seconds, sr);
  const data = buf.getChannelData(0);
  if (brown) {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function useFallback(track: AmbientTrack, volume: number): void {
  // Clean up any existing audio element attempt
  if (activeAudio) {
    activeAudio.element.pause();
    activeAudio.element.src = '';
    activeAudio = null;
  }

  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(ctx.destination);

  const sources: AudioBufferSourceNode[] = [];
  const nodes: AudioNode[] = [];
  let running = true;

  const stop = () => {
    running = false;
    sources.forEach((s) => { try { s.stop(); s.disconnect(); } catch {} });
    nodes.forEach((n) => { try { n.disconnect(); } catch {} });
  };

  const isBrown = track === 'brown' || track === 'ocean';
  const buf = createNoiseBuffer(ctx, isBrown, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  sources.push(src);

  if (track === 'rainfall') {
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 800;
    lpf.Q.value = 0.7;
    src.connect(lpf);
    lpf.connect(gain);
    nodes.push(lpf);
  } else if (track === 'ocean') {
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 300;
    lpf.Q.value = 0.3;
    src.connect(lpf);
    lpf.connect(gain);
    nodes.push(lpf);
  } else if (track === 'forest') {
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 400;
    bpf.Q.value = 0.5;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.3;
    src.connect(bpf);
    bpf.connect(windGain);
    windGain.connect(gain);
    nodes.push(bpf, windGain);
  } else {
    src.connect(gain);
  }

  src.start();

  fallbackPlayer = {
    track,
    stop,
    setVolume: (v: number) => {
      gain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
    },
  };
}
