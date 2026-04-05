/**
 * Ambient sound player.
 * Uses high-quality looping audio files from free CDN sources.
 * Falls back to Web Audio API synthesis if loading fails.
 *
 * Architecture: every playTrack() call increments a session counter.
 * Async callbacks (canplaythrough, error) check the counter before acting —
 * if a stop/switch happened in the meantime, the stale callback is a no-op.
 * This eliminates ghost audio from orphaned HTMLAudioElements.
 */

import type { AmbientTrack } from '@/types';

// ── Audio URLs — royalty-free ambient loops ──────────────────────────────────
const AUDIO_URLS: Record<AmbientTrack, string> = {
  brown:    'https://archive.org/download/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise/BrownianNoise_64kb.mp3',
  rainfall: 'https://cdn.jsdelivr.net/gh/bradtraversy/ambient-sound-mixer@main/audio/rain.mp3',
  forest:   'https://cdn.jsdelivr.net/gh/bradtraversy/ambient-sound-mixer@main/audio/birds.mp3',
  ocean:    'https://cdn.jsdelivr.net/gh/bradtraversy/ambient-sound-mixer@main/audio/ocean.mp3',
};

// ── State ────────────────────────────────────────────────────────────────────

/** Monotonically increasing session ID — guards async callbacks */
let sessionId = 0;

let activeAudio: { track: AmbientTrack; element: HTMLAudioElement } | null = null;
let fallbackCtx: AudioContext | null = null;
let fallbackPlayer: { track: AmbientTrack; stop: () => void; setVolume: (v: number) => void } | null = null;

// ── Internal: kill everything ────────────────────────────────────────────────

function destroyAudioElement(): void {
  if (!activeAudio) return;
  const el = activeAudio.element;
  // Remove all listeners so stale callbacks can't fire
  el.oncanplaythrough = null;
  el.onerror = null;
  el.pause();
  el.removeAttribute('src');
  el.load(); // forces browser to release network & buffer
  activeAudio = null;
}

function destroyFallback(): void {
  if (!fallbackPlayer) return;
  fallbackPlayer.stop();
  fallbackPlayer = null;
}

function destroyAll(): void {
  destroyAudioElement();
  destroyFallback();
}

// ── Main API ─────────────────────────────────────────────────────────────────

export function playTrack(track: AmbientTrack, volume = 0.6): void {
  // Kill whatever is currently playing
  destroyAll();

  // New session — stale callbacks from previous sessions will be ignored
  const thisSession = ++sessionId;

  const url = AUDIO_URLS[track];
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = Math.max(0, Math.min(1, volume));
  // No crossOrigin needed — we only do simple playback, not Web Audio graph routing

  // Guard: only act if this session is still current
  audio.oncanplaythrough = () => {
    if (sessionId !== thisSession) {
      // Stale — a stop or switch happened; kill this orphan
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    audio.play().catch(() => {
      if (sessionId !== thisSession) return;
      // Autoplay blocked — fall back to Web Audio synthesis
      destroyAudioElement();
      useFallback(track, volume, thisSession);
    });
  };

  audio.onerror = () => {
    if (sessionId !== thisSession) return;
    destroyAudioElement();
    useFallback(track, volume, thisSession);
  };

  audio.load();
  activeAudio = { track, element: audio };
}

export function stopTrack(): void {
  // Bump session so any pending async callbacks become no-ops
  sessionId++;
  destroyAll();
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
      const sample = Math.random() * 2 - 1;
      last = (last + 0.02 * sample) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function useFallback(track: AmbientTrack, volume: number, forSession: number): void {
  // Double-check session is still valid
  if (sessionId !== forSession) return;

  // Clean up any lingering audio element
  destroyAudioElement();

  const ctx = getAudioContext();
  const gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  gainNode.connect(ctx.destination);

  const sources: AudioBufferSourceNode[] = [];
  const nodes: AudioNode[] = [gainNode];

  const stop = () => {
    sources.forEach((s) => { try { s.stop(); s.disconnect(); } catch {} });
    nodes.forEach((n) => { try { n.disconnect(); } catch {} });
    sources.length = 0;
    nodes.length = 0;
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
    lpf.connect(gainNode);
    nodes.push(lpf);
  } else if (track === 'ocean') {
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 300;
    lpf.Q.value = 0.3;
    src.connect(lpf);
    lpf.connect(gainNode);
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
    windGain.connect(gainNode);
    nodes.push(bpf, windGain);
  } else {
    // brown noise — no extra filter, already shaped at buffer level
    src.connect(gainNode);
  }

  src.start();

  fallbackPlayer = {
    track,
    stop,
    setVolume: (v: number) => {
      gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
    },
  };
}
