// 루트픽 추천 모델 학습.
//   node scripts/train.js
// (관광지, 사용자) 조합의 적합도를 학습한 뒤 가중치를 public/model.json에 저장한다.

const fs = require('fs');
const path = require('path');
const NN = require('../public/js/nn.js');
const Features = require('../public/js/features.js');

const CATS = Features.CATS;
const STYLES = Object.keys(Features.PACE);

// 학습 목표값: 사람이 느낄 법한 적합도를 비선형 상호작용으로 정의(+노이즈).
// 모델은 이 규칙을 데이터에서 스스로 학습한다.
function targetScore(spot, user) {
  const pace = Features.PACE[user.style];
  const stay = Math.min(spot.stay / 240, 1);
  const match = user.categories.includes(spot.category);

  let s = 0.18;
  if (match) s += 0.45;                          // 선호 테마 일치
  s += (1 - stay) * 0.25 * pace;                 // 알차게: 짧은 체류 선호
  s += stay * 0.25 * (1 - pace);                 // 느긋: 긴 체류 선호
  if (spot.category === '자연/생태' && pace < 0.34) s += 0.12;  // 느긋+자연 보너스
  if (spot.category === '도시/체험') s += 0.05;
  if (spot.category === '맛집/쇼핑' && !match) s += 0.08;       // 맛집은 비선호여도 약간 매력
  s += NN.randn() * 0.05;                        // 노이즈
  return Math.max(0, Math.min(1, s));
}

function randomUser() {
  const n = 1 + Math.floor(Math.random() * 3); // 1~3개 테마 선호
  const shuffled = [...CATS].sort(() => Math.random() - 0.5);
  return {
    categories: shuffled.slice(0, n),
    style: STYLES[Math.floor(Math.random() * STYLES.length)]
  };
}

function randomSpot() {
  return {
    category: CATS[Math.floor(Math.random() * CATS.length)],
    stay: 30 + Math.floor(Math.random() * 211) // 30~240분
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
    // 에폭마다 셔플
    for (let i = train.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [train[i], train[j]] = [train[j], train[i]];
    }
    for (const d of train) NN.trainStep(net, d.x, d.y, lr);
    if (e > 160) lr = 0.04;           // 후반 학습률 감소
    if (e % 40 === 0 || e === epochs - 1) {
      console.log(`epoch ${String(e).padStart(3)} | train ${meanLoss(net, train).toFixed(4)} | val ${meanLoss(net, val).toFixed(4)}`);
    }
  }

  // 간단한 정성 점검
  const lover = { categories: ['자연/생태'], style: '느긋하게' };
  const nature = { category: '자연/생태', stay: 120 };
  const market = { category: '맛집/쇼핑', stay: 60 };
  console.log('점검 - 자연애호가(느긋) → 자연:', NN.predict(net, Features.vector(nature, lover))[0].toFixed(3),
              '| 시장:', NN.predict(net, Features.vector(market, lover))[0].toFixed(3));

  const out = {
    layers: net.layers,
    cats: CATS,
    trainedAt: new Date().toISOString(),
    samples: train.length,
    finalValLoss: Number(meanLoss(net, val).toFixed(4))
  };
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'model.json'), JSON.stringify(out));
  console.log('저장 완료: public/model.json (val loss', out.finalValLoss + ')');
}

main();
