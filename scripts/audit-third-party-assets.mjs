#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const enforceRelease = process.argv.includes('--release');

const expectedAssets = new Map(
  Object.entries({
    'resources/bin/.gitkeep': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'resources/fonts/.gitkeep': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'resources/fonts/Anton-Regular.ttf':
      'a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab',
    'resources/fonts/Bangers-Regular.ttf':
      '4160a7311de9342674cce9160cde9fcbb30f48190397d86ff1b70b455af65824',
    'resources/fonts/BebasNeue-Regular.ttf':
      '08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73',
    'resources/fonts/Caveat.ttf':
      '0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988',
    'resources/fonts/DancingScript.ttf':
      '21808625578fe8d8cd10cb684be546dca077b27cd03a53a2f1ec11dc743c924c',
    'resources/fonts/Geist-Bold.ttf':
      'f032f37d12e82a37977fd1159c01e1a14415672244d2e6865d57e28c74886d03',
    'resources/fonts/InstrumentSerif-Italic.ttf':
      '08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385',
    'resources/fonts/Inter-Bold.ttf':
      'b37284b5701b6b168dfc770aa1a4ac492106422fd3ba76bc7641e37434e8019c',
    'resources/fonts/Inter.ttf': '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031',
    'resources/fonts/JetBrainsMono.ttf':
      '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda',
    'resources/fonts/Lora.ttf': '822a6621ccbe8d97d20ac88c1c41f5615c9c2c202eaa75f272cd452aac6475a7',
    'resources/fonts/Montserrat-Bold.ttf':
      'bc6e854971cea46b463be6f9eef4d9cd52f51cfc1fc0dd90c9d3e6483dc0ec61',
    'resources/fonts/Montserrat.ttf':
      '0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7',
    'resources/fonts/Oswald.ttf':
      '5b38c246e255a12f5712d640d56bcced0472466fc68983d2d0410ec0457c2817',
    'resources/fonts/Outfit.ttf':
      'fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade',
    'resources/fonts/PermanentMarker-Regular.ttf':
      '28f82c8a7943cb8e9d599f8554da1d4fc75dbcf69b9885ad6c0611d20c6946c5',
    'resources/fonts/PlayfairDisplay.ttf':
      'c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6',
    'resources/fonts/Poppins-Bold.ttf':
      '1984efdda0fbe207d7ac20feac2ba7c2768c92a90094b02a206c9d58cc30ff2e',
    'resources/fonts/Poppins-Regular.ttf':
      '7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba',
    'resources/fonts/PressStart2P-Regular.ttf':
      '034c77f1f05ec89421e4a63f0e3a4ca1ecf852cc6d2bf611f126f275728e017d',
    'resources/fonts/SourceCodePro.ttf':
      'b400fc584e10aff25d0e775ce181b4fc1c5ea1b5dc37b81aeb2084375b945790',
    'resources/fonts/StyleScript-Regular.ttf':
      'e77c77bfaf9f79d5a1a5d4e8d3674ee7fa98dce1deb4ee8cdf1aef70b5229408',
    'resources/music/README.md': '673c49f8021ab71e21eb4c8e976d2e5fa8e6de5ebc60e1b3ce4d488632eb88a1',
    'resources/sfx/README.md': '5c31ae822f178efe742e4f12813ed86b67c2927fa44f383e80fcb8cf4b6830cd',
    'resources/sfx/bass-drop.mp3':
      '9a8aeaa2065b38cdfca9c20ab12a7386d799204db7c33cc1921a04e640e7e017',
    'resources/sfx/camera-shutter.mp3':
      '5984cc0e0c6572b9a30e96424fa3141a568a4977381a31116e690520017f193f',
    'resources/sfx/rise-tension-short.mp3':
      '8ba5a60589c60b46a33d3f132dcba0858d817d74c8c67198f16a01a32cb2f726',
    'resources/sfx/swipe-transition.mp3':
      '5082fbf4e588362b9d4f36ce8455fd99f42acaeaef4e567df64aef098c99d1d2',
    'resources/sfx/typewriter-key.mp3':
      'd8e0d949ef8da2da95e86dfb98168a8fdea06932e82bfbfdf967f96c822a02a2',
    'resources/sfx/word-pop.mp3':
      '8ae8c9581173692884cc067139539f5c491ef867656019490114ee345a26773a',
    'build/dmg-background.png': '06e4332668605ae992d4a59880e3275ea390f6d2780cfb5ed7f55da842f0e51e',
    'build/icon.icns': '14e7b559deb5dd9fd1d3d85eef7ce49f2797baccc4917c9f37cf4d4b96a23b89',
    'build/icon.ico': '45d173371c80be82395a713cbbd9d9330b44ed5c80e0613bb42eea8e5815069f',
    'build/icon.iconset/icon_128x128.png':
      'f49645ddf1a7ecf02c8c4ae2c80a3c92845c410ec276800c52fdb53ce2fe7411',
    'build/icon.iconset/icon_128x128@2x.png':
      'db01598bfe41e0fbc77aa54614bb7cc100d145fd0f43e9b4440e7ebf8c19c26f',
    'build/icon.iconset/icon_16x16.png':
      '12cdcf27c59fb8ba003bc9edd19760cf8bfb411dd2b6e41655440d7e35ce24eb',
    'build/icon.iconset/icon_16x16@2x.png':
      'dfe5f2cb352e7dd0cd57fe4f8986a2d6d76339790770a62394e12f6e27b31a58',
    'build/icon.iconset/icon_256x256.png':
      'db01598bfe41e0fbc77aa54614bb7cc100d145fd0f43e9b4440e7ebf8c19c26f',
    'build/icon.iconset/icon_256x256@2x.png':
      '63ef9332dceb0a4e84e63f26014d07d12ad351771c3de387774ff12767fc3c0b',
    'build/icon.iconset/icon_32x32.png':
      'dfe5f2cb352e7dd0cd57fe4f8986a2d6d76339790770a62394e12f6e27b31a58',
    'build/icon.iconset/icon_32x32@2x.png':
      '7aba4f2d326b3c67e20cafb7db05f0a98accbc840ff54a495cd46d3ffdb2c41b',
    'build/icon.iconset/icon_512x512.png':
      '63ef9332dceb0a4e84e63f26014d07d12ad351771c3de387774ff12767fc3c0b',
    'build/icon.iconset/icon_512x512@2x.png':
      'a4fd8962a0019196c416964426f7f90d901a91dc53ec1d7010ead316f53455ae',
    'build/icon.png': 'a4fd8962a0019196c416964426f7f90d901a91dc53ec1d7010ead316f53455ae',
    'build/icon.svg': '67dc85296f208133cc04439d09950977963a57c0986a7d8d53d4a162de3479b8',
    'build/icons/1024x1024.png': 'a4fd8962a0019196c416964426f7f90d901a91dc53ec1d7010ead316f53455ae',
    'build/icons/128x128.png': 'f49645ddf1a7ecf02c8c4ae2c80a3c92845c410ec276800c52fdb53ce2fe7411',
    'build/icons/16x16.png': '12cdcf27c59fb8ba003bc9edd19760cf8bfb411dd2b6e41655440d7e35ce24eb',
    'build/icons/256x256.png': 'db01598bfe41e0fbc77aa54614bb7cc100d145fd0f43e9b4440e7ebf8c19c26f',
    'build/icons/32x32.png': 'dfe5f2cb352e7dd0cd57fe4f8986a2d6d76339790770a62394e12f6e27b31a58',
    'build/icons/48x48.png': '97c0a2b30d84b2e35327dfb06e5e9ce4cc35e4301b3471819d8c27d7d2c1c023',
    'build/icons/512x512.png': '63ef9332dceb0a4e84e63f26014d07d12ad351771c3de387774ff12767fc3c0b',
    'build/icons/64x64.png': '7aba4f2d326b3c67e20cafb7db05f0a98accbc840ff54a495cd46d3ffdb2c41b',
    'build/installerHeader.bmp': '3156ffe5e1facacdc8c5069f12305c76fdb84d3e3e7c3e900affb148ede34f94',
    'build/installerSidebar.bmp':
      '57cd308e5f29093d477bdd28dad41b06680588c05e0a59afb3f26ccf9787c84f',
    'src/main/hyperframes/catalog/shared/mm-logo.png':
      '329325cf91ba067d7b54ad57f6cce4eaa5103cc562f3125a6ade37d4bfc1d6c4',
    'src/renderer/src/assets/ui-sounds/attention.mp3':
      '13ff4075990c53d17f1859ee4171edcd1d4f8c9e6a8a35150d9930297a9f7906',
    'src/renderer/src/assets/ui-sounds/complete.mp3':
      '524f7c541a7268b5d3e6868606b37f6f7cdf7c43571d285205341d7fc5207469',
    'src/renderer/src/assets/ui-sounds/decision.mp3':
      '95591ddb2d32e34fc124a5200b7275781b6052b3cf3c0c0297eae57a10f670a1',
  }),
);

const expectedPackages = new Map([
  ['node_modules/@ffprobe-installer/ffprobe', '2.1.2'],
  ['node_modules/@fontsource/inter', '5.2.8'],
  ['node_modules/better-sqlite3', '12.9.0'],
  ['node_modules/electron', '34.5.8'],
  ['node_modules/ffmpeg-static', '5.3.0'],
  ['node_modules/fsevents', '2.3.3'],
  ['node_modules/lucide-react', '0.475.0'],
  ['node_modules/onnxruntime-node', '1.26.0'],
  ['node_modules/sharp', '0.34.5'],
  ['node_modules/source-map', '0.7.3'],
]);

const expectedPackageFamilies = [
  [
    /^node_modules\/@ffprobe-installer\/(darwin|linux|win32)-/,
    new Set(['5.0.1', '5.1.0', '5.2.0']),
  ],
  [/^node_modules\/@img\/sharp-(?!libvips-)/, new Set(['0.34.5'])],
  [/^node_modules\/@img\/sharp-libvips-/, new Set(['1.2.4'])],
  [/^node_modules\/@remotion\/compositor-/, new Set(['4.0.457'])],
  [/^node_modules\/@rspack\/binding-/, new Set(['1.7.6'])],
  [/(^|node_modules\/)@esbuild\//, new Set(['0.25.0', '0.25.12', '0.27.7'])],
  [/(^|node_modules\/)esbuild$/, new Set(['0.25.0', '0.25.12', '0.27.7'])],
];

const releaseBlockers = [
  'ffmpeg-static contains an FFmpeg build configured with --enable-nonfree.',
  'Remotion compositor packages have no bundled redistribution license and contain --enable-nonfree FFmpeg binaries.',
  'ffprobe-installer platform packages omit applicable license/source materials.',
  'sharp-libvips platform packages omit required LGPL and third-party redistribution materials.',
  'onnxruntime-node omits its upstream LICENSE and ThirdPartyNotices.txt from the npm payload.',
  'Three renderer UI sound files have no provable source or redistribution grant.',
  'The Media Master logo has no written app-bundle redistribution grant.',
];

const failures = [];

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(relative(root, absolute));
  }
  return files;
}

function hashFile(path) {
  return createHash('sha256')
    .update(readFileSync(resolve(root, path)))
    .digest('hex');
}

const assetExtensions = new Set([
  '.bmp',
  '.gif',
  '.icns',
  '.ico',
  '.jpeg',
  '.jpg',
  '.m4a',
  '.mp3',
  '.ogg',
  '.otf',
  '.png',
  '.svg',
  '.ttf',
  '.wav',
  '.webp',
  '.woff',
  '.woff2',
]);

const discoveredAssets = new Set([
  ...walkFiles(resolve(root, 'resources')),
  ...walkFiles(resolve(root, 'build')),
]);
for (const path of walkFiles(resolve(root, 'src'))) {
  if (assetExtensions.has(extname(path).toLowerCase())) discoveredAssets.add(path);
}

for (const path of discoveredAssets) {
  if (!expectedAssets.has(path)) failures.push(`Unaudited asset: ${path}`);
}
for (const [path, expectedHash] of expectedAssets) {
  if (!existsSync(resolve(root, path))) {
    failures.push(`Missing audited asset: ${path}`);
    continue;
  }
  const actualHash = hashFile(path);
  if (actualHash !== expectedHash) failures.push(`Changed audited asset: ${path} (${actualHash})`);
}

const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
for (const [packagePath, expectedVersion] of expectedPackages) {
  const actual = lock.packages?.[packagePath]?.version;
  if (actual !== expectedVersion) {
    failures.push(
      `Dependency drift: ${packagePath} expected ${expectedVersion}, found ${actual ?? 'missing'}`,
    );
  }
}

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  for (const [pattern, expectedVersions] of expectedPackageFamilies) {
    if (pattern.test(packagePath) && !expectedVersions.has(metadata.version)) {
      failures.push(`Binary dependency drift: ${packagePath}@${metadata.version ?? 'unknown'}`);
    }
  }
}

const noticePath = resolve(root, 'THIRD_PARTY_NOTICES.md');
if (!existsSync(noticePath)) failures.push('Missing release-facing THIRD_PARTY_NOTICES.md');
else {
  const notice = readFileSync(noticePath, 'utf8');
  if (!notice.includes('**Release status:** **BLOCKED')) {
    failures.push('Third-party notice does not record blocked status');
  }
}

if (failures.length > 0) {
  console.error('Third-party asset audit integrity: FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Third-party asset audit integrity: PASS (${expectedAssets.size} files verified)`);
console.log(`Redistribution review: BLOCKED (${releaseBlockers.length} unresolved items)`);
for (const blocker of releaseBlockers) console.log(`- ${blocker}`);
console.log('Details: THIRD_PARTY_NOTICES.md');

if (enforceRelease) {
  console.error('\nRelease refused: resolve every redistribution blocker before packaging.');
  process.exit(1);
}
