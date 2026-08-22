# 레슨 스토리(Lesson Story) — 기록을 "예쁜 일기"로 보여주는 UI 기획

> 레슨 동반으로 받아 적은 필기와 요약, 촬영/편집한 영상과 사진을
> **아카이브가 아니라 한 편의 일기 글**로 조판해서 보여준다.

---

## 1. 배경 · 문제 정의

현재 레슨 동반 기록의 생애주기는 이렇다.

```
LiveLessonCompanion        필기(transcript) + 요약(summary) + 클립 캡처
        ↓ onFinish
NewLessonForm              recordType='LIVE_LESSON' 으로 저장
        ↓                  liveLessonDetail{transcript, summary, keyPoints, drills}
LessonDetail               ← 코치가 보는 화면
        ↓ [검토]
LessonReviewScreen         reviewSections 편집 → 승인 → sharedToStudent
        ↓
ClientApp → LessonDetail   ← 학생이 보는 화면 (코치와 동일 컴포넌트)
```

문제는 마지막 두 칸이다. 승인까지 마친 기록이 도착하는 곳이
`LessonDetail` 하나뿐인데, 이 화면은 **세로로 쌓인 독립 카드의 나열**이다.

| 현재 카드 | 소스 |
| --- | --- |
| 레슨 동반 요약본 | `aiAnalysis` |
| 레슨 내용 (필기 노트) | `liveLessonDetail.transcript` |
| 미디어 뷰어 + 썸네일 줄 | `videoUrl`, `additionalMedia` |
| Before/After 비교 | `additionalMedia[role]`, `compareVideoUrl` |
| 샷 데이터 | `golfData` |
| 코치 노트 / 과제 | `coachNotes`, `assignedHomework` |

각 카드는 제 역할을 하지만, **서로 아무 관계가 없다.** 요약문은 요약문끼리,
사진은 사진끼리 뭉쳐 있어서 "3번째 문단에서 말한 그 장면"이 어느 사진인지
독자가 직접 이어 붙여야 한다. 글과 이미지가 분리된 화면은 구조적으로
'글'이 아니라 '보관함'으로 읽힌다 — 아무리 카드를 예쁘게 만들어도 이 인상은
바뀌지 않는다.

### 진짜 고쳐야 하는 것

예쁜 일기의 조건은 장식이 아니라 **조판(composition)** 이다.

1. **하나의 흐름** — 제목 → 리드 → 본문 → 맺음. 카드 목록이 아니라 글.
2. **글 사이에 들어간 사진** — 문단과 이미지가 교차해야 "쓴 글"로 읽힌다.
3. **그날의 얼굴** — 대표컷 한 장과 한 줄 제목. 목록에서 되돌아보게 만든다.
4. **손맛** — 이미 `LessonNotebook` 이 확보한 종이/손글씨 언어를 확장한다.

따라서 이 기획의 핵심은 **새 뷰 하나를 추가하는 것이 아니라, 기존 필드를
읽어 문단과 미디어를 교차 배치하는 "조판기(composer)" 를 만드는 것**이다.

---

## 2. 목표 / 비목표

### 목표

- 승인된 레슨 기록의 **기본 화면**을 블로그/일기 형태의 `LessonStoryView` 로 바꾼다.
- 데이터 모델 변경 **없이** 기존 필드만으로 1차 렌더가 되게 한다(M1).
- 학생이 "우리 코치가 나한테 써준 글" 로 느끼게 한다 — 알림이 아니라 편지.
- 코치가 조판을 손볼 수 있게 한다(M3). 단, 손 안 대도 이미 예뻐야 한다.

### 비목표

- 레슨 동반 화면(`LiveLessonCompanion`) · 검토 화면(`LessonReviewScreen`)의
  기능 변경. 스토리는 **승인 이후의 표현 레이어**다.
- 외부 공개 블로그/SNS 발행. (M4에서 별도 검토)
- 기존 `LessonDetail` 제거. 원본 자료·편집 진입점으로 계속 남는다.

---

## 3. 컨셉 — "레슨 다이어리"

다크 이머랄드 앱 위에 **종이 한 장이 올라간다.**

이건 새 발명이 아니다. `LessonNotebook` 이 이미 레슨 동반 화면에서
`#fbf6e9` 종이 + 괘선 + `Gaegu` 손글씨로 "코치가 옆에서 받아 적는 느낌"을
만들어 놓았다. 스토리 뷰는 **그 종이를 그대로 이어받아 완성된 한 페이지로
편집한 상태**다. 필기하던 종이가 → 정리된 일기가 되는 서사가 앱 안에서
자연스럽게 이어진다.

```
┌─ bg-base (#080c0a) ─────────────────────────┐
│   ╭───────────────────────────────────╮     │
│   │                                   │     │   ← 종이 (max-w-[46rem])
│   │   [대표컷 — 풀블리드]              │     │     모바일: 좌우 12px 여백
│   │                                   │     │     데스크톱: 가운데 정렬
│   │   2026.08.19 · 3회차 · 김코치      │     │
│   │   오른팔이 몸에 붙기 시작한 날      │     │
│   │   ───────────────────────────     │     │
│   │   오늘은 드라이버 슬라이스를…       │     │
│   │                                   │     │
│   │        [사진 · 폴라로이드]         │     │
│   │        임팩트 직전, 팔꿈치가        │     │  ← 손글씨 캡션
│   │                                   │     │
│   │   본문 계속…                       │     │
│   ╰───────────────────────────────────╯     │
└─────────────────────────────────────────────┘
```

**왜 종이인가** — 일기·편지의 시각적 원형이고, 다크 UI 안에서 종이는
그 자체로 "여긴 다른 것"이라는 신호가 된다. 앱의 다른 화면과 섞이지 않는다.

---

## 4. 블록 모델

스토리는 **블록의 순열**이다. 조판기가 `Lesson` 을 읽어 블록 배열을 만들고,
뷰는 그 배열을 순서대로 그린다. 렌더러는 데이터 출처를 모른다.

```ts
type StoryBlock =
  | { kind: 'cover';     headline: string; dek?: string; mediaId?: string }
  | { kind: 'meta';      date: string; session?: number; coachName?: string }
  | { kind: 'lead';      text: string }
  | { kind: 'chips';     items: string[]; tone: 'key' | 'drill' }
  | { kind: 'paragraph'; text: string }
  | { kind: 'photo';     mediaId: string; caption?: string; size: 'inset' | 'full' }
  | { kind: 'video';     mediaId: string; caption?: string; poster?: string }
  | { kind: 'compare';   beforeId: string; afterId: string; caption?: string }
  | { kind: 'filmstrip'; items: SwingSequenceItem[] }
  | { kind: 'data';      golf: GolfData }
  | { kind: 'checklist'; items: string[]; checkable: boolean }
  | { kind: 'memo';      text: string }
  | { kind: 'notefold';  transcript: LiveLessonTranscriptEntry[]; durationSec: number }
  | { kind: 'signature'; coachName?: string; approvedAt?: number }
  | { kind: 'reply';     feedback: ClientFeedback };
```

이 분리가 주는 것:

- 조판기는 **순수 함수** → `__tests__` 로 규칙을 고정할 수 있다.
- M3의 코치 저작은 "블록 배열을 저장한다"가 전부가 된다. 렌더러는 그대로.
- 새 소스(예: 모션캡처)가 생겨도 블록 하나 추가로 끝난다.

---

## 5. 자동 조판 규칙 (M1 — 데이터 모델 변경 없음)

`services/lessonStoryComposer.ts` — `composeStory(lesson, opts): StoryBlock[]`

### 5.1 소스 우선순위

승인된 기록은 `reviewSections` 가 코치의 최종본이므로 **항상 우선**한다.
`reviewSections` 가 비어 있으면(구 기록) `liveLessonDetail` / `aiAnalysis` 로
폴백한다. 이 폴백 때문에 **과거 기록도 전부 스토리로 보인다** — 마이그레이션
불필요.

| 블록 | 1순위 | 폴백 |
| --- | --- | --- |
| `lead` | `reviewSections.todayCovered` | `liveLessonDetail.summary` 첫 문단 |
| `paragraph[]` | `reviewSections.feedback` 문단 분할 | `aiAnalysis` → `coachNotes` |
| `chips` | `liveLessonDetail.keyPoints` (tone=key) | — |
| `checklist` | `reviewSections.nextActions` | `assignedHomework` → `liveLessonDetail.drills` |
| `memo` | `reviewSections.freeMemo` | — |
| `notefold` | `liveLessonDetail.transcript` | — |

### 5.2 미디어 배치 — 이 기획의 심장

카드 나열을 글로 바꾸는 지점이다.

1. **대표컷 없음** — 표지는 글자만이다(§12.7). 모든 자료가 본문으로 내려간다.
2. **본문 미디어 풀** = `reviewSections.attachmentIds` 에 포함된 미디어에서
   Before/After 쌍을 제외한 것. (검토 화면에서 코치가 이미 "이건
   붙일 것"이라 골라둔 목록이므로 새 UI 없이 의도를 재사용한다.)
3. **시각 기준 삽입**(§12.7) — 자료가 찍힌 시각을 레슨 길이로 나눈 비율을
   그대로 문단 위치에 대응시킨다. 레슨 20분쯤(1/3 지점)에 찍은 사진은 글의
   1/3 지점으로 간다.
   - 연속 두 자료 사이에는 최소 문단 1개를 보장한다(사진이 붙어 나오면
     다시 갤러리처럼 보인다). 몰아 찍은 자료는 앞으로 당겨 흩는다.
   - 자리를 못 얻은 자료는 하단 갤러리 그리드로 몰아준다.
   - 시각을 모르면 균등 배치(`(i+1)/(M+1)`)로 떨어진다 — 예전 동작.
4. **크기 교대** — 삽입되는 미디어는 `full` / `inset` 을 번갈아 쓴다.
   같은 크기가 반복되면 리듬이 죽는다.

### 5.3 고정 꼬리 순서

본문 뒤는 순서를 고정한다 (있는 것만 렌더):

```
compare → filmstrip → data → checklist → memo → notefold → signature → reply
```

`data`(샷 데이터)는 일기 톤을 해치므로 **가로 스크롤 숫자 스트립**으로 축소한다.
차트가 필요하면 "자료 보기"(기존 `LessonDetail`)로 보낸다.

`notefold`(그날의 필기 원문)는 **기본 접힘**. `"그날의 필기 12분 · 84줄 펼쳐보기"`.
스토리는 정리된 글이고, 원문은 근거다 — 근거는 요구할 때만 나온다.

---

## 6. 블록별 시각 스펙

공통: 종이 `--paper: #fbf6e9`, 잉크 `--paper-ink: #2b3547`,
연필 `--paper-pencil: #8a8272`, 괘선 `--paper-rule: #dfd4b8`,
마진선 `--paper-margin: #e8a9a0` — 전부 `LessonNotebook` 상수를 `index.css` 로
승격해 재사용한다(중복 정의 금지).

### cover
- 미디어 16:9 풀블리드, 하단 40% 그라디언트 오버레이.
- `headline` — Noto Sans KR 700, `text-display-sm`(30/36), `tracking-tight`.
  손글씨 아님. 제목은 읽혀야 한다.
- 미디어가 없으면 종이 질감 + 큰 날짜만. 이것도 충분히 예쁘다.

### meta
- 대문자 트래킹 넓힌 캡션 한 줄: `2026.08.19 · 3회차 · 김코치`.
- 회차 배지는 `sessionNumber` 있을 때만.

### lead
- 본문보다 한 단계 큰 `text-lg`, `leading-loose`, 잉크 100%.
- 첫 글자 드롭캡은 **넣지 않는다** — 한글에서 드롭캡은 거의 항상 어색하다.

### paragraph
- `text-[15px]/[1.9]`, 문단 간격 `1.25rem`. 여백이 일기의 8할이다.
- 괘선 배경은 `notefold` 에만. 본문 전체에 깔면 읽기 힘들다.

### photo / video
- **폴라로이드 프레임**: 흰 테두리 12px(하단 32px), `rotate(±0.6deg)`,
  `shadow-elev-2`. 회전각은 `mediaId` 해시로 고정 — 리렌더마다 흔들리면 안 된다.
- 캡션은 하단 흰 여백 위에 `Gaegu` 손글씨, `--paper-pencil`.
- `video` 는 탭 전까지 포스터 이미지 + 재생 오버레이. 자동재생 안 함.
- **지연 로딩** — `IntersectionObserver` 진입 시에만 `videoStore.resolve()`.
  현재 `LessonDetail` 은 마운트 시 전체를 resolve 한다(2534줄 중 `additionalMediaResolutionKey` 이펙트). 스토리는 사진이 더 많이 노출되므로 필수.

### compare
- 좌우 분할 + 가운데 드래그 핸들. 라벨은 `레슨 전` / `레슨 후` 손글씨 태그.
- 기존 `SwingComparison` 을 재사용하되 종이 프레임으로 감싼다.

### checklist
- **민트 카드**(브랜드 `primary`)로 종이 위에서 유일하게 색을 쓴다.
  이 글에서 학생이 실제로 할 일은 여기뿐이므로 시각적 독점권을 준다.
- 학생 뷰에서 체크 가능(`checkable`) → 로컬 저장. 코치 뷰는 읽기 전용.

### memo
- 포스트잇: 옅은 노랑 `#fdf3c4`, `rotate(-1.2deg)`, 손글씨.

### notefold
- 접힘 상태는 종이 접힌 모서리 + 요약 한 줄. 펼치면 `LessonNotebook` 의
  괘선/손글씨 렌더를 **읽기 전용 모드**로 그대로 재사용한다
  (`animateNewLines={false}`, `writing={false}`).

### signature
- 오른쪽 정렬, `Gaegu` 700, 밑에 가는 선. `— 김코치, 8월 19일`.
- 이 한 줄이 "누가 나한테 써줬다"를 만든다. 생략 금지.

### reply
- 학생의 `clientFeedback` — 종이 아래 붙은 다른 색 쪽지.
  비어 있으면 학생 뷰에서만 `"한마디 남기기"` 입력을 띄운다.

---

## 7. AI의 역할 (M2)

`services/geminiService.ts` 에 `generateLessonStoryMeta(lesson)` 추가.
**승인 시점에 1회** 호출하고 결과를 저장한다(열 때마다 호출 금지 — 비용과
지연, 그리고 매번 제목이 바뀌는 건 일기가 아니다).

산출물:

| 필드 | 설명 | 제약 |
| --- | --- | --- |
| `headline` | 그날의 한 줄 | 18자 이내. 명사형 종결. 예: `"오른팔이 붙기 시작한 날"` |
| `dek` | 리드 아래 한 줄 | 40자 이내, 없으면 생략 |
| `captions` | `mediaId → 캡션` | 20자 이내. 사진에 **보이는 것**만. 추측 금지 |
| `coverMediaId` | 대표컷 추천 | 후보 id 목록 안에서만 선택 |

프롬프트 원칙:
- 입력은 `reviewSections`(코치 최종본) 우선. AI 초안이 아니라 **코치가 승인한
  문장**에서 뽑아야 코치 말투가 산다.
- 캡션은 과장 금지. `"완벽한 임팩트!"` 대신 `"임팩트, 팔꿈치 붙음"`.
- 실패/타임아웃 시 **조용히 폴백** — `headline = lesson.title`, 캡션 없음.
  AI가 안 돌아도 화면은 그대로 예뻐야 한다.

---

## 8. 코치 저작 (M3)

승인 전 `LessonReviewScreen` 에 `[스토리 미리보기]` 버튼을 붙인다.
미리보기 안에서:

- 헤드라인 인라인 편집
- 대표컷 교체 (첨부 중 선택)
- 캡션 인라인 편집 (손글씨 그대로 편집)
- 사진 블록 위/아래 이동 (드래그 아님 — 모바일에서 드래그는 실패한다.
  블록 롱프레스 → `↑ ↓` 버튼)

편집하면 `story.blocks` 가 저장되고, 이후 조판기는 **자동 조판을 건너뛰고
저장된 배열을 그대로 쓴다**(`story.editedByCoach === true`).

---

## 9. 코치 뷰 vs 학생 뷰

같은 `LessonStoryView` 를 `mode` prop 으로 나눈다.

| | 코치 | 학생 |
| --- | --- | --- |
| 진입 | `LessonDetail` 상단 탭 `[스토리] [자료]` | 기본이자 유일한 뷰 |
| 승인 전(`draft`) | 워터마크 `초안 · 학생에게 보이지 않음` | 접근 불가 |
| 체크리스트 | 읽기 전용 | 체크 가능 |
| 필기 원문 | 항상 | `shareOption === 'FULL'` 일 때만 |
| 편집 | 헤드라인/캡션/순서 | 없음 (한마디 남기기만) |

`shareOption === 'MEDIA_ONLY'` 이면 학생 스토리는 `cover / photo / video /
compare / filmstrip / signature` 만으로 조판된다 — 사진첩 형태의 스토리.
**빈 화면이 되지 않게** 조판기가 알아서 처리한다.

---

## 10. 공유 · 내보내기 (M4)

- **이미지 카드 내보내기** — 커버 + 헤드라인 + 키포인트 3개를 1080×1350
  카드 한 장으로 그려 저장/공유. 학생이 자발적으로 퍼뜨리는 유일한 형태다.
- **PDF** — 패키지 종료 시 회차 전체를 한 권으로. (수요 확인 후)
- 외부 공개 링크는 개인정보(학생 이름/영상) 문제가 있어 **이번 범위 밖**.
  하려면 `visibility` / `ownership` 정책(#309)과 함께 별도 설계해야 한다.

---

## 11. 반응형 · 접근성 · 성능

**반응형** — 종이 폭 `min(46rem, 100vw - 24px)`. 데스크톱에서 폭을 더 늘리지
않는다. 본문 한 줄 40~45자가 읽기 최적이고, 넓히면 글이 아니라 문서가 된다.

**접근성**
- 손글씨(`Gaegu`)는 **캡션·서명·메모·필기 원문에만**. 본문/제목/체크리스트는
  `Noto Sans KR`. 손글씨 본문은 저시력 사용자에게 읽기 불가에 가깝다.
- 종이 `#fbf6e9` × 잉크 `#2b3547` 대비 ≈ 12:1 (AAA). 연필 `#8a8272` 는 ≈ 3.4:1
  이므로 **14px 이상 + 부가 정보에만** 쓴다.
- 폴라로이드 회전은 `prefers-reduced-motion` 에서 0deg.
- 모든 미디어에 `alt` — 캡션이 있으면 캡션, 없으면 `"레슨 사진 3/7"`.
- 접히는 필기는 `<details>` 시맨틱 또는 `aria-expanded` 버튼.

**성능**
- 미디어 지연 해석(§6). 화면 밖 blob URL 은 만들지 않는다.
- `transcript` 는 접힘 상태에서 **DOM에 넣지 않는다**. 84줄 × 다수 기록이면
  목록 성능에 영향이 간다.
- `composeStory` 는 `useMemo(lesson.id, lesson.updatedAt)` 로 고정.

**i18n** — 블록 라벨은 전부 `LanguageContext`(ko/en/ja) 경유.
AI 산출물(`headline`/`captions`)은 생성 시점 언어로 저장하고 재생성하지 않는다.

---

## 12. 변경 파일 목록

### 신규
```
services/lessonStoryComposer.ts      조판기 (순수 함수)
components/LessonStoryView.tsx       렌더러 (블록 배열 → JSX)
components/story/StoryCover.tsx
components/story/StoryPhoto.tsx      폴라로이드 프레임 + 지연 로딩
components/story/StoryCompare.tsx
components/story/StoryChecklist.tsx
components/story/StoryDataStrip.tsx
components/story/StoryNoteFold.tsx
components/story/StorySignature.tsx
__tests__/lessonStoryComposer.test.ts
```

### 수정
```
types.ts                  LessonStory · StoryBlock 추가, Lesson.story?: LessonStory
index.css                 --paper-* 토큰 승격 (LessonNotebook 상수 이관)
components/LessonNotebook.tsx   상수를 CSS 변수 참조로, 읽기 전용 모드 지원
components/LessonDetail.tsx     상단 [스토리]/[자료] 탭, 스토리를 기본 탭으로
components/LessonReviewScreen.tsx  [스토리 미리보기] 버튼 (M3)
services/geminiService.ts       generateLessonStoryMeta() (M2)
docs/DESIGN_SYSTEM.md           §7 페이퍼 테마 추가
```

### 타입 추가안

```ts
export interface LessonStory {
  /** AI 또는 코치가 정한 그날의 한 줄. 없으면 lesson.title 로 폴백. */
  headline?: string;
  /** 리드 아래 한 줄 요약. */
  dek?: string;
  /** 대표컷 — additionalMedia.id. 없으면 조판기가 §5.2 규칙으로 고른다. */
  coverMediaId?: string;
  /** mediaId → 손글씨 캡션. */
  captions?: Record<string, string>;
  /** 코치가 직접 짠 블록 순서. 있으면 자동 조판을 건너뛴다. */
  blocks?: StoryBlock[];
  /** true 면 재생성해도 blocks 를 덮어쓰지 않는다. */
  editedByCoach?: boolean;
  generatedAt?: number;
}
```

`Lesson.story` 는 **전부 optional** 이고, 없으면 조판기가 기존 필드만으로
동작한다 — 이것이 M1을 마이그레이션 없이 배포할 수 있게 하는 설계다.

---

## 12.5 M1 구현 결과 — 기획과 달라진 것

M1 을 구현하면서 위 기획과 다르게 간 지점들. 왜 바꿨는지 남긴다.

**파일 분할** — 블록 컴포넌트를 8개 파일로 쪼개려 했으나 3개로 묶었다.
`components/story/StoryMedia.tsx`(폴라로이드·비교·갤러리·필름스트립),
`StoryBlocks.tsx`(표지·리드·문단·칩·데이터·할일·메모·서명·답장),
`StoryNoteFold.tsx`. 미디어 블록들이 폴라로이드 프레임과 탭-투-플레이라는
같은 두 장치를 공유해서 한 파일에 두는 편이 읽기 쉬웠다.

**`meta` 블록을 `cover` 에 합쳤다** — 날짜·회차·코치명은 시각적으로 표지
안에 놓인다. 별도 블록으로 두면 렌더러가 "meta 는 cover 바로 뒤에 온다"를
다시 가정해야 한다.

**표지 영상이 재생된다** — 기획에서는 "표지에서는 재생시키지 않는다"고
했으나, 조판기가 대표컷을 본문 미디어 풀에서 빼기 때문에 **기록의 본체가
메인 영상 하나뿐인 흔한 경우에 그 영상을 스토리 어디에서도 볼 수 없게
된다.** 표지를 탭하면 재생되도록 고쳤고, 재생이 시작되면 제목 오버레이가
사라진다. 이 경로는 `LessonDetail.test.tsx` 가 고정한다.

**필기 원문은 `LessonNotebook` 을 재사용하지 않는다** — 그쪽은 실시간
필기용(자동 스크롤, 타이핑 애니메이션, 요약 푸터)이라 읽기 전용으로 쓰려면
프롭을 여럿 늘리고 동작을 바꿔야 했다. 대신 문단 조립 규칙
(`groupTranscriptParagraphs`)과 종이 토큰을 공유해 같은 시각 언어를 유지한다.
`LessonNotebook` 은 손대지 않았다.

**미디어 지연 로딩은 절반만 했다** — 기획은 `IntersectionObserver` 로
`videoStore.resolve()` 를 미루자고 했지만, 그건 `LessonDetail` 의 기존 해석
이펙트를 뜯는 일이고 같은 기획이 "탭을 붙이는 최소 개입만 하라"고도 한다.
타협점: **해석 결과를 호출자에게서 맵으로 받고**(객체 URL 이 두 벌 생기는
것을 피한다), 실제로 비싼 지점인 **영상 디코더는 탭 전까지 마운트하지
않는다**. 이미지에는 `loading="lazy"` 를 건다. blob URL 생성 자체는 여전히
마운트 시점에 일어난다 — **아직 남아 있는 숙제다**(M2 에서 정리한다고 적었으나
M2 는 표지 문구에 집중했다). 사진이 많은 기록에서 실측해 보고, 문제가
확인되면 `LessonDetail` 의 해석 이펙트를 손보는 별도 작업으로 다룬다.

**기록 단위 동작을 탭 밖으로 뺐다** — 돌아가기/수정/삭제는 원래 자료 뷰
하단에 있었는데, 스토리가 기본 탭이 되면서 탭을 한 번 거쳐야 닿게 됐다.
어느 탭을 보고 있든 같은 기록에 대한 동작이므로 탭 컨테이너 밖으로 옮겼다.

**열린 질문들의 결론** — 코치도 스토리가 기본 뷰다(`[자료]` 탭으로 전환).
일반 `LESSON`/`PRACTICE` 기록에도 적용한다. 라운드(`SCORE`) 기록은
스코어카드가 중심이라 탭 자체를 띄우지 않는다.

---

## 12.6 M2 구현 결과 — 캡션과 대표컷은 M3 로 옮겼다

M2 는 `generateLessonStoryMeta()` 로 **헤드라인과 리드 한 줄**만 짓는다.
§7 표에 있던 나머지 두 개는 의도적으로 뺐다.

**캡션을 빼는 이유** — 캡션을 제대로 쓰려면 모델이 사진을 봐야 한다.
그런데 §14 가 꼽은 가장 큰 위험이 "사진에 없는 걸 지어내면 신뢰가 한 번에
무너진다"이고, M2 시점에는 **코치가 캡션을 보기 전에 학생에게 나간다.**
지어낸 캡션 + 검수 없음은 가장 나쁜 조합이다. §14 가 이미 "M2 까지는 캡션
없이 내보내는 것도 선택지"라고 적어 둔 길을 택했다. 캡션 배선은 이미 다
있으므로(`story.captions` → 조판기 → `StoryPolaroid`) M3 는 편집기만
붙이면 된다.

**대표컷 선정을 빼는 이유** — 모델은 사진을 보지 않으므로 메타데이터만으로
고르게 된다. 그건 조판기의 결정 규칙(§5.2: 레슨 후 영상 → 메인 → 레슨 중
캡처)이 이미 더 잘한다. 추측하는 모델보다 규칙이 낫다.

**승인을 기다리게 하지 않는다** — §7 은 "승인 시점에 1회"라고만 했는데,
승인 버튼에 AI 호출을 직렬로 얹으면 버튼이 눈에 띄게 느려진다. 승인은
이미 저장 왕복을 하나 물고 있고, 표지 문구는 없어도 화면이 성립한다
(뷰가 `lesson.title` 로 폴백). 그래서 **승인을 먼저 끝내고 뒤에서 짓는다** —
`LessonReviewScreen.handleApprove` 가 `onApprove` 를 마친 뒤 생성을 띄우고,
결과가 오면 `onStoryMeta` 로 기록에 붙인다. 그 사이 코치가 다른 기록을
열었으면 화면 상태는 건드리지 않고 저장만 한다.

**부르지 않는 조건** — 뽑아낼 본문이 20자 미만이면 호출 자체를 건너뛴다.
제목만 있는 기록에 제목을 지어내라고 하면 지어낼 수밖에 없기 때문이다.
코치가 직접 정한 헤드라인(`story.editedByCoach`)도 덮지 않는다.

---

---

## 12.7 실사용 피드백 반영 — 표지에서 사진을 빼고, 시각으로 자리를 정한다

코치가 처음으로 레슨 동반 기록을 올려 본 뒤 나온 두 가지. 둘 다 §5.2 의
배치 규칙을 고친다.

**표지에 사진을 걸지 않는다** — 원래 기획은 대표컷 한 장을 "그날의 얼굴"로
맨 위에 걸었다. 실제로 써 보니 그 사진이 **어느 이야기의 것인지가 지워졌다.**
코치는 레슨 중 그 순간의 이야기를 하면서 사진을 찍는데, 그 한 장만 맥락에서
떼어 맨 위로 올리면 나머지 사진과 성격이 달라진다. 이제 표지는 글자만이고
(`cover` 블록에서 `mediaId` 제거, `LessonStory.coverMediaId` 삭제), **모든
자료가 본문으로 내려간다** — 메인 슬롯(`lesson.videoUrl`)까지 포함해서.

부수 효과로 M1 §12.5 의 "표지 영상이 재생된다" 문제가 사라졌다. 대표컷이
본문 풀에서 빠지지 않으니 메인 영상도 본문 폴라로이드에서 재생된다.

**자리는 찍힌 시각이 정한다** — 균등 배치(`gap = ceil(N/(M+1))`)를
`placeMedia()` 의 시간 기준 배치로 바꿨다. 레슨 20분쯤(전체의 1/3)에 찍은
사진은 글의 1/3 지점으로 간다. 코치가 그 순간의 이야기를 하며 찍었으므로
**시각이 "이 사진이 어느 이야기에 속하는가"의 가장 정확한 근거**다.

그러려면 촬영 시각이 기록까지 살아 와야 하는데, **오던 길이 끊겨 있었다**:
`CapturedClip.capturedAt` 이 `PendingMedia` 로 넘어가지 않았고 저장 시점에
모든 첨부가 `createdAt: Date.now()` 를 받아 **전부 같은 시각**이 됐다.
촬영 순서조차 알 수 없는 상태였다. 배선을 이었다.

| 지점 | 변경 |
| --- | --- |
| `LiveLessonHandoff` | `startedAt` 추가 — 세션의 `this.startedAt` 을 싣는다 |
| `LiveLessonDetail` | `startedAt` 추가 — 기록에 레슨 시작 시각을 보관 |
| `PendingMedia` | `capturedAt` 추가 |
| 클립 승격 | `capturedAt: clip.capturedAt` |
| 저장 | `createdAt: item.capturedAt ?? Date.now()` |

**시간만 따르면 무너지는 경우** — 코치가 마지막 5분에 세 장을 몰아 찍으면
셋이 글 끝에 붙어 다시 갤러리가 된다. 그래서 자리를 두 번 다듬는다:
뒤에서부터 한 번(뒤에 남은 자료의 자리를 비워 둔다), 앞에서부터 한 번
(간격 1을 보장한다). 순서는 시각이 정하되 **자료 사이에는 문단이 최소 하나**
들어간다. 이 케이스는 테스트로 고정했다.

**폴백** — 레슨 시작 시각이나 촬영 시각을 모르면(구 기록, 직접 올린 사진)
예전과 똑같이 균등 배치로 떨어진다.

---

## 13. 마일스톤

| | 범위 | 산출 | 검증 |
| --- | --- | --- | --- |
| **M1** ✅ | 자동 조판 + 읽기 전용 스토리 뷰 + 페이퍼 테마 | 기존 필드만으로 모든 기록이 스토리로 보인다 | 완료 — `lessonStoryComposer.test.ts` 41개(교차 삽입 경계, 짧은 글 분기, 폴백 사슬, MEDIA_ONLY, 코치 순서 보존) + `LessonStoryView.test.tsx` 13개(DOM 순서, 지연 마운트, 접힘, alt) |
| **M2** ✅ | `generateLessonStoryMeta` — 헤드라인·리드 (캡션·대표컷은 §12.6 사유로 M3) | 승인 뒤 백그라운드 1회, 실패 시 조용히 폴백 | 완료 — `lessonStoryMeta.test.ts` 16개(부르지 않는 조건, 입력 우선순위, 응답 정리, 실패 경로) + `LessonReviewStoryMeta.test.tsx` 6개(승인이 AI 를 기다리지 않음) |
| **M3** | 코치 저작 (헤드라인/캡션/순서/대표컷) + **캡션 생성** | `story.blocks` 저장 | 저장된 순서가 재조판에 덮이지 않음. 캡션은 코치 눈을 거친 뒤에만 나간다 |
| **M4** | 이미지 카드 내보내기 | 1080×1350 공유 카드 | — |

M1만으로도 "저장만 하는 느낌"은 해소된다. M2~M4는 완성도다.

---

## 14. 리스크 · 열린 질문

**리스크**

1. **글이 짧으면 조판이 무너진다.** `feedback` 이 두 문장뿐인 기록이 실제로
   많다. → 문단 수가 2 미만이면 교차 삽입을 포기하고 `cover → lead →
   갤러리 → checklist` 의 **짧은 레이아웃**으로 분기한다. 조판기에 이 분기를
   반드시 넣는다.
2. **다크 앱 안의 밝은 종이** — 야간에 눈부실 수 있다. → 종이 밝기를 한 단계
   낮춘 `paper-dim` 변형을 두고, 시스템 다크/야간 시간대에 적용할지 검토.
3. **`LessonDetail` 이 2534줄** 이다. 탭을 붙이는 최소 개입만 하고 리팩터링은
   섞지 않는다. 스토리 관련 코드는 전부 새 파일로.
4. **AI 캡션의 과장** — 사진에 없는 걸 지어내면 신뢰가 한 번에 무너진다.
   캡션은 승인 전 코치 눈을 거치게 하고(M3), 그 전(M2)까지는 캡션 없이
   내보내는 것도 선택지다.

**열린 질문**

- 스토리를 **코치의 기본 뷰로도** 할 것인가, 학생만인가?
  (제안: 코치도 기본은 스토리 — 자기가 뭘 보냈는지 학생과 같은 화면으로
  보는 게 맞다. `[자료]` 탭으로 언제든 전환.)
- 일반 `LESSON` / `PRACTICE` 기록에도 스토리를 적용할 것인가?
  (제안: 적용. 조판기가 폴백을 가지고 있으므로 추가 비용이 거의 없다.)
- 헤드라인 자동 생성을 **코치가 끌 수 있어야** 하나?
- 종이 테마 외에 **다크 스토리 테마**를 선택지로 줄 것인가? (`story.theme`
  필드는 미리 비워둔다.)
