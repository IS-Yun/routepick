# 루트픽 AI (RoutePick AI)

한국관광콘텐츠랩의 관광정보(텍스트·이미지·위치)를 활용해, **직접 학습시킨 신경망 모델**이
사용자 취향에 맞는 여행 루트를 설계해 주는 웹 서비스입니다.
브라우저에서 모바일 바로가기 추가하면 앱처럼 사용 가능합니다

> 현재 **서울 25개 구** 제공, 전국으로 확대 예정입니다.

## 기능

- **테마별 콘텐츠 큐레이션** — 자연/문화/도시/맛집 4테마, 전체 보기
- **AI 맞춤 루트 추천** — 학습된 신경망이 관광지 적합도를 추론 → 동선·시간표 설계
- **루트 시뮬레이션** — 일차별 지도(마커 순번)·타임라인·관광지 상세(전화·관광정보 링크)

## AI 모델 (직접 구현·학습)

외부 API가 아니라 **순수 JavaScript로 다층 퍼셉트론(MLP)을 처음부터 구현·학습**했습니다.

- 구조: 입력 10차원 → 은닉 12·8(tanh) → 적합도(sigmoid). forward·역전파·SGD를 `public/js/nn.js`에 직접 구현
- 학습: `scripts/train.js` → `public/model.json` 저장 (재학습: `node scripts/train.js`)
- 추론: 브라우저에서 `public/js/model.js`가 관광지를 점수화 → 상위 선별 → `route.js`가 동선·시간표

## 데이터 (콘텐츠랩 다운로드) — 지역 계층 구조

콘텐츠랩에서 받은 지역별 `{구}.xlsx` + `{구}_image/` 묶음을 한 폴더(`lab_data`)에 두고 빌드합니다.

```bash
node scripts/build-data.js "C:/.../lab_data"
```

산출물(전부 정적):

```
public/data/regions.json      지역 트리(시/도 → 구)
public/data/seoul/{구}.json    구별 관광지
public/images/seoul/{구}/...   구별 이미지(매칭 복사)
```

의존성 없이 xlsx를 풀어 **시트를 동적으로 파싱**(구마다 시트 구성이 다름)하고, 시트·키워드로 테마 분류,
같은 몰/백화점 매장은 대표 1곳으로 통합, 명칭으로 이미지를 매칭, 한국 범위 밖 좌표는 자동 제외합니다.

**전국 확장:** `lab_data`에 다른 시/도 데이터를 넣고 `build-data.js`의 `CITIES`에 `{name, code, dir}`만 추가하면
프론트(지역 선택·온디맨드 로딩)는 그대로 동작합니다.

## 실행 (로컬)

```bash
node server.js   # http://localhost:3000
```

별도 설치 없이 Node.js만 있으면 됩니다. 지도는 Leaflet + OpenStreetMap(키 불필요).

## 배포 (Vercel)

이 앱은 **순수 정적 사이트**입니다(루트 설계·AI 추론이 모두 브라우저에서 동작). `public/`만 서빙하면 됩니다.
`vercel.json`에 `outputDirectory: public`이 지정돼 있습니다.

**방법 1 — Vercel CLI (가장 간단, GitHub 불필요)**

```bash
npm i -g vercel
cd routepick
vercel          # 미리보기 배포
vercel --prod   # 프로덕션 배포
```

**방법 2 — GitHub 연동**

1. `routepick` 폴더를 깃 저장소로 push
2. Vercel에서 Import → (저장소 루트가 상위 폴더면) Root Directory = `routepick`
3. Framework Preset = Other, Build Command 비움, Output Directory = `public`

> `server.js`·`scripts/`·`data/`는 배포에 불필요(Vercel은 `public/`만 서빙). 로컬 개발용입니다.
> 원본 `은평구.xlsx`·`image/`는 상위 폴더에 있고 배포에 포함되지 않습니다(이미 `public/`로 적재 완료).

## 폴더 구조

```
routepick/
├─ vercel.json            outputDirectory: public
├─ server.js              로컬 개발용 정적 서버
├─ scripts/
│  ├─ train.js            모델 학습 → public/model.json
│  └─ build-data.js       lab_data(지역별 xlsx+이미지) → public/data + public/images
└─ public/                ← Vercel이 서빙하는 정적 루트
   ├─ index.html
   ├─ model.json          학습된 모델 가중치(지역 무관, 재학습 불필요)
   ├─ data/
   │  ├─ regions.json     지역 트리
   │  └─ seoul/{구}.json   구별 관광정보
   ├─ images/seoul/{구}/   구별 실제 사진
   ├─ css/style.css
   └─ js/  (nn.js · features.js · model.js · route.js · app.js)
```

## 출처

한국관광공사 한국관광콘텐츠랩 관광정보 (Korea Tourism Organization). 콘텐츠 활용 시 출처를 표기합니다.
