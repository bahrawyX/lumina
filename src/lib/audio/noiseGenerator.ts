/**
 * Web Audio API noise synthesizer.
 * Generates white noise, brown noise, rainfall, forest, and ocean sounds
 * entirely in-browser — no external audio files.
 */

import type { AmbientTrack } from '@/types';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

interface NoisePlayer {
  play: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
}

let activePlayer: { track: AmbientTrack; player: NoisePlayer } | null = null;

function createWhiteNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * seconds, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function createBrownNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * seconds, sr);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5; // normalize
  }
  return buf;
}

function makeLoopingSource(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function createNoisePlayerInternal(type: AmbientTrack): NoisePlayer {
  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.gain.value = 0.6;
  gain.connect(ctx.destination);

  let sources: AudioBufferSourceNode[] = [];
  let filters: BiquadFilterNode[] = [];
  let oscillators: OscillatorNode[] = [];
  let lfoGains: GainNode[] = [];
  let running = false;

  const cleanup = () => {
    sources.forEach((s) => { try { s.stop(); s.disconnect(); } catch {} });
    filters.forEach((f) => { try { f.disconnect(); } catch {} });
    oscillators.forEach((o) => { try { o.stop(); o.disconnect(); } catch {} });
    lfoGains.forEach((g) => { try { g.disconnect(); } catch {} });
    sources = [];
    filters = [];
    oscillators = [];
    lfoGains = [];
    running = false;
  };

  const play = () => {
    if (running) return;
    running = true;

    if (type === 'white') {
      const buf = createWhiteNoiseBuffer(ctx);
      const src = makeLoopingSource(ctx, buf);
      src.connect(gain);
      src.start();
      sources.push(src);
    } else if (type === 'brown') {
      const buf = createBrownNoiseBuffer(ctx);
      const src = makeLoopingSource(ctx, buf);
      src.connect(gain);
      src.start();
      sources.push(src);
    } else if (type === 'rainfall') {
      const buf = createWhiteNoiseBuffer(ctx, 3);
      const src = makeLoopingSource(ctx, buf);
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 800;
      lpf.Q.value = 0.7;
      src.connect(lpf);
      lpf.connect(gain);
      src.start();
      sources.push(src);
      filters.push(lpf);
    } else if (type === 'forest') {
      // Base: filtered noise for wind
      const buf = createWhiteNoiseBuffer(ctx, 3);
      const src = makeLoopingSource(ctx, buf);
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 400;
      bpf.Q.value = 0.5;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.3;
      src.connect(bpf);
      bpf.connect(windGain);
      windGain.connect(gain);
      src.start();
      sources.push(src);
      filters.push(bpf);
      lfoGains.push(windGain);

      // Bird chirps: periodic oscillator pings
      const chirpInterval = setInterval(() => {
        if (!running) { clearInterval(chirpInterval); return; }
        const osc = ctx.createOscillator();
        const chirpGain = ctx.createGain();
        const freq = 2000 + Math.random() * 3000;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, ctx.currentTime + 0.15);
        chirpGain.gain.setValueAtTime(0.08, ctx.currentTime);
        chirpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(chirpGain);
        chirpGain.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }, 2000 + Math.random() * 4000);

      // Store cleanup reference
      const origCleanup = cleanup;
      // Override is handled by the running flag check in chirpInterval
    } else if (type === 'ocean') {
      const buf = createBrownNoiseBuffer(ctx, 4);
      const src = makeLoopingSource(ctx, buf);
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 300;
      lpf.Q.value = 0.3;
      // LFO for wave-like volume modulation
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12; // slow wave
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.3;
      lfo.connect(lfoG);
      const modGain = ctx.createGain();
      modGain.gain.value = 0.7;
      lfoG.connect(modGain.gain);
      src.connect(lpf);
      lpf.connect(modGain);
      modGain.connect(gain);
      lfo.start();
      src.start();
      sources.push(src);
      filters.push(lpf);
      oscillators.push(lfo);
      lfoGains.push(lfoG, modGain);
    }
  };

  return {
    play,
    stop: cleanup,
    setVolume: (v: number) => {
      gain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
    },
  };
}

/** Get or create a noise player for the given track type. Manages singleton active player. */
export function playTrack(track: AmbientTrack, volume = 0.6): void {
  // Stop current if different
  if (activePlayer) {
    activePlayer.player.stop();
    activePlayer = null;
  }

  const player = createNoisePlayerInternal(track);
  player.setVolume(volume);
  player.play();
  activePlayer = { track, player };
}

export function stopTrack(): void {
  if (activePlayer) {
    activePlayer.player.stop();
    activePlayer = null;
  }
}

export function setTrackVolume(volume: number): void {
  if (activePlayer) {
    activePlayer.player.setVolume(volume);
  }
}

export function getActiveTrack(): AmbientTrack | null {
  return activePlayer?.track ?? null;
}
