// 동선·시간표 계산. 어떤 관광지를 넣을지는 모델이 점수로 정하고,
// 여기서는 선택된 관광지의 방문 순서(최근접)와 일자별 시간표를 만든다.

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function travelMinutes(a, b) {
  // 서울 도심 이동 추정 — 평균 시속 18km(대중교통/도보 혼합), 최소 15분
  return Math.max(15, Math.round(distanceKm(a, b) / 18 * 60));
}

function toTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function orderByNearest(list) {
  if (list.length <= 2) return list.slice();
  const remaining = list.slice();
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = distanceKm(last, s);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

const PACE = { '느긋하게': 3, '보통': 4, '알차게': 5 };

// 모델이 점수순으로 선별한 spots(상위 N개)를 일자별 코스로 편성
function schedule(selected, days, perDay) {
  // 하루 안에서는 동선이 자연스럽도록 최근접으로 재정렬
  const days_ = [];
  for (let d = 0; d < days; d++) {
    const chunk = orderByNearest(selected.slice(d * perDay, (d + 1) * perDay));
    if (!chunk.length) break;

    let clock = 9 * 60;
    const stops = chunk.map((spot, i) => {
      if (i > 0) clock += travelMinutes(chunk[i - 1], spot);
      const arrive = clock;
      clock += spot.stay || 60;
      return { ...spot, order: i + 1, arrive: toTime(arrive), leave: toTime(clock) };
    });
    days_.push({ day: d + 1, stops });
  }
  return { days: days_, total: days_.reduce((n, d) => n + d.stops.length, 0) };
}

window.RouteEngine = { schedule, distanceKm, PACE };
