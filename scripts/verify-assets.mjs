/**
 * Sanity checks on the SUPPLIED assets.
 *
 * These are the only files in the project that were authored elsewhere, and
 * none of them may be modified: a silent change should produce a loud failure
 * here rather than a character that animates wrongly weeks later.
 *
 * Everything else the game draws and every other noise it makes is generated
 * at runtime, which is why this list is short and why it stays short.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Known-good digests of the assets as supplied.
 *
 * `base_rig.fbx` is byte-identical to `player.fbx` on purpose; only
 * `player.fbx` is ever loaded, and the build prunes the other from `dist`.
 */
const EXPECTED = [
  { path: 'assets/player/player.fbx', md5: '4211d040bb7098791816ad92a0accaaa' },
  { path: 'assets/player/green.png', md5: '67421b6f13962ead111335ff50bf58fe' },
  { path: 'assets/audio/jump.mp3', md5: '77c58db6921be7b0c7a61903d38bbf30' },
  { path: 'assets/audio/wheel-squeek.mp3', md5: '82e2b27ed8bf11d138ae0f2ecb506371' },
  { path: 'assets/audio/car.mp3', md5: '3b4671e84600b526ec1866024d7533a4' },
  { path: 'assets/audio/explosion.mp3', md5: 'da3d1d43a4e52029f6ce68acf9607897' },
  { path: 'assets/audio/fall.mp3', md5: 'a6c361490b027a8effd0ac861936a5a7' },
  { path: 'assets/audio/cashier-money-sound.mp3', md5: '992ac57b49ed41a761fa667f821878f9' },
  { path: 'assets/audio/awesome-level-up.mp3', md5: '827b8b1de23a78a54490674671f2eb22' },
  { path: 'assets/audio/star-ding.mp3', md5: 'ed2ba28ffbb80ccd42dbaa5beee8af89' },
  { path: 'assets/audio/music.mp3', md5: '4e0acb5ed3ed3e6a4d61e0da79ca7f62' },
  { path: 'assets/ui/shop.png', md5: 'baf5b63cba7737b79dd63478a11768fa' },
  { path: 'assets/ui/Upgrades.png', md5: 'a66cd7a0756b236dce197af4ba44febb' },
  { path: 'assets/ui/Map.png', md5: '10bad16ff4d0b1aae2d9d85213f9ade5' },
  { path: 'assets/ui/inventory.png', md5: '012b566b91c89168b5e3b0f10fe692f1' },
  { path: 'assets/ui/car.png', md5: '875f6e0d847472364e3b58e780078027' },
  { path: 'assets/ui/gift.png', md5: 'cc59b5efc191813a72e40b95dcdcd4a7' },
  { path: 'assets/ui/rebirth.png', md5: '022dccdad65f256a546d2a14baf7512a' },
  { path: 'assets/ui/build.png', md5: 'b81d5c08061a5e06683d6cb13d75bce1' },
  { path: 'assets/ui/home.png', md5: '35c637e598012d21f91e2128e62b3e98' },
  { path: 'assets/ui/Bills.png', md5: '31b9761863c08e40c7f065a4db6a7f36' },
  { path: 'assets/ui/energy.png', md5: 'c81dc6da27ee9c0b922ec284877526b5' },
  { path: 'assets/ui/Sound.png', md5: '225e1f3bc86303e689d3d56239724aa2' },
  { path: 'assets/ui/equipment.png', md5: 'ab4b845e42f24069cb343607d9b1a4bd' },
  { path: 'assets/player/base_rig.fbx', md5: '4211d040bb7098791816ad92a0accaaa' },
];

/** Supplied but never shipped (client/vite.config.ts prunes them from dist). */
const UNSHIPPED = ['audio/katana.mp3', 'audio/laser.mp3', 'audio/Lightning.mp3', 'audio/walk.mp3', 'player/base_rig.fbx', 'ui/aura.png', 'ui/Avatar.png', 'ui/Daily.png', 'ui/Emotes.png', 'ui/Index.png', 'ui/Katana.png', 'ui/leaderboard.png', 'ui/mailbox.png', 'ui/pet.png', 'ui/Pets.png', 'ui/phone.png', 'ui/plane.png', 'ui/Role.png', 'ui/run.png', 'ui/Settings.png', 'ui/shoe.png', 'ui/trail.png', 'ui/troll.png', 'ui/trophy.png'];
const unshipped = (path) => UNSHIPPED.includes(path);

let failures = 0;

for (const asset of EXPECTED) {
  const full = new URL(asset.path, `file://${root.replace(/\\/g, '/')}`);
  let bytes;
  try {
    bytes = readFileSync(full);
  } catch {
    console.error(`  FAIL  ${asset.path} is missing`);
    failures += 1;
    continue;
  }
  const digest = createHash('md5').update(bytes).digest('hex');
  const size = statSync(full).size;
  if (digest !== asset.md5) {
    console.error(`  FAIL  ${asset.path} has changed (${digest})`);
    failures += 1;
  } else {
    console.log(`  ok    ${asset.path} (${size} bytes)`);
  }
}

// Every file under assets/ ships as a URL. Bloxity Hosting answers 400 Bad
// Request to a path with a space in it (Vite's dev server does not), so a name
// that works locally can be silent in DEV and PROD: letters, digits, '.', '_'
// and '-' only.
const walk = (dir, rel = '') => {
  for (const entry of readdirSync(new URL(`${dir}/`, `file://${root.replace(/\\/g, '/')}`), { withFileTypes: true })) {
    const path = `${rel}${entry.name}`;
    if (entry.isDirectory()) walk(`${dir}/${entry.name}`, `${path}/`);
    else if (!unshipped(path) && !/^[A-Za-z0-9._-]+$/.test(entry.name)) {
      console.error(`  FAIL  assets/${path}: not a URL-safe name (Bloxity Hosting rejects spaces with 400)`);
      failures += 1;
    }
  }
};
walk('assets');
if (failures === 0) console.log('  ok    every shipped asset name is URL-safe (no spaces)');

if (failures > 0) {
  console.error(`\n${failures} asset problem(s). The supplied files must never be modified.`);
  process.exit(1);
}
console.log('\nassets OK');
