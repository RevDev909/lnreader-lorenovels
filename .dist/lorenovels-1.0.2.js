var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/plugin.ts
var plugin_exports = {};
__export(plugin_exports, {
  default: () => plugin_default
});
module.exports = __toCommonJS(plugin_exports);

// src/parsers.ts
var MAX_PAGE_CHARS = 1e7;
var MAX_RESPONSE_CHARS = 1e7;
var HTML_ENTITY_CHARS = {
  amp: "&",
  quot: '"',
  "#39": "'",
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D"
};
function decodeHtmlEntities(s) {
  return s.replace(
    /&(amp|quot|#39|apos|lt|gt|nbsp|ndash|mdash|hellip|lsquo|rsquo|ldquo|rdquo);/g,
    (m, e) => {
      var _a;
      return (_a = HTML_ENTITY_CHARS[e]) != null ? _a : m;
    }
  ).replace(/&#(\d+);/g, (_m, n) => {
    const cp = parseInt(n, 10);
    return cp >= 0 && cp <= 1114111 ? String.fromCodePoint(cp) : "\uFFFD";
  }).replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
    const cp = parseInt(n, 16);
    return cp >= 0 && cp <= 1114111 ? String.fromCodePoint(cp) : "\uFFFD";
  });
}
function stripTags(s) {
  return s.replace(/<[^>]*>/g, "");
}
function cleanText(s) {
  return decodeHtmlEntities(stripTags(s)).replace(/\s+/g, " ").trim();
}
function removeNoise(html) {
  return html.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/<style[\s\S]*?<\/style\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
}
var FIGURE_RE = /<figure[^>]*class="[^"]*wp-block-image[^"]*"[^>]*>([\s\S]*?)<\/figure\s*>/gi;
var FIGURE_LINK_RE = /<a[^>]*href="(https:\/\/lorenovels\.com\/([a-z0-9-]+)\/)"[^>]*>/i;
var FIGURE_IMG_RE = /<img[^>]*?(?:data-src="(https:\/\/[^"]+)"|src="(https:\/\/[^"]+)")[^>]*>/i;
function parseNovelCards(html) {
  if (html.length > MAX_PAGE_CHARS)
    throw new Error("Page too large to parse safely");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  let fm;
  FIGURE_RE.lastIndex = 0;
  while ((fm = FIGURE_RE.exec(html)) !== null) {
    const figure = fm[1];
    const lm = FIGURE_LINK_RE.exec(figure);
    if (!lm) continue;
    const slug = lm[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const im = FIGURE_IMG_RE.exec(figure);
    let cover = "";
    if (im) {
      cover = im[1] || im[2] || "";
      if (/No-cover/i.test(cover)) cover = "";
    }
    const after = html.slice(fm.index + fm[0].length, fm.index + fm[0].length + 2e3);
    const tm = new RegExp(
      '<h2[^>]*>\\s*<a[^>]*href="https:\\/\\/lorenovels\\.com\\/' + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\/"[^>]*>([^<]*)<\\/a>',
      "i"
    ).exec(after);
    out.push({
      slug,
      title: tm ? cleanText(tm[1]) : slug,
      coverUrl: cover
    });
  }
  return out;
}
function coverMapFromCards(cards) {
  const map = /* @__PURE__ */ new Map();
  for (const c of cards) {
    if (c.coverUrl) map.set(c.slug, c.coverUrl);
  }
  return map;
}
function labelValue(html, label) {
  const re = new RegExp(
    "<p[^>]*>\\s*" + label + ":\\s*<\\/p>\\s*<h2[^>]*>([^<]*)<\\/h2>",
    "i"
  );
  const m = re.exec(html);
  return m ? cleanText(m[1]) : "";
}
function statusValue(html) {
  const li = html.search(/<p[^>]*>\s*Status:\s*<\/p>/i);
  if (li < 0) return "";
  const window = html.slice(li, li + 1500);
  const m = /<a[^>]*>([^<]*)<\/a>/i.exec(window);
  return m ? cleanText(m[1]) : "";
}
var COVER_PLACEHOLDER_RE = /No-cover/i;
function novelCover(html) {
  const m = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i.exec(html);
  if (!m) return "";
  const url = m[1];
  return COVER_PLACEHOLDER_RE.test(url) ? "" : url;
}
function novelSummary(html) {
  const statusAt = html.search(/<p[^>]*>\s*Status:\s*<\/p>/i);
  if (statusAt < 0) return "";
  let end = html.indexOf("wp-block-latest-posts__list", statusAt);
  const sr = html.indexOf("Start Reading", statusAt);
  if (sr >= 0 && (end < 0 || sr < end)) end = sr;
  if (end < 0) end = Math.min(html.length, statusAt + 5e4);
  const section = html.slice(statusAt, end);
  const paras = [];
  const re = /<p[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let m;
  let count = 0;
  while ((m = re.exec(section)) !== null && count < 60) {
    const t = cleanText(m[1]);
    if (t) {
      paras.push(t);
      count++;
    }
  }
  return paras.join("\n\n");
}
function novelChapters(html) {
  const ulm = /<ul[^>]*class="[^"]*wp-block-latest-posts__list[^"]*"[^>]*>([\s\S]*?)<\/ul\s*>/i.exec(
    html
  );
  if (!ulm) return [];
  const listHtml = ulm[1];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /<a[^>]*>/gi;
  let m;
  while ((m = re.exec(listHtml)) !== null) {
    const tag = m[0];
    if (!/wp-block-latest-posts__post-title/.test(tag)) continue;
    const hm = /href="(https:\/\/lorenovels\.com\/([a-z0-9-]+)\/?)"/i.exec(tag);
    if (!hm) continue;
    const slug = hm[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const close = listHtml.indexOf("</a>", m.index);
    const title = close > m.index ? cleanText(listHtml.slice(m.index + tag.length, close)) : slug;
    out.push({ slug, title });
  }
  out.reverse();
  return out;
}
function parseNovelPage(html, slug) {
  if (html.length > MAX_PAGE_CHARS)
    throw new Error("Page too large to parse safely");
  const clean = removeNoise(html);
  const name = labelValue(clean, "Title");
  if (!name) return null;
  const author = labelValue(clean, "Author");
  const genreText = labelValue(clean, "Genre");
  const genres = genreText.split(",").map((g) => g.trim()).filter((g) => g.length > 0);
  return {
    name,
    author,
    genres,
    status: statusValue(clean),
    cover: novelCover(clean),
    summary: novelSummary(clean),
    chapters: novelChapters(clean)
  };
}
function entryContentInner(html) {
  const open = /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i.exec(html);
  if (!open) return null;
  const rest = html.slice(open.index + open[0].length);
  let depth = 1;
  const re = /<(\/?)div(\s|>)/gi;
  let m;
  while ((m = re.exec(rest)) !== null) {
    if (m[1]) depth--;
    else depth++;
    if (depth === 0) return rest.slice(0, m.index);
  }
  return null;
}
function sanitizeInner(inner) {
  let s = inner;
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style\s*>/gi, "");
  s = s.replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, "");
  s = s.replace(/<(object|embed|form|input|button)[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<(object|embed|form|input|button)[^>]*\/?>/gi, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/(href|src)\s*=\s*("|\')\s*javascript:[^"']*\2/gi, "$1=$2#$$2");
  s = s.replace(
    /<img([^>]*?)\sdata-src="(https?:\/\/[^"]+)"([^>]*?)>/gi,
    (_mm, pre, url, post) => {
      const cleaned = (pre + " " + post).replace(
        /\ssrc\s*=\s*("[^"]*"|'[^']*')/i,
        ""
      );
      return "<img" + cleaned + ' src="' + url + '">';
    }
  );
  return s.trim();
}
function parseChapterPage(html) {
  if (html.length > MAX_PAGE_CHARS)
    throw new Error("Page too large to parse safely");
  if (/<title[^>]*>[\s\S]{0,200}?(not found|404|page can't be found)/i.test(html))
    return null;
  const clean = removeNoise(html);
  const inner = entryContentInner(clean);
  if (!inner) return null;
  const paras = [];
  const re = /<p[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let m;
  let count = 0;
  while ((m = re.exec(inner)) !== null && count < 5e3) {
    const body = sanitizeInner(m[1]);
    const text = cleanText(body);
    if (text || /<img/i.test(body)) {
      paras.push("<p>" + body + "</p>");
      count++;
    }
  }
  if (paras.length === 0) return null;
  return paras.join("\n");
}
function parseApiPages(jsonText) {
  if (jsonText.length > MAX_RESPONSE_CHARS)
    throw new Error("Response too large to parse safely");
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const p of data) {
    if (!p || typeof p !== "object") continue;
    const rec = p;
    const slug = typeof rec.slug === "string" ? rec.slug : "";
    if (!slug || seen.has(slug)) continue;
    const content = rec.content && typeof rec.content === "object" ? String(rec.content.rendered || "") : "";
    if (!/wp-block-latest-posts__post-title/.test(content)) continue;
    seen.add(slug);
    const titleRec = rec.title && typeof rec.title === "object" ? rec.title : {};
    const title = typeof titleRec.rendered === "string" ? cleanText(titleRec.rendered) : slug;
    out.push({ slug, title });
  }
  return out;
}
function parseSearchResults(jsonText) {
  return parseApiPages(jsonText).map((p) => ({
    slug: p.slug,
    title: p.title,
    coverUrl: ""
  }));
}
function parseCatalogResults(jsonText) {
  return parseApiPages(jsonText).map((p) => ({
    slug: p.slug,
    title: p.title,
    coverUrl: ""
  }));
}

// src/plugin.ts
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    const lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
  }
  return {
    Unknown: "Unknown",
    Ongoing: "Ongoing",
    Completed: "Completed",
    Licensed: "Licensed",
    PublishingFinished: "Publishing Finished",
    Cancelled: "Cancelled",
    OnHiatus: "On Hiatus"
  };
}
var fetchLib = loadFetchLib();
var NovelStatus = loadNovelStatus();
var FETCH_TIMEOUT_MS = 3e4;
var MAX_FETCH_ATTEMPTS = 3;
function sleep(ms) {
  return new Promise((resolve) => {
    if (typeof setTimeout === "function") setTimeout(resolve, ms);
    else resolve();
  });
}
function withTimeout(p, ms) {
  let timer = void 0;
  const timeout = new Promise((_, reject) => {
    if (typeof setTimeout === "function") {
      timer = setTimeout(() => reject(new Error("Request timed out")), ms);
    }
  });
  const clear = () => {
    if (timer !== void 0) clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(
    (v) => {
      clear();
      return v;
    },
    (e) => {
      clear();
      throw e;
    }
  );
}
async function fetchRaw(url) {
  if (typeof fetchLib.fetchApi === "function") {
    const res = await fetchLib.fetchApi(url);
    const status = res && typeof res.status === "number" ? res.status : void 0;
    const text = res && typeof res.text === "function" ? await res.text() : "";
    return { status, text };
  }
  if (typeof fetchLib.fetchText === "function") {
    return { text: await fetchLib.fetchText(url) };
  }
  throw new Error("No fetch implementation provided by the host app");
}
function statusFromError(e) {
  const m = /HTTP (\d{3})/.exec(String(e && e.message || e || ""));
  return m ? parseInt(m[1], 10) : void 0;
}
async function fetchText(url) {
  let lastError = new Error("Request failed");
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let status;
    try {
      const res = await withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS);
      status = res.status;
      if (status === 429 || status !== void 0 && status >= 500) {
        throw new Error("Server responded with HTTP " + status);
      }
      return res.text;
    } catch (e) {
      lastError = e;
      if (status === void 0) status = statusFromError(e);
      const msg = String(e && e.message || e || "");
      const retryable = status === void 0 || status === 429 || status >= 500 || /timed out/i.test(msg);
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) break;
      await sleep(1e3 * Math.pow(2, attempt - 1) + Math.random() * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
async function fetchCappedText(url) {
  const text = await fetchText(url);
  if (text.length > MAX_RESPONSE_CHARS)
    throw new Error("Response too large to parse safely");
  return text;
}
function mapStatus(s) {
  if (s === "Ongoing") return NovelStatus.Ongoing;
  if (s === "Completed") return NovelStatus.Completed;
  if (s === "Hiatus" || s === "On Hiatus") return NovelStatus.OnHiatus;
  if (s === "Cancelled" || s === "Dropped") return NovelStatus.Cancelled;
  return NovelStatus.Unknown;
}
var API_BASE = "https://lorenovels.com/wp-json/wp/v2";
var API_FIELDS = "&_fields=slug,title,content";
var Lorenovels = class {
  constructor() {
    __publicField(this, "id", "lorenovels");
    __publicField(this, "name", "Lorenovels");
    __publicField(this, "icon", "src/en/lorenovels/icon.png");
    __publicField(this, "site", "https://lorenovels.com");
    __publicField(this, "version", "1.0.2");
    // slug -> cover URL, built once per session from the homepage cards.
    // The novel pages themselves don't show covers, so without this the
    // browse/search lists would have no covers at all.
    __publicField(this, "coverMap", null);
    __publicField(this, "resolveUrl", (path, _isNovel) => this.site + path);
  }
  async ensureCoverMap() {
    if (this.coverMap) return this.coverMap;
    const map = /* @__PURE__ */ new Map();
    try {
      const html = await fetchCappedText(this.site + "/");
      for (const [slug, url] of coverMapFromCards(parseNovelCards(html))) {
        map.set(slug, url);
      }
    } catch (e) {
    }
    this.coverMap = map;
    return map;
  }
  async popularNovels(pageNo, _options) {
    if (pageNo > 1) return [];
    const json = await fetchCappedText(
      API_BASE + "/pages?per_page=100" + API_FIELDS
    );
    const covers = await this.ensureCoverMap();
    return parseCatalogResults(json).map((n) => ({
      name: n.title,
      path: "/" + n.slug + "/",
      cover: covers.get(n.slug)
    }));
  }
  async parseNovel(novelPath) {
    const slug = novelPath.split("/").filter(Boolean).pop() || "";
    const html = await fetchText(this.site + novelPath);
    const d = parseNovelPage(html, slug);
    if (!d) throw new Error("Could not load novel details");
    const chapters = d.chapters.map((c, i) => ({
      name: c.title,
      path: "/" + c.slug + "/",
      chapterNumber: i + 1
    }));
    const novel = {
      path: novelPath,
      name: d.name,
      status: mapStatus(d.status)
    };
    if (d.cover) novel.cover = d.cover;
    else {
      const covers = await this.ensureCoverMap();
      const cover = covers.get(slug);
      if (cover) novel.cover = cover;
    }
    if (d.author) novel.author = d.author;
    if (d.genres.length) novel.genres = d.genres.join(", ");
    if (d.summary) novel.summary = d.summary;
    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath) {
    const html = await fetchText(this.site + chapterPath);
    const content = parseChapterPage(html);
    if (content === null) {
      return "<p><strong>Could not load this chapter.</strong></p><p>It may have been removed or is temporarily unavailable on Lorenovels.</p>";
    }
    return content;
  }
  async searchNovels(searchTerm, pageNo) {
    if (pageNo > 1) return [];
    const json = await fetchCappedText(
      API_BASE + "/pages?search=" + encodeURIComponent(searchTerm) + "&per_page=20" + API_FIELDS
    );
    const covers = await this.ensureCoverMap();
    return parseSearchResults(json).map((n) => ({
      name: n.title,
      path: "/" + n.slug + "/",
      cover: covers.get(n.slug)
    }));
  }
};
var plugin_default = new Lorenovels();
try {
  if (typeof exports !== "undefined" && exports) {
    exports.default = (typeof plugin_default !== "undefined")
      ? plugin_default
      : (typeof module !== "undefined" && module && module.exports ? module.exports.default : undefined);
  }
} catch (e) {}
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
