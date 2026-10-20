import {
  MAX_RESPONSE_CHARS,
  ChapterInfo,
  coverMapFromCards,
  parseCatalogResults,
  parseChapterPage,
  parseNovelCards,
  parseNovelPage,
  parseSearchResults,
} from './parsers';
import type { Plugin } from './lnreader-api';

// The host app injects these via `require`, but their exact shape has varied
// across app versions, so resolve them defensively at load with fallbacks.
declare function require(name: string): any;

function loadFetchLib(): {
  fetchText?: (url: string) => Promise<string>;
  fetchApi?: (url: string) => Promise<{ text: () => Promise<string> }>;
} {
  try {
    return require('@libs/fetch') || {};
  } catch (e) {
    return {};
  }
}

function loadNovelStatus(): Record<string, string> {
  try {
    const lib = require('@libs/novelStatus');
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
    // fall through to the built-in copy below
  }
  // Built-in copy of the NovelStatus string enum, so the plugin keeps
  // working even if the host does not provide @libs/novelStatus.
  return {
    Unknown: 'Unknown',
    Ongoing: 'Ongoing',
    Completed: 'Completed',
    Licensed: 'Licensed',
    PublishingFinished: 'Publishing Finished',
    Cancelled: 'Cancelled',
    OnHiatus: 'On Hiatus',
  };
}

const fetchLib = loadFetchLib();
const NovelStatus = loadNovelStatus();

// --- Resilient fetching -------------------------------------------------
// Chapter downloads are one HTTP request per chapter, so a single flaky
// request used to fail the whole chapter. This wrapper adds a timeout and
// retries transient failures with exponential backoff. It never fires
// parallel requests and never retries definite client errors, so the site
// is treated respectfully.
const FETCH_TIMEOUT_MS = 30000;
const MAX_FETCH_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof setTimeout === 'function') setTimeout(resolve, ms);
    else resolve();
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: any = undefined;
  const timeout = new Promise<T>((_, reject) => {
    if (typeof setTimeout === 'function') {
      timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    }
  });
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(
    v => {
      clear();
      return v;
    },
    e => {
      clear();
      throw e;
    },
  );
}

interface RawFetchResult {
  status?: number;
  text: string;
}

async function fetchRaw(url: string): Promise<RawFetchResult> {
  if (typeof fetchLib.fetchApi === 'function') {
    const res: any = await fetchLib.fetchApi(url);
    const status =
      res && typeof res.status === 'number' ? res.status : undefined;
    const text =
      res && typeof res.text === 'function' ? await res.text() : '';
    return { status, text };
  }
  if (typeof fetchLib.fetchText === 'function') {
    return { text: await fetchLib.fetchText(url) };
  }
  throw new Error('No fetch implementation provided by the host app');
}

/** Pull an HTTP status out of errors like "HTTP 503". */
function statusFromError(e: any): number | undefined {
  const m = /HTTP (\d{3})/.exec(String((e && e.message) || e || ''));
  return m ? parseInt(m[1], 10) : undefined;
}

async function fetchText(url: string): Promise<string> {
  let lastError: any = new Error('Request failed');
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let status: number | undefined;
    try {
      const res = await withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS);
      status = res.status;
      if (status === 429 || (status !== undefined && status >= 500)) {
        throw new Error('Server responded with HTTP ' + status);
      }
      return res.text;
    } catch (e) {
      lastError = e;
      if (status === undefined) status = statusFromError(e);
      const msg = String((e && (e as Error).message) || e || '');
      const retryable =
        status === undefined ||
        status === 429 ||
        status >= 500 ||
        /timed out/i.test(msg);
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) break;
      // Exponential backoff with jitter: ~1s, ~2s. Gentle on the site.
      await sleep(1000 * Math.pow(2, attempt - 1) + Math.random() * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** fetchText with the size cap applied — used for every API call. */
async function fetchCappedText(url: string): Promise<string> {
  const text = await fetchText(url);
  if (text.length > MAX_RESPONSE_CHARS)
    throw new Error('Response too large to parse safely');
  return text;
}

function mapStatus(s: string): string {
  if (s === 'Ongoing') return NovelStatus.Ongoing;
  if (s === 'Completed') return NovelStatus.Completed;
  if (s === 'Hiatus' || s === 'On Hiatus') return NovelStatus.OnHiatus;
  if (s === 'Cancelled' || s === 'Dropped') return NovelStatus.Cancelled;
  return NovelStatus.Unknown;
}

const API_BASE = 'https://lorenovels.com/wp-json/wp/v2';
const API_FIELDS = '&_fields=slug,title,content';

class Lorenovels implements Plugin.PluginBase {
  id = 'lorenovels';
  name = 'Lorenovels';
  icon = 'src/en/lorenovels/icon.png';
  site = 'https://lorenovels.com';
  version = '1.0.3';

  // slug -> cover URL, built once per session from the homepage cards.
  // The novel pages themselves don't show covers, so without this the
  // browse/search lists would have no covers at all.
  private coverMap: Map<string, string> | null = null;

  private async ensureCoverMap(): Promise<Map<string, string>> {
    if (this.coverMap) return this.coverMap;
    const map = new Map<string, string>();
    try {
      const html = await fetchCappedText(this.site + '/');
      for (const [slug, url] of coverMapFromCards(parseNovelCards(html))) {
        map.set(slug, url);
      }
    } catch (e) {
      // Covers are a bonus: the novel lists still work without them.
    }
    this.coverMap = map;
    return map;
  }

  async popularNovels(
    pageNo: number,
    _options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    // The site is WordPress; the REST API lists every page and the
    // parser keeps only the novel pages (the ones with a chapter list).
    const json = await fetchCappedText(
      API_BASE + '/pages?per_page=100' + API_FIELDS,
    );
    const covers = await this.ensureCoverMap();
    return parseCatalogResults(json).map(n => ({
      name: n.title,
      path: '/' + n.slug + '/',
      cover: covers.get(n.slug),
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/').filter(Boolean).pop() || '';
    const html = await fetchText(this.site + novelPath);
    const d = parseNovelPage(html, slug);
    if (!d) throw new Error('Could not load novel details');

    const chapters: Plugin.ChapterItem[] = d.chapters.map((c, i) => ({
      name: c.title,
      path: '/' + c.slug + '/',
      chapterNumber: i + 1,
    }));

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: d.name,
      status: mapStatus(d.status),
    };
    if (d.cover) novel.cover = d.cover;
    else {
      const covers = await this.ensureCoverMap();
      const cover = covers.get(slug);
      if (cover) novel.cover = cover;
    }
    if (d.author) novel.author = d.author;
    if (d.genres.length) novel.genres = d.genres.join(', ');
    if (d.summary) novel.summary = d.summary;
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchText(this.site + chapterPath);
    const content = parseChapterPage(html);
    if (content === null) {
      return (
        '<p><strong>Could not load this chapter.</strong></p>' +
        '<p>It may have been removed or is temporarily unavailable on Lorenovels.</p>'
      );
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const json = await fetchCappedText(
      API_BASE +
        '/pages?search=' +
        encodeURIComponent(searchTerm) +
        '&per_page=20' +
        API_FIELDS,
    );
    const covers = await this.ensureCoverMap();
    return parseSearchResults(json).map(n => ({
      name: n.title,
      path: '/' + n.slug + '/',
      cover: covers.get(n.slug),
    }));
  }

  resolveUrl = (path: string, _isNovel?: boolean): string => this.site + path;
}

export default new Lorenovels();
