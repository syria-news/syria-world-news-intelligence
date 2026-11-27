const $ = (id) => document.getElementById(id);
const state = { articles: [], countries: [], selectedCountry: 'all', view: 'all', saved: new Set(JSON.parse(localStorage.getItem('syria-saved') || '[]')), updatedAt: null, sources: [], sourceArticles: [], sourcePosts: [], sourceFilter: 'all', editorialItems: [] };
const REFRESH_INTERVAL = 5 * 60 * 1000;
let lastSuccessfulLoad = 0;
let isLoading = false;

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function relativeDate(value) {
  if (!value) return 'تاريخ غير متاح';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return 'تاريخ غير متاح';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Damascus' }).format(date);
}
function publicationMeta(value) {
  if (!value) return '<span class="publication-date unavailable">تاريخ النشر غير متاح</span>';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '<span class="publication-date unavailable">تاريخ النشر غير متاح</span>';
  const dateText = new Intl.DateTimeFormat('ar', { day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Damascus' }).format(date);
  const timeText = new Intl.DateTimeFormat('ar', { hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZone:'Asia/Damascus' }).format(date);
  return '<span class="publication-date"><b>تاريخ النشر</b><strong>'+dateText+'</strong></span><span class="publication-time"><b>الوقت</b><strong>'+timeText+'</strong><small>توقيت دمشق</small></span>';
}
function updateClock() {
  const now = new Date();
  $('clock-label').textContent = new Intl.DateTimeFormat('ar', { hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', timeZone:'Asia/Damascus' }).format(now) + ' · توقيت دمشق';
  $('today-label').textContent = new Intl.DateTimeFormat('ar', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Damascus' }).format(now);
}
function renderCountries() {
  const allButton = `<button class="country-btn ${state.selectedCountry === 'all' ? 'selected' : ''}" data-country="all"><i></i>الجميع</button>`;
  $('country-list').innerHTML = allButton + state.countries.map(c => `<button class="country-btn ${state.selectedCountry === c.id ? 'selected' : ''}" data-country="${c.id}"><i></i>${escapeHtml(c.name)}</button>`).join('');
  document.querySelectorAll('[data-country]').forEach(btn => btn.addEventListener('click', () => { state.selectedCountry = btn.dataset.country; renderCountries(); loadNews(); }));
}
function getFiltered() {
  let list = [...state.articles];
  if (state.selectedCountry !== 'all') list = list.filter(a => a.country === state.selectedCountry);
  if (state.view === 'urgent') list = list.filter(a => a.importance !== 'عادي');
  if (state.view === 'saved') list = list.filter(a => state.saved.has(a.id));
  const q = $('search').value.trim().toLowerCase();
  if (q) list = list.filter(a => `${a.title} ${a.description} ${a.source} ${a.countryName}`.toLowerCase().includes(q));
  if ($('category-filter').value !== 'all') list = list.filter(a => a.category === $('category-filter').value);
  if ($('importance-filter').value !== 'all') list = list.filter(a => a.importance === $('importance-filter').value);
  if ($('sort-filter').value === 'priority') list.sort((a,b) => ({syria:0,arab:1,international:2}[a.country] ?? 3) - ({syria:0,arab:1,international:2}[b.country] ?? 3) || ({'عاجل':0,'مهم':1,'عادي':2}[a.importance] - {'عاجل':0,'مهم':1,'عادي':2}[b.importance]) || new Date(b.publishedAt || 0)-new Date(a.publishedAt || 0));
  return list;
}
function render() {
  if (state.view === 'sources') { renderSources(); return; }
  if (state.view === 'articles') { renderArticles(); return; }
  const list = getFiltered();
  $('stat-total').textContent = state.articles.length;
  $('stat-urgent').textContent = state.articles.filter(a => a.importance === 'عاجل').length;
  $('stat-important').textContent = state.articles.filter(a => a.importance === 'مهم').length;
  $('side-count').textContent = state.articles.length;
  $('results-count').textContent = `${list.length} مادة`;
  $('results-title').textContent = state.view === 'urgent' ? 'العاجل والأخبار المهمة' : state.view === 'saved' ? 'المواد المحفوظة' : 'آخر التطورات';
  $('results-subtitle').textContent = state.selectedCountry === 'all' ? 'الأخبار الواردة من نطاق الرصد' : `الأخبار المتعلقة بـ ${state.countries.find(c=>c.id===state.selectedCountry)?.name || ''}`;
  if (!list.length) { $('news-list').innerHTML = '<div class="empty-state">لا توجد مواد مطابقة للفلاتر الحالية.</div>'; return; }
  $('news-list').innerHTML = list.map(a => `<article class="news-card"><div class="news-main"><div class="meta-row"><span class="pill">${escapeHtml(a.countryName)}</span><span class="pill relevance">${a.country==='syria'?'أولوية سورية':a.country==='arab'?'عربي/إقليمي':'دولي'}</span><span class="pill category">${escapeHtml(a.category)}</span><span class="pill ${a.importance==='عاجل'?'urgent':a.importance==='مهم'?'important':''}">${escapeHtml(a.importance)}</span></div><h4>${escapeHtml(a.title)}</h4>${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}<div class="news-foot news-foot-enhanced"><div class="publication-meta">${publicationMeta(a.publishedAt)}</div><span class="source-name">المصدر: ${escapeHtml(a.source || 'غير محدد')}</span></div></div><div class="news-actions"><button class="save-btn ${state.saved.has(a.id)?'saved':''}" data-save="${escapeHtml(a.id)}" title="حفظ الخبر">${state.saved.has(a.id)?'★':'☆'}</button>${a.url?`<a class="source-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">المصدر الأصلي ↗</a>`:''}</div></article>`).join('');
  document.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', () => { const id=btn.dataset.save; state.saved.has(id)?state.saved.delete(id):state.saved.add(id); localStorage.setItem('syria-saved',JSON.stringify([...state.saved])); render(); }));
}


function renderArticles() {
  let items = [...state.editorialItems];
  if (state.selectedCountry !== 'all') items = items.filter(item => item.country === state.selectedCountry);
  const q = $('search').value.trim().toLowerCase();
  if (q) items = items.filter(item => `${item.title} ${item.description} ${item.source} ${item.author || ''}`.toLowerCase().includes(q));
  if ($('importance-filter').value !== 'all') items = items.filter(item => item.importance === $('importance-filter').value);
  items.sort((a,b) => ({syria:0,arab:1,international:2}[a.country] ?? 3) - ({syria:0,arab:1,international:2}[b.country] ?? 3) || ({'مهم':0,'عادي':1}[a.importance] ?? 2) - ({'مهم':0,'عادي':1}[b.importance] ?? 2) || new Date(b.publishedAt || 0)-new Date(a.publishedAt || 0));
  $('results-title').textContent = 'أهم المقالات والتحليلات';
  $('results-subtitle').textContent = 'قراءات وآراء وتحليلات من مصادر صحفية متنوعة';
  $('results-count').textContent = `${items.length} مادة`;
  $('stat-total').textContent = items.length;
  $('stat-urgent').textContent = '—';
  $('stat-important').textContent = items.filter(item => item.importance === 'مهم').length;
  $('status').className = 'status-message';
  $('status').textContent = 'مواد المقالات تُجمع آلياً من خلاصات ومصادر منشورة. ترتيب الأهمية أولي ويحتاج مراجعة تحريرية قبل الاقتباس أو الاستخدام.';
  if (!items.length) { $('news-list').innerHTML = '<div class="empty-state">لا توجد مقالات مطابقة حالياً. جرّب تحديث القسم أو تغيير نطاق الرصد.</div>'; return; }
  $('news-list').innerHTML = items.map(item => `<article class="news-card editorial-card"><div class="news-main"><div class="meta-row"><span class="pill">${escapeHtml(item.countryName || 'دولي')}</span><span class="pill category">${escapeHtml(item.kind || 'مقال وتحليل')}</span><span class="pill ${item.importance==='مهم'?'important':''}">${escapeHtml(item.importance || 'عادي')}</span></div><h4>${escapeHtml(item.title)}</h4>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}<div class="news-foot news-foot-enhanced"><div class="publication-meta">${publicationMeta(item.publishedAt)}</div><span>الكاتب: ${escapeHtml(item.author || 'غير محدد')}</span><span>الناشر: ${escapeHtml(item.source || 'غير محدد')}</span></div></div><div class="news-actions">${item.url ? `<a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">قراءة المقال الأصلي ↗</a>` : ''}</div></article>`).join('');
}
async function loadArticles() {
  $('status').className = 'status-message';
  $('status').textContent = 'جارٍ جمع المقالات والتحليلات...';
  try {
    const response = await fetch('/api/articles');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر جلب المقالات');
    state.editorialItems = data.articles || [];
    $('updated-label').textContent = `آخر تحديث للمقالات: ${relativeDate(data.updatedAt)}`;
    renderArticles();
  } catch (error) {
    $('status').className = 'status-message error';
    $('status').textContent = `${error.message}. يمكن إعادة المحاولة من زر تحديث الرصد.`;
  }
}

function sourceMatchesArticle(source, article) {
  const aliases = {'aawsat':['الشرق الأوسط','aawsat.com'],'afp':['فرانس برس','وكالة فرانس برس','AFP','afp.com'],'guardian':['الغارديان','The Guardian','theguardian.com'],'enab-baladi':['عنب بلدي','enabbaladi.net'],'alaraby-newspaper':['العربي الجديد','alaraby.co.uk'],'ultra-syria':['ألترا سوريا','ultrasyria.ultrasawt.com'],'syria-tv':['تلفزيون سوريا','syria.tv']};
  const terms = aliases[source.id] || [source.name];
  const haystack = (article.source || '')+' '+(article.url || '')+' '+(article.title || '');
  return terms.some(term => haystack.toLowerCase().includes(term.toLowerCase()));
}
function sourceHasPlatform(source, type) {
  return (source.platforms || []).some(platform => type === 'website'
    ? !['Telegram','X'].includes(platform.name)
    : platform.name === type);
}
function latestForSource(source) {
  const posts = state.sourcePosts.filter(post => post.sourceId === source.id);
  const article = state.sourceArticles.filter(item => sourceMatchesArticle(source, item))
    .sort((a,b)=>new Date(b.publishedAt || 0)-new Date(a.publishedAt || 0))[0] || null;
  const post = posts.sort((a,b)=>new Date(b.publishedAt || 0)-new Date(a.publishedAt || 0))[0] || null;
  if (!post) return article ? {...article, materialType:'مادة من موجز الأخبار'} : null;
  if (!article || new Date(post.publishedAt || 0) >= new Date(article.publishedAt || 0)) return {...post, materialType:'آخر منشور على Telegram'};
  return {...article, materialType:'أحدث مادة من الموقع/موجز الأخبار'};
}
function renderSources() {
  const filtered = state.sources.filter(source => state.sourceFilter === 'all' ||
    sourceHasPlatform(source, state.sourceFilter));
  const groups = [...new Set(filtered.map(source => source.group))];
  $('results-title').textContent = 'دليل المصادر';
  $('results-subtitle').textContent = 'آخر مادة متاحة من المصادر، دون استبعاد المواد لمجرد قِدم تاريخها';
  $('results-count').textContent = filtered.length+' جهة';
  $('status').textContent = 'نعرض أحدث مادة أمكن جلبها من كل مصدر حتى لو كانت أقدم من عدة أيام. منشورات Telegram العامة تُجلب مباشرة عند نجاح الوصول؛ أما X فيظهر كرابط حساب إلى حين تفعيل موصل موثوق لجلب منشوراته.';
  $('status').className = 'status-message';
  $('stat-total').textContent = filtered.length; $('stat-urgent').textContent = '—'; $('stat-important').textContent = '—';
  const tabs = [
    ['all','كل المصادر'],['Telegram','Telegram'],['X','X / تويتر'],['website','المواقع']
  ];
  const tabHtml = '<div class="source-workspace"><div class="source-filter-bar">'+tabs.map(([key,label]) =>
    '<button type="button" class="source-filter '+(state.sourceFilter===key?'active':'')+'" data-source-filter="'+key+'">'+label+'</button>'
  ).join('')+'</div><div class="source-filter-caption">اختر نافذة المصادر التي تريد متابعتها. تظهر أحدث مادة متاحة مع وقت النشر ورابطها الأصلي.</div></div>';
  const groupsHtml = groups.map(group => {
    const items = filtered.filter(source => source.group === group);
    if (!items.length) return '';
    return '<section class="source-group"><div class="source-group-heading"><h3>'+escapeHtml(group)+'</h3><span>'+items.length+' جهات</span></div><div class="source-grid">'+items.map(source => {
      const latest = latestForSource(source);
      const latestHtml = latest
        ? '<div class="source-latest"><span class="source-latest-label">'+escapeHtml(latest.materialType || 'أحدث مادة مرصودة')+'</span><strong>'+escapeHtml(latest.title || 'منشور دون عنوان')+'</strong><p>'+escapeHtml(latest.description || 'لا يتوفر مقتطف نصي من الناشر.')+'</p><div class="source-latest-meta">'+publicationMeta(latest.publishedAt)+'</div>'+(latest.observedAt ? '<small class="source-observed">وقت التقاط المادة: '+escapeHtml(relativeDate(latest.observedAt))+'</small>' : '')+(latest.url ? '<a class="source-read-link" href="'+escapeHtml(latest.url)+'" target="_blank" rel="noopener noreferrer">فتح المادة الأصلية ↗</a>' : '')+'</div>'
        : '<div class="source-latest source-latest-empty"><span class="source-latest-label">لم تصل مادة عبر الربط الحالي</span><p>لا نستبعد المواد القديمة؛ لكن لم نتمكن بعد من جلب مادة قابلة للعرض من هذا المصدر.</p></div>';
      const subsection = source.subsection ? '<div class="source-subsection"><strong>'+escapeHtml(source.subsection.name)+'</strong><span>'+escapeHtml(source.subsection.description)+'</span></div>' : '';
      const platforms = source.platforms.length ? source.platforms.map(platform => '<a href="'+escapeHtml(platform.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(platform.name)+' ↗</a>').join('') : '<span class="source-pending">روابط الحسابات قيد التحقق</span>';
      return '<article class="source-card"><div class="source-card-top"><span class="source-kind">'+escapeHtml(source.kind)+'</span><span class="source-status">'+escapeHtml(source.status)+'</span></div><h4>'+escapeHtml(source.name)+'</h4><p>'+escapeHtml(source.description)+'</p>'+latestHtml+subsection+'<div class="source-platforms">'+platforms+'</div></article>';
    }).join('')+'</div></section>';
  }).join('');
  $('news-list').innerHTML = tabHtml + groupsHtml;
  document.querySelectorAll('[data-source-filter]').forEach(button => button.addEventListener('click', () => {
    state.sourceFilter = button.dataset.sourceFilter;
    renderSources();
  }));
}
async function loadSources() {
  try {
    const [directoryResponse, olderFeedResponse, socialResponse] = await Promise.all([
      fetch('/data/sources.json'),
      fetch('/api/news?mode=sources'),
      fetch('/api/social-latest')
    ]);
    if (!directoryResponse.ok) throw new Error('تعذر تحميل دليل المصادر');
    const directory = await directoryResponse.json();
    state.sources = directory.sources || [];
    if (olderFeedResponse.ok) {
      const feed = await olderFeedResponse.json();
      state.sourceArticles = feed.articles || [];
    }
    if (socialResponse.ok) {
      const social = await socialResponse.json();
      state.sourcePosts = social.posts || [];
    }
    if (state.view === 'sources') renderSources();
  } catch (error) {
    console.error(error);
    if (state.view === 'sources') {
      $('status').className = 'status-message error';
      $('status').textContent = 'تعذر تحديث أحدث مواد المصادر الآن. يمكنك إعادة المحاولة من زر تحديث الرصد.';
    }
  }
}

async function loadNews() {
  if (isLoading) return;
  isLoading = true;
  const refresh = $('refresh'); refresh.disabled = true; refresh.innerHTML = '<span>↻</span> جارٍ التحديث';
  $('status').className = 'status-message'; $('status').textContent = 'جارٍ جلب آخر المواد من خلاصات الأخبار...';
  try {
    const url = state.selectedCountry === 'all' ? '/api/news' : `/api/news?country=${encodeURIComponent(state.selectedCountry)}`;
    const response = await fetch(url); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر جلب الأخبار');
    if (state.selectedCountry === 'all') { state.articles = data.articles || []; state.countries = data.countries || []; renderCountries(); }
    else {
      const retained = state.articles.filter(a => a.country !== state.selectedCountry);
      state.articles = [...retained, ...(data.articles || [])].sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0));
    }
    state.updatedAt = data.updatedAt;
    lastSuccessfulLoad = Date.now();
    $('updated-label').textContent = `آخر تحديث: ${relativeDate(data.updatedAt)}`;
    $('status').textContent = `${data.total} مادة جرى جمعها. ${data.failedFeeds ? `تعذر الوصول إلى ${data.failedFeeds} من خلاصات الرصد.` : ''} ${data.note || ''}`;
    render();
  } catch (error) {
    $('status').className = 'status-message error'; $('status').textContent = `${error.message}. تحقق من اتصال الموقع أو أعد المحاولة.`;
    if (!state.articles.length) $('news-list').innerHTML = '<div class="empty-state">لم تصل الأخبار بعد. تأكد من تشغيل الموقع على Vercel ثم أعد المحاولة.</div>';
  } finally { refresh.disabled = false; refresh.innerHTML = '<span>↻</span> تحديث الرصد'; isLoading = false; }
}

document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
  state.view = btn.dataset.view; document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===btn));
  $('page-title').textContent = state.view==='urgent'?'عاجل ومهم':state.view==='saved'?'المحفوظات':state.view==='sources'?'دليل المصادر':state.view==='articles'?'مقالات':'موجز الأخبار';
  if (state.view === 'sources') renderSources(); else if (state.view === 'articles') loadArticles(); else render();
}));
['search','category-filter','importance-filter','sort-filter'].forEach(id => $(id).addEventListener(id==='search'?'input':'change',() => state.view==='articles'?renderArticles():render()));
$('refresh').addEventListener('click',() => state.view==='articles'?loadArticles():state.view==='sources'?loadSources():loadNews());
updateClock();
setInterval(updateClock, 1000);
loadNews();
loadSources();

// تحديث تلقائي كل خمس دقائق، مع تجنب الطلبات المتداخلة أثناء انشغال التبويب.
setInterval(() => {
  if (document.visibilityState === 'visible') { loadNews(); if (state.view === 'sources') loadSources(); }
}, REFRESH_INTERVAL);

// عند العودة إلى التبويب، حدّث فوراً إذا مضت خمس دقائق على آخر جلب ناجح.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastSuccessfulLoad >= REFRESH_INTERVAL) { loadNews(); if (state.view === 'sources') loadSources(); }
});
