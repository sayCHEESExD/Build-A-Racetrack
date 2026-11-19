import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const repoAssets = fileURLToPath(new URL('../assets', import.meta.url));

/**
 * Files that live in assets/ but are never loaded at runtime, so they must
 * not be shipped to browsers: base_rig.fbx is byte-identical to player.fbx,
 * and the sounds and icons Build A Racetrack has no use for.
 */
const UNSHIPPED_ASSETS = [
  'audio/katana.mp3',
  'audio/laser.mp3',
  'audio/Lightning.mp3',
  'audio/walk.mp3',
  'player/base_rig.fbx',
  'ui/aura.png',
  'ui/Avatar.png',
  'ui/Daily.png',
  'ui/Emotes.png',
  'ui/Index.png',
  'ui/Katana.png',
  'ui/leaderboard.png',
  'ui/mailbox.png',
  'ui/pet.png',
  'ui/Pets.png',
  'ui/phone.png',
  'ui/plane.png',
  'ui/Role.png',
  'ui/run.png',
  'ui/Settings.png',
  'ui/shoe.png',
  'ui/trail.png',
  'ui/troll.png',
  'ui/trophy.png',
];

/** Drops UNSHIPPED_ASSETS after Vite copies publicDir into the build output. */
const pruneUnusedAssets = (): Plugin => ({
  name: 'racetrack:prune-unused-assets',
  apply: 'build',
  async closeBundle() {
    for (const relativePath of UNSHIPPED_ASSETS) {
      await rm(join(clientRoot, 'dist', relativePath), { force: true, recursive: true });
    }
  },
});

/**
 * LOCAL DEVELOPMENT ONLY: a standalone local page tells the Boxity SDK it runs
 * in the local environment, before the game's code (Boxity's ENVIRONMENTS
 * contract). `apply: 'serve'` keeps it out of every production build, which is
 * told its environment by the pages Boxity serves (or runs against prod).
 */
const LOCAL_BLOXITY_ENV = {
  env: 'local',
  apiUrl: 'http://localhost:4000',
  playUrl: 'http://localhost:2567',
  portalUrl: 'http://localhost:3000',
  staticUrl: 'https://static.bloxity.io',
};
const localBloxityEnv = (): Plugin => ({
  name: 'racetrack:local-bloxity-env',
  apply: 'serve',
  transformIndexHtml: () => [
    { tag: 'script', children: `window.BLOXITY_ENV = ${JSON.stringify(LOCAL_BLOXITY_ENV)};`, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  plugins: [localBloxityEnv(), pruneUnusedAssets()],
  root: clientRoot,
  /**
   * Serve the repo-level `assets/` directory directly as the public root, so
   * the FBX and its texture are reachable at `/player/*` with NO duplicate
   * copies of the source assets inside the client workspace.
   */
  publicDir: repoAssets,
  server: {
    // Deliberately not Vite's default 5173: the previous game in this series
    // runs its own dev server there, and sharing the port means whichever
    // started first silently serves both projects.
    port: 6181,
    strictPort: true,
    // Reachable from a phone on the same LAN for mobile testing.
    host: true,
  },
  preview: {
    port: 4781,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // Browser build budget is 12 MB; warn well before we get close.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          net: ['colyseus.js'],
        },
      },
    },
  },
});
