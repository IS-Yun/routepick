const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const SHARE_FILE = path.join(DATA, 'shares.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

// 카테고리별 색상 (썸네일 생성용)
const CAT_COLOR = {
  '자연/생태': ['#2bae8e', '#1f8d72'],
  '문화/역사': ['#c98a3a', '#a86d22'],
  '도시/체험': ['#2a7de1', '#1f63b8'],
  '맛집/쇼핑': ['#e8743b', '#c95a26']
};

let spots = [];
try {
  spots = JSON.parse(fs.readFileSync(path.join(DATA, 'spots.json'), 'utf-8'));
} catch (e) {
  console.error('spots.json 로드 실패:', e.message);
}

function readShares() {
  try {
    return JSON.parse(fs.readFileSync(SHARE_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeShares(list) {
  fs.writeFileSync(SHARE_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': MIME['.json'] });
  res.end(body);
}

// 관광지 썸네일 SVG 생성 — TourAPI 연동 시 실제 사진(firstimage)으로 교체 가능
function placeholderSvg(spot) {
  const [c1, c2] = CAT_COLOR[spot.category] || ['#888', '#555'];
  const name = (spot.name || '').replace(/&/g, '&amp;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="400" height="260" fill="url(#g)"/>
  <text x="24" y="210" fill="#ffffff" font-size="26" font-weight="700" font-family="Malgun Gothic, sans-serif">${name}</text>
  <text x="24" y="240" fill="#ffffff" opacity="0.85" font-size="15" font-family="Malgun Gothic, sans-serif">${spot.region} · ${spot.category}</text>
</svg>`;
}

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400); res.end('Bad Request'); return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));

  if (!filePath.startsWith(ROOT)) { // 디렉터리 이탈 방지
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // 관광지 목록
  if (req.method === 'GET' && url === '/api/spots') {
    return sendJson(res, 200, spots);
  }

  // 썸네일 이미지
  if (req.method === 'GET' && url.startsWith('/img/')) {
    const id = url.slice(5).replace('.svg', '');
    const spot = spots.find(s => s.id === id);
    if (!spot) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'max-age=86400' });
    return res.end(placeholderSvg(spot));
  }

  // 루트 공유 저장 (활용사례 등록)
  if (req.method === 'POST' && url === '/api/share') {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 1e6) req.destroy(); // 과대 요청 차단
    });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch (e) {
        return sendJson(res, 400, { ok: false, message: '잘못된 요청입니다.' });
      }
      if (!data.title || !Array.isArray(data.route) || !data.route.length) {
        return sendJson(res, 400, { ok: false, message: '제목과 루트 정보가 필요합니다.' });
      }
      const list = readShares();
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const record = {
        id,
        title: String(data.title).slice(0, 80),
        author: String(data.author || '익명').slice(0, 20),
        region: data.region || '',
        days: data.days || 1,
        route: data.route,
        createdAt: new Date().toISOString()
      };
      list.unshift(record);
      writeShares(list);
      sendJson(res, 200, { ok: true, id });
    });
    return;
  }

  // 공유된 루트 목록
  if (req.method === 'GET' && url === '/api/shares') {
    const list = readShares().map(({ route, ...meta }) => ({ ...meta, count: route.length }));
    return sendJson(res, 200, list);
  }

  // 공유된 루트 단건
  if (req.method === 'GET' && url.startsWith('/api/share/')) {
    const id = url.slice('/api/share/'.length);
    const found = readShares().find(r => r.id === id);
    if (!found) return sendJson(res, 404, { ok: false, message: '루트를 찾을 수 없습니다.' });
    return sendJson(res, 200, found);
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`루트픽 AI 서버 실행 중 → http://localhost:${PORT}`);
});
