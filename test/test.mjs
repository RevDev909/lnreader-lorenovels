// Integration test: fetch live pages from lorenovels.com and exercise
// the pure parsers exactly as the plugin will use them.
import {
  coverMapFromCards,
  parseCatalogResults,
  parseChapterPage,
  parseNovelCards,
  parseNovelPage,
  parseSearchResults,
} from './parsers.bundle.mjs';

const SITE = 'https://lorenovels.com';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const API = SITE + '/wp-json/wp/v2/pages';
const FIELDS = '&_fields=slug,title,content';

async function get(path) {
  const res = await fetch(SITE + path, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
  return res.text();
}

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('PASS  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name + ' ' + extra);
  }
}

async function main() {
  // 1. Catalog via REST API (popularNovels source)
  const catalogJson = await get('/wp-json/wp/v2/pages?per_page=100' + FIELDS);
  const catalog = parseCatalogResults(catalogJson);
  check('catalog: finds novels', catalog.length >= 10, 'got ' + catalog.length);
  const pw = catalog.find(c => c.slug === 'prison-wolf');
  check('catalog: prison-wolf present', !!pw, JSON.stringify(pw));
  if (pw) check('catalog: prison-wolf title', pw.title === 'Prison Wolf', pw.title);
  // Plain pages (home, about-us, ...) must be filtered out.
  check('catalog: no plain pages', !catalog.some(c => c.slug === 'about-us' || c.slug === 'home'),
    catalog.map(c => c.slug).join(','));

  // 2. Homepage cards (cover source)
  const homeHtml = await get('/');
  const cards = parseNovelCards(homeHtml);
  check('cards: finds cards', cards.length >= 8, 'got ' + cards.length);
  const covers = coverMapFromCards(cards);
  check('cards: victim cover', (covers.get('the-victim-of-the-academy') || '').startsWith('https://'),
    covers.get('the-victim-of-the-academy'));
  check('cards: no placeholder covers', ![...covers.values()].some(u => /No-cover/i.test(u)));

  // 3. Novel page: Prison Wolf
  const novelHtml = await get('/prison-wolf/');
  const novel = parseNovelPage(novelHtml, 'prison-wolf');
  check('novel: parsed', !!novel);
  if (novel) {
    check('novel: name', novel.name === 'Prison Wolf', novel.name);
    check('novel: author', novel.author === 'Nagano Bunzaburou', novel.author);
    check('novel: genres', novel.genres.length >= 2, novel.genres.join(','));
    check('novel: status', novel.status === 'Completed', novel.status);
    check('novel: summary', novel.summary.length > 50, novel.summary.slice(0, 60));
    check('novel: 55 chapters', novel.chapters.length === 55, 'got ' + novel.chapters.length);
    const ch1 = novel.chapters[0];
    check('novel: ch1 oldest first', ch1.title === 'Volume 1: Why I Became a Prison Guard Chapter 1', ch1.title);
    check('novel: ch1 slug', ch1.slug === 'volume-1-why-i-became-a-prison-guard-chapter-1', ch1.slug);
    const last = novel.chapters[novel.chapters.length - 1];
    check('novel: last is newest', last.title === 'Epilogue: Prison Break', last.title);
  }

  // 4. Novel page: The Victim of the Academy (long list)
  const novel2Html = await get('/the-victim-of-the-academy/');
  const novel2 = parseNovelPage(novel2Html, 'the-victim-of-the-academy');
  check('novel2: parsed', !!novel2);
  if (novel2) {
    check('novel2: 372 chapters', novel2.chapters.length === 372, 'got ' + novel2.chapters.length);
    check('novel2: status', novel2.status === 'Ongoing', novel2.status);
    check('novel2: ch1 oldest first', novel2.chapters[0].title === 'Chapter 1: Prologue', novel2.chapters[0].title);
  }

  // 5. Chapter page
  const chHtml = await get('/volume-1-why-i-became-a-prison-guard-chapter-1/');
  const content = parseChapterPage(chHtml);
  check('chapter: content parsed', !!content && content.length > 1000, 'len=' + (content || '').length);
  check('chapter: is <p> html', !!content && content.startsWith('<p>'), (content || '').slice(0, 40));
  check('chapter: no membership upsell', !!content && !content.includes('Not a member?'));
  check('chapter: no nav junk', !!content && !content.includes('Leave a Reply'));

  // 6. Search via REST API
  const searchJson = await get('/wp-json/wp/v2/pages?search=' + encodeURIComponent('wolf') + '&per_page=20' + FIELDS);
  const results = parseSearchResults(searchJson);
  check('search: finds prison-wolf', results.some(r => r.slug === 'prison-wolf'), results.map(r => r.slug).join(','));
  const emptyJson = await get('/wp-json/wp/v2/pages?search=' + encodeURIComponent('zzzzqqqnotreal') + '&per_page=20' + FIELDS);
  const empty = parseSearchResults(emptyJson);
  check('search: nonsense query empty', empty.length === 0, 'got ' + empty.length);

  // 7. Non-novel page must not parse as a novel
  const aboutHtml = await get('/about-us/');
  check('novel: about-us is not a novel', parseNovelPage(aboutHtml, 'about-us') === null);

  console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
