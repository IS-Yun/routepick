(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Features = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const CATS = ['자연/생태', '문화/역사', '도시/체험', '맛집', '쇼핑'];
  const PACE = { '느긋하게': 0, '보통': 0.5, '알차게': 1 };

  function vector(spot, user) {
    const cat = CATS.map(c => (spot.category === c ? 1 : 0));
    const pref = CATS.map(c => (user.categories && user.categories.includes(c) ? 1 : 0));
    const pace = PACE[user.style] != null ? PACE[user.style] : 0.5;
    const stay = Math.min((spot.stay || 90) / 240, 1);
    const pop = spot.pop != null ? spot.pop : 0.5;
    return [...cat, ...pref, pace, stay, pop];
  }

  return { CATS, PACE, vector, INPUT_SIZE: 13 };
});
