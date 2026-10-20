"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = function(cb, mod) {
  return function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
};

// .tsc-build/parsers.js
var require_parsers = __commonJS({
  ".tsc-build/parsers.js": function(exports2) {
    "use strict";
    var __values2 = exports2 && exports2.__values || function(o) {
      var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
      if (m) return m.call(o);
      if (o && typeof o.length === "number") return {
        next: function() {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
        }
      };
      throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MAX_RESPONSE_CHARS = exports2.MAX_PAGE_CHARS = void 0;
    exports2.decodeHtmlEntities = decodeHtmlEntities;
    exports2.parseNovelCards = parseNovelCards;
    exports2.coverMapFromCards = coverMapFromCards;
    exports2.parseNovelPage = parseNovelPage;
    exports2.parseChapterPage = parseChapterPage;
    exports2.parseSearchResults = parseSearchResults;
    exports2.parseCatalogResults = parseCatalogResults;
    exports2.MAX_PAGE_CHARS = 1e7;
    exports2.MAX_RESPONSE_CHARS = 1e7;
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
      return s.replace(/&(amp|quot|#39|apos|lt|gt|nbsp|ndash|mdash|hellip|lsquo|rsquo|ldquo|rdquo);/g, function(m, e) {
        var _a;
        return (_a = HTML_ENTITY_CHARS[e]) !== null && _a !== void 0 ? _a : m;
      }).replace(/&#(\d+);/g, function(_m, n) {
        return codePointToString(parseInt(n, 10));
      }).replace(/&#x([0-9a-fA-F]+);/g, function(_m, n) {
        return codePointToString(parseInt(n, 16));
      });
    }
    function codePointToString(cp) {
      if (isNaN(cp) || cp < 0 || cp > 1114111)
        return "\uFFFD";
      if (cp <= 65535)
        return String.fromCharCode(cp);
      var v = cp - 65536;
      return String.fromCharCode(55296 + (v >> 10), 56320 + (v & 1023));
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
      if (html.length > exports2.MAX_PAGE_CHARS)
        throw new Error("Page too large to parse safely");
      var out = [];
      var seen = /* @__PURE__ */ new Set();
      var fm;
      FIGURE_RE.lastIndex = 0;
      while ((fm = FIGURE_RE.exec(html)) !== null) {
        var figure = fm[1];
        var lm = FIGURE_LINK_RE.exec(figure);
        if (!lm)
          continue;
        var slug = lm[2];
        if (seen.has(slug))
          continue;
        seen.add(slug);
        var im = FIGURE_IMG_RE.exec(figure);
        var cover = "";
        if (im) {
          cover = im[1] || im[2] || "";
          if (/No-cover/i.test(cover))
            cover = "";
        }
        var after = html.slice(fm.index + fm[0].length, fm.index + fm[0].length + 2e3);
        var tm = new RegExp('<h2[^>]*>\\s*<a[^>]*href="https:\\/\\/lorenovels\\.com\\/' + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\/"[^>]*>([^<]*)<\\/a>', "i").exec(after);
        out.push({
          slug: slug,
          title: tm ? cleanText(tm[1]) : slug,
          coverUrl: cover
        });
      }
      return out;
    }
    function coverMapFromCards(cards) {
      var e_1, _a;
      var map = /* @__PURE__ */ new Map();
      try {
        for (var cards_1 = __values2(cards), cards_1_1 = cards_1.next(); !cards_1_1.done; cards_1_1 = cards_1.next()) {
          var c = cards_1_1.value;
          if (c.coverUrl)
            map.set(c.slug, c.coverUrl);
        }
      } catch (e_1_1) {
        e_1 = { error: e_1_1 };
      } finally {
        try {
          if (cards_1_1 && !cards_1_1.done && (_a = cards_1.return)) _a.call(cards_1);
        } finally {
          if (e_1) throw e_1.error;
        }
      }
      return map;
    }
    function labelValue(html, label) {
      var re = new RegExp("<p[^>]*>\\s*" + label + ":\\s*<\\/p>\\s*<h2[^>]*>([^<]*)<\\/h2>", "i");
      var m = re.exec(html);
      return m ? cleanText(m[1]) : "";
    }
    function statusValue(html) {
      var li = html.search(/<p[^>]*>\s*Status:\s*<\/p>/i);
      if (li < 0)
        return "";
      var window = html.slice(li, li + 1500);
      var m = /<a[^>]*>([^<]*)<\/a>/i.exec(window);
      return m ? cleanText(m[1]) : "";
    }
    var COVER_PLACEHOLDER_RE = /No-cover/i;
    function novelCover(html) {
      var m = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i.exec(html);
      if (!m)
        return "";
      var url = m[1];
      return COVER_PLACEHOLDER_RE.test(url) ? "" : url;
    }
    function novelSummary(html) {
      var statusAt = html.search(/<p[^>]*>\s*Status:\s*<\/p>/i);
      if (statusAt < 0)
        return "";
      var end = html.indexOf("wp-block-latest-posts__list", statusAt);
      var sr = html.indexOf("Start Reading", statusAt);
      if (sr >= 0 && (end < 0 || sr < end))
        end = sr;
      if (end < 0)
        end = Math.min(html.length, statusAt + 5e4);
      var section = html.slice(statusAt, end);
      var paras = [];
      var re = /<p[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p\s*>/gi;
      var m;
      var count = 0;
      while ((m = re.exec(section)) !== null && count < 60) {
        var t = cleanText(m[1]);
        if (t) {
          paras.push(t);
          count++;
        }
      }
      return paras.join("\n\n");
    }
    function novelChapters(html) {
      var ulm = /<ul[^>]*class="[^"]*wp-block-latest-posts__list[^"]*"[^>]*>([\s\S]*?)<\/ul\s*>/i.exec(html);
      if (!ulm)
        return [];
      var listHtml = ulm[1];
      var out = [];
      var seen = /* @__PURE__ */ new Set();
      var re = /<a[^>]*>/gi;
      var m;
      while ((m = re.exec(listHtml)) !== null) {
        var tag = m[0];
        if (!/wp-block-latest-posts__post-title/.test(tag))
          continue;
        var hm = /href="(https:\/\/lorenovels\.com\/([a-z0-9-]+)\/?)"/i.exec(tag);
        if (!hm)
          continue;
        var slug = hm[2];
        if (seen.has(slug))
          continue;
        seen.add(slug);
        var close_1 = listHtml.indexOf("</a>", m.index);
        var title = close_1 > m.index ? cleanText(listHtml.slice(m.index + tag.length, close_1)) : slug;
        out.push({ slug: slug, title: title });
      }
      out.reverse();
      return out;
    }
    function parseNovelPage(html, slug) {
      if (html.length > exports2.MAX_PAGE_CHARS)
        throw new Error("Page too large to parse safely");
      var clean = removeNoise(html);
      var name = labelValue(clean, "Title");
      if (!name)
        return null;
      var author = labelValue(clean, "Author");
      var genreText = labelValue(clean, "Genre");
      var genres = genreText.split(",").map(function(g) {
        return g.trim();
      }).filter(function(g) {
        return g.length > 0;
      });
      return {
        name: name,
        author: author,
        genres: genres,
        status: statusValue(clean),
        cover: novelCover(clean),
        summary: novelSummary(clean),
        chapters: novelChapters(clean)
      };
    }
    function entryContentInner(html) {
      var open = /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i.exec(html);
      if (!open)
        return null;
      var rest = html.slice(open.index + open[0].length);
      var depth = 1;
      var re = /<(\/?)div(\s|>)/gi;
      var m;
      while ((m = re.exec(rest)) !== null) {
        if (m[1])
          depth--;
        else
          depth++;
        if (depth === 0)
          return rest.slice(0, m.index);
      }
      return null;
    }
    function sanitizeInner(inner) {
      var s = inner;
      s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
      s = s.replace(/<style[\s\S]*?<\/style\s*>/gi, "");
      s = s.replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, "");
      s = s.replace(/<(object|embed|form|input|button)[\s\S]*?<\/\1\s*>/gi, "");
      s = s.replace(/<(object|embed|form|input|button)[^>]*\/?>/gi, "");
      s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      s = s.replace(/(href|src)\s*=\s*("|\')\s*javascript:[^"']*\2/gi, "$1=$2#$$2");
      s = s.replace(/<img([^>]*?)\sdata-src="(https?:\/\/[^"]+)"([^>]*?)>/gi, function(_mm, pre, url, post) {
        var cleaned = (pre + " " + post).replace(/\ssrc\s*=\s*("[^"]*"|'[^']*')/i, "");
        return "<img" + cleaned + ' src="' + url + '">';
      });
      return s.trim();
    }
    function parseChapterPage(html) {
      if (html.length > exports2.MAX_PAGE_CHARS)
        throw new Error("Page too large to parse safely");
      if (/<title[^>]*>[\s\S]{0,200}?(not found|404|page can't be found)/i.test(html))
        return null;
      var clean = removeNoise(html);
      var inner = entryContentInner(clean);
      if (!inner)
        return null;
      var paras = [];
      var re = /<p[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p\s*>/gi;
      var m;
      var count = 0;
      while ((m = re.exec(inner)) !== null && count < 5e3) {
        var body = sanitizeInner(m[1]);
        var text = cleanText(body);
        if (text || /<img/i.test(body)) {
          paras.push("<p>" + body + "</p>");
          count++;
        }
      }
      if (paras.length === 0)
        return null;
      return paras.join("\n");
    }
    function parseApiPages(jsonText) {
      var e_2, _a;
      if (jsonText.length > exports2.MAX_RESPONSE_CHARS)
        throw new Error("Response too large to parse safely");
      var data;
      try {
        data = JSON.parse(jsonText);
      } catch (_b) {
        return [];
      }
      if (!Array.isArray(data))
        return [];
      var out = [];
      var seen = /* @__PURE__ */ new Set();
      try {
        for (var data_1 = __values2(data), data_1_1 = data_1.next(); !data_1_1.done; data_1_1 = data_1.next()) {
          var p = data_1_1.value;
          if (!p || typeof p !== "object")
            continue;
          var rec = p;
          var slug = typeof rec.slug === "string" ? rec.slug : "";
          if (!slug || seen.has(slug))
            continue;
          var content = rec.content && typeof rec.content === "object" ? String(rec.content.rendered || "") : "";
          if (!/wp-block-latest-posts__post-title/.test(content))
            continue;
          seen.add(slug);
          var titleRec = rec.title && typeof rec.title === "object" ? rec.title : {};
          var title = typeof titleRec.rendered === "string" ? cleanText(titleRec.rendered) : slug;
          out.push({ slug: slug, title: title });
        }
      } catch (e_2_1) {
        e_2 = { error: e_2_1 };
      } finally {
        try {
          if (data_1_1 && !data_1_1.done && (_a = data_1.return)) _a.call(data_1);
        } finally {
          if (e_2) throw e_2.error;
        }
      }
      return out;
    }
    function parseSearchResults(jsonText) {
      return parseApiPages(jsonText).map(function(p) {
        return {
          slug: p.slug,
          title: p.title,
          coverUrl: ""
        };
      });
    }
    function parseCatalogResults(jsonText) {
      return parseApiPages(jsonText).map(function(p) {
        return {
          slug: p.slug,
          title: p.title,
          coverUrl: ""
        };
      });
    }
  }
});

// .tsc-build/plugin.js
var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = exports && exports.__generator || function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __values = exports && exports.__values || function(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = exports && exports.__read || function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error: error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
Object.defineProperty(exports, "__esModule", { value: true });
var parsers_1 = require_parsers();
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    var lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus)
      return lib.NovelStatus;
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
  return new Promise(function(resolve) {
    if (typeof setTimeout === "function")
      setTimeout(resolve, ms);
    else
      resolve();
  });
}
function withTimeout(p, ms) {
  var timer = void 0;
  var timeout = new Promise(function(_, reject) {
    if (typeof setTimeout === "function") {
      timer = setTimeout(function() {
        return reject(new Error("Request timed out"));
      }, ms);
    }
  });
  var clear = function() {
    if (timer !== void 0)
      clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(function(v) {
    clear();
    return v;
  }, function(e) {
    clear();
    throw e;
  });
}
function fetchRaw(url) {
  return __awaiter(this, void 0, void 0, function() {
    var res, status_1, text, _a;
    var _b;
    return __generator(this, function(_c) {
      switch (_c.label) {
        case 0:
          if (!(typeof fetchLib.fetchApi === "function")) return [3, 5];
          return [4, fetchLib.fetchApi(url)];
        case 1:
          res = _c.sent();
          status_1 = res && typeof res.status === "number" ? res.status : void 0;
          if (!(res && typeof res.text === "function")) return [3, 3];
          return [4, res.text()];
        case 2:
          _a = _c.sent();
          return [3, 4];
        case 3:
          _a = "";
          _c.label = 4;
        case 4:
          text = _a;
          return [2, { status: status_1, text: text }];
        case 5:
          if (!(typeof fetchLib.fetchText === "function")) return [3, 7];
          _b = {};
          return [4, fetchLib.fetchText(url)];
        case 6:
          return [2, (_b.text = _c.sent(), _b)];
        case 7:
          throw new Error("No fetch implementation provided by the host app");
      }
    });
  });
}
function statusFromError(e) {
  var m = /HTTP (\d{3})/.exec(String(e && e.message || e || ""));
  return m ? parseInt(m[1], 10) : void 0;
}
function fetchText(url) {
  return __awaiter(this, void 0, void 0, function() {
    var lastError, attempt, status_2, res, e_1, msg, retryable;
    return __generator(this, function(_a) {
      switch (_a.label) {
        case 0:
          lastError = new Error("Request failed");
          attempt = 1;
          _a.label = 1;
        case 1:
          if (!(attempt <= MAX_FETCH_ATTEMPTS)) return [3, 7];
          status_2 = void 0;
          _a.label = 2;
        case 2:
          _a.trys.push([2, 4, , 6]);
          return [4, withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS)];
        case 3:
          res = _a.sent();
          status_2 = res.status;
          if (status_2 === 429 || status_2 !== void 0 && status_2 >= 500) {
            throw new Error("Server responded with HTTP " + status_2);
          }
          return [2, res.text];
        case 4:
          e_1 = _a.sent();
          lastError = e_1;
          if (status_2 === void 0)
            status_2 = statusFromError(e_1);
          msg = String(e_1 && e_1.message || e_1 || "");
          retryable = status_2 === void 0 || status_2 === 429 || status_2 >= 500 || /timed out/i.test(msg);
          if (!retryable || attempt === MAX_FETCH_ATTEMPTS)
            return [3, 7];
          return [4, sleep(1e3 * Math.pow(2, attempt - 1) + Math.random() * 500)];
        case 5:
          _a.sent();
          return [3, 6];
        case 6:
          attempt++;
          return [3, 1];
        case 7:
          throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
    });
  });
}
function fetchCappedText(url) {
  return __awaiter(this, void 0, void 0, function() {
    var text;
    return __generator(this, function(_a) {
      switch (_a.label) {
        case 0:
          return [4, fetchText(url)];
        case 1:
          text = _a.sent();
          if (text.length > parsers_1.MAX_RESPONSE_CHARS)
            throw new Error("Response too large to parse safely");
          return [2, text];
      }
    });
  });
}
function mapStatus(s) {
  if (s === "Ongoing")
    return NovelStatus.Ongoing;
  if (s === "Completed")
    return NovelStatus.Completed;
  if (s === "Hiatus" || s === "On Hiatus")
    return NovelStatus.OnHiatus;
  if (s === "Cancelled" || s === "Dropped")
    return NovelStatus.Cancelled;
  return NovelStatus.Unknown;
}
var API_BASE = "https://lorenovels.com/wp-json/wp/v2";
var API_FIELDS = "&_fields=slug,title,content";
var Lorenovels = (
  /** @class */
  (function() {
    function Lorenovels2() {
      var _this = this;
      this.id = "lorenovels";
      this.name = "Lorenovels";
      this.icon = "src/en/lorenovels/icon.png";
      this.site = "https://lorenovels.com";
      this.version = "1.0.3";
      this.coverMap = null;
      this.resolveUrl = function(path, _isNovel) {
        return _this.site + path;
      };
    }
    Lorenovels2.prototype.ensureCoverMap = function() {
      return __awaiter(this, void 0, void 0, function() {
        var map, html, _a, _b, _c, slug, url, e_2;
        var e_3, _d;
        return __generator(this, function(_e) {
          switch (_e.label) {
            case 0:
              if (this.coverMap)
                return [2, this.coverMap];
              map = /* @__PURE__ */ new Map();
              _e.label = 1;
            case 1:
              _e.trys.push([1, 3, , 4]);
              return [4, fetchCappedText(this.site + "/")];
            case 2:
              html = _e.sent();
              try {
                for (_a = __values((0, parsers_1.coverMapFromCards)((0, parsers_1.parseNovelCards)(html))), _b = _a.next(); !_b.done; _b = _a.next()) {
                  _c = __read(_b.value, 2), slug = _c[0], url = _c[1];
                  map.set(slug, url);
                }
              } catch (e_3_1) {
                e_3 = { error: e_3_1 };
              } finally {
                try {
                  if (_b && !_b.done && (_d = _a.return)) _d.call(_a);
                } finally {
                  if (e_3) throw e_3.error;
                }
              }
              return [3, 4];
            case 3:
              e_2 = _e.sent();
              return [3, 4];
            case 4:
              this.coverMap = map;
              return [2, map];
          }
        });
      });
    };
    Lorenovels2.prototype.popularNovels = function(pageNo, _options) {
      return __awaiter(this, void 0, void 0, function() {
        var json, covers;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (pageNo > 1)
                return [2, []];
              return [4, fetchCappedText(API_BASE + "/pages?per_page=100" + API_FIELDS)];
            case 1:
              json = _a.sent();
              return [4, this.ensureCoverMap()];
            case 2:
              covers = _a.sent();
              return [2, (0, parsers_1.parseCatalogResults)(json).map(function(n) {
                return {
                  name: n.title,
                  path: "/" + n.slug + "/",
                  cover: covers.get(n.slug)
                };
              })];
          }
        });
      });
    };
    Lorenovels2.prototype.parseNovel = function(novelPath) {
      return __awaiter(this, void 0, void 0, function() {
        var slug, html, d, chapters, novel, covers, cover;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              slug = novelPath.split("/").filter(Boolean).pop() || "";
              return [4, fetchText(this.site + novelPath)];
            case 1:
              html = _a.sent();
              d = (0, parsers_1.parseNovelPage)(html, slug);
              if (!d)
                throw new Error("Could not load novel details");
              chapters = d.chapters.map(function(c, i) {
                return {
                  name: c.title,
                  path: "/" + c.slug + "/",
                  chapterNumber: i + 1
                };
              });
              novel = {
                path: novelPath,
                name: d.name,
                status: mapStatus(d.status)
              };
              if (!d.cover) return [3, 2];
              novel.cover = d.cover;
              return [3, 4];
            case 2:
              return [4, this.ensureCoverMap()];
            case 3:
              covers = _a.sent();
              cover = covers.get(slug);
              if (cover)
                novel.cover = cover;
              _a.label = 4;
            case 4:
              if (d.author)
                novel.author = d.author;
              if (d.genres.length)
                novel.genres = d.genres.join(", ");
              if (d.summary)
                novel.summary = d.summary;
              novel.chapters = chapters;
              return [2, novel];
          }
        });
      });
    };
    Lorenovels2.prototype.parseChapter = function(chapterPath) {
      return __awaiter(this, void 0, void 0, function() {
        var html, content;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText(this.site + chapterPath)];
            case 1:
              html = _a.sent();
              content = (0, parsers_1.parseChapterPage)(html);
              if (content === null) {
                return [2, "<p><strong>Could not load this chapter.</strong></p><p>It may have been removed or is temporarily unavailable on Lorenovels.</p>"];
              }
              return [2, content];
          }
        });
      });
    };
    Lorenovels2.prototype.searchNovels = function(searchTerm, pageNo) {
      return __awaiter(this, void 0, void 0, function() {
        var json, covers;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (pageNo > 1)
                return [2, []];
              return [4, fetchCappedText(API_BASE + "/pages?search=" + encodeURIComponent(searchTerm) + "&per_page=20" + API_FIELDS)];
            case 1:
              json = _a.sent();
              return [4, this.ensureCoverMap()];
            case 2:
              covers = _a.sent();
              return [2, (0, parsers_1.parseSearchResults)(json).map(function(n) {
                return {
                  name: n.title,
                  path: "/" + n.slug + "/",
                  cover: covers.get(n.slug)
                };
              })];
          }
        });
      });
    };
    return Lorenovels2;
  })()
);
exports.default = new Lorenovels();
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
