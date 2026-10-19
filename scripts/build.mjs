// Build the LNReader plugin bundle into .dist/ and refresh plugins.min.json.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const REPO = 'RevDev909/lnreader-lorenovels';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

mkdirSync('.dist', { recursive: true });

// Type-check first so type errors fail the build loudly.
const { execSync } = await import('node:child_process');
execSync('npx tsc --noEmit --strict --skipLibCheck --target es2020 --lib es2020,dom src/plugin.ts src/parsers.ts', {
  stdio: 'inherit',
});

await build({
  entryPoints: ['src/plugin.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  outfile: `.dist/lorenovels-${version}.js`,
  logLevel: 'info',
  footer: {
    // LNReader loads the bundle with:
    //   Function('require','module', `const exports = module.exports = {};
    //     ${rawCode}; return exports.default`)(_require, {})
    // esbuild's CJS output REASSIGNS module.exports to a new object, so
    // the wrapper's `exports` (the original object) would have no
    // `default` and initPlugin would return undefined -> "installation
    // error". Copy the default export onto the original `exports`
    // object as well. (The lnreader-nightjarreads/wetriedtls builds do
    // `exports.default = plugin_default;` for the same reason.)
    js: [
      'try {',
      '  if (typeof exports !== "undefined" && exports) {',
      '    exports.default = (typeof plugin_default !== "undefined")',
      '      ? plugin_default',
      '      : (typeof module !== "undefined" && module && module.exports ? module.exports.default : undefined);',
      '  }',
      '} catch (e) {}',
      'try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}',
    ].join('\n'),
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
