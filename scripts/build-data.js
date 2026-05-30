const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { popOf } = require('./popularity.js');

const ROOT = path.join(__dirname, '..');
const LAB = process.argv[2] || path.join(ROOT, '..', 'lab_data');

const CITIES = [{ name: '서울특별시', code: 'seoul', dir: LAB }];

const SHEET_CAT = { '문화시설': '문화/역사', '쇼핑': '쇼핑', '음식점': '맛집', '숙박': null };
const STAY = { '자연/생태': 120, '문화/역사': 90, '도시/체험': 60, '맛집': 75, '쇼핑': 45 };

function inferTourist(name, desc) {
  const n = (name || '').replace(/\([^)]*\)/g, '').trim();
  const t = n + ' ' + (desc || '');
  if (/(사|암|절|궁|릉|능|묘|탑|성|각|단|향교|서원)$/.test(n) ||
      /사찰|한옥|유적|문화재|박물관|미술관|도서관|기념관|역사관|향교|서원|성당|성지|전통문화|국악|한복/.test(t)) return '문화/역사';
  if (/산|둘레길|공원|계곡|숲|하천|호수|생태|폭포|약수|벚꽃|단풍|꽃축제|나들이|정원|천$/.test(n) ||
      /북한산|둘레길|계곡|생태공원|숲길|산책로|벚꽃|단풍/.test(desc)) return '자연/생태';
  if (/음식|맛집|먹거리|미식|푸드/.test(n)) return '맛집';
  if (/시장축제|플리마켓|쇼핑/.test(n)) return '쇼핑';
  return '도시/체험';
}

function venueKey(name) {
  const m = name.match(/(롯데몰|롯데백화점|롯데마트|롯데아울렛|NC백화점|현대백화점|신세계백화점|이마트|홈플러스|코스트코|[가-힣A-Za-z]*프리미엄아울렛|[가-힣A-Za-z]*아울렛)/);
  if (!m) return null;
  const after = name.slice(m.index + m[0].length);
  const b = after.match(/([가-힣]{2,4}점)/);
  return m[1] + (b ? ' ' + b[1] : '');
}

function decode(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
const colToIdx = c => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function parseSheet(xml) {
  const rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const idx = colToIdx(cm[1]);
      let text = '';
      if (cm[2]) { const t = cm[2].match(/<t[^>]*>([\s\S]*?)<\/t>/); if (t) text = decode(t[1]); }
      cells[idx] = text.trim();
    }
    rows.push(cells);
  }
  if (!rows.length) return [];
  const header = rows[0].map(h => (h || '').trim());
  return rows.slice(1).map(r => { const o = {}; header.forEach((h, i) => { if (h) o[h] = r[i] || ''; }); return o; });
}

const findKey = (obj, re) => Object.keys(obj).find(k => re.test(k));

function extract(xlsx) {
  const tmp = path.join(os.tmpdir(), 'rp_build_' + Math.random().toString(36).slice(2));
  const zip = tmp + '.zip';
  fs.copyFileSync(xlsx, zip);
  execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force"`, { stdio: 'ignore' });
  fs.rmSync(zip, { force: true });
  return tmp;
}

function sheetMap(dir) {
  const wb = fs.readFileSync(path.join(dir, 'xl', 'workbook.xml'), 'utf8');
  const rels = fs.readFileSync(path.join(dir, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
  const relMap = {};
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0];
    const name = tag.match(/name="([^"]+)"/);
    const rid = tag.match(/r:id="([^"]+)"/);
    if (!name || !rid || !relMap[rid[1]]) continue;
    const target = relMap[rid[1]].replace(/^\/?(xl\/)?/, '');
    out.push({ name: decode(name[1]), file: path.join(dir, 'xl', target) });
  }
  return out;
}

function imageIndex(imgDir) {
  if (!fs.existsSync(imgDir)) return null;
  const norm = s => s.replace(/[\s\[\]()·\-_]/g, '').toLowerCase();
  const index = {};
  for (const f of fs.readdirSync(imgDir)) {
    const base = f.split(/_\d+_/)[0];
    const num = (f.match(/_(\d+)_/) || [0, 999])[1];
    const key = norm(base);
    if (!index[key] || +num < +index[key].num) index[key] = { file: f, num };
  }
  return { index, norm };
}

function buildDistrict(cityDir, district, cityName) {
  const xlsx = path.join(cityDir, district + '.xlsx');
  const imgDir = path.join(cityDir, district + '_image');
  const dir = extract(xlsx);
  const imgIdx = imageIndex(imgDir);
  const sheets = sheetMap(dir);

  let spots = [];
  let i = 0;
  for (const sh of sheets) {
    if (SHEET_CAT[sh.name] === null) continue;
    const rows = parseSheet(fs.readFileSync(sh.file, 'utf8'));
    for (const r of rows) {
      const name = r['명칭'] || r[findKey(r, /^명칭|^제목|^명소명/)];
      const lat = parseFloat(r[findKey(r, /위도/)]);
      const lng = parseFloat(r[findKey(r, /경도/)]);
      if (!name || !isFinite(lat) || !isFinite(lng)) continue;
      if (lat < 33 || lat > 39 || lng < 124 || lng > 132) continue;

      const fullDesc = (r[findKey(r, /개요/)] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const category = SHEET_CAT[sh.name] != null ? SHEET_CAT[sh.name] : inferTourist(name, fullDesc);
      const hours = r[findKey(r, /이용시간|운영시간|영업시간|관람시간|이용가능/)] || '';
      const fee = r[findKey(r, /이용요금|입장료|관람료/)] || '';
      const telRaw = r[findKey(r, /^전화번호/)] || r[findKey(r, /문의 및 안내|문의|연락처/)] || '';
      const telM = telRaw.match(/0\d{1,2}[-\s)]?\d{3,4}[-\s]?\d{4}/);
      const tel = telM ? telM[0].replace(/[\s)]/g, '-').replace(/-+/g, '-') : '';
      const urlM = (fullDesc + ' ' + (r[findKey(r, /홈페이지|상세정보/)] || '')).match(/https?:\/\/[^\s"'<>]+/);
      const home = urlM ? urlM[0] : '';

      let image = '';
      if (imgIdx) { const hit = imgIdx.index[imgIdx.norm(name)]; if (hit) image = hit.file; }

      const base = STAY[category] || 75;
      const stay = Math.max(30, Math.min(210, base + Math.round((fullDesc.length - 140) / 4)));

      spots.push({
        id: 'd' + (++i), name, city: cityName, region: district, category,
        lat, lng, stay, fee: fee || '정보 없음', hours: hours || '상시',
        addr: r[findKey(r, /^주소|소재지/)] || '', tel, home,
        desc: fullDesc.slice(0, 320), _img: image
      });
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });

  const groups = new Map();
  const collapsed = [];
  for (const s of spots) {
    const key = venueKey(s.name);
    if (!key) { collapsed.push(s); continue; }
    if (!groups.has(key)) {
      const rep = { ...s, name: key, category: '쇼핑', stay: 90, desc: `${key}에 다양한 브랜드 매장이 입점한 복합 쇼핑 공간입니다.` };
      groups.set(key, rep); collapsed.push(rep);
    } else { const rep = groups.get(key); if (!rep._img && s._img) rep._img = s._img; }
  }
  spots = collapsed;
  return { spots, imgDir };
}

function main() {
  if (!fs.existsSync(LAB)) { process.exit(1); }

  fs.rmSync(path.join(ROOT, 'public', 'spots.json'), { force: true });
  fs.rmSync(path.join(ROOT, 'public', 'images'), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, 'public', 'data'), { recursive: true, force: true });

  const regions = { cities: [] };

  for (const city of CITIES) {
    const districts = fs.readdirSync(city.dir)
      .filter(f => f.endsWith('.xlsx'))
      .map(f => f.replace(/\.xlsx$/, ''));

    const outDataDir = path.join(ROOT, 'public', 'data', city.code);
    fs.mkdirSync(outDataDir, { recursive: true });

    const cityEntry = { name: city.name, code: city.code, districts: [] };

    for (const district of districts) {
      const { spots, imgDir } = buildDistrict(city.dir, district, city.name);

      const outImgDir = path.join(ROOT, 'public', 'images', city.code, district);
      fs.mkdirSync(outImgDir, { recursive: true });
      for (const s of spots) {
        if (s._img) {
          try {
            fs.copyFileSync(path.join(imgDir, s._img), path.join(outImgDir, s._img));
            s.image = `/images/${city.code}/${district}/${s._img}`;
          } catch (e) { s.image = ''; }
        } else s.image = '';
        delete s._img;
        s.pop = popOf(s);
      }

      fs.writeFileSync(path.join(outDataDir, district + '.json'), JSON.stringify(spots));
      cityEntry.districts.push({ name: district, count: spots.length });
    }

    cityEntry.districts.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    regions.cities.push(cityEntry);
  }

  fs.writeFileSync(path.join(ROOT, 'public', 'data', 'regions.json'), JSON.stringify(regions, null, 2));
}

main();
