let MODEL = null;

async function loadModel() {
  MODEL = await fetch('/model.json').then(r => r.json());
  return MODEL;
}

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
