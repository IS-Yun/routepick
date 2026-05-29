const CATEGORIES = ['자연/생태', '문화/역사', '도시/체험', '맛집/쇼핑'];

let SPOTS = [];
let map, layerGroup;

const $ = sel => document.querySelector(sel);

// 이미지가 없을 때 쓰는 클라이언트 생성 폴백(서버 불필요 → 정적 배포 가능)
const CAT_COLORS = { '자연/생태': '#2bae8e', '문화/역사': '#c98a3a', '도시/체험': '#2a7de1', '맛집/쇼핑': '#e8743b' };
function placeholderImg(s) {
  const c = CAT_COLORS[s.category] || '#8893a3';
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260'><rect width='400' height='260' fill='${c}'/><text x='24' y='208' fill='#fff' font-size='26' font-weight='700' font-family='sans-serif'>${esc(s.name)}</text><text x='24' y='238' fill='#fff' opacity='0.85' font-size='15' font-family='sans-serif'>${esc(s.region)} · ${esc(s.category)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const imgOf = s => (s.image && (s.image.startsWith('http') || s.image.startsWith('/'))) ? s.image : placeholderImg(s);

init();

async function init() {
  try {
    SPOTS = await fetch('/spots.json').then(r => r.json());
    const m = await RouteModel.loadModel();
    console.log(`[AI] 모델 로드 완료 — 구조 ${m.layers.map(L => L.inN + '→' + L.outN).join(', ')}, 학습 ${m.samples}샘플, 검증손실 ${m.finalValLoss}`);
  } catch (e) {
    SPOTS = SPOTS || [];
  }
  renderCategoryTabs();
  renderSpots('전체');
  renderBuilderOptions();
  bindBuilder();
  bindDetailModal();
  $('#spotMore').addEventListener('click', () => { spotExpanded = !spotExpanded; drawSpots(); });
}

/* ---------- 테마별 큐레이션 ---------- */
function renderCategoryTabs() {
  const tabs = $('#catTabs');
  const all = ['전체', ...CATEGORIES];
  tabs.innerHTML = all.map((c, i) =>
    `<div class="tab ${i === 0 ? 'on' : ''}" data-cat="${c}">${c}</div>`).join('');
  tabs.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      tabs.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      renderSpots(t.dataset.cat);
    });
  });
}

let curCat = '전체';
let spotExpanded = false;
const PAGE = 8;

function renderSpots(cat) {
  curCat = cat;
  spotExpanded = false;
  drawSpots();
}

function drawSpots() {
  const full = curCat === '전체' ? SPOTS : SPOTS.filter(s => s.category === curCat);
  const list = spotExpanded ? full : full.slice(0, PAGE);
  const grid = $('#spotGrid');
  if (!full.length) { grid.innerHTML = '<p class="share-empty">표시할 관광정보가 없습니다.</p>'; $('#spotMore').style.display = 'none'; return; }
  grid.innerHTML = list.map(s => `
    <div class="card" data-id="${s.id}">
      <img src="${imgOf(s)}" alt="${s.name}" loading="lazy">
      <div class="card-body">
        <span class="card-cat">${s.category}</span>
        <h3>${s.name}</h3>
        <div class="card-region">${s.region}</div>
        <p>${s.desc || ''}</p>
      </div>
    </div>`).join('');
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });

  const more = $('#spotMore');
  if (full.length > PAGE) {
    more.style.display = '';
    more.textContent = spotExpanded ? '접기 ▲' : `전체 보기 (${full.length}곳) ▼`;
  } else {
    more.style.display = 'none';
  }
}

/* ---------- 관광지 상세 모달 ---------- */
function openDetail(id) {
  const s = SPOTS.find(x => x.id === id);
  if (!s) return;
  $('#dtImg').src = imgOf(s);
  $('#dtImg').alt = s.name;
  $('#dtCat').textContent = s.category;
  $('#dtName').textContent = s.name;
  $('#dtRegion').textContent = `${s.region}${s.addr ? ' · ' + s.addr : ''}`;

  const meta = [];
  if (s.hours) meta.push(['이용시간', s.hours]);
  if (s.fee) meta.push(['요금', s.fee]);
  meta.push(['예상 체류', `약 ${s.stay}분`]);
  $('#dtMeta').innerHTML = meta.map(([k, v]) => `<li><b>${k}</b><span>${escapeHtml(v)}</span></li>`).join('');
  $('#dtDesc').textContent = s.desc || '소개 정보가 준비 중입니다.';

  const links = [];
  if (s.tel) links.push(`<a class="lk-tel" href="tel:${s.tel}">📞 ${s.tel}</a>`);
  const web = s.home || `https://korean.visitkorea.or.kr/search/search_list.do?keyword=${encodeURIComponent(s.name)}`;
  links.push(`<a class="lk-web" href="${web}" target="_blank" rel="noopener">관광정보 보기 ↗</a>`);
  $('#dtLinks').innerHTML = links.join('');

  $('#detailModal').classList.remove('hidden');
}

function bindDetailModal() {
  const modal = $('#detailModal');
  $('#dtClose').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

/* ---------- 빌더 옵션 ---------- */
function renderBuilderOptions() {
  $('#opCats').innerHTML = CATEGORIES.map(c =>
    `<span class="chip" data-cat="${c}">${c}</span>`).join('');
  $('#opCats').querySelectorAll('.chip').forEach(ch => {
    ch.addEventListener('click', () => ch.classList.toggle('on'));
  });
}

/* ---------- 모델 점수 기반 선택 ----------
   - 선택한 테마를 우선 채우고 부족분만 다른 테마로 보충
   - 같은 위치(120m 이내)·같은 브랜드 중복 방지
   - 가중 무작위 → 매번 다른 코스 */
const brandOf = s => (s.name || '').split(/\s|\[|\(/)[0];     // 첫 토큰(올리브영, 이마트 …)
const tooClose = (a, b) => RouteEngine.distanceKm(a, b) < 0.12;

function pickWeighted(cand, need, picked) {
  const out = [];
  const pool = cand.slice();
  const brands = new Set(picked.map(brandOf));
  while (out.length < need && pool.length) {
    const w = pool.map(s => Math.pow(s.score, 5) + 1e-6);
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, i = 0;
    while (i < pool.length - 1 && (r -= w[i]) > 0) i++;
    const s = pool.splice(i, 1)[0];
    if (brands.has(brandOf(s))) continue;                     // 같은 브랜드 제외
    if ([...picked, ...out].some(c => tooClose(c, s))) continue; // 같은 위치 제외
    brands.add(brandOf(s));
    out.push(s);
  }
  return out;
}

function selectSpots(scored, need, cats) {
  if (!cats.length) return pickWeighted(scored, need, []);
  const inTheme = scored.filter(s => cats.includes(s.category));
  const others = scored.filter(s => !cats.includes(s.category));
  const primary = pickWeighted(inTheme, need, []);
  if (primary.length >= need) return primary;
  return primary.concat(pickWeighted(others, need - primary.length, primary));
}

/* ---------- 루트 생성 ---------- */
function readOptions() {
  return {
    region: $('#opRegion').value,
    categories: [...$('#opCats').querySelectorAll('.chip.on')].map(c => c.dataset.cat),
    style: $('#opStyle').value,
    days: parseInt($('#opDays').value, 10)
  };
}

function generate() {
  const o = readOptions();
  const perDay = RouteEngine.PACE[o.style] || 4;
  const pool = SPOTS.filter(s => s.region === o.region);

  showResult();
  $('#loading').classList.remove('hidden');     // AI 분석 표시
  $('#simulation').classList.add('hidden');

  // 실제 추론 + 자연스러운 분석 연출(추론 자체는 수 ms로 매우 빠름)
  setTimeout(() => {
    if (!pool.length) {
      $('#loading').classList.add('hidden');
      $('#map').style.display = 'none';
      $('#routeMsg').classList.remove('hidden');
      return;
    }
    $('#map').style.display = '';
    $('#routeMsg').classList.add('hidden');

    const t0 = performance.now();
    const scored = RouteModel.scoreSpots(pool, { categories: o.categories, style: o.style });
    const t1 = performance.now();
    console.log(`[AI] 신경망 추론 실행 — ${pool.length}곳 적합도 계산 ${(t1 - t0).toFixed(2)}ms (예: 최고 ${(scored[0].score * 100).toFixed(1)}% ${scored[0].name})`);

    const selected = selectSpots(scored, Math.min(perDay * o.days, scored.length), o.categories);
    const result = RouteEngine.schedule(selected, o.days, perDay);

    $('#loading').classList.add('hidden');
    renderSimulation(result, o);
  }, 700);
}

function showResult() {
  $('#builderResult').classList.remove('hidden');
  document.querySelector('.builder').classList.add('has-result');
}

function bindBuilder() {
  $('#builderForm').addEventListener('submit', e => { e.preventDefault(); generate(); });
  $('#regenBtn').addEventListener('click', generate);
}

/* ---------- 지도 ---------- */
function ensureMap() {
  if (map) return;
  map = L.map('map', { scrollWheelZoom: false }).setView([37.6027, 126.9292], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
}

const DAY_COLORS = ['#2a7de1', '#e8743b', '#2bae8e'];

function numIcon(n, color) {
  return L.divIcon({
    className: 'num-icon',
    html: `<div class="num-marker" style="background:${color}">${n}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13]
  });
}

// 선택한 일차만 지도에 표시
function drawDay(day, di) {
  ensureMap();
  layerGroup.clearLayers();
  const color = DAY_COLORS[di % DAY_COLORS.length];
  const bounds = [];
  day.stops.forEach(s => {
    bounds.push([s.lat, s.lng]);
    L.marker([s.lat, s.lng], { icon: numIcon(s.order, color) }).addTo(layerGroup)
      .bindPopup(`<b>${s.order}. ${s.name}</b><br>${s.arrive} 도착 · 적합도 ${(s.score * 100).toFixed(0)}%`);
  });
  const pts = day.stops.map(s => [s.lat, s.lng]);
  if (pts.length > 1) L.polyline(pts, { color, weight: 3, opacity: .85 }).addTo(layerGroup);
  if (bounds.length) {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
  }
}

/* ---------- 시뮬레이션 ---------- */
function renderSimulation(result, opts) {
  const sim = $('#simulation');
  sim.classList.remove('hidden');
  $('#simTitle').textContent = `${opts.region} ${dayLabel(opts.days)} 추천 코스 (총 ${result.total}곳)`;

  const tabs = $('#dayTabs');
  tabs.innerHTML = result.days.map((d, i) =>
    `<div class="day-tab ${i === 0 ? 'on' : ''}" data-day="${i}">${d.day}일차</div>`).join('');
  tabs.querySelectorAll('.day-tab').forEach(t => {
    t.addEventListener('click', () => {
      tabs.querySelectorAll('.day-tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      const di = parseInt(t.dataset.day, 10);
      renderDay(result.days[di]);
      drawDay(result.days[di], di);          // 해당 일차만 지도에 표시
    });
  });
  renderDay(result.days[0]);
  drawDay(result.days[0], 0);
}

function renderDay(day) {
  $('#timeline').innerHTML = day.stops.map(s => `
    <div class="tl-item">
      <div class="tl-time">${s.arrive}</div>
      <div class="tl-dot"></div>
      <div class="tl-card" data-id="${s.id}">
        <img src="${imgOf(s)}" alt="${s.name}" loading="lazy">
        <div class="tl-info">
          <span class="order">${s.order}번째 코스 · ${s.arrive}~${s.leave} · <b style="color:#2a7de1">AI 적합도 ${(s.score * 100).toFixed(0)}%</b></span>
          <h4>${s.name}</h4>
          <div class="meta"><span>📍 ${s.category}</span><span>🕒 ${s.hours || '-'}</span><span>💳 ${s.fee || '-'}</span></div>
          <p>${s.desc || ''}</p>
        </div>
      </div>
    </div>`).join('');
  $('#timeline').querySelectorAll('.tl-card').forEach(c => {
    c.addEventListener('click', () => openDetail(c.dataset.id));
  });
}

function dayLabel(d) { return d === 1 ? '당일' : `${d - 1}박 ${d}일`; }

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
