const SYMBOLS = {
  gold: { symbol: 'GC=F', label: 'الذهب', unit: 'دولار/أونصة' },
  brent: { symbol: 'BZ=F', label: 'برنت', unit: 'دولار/برميل' },
  wti: { symbol: 'CL=F', label: 'WTI', unit: 'دولار/برميل' },
  usdtry: { symbol: 'USDTRY=X', label: 'دولار/ليرة', unit: 'TRY' },
  eurtry: { symbol: 'EURTRY=X', label: 'يورو/ليرة', unit: 'TRY' }
};
async function yahooQuote(key, item) {
  const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(item.symbol) + '?range=1d&interval=5m', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlAynMarketBoard/1.0)' },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error('Market feed ' + response.status);
  const json = await response.json();
  const result = json.chart && json.chart.result && json.chart.result[0];
  const price = result && result.meta && (result.meta.regularMarketPrice || result.meta.previousClose);
  if (!Number.isFinite(price)) throw new Error('No quote for ' + key);
  return { key, label: item.label, value: Number(price).toLocaleString('en-US', { maximumFractionDigits: key === 'usdtry' || key === 'eurtry' ? 3 : 2 }), unit: item.unit, timestamp: result.meta.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString() : null };
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const entries = Object.entries(SYMBOLS);
  const results = await Promise.allSettled(entries.map(([key, item]) => yahooQuote(key, item)));
  const items = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (!items.length) return res.status(502).json({ error: 'تعذر الوصول إلى بيانات الأسواق حالياً', failed: results.length });
  return res.status(200).json({
    items,
    updatedAt: new Date().toISOString(),
    failed: results.filter(result => result.status === 'rejected').length,
    note: 'أسعار مؤشرات مالية إرشادية؛ قد تتأخر بيانات العقود والذهب حسب مزود البيانات.'
  });
};