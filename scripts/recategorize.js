const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LAB = process.argv[2] || path.join(ROOT, '..', 'lab_data');
const CITY = 'seoul';

function decode(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
const colToIdx = c => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function parseSheet(xml) {
  const rows = [];
  let rm; const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  while ((rm = rowRe.exec(xml))) {
    const cells = []; let cm; const cellRe = /<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g;
    while ((cm = cellRe.exec(rm[1]))) {
      const idx = colToIdx(cm[1]); let t = '';
      if (cm[2]) { const m = cm[2].match(/<t[^>]*>([\s\S]*?)<\/t>/); if (m) t = decode(m[1]); }
      cells[idx] = t.trim();
    }
    rows.push(cells);
  }
  if (!rows.length) return [];
  const header = rows[0].map(h => (h || '').trim());
  return rows.slice(1).map(r => { const o = {}; header.forEach((h, i) => { if (h) o[h] = r[i] || ''; }); return o; });
}

function sheetMap(dir) {
  const wb = fs.readFileSync(path.join(dir, 'xl', 'workbook.xml'), 'utf8');
  const rels = fs.readFileSync(path.join(dir, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
  const relMap = {};
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = m[0].match(/name="([^"]+)"/), rid = m[0].match(/r:id="([^"]+)"/);
    if (!name || !rid || !relMap[rid[1]]) continue;
    out.push({ name: decode(name[1]), file: path.join(dir, 'xl', relMap[rid[1]].replace(/^\/?(xl\/)?/, '')) });
  }
  return out;
}

function foodNames(xlsx) {
  const tmp = path.join(os.tmpdir(), 'rc_' + Math.random().toString(36).slice(2));
  const zip = tmp + '.zip'; fs.copyFileSync(xlsx, zip);
  execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force"`, { stdio: 'ignore' });
  fs.rmSync(zip, { force: true });
  const set = new Set();
  for (const sh of sheetMap(tmp)) {
    if (sh.name !== '음식점') continue;
    for (const r of parseSheet(fs.readFileSync(sh.file, 'utf8'))) {
      const nm = r['명칭'] || r[Object.keys(r).find(k => /^명칭/.test(k))];
      if (nm) set.add(nm.trim());
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return set;
}

const isFoodName = n => /음식|맛집|먹거리|미식|푸드/.test(n);

function main() {
  const dataDir = path.join(ROOT, 'public', 'data', CITY);
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith('.json')) continue;
    const district = f.replace(/\.json$/, '');
    const xlsx = path.join(LAB, district + '.xlsx');
    if (!fs.existsSync(xlsx)) continue;
    const food = foodNames(xlsx);
    const arr = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    for (const s of arr) {
      if (s.category !== '맛집/쇼핑') continue;
      if (food.has(s.name) || isFoodName(s.name)) { s.category = '맛집'; s.stay = 75; }
      else { s.category = '쇼핑'; s.stay = 45; }
    }
    fs.writeFileSync(path.join(dataDir, f), JSON.stringify(arr));
  }
}

main();
