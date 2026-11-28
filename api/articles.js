const Parser = require('rss-parser');
const crypto = require('crypto');
const parser = new Parser({ timeout: 12000, headers: { 'User-Agent': 'SyriaNewsIntelligence/1.0 (+editorial monitoring)' } });

const SEARCHES = [
  { id:'world-opinion', query:'(تحليل OR مقال رأي OR opinion OR analysis OR editorial) (أوكرانيا OR روسيا OR الصين OR الولايات المتحدة OR أوروبا OR الأمم المتحدة OR العالم)', country:'international', countryName:'دولي' },
  { id:'middle-east-opinion', query:'(تحليل OR رأي OR مقال OR analysis OR opinion) (لبنان OR فلسطين OR العراق OR تركيا OR إيران OR الخليج OR مصر OR السودان OR اليمن)', country:'arab', countryName:'عربي وإقليمي' },
  { id:'syria-opinion-wide', query:'(سوريا OR دمشق OR حلب OR إدلب) (تحليل OR رأي OR مقال OR قراءة OR تحقيق OR commentary OR opinion)', country:'syria', countryName:'سوريا' },
  { id:'europe-america-opinion', query:'(أوروبا OR الاتحاد الأوروبي OR أميركا OR الولايات المتحدة OR بريطانيا OR فرنسا OR ألمانيا) (تحليل OR رأي OR مقال OR opinion OR analysis)', country:'international', countryName:'دولي' },
  { id:'publisher-opinion-arab', query:'(site:aljazeera.net OR site:alarabiya.net OR site:skynewsarabia.com OR site:asharq.com OR site:aawsat.com OR site:almodon.com) (رأي OR تحليل OR مقال)', country:'arab', countryName:'عربي وإقليمي' },
  { id:'publisher-opinion-global', query:'(site:reuters.com OR site:apnews.com OR site:bbc.com OR site:theguardian.com OR site:france24.com) (opinion OR analysis OR commentary)', country:'international', countryName:'دولي' },

  { id: 'syria-editorial', query: '(سوريا OR دمشق OR حلب OR إدلب OR الحسكة) (مقال OR تحليل OR رأي OR قراءة OR وجهة نظر OR commentary OR analysis)', country: 'syria', countryName: 'سوريا' },
  { id: 'regional-editorial', query: '(الشرق الأوسط OR لبنان OR فلسطين OR العراق OR تركيا OR إيران) (مقال OR تحليل OR رأي OR قراءة OR وجهة نظر OR analysis OR opinion)', country: 'arab', countryName: 'عربي وإقليمي' },
  { id: 'publisher-editorial', query: '(سوريا OR الشرق الأوسط) (تحليل OR رأي OR مقال OR analysis OR opinion) (site:alaraby.co.uk OR site:ultrasyria.ultrasawt.com OR site:enabbaladi.net OR site:syria.tv OR site:afp.com OR site:theguardian.com OR site:aljazeera.net OR site:almodon.com)', country: 'syria', countryName: 'سوريا' },
  { id: 'syria-analysis', query: 'سوريا تحليل سياسي OR قراءة سياسية OR مقال رأي OR وجهة نظر', country: 'syria', countryName: 'سوريا' },
  { id: 'syria-publishers', query: '(سوريا OR دمشق OR حلب) (تحليل OR رأي OR مقال OR تحقيق) (site:almodon.com OR site:syria.tv OR site:alaraby.co.uk OR site:aljazeera.net OR site:ultrasyria.ultrasawt.com OR site:enabbaladi.net)', country: 'syria', countryName: 'سوريا' },
  { id: 'regional-analysis', query: '(لبنان OR فلسطين OR العراق OR تركيا OR إيران OR الشرق الأوسط) (تحليل OR رأي OR مقال OR وجهة نظر)', country: 'arab', countryName: 'عربي وإقليمي' }
];
const GUARDIAN_OPINION = 'https://www.theguardian.com/commentisfree/rss';
const ALMODON_RSS = 'https://www.almodon.com/rss';
const MAX_AGE_DAYS = 30;
function clean(value='') { return String(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
function recent(item) {
  const date = new Date(item.isoDate || item.pubDate || 0).getTime();
  return !date || (Number.isFinite(date) && Date.now()-date <= MAX_AGE_DAYS*86400000);
}
function isSyria(text) {
  return /سوريا|السوري|السورية|دمشق|حلب|حمص|حماة|إدلب|درعا|السويداء|دير الزور|الرقة|الحسكة|القامشلي|اللاذقية|طرطوس|syria|syrian|damascus|aleppo/i.test(text || '');
}
function isRegional(text) {
  return /الشرق الأوسط|لبنان|بيروت|فلسطين|غزة|الضفة|العراق|بغداد|تركيا|أنقرة|إيران|طهران|الأردن|عمّان|الخليج|اليمن|السودان|مصر|ليبيا|middle east|lebanon|palestine|iraq|turkey|iran|jordan|gulf|yemen|sudan|egypt/i.test(text || '');
}
function countryOf(text, fallback) {
  return isSyria(text) ? 'syria' : fallback;
}
function important(text) {
  return /تحليل معمق|قراءة سياسية|مقال رأي|وجهة نظر|تحقيق|long read|analysis|opinion|editorial/i.test(text) ? 'مهم' : 'عادي';
}
function authorOf(item) {
  const creator = item.creator || item.author || item['dc:creator'];
  if (creator) return clean(creator);
  const title = String(item.title || '');
  const match = title.match(/\s[|–—-]\s([^|–—-]+)$/);
  return match ? clean(match[1]) : 'غير محدد';
}
async function translateToArabic(value) {
  const text=String(value||'').trim();
  if(!text || /[\u0600-\u06FF]/.test(text)) return text;
  try {
    const url='https://translate.googleapis.com/translate_a/single?'+new URLSearchParams({client:'gtx',sl:'auto',tl:'ar',dt:'t',q:text.slice(0,1300)}).toString();
    const response=await fetch(url,{signal:AbortSignal.timeout(6000)});
    if(!response.ok) return text;
    const payload=await response.json();
    return (payload[0]||[]).map(part=>part[0]||'').join('').trim()||text;
  } catch { return text; }
}
module.exports = async (req,res) => {
  res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=1200');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  try {
    const jobs = SEARCHES.map(async feed => {
      const url = 'https://news.google.com/rss/search?' + new URLSearchParams({q:feed.query,hl:'ar',gl:'TR',ceid:'TR:ar'}).toString();
      const parsed = await parser.parseURL(url);
      return (parsed.items || []).filter(recent).filter(item => {
        const text = (item.title || '')+' '+(item.contentSnippet || '');
        if (feed.country === 'syria') return isSyria(text);
        if (feed.country === 'arab') return isRegional(text) && !isSyria(text);
        return !isSyria(text) && !isRegional(text);
      }).slice(0,35).map(item => {
        const title = clean(item.title || '');
        const description = clean(item.contentSnippet || item.content || item.summary || '').slice(0,520);
        const combined = title + ' ' + description;
        return {
          id: crypto.createHash('sha1').update(item.link || title).digest('hex').slice(0,18),
          title, description, url:item.link || '', source:item.source?.name || (String(title).match(/\\s[-–—]\\s([^|]+)$/)?.[1]?.trim()) || 'مصدر صحفي',
          author:(item.creator || item.author || item['dc:creator']) ? clean(item.creator || item.author || item['dc:creator']) : 'غير محدد', publishedAt:item.isoDate || item.pubDate || null,
          country:countryOf(combined,feed.country), countryName:countryOf(combined,feed.country)==='syria'?'سوريا':feed.countryName,
          kind:/رأي|opinion|commentary/i.test(combined)?'رأي':/تحليل|analysis|قراءة/i.test(combined)?'تحليل':'مقال',
          importance:important(combined)
        };
      });
    });
    const almodonJob = parser.parseURL(ALMODON_RSS).then(feed => (feed.items || [])
      .filter(recent)
      .filter(item => isSyria((item.title || '')+' '+(item.contentSnippet || '')) || isRegional((item.title || '')+' '+(item.contentSnippet || '')))
      .slice(0,45).map(item => {
        const title=clean(item.title || ''), description=clean(item.contentSnippet || item.content || '').slice(0,520);
        const combined=title+' '+description;
        return {
          id:crypto.createHash('sha1').update(item.link || title).digest('hex').slice(0,18),
          title, description, url:item.link || '', source:'جريدة المدن', author:authorOf(item),
          publishedAt:item.isoDate || item.pubDate || null,
          country:countryOf(combined,'arab'),
          countryName:countryOf(combined,'arab')==='syria'?'سوريا':'عربي وإقليمي',
          kind:/تحليل|رأي|مقال|قراءة/i.test(combined)?'تحليل/رأي':'مادة صحفية',
          importance:important(combined)
        };
      }));
    const guardianJob = parser.parseURL(GUARDIAN_OPINION).then(feed => (feed.items || []).filter(recent).filter(item => isRegional((item.title || '')+' '+(item.contentSnippet || ''))).slice(0,20).map(item => {
      const title=clean(item.title || ''), description=clean(item.contentSnippet || item.content || '').slice(0,520);
      return { id:crypto.createHash('sha1').update(item.link || title).digest('hex').slice(0,18), title, description, url:item.link || '', source:'The Guardian', author:authorOf(item), publishedAt:item.isoDate || item.pubDate || null, country:'international', countryName:'دولي', kind:'رأي', importance:'مهم' };
    }));
    const results = await Promise.allSettled([...jobs,guardianJob,almodonJob]);
    const rawArticles = results.flatMap(result => result.status==='fulfilled'?result.value:[]);
    const articles = await Promise.all(rawArticles.map(async item => {
      if(/[\u0600-\u06FF]/.test(item.title||'')) return item;
      const translated = await translateToArabic((item.title||'')+(item.description?'\n\n'+item.description:''));
      const pieces=translated.split(/\n\s*\n/);
      return {...item,title:pieces[0]||item.title,description:(pieces.slice(1).join(' ')||item.description||'').slice(0,520)};
    }));
    const unique = [...new Map(articles.filter(a=>a.title).map(a=>[a.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''),a])).values()]
      .sort((a,b)=>({syria:0,arab:1,international:2}[a.country]-{syria:0,arab:1,international:2}[b.country]) || (a.importance==='مهم'?-1:1) || new Date(b.publishedAt||0)-new Date(a.publishedAt||0))
      .slice(0,180);
    return res.status(200).json({articles:unique,total:unique.length,updatedAt:new Date().toISOString(),failedFeeds:results.filter(r=>r.status==='rejected').length,note:'تجميع آلي أولي للمقالات والتحليلات؛ يلزم تقييم تحريري للأهمية قبل الاعتماد.'});
  } catch(error) {
    return res.status(502).json({error:'تعذر جلب المقالات حالياً',details:error.message});
  }
};
