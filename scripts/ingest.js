// 통합검색 다운로드 데이터를 앱이 쓰는 형식(spots.json)으로 변환한다.
//   사용법: node scripts/ingest.js [입력파일]
//   입력파일 미지정 시 data/raw.csv → data/raw.json 순으로 찾는다.
//   지원 형식: CSV, JSON (배열 또는 { items: [...] } / TourAPI 응답 구조)

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

// 한국관광공사 지역코드 → 지역명
const AREA = {
  '1': '서울', '2': '인천', '3': '대전', '4': '대구', '5': '광주', '6': '부산',
  '7': '울산', '8': '세종', '31': '경기', '32': '강원', '33': '충북', '34': '충남',
  '35': '경북', '36': '경남', '37': '전북', '38': '전남', '39': '제주'
};

// cat1 / contentTypeId → 서비스 테마 4종
const CAT1 = { A01: '자연/생태', A02: '문화/역사', A03: '도시/체험', A04: '맛집/쇼핑', A05: '맛집/쇼핑', B02: '도시/체험', C01: '도시/체험' };
const CTYPE = { '12': '문화/역사', '14': '문화/역사', '15': '도시/체험', '25': '도시/체험', '28': '도시/체험', '32': '도시/체험', '38': '맛집/쇼핑', '39': '맛집/쇼핑' };

function normCategory(row) {
  const cat1 = pick(row, ['cat1', '대분류코드', '대분류']);
  if (cat1 && CAT1[cat1.toUpperCase?.() || cat1]) return CAT1[cat1.toUpperCase()];
  const ct = pick(row, ['contenttypeid', 'contentTypeId', '콘텐츠타입', '관광타입']);
  if (ct && CTYPE[String(ct)]) return CTYPE[String(ct)];
  // 텍스트 분류명으로 추정
  const text = (pick(row, ['분류', '중분류', '유형', 'category', '테마']) || '') + (cat1 || '');
  if (/자연|생태|해수욕|산|공원|섬|숲/.test(text)) return '자연/생태';
  if (/음식|맛집|식당|쇼핑|시장|카페/.test(text)) return '맛집/쇼핑';
  if (/문화|역사|유적|사찰|궁|박물|한옥/.test(text)) return '문화/역사';
  return '도시/체험';
}

function normRegion(row) {
  const name = pick(row, ['지역', '지역명', '시도', 'region', 'areaName']);
  if (name) return String(name).replace(/특별시|광역시|특별자치도|특별자치시|도$/g, '').trim() || name;
  const code = pick(row, ['areacode', 'areaCode', '지역코드']);
  if (code && AREA[String(code)]) return AREA[String(code)];
  const addr = pick(row, ['addr1', '주소', 'address']);
  if (addr) {
    const head = String(addr).split(/\s+/)[0].replace(/특별시|광역시|특별자치도|특별자치시|도$/g, '');
    return head || '기타';
  }
  return '기타';
}

// 여러 후보 키 중 먼저 값이 있는 것을 반환
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
  }
  return '';
}

function toSpot(row, i) {
  const lat = parseFloat(pick(row, ['mapy', 'lat', '위도', 'y', 'latitude']));
  const lng = parseFloat(pick(row, ['mapx', 'lng', '경도', 'x', 'longitude']));
  return {
    id: String(pick(row, ['contentid', 'contentId', 'id', '콘텐츠ID']) || ('c' + i)),
    name: String(pick(row, ['title', '제목', '명칭', '콘텐츠명', 'name', '관광지명'])).trim(),
    region: normRegion(row),
    category: normCategory(row),
    lat: isFinite(lat) ? lat : null,
    lng: isFinite(lng) ? lng : null,
    stay: 90,
    fee: String(pick(row, ['fee', '이용요금', '요금']) || '정보 없음'),
    hours: String(pick(row, ['usetime', '이용시간', '운영시간', 'hours']) || '상시'),
    desc: String(pick(row, ['overview', '개요', '설명', 'desc', 'summary']) || '').replace(/<[^>]+>/g, '').slice(0, 140),
    image: String(pick(row, ['firstimage', 'firstImage', '이미지', '이미지URL', 'image', 'imgUrl']) || '')
  };
}

/* ----- CSV 파서 (따옴표/콤마/BOM 처리) ----- */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(v => v.trim() !== '')).map(r => {
    const o = {};
    header.forEach((h, i) => o[h] = (r[i] || '').trim());
    return o;
  });
}

function loadRows(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  if (file.endsWith('.json')) {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    if (data.items && Array.isArray(data.items)) return data.items;
    // TourAPI 표준 응답: response.body.items.item
    const item = data?.response?.body?.items?.item;
    if (Array.isArray(item)) return item;
    if (item) return [item];
    return [];
  }
  return parseCsv(raw);
}

function main() {
  let input = process.argv[2];
  if (!input) {
    for (const f of ['raw.csv', 'raw.json']) {
      if (fs.existsSync(path.join(DATA, f))) { input = path.join(DATA, f); break; }
    }
  }
  if (!input || !fs.existsSync(input)) {
    console.error('입력 파일을 찾을 수 없습니다. 통합검색 다운로드 파일을 data/raw.csv (또는 raw.json)로 저장하세요.');
    process.exit(1);
  }

  const rows = loadRows(input);
  const spots = rows.map(toSpot)
    .filter(s => s.name && s.lat != null && s.lng != null); // 좌표 없는 항목 제외 (지도/동선 계산 필요)

  fs.writeFileSync(path.join(DATA, 'spots.json'), JSON.stringify(spots, null, 2), 'utf-8');
  console.log(`변환 완료: ${rows.length}건 입력 → ${spots.length}건 저장 (data/spots.json)`);

  const byRegion = {};
  spots.forEach(s => byRegion[s.region] = (byRegion[s.region] || 0) + 1);
  console.log('지역 분포:', byRegion);
}

main();
