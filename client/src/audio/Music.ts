/**
 * THE SOUNDTRACK: the supplied `music.mp3` loop under the raceway,
 * decoded once and looped gaplessly by WebAudio (an <audio loop> leaves an
 * MP3 gap every repeat). It fades in and out. Volume follows the portal's
 * music slider; the mute and the master volume apply too (this plays into
 * the master bus).
 */
export type MusicMood = 'lobby' | 'match' | 'off';

/** The supplied soundtrack loop. */
const TRACK = '/audio/music.mp3';
const TRACKS: Readonly<Record<Exclude<MusicMood, 'off'>, string>> = {
  lobby: TRACK,
  match: TRACK,
};

/** The tracks are mastered loud; music sits under the effects. */
const MUSIC_LEVEL = 0.32;
const FADE_IN = 1.8;
const FADE_OUT = 1.2;

interface Playing {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private readonly buffers = new Map<Exclude<MusicMood, 'off'>, AudioBuffer>();
  private readonly loading = new Map<Exclude<MusicMood, 'off'>, Promise<AudioBuffer | null>>();
  private mood: MusicMood = 'off';
  private playing: { mood: Exclude<MusicMood, 'off'>; node: Playing } | null = null;
  private volume = 0.6;

  /** Hook into the audio graph (the first user gesture made the context). */
  attach(ctx: AudioContext, out: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume * MUSIC_LEVEL;
    this.bus.connect(out);
    // The lobby track first (it plays now), the match one right after.
    void this.load('lobby');
    const wanted = this.mood;
    this.mood = 'off';
    this.setMood(wanted);
  }

  /** 0..1 (the portal's music slider). */
  setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.bus && this.ctx) this.bus.gain.setTargetAtTime(this.volume * MUSIC_LEVEL, this.ctx.currentTime, 0.2);
  }

  /** Lobby, match, or silence - crossfaded. */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (!this.ctx) return;
    this.fadeOutCurrent();
    if (mood === 'off') return;
    void this.load(mood).then((buffer) => {
      // Still wanted (the player may have moved on while it decoded)?
      if (buffer && this.mood === mood && this.playing?.mood !== mood) this.start(mood, buffer);
    });
  }

  dispose(): void {
    this.fadeOutCurrent();
  }

  private load(mood: Exclude<MusicMood, 'off'>): Promise<AudioBuffer | null> {
    const ready = this.buffers.get(mood);
    if (ready) return Promise.resolve(ready);
    const pending = this.loading.get(mood);
    if (pending) return pending;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const promise = fetch(TRACKS[mood])
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(mood, buffer);
        return buffer;
      })
      .catch(() => null); // no music is never an error
    this.loading.set(mood, promise);
    return promise;
  }

  private start(mood: Exclude<MusicMood, 'off'>, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + FADE_IN);
    source.connect(gain);
    gain.connect(bus);
    source.start(now);
    this.playing = { mood, node: { source, gain } };
  }

  private fadeOutCurrent(): void {
    const ctx = this.ctx;
    const current = this.playing;
    this.playing = null;
    if (!ctx || !current) return;
    const { source, gain } = current.node;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT);
    try {
      source.stop(now + FADE_OUT + 0.05);
    } catch {
      // Already stopped.
    }
  }
}
