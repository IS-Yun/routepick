const fs = require('fs');
const path = require('path');
const { popOf } = require('./popularity.js');

const DATA = path.join(__dirname, '..', 'public', 'data');

function main() {
  const cities = fs.readdirSync(DATA).filter(d => fs.statSync(path.join(DATA, d)).isDirectory());
  for (const city of cities) {
    const dir = path.join(DATA, city);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const p = path.join(dir, f);
      const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
      arr.forEach(s => { s.pop = popOf(s); });
      fs.writeFileSync(p, JSON.stringify(arr));
    }
  }
}

main();
