import { Music } from './Music.js';
/**
 * GAME AUDIO: the few recorded sounds that ship in `assets/audio`, and every
 * other effect synthesised with WebAudio (block thuds and crunches, pickups,
 * the shop's cha-ching, explosions, bow twangs, the bed alarm, fanfares).
 * Nothing here may throw: audio is never allowed to break a frame.
 */
export type SoundName =
  | 'hit'
  | 'swing'
  | 'jump'
  | 'death'
  | 'fall'
  | 'place'
  | 'break'
  | 'dig'
  | 'pickup'
  | 'buy'
  | 'denied'
  | 'explode'
  | 'bow'
  | 'draw'
  | 'fireball'
  | 'bedBreak'
  | 'alarm'
  | 'click'
  | 'tick'
  | 'go'
  | 'victory'
  | 'defeat'
  | 'kill'
  | 'upgrade'
  | 'teleport'
  | 'eat'
  | 'step'
  | 'crit'
  | 'fuse'
  | 'whoosh'
  | 'splash'
  | 'flood'
  | 'squeak'
  | 'launch'
  | 'boom'
  | 'engine'
  | 'crash'
  | 'cash'
  | 'levelup'
  | 'ding';

const FILES: Partial<Record<SoundName, string>> = {
  jump: '/audio/jump.mp3',
  // Tyres scraping a barrier.
  squeak: '/audio/wheel-squeek.mp3',
  // The engine loop (pitched by speed).
  engine: '/audio/car.mp3',
  crash: '/audio/explosion.mp3',
  boom: '/audio/explosion.mp3',
  cash: '/audio/cashier-money-sound.mp3',
  levelup: '/audio/awesome-level-up.mp3',
  ding: '/audio/star-ding.mp3',
  fall: '/audio/fall.mp3',
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The background score (plays into the master bus, so M and the master volume apply). */
  readonly music = new Music();
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private noise: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.8;
  private lastPlay = new Map<SoundName, number>();

  constructor() {
    try {
      this.muted = window.localStorage.getItem('oneblock.muted') === '1';
    } catch {
      /* private mode */
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** The first user gesture: the browser lets audio start now. */
  resume(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted || this.adBreak ? 0 : this.volume;
        this.master.connect(this.ctx.destination);
        const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const d = n.getChannelData(0);
        for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
        this.noise = n;
        for (const [name, url] of Object.entries(FILES)) void this.load(name as SoundName, url);
        this.music.attach(this.ctx, this.master);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* no audio */
    }
  }

  private async load(name: SoundName, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      const buffer = await this.ctx!.decodeAudioData(data);
      this.buffers.set(name, buffer);
    } catch {
      /* missing file: the synth stands in */
    }
  }

  /** Ad breaks silence the game without touching the player's own mute. */
  private adBreak = false;

  setAdBreak(on: boolean): void {
    this.adBreak = on;
    if (this.master) this.master.gain.value = this.muted || on ? 0 : this.volume;
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted || this.adBreak ? 0 : this.volume;
    try {
      window.localStorage.setItem('oneblock.muted', this.muted ? '1' : '0');
    } catch {
      /* private mode */
    }
    return this.muted;
  }

  setMasterVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.master && !this.muted && !this.adBreak) this.master.gain.value = this.volume;
  }

  private engineSrc: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;

  /**
   * The engine: a looping car.mp3 whose pitch follows the speed (0..1). Volume
   * 0 stops it. Never throws.
   */
  setEngine(volume: number, speed01: number): void {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.buffers.get('engine');
    if (!ctx || !master || !buffer) return;
    try {
      if (volume <= 0.01) {
        if (this.engineSrc) {
          this.engineGain?.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
          const src = this.engineSrc;
          window.setTimeout(() => {
            try {
              src.stop();
            } catch {
              /* stopped */
            }
          }, 400);
          this.engineSrc = null;
          this.engineGain = null;
        }
        return;
      }
      if (!this.engineSrc) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(master);
        src.start();
        this.engineSrc = src;
        this.engineGain = g;
      }
      this.engineSrc.playbackRate.setTargetAtTime(0.75 + Math.max(0, Math.min(1.4, speed01)) * 0.75, ctx.currentTime, 0.1);
      this.engineGain!.gain.setTargetAtTime(Math.min(0.6, volume), ctx.currentTime, 0.1);
    } catch {
      /* never break a frame */
    }
  }

  /** Play a sound at a volume (0..1) and stereo pan (-1..1). */
  play(name: SoundName, volume = 1, pan = 0, pitch = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || volume <= 0.01) return;
    const now = ctx.currentTime;
    // The same sound at most every 30 ms (a pile of iron is one sound, not forty).
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.03) return;
    this.lastPlay.set(name, now);
    try {
      const out = ctx.createGain();
      out.gain.value = Math.min(1.5, volume);
      let node: AudioNode = out;
      if (pan !== 0 && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        out.connect(p);
        node = p;
      }
      node.connect(master);
      const buffer = this.buffers.get(name);
      if (buffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = pitch * (0.94 + Math.random() * 0.12);
        src.connect(out);
        src.start(now);
        return;
      }
      this.synth(name, out, now, pitch);
    } catch {
      /* never break a frame */
    }
  }

  private tone(out: AudioNode, t: number, freq: number, dur: number, type: OscillatorType, gain: number, endFreq = freq): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(out: AudioNode, t: number, dur: number, gain: number, freq: number, q = 0.8, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private synth(name: SoundName, out: AudioNode, t: number, pitch: number): void {
    switch (name) {
      case 'place':
        this.hiss(out, t, 0.09, 0.6, 520 * pitch, 1.2);
        this.tone(out, t, 140 * pitch, 0.08, 'triangle', 0.25, 90);
        break;
      case 'break':
        this.hiss(out, t, 0.18, 0.7, 900 * pitch, 0.7);
        this.hiss(out, t + 0.03, 0.14, 0.4, 380 * pitch, 1);
        break;
      case 'dig':
        this.hiss(out, t, 0.06, 0.35, 700 * pitch, 1.5);
        break;
      case 'step':
        this.hiss(out, t, 0.05, 0.12, 420 * pitch, 1.2);
        break;
      case 'pickup':
        this.tone(out, t, 880 * pitch, 0.07, 'square', 0.08, 1320 * pitch);
        break;
      case 'buy':
        this.tone(out, t, 1046, 0.09, 'square', 0.09);
        this.tone(out, t + 0.08, 1568, 0.16, 'square', 0.09);
        break;
      case 'upgrade':
        this.tone(out, t, 523, 0.1, 'triangle', 0.18);
        this.tone(out, t + 0.09, 659, 0.1, 'triangle', 0.18);
        this.tone(out, t + 0.18, 1046, 0.22, 'triangle', 0.18);
        break;
      case 'denied':
        this.tone(out, t, 160, 0.18, 'sawtooth', 0.12, 110);
        break;
      case 'explode':
        this.hiss(out, t, 0.9, 1.2, 300, 0.5, 'lowpass');
        this.tone(out, t, 90, 0.6, 'sine', 0.6, 30);
        break;
      case 'bow':
        this.tone(out, t, 420 * pitch, 0.12, 'triangle', 0.25, 180);
        this.hiss(out, t, 0.12, 0.2, 2400, 2);
        break;
      case 'draw':
        this.tone(out, t, 200, 0.5, 'triangle', 0.05, 320);
        break;
      case 'fireball':
      case 'whoosh':
        this.hiss(out, t, 0.4, 0.5, 600, 0.6, 'lowpass');
        break;
      case 'fuse':
        this.hiss(out, t, 0.6, 0.25, 3000, 1.5);
        break;
      case 'bedBreak':
        this.hiss(out, t, 0.5, 0.9, 500, 0.6);
        this.tone(out, t, 330, 0.3, 'sawtooth', 0.15, 165);
        this.tone(out, t + 0.25, 247, 0.45, 'sawtooth', 0.15, 123);
        break;
      case 'alarm':
        for (let i = 0; i < 4; i += 1) this.tone(out, t + i * 0.18, i % 2 ? 880 : 1175, 0.15, 'square', 0.12);
        break;
      case 'click':
        this.tone(out, t, 1200, 0.04, 'square', 0.06, 900);
        break;
      case 'tick':
        this.tone(out, t, 880, 0.08, 'square', 0.08);
        break;
      case 'go':
        this.tone(out, t, 1320, 0.3, 'square', 0.1);
        break;
      case 'kill':
        this.tone(out, t, 784, 0.08, 'square', 0.1);
        this.tone(out, t + 0.07, 1175, 0.14, 'square', 0.1);
        break;
      case 'crit':
        this.tone(out, t, 1600, 0.06, 'square', 0.06, 2400);
        this.hiss(out, t, 0.08, 0.3, 3000, 1);
        break;
      case 'teleport':
        this.tone(out, t, 300, 0.35, 'sine', 0.2, 1200);
        break;
      case 'eat':
        this.hiss(out, t, 0.1, 0.4, 900, 2);
        this.hiss(out, t + 0.14, 0.1, 0.4, 800, 2);
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(out, t + i * 0.14, f, i === 3 ? 0.6 : 0.16, 'triangle', 0.2));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => this.tone(out, t + i * 0.2, f, i === 3 ? 0.7 : 0.22, 'triangle', 0.18));
        break;
      case 'hit':
        this.hiss(out, t, 0.08, 0.6, 400, 0.8);
        break;
      case 'swing':
        this.hiss(out, t, 0.12, 0.25, 1500, 0.6);
        break;
      case 'jump':
        this.tone(out, t, 300, 0.1, 'sine', 0.06, 500);
        break;
      case 'death':
        this.tone(out, t, 400, 0.4, 'sawtooth', 0.12, 120);
        break;
      case 'fall':
        this.hiss(out, t, 0.2, 0.6, 250, 0.8, 'lowpass');
        break;
    }
  }

  dispose(): void {
    this.music.dispose();
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** Volume and pan for a sound at a world point, heard from a listener. */
export const hearing = (lx: number, ly: number, lz: number, yaw: number, x: number, y: number, z: number, range = 40): { volume: number; pan: number } => {
  const dx = x - lx;
  const dz = z - lz;
  const d = Math.hypot(dx, y - ly, dz);
  const volume = Math.max(0, 1 - d / range) ** 1.4;
  // Right of the listener is negative across the yaw convention (see wishDirection).
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
  return { volume, pan };
};
