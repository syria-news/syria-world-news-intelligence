const Parser = require('rss-parser');
const directory = require('../data/sources.json');
const parser = new Parser({timeout:7000,headers:{'User-Agent':'Mozilla/5.0 AlAynMonitor/1.0'}});
const DAY=86400000;
function clean(v=''){return String(v).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}
function hostOf(source){for(const p of source.platforms||[]){if(['Telegram','X','Facebook','Instagram','YouTube','TikTok','WhatsApp'].includes(p.name))continue;try{return new URL(p.url).hostname.replace(/^www\./,'')}catch{}}return '';}
function matches(source,item){const publisher=String(item.source?.name||'').toLowerCase(),title=String(item.title||'').toLowerCase(),name=source.name.toLowerCase();const host=hostOf(source);if(host){try{const h=new URL(item.link||'').hostname.replace(/^www\./,'');if(h===host||h.endsWith('.'+host))return true}catch{}}return publisher.includes(name)||(publisher.length>3&&name.includes(publisher))||title.includes(name)}
module.exports=async(req,res)=>{
res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
const groups=[...new Set(directory.sources.map(s=>s.group))];
const jobs=groups.map(async group=>{const names=directory.sources.filter(s=>s.group===group).map(s=>'"'+s.name.replace(/["\\]/g,'')+'"');const q='('+names.join(' OR ')+')';const url='https://news.google.com/rss/search?'+new URLSearchParams({q,hl:'ar',gl:'TR',ceid:'TR:ar'}).toString();const feed=await parser.parseURL(url);return {group,items:feed.items||[]}});
const results=await Promise.allSettled(jobs);const feeds=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);const posts=[];
for(const source of directory.sources){const found=[];for(const feed of feeds){if(feed.group!==source.group)continue;for(const item of feed.items){const date=new Date(item.isoDate||item.pubDate||0).getTime();if(!Number.isFinite(date))continue;if(matches(source,item))found.push(item)}}
found.sort((a,b)=>new Date(b.isoDate||b.pubDate||0)-new Date(a.isoDate||a.pubDate||0));const recent=found.filter(x=>Date.now()-new Date(x.isoDate||x.pubDate||0).getTime()<=3*DAY);const withinWeek=found.filter(x=>Date.now()-new Date(x.isoDate||x.pubDate||0).getTime()<=7*DAY);const chosen=(recent.length?recent:withinWeek.length?withinWeek:found).slice(0,5);
for(const item of chosen)posts.push({sourceId:source.id,sourceName:source.name,platform:'News',title:clean(item.title||''),description:clean(item.contentSnippet||item.content||'').slice(0,700),publishedAt:item.isoDate||item.pubDate||null,url:item.link||'',observedAt:new Date().toISOString(),window:recent.length?'3d':withinWeek.length?'7d':'latest-available'});
}
return res.status(200).json({posts,checked:directory.sources.length,available:posts.length,groupsChecked:feeds.length,failed:results.filter(r=>r.status==='rejected').length,updatedAt:new Date().toISOString(),policy:'آخر 5 مواد خلال 3 أيام، ثم آخر أسبوع، ثم أحدث مواد متاحة مهما كان تاريخها'});
};