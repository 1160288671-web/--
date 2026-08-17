import { fetchPlanMap, fetchCityMap, type MapPointInput } from './amap'

/** 极简 Markdown → HTML（够用：标题 / 加粗 / 列表 / 链接 / 段落），并做 HTML 转义 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}

export function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/)
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  for (const line of lines) {
    const t = line.trim()
    if (/^#{1,6}\s/.test(t)) {
      closeList()
      const level = Math.min((t.match(/^#+/) as RegExpMatchArray)[0].length, 4)
      const text = t.replace(/^#+\s*/, '')
      out.push(`<h${level}>${inline(text)}</h${level}>`)
    } else if (/^[-*]\s+/.test(t)) {
      if (list !== 'ul') {
        closeList()
        out.push('<ul>')
        list = 'ul'
      }
      out.push(`<li>${inline(t.replace(/^[-*]\s+/, ''))}</li>`)
    } else if (/^\d+[.、]\s+/.test(t)) {
      if (list !== 'ol') {
        closeList()
        out.push('<ol>')
        list = 'ol'
      }
      out.push(`<li>${inline(t.replace(/^\d+[.、]\s+/, ''))}</li>`)
    } else if (t === '') {
      closeList()
    } else {
      closeList()
      out.push(`<p>${inline(t)}</p>`)
    }
  }
  closeList()
  return out.join('\n')
}

interface DaySection {
  day: number
  title: string
  markdown: string
}

/** 按「## 第N天」切分方案；未识别到天标题时，整个方案作为单页返回 */
function splitDays(markdown: string): DaySection[] {
  const headingRe = /^#{1,4}\s*第\s*(\d+)\s*天[：:、\s]*(.*)$/
  const sections: DaySection[] = []
  let current: DaySection | null = null
  let buf: string[] = []
  const flush = () => {
    if (current) sections.push({ ...current, markdown: buf.join('\n').trim() })
  }
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(headingRe)
    if (m) {
      flush()
      current = { day: Number(m[1]), title: m[2] || `第 ${m[1]} 天`, markdown: '' }
      buf = []
    } else if (current) {
      buf.push(line)
    }
  }
  flush()
  return sections.length ? sections : [{ day: 1, title: '行程安排', markdown }]
}

function toDataUri(buf: Buffer | null): string | null {
  return buf ? `data:image/png;base64,${buf.toString('base64')}` : null
}

function mapImg(src: string | null, alt: string): string {
  if (!src) {
    return `<div class="map-placeholder"><div class="ph-title">${escapeHtml(alt)}</div><div class="ph-sub">此页暂未生成路线地图，请以文字行程为准</div></div>`
  }
  return `<img class="map" src="${src}" alt="${escapeHtml(alt)}">`
}

const ACCENTS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77']

/** Retro pop art 模板样式（1970s 杂志风，奶油米色底 + 粗黑描边 + 几何装饰） */
const RETRO_CSS = `
:root {
  --cream: #F6EFE0;
  --ink: #16120E;
  --salmon: #FF6B6B;
  --sky: #4ECDC4;
  --mustard: #FFD93D;
  --mint: #6BCB77;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Arial Black", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  background: #2A2622;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
.stage { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.slide {
  display: none;
  position: relative;
  width: min(1280px, 96vw);
  aspect-ratio: 16 / 9;
  background: var(--cream);
  border: 4px solid var(--ink);
  box-shadow: 10px 10px 0 var(--ink);
  overflow: auto;
  padding: 28px 34px;
}
.slide.active { display: block; animation: pop .25s ease; }
@keyframes pop { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* 几何装饰 */
.deco { position: absolute; pointer-events: none; }
.qcircle { width: 120px; height: 120px; border-radius: 0 0 0 120px; }
.ring { width: 90px; height: 90px; border: 10px solid var(--ink); border-radius: 50%; }
.ring::after { content: ''; position: absolute; inset: 8px; border: 4px solid var(--ink); border-radius: 50%; }
.burst { width: 0; height: 0; }
.burst span { position: absolute; background: var(--ink); }

/* 标题 */
.kicker { font-size: 13px; letter-spacing: .3em; font-weight: 700; color: var(--ink); }
.cover-title {
  font-size: clamp(40px, 6vw, 76px); line-height: .95; margin: 6px 0 8px;
  text-transform: uppercase; letter-spacing: .02em;
  -webkit-text-stroke: 2px var(--ink); text-shadow: 4px 4px 0 var(--salmon);
}
.cover-sub { font-size: 16px; color: #4a3f33; margin: 0 0 18px; }
.stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.stat {
  border: 3px solid var(--ink); padding: 8px 12px; min-width: 92px;
  box-shadow: 4px 4px 0 var(--ink); text-align: center;
}
.stat .v { font-size: 22px; font-weight: 900; }
.stat .k { font-size: 11px; letter-spacing: .12em; color: #4a3f33; margin-top: 2px; }

/* 封面网格 */
.cover-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 22px; }
.cover-left { min-width: 0; }
.cover-right { display: flex; align-items: center; justify-content: center; }
.map { width: 100%; border: 3px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); display: block; background: #fff; }
.map-placeholder {
  position: relative;
  border: 3px solid var(--ink);
  box-shadow: 5px 5px 0 var(--ink);
  background: #fffdf5;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 24px;
  overflow: hidden;
}
.map-placeholder::before {
  content: '';
  position: absolute;
  top: -14px; right: -14px;
  width: 110px; height: 110px;
  border-radius: 0 0 0 110px;
  background: var(--mint);
}
.map-placeholder::after {
  content: '';
  position: absolute;
  bottom: -16px; left: -16px;
  width: 64px; height: 64px;
  border: 10px solid var(--ink);
  border-radius: 50%;
}
.map-placeholder .ph-title { font-size: 18px; font-weight: 900; }
.map-placeholder .ph-sub { font-size: 12px; color: #6a5c48; }
.daylist { border-top: 3px solid var(--ink); padding-top: 12px; }
.daylist-title { font-size: 13px; letter-spacing: .18em; font-weight: 900; margin-bottom: 8px; }
.daylist-items { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
.daylist-items li { font-size: 14px; }
.daylist-items li::before { content: '▸ '; font-weight: 900; }
.daylist-items b { color: var(--ink); }

/* 每日页 */
.day-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.day-badge {
  display: inline-block; border: 3px solid var(--ink); padding: 6px 14px;
  font-weight: 900; font-size: 20px; box-shadow: 4px 4px 0 var(--ink); color: var(--ink);
}
.day-title { font-size: clamp(24px, 3.4vw, 40px); margin: 0; text-transform: uppercase; }
.day-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 22px; align-items: start; }
.day-body { font-size: 14px; line-height: 1.55; }
.day-body h1, .day-body h2, .day-body h3, .day-body h4 { font-size: 15px; margin: 12px 0 6px; letter-spacing: .03em; }
.day-body h1::before, .day-body h2::before, .day-body h3::before { content: '◆ '; }
.day-body p { margin: 6px 0; }
.day-body ul, .day-body ol { margin: 6px 0; padding-left: 20px; }
.day-body li { margin: 3px 0; }
.day-body strong { background: var(--mustard); padding: 0 3px; }
.day-body a { color: #1a73e8; }
.day-map { display: flex; align-items: flex-start; }
.day-grid-wide { display: flex; flex-direction: column; gap: 16px; }
.day-map-wide .map { width: 100%; }

/* 方案总览（封面下方，非按天内容） */
.overview { border-top: 3px solid var(--ink); margin-top: 16px; padding-top: 10px; }
.overview h1, .overview h2, .overview h3, .overview h4 { font-size: 15px; margin: 10px 0 4px; }
.overview h1::before, .overview h2::before, .overview h3::before { content: '● '; }
.overview p { margin: 5px 0; font-size: 13.5px; line-height: 1.5; }
.overview ul, .overview ol { margin: 5px 0; padding-left: 20px; font-size: 13.5px; }
.overview li { margin: 2px 0; }
.overview strong { background: var(--sky); padding: 0 3px; }

/* 导航 */
.nav { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 16px; }
.nav button {
  font-family: inherit; font-weight: 900; font-size: 16px; cursor: pointer;
  border: 3px solid var(--ink); background: var(--mustard); color: var(--ink);
  padding: 8px 16px; box-shadow: 3px 3px 0 var(--ink);
}
.nav button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--ink); }
.nav button.plain { background: #fff; }
.dots { display: flex; gap: 6px; }
.dots button {
  width: 12px; height: 12px; padding: 0; border: 2px solid var(--ink); border-radius: 50%;
  background: #fff; box-shadow: none;
}
.dots button.on { background: var(--salmon); }
.hint { color: #cfc6b6; font-size: 12px; text-align: center; padding-bottom: 8px; }

@media print {
  .nav, .hint { display: none !important; }
  body { background: #fff; }
  .stage { display: block; padding: 0; }
  .slide { display: block !important; width: 100%; max-width: none; aspect-ratio: auto; box-shadow: none; overflow: visible; page-break-after: always; }
}
`

const DECK_JS = `
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'))
  var dots = document.getElementById('dots')
  var cur = 0
  function render() {
    slides.forEach(function (s, i) { s.classList.toggle('active', i === cur) })
    var bs = dots.querySelectorAll('button')
    bs.forEach(function (b, i) { b.classList.toggle('on', i === cur) })
  }
  slides.forEach(function (_, i) {
    var b = document.createElement('button')
    b.setAttribute('aria-label', '第' + (i + 1) + '页')
    b.addEventListener('click', function () { cur = i; render() })
    dots.appendChild(b)
  })
  function go(d) { cur = Math.max(0, Math.min(slides.length - 1, cur + d)); render() }
  document.getElementById('prev').addEventListener('click', function () { go(-1) })
  document.getElementById('next').addEventListener('click', function () { go(1) })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') go(-1)
    if (e.key === 'ArrowRight') go(1)
  })
  render()
})()
`

export interface RenderInput {
  key: string
  secret?: string
  destination: string
  profile: Record<string, string>
  planMarkdown: string
  mapPoints: MapPointInput[]
}

function pick(profile: Record<string, string>, key: string): string {
  return (profile[key] || '').trim()
}

export async function buildPlanHtml(input: RenderInput): Promise<string> {
  const { destination, profile, planMarkdown, mapPoints } = input
  const days = splitDays(planMarkdown)

  // 封面全程地图 + 每天地图（并行请求）；无点位时退回目的地城市概览
  const coverBuf = mapPoints.length
    ? await fetchPlanMap(input.key, input.secret, mapPoints.slice(0, 10))
    : await fetchCityMap(input.key, input.secret, destination)
  const dayBufs = await Promise.all(
    days.map((d) => {
      const pts = mapPoints.filter((p) => p.day === d.day).sort((a, b) => a.seq - b.seq)
      if (pts.length) {
        // 多个地点 → 宽幅全景图；单个地点 → 常规尺寸
        const size = pts.length >= 2 ? '1024*560' : '750*500'
        return fetchPlanMap(input.key, input.secret, pts, { size })
      }
      // 当天无具体点位 → 退回目的地城市概览，保证每页都有图
      return fetchCityMap(input.key, input.secret, destination)
    }),
  )

  const coverMap = toDataUri(coverBuf)

  // 关键数字卡片
  const stats: Array<{ k: string; v: string; bg: string }> = []
  const duration = pick(profile, '时长')
  const budget = pick(profile, '预算')
  const people = pick(profile, '同行人')
  if (days.length) stats.push({ k: '天数', v: `${days.length} 天`, bg: ACCENTS[0] })
  if (duration) stats.push({ k: '时长', v: duration, bg: ACCENTS[1] })
  if (budget) stats.push({ k: '预算', v: budget, bg: ACCENTS[2] })
  if (people) stats.push({ k: '同行', v: people, bg: ACCENTS[3] })
  const statHtml = stats
    .map((s) => `<div class="stat" style="background:${s.bg}"><div class="v">${escapeHtml(s.v)}</div><div class="k">${escapeHtml(s.k)}</div></div>`)
    .join('')

  const dayItems = days
    .map((d) => `<li><b>第 ${d.day} 天</b> · ${escapeHtml(d.title)}</li>`)
    .join('')

  // 非按天内容 → 封面「方案总览」
  const nonDay = planMarkdown
    .split(/\r?\n/)
    .filter((l) => !/^#{1,4}\s*第\s*\d+\s*天[：:、\s]/.test(l))
    .join('\n')
    .trim()
  const overviewHtml = nonDay ? `<div class="overview"><h2>方案要点</h2>${markdownToHtml(nonDay)}</div>` : ''

  const subtitle = [duration && `时长 ${duration}`, people && `同行 ${people}`].filter(Boolean).join(' · ') || 'CUSTOM TRAVEL PLAN'

  // 封面
  const coverSlide = `
<section class="slide active">
  <div class="deco qcircle" style="top:-8px;right:-8px;background:var(--mint)"></div>
  <div class="deco ring" style="bottom:-14px;left:-14px"></div>
  <div class="kicker">CUSTOM TRAVEL PLAN</div>
  <h1 class="cover-title">${escapeHtml(destination || '我的旅行')}</h1>
  <p class="cover-sub">${escapeHtml(subtitle)}</p>
  <div class="stats">${statHtml}</div>
  <div class="cover-grid">
    <div class="cover-left">
      <div class="daylist">
        <div class="daylist-title">每日行程一览</div>
        <ol class="daylist-items">${dayItems}</ol>
      </div>
    </div>
    <div class="cover-right">${mapImg(coverMap, '全程地图')}</div>
  </div>
  ${overviewHtml}
</section>`

  // 每天页
  const daySlides = days
    .map((d, i) => {
      const accent = ACCENTS[i % ACCENTS.length]
      const pts = mapPoints.filter((p) => p.day === d.day)
      const wide = pts.length >= 2
      const img = toDataUri(dayBufs[i])
      const head = `
  <div class="day-head">
    <span class="day-badge" style="background:${accent}">DAY ${d.day}</span>
    <h2 class="day-title">${escapeHtml(d.title)}</h2>
  </div>`
      const body = `<div class="day-body">${markdownToHtml(d.markdown)}</div>`
      const map = wide
        ? `<div class="day-map-wide">${mapImg(img, `第 ${d.day} 天地图`)}</div>`
        : `<div class="day-map">${mapImg(img, `第 ${d.day} 天地图`)}</div>`
      return `
<section class="slide">
  <div class="deco qcircle" style="bottom:-8px;right:-8px;background:${accent}"></div>
  ${head}
  ${wide ? `<div class="day-grid-wide">${body}${map}</div>` : `<div class="day-grid">${body}${map}</div>`}
</section>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(destination || '旅行方案')} · 定制旅行方案</title>
<style>${RETRO_CSS}</style>
</head>
<body>
<div class="stage">
  <div>${coverSlide}${daySlides}</div>
</div>
<div class="nav">
  <button id="prev" class="plain">← 上一页</button>
  <div class="dots" id="dots"></div>
  <button id="next">下一页 →</button>
</div>
<p class="hint">← → 方向键翻页 · 打印可导出为 PDF 分页</p>
<script>${DECK_JS}</script>
</body>
</html>`
}
