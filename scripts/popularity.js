(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Popularity = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function popOf(s) {
    const descLen = (s.desc || '').length;
    let p = 0.12;
    p += Math.min(descLen / 300, 1) * 0.45;
    if (s.image) p += 0.18;
    if (s.home) p += 0.12;
    if (s.tel) p += 0.07;
    if (s.hours && !/상시|정보\s*없음|^-$/.test(s.hours)) p += 0.04;
    if (s.fee && !/정보\s*없음|^-$/.test(s.fee)) p += 0.02;
    return Math.round(Math.min(1, p) * 100) / 100;
  }

  return { popOf };
});
