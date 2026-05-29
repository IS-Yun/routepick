// 학습된 모델(model.json)을 불러와 관광지 적합도를 추론한다.
let MODEL = null;

async function loadModel() {
  MODEL = await fetch('/model.json').then(r => r.json());
  return MODEL;
}

// 사용자 조건에 맞춰 각 관광지의 적합도 점수를 매겨 정렬해 반환
function scoreSpots(spots, user) {
  if (!MODEL) throw new Error('모델이 로드되지 않았습니다.');
  const net = { layers: MODEL.layers };
  return spots
    .map(s => {
      const out = NN.predict(net, Features.vector(s, user));
      return { ...s, score: out[0] };
    })
    .sort((a, b) => b.score - a.score);
}

window.RouteModel = { loadModel, scoreSpots, info: () => MODEL };
