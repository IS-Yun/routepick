const CATEGORIES = ['자연/생태', '문화/역사', '도시/체험', '맛집', '쇼핑'];

let SPOTS = [];
let map, layerGroup;
const DISTRICT_CACHE = {};

const $ = sel => document.querySelector(sel);

const CAT_COLORS = { '자연/생태': '#2bae8e', '문화/역사': '#c98a3a', '도시/체험': '#2a7de1', '맛집': '#e8553b', '쇼핑': '#9b6dd6' };
function placeholderImg(s) {
  const c = CAT_COLORS[s.category] || '#8893a3';
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260'><rect width='400' height='260' fill='${c}'/><text x='24' y='208' fill='#fff' font-size='26' font-weight='700' font-family='sans-serif'>${esc(s.name)}</text><text x='24' y='238' fill='#fff' opacity='0.85' font-size='15' font-family='sans-serif'>${esc(s.region)} · ${esc(s.category)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const imgOf = s => (s.image && (s.image.startsWith('http') || s.image.startsWith('/'))) ? s.image : placeholderImg(s);

const ratingOf = s => Math.round((s.pop != null ? s.pop : 0.5) * 5 * 10) / 10;
function starsHtml(s) {
  const r = ratingOf(s);
  const pct = (r / 5 * 100).toFixed(0);
  return `<span class="rating"><span class="stars" style="--p:${pct}%" aria-label="인기도 ${r.toFixed(1)}점"></span><b>${r.toFixed(1)}</b></span>`;
}

init();

let REGIONS, currentCity, currentDistrict;

async function init() {
  try {
    REGIONS = await fetch('/data/regions.json').then(r => r.json());
    await RouteModel.loadModel();
  } catch (e) {
    REGIONS = { cities: [] };
  }
  renderCategoryTabs();
  renderBuilderOptions();
  bindBuilder();
  bindDetailModal();
  setupRegions();
  $('#spotMore').addEventListener('click', () => { spotExpanded = !spotExpanded; drawSpots(); });

  if (REGIONS.cities.length) {
    currentCity = REGIONS.cities[0];
    await changeCity(currentCity.name);
  }
}

function fillSelect(sel, items, val) {
  if (!sel) return;
  sel.innerHTML = items.map(i => `<option value="${i}">${i}</option>`).join('');
  if (val) sel.value = val;
}

function setupRegions() {
  fillSelect($('#opCity'), REGIONS.cities.map(c => c.name), REGIONS.cities[0] && REGIONS.cities[0].name);
  $('#opCity').addEventListener('change', () => changeCity($('#opCity').value));
  $('#opDistrict').addEventListener('change', () => changeDistrict($('#opDistrict').value));
}

const SPOT_INDEX = {};
async function getDistrictSpots(name) {
  if (!DISTRICT_CACHE[name]) {
    const arr = await fetch(`/data/${currentCity.code}/${encodeURIComponent(name)}.json`).then(r => r.json());
    arr.forEach(s => { s.uid = name + '/' + s.id; SPOT_INDEX[s.uid] = s; });
    DISTRICT_CACHE[name] = arr;
  }
  return DISTRICT_CACHE[name];
}

async function changeCity(cityName) {
  currentCity = REGIONS.cities.find(c => c.name === cityName) || REGIONS.cities[0];
  if ($('#opCity')) $('#opCity').value = currentCity.name;
  if ($('#cityLabel')) $('#cityLabel').textContent = currentCity.name;
  const names = currentCity.districts.map(d => d.name);
  fillSelect($('#opDistrict'), names);
  buildDistrictChips(names);
  await changeDistrict(names[0]);
}

function buildDistrictChips(names) {
  const box = $('#opDistricts');
  if (!box) return;
  box.innerHTML = names.map(d => `<span class="chip dchip" data-d="${d}">${d}</span>`).join('');
  box.querySelectorAll('.dchip').forEach(ch => ch.addEventListener('click', () => ch.classList.toggle('on')));
}

function setBuilderDistrict(name) {
  const box = $('#opDistricts');
  if (!box) return;
  box.querySelectorAll('.dchip').forEach(ch => ch.classList.toggle('on', ch.dataset.d === name));
  const btn = $('#selAllDistricts');
  if (btn) syncSelAll('#opDistricts', '.dchip', btn);
}

async function changeDistrict(name) {
  currentDistrict = name;
  if ($('#opDistrict')) $('#opDistrict').value = name;
  try {
    SPOTS = await getDistrictSpots(name);
  } catch (e) { SPOTS = []; }
  spotExpanded = false;
  drawSpots();
  setBuilderDistrict(name);
  const sub = $('#exploreSub');
  if (sub) sub.textContent = `${currentCity.name} ${name}의 관광정보(${SPOTS.length}곳)를 테마별로 선별했습니다.`;
  $('#builderResult').classList.add('hidden');
  document.querySelector('.builder').classList.remove('has-result');
  $('#simulation').classList.add('hidden');
}

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
const pageSize = () => window.innerWidth <= 600 ? 4 : 8;

function renderSpots(cat) {
  curCat = cat;
  spotExpanded = false;
  drawSpots();
}

function drawSpots() {
  const PAGE = pageSize();
  const full = curCat === '전체' ? SPOTS : SPOTS.filter(s => s.category === curCat);
  const list = spotExpanded ? full : full.slice(0, PAGE);
  const grid = $('#spotGrid');
  if (!full.length) { grid.innerHTML = '<p class="share-empty">표시할 관광정보가 없습니다.</p>'; $('#spotMore').style.display = 'none'; return; }
  grid.innerHTML = list.map(s => `
    <div class="card" data-id="${s.uid}">
      <img src="${imgOf(s)}" alt="${s.name}" loading="lazy">
      <div class="card-body">
        <span class="card-cat">${s.category}</span>
        <h3>${s.name}</h3>
        <div class="card-region">${s.region} ${starsHtml(s)}</div>
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

function openDetail(id) {
  const s = SPOT_INDEX[id] || SPOTS.find(x => x.uid === id || x.id === id);
  if (!s) return;
  $('#dtImg').src = imgOf(s);
  $('#dtImg').alt = s.name;
  $('#dtCat').textContent = s.category;
  $('#dtName').textContent = s.name;
  $('#dtRegion').textContent = `${s.region}${s.addr ? ' · ' + s.addr : ''}`;
  $('#dtRating').innerHTML = `${starsHtml(s)} <span class="rating-cap">인기·완성도</span>`;

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
  if (s.lat && s.lng) links.push(`<a class="lk-nav" href="${naverMapUrl(s)}" target="_blank" rel="noopener">🗺 네이버지도 ↗</a>`);
  $('#dtLinks').innerHTML = links.join('');

  $('#detailModal').classList.remove('hidden');
}

function bindDetailModal() {
  const modal = $('#detailModal');
  $('#dtClose').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

function renderBuilderOptions() {
  $('#opCats').innerHTML = CATEGORIES.map(c =>
    `<span class="chip" data-cat="${c}">${c}</span>`).join('');
  $('#opCats').querySelectorAll('.chip').forEach(ch => {
    ch.addEventListener('click', () => ch.classList.toggle('on'));
  });
}

const brandOf = s => (s.name || '').split(/\s|\[|\(/)[0];
const tooClose = (a, b) => RouteEngine.distanceKm(a, b) < 0.12;

function pickOne(pool, picked) {
  let guard = pool.length;
  while (pool.length && guard-- > 0) {
    const w = pool.map(s => Math.pow(s.score, 5) + 1e-6);
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, i = 0;
    while (i < pool.length - 1 && (r -= w[i]) > 0) i++;
    const s = pool.splice(i, 1)[0];
    if (picked.some(c => brandOf(c) === brandOf(s))) continue;
    if (picked.some(c => tooClose(c, s))) continue;
    return s;
  }
  return null;
}

function pickWeighted(cand, need, picked) {
  const pool = cand.slice();
  const out = [];
  while (out.length < need) {
    const s = pickOne(pool, [...picked, ...out]);
    if (!s) break;
    out.push(s);
  }
  return out;
}

function selectSpots(scored, need, cats, maxFoods) {
  if (!cats.length) return pickWeighted(scored, need, []);
  const foodCap = (cats.includes('맛집') && cats.length > 1) ? (maxFoods != null ? maxFoods : Math.min(2, need - 1)) : Infinity;
  const pools = {};
  cats.forEach(c => pools[c] = scored.filter(s => s.category === c));
  const chosen = [];
  let foodCount = 0;
  while (chosen.length < need) {
    let progressed = false;
    const order = [...cats].sort(() => Math.random() - 0.5);
    for (const c of order) {
      if (chosen.length >= need) break;
      if (c === '맛집' && foodCount >= foodCap) continue;
      const s = pickOne(pools[c], chosen);
      if (s) { chosen.push(s); if (c === '맛집') foodCount++; progressed = true; }
    }
    if (!progressed) break;
  }
  if (chosen.length < need) {
    const others = scored.filter(s => !cats.includes(s.category));
    chosen.push(...pickWeighted(others, need - chosen.length, chosen));
  }
  return chosen;
}

function readOptions() {
  let districts = [...$('#opDistricts').querySelectorAll('.dchip.on')].map(c => c.dataset.d);
  if (!districts.length) districts = currentCity.districts.map(d => d.name);
  let categories = [...$('#opCats').querySelectorAll('.chip.on')].map(c => c.dataset.cat);
  if (!categories.length) categories = [...CATEGORIES];
  return {
    districts,
    categories,
    style: $('#opStyle').value,
    days: parseInt($('#opDays').value, 10)
  };
}

function centroidOf(pts) {
  const n = pts.length || 1;
  return [pts.reduce((a, p) => a + p.lat, 0) / n, pts.reduce((a, p) => a + p.lng, 0) / n];
}
function sq(p, c) { const dy = p.lat - c[0], dx = p.lng - c[1]; return dy * dy + dx * dx; }

function clusterDays(pts, k) {
  k = Math.min(k, pts.length);
  if (k <= 1) return [pts.slice()];
  const sorted = [...pts].sort((a, b) => a.lng - b.lng);
  let cents = [];
  for (let i = 0; i < k; i++) { const p = sorted[Math.floor(i * (pts.length - 1) / (k - 1))]; cents.push([p.lat, p.lng]); }
  const assign = new Array(pts.length).fill(0);
  for (let it = 0; it < 15; it++) {
    let changed = false;
    pts.forEach((p, i) => {
      let bi = 0, bd = Infinity;
      cents.forEach((c, ci) => { const d = sq(p, c); if (d < bd) { bd = d; bi = ci; } });
      if (assign[i] !== bi) { assign[i] = bi; changed = true; }
    });
    for (let ci = 0; ci < k; ci++) { const g = pts.filter((_, i) => assign[i] === ci); if (g.length) cents[ci] = centroidOf(g); }
    if (!changed) break;
  }
  const clusters = Array.from({ length: k }, () => []);
  pts.forEach((p, i) => clusters[assign[i]].push(p));
  for (let ci = 0; ci < k; ci++) {
    if (!clusters[ci].length) {
      const big = clusters.reduce((a, b) => b.length > a.length ? b : a);
      if (big.length > 1) clusters[ci].push(big.pop());
    }
  }
  return clusters.filter(c => c.length);
}

async function generate() {
  const o = readOptions();
  const perDay = RouteEngine.PACE[o.style] || 4;

  showResult();
  $('#loading').classList.remove('hidden');
  $('#simulation').classList.add('hidden');
  $('#map').style.display = '';
  $('#routeMsg').classList.add('hidden');

  await Promise.all(o.districts.map(getDistrictSpots));

  setTimeout(() => {
    const pool = o.districts.flatMap(d => DISTRICT_CACHE[d] || []);
    const scored = RouteModel.scoreSpots(pool, { categories: o.categories, style: o.style });

    const nD = o.districts.length;
    const foodOnly = o.categories.length === 1 && o.categories[0] === '맛집';
    const sightThemes = o.categories.filter(c => c !== '맛집');
    const wantFood = o.categories.includes('맛집');
    const foodsPerDay = foodOnly ? Math.min(perDay, 3) : (wantFood ? (perDay >= 5 ? 2 : 1) : 0);
    const sightsPerDay = foodOnly ? 0 : perDay - foodsPerDay;

    const pickPer = (themes, perDayCount) => {
      if (!themes.length || perDayCount <= 0) return [];
      const out = [];
      o.districts.forEach(d => {
        const ds = scored.filter(s => s.region === d && themes.includes(s.category));
        out.push(...selectSpots(ds, Math.ceil(perDayCount * o.days / nD), themes, Infinity));
      });
      return out.slice(0, perDayCount * o.days);
    };
    const sights = pickPer(sightThemes, sightsPerDay);
    const foods = pickPer(['맛집'], foodsPerDay);

    const result = { days: [], total: 0 };
    if (foodOnly) {
      clusterDays(foods, o.days).forEach((cl, i) => {
        const obj = RouteEngine.scheduleDay(cl, i + 1, [...new Set(cl.map(s => s.region))].join('·'));
        result.days.push(obj); result.total += obj.stops.length;
      });
    } else {
      const clusters = clusterDays(sights, o.days);
      const cents = clusters.map(centroidOf);
      const dayFoods = clusters.map(() => []);
      foods.forEach(f => {
        const order = cents.map((c, i) => [i, sq(f, c)]).sort((a, b) => a[1] - b[1]);
        const t = order.find(([i]) => dayFoods[i].length < foodsPerDay);
        if (t) dayFoods[t[0]].push(f);
      });
      clusters.forEach((cl, i) => {
        const daySpots = [...cl, ...dayFoods[i]];
        const where = [...new Set(daySpots.map(s => s.region))].join('·');
        const obj = RouteEngine.scheduleDay(daySpots, i + 1, where);
        result.days.push(obj); result.total += obj.stops.length;
      });
    }

    $('#loading').classList.add('hidden');
    renderSimulation(result, o);
  }, 700);
}

function showResult() {
  $('#builderResult').classList.remove('hidden');
  document.querySelector('.builder').classList.add('has-result');
}

function toggleSelectAll(boxSel, chipSel, btn) {
  const chips = [...$(boxSel).querySelectorAll(chipSel)];
  if (!chips.length) return;
  const allOn = chips.every(c => c.classList.contains('on'));
  chips.forEach(c => c.classList.toggle('on', !allOn));
  syncSelAll(boxSel, chipSel, btn);
}

function syncSelAll(boxSel, chipSel, btn) {
  const chips = [...$(boxSel).querySelectorAll(chipSel)];
  const allOn = chips.length && chips.every(c => c.classList.contains('on'));
  btn.textContent = allOn ? '전체해제' : '전체선택';
  btn.classList.toggle('on', allOn);
}

function bindBuilder() {
  $('#builderForm').addEventListener('submit', e => { e.preventDefault(); generate(); });
  $('#regenBtn').addEventListener('click', generate);

  const selDist = $('#selAllDistricts'), selCat = $('#selAllCats');
  selDist.addEventListener('click', () => toggleSelectAll('#opDistricts', '.dchip', selDist));
  selCat.addEventListener('click', () => toggleSelectAll('#opCats', '.chip', selCat));
  $('#opDistricts').addEventListener('click', () => syncSelAll('#opDistricts', '.dchip', selDist));
  $('#opCats').addEventListener('click', () => syncSelAll('#opCats', '.chip', selCat));
}

function ensureMap() {
  if (map) return;
  map = L.map('map', { scrollWheelZoom: false }).setView([37.5665, 126.978], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
}

function naverMapUrl(s) {
  const q = encodeURIComponent(`${s.region ? s.region + ' ' : ''}${s.name}`);
  return `https://map.naver.com/p/search/${q}?c=15.00,0,0,0,dh&lat=${s.lat}&lng=${s.lng}`;
}

const DAY_COLORS = ['#2a7de1', '#e8743b', '#2bae8e'];

function numIcon(n, color) {
  return L.divIcon({
    className: 'num-icon',
    html: `<div class="num-marker" style="background:${color}">${n}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13]
  });
}

function drawDay(day, di) {
  ensureMap();
  layerGroup.clearLayers();
  const color = DAY_COLORS[di % DAY_COLORS.length];
  const bounds = [];
  day.stops.forEach(s => {
    bounds.push([s.lat, s.lng]);
    L.marker([s.lat, s.lng], { icon: numIcon(s.order, color) }).addTo(layerGroup)
      .bindTooltip(`${s.order}. ${s.name}`, { direction: 'top', offset: [0, -10], opacity: 0.95 })
      .bindPopup(`<b>${s.order}. ${s.name}</b>${s.meal ? ' 🍽 ' + s.meal : ''}<br>${s.arrive} 도착 · ${s.category}<br><a class="naver-link" href="${naverMapUrl(s)}" target="_blank" rel="noopener">네이버지도에서 보기 ↗</a>`);
  });
  const pts = day.stops.map(s => [s.lat, s.lng]);
  if (pts.length > 1) L.polyline(pts, { color, weight: 3, opacity: .85 }).addTo(layerGroup);
  if (bounds.length) {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
  }
}

function renderSimulation(result, opts) {
  const sim = $('#simulation');
  sim.classList.remove('hidden');
  const cityShort = currentCity ? currentCity.name.replace(/특별시|광역시|특별자치시|특별자치도|도$/, '') : '';
  const uniqD = [...new Set(result.days.flatMap(d => d.stops.map(s => s.region)))];
  const where = uniqD.join('·');
  $('#simTitle').textContent = `${cityShort} ${where} ${dayLabel(opts.days)} 추천 코스 (총 ${result.total}곳)`;

  const tabs = $('#dayTabs');
  tabs.innerHTML = result.days.map((d, i) =>
    `<div class="day-tab ${i === 0 ? 'on' : ''}" data-day="${i}">${d.day}일차 · ${d.district}</div>`).join('');
  tabs.querySelectorAll('.day-tab').forEach(t => {
    t.addEventListener('click', () => {
      tabs.querySelectorAll('.day-tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      const di = parseInt(t.dataset.day, 10);
      renderDay(result.days[di]);
      drawDay(result.days[di], di);
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
      <div class="tl-card" data-id="${s.uid}">
        <img src="${imgOf(s)}" alt="${s.name}" loading="lazy">
        <div class="tl-info">
          <span class="order">${s.meal ? `<b class="meal-tag">🍽 ${s.meal}</b> · ` : ''}${s.order}번째 코스 · ${s.arrive}~${s.leave}</span>
          <h4>${s.name}</h4>
          <div class="meta"><span>📍 ${s.category}</span><span>${starsHtml(s)}</span><span>🕒 ${s.hours || '-'}</span></div>
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
