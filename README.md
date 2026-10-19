# Lorenovels — LNReader plugin

An unofficial [LNReader](https://github.com/LNReader/lnreader) plugin (extension) for [lorenovels.com](https://lorenovels.com/), a site hosting Korean, Chinese, and Japanese web novels translated into English.

## Install in the app

1. In LNReader, go to **Settings → Repositories**.
2. Add this repository URL:

   ```
   https://raw.githubusercontent.com/RevDev909/lnreader-lorenovels/main/.dist/plugins.min.json
   ```

3. Install the **Lorenovels** plugin from the repository.

## What it supports

- Browse novels (full catalog via the site's WordPress API)
- Novel details: title, author, genres, status, synopsis, cover, full chapter list
- Chapter reading
- Search (novels only — the site's own search returns chapters, so the plugin queries the API and keeps novel pages)

## Development

```sh
npm install
npm test     # live integration test against lorenovels.com
npm run build # type-check + bundle into .dist/
```

- `src/plugin.ts` — the plugin class (LNReader host interface + resilient fetching with timeout/retries).
- `src/parsers.ts` — pure parsing helpers with no dependencies; everything testable lives here.
- `test/test.mjs` — live integration test; run with `npm test`.
- `.dist/` — built plugin bundle(s) + `plugins.min.json` (the repository index LNReader reads).

Bump `version` in `package.json`, run `npm run build`, and commit directly to the main branch.
