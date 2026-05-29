// 콘텐츠랩에서 다운로드한 은평구 데이터(xlsx + 이미지)를 앱 형식(spots.json)으로 적재한다.
//   node scripts/ingest-xlsx.js [--inspect]
// 의존성 없이 xlsx(zip)를 PowerShell로 풀고, inlineStr 시트를 직접 파싱한다.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONTENTS = path.join(ROOT, '..');            // C:\Users\SMCW\Desktop\contents
const XLSX = path.join(CONTENTS, '은평구.xlsx');
const IMG_SRC = path.join(CONTENTS, 'image');
const IMG_DST = path.join(ROOT, 'public', 'images');
const INSPECT = process.argv.includes('--inspect');

const SHEET_FILE = {                                 // workbook.xml.rels 기준
  '관광지': 'sheet1', '문화시설': 'sheet2', '축제공연행사': 'sheet3',
  '레포츠': 'sheet4', '숙박': 'sheet5', '쇼핑': 'sheet6', '음식점': 'sheet7'
};

// 시트(콘텐츠 타입) → 서비스 테마. '숙박'은 루트 경유지로 제외(null).
// 값이 있으면 그 테마, 없으면(관광지·레포츠·축제공연행사) 키워드로 분류, null이면 제외(숙박)
const SHEET_CAT = {
  '문화시설': '문화/역사',
  '쇼핑': '맛집/쇼핑', '음식점': '맛집/쇼핑', '숙박': null
};
const STAY = { '자연/생태': 120, '문화/역사': 90, '도시/체험': 60, '맛집/쇼핑': 45 };

// 관광지·레포츠·축제공연행사를 이름·개요 키워드로 4개 테마 중 하나로 분류
function inferTourist(name, desc) {
  const n = (name || '').replace(/\([^)]*\)/g, '').trim();   // 괄호 표기 제거
  const t = n + ' ' + (desc || '');
  // 문화/역사 — 이름 우선(사찰·궁·능 등 접미사 / 시설·전통 키워드)
  if (/(사|암|절|궁|릉|능|묘|탑|성|각|단|향교|서원)$/.test(n) ||
      /사찰|한옥|유적|문화재|박물관|미술관|도서관|기념관|역사관|향교|서원|성당|성지|전통문화|국악|한복/.test(t)) return '문화/역사';
  // 자연/생태 — 자연·꽃·계절 축제 포함
  if (/산|둘레길|공원|계곡|숲|하천|호수|생태|폭포|약수|벚꽃|단풍|꽃축제|나들이|정원|천$/.test(n) ||
      /북한산|둘레길|계곡|생태공원|숲길|산책로|벚꽃|단풍/.test(desc)) return '자연/생태';
  // 맛집/쇼핑 — 먹거리·미식 행사 (이름 기준, 개요 오탐 방지)
  if (/음식|맛집|먹거리|미식|푸드|시장축제|플리마켓/.test(n)) return '맛집/쇼핑';
  // 그 외(공연·체험·청년·도심 행사) → 도시/체험
  return '도시/체험';
}

// 엑셀 압축 해제 (PowerShell Expand-Archive)
function extractXlsx() {
  const tmp = path.join(os.tmpdir(), 'routepick_xlsx');
  const zip = path.join(os.tmpdir(), 'routepick_eunpyeong.zip');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.copyFileSync(XLSX, zip);
  execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force"`, { stdio: 'ignore' });
  return tmp;
}

// HTML 엔티티 디코드
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const colToIdx = c => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

// 시트 XML → 행 배열(헤더 기반 객체)
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
      if (cm[2]) {
        const t = cm[2].match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (t) text = decode(t[1]);
      }
      cells[idx] = text.trim();
    }
    rows.push(cells);
  }
  if (!rows.length) return [];
  const header = rows[0].map(h => (h || '').trim());
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { if (h) o[h] = r[i] || ''; });
    return o;
  });
}

function findKey(obj, re) {
  return Object.keys(obj).find(k => re.test(k));
}

// 같은 몰/백화점에 입점한 개별 브랜드 매장을 묶기 위한 장소 키 (예: 나이키 롯데몰 은평점 → 롯데몰 은평점)
function venueKey(name) {
  const m = name.match(/(롯데몰|롯데백화점|롯데마트|롯데아울렛|NC백화점|현대백화점|신세계백화점|이마트|홈플러스|코스트코|[가-힣A-Za-z]*프리미엄아울렛|[가-힣A-Za-z]*아울렛)/);
  if (!m) return null;
  const after = name.slice(m.index + m[0].length);
  const b = after.match(/([가-힣]{2,4}점)/);   // 은평점 / 불광점 등 지점명
  return m[1] + (b ? ' ' + b[1] : '');
}

// 이미지 매칭 준비: 명칭 → 대표 이미지 파일
function buildImageIndex() {
  if (!fs.existsSync(IMG_SRC)) return {};
  const files = fs.readdirSync(IMG_SRC);
  const norm = s => s.replace(/[\s\[\]()_·\-]/g, '').toLowerCase();
  const index = {};
  for (const f of files) {
    const base = f.split(/_\d+_/)[0];        // 명칭_번호_공공3유형.ext → 명칭
    const num = (f.match(/_(\d+)_/) || [0, 999])[1];
    const key = norm(base);
    if (!index[key] || +num < +index[key].num) index[key] = { file: f, num };
  }
  return { index, norm };
}

function main() {
  const dir = extractXlsx();
  const imgIdx = buildImageIndex();
  const spots = [];
  const summary = {};
  let idCounter = 0;

  for (const [sheet, file] of Object.entries(SHEET_FILE)) {
    const xml = fs.readFileSync(path.join(dir, 'xl', 'worksheets', file + '.xml'), 'utf-8');
    const rows = parseSheet(xml);
    summary[sheet] = rows.length;
    if (INSPECT) {
      console.log(`\n[${sheet}] ${rows.length}행 / 컬럼: ${Object.keys(rows[0] || {}).join(', ')}`);
      if (rows[0]) console.log('  예:', JSON.stringify(rows[0]).slice(0, 300));
      continue;
    }
    if (SHEET_CAT[sheet] === null) continue;     // 숙박 제외

    for (const r of rows) {
      const name = r[findKey(r, /^명칭|^제목|^콘텐츠명|^명소명/)] || r['명칭'];
      const latK = findKey(r, /위도/), lngK = findKey(r, /경도/);
      const lat = parseFloat(r[latK]); const lng = parseFloat(r[lngK]);
      if (!name || !isFinite(lat) || !isFinite(lng)) continue;
      // 좌표 오류 데이터 제외 (대한민국 범위 밖)
      if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
        console.warn('  좌표 범위 밖 제외:', name, lat, lng);
        continue;
      }

      const fullDesc = (r[findKey(r, /개요/)] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const desc = fullDesc;
      const category = SHEET_CAT[sheet] != null ? SHEET_CAT[sheet] : inferTourist(name, desc);
      const addr = r[findKey(r, /^주소|소재지/)] || '';
      const hours = r[findKey(r, /이용시간|운영시간|영업시간|관람시간|이용가능/)] || '';
      const fee = r[findKey(r, /이용요금|입장료|관람료/)] || '';

      // 전화번호: 전화번호 컬럼 → 없으면 '문의 및 안내'에서 전화 패턴 추출
      const telRaw = r[findKey(r, /^전화번호/)] || r[findKey(r, /문의 및 안내|문의|연락처/)] || '';
      const telM = telRaw.match(/0\d{1,2}[-\s)]?\d{3,4}[-\s]?\d{4}/);
      const tel = telM ? telM[0].replace(/[\s)]/g, '-').replace(/-+/g, '-') : '';
      // 홈페이지: 데이터에 URL이 있으면 사용(없으면 비움 → 모달에서 관광정보 검색으로 대체)
      const urlM = (fullDesc + ' ' + (r[findKey(r, /홈페이지|상세정보/)] || '')).match(/https?:\/\/[^\s"'<>]+/);
      const home = urlM ? urlM[0] : '';

      // 이미지 매칭
      let image = '';
      if (imgIdx.index) {
        const hit = imgIdx.index[imgIdx.norm(name)];
        if (hit) image = '/images/' + hit.file;
      }

      // 체류시간: 테마 기준값에 콘텐츠 분량을 반영해 장소별로 변별
      const base = STAY[category] || 75;
      const stay = Math.max(30, Math.min(210, base + Math.round((fullDesc.length - 140) / 4)));

      spots.push({
        id: 'e' + String(++idCounter).padStart(3, '0'),
        name, region: '은평구', category,
        lat, lng,
        stay,
        fee: fee || '정보 없음',
        hours: hours || '상시',
        addr,
        tel,
        home,
        desc: desc.slice(0, 320),
        image
      });
    }
  }

  if (INSPECT) { console.log('\n요약:', summary); return; }

  // 같은 몰/백화점 입점 매장을 대표 1곳으로 합치기 (예: 롯데몰 은평점)
  const groups = new Map();
  const collapsed = [];
  let mergedCount = 0;
  for (const s of spots) {
    const key = venueKey(s.name);
    if (!key) { collapsed.push(s); continue; }
    if (!groups.has(key)) {
      const rep = {
        ...s, name: key, category: '맛집/쇼핑', stay: 90,
        desc: `${key}에 다양한 브랜드 매장이 입점한 복합 쇼핑 공간입니다. 쇼핑과 식사를 한 곳에서 즐길 수 있습니다.`
      };
      groups.set(key, rep);
      collapsed.push(rep);
    } else {
      const rep = groups.get(key);
      if (!rep.image && s.image) rep.image = s.image;
      mergedCount++;
    }
  }
  spots.length = 0;
  spots.push(...collapsed);
  console.log(`몰/백화점 매장 합치기: ${groups.size}개 장소로 통합 (${mergedCount}개 매장 병합)`);

  // 매칭된 이미지 복사
  fs.mkdirSync(IMG_DST, { recursive: true });
  let copied = 0;
  for (const s of spots) {
    if (!s.image) continue;
    const fn = s.image.replace('/images/', '');
    try { fs.copyFileSync(path.join(IMG_SRC, fn), path.join(IMG_DST, fn)); copied++; } catch (e) { s.image = ''; }
  }

  // 정적 배포(Vercel 등)를 위해 public 아래에 저장
  fs.writeFileSync(path.join(ROOT, 'public', 'spots.json'), JSON.stringify(spots, null, 2));
  fs.writeFileSync(path.join(ROOT, 'data', 'spots.json'), JSON.stringify(spots, null, 2)); // 로컬 서버 호환

  const byCat = {};
  spots.forEach(s => byCat[s.category] = (byCat[s.category] || 0) + 1);
  console.log(`완료: ${spots.length}곳 저장 (이미지 ${copied}개 복사)`);
  console.log('시트별 행수:', summary);
  console.log('테마 분포:', byCat);
  console.log('이미지 있는 곳:', spots.filter(s => s.image).length);
}

main();
