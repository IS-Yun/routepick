// (관광지, 사용자 조건) → 모델 입력 벡터로 변환. Node·브라우저 공용.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Features = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const CATS = ['자연/생태', '문화/역사', '도시/체험', '맛집/쇼핑'];
  const PACE = { '느긋하게': 0, '보통': 0.5, '알차게': 1 };

  // 입력 10차원:
  //  [0-3] 관광지 카테고리 one-hot
  //  [4-7] 사용자 선호 테마 multi-hot
  //  [8]   여행 스타일(pace) 0~1
  //  [9]   체류시간 정규화 0~1
  function vector(spot, user) {
    const cat = CATS.map(c => (spot.category === c ? 1 : 0));
    const pref = CATS.map(c => (user.categories && user.categories.includes(c) ? 1 : 0));
    const pace = PACE[user.style] != null ? PACE[user.style] : 0.5;
    const stay = Math.min((spot.stay || 90) / 240, 1);
    return [...cat, ...pref, pace, stay];
  }

  return { CATS, PACE, vector, INPUT_SIZE: 10 };
});
