// Build the LNReader plugin bundle into .dist/ and refresh plugins.min.json.
//
// Pipeline mirrors the lnreader-nightjarreads / lnreader-wetriedtls
// builds: tsc compiles TypeScript to ES5 CommonJS first, then esbuild
// bundles it. Plugin code is executed RAW by the app's JS engine
// (Hermes) with no babel transform and no polyfills, so the final
// bundle must be ES5 + Promise/Map/Set only — native async functions,
// classes, class fields, const/let, arrows and ?. ?? all break older
// app versions (verified: native async killed installs on LNReader
// 2.0.0 while 2.1.4 accepted it).
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const REPO = 'RevDev909/lnreader-lorenovels';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

mkdirSync('.dist', { recursive: true });
rmSync('.tsc-build', { recursive: true, force: true });

// 1. Type-check first so type errors fail the build loudly.
execSync(
  'npx tsc --noEmit --strict --skipLibCheck --target es2020 --lib es2020,dom src/plugin.ts src/parsers.ts',
  { stdio: 'inherit' },
);

// 2. Compile to ES5 CommonJS. --downlevelIteration for the for-of over
// a Map in ensureCoverMap; async/await becomes tsc's __awaiter state
// machine (no native generators needed).
execSync(
  'npx tsc src/plugin.ts src/parsers.ts' +
    ' --target es5 --module commonjs --lib es2020,dom' +
    ' --strict --skipLibCheck --downlevelIteration' +
    ' --outDir .tsc-build --declaration false --sourceMap false',
  { stdio: 'inherit' },
);

// 3. Bundle. tsc's `exports.default = ...` assignments pass through
// untouched, which is exactly what the app's loader reads
// (`return exports.default`).
await build({
  entryPoints: ['.tsc-build/plugin.js'],
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  target: 'es5',
  outfile: `.dist/lorenovels-${version}.js`,
  logLevel: 'info',
  footer: {
    // Belt and braces, same as the reference builds.
    js: 'try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}',
  },
});

const index = [
  {
    iconUrl: `https://raw.githubusercontent.com/${REPO}/main/icon.png`,
    id: 'lorenovels',
    lang: 'English',
    name: 'Lorenovels',
    site: 'https://lorenovels.com',
    url: `https://raw.githubusercontent.com/${REPO}/main/.dist/lorenovels-${version}.js`,
    version,
  },
];
writeFileSync('.dist/plugins.min.json', JSON.stringify(index));
console.log('wrote .dist/lorenovels-' + version + '.js and .dist/plugins.min.json');
