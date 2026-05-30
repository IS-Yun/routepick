function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function travelMinutes(a, b) {
  const roadKm = distanceKm(a, b) * 1.35;
  return Math.max(12, Math.round(roadKm / 18 * 60) + 7);
}

function toTime(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function orderByNearest(list) {
  if (list.length <= 2) return list.slice();
  const rem = list.slice(), ord = [rem.shift()];
  while (rem.length) {
    const last = ord[ord.length - 1];
    let bi = 0, bd = Infinity;
    rem.forEach((s, i) => { const d = distanceKm(last, s); if (d < bd) { bd = d; bi = i; } });
    ord.push(rem.splice(bi, 1)[0]);
  }
  return ord;
}

const PACE = { '느긋하게': 3, '보통': 4, '알차게': 5 };

function mealLabel(min) {
  if (min < 10 * 60 + 30) return '아침';
  if (min < 15 * 60) return '점심';
  if (min < 17 * 60) return '식사';
  if (min < 21 * 60) return '저녁';
  return '식사';
}

const MEAL_TIMES = [12 * 60 + 30, 18 * 60];
const MIN_MEAL_GAP = 180;

function nearestIdx(list, ref) {
  let bi = 0, bd = Infinity;
  list.forEach((s, i) => { const d = distanceKm(ref, s); if (d < bd) { bd = d; bi = i; } });
  return bi;
}

function scheduleDay(daySpots, dayNum, district) {
  const sights = orderByNearest(daySpots.filter(s => s.category !== '맛집'));
  let foods = daySpots.filter(s => s.category === '맛집');

  const stops = [];
  let clock = 9 * 60;
  let lastMealStart = -999;

  const add = (spot, isMeal) => {
    if (stops.length) clock += travelMinutes(stops[stops.length - 1], spot);
    if (isMeal && clock < lastMealStart + MIN_MEAL_GAP) clock = lastMealStart + MIN_MEAL_GAP;
    const arrive = clock;
    clock += spot.stay || 60;
    if (isMeal) lastMealStart = arrive;
    stops.push({ ...spot, arrive: toTime(arrive), leave: toTime(clock), meal: isMeal ? mealLabel(arrive) : null });
  };
  const last = () => stops[stops.length - 1] || sights[0] || foods[0];

  if (!sights.length) {
    if (foods.length) clock = Math.max(clock, 12 * 60);
    foods.forEach(f => add(f, true));
  } else {
    foods = foods.slice(0, 2);
    let mi = 0;
    for (const sight of sights) {
      while (mi < foods.length && mi < MEAL_TIMES.length && clock >= MEAL_TIMES[mi] && clock >= 11 * 60) {
        add(foods.splice(nearestIdx(foods, last()), 1)[0], true); mi++;
      }
      add(sight, false);
    }
    while (foods.length) add(foods.splice(nearestIdx(foods, last()), 1)[0], true);
  }

  stops.forEach((s, i) => s.order = i + 1);
  return { day: dayNum, district, stops };
}

window.RouteEngine = { scheduleDay, distanceKm, orderByNearest, PACE };
