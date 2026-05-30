(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NN = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function createLayer(inN, outN, act) {
    const scale = Math.sqrt(2 / (inN + outN));
    const W = [];
    for (let o = 0; o < outN; o++) {
      const row = [];
      for (let i = 0; i < inN; i++) row.push(randn() * scale);
      W.push(row);
    }
    return { inN, outN, act, W, b: new Array(outN).fill(0) };
  }

  function create(sizes, acts) {
    const layers = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      layers.push(createLayer(sizes[l], sizes[l + 1], acts[l]));
    }
    return { layers };
  }

  function activate(act, x) {
    if (act === 'tanh') return Math.tanh(x);
    if (act === 'sigmoid') return 1 / (1 + Math.exp(-x));
    if (act === 'relu') return x > 0 ? x : 0;
    return x;
  }

  function deriv(act, y) {
    if (act === 'tanh') return 1 - y * y;
    if (act === 'sigmoid') return y * (1 - y);
    if (act === 'relu') return y > 0 ? 1 : 0;
    return 1;
  }

  function forward(net, input) {
    const acts = [input];
    let cur = input;
    for (const L of net.layers) {
      const a = new Array(L.outN);
      for (let o = 0; o < L.outN; o++) {
        let s = L.b[o];
        const row = L.W[o];
        for (let i = 0; i < L.inN; i++) s += row[i] * cur[i];
        a[o] = activate(L.act, s);
      }
      acts.push(a);
      cur = a;
    }
    return acts;
  }

  function predict(net, input) {
    const acts = forward(net, input);
    return acts[acts.length - 1];
  }

  function trainStep(net, input, target, lr) {
    const acts = forward(net, input);
    const out = acts[acts.length - 1];
    const L = net.layers;
    const deltas = new Array(L.length);

    const last = L[L.length - 1];
    const dOut = new Array(last.outN);
    let loss = 0;
    for (let o = 0; o < last.outN; o++) {
      const err = out[o] - target[o];
      loss += err * err;
      dOut[o] = err * deriv(last.act, out[o]);
    }
    deltas[L.length - 1] = dOut;

    for (let l = L.length - 2; l >= 0; l--) {
      const cur = L[l], next = L[l + 1], dNext = deltas[l + 1];
      const aCur = acts[l + 1];
      const d = new Array(cur.outN);
      for (let j = 0; j < cur.outN; j++) {
        let s = 0;
        for (let k = 0; k < next.outN; k++) s += next.W[k][j] * dNext[k];
        d[j] = s * deriv(cur.act, aCur[j]);
      }
      deltas[l] = d;
    }

    for (let l = 0; l < L.length; l++) {
      const layer = L[l], inp = acts[l], d = deltas[l];
      for (let o = 0; o < layer.outN; o++) {
        const g = d[o];
        layer.b[o] -= lr * g;
        const row = layer.W[o];
        for (let i = 0; i < layer.inN; i++) row[i] -= lr * g * inp[i];
      }
    }
    return loss / last.outN;
  }

  return { create, forward, predict, trainStep, randn };
});
