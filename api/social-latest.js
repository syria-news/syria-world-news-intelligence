const sources = require('../data/sources.json');

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
function plainText(value = '') {
  return decodeHtml(String(value).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim().slice(0, 1400);
}
async function latestFromChannel(source, platform) {
  const match = platform.url.match(/t\.me\/([A-Za-z0-9_]+)/);
  if (!match) return null;
  const channel = match[1];
  const response = await fetch('https://t.me/s/' + channel, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlAynNewsMonitor/1.0)', 'Accept-Language': 'ar,en;q=0.8' },
    signal: AbortSignal.timeout(7500)
  });
  if (!response.ok) throw new Error('Telegram HTTP ' + response.status);
  const html = await response.text();
  const candidates = [...html.matchAll(/<div class="tgme_widget_message_wrap[^"]*"[^>]*>[\\s\\S]*?(?=<div class="tgme_widget_message_wrap|$)/g)];
  return candidates.slice(-5).map(match => {
    const block = match[0];
    const postId = (block.match(/data-post="([^"]+)"/) || [])[1];
    const date = (block.match(/<time[^>]*datetime="([^"]+)"/) || [])[1];
    const messageMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/);
    const description = plainText(messageMatch ? messageMatch[1] : '');
    const title = description ? description.split('\\n')[0].slice(0, 180) : 'منشور من قناة ' + source.name;
    if (!postId && !date && !description) return null;
    return { sourceId:source.id, sourceName:source.name, platform:'Telegram', title, description,
      publishedAt:date || null, url:postId ? 'https://t.me/' + postId : platform.url, observedAt:new Date().toISOString() };
  }).filter(Boolean);
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const targets = sources.sources.flatMap(source => (source.platforms || [])
    .filter(platform => platform.name === 'Telegram')
    .map(platform => ({ source, platform })));
  const results = await Promise.allSettled(targets.map(({ source, platform }) => latestFromChannel(source, platform)));
  const posts = results.flatMap(result => result.status === 'fulfilled' && result.value ? result.value : []);
  return res.status(200).json({
    posts,
    checked: targets.length,
    available: posts.length,
    failed: results.filter(result => result.status === 'rejected').length,
    updatedAt: new Date().toISOString()
  });
};