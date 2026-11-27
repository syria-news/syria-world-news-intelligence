const $ = (id) => document.getElementById(id);
const state = { articles: [], countries: [], selectedCountry: 'all', view: 'all', saved: new Set(JSON.parse(localStorage.getItem('syria-saved') || '[]')), updatedAt: null, sources: [], editorialItems: [] };
const REFRESH_INTERVAL = 5 * 60 * 1000;
let lastSuccessfulLoad = 0;
let isLoading = false;

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function relativeDate(value) {
  if (!value) return 'تاريخ غير متاح';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return 'تاريخ غير متاح';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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
  $('news-list').innerHTML = list.map(a => `<article class="news-card"><div class="news-main"><div class="meta-row"><span class="pill">${escapeHtml(a.countryName)}</span><span class="pill relevance">${a.country==='syria'?'أولوية سورية':a.country==='arab'?'عربي/إقليمي':'دولي'}</span><span class="pill category">${escapeHtml(a.category)}</span><span class="pill ${a.importance==='عاجل'?'urgent':a.importance==='مهم'?'important':''}">${escapeHtml(a.importance)}</span></div><h4>${escapeHtml(a.title)}</h4>${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}<div class="news-foot"><span>◷ ${escapeHtml(relativeDate(a.publishedAt))}</span><span>المصدر: ${escapeHtml(a.source || 'غير محدد')}</span></div></div><div class="news-actions"><button class="save-btn ${state.saved.has(a.id)?'saved':''}" data-save="${escapeHtml(a.id)}" title="حفظ الخبر">${state.saved.has(a.id)?'★':'☆'}</button>${a.url?`<a class="source-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">المصدر الأصلي ↗</a>`:''}</div></article>`).join('');
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
  $('news-list').innerHTML = items.map(item => `<article class="news-card editorial-card"><div class="news-main"><div class="meta-row"><span class="pill">${escapeHtml(item.countryName || 'دولي')}</span><span class="pill category">${escapeHtml(item.kind || 'مقال وتحليل')}</span><span class="pill ${item.importance==='مهم'?'important':''}">${escapeHtml(item.importance || 'عادي')}</span></div><h4>${escapeHtml(item.title)}</h4>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}<div class="news-foot"><span>◷ ${escapeHtml(relativeDate(item.publishedAt))}</span><span>الكاتب: ${escapeHtml(item.author || 'غير محدد')}</span><span>الناشر: ${escapeHtml(item.source || 'غير محدد')}</span></div></div><div class="news-actions">${item.url ? `<a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">قراءة المقال الأصلي ↗</a>` : ''}</div></article>`).join('');
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

function renderSources() {
  const groups = [...new Set(state.sources.map(source => source.group))];
  $('results-title').textContent = 'دليل المصادر';
  $('results-subtitle').textContent = 'دليل الجهات والحسابات التي يجري تجهيزها للرصد';
  $('results-count').textContent = `${state.sources.length} جهات`;
  $('status').textContent = 'هذا الدليل ينظم الجهات وحساباتها. ظهور المصدر هنا لا يعني أن جلب منشوراته آلياً أصبح مفعلاً بعد.';
  $('status').className = 'status-message';
  $('stat-total').textContent = state.sources.length;
  $('stat-urgent').textContent = '—';
  $('stat-important').textContent = '—';
  $('news-list').innerHTML = groups.map(group => {
    const items = state.sources.filter(source => source.group === group);
    if (!items.length) return '';
    return `<section class="source-group"><div class="source-group-heading"><h3>${escapeHtml(group)}</h3><span>${items.length} جهات</span></div><div class="source-grid">${items.map(source => `
      <article class="source-card">
        <div class="source-card-top"><span class="source-kind">${escapeHtml(source.kind)}</span><span class="source-status">${escapeHtml(source.status)}</span></div>
        <h4>${escapeHtml(source.name)}</h4><p>${escapeHtml(source.description)}</p>
        ${source.subsection ? `<div class="source-subsection"><strong>${escapeHtml(source.subsection.name)}</strong><span>${escapeHtml(source.subsection.description)}</span></div>` : ''}
        <div class="source-platforms">${source.platforms.length ? source.platforms.map(platform => `<a href="${escapeHtml(platform.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(platform.name)} ↗</a>`).join('') : '<span class="source-pending">روابط الحسابات قيد التحقق</span>'}</div>
      </article>`).join('')}</div></section>`;
  }).join('');
}
async function loadSources() {
  try {
    const response = await fetch('/data/sources.json');
    if (!response.ok) throw new Error('تعذر تحميل دليل المصادر');
    const data = await response.json();
    state.sources = data.sources || [];
    if (state.view === 'sources') renderSources();
  } catch (error) {
    console.error(error);
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
$('refresh').addEventListener('click',() => state.view==='articles'?loadArticles():loadNews());
$('today-label').textContent = new Intl.DateTimeFormat('ar', { dateStyle: 'full' }).format(new Date());
loadNews();
loadSources();

// تحديث تلقائي كل خمس دقائق، مع تجنب الطلبات المتداخلة أثناء انشغال التبويب.
setInterval(() => {
  if (document.visibilityState === 'visible') loadNews();
}, REFRESH_INTERVAL);

// عند العودة إلى التبويب، حدّث فوراً إذا مضت خمس دقائق على آخر جلب ناجح.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastSuccessfulLoad >= REFRESH_INTERVAL) loadNews();
});
