// Pure parsing helpers for the Lorenovels LNReader plugin.
// These functions take raw HTML / JSON and have no dependencies,
// so they can be unit-tested in plain Node.

export interface NovelCard {
  slug: string;
  title: string;
  coverUrl: string;
}

export interface ChapterInfo {
  slug: string;
  title: string;
}

export interface NovelDetails {
  name: string;
  author: string;
  genres: string[];
  status: string;
  cover: string;
  summary: string;
  chapters: ChapterInfo[];
}

/**
 * Upper bound on a page this plugin will parse. Site pages are orders
 * of magnitude smaller; anything bigger is a broken or hostile
 * response, and regex-scanning it would bill the reader's phone, not
 * the site. Enforced before any parsing happens.
 */
export const MAX_PAGE_CHARS = 10000000;

/** Upper bound on a REST API response (the full page catalog is ~2MB). */
export const MAX_RESPONSE_CHARS = 10000000;

const HTML_ENTITY_CHARS: Record<string, string> = {
  amp: '&',
  quot: '"',
  '#39': "'",
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function decodeHtmlEntities(s: string): string {
  // Named entities first (single pass so "&amp;lt;" stays literal),
  // then numeric entities (&#8217; / &#x2019;).
  return s
    .replace(
      /&(amp|quot|#39|apos|lt|gt|nbsp|ndash|mdash|hellip|lsquo|rsquo|ldquo|rdquo);/g,
      (m, e: string) => HTML_ENTITY_CHARS[e] ?? m,
    )
    .replace(/&#(\d+);/g, (_m, n: string) => {
      const cp = parseInt(n, 10);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => {
      const cp = parseInt(n, 16);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
    });
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function cleanText(s: string): string {
  return decodeHtmlEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

/** Remove scripts, styles and HTML comments so tag counting can't break. */
function removeNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

// --- Homepage novel cards ------------------------------------------------
// Each card is a <figure class="wp-block-image"> linking the novel page
// with the cover <img>, followed by an <h2 class="wp-block-heading">
// linking the same URL with the novel title.

const FIGURE_RE =
  /<figure[^>]*class="[^"]*wp-block-image[^"]*"[^>]*>([\s\S]*?)<\/figure\s*>/gi;
const FIGURE_LINK_RE =
  /<a[^>]*href="(https:\/\/lorenovels\.com\/([a-z0-9-]+)\/)"[^>]*>/i;
const FIGURE_IMG_RE =
  /<img[^>]*?(?:data-src="(https:\/\/[^"]+)"|src="(https:\/\/[^"]+)")[^>]*>/i;

/**
 * Parse the homepage novel cards. Returns one card per novel with its
 * cover URL ('' when the site shows its No-cover placeholder).
 */
export function parseNovelCards(html: string): NovelCard[] {
  if (html.length > MAX_PAGE_CHARS)
    throw new Error('Page too large to parse safely');
  const out: NovelCard[] = [];
  const seen = new Set<string>();
  let fm: RegExpExecArray | null;
  FIGURE_RE.lastIndex = 0;
  while ((fm = FIGURE_RE.exec(html)) !== null) {
    const figure = fm[1];
    const lm = FIGURE_LINK_RE.exec(figure);
    if (!lm) continue;
    const slug = lm[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const im = FIGURE_IMG_RE.exec(figure);
    let cover = '';
    if (im) {
      cover = im[1] || im[2] || '';
      // The site's own "no cover" placeholder is not a real cover.
      if (/No-cover/i.test(cover)) cover = '';
    }
    // The title sits in the <h2> right after the figure.
    const after = html.slice(fm.index + fm[0].length, fm.index + fm[0].length + 2000);
    const tm = new RegExp(
      '<h2[^>]*>\\s*<a[^>]*href="https:\\/\\/lorenovels\\.com\\/' +
        slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '\\/"[^>]*>([^<]*)<\\/a>',
      'i',
    ).exec(after);
    out.push({
      slug,
      title: tm ? cleanText(tm[1]) : slug,
      coverUrl: cover,
    });
  }
  return out;
}

/** slug -> cover URL map from the homepage cards. */
export function coverMapFromCards(cards: NovelCard[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cards) {
    if (c.coverUrl) map.set(c.slug, c.coverUrl);
  }
  return map;
}

// --- Novel page ----------------------------------------------------------
// Labels are <p>Title:</p>/<p>Author:</p>/<p>Genre:</p>/<p>Status:</p>
// followed by an <h2> value (status value is a link in a button div).
// Synopsis: <p class="wp-block-paragraph"> between the status block and
// the chapter list. Chapters: <ul class="wp-block-latest-posts__list">
// with <li><a class="wp-block-latest-posts__post-title">, newest first.

function labelValue(html: string, label: string): string {
  const re = new RegExp(
    '<p[^>]*>\\s*' +
      label +
      ':\\s*<\\/p>\\s*<h2[^>]*>([^<]*)<\\/h2>',
    'i',
  );
  const m = re.exec(html);
  return m ? cleanText(m[1]) : '';
}

function statusValue(html: string): string {
  const li = html.search(/<p[^>]*>\s*Status:\s*<\/p>/i);
  if (li < 0) return '';
  const window = html.slice(li, li + 1500);
  const m = /<a[^>]*>([^<]*)<\/a>/i.exec(window);
  return m ? cleanText(m[1]) : '';
}

const COVER_PLACEHOLDER_RE = /No-cover/i;

function novelCover(html: string): string {
  const m = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i.exec(html);
  if (!m) return '';
  const url = m[1];
  return COVER_PLACEHOLDER_RE.test(url) ? '' : url;
}

function novelSummary(html: string): string {
  const statusAt = html.search(/<p[^>]*>\s*Status:\s*<\/p>/i);
  if (statusAt < 0) return '';
  // Synopsis runs from the status block to the chapter list (or the
  // "Start Reading" button, whichever comes first).
  let end = html.indexOf('wp-block-latest-posts__list', statusAt);
  const sr = html.indexOf('Start Reading', statusAt);
  if (sr >= 0 && (end < 0 || sr < end)) end = sr;
  if (end < 0) end = Math.min(html.length, statusAt + 50000);
  const section = html.slice(statusAt, end);
  const paras: string[] = [];
  const re = /<p[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(section)) !== null && count < 60) {
    const t = cleanText(m[1]);
    if (t) {
      paras.push(t);
      count++;
    }
  }
  return paras.join('\n\n');
}

function novelChapters(html: string): ChapterInfo[] {
  const ulm =
    /<ul[^>]*class="[^"]*wp-block-latest-posts__list[^"]*"[^>]*>([\s\S]*?)<\/ul\s*>/i.exec(
      html,
    );
  if (!ulm) return [];
  const listHtml = ulm[1];
  const out: ChapterInfo[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(listHtml)) !== null) {
    const tag = m[0];
    if (!/wp-block-latest-posts__post-title/.test(tag)) continue;
    const hm = /href="(https:\/\/lorenovels\.com\/([a-z0-9-]+)\/?)"/i.exec(tag);
    if (!hm) continue;
    const slug = hm[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const close = listHtml.indexOf('</a>', m.index);
    const title =
      close > m.index
        ? cleanText(listHtml.slice(m.index + tag.length, close))
        : slug;
    out.push({ slug, title });
  }
  // The site lists newest first; readers expect oldest first.
  out.reverse();
  return out;
}

/**
 * Parse a /<novel-slug>/ page. Returns null when the page is not a
 * novel page (missing the Title label), so parseNovel can fail loudly
 * instead of returning an empty novel.
 */
export function parseNovelPage(
  html: string,
  slug: string,
): NovelDetails | null {
  if (html.length > MAX_PAGE_CHARS)
    throw new Error('Page too large to parse safely');
  const clean = removeNoise(html);
  const name = labelValue(clean, 'Title');
  if (!name) return null;
  const author = labelValue(clean, 'Author');
  const genreText = labelValue(clean, 'Genre');
  const genres = genreText
    .split(',')
    .map(g => g.trim())
    .filter(g => g.length > 0);
  return {
    name,
    author,
    genres,
    status: statusValue(clean),
    cover: novelCover(clean),
    summary: novelSummary(clean),
    chapters: novelChapters(clean),
  };
}

// --- Chapter page --------------------------------------------------------
// Content: <div class="entry-content wp-block-post-content"> holding
// <p class="wp-block-paragraph"> paragraphs. The membership upsell and
// navigation sit outside that div and are excluded by construction.

function entryContentInner(html: string): string | null {
  const open = /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i.exec(html);
  if (!open) return null;
  const rest = html.slice(open.index + open[0].length);
  // Walk div depth to the matching close tag.
  let depth = 1;
  const re = /<(\/?)div(\s|>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    if (m[1]) depth--;
    else depth++;
    if (depth === 0) return rest.slice(0, m.index);
  }
  return null;
}

function sanitizeInner(inner: string): string {
  let s = inner;
  // Drop dangerous/irrelevant elements entirely.
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  s = s.replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, '');
  s = s.replace(/<(object|embed|form|input|button)[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<(object|embed|form|input|button)[^>]*\/?>/gi, '');
  // Strip event-handler attributes and javascript: URLs.
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/(href|src)\s*=\s*("|\')\s*javascript:[^"']*\2/gi, '$1=$2#$$2');
  // Lazy-loaded images use data-src with a placeholder src.
  s = s.replace(
    /<img([^>]*?)\sdata-src="(https?:\/\/[^"]+)"([^>]*?)>/gi,
    (_mm, pre: string, url: string, post: string) => {
      const cleaned = (pre + ' ' + post).replace(
        /\ssrc\s*=\s*("[^"]*"|'[^']*')/i,
        '',
      );
      return '<img' + cleaned + ' src="' + url + '">';
    },
  );
  return s.trim();
}

/**
 * Parse a /<chapter-slug>/ page into reader HTML.
 * Returns null when the page has no readable content.
 */
export function parseChapterPage(html: string): string | null {
  if (html.length > MAX_PAGE_CHARS)
    throw new Error('Page too large to parse safely');
  if (/<title[^>]*>[\s\S]{0,200}?(not found|404|page can't be found)/i.test(html))
    return null;
  const clean = removeNoise(html);
  const inner = entryContentInner(clean);
  if (!inner) return null;
  const paras: string[] = [];
  const re =
    /<p[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(inner)) !== null && count < 5000) {
    const body = sanitizeInner(m[1]);
    // Keep paragraphs that have text or an image; drop empties.
    const text = cleanText(body);
    if (text || /<img/i.test(body)) {
      paras.push('<p>' + body + '</p>');
      count++;
    }
  }
  if (paras.length === 0) return null;
  return paras.join('\n');
}

// --- REST API (search + catalog) -----------------------------------------
// /wp-json/wp/v2/pages?search=... returns every matching page; novel
// pages are the ones whose content carries the chapter list.

export interface ApiPage {
  slug: string;
  title: string;
}

function parseApiPages(jsonText: string): ApiPage[] {
  if (jsonText.length > MAX_RESPONSE_CHARS)
    throw new Error('Response too large to parse safely');
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: ApiPage[] = [];
  const seen = new Set<string>();
  for (const p of data) {
    if (!p || typeof p !== 'object') continue;
    const rec = p as Record<string, unknown>;
    const slug = typeof rec.slug === 'string' ? rec.slug : '';
    if (!slug || seen.has(slug)) continue;
    const content =
      rec.content && typeof rec.content === 'object'
        ? String((rec.content as Record<string, unknown>).rendered || '')
        : '';
    // Novel pages embed their chapter list; plain pages don't.
    if (!/wp-block-latest-posts__post-title/.test(content)) continue;
    seen.add(slug);
    const titleRec =
      rec.title && typeof rec.title === 'object'
        ? (rec.title as Record<string, unknown>)
        : {};
    const title =
      typeof titleRec.rendered === 'string'
        ? cleanText(titleRec.rendered)
        : slug;
    out.push({ slug, title });
  }
  return out;
}

/** Parse a /wp-json/wp/v2/pages?search=... response into novel cards. */
export function parseSearchResults(jsonText: string): NovelCard[] {
  return parseApiPages(jsonText).map(p => ({
    slug: p.slug,
    title: p.title,
    coverUrl: '',
  }));
}

/** Parse a /wp-json/wp/v2/pages?per_page=100 response into novel cards. */
export function parseCatalogResults(jsonText: string): NovelCard[] {
  return parseApiPages(jsonText).map(p => ({
    slug: p.slug,
    title: p.title,
    coverUrl: '',
  }));
}
