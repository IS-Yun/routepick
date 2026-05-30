const fs = require('fs');
const path = require('path');
const NN = require('../public/js/nn.js');
const Features = require('../public/js/features.js');

const CATS = Features.CATS;
const STYLES = Object.keys(Features.PACE);

function targetScore(spot, user) {
  const pace = Features.PACE[user.style];
  const stay = Math.min(spot.stay / 240, 1);
  const pop = spot.pop;
  const match = user.categories.includes(spot.category);

  let s = 0.10;
  if (match) s += 0.42;
  s += pop * 0.28;
  s += (1 - stay) * 0.18 * pace;
  s += stay * 0.18 * (1 - pace);
  if (spot.category === '자연/생태' && pace < 0.34) s += 0.10;
  if (spot.category === '도시/체험') s += 0.04;
  if (spot.category === '맛집' && !match) s += 0.05;
  s += NN.randn() * 0.05;
  return Math.max(0, Math.min(1, s));
}

function randomUser() {
  const n = 1 + Math.floor(Math.random() * 3);
  const shuffled = [...CATS].sort(() => Math.random() - 0.5);
  return {
    categories: shuffled.slice(0, n),
    style: STYLES[Math.floor(Math.random() * STYLES.length)]
  };
}

function randomSpot() {
  return {
    category: CATS[Math.floor(Math.random() * CATS.length)],
    stay: 30 + Math.floor(Math.random() * 211),
    pop: Math.random()
  };
}

function buildDataset(n) {
  const data = [];
  for (let i = 0; i < n; i++) {
    const user = randomUser();
    const spot = randomSpot();
    data.push({ x: Features.vector(spot, user), y: [targetScore(spot, user)] });
  }
  return data;
}

function meanLoss(net, data) {
  let s = 0;
  for (const d of data) {
    const out = NN.predict(net, d.x);
    s += (out[0] - d.y[0]) ** 2;
  }
  return s / data.length;
}

function main() {
  const train = buildDataset(6000);
  const val = buildDataset(1500);

  const net = NN.create([Features.INPUT_SIZE, 12, 8, 1], ['tanh', 'tanh', 'sigmoid']);

  const epochs = 240;
  let lr = 0.08;
  for (let e = 0; e < epochs; e++) {
    for (let i = train.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [train[i], train[j]] = [train[j], train[i]];
    }
    for (const d of train) NN.trainStep(net, d.x, d.y, lr);
    if (e > 160) lr = 0.04;
  }

  const out = {
    layers: net.layers,
    cats: CATS,
    trainedAt: new Date().toISOString(),
    samples: train.length,
    finalValLoss: Number(meanLoss(net, val).toFixed(4))
  };
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'model.json'), JSON.stringify(out));
}

main();
