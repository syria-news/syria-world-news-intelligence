const Parser = require('rss-parser');
const crypto = require('crypto');
const parser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'SyriaNewsIntelligence/1.0 (+news monitoring)' }
});

const WATCHLIST = [
  { id: 'syria', name: 'سوريا', query: 'سوريا OR دمشق OR حلب OR إدلب OR الحسكة' },
  { id: 'turkey', name: 'تركيا', query: 'تركيا OR أنقرة OR إسطنبول AND (سياسة OR سوريا OR خارجية)' },
  { id: 'usa', name: 'الولايات المتحدة', query: 'الولايات المتحدة OR واشنطن OR البيت الأبيض AND (سوريا OR الشرق الأوسط)' },
  { id: 'russia', name: 'روسيا', query: 'روسيا OR موسكو AND (سوريا OR أوكرانيا OR الخارجية)' },
  { id: 'un', name: 'الأمم المتحدة', query: 'الأمم المتحدة OR مجلس الأمن OR الأمم المتحدة سوريا' },
  { id: 'iran', name: 'إيران', query: 'إيران OR طهران AND (سوريا OR إسرائيل OR المنطقة)' },
  { id: 'israel', name: 'إسرائيل', query: 'إسرائيل OR تل أبيب AND (سوريا OR لبنان OR إيران)' },
  { id: 'lebanon', name: 'لبنان', query: 'لبنان OR بيروت AND (سياسة OR أمن OR إسرائيل)' },
  { id: 'arab', name: 'عربي وإقليمي', query: '(الشرق الأوسط OR الخليج OR الأردن OR العراق OR فلسطين OR مصر OR اليمن OR السودان OR ليبيا) AND (سياسة OR أمن OR دبلوماسية OR اقتصاد)' },
  { id: 'international', name: 'دولي', query: '(أوكرانيا OR الصين OR أوروبا OR الولايات المتحدة OR الأمم المتحدة OR العالم) AND (سياسة OR حرب OR اقتصاد OR دبلوماسية)' }
];

const DIRECT_FEEDS = [
  { id: 'bbc-world', source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', country: 'international', countryName: 'دولي' },
  { id: 'aljazeera-en', source: 'الجزيرة الإنجليزية', url: 'https://www.aljazeera.com/xml/rss/all.xml', country: 'arab', countryName: 'عربي وإقليمي' },
  { id: 'dw-world', source: 'دويتشه فيله (DW)', url: 'https://rss.dw.com/rdf/rss-en-world', country: 'international', countryName: 'دولي' },
  { id: 'france24-world', source: 'فرانس 24', url: 'https://www.france24.com/en/rss', country: 'international', countryName: 'دولي' },
  { id: 'guardian-world', source: 'الغارديان', url: 'https://www.theguardian.com/world/rss', country: 'international', countryName: 'دولي' }
];

const PUBLISHER_SEARCHES = [
  { id: 'global-agencies', source: 'وكالات دولية: رويترز وAP وAFP وCNN', query: '(site:reuters.com OR site:apnews.com OR site:afp.com OR site:cnn.com)', country: 'international', countryName: 'دولي' },
  { id: 'arab-publishers', source: 'منصات عربية: الجزيرة والعربية والشرق والمشهد', query: '(site:aljazeera.net OR site:alarabiya.net OR site:skynewsarabia.com OR site:asharq.com OR site:almashhad.com)', country: 'arab', countryName: 'عربي وإقليمي' },
  { id: 'syria-publishers', source: 'مصادر دولية حول سوريا', query: '(سوريا OR دمشق OR حلب) (site:reuters.com OR site:apnews.com OR site:afp.com OR site:bbc.com OR site:aljazeera.net OR site:alarabiya.net)', country: 'syria', countryName: 'سوريا' }
];

function classify(text) {
  const t = (text || '').toLowerCase();
  const rules = [
    ['عسكري', /اشتباك|قصف|غارة|هجوم|جبهة|قوات|جيش|عسكري|صاروخ|مسيرة|مسيّرة|احتلال|انسحاب|military|strike|airstrike|troops/],
    ['أمني', /أمن|أمني|اعتقال|اغتيال|تفجير|انفجار|مخدرات|جريمة|شرطة|security|arrest|bomb|explosion/],
    ['دبلوماسي', /مباحثات|لقاء|اجتماع|زيارة|مفاوضات|اتفاق|سفير|دبلوماسي|diplomatic|talks|meeting|envoy/],
    ['اقتصادي', /اقتصاد|اقتصادي|تجارة|استثمار|عملة|ليرة|دولار|ميزانية|مصرف|بنك|economic|economy|trade|investment/],
    ['طاقة', /نفط|غاز|كهرباء|طاقة|وقود|مصفاة|energy|oil|gas|electricity/],
    ['إنساني', /إنساني|نازح|لاجئ|مساعدات|غذاء|صحة|مستشفى|ضحايا مدنيون|humanitarian|refugee|displaced|aid/]
  ];
  for (const [name, re] of rules) if (re.test(t)) return name;
  if (/تصريح|قال|أعلن|بيان|رئيس|وزير|حكومة|برلمان|انتخابات|سياسي|politic|president|minister/.test(t)) return 'سياسي';
  return 'عام';
}

function importance(text) {
  const t = (text || '').toLowerCase();
  if (/عاجل|فوري|الآن|انفجار|اغتيال|هجوم واسع|بدء عملية|urgent|breaking/.test(t)) return 'عاجل';
  if (/مصدر مسؤول|الرئيس|وزير الخارجية|مجلس الأمن|اتفاق|مفاوضات|قرار|بيان رسمي|اجتماع|قالت وزارة|أعلنت وزارة/.test(t)) return 'مهم';
  return 'عادي';
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 18)}`;
}

function publisherFromTitle(title, fallback) {
  const parts = String(title || '').split(' - ');
  return parts.length > 1 ? parts.pop().trim() : fallback;
}

function isSyriaRelated(text) {
  return /سوريا|السوري|السورية|دمشق|حلب|حمص|حماة|إدلب|درعا|السويداء|دير الزور|الرقة|الحسكة|القامشلي|اللاذقية|طرطوس|ريف دمشق|الجولان|syria|syrian|damascus|aleppo/i.test(text || '');
}

function cleanHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const selected = typeof req.query.country === 'string' ? req.query.country : '';
  const targets = selected ? WATCHLIST.filter(x => x.id === selected) : WATCHLIST;
  try {
    const results = await Promise.allSettled(targets.map(async country => {
      const url = 'https://news.google.com/rss/search?' + new URLSearchParams({
        q: country.query, hl: 'ar', gl: 'TR', ceid: 'TR:ar'
      }).toString();
      const feed = await parser.parseURL(url);
      return (feed.items || []).map(item => {
        const title = cleanHtml(item.title || '');
        const description = cleanHtml(item.contentSnippet || item.content || item.summary || '');
        const combined = `${title} ${description}`;
        return {
          id: stableId(country.id, item.link || title),
          title,
          description: description.slice(0, 420),
          url: item.link || '',
          source: item.creator || item.source?.name || 'Google News',
          sourceLinks: [{ name: item.creator || item.source?.name || 'Google News', url: item.link || '' }],
          publishedAt: item.isoDate || item.pubDate || null,
          country: country.id,
          countryName: country.name,
          category: classify(combined),
          importance: importance(combined)
        };
      });
    }));

    const directTargets = selected ? DIRECT_FEEDS.filter(feed => feed.country === selected) : DIRECT_FEEDS;
    const publisherTargets = selected ? PUBLISHER_SEARCHES.filter(feed => feed.country === selected) : PUBLISHER_SEARCHES;
    const directResults = await Promise.allSettled(directTargets.map(async feed => {
      const parsed = await parser.parseURL(feed.url);
      return (parsed.items || []).map(item => ({
        id: stableId(feed.id, item.link || item.title),
        title: cleanHtml(item.title || ''),
        description: cleanHtml(item.contentSnippet || item.content || item.summary || '').slice(0, 420),
        url: item.link || '',
        source: feed.source,
        sourceLinks: [{ name: feed.source, url: item.link || '' }],
        publishedAt: item.isoDate || item.pubDate || null,
        country: feed.country,
        countryName: feed.countryName,
        category: classify(`${item.title || ''} ${item.contentSnippet || ''}`),
        importance: importance(`${item.title || ''} ${item.contentSnippet || ''}`)
      }));
    }));
    const publisherResults = await Promise.allSettled(publisherTargets.map(async feed => {
      const url = 'https://news.google.com/rss/search?' + new URLSearchParams({ q: feed.query, hl: 'ar', gl: 'TR', ceid: 'TR:ar' }).toString();
      const parsed = await parser.parseURL(url);
      const items = (parsed.items || []).filter(item => feed.id !== 'syria-publishers' || isSyriaRelated(`${item.title || ''} ${item.contentSnippet || ''}`));
      return items.map(item => {
        const title = cleanHtml(item.title || '');
        const sourceName = item.source?.name || publisherFromTitle(title, feed.source);
        return {
        id: stableId(feed.id, item.link || title),
        title,
        description: cleanHtml(item.contentSnippet || item.content || item.summary || '').slice(0, 420),
        url: item.link || '',
        source: sourceName,
        sourceLinks: [{ name: sourceName, url: item.link || '' }],
        publishedAt: item.isoDate || item.pubDate || null,
        country: feed.country,
        countryName: feed.countryName,
        category: classify(`${item.title || ''} ${item.contentSnippet || ''}`),
        importance: importance(`${item.title || ''} ${item.contentSnippet || ''}`)
        };
      });
    }));
    const extraResults = [...directResults, ...publisherResults];
    const articles = [
      ...results.flatMap(r => r.status === 'fulfilled' ? r.value : []),
      ...extraResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    ];
    // Merge exact-title duplicates instead of silently dropping secondary source links.
    const merged = new Map();
    for (const article of articles) {
      const key = (article.title || '').toLowerCase()
        .normalize('NFKC')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/ـ/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .trim();
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...article, sourceLinks: [...(article.sourceLinks || [])] });
        continue;
      }
      const known = new Set(existing.sourceLinks.map(link => link.url).filter(Boolean));
      for (const link of (article.sourceLinks || [])) {
        if (link.url && !known.has(link.url)) existing.sourceLinks.push(link);
      }
      if (new Date(article.publishedAt || 0) > new Date(existing.publishedAt || 0)) {
        existing.publishedAt = article.publishedAt;
      }
    }
    const unique = [...merged.values()]
      .sort((a, b) => {
        const rank = value => value === 'syria' ? 3 : value === 'arab' ? 2 : value === 'international' ? 1 : 0;
        return rank(b.country) - rank(a.country) ||
          ({ 'عاجل': 0, 'مهم': 1, 'عادي': 2 }[a.importance] - { 'عاجل': 0, 'مهم': 1, 'عادي': 2 }[b.importance]) ||
          new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
      });

    return res.status(200).json({
      articles: unique,
      updatedAt: new Date().toISOString(),
      countries: WATCHLIST.map(({ id, name }) => ({ id, name })),
      total: unique.length,
      failedFeeds: [...results, ...extraResults].filter(r => r.status === 'rejected').length,
      note: 'التصنيف والأهمية آليان أوليان، ولا يمثلان تحققاً تحريرياً مستقلاً.'
    });
  } catch (error) {
    return res.status(502).json({ error: 'تعذر جلب الأخبار حالياً', details: error.message });
  }
};
