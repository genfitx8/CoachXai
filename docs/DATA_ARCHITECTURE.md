# CoachX 데이터 저장 아키텍처 기획서

> **목적**: 코치와 학생이 입력·기록하는 모든 데이터를 서버에 신뢰할 수 있게 정리·축적하여,
> (1) 상용 서비스로서의 데이터 신뢰성 확보, (2) 이후 비즈니스 확장(브랜치·B2B·리포트 상품),
> (3) AI 학습·개인화의 원천 데이터 자산화를 가능하게 하는 저장 구조를 정의한다.
>
> **버전**: v1.0 (2026-08) · **상태**: 기획 초안 (리뷰 대상)

---

## 0. 요약 (Executive Summary)

CoachX의 상용화 병목은 기능이 아니라 **데이터가 서버에 남지 않는 구조**다. 현재 코드베이스를 전수 감사한 결과:

1. **저장 경로가 3중화**되어 있다 — REST→Postgres, Firestore, localStorage. 이 중 Firestore는 프로덕션에서 초기화되지 않는 사실상 죽은 경로이며, 그 결과 **예약·숙제·포인트·퀵로그·AI 메모리·코치 스타일 예시 등 20여 개 엔티티가 기기별 localStorage에만 존재**한다. 코치가 폰에서 잡은 예약이 태블릿에서 안 보이고, 앱 삭제 = 데이터 소멸이다.
2. **AI 가치가 가장 높은 데이터가 유실되고 있다** — 모션캡처(`motionCaptureData`), 스윙 분석 결과(`SwingAnalysis`), 자세 분석(`PostureAnalysisResult`)은 클라이언트에서 계산·표시되지만 서버 컬럼이 없어 저장되지 않는다. 코치가 AI 초안을 수정한 기록(자연 발생 RLHF 데이터)도 서버에 남지 않는다.
3. **구조적 부채** — 학생 식별자가 `이름_전화번호` 복합 문자열(개명/번호변경 시 기록 고아화), 시간이 BIGINT(ms)와 VARCHAR 날짜로 혼재, 마이그레이션 도구 없이 부팅 시 `ALTER TABLE` 나열, 핵심 데이터가 스키마 없는 JSONB 블롭.

본 기획서는 이를 해결하기 위해 **4계층 데이터 아키텍처**(Identity / Core Domain / Event Log / Derived·AI)를 제안하고, 정준(canonical) 스키마, AI 학습 데이터 수집 설계, 동의·소유권 체계, 그리고 **5단계 마이그레이션 로드맵**을 정의한다.

핵심 원칙 한 줄 요약: **"서버 Postgres가 유일한 진실이고, 클라이언트는 캐시다. 모든 입력은 이벤트로도 남긴다. 원본과 파생을 분리한다."**

---

## 1. 왜 데이터 저장 설계가 상용화의 핵심인가

### 1.1 데이터는 CoachX의 실질적 제품이다

CoachX의 차별화는 "레슨 한 번 한 번이 학생의 히스토리로 축적되어 다음 레슨의 맥락이 된다"는 것이다(PRD 핵심 기둥 2). 이 가치는 데이터가 다음 조건을 만족할 때만 성립한다:

- **영속성**: 기기를 바꿔도, 앱을 지워도, 코치를 바꿔도 남는다.
- **연결성**: 학생 한 명의 레슨·스윙·감정·장비·진단이 하나의 식별자로 묶인다.
- **구조성**: AI와 통계가 바로 소비할 수 있는 형태로 저장된다(자유 텍스트 블롭이 아니라).
- **출처 추적성**: 누가, 언제, 어떤 도구로 입력했는지 남는다(코치 입력 vs 학생 입력 vs AI 생성).

### 1.2 데이터가 열어주는 비즈니스

| 데이터 자산 | 파생 비즈니스 |
|---|---|
| 레슨·스윙·샷 히스토리 | 학생용 성장 리포트 구독, 코치용 프리미엄 분석 |
| 코치의 AI 초안 수정 이력 | 코치별 맞춤 AI(코치 스타일 파인튜닝) — 락인 효과의 핵심 |
| 진단 배터리 + 결과 | 표준화된 "골프 정밀진단" 상품, 브랜치/아카데미 B2B |
| 예약·타석·결제 로그 | 시설 운영 SaaS, 가동률 분석 |
| 익명화된 스윙 영상+포즈+런치모니터 페어 | 스윙 분석 모델 자체 학습(현재 ONNX 클럽헤드 모델 스펙 존재) |
| 감정 로그(QuickLog) × 성과 상관 | 멘탈 코칭 기능, 이탈 예측 |

이 중 어떤 것도 **지금의 localStorage 중심 구조에서는 불가능**하다.

### 1.3 AI 학습의 전제 조건

DOGFOOD.md의 결론대로 "AI 인프라는 이미 갖춰졌고 병목은 실사용 데이터"다. 그런데 지금 구조에서는 실사용이 늘어도 데이터가 안 쌓인다:

- 코치가 `LessonReviewScreen`에서 AI 초안을 고친 diff → **최고 품질의 학습 신호**인데 서버에 없음
- `CoachStyleExemplar`(별표/수정/반려 예시) → localStorage에만 있어 파인튜닝 데이터로 추출 불가
- 스윙 포즈 시퀀스 + 코치의 결함 진단 라벨 페어 → 자체 CV 모델 학습의 골드 라벨인데 유실
- `AiCallLog` → 관측용 텔레메트리조차 기기에 갇혀 있음(1,000건 캡)

---

## 2. 현재 상태 진단 (AS-IS)

### 2.1 저장 경로 3중화 현황

| 경로 | 조건 | 실제 상태 |
|---|---|---|
| REST → Render Postgres (`services/apiService.ts` → `server/`) | `VITE_API_BASE_URL` 설정 시 | **정상 동작** — auth, lessons, clients, coaches, packages, curriculums, push, files, payments |
| Firestore (`services/firebase.ts`) | `firebaseService.isInitialized()` | **사실상 사망** — 초기화 호출이 AdminDashboard의 SYSTEM 탭(수동 설정 붙여넣기) 한 곳뿐. 일반 세션에서는 항상 미초기화 |
| localStorage (`services/storage.ts`, 937줄) | 폴백 | **실질적 주 저장소**가 되어버린 엔티티 다수 (아래 2.2) |
| Cloudflare R2 (presigned PUT, `mediaAccess.ts` HMAC 서명 읽기) | 미디어 | 정상 동작 |
| IndexedDB (`videoStore.ts`, `idb://` 센티널) | 로컬 영상 초안 | 정상(의도된 로컬) |

### 2.2 서버에 존재하지 않는 엔티티 (localStorage 전용) — 전수 목록

Firestore가 죽어 있으므로 아래는 모두 **기기별 localStorage에만 존재**한다:

| 분류 | 엔티티 | 비즈니스 영향 |
|---|---|---|
| 예약/시설 | `LessonReservation`(12단계 상태머신), `Branch`, `Bay`, `BayPriceRule`, `BayReservation` | **치명적** — 예약이 기기 간 동기화 안 됨. 이중 예약 방지 로직(결정적 id)도 한 기기 안에서만 유효 |
| 학습 관리 | `Homework`, `HomeworkTemplate` | 코치가 낸 숙제를 학생 기기에서 못 봄(같은 기기 공유 시나리오만 동작) |
| 포인트/알림 | `PointTransaction` 이력, `NotificationMessage` | 포인트 이력 유실 → 정산 분쟁 대응 불가 |
| 학생 기록 | `QuickLogEntry`(감정 로그), 진단 세션(`swingnote_diagnosis_sessions`) | 감정×성과 상관 분석 불가, 진단 상품화 불가 |
| AI 자산 | `StudentContext`(AI 메모리), `WeeklyInsight`, `HandoverSummary`, `PromptTemplate`, `CoachStyleExemplar`, `AiCallLog`, 채팅 히스토리 | **AI 개인화·학습·관측의 원천이 전부 휘발성** |
| 기타 | `GolfCourse`, `TrainingProgram`(서버 테이블은 있으나 apiService가 빈 스텁) | — |

### 2.3 계산되지만 저장되지 않는 데이터 (유실 필드)

| 데이터 | 생산 지점 | 유실 지점 |
|---|---|---|
| `Lesson.motionCaptureData` | `posture/SwingVideoAnalysis.tsx`, `LessonDetail.tsx` | `lessons` 테이블에 컬럼 없음, `mapLesson()`이 반환 안 함. AI 프롬프트(`lessonContext.ts`)는 읽으려고 함 |
| `SwingAnalysis` (8단계 이벤트, 스윙 플레인, 키네틱 시퀀스, 손궤적) | `swingAnalysisService.ts` (1,985줄의 계산) | 어디에도 영속화 안 됨 — 볼 때마다 재계산 |
| `PostureAnalysisResult` / `PostureSession` | `skeletonAnalysisService.ts` | 동일 |
| 17종 결함 감지(`FaultId`) 결과 | `faultDetectionService.ts` | `StudentContext.swingFaultHistory`에 요약만 (localStorage) |
| AI 초안 vs 코치 최종본 diff | `LessonReviewScreen` (`editedSections[]`) | `review_sections` JSONB에 최종본만; 초안·diff는 미보존 |

### 2.4 구조적 문제

1. **이중 식별자 체계**: `clients.id`는 UUID인데, `lessons.client_id`·homework·points·quick logs·student contexts는 `` `${name}_${phone}` `` 복합 문자열 키를 쓴다. 개명·번호 변경 시 기록이 고아가 된다. `lessons`에 `client_name`/`client_phone`이 비정규화 복사되고 **전화번호에 인덱스를 걸어 조회**한다.
2. **마이그레이션 도구 부재**: `initDb()`가 부팅 때마다 `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` 배열을 실행. rename/drop/백필/롤백이 불가능하고, 스키마의 현재 상태를 코드에서 추론해야 한다.
3. **시간 타입 혼재**: `created_at BIGINT`(epoch ms), `date VARCHAR(50)`, `expiry_date VARCHAR(50)`, `subscription_end_date VARCHAR(50)`. 글로벌 타임존 대응(PRD 요구)이 불가능한 저장 형식.
4. **JSONB 블롭 과다**: `ai_analysis`, `golf_data`, `swing_sequence`, `scorecard_detail`, `member_body_analysis` 등 분석·통계·학습에 가장 중요한 데이터가 스키마/버전 없는 블롭. 쿼리 불가, 스키마 진화 추적 불가.
5. **보안 부채**: `BranchAdminAccount.password` 평문(localStorage/Firestore), 브랜치 관리자 로그인 전부 클라이언트 사이드, 하드코딩된 레거시 관리자 폴백 크리덴셜(`authService.ts`, `server/routes/auth.ts`), 토큰 저장소 3원화.
6. **죽은 코드/경로**: `tossPayments.ts` 라우트 미마운트, `training_programs` 테이블 도달 불가, 루트에 `dist.zip` 커밋됨.
7. **localStorage 용량 압박을 이미 코드로 방어 중**: AI 로그 1,000건 캡, 채팅 200메시지 캡 + 쿼터 에러 시 반절 재시도, 오염된 JSON 방어 유틸(`safeStorage.ts`)과 회귀 테스트까지 존재 — 로컬 저장의 한계를 코드가 증언하고 있다.

### 2.4.1 회원 행 중복 — 증상과 정리 경로 (운영 노트)

같은 사람이 `clients`에 여러 줄로 남는다. 두 갈래다.

- **유령 행**: 제거된 `POST /api/clients`와 옛 로컬 캐시 상향 동기화가 만든,
  `password_hash IS NULL`이면서 `coach_id`만 로그인한 코치로 찍힌 행. 앱을 켤
  때마다 새로 찍혀 한 코치의 "전체 학생"이 433명까지 부풀었다.
- **표기 변형**: `010-1234-5678` / `01012345678`, `김 회원` / `김회원`처럼
  번호·이름 표기만 다른 가입 계정.

**신원 규칙**(세 곳이 공유): 숫자만 남긴 번호 + 공백 없는 소문자 이름. 번호가
없으면 서로 다른 사람을 합칠 수 없으므로 `id`를 키로 쓴다.
`server/src/routes/clients.ts`의 `identityKeySql()`, 프런트의
`utils/clientRoster.ts`, 그리고 관리자 정리 보고서가 같은 규칙을 쓴다.

**읽기 경로**는 이미 방어되어 있다 — `GET /api/clients`가 코치 응답을 사람
단위로 접고(가장 최근 갱신 행), `password_hash IS NULL` 행은 아예 제외한다.
오프라인 폴백은 공용 캐시 대신 코치별 캐시(`swingnote_clients_coach_<id>`)만
읽는다.

**행 자체를 지우는 유일한 통로**는 관리자 콘솔 › 회원 정리 탭
(`GET /api/clients/duplicates` → `POST /api/clients/cleanup`, 둘 다 admin 전용).
지우는 대상은 "지워도 잃을 것이 없는 행"뿐이며, 판정은 삭제 직전에 서버가 다시
한다 — 로그인 계정이 있는 행, `client_id`로 참조되는 데이터가 하나라도 있는 행
(참조 테이블 목록은 `information_schema`에서 읽으므로 새 테이블도 자동 포함),
그리고 그 사람을 대표해 남길 한 줄은 절대 지우지 않는다. 레슨은 `client_id`
외에 이름+번호로도 매칭되므로, 살아남는 행이 그 기록을 그대로 이어받는다.

### 2.5 이미 잘 되어 있는 것 (보존·확장할 자산)

- **데이터 소유권 3단계 개념**이 이미 스키마에 존재: `ownership('student'|'shared'|'coach')`, `visibility('self'|'coach'|'branch')`, `original_coach_id`, `previous_coach_ids[]` — 코치 변경/인수인계 설계의 좋은 기반
- **AI 근거 봉투**(`AIEvidenceEnvelope`: swingEvidence/historyEvidence/confidence/caveats)가 모든 AI 판단에 부착되는 규약 — 학습 데이터 품질 라벨로 그대로 활용 가능
- **AI 호출 관측 설계**(`AiCallLog`: promptHash, injectionSuspected, evidenceCount 등) — 서버로 옮기기만 하면 됨
- **레슨 승인 워크플로**(draft → approved, 학생 노출 제어) — 데이터 품질 게이트로 활용 가능
- R2 presigned 업로드 + HMAC 읽기 서명 — 미디어 파이프라인 기본기 확보

---

## 3. 목표 설계 원칙 (TO-BE Principles)

1. **Single Source of Truth = 서버 Postgres.** 클라이언트(localStorage/IndexedDB)는 캐시와 오프라인 큐일 뿐이다. "서버가 없으면 로컬에 저장"이 아니라 "서버에 못 보냈으면 **전송 대기 큐**에 저장"으로 의미를 바꾼다.
2. **모든 입력은 이벤트로도 남는다 (Append-only Event Log).** 현재 상태 테이블과 별개로, 코치·학생의 모든 기록 행위를 불변 이벤트로 적재한다. 이것이 AI 학습·행동 분석·감사(audit)·장애 복구의 원천이 된다.
3. **원본(Raw)과 파생(Derived)을 분리한다.** 영상·포즈 시퀀스·런치모니터 수치·코치 원문 메모는 원본. `StudentContext`·주간 인사이트·성장 리포트는 파생이며 **원본에서 언제든 재계산 가능**해야 한다. 파생 데이터에는 반드시 생성 엔진 버전을 기록한다.
4. **식별자는 불변 UUID 하나.** 이름·전화번호는 속성이지 키가 아니다. 복합 문자열 키를 전면 퇴출한다.
5. **시간은 `TIMESTAMPTZ` + 발생지 타임존.** 글로벌 서비스 전제(PRD)를 저장 계층부터 지킨다.
6. **JSONB는 '버전 있는 문서'로만 허용.** 구조가 안정된 필드는 컬럼/자식 테이블로 승격하고, 진화 중인 문서(AI 분석 결과 등)는 `schema_version` 필드를 의무화한 JSONB로 저장한다.
7. **쓰기는 멱등(idempotent).** 모바일 환경의 재시도·오프라인 재전송을 전제로, 모든 쓰기에 클라이언트 생성 ID(`client_generated_id`)를 부여해 중복을 흡수한다.
8. **개인정보는 목적별 동의와 함께 저장한다.** "서비스 제공"과 "AI 학습 활용"의 동의를 분리하고, 학습용 추출 시 가명화를 기본값으로 한다.

---

## 4. 목표 아키텍처: 4계층 모델

```
┌─────────────────────────────────────────────────────────────┐
│  L4. Derived / AI Layer (재계산 가능)                        │
│      student_context_snapshots · weekly_insights ·           │
│      growth_reports · training_dataset_exports               │
├─────────────────────────────────────────────────────────────┤
│  L3. Event Log Layer (append-only, 불변)                     │
│      domain_events · ai_interactions · ai_feedback_events    │
├─────────────────────────────────────────────────────────────┤
│  L2. Core Domain Layer (정규화된 현재 상태)                  │
│      lessons · shots · swing_analyses · reservations ·       │
│      homework · curriculums · payments · media_assets ...    │
├─────────────────────────────────────────────────────────────┤
│  L1. Identity & Access Layer                                 │
│      users(coaches/clients) · relationships · consents ·     │
│      branches · devices                                      │
└─────────────────────────────────────────────────────────────┘
        ▲                                        │
        │ 멱등 쓰기 (outbox 큐)                   ▼ 서명 URL
   [클라이언트: 캐시 + 오프라인 큐]        [R2: 미디어 원본/파생]
```

- **L1**은 "누가"를, **L2**는 "지금 무엇이"를, **L3**은 "무슨 일이 있었나"를, **L4**는 "그래서 무엇을 아는가"를 담당한다.
- L4는 전부 L2+L3에서 재계산 가능해야 하며, 스냅샷에 `engine_version`을 남긴다. AI 메모리(`StudentContext`)가 오염되면 재빌드하면 된다 — 지금처럼 localStorage의 유일본이 진실이 되는 구조를 없앤다.
- L3는 UPDATE/DELETE 없는 append-only 테이블로, 향후 웨어하우스(BigQuery 등) 배치 export의 원천이 된다. 초기에는 같은 Postgres 안의 테이블로 충분하다.

---

## 5. 정준(Canonical) 스키마 설계

> 아래 DDL은 방향을 정의하는 스케치다. 실제 적용은 §9 로드맵의 마이그레이션 단계에서 `node-pg-migrate` 기반 마이그레이션 파일로 작성한다.
> 공통 규약: PK는 `UUID DEFAULT gen_random_uuid()`, 시간은 `TIMESTAMPTZ NOT NULL DEFAULT now()`, 모든 쓰기 API는 `client_generated_id UUID` 멱등 키를 받는다.

### 5.1 L1 — Identity & Access

```sql
-- 코치/학생 계정은 당분간 분리 유지(급진적 users 통합은 리스크 대비 이득이 작다).
-- 대신 공통 식별을 위한 최소한의 통합 뷰만 둔다.

-- 코치-학생 관계를 명시적 테이블로 (clients.coach_id 단일 컬럼의 한계 극복)
CREATE TABLE coach_student_relationships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES coaches(id),
  student_id    UUID NOT NULL REFERENCES clients(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | ended
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  end_reason    VARCHAR(30),          -- handover | coach_closed | student_left
  handover_summary_id UUID,           -- 인수인계 패키지 연결
  UNIQUE (coach_id, student_id, started_at)
);
-- 기존 clients.coach_id / previous_coach_ids[] 는 이 테이블에서 파생되는 편의 컬럼으로 강등

-- 목적별 동의 (§8 참조)
CREATE TABLE consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  user_role     VARCHAR(20) NOT NULL,           -- coach | client
  purpose       VARCHAR(40) NOT NULL,           -- service | ai_training | marketing | media_branch_share
  policy_version VARCHAR(20) NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX idx_consents_user ON consents (user_id, purpose, revoked_at);

-- 브랜치/시설 (localStorage → 서버 승격)
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  time_zone VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
  opening_hours JSONB NOT NULL DEFAULT '{}',    -- OpeningHours 문서, schema_version 포함
  holidays JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branch_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,          -- bcrypt. 평문 저장 즉시 폐기
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, username)
);

CREATE TABLE bays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  label VARCHAR(100) NOT NULL,
  floor VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE bay_price_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  day_of_week SMALLINT NOT NULL,                -- 0-6
  start_hour SMALLINT NOT NULL,
  price_points INTEGER NOT NULL
);
```

**식별자 정리 방침**
- `clients.id`(UUID)를 학생의 유일 정식 식별자로 확정.
- 모든 `` `${name}_${phone}` `` 키 사용처(lessons, homework, points, quick_logs, student_contexts, curriculum 계열의 `student_id VARCHAR`)에 `student_uuid UUID` 컬럼을 추가하고, `clients` 테이블 조인 백필 → 이중 기간 운영 → 구 키 컬럼 제거의 3단계로 전환한다(§9 Phase 2).
- 매칭 실패 레코드(이름/번호 오타 등)는 `orphan_records` 스테이징 테이블로 이동해 관리자 화면에서 수동 병합.

### 5.2 L2 — 레슨 도메인 (핵심 분해)

현재 40컬럼 + JSONB 12개의 `lessons` 단일 테이블을 다음과 같이 분해한다:

```sql
-- (1) 레슨 코어: 예약·패키지·승인 상태 등 '레슨이라는 사건'만
ALTER TABLE lessons
  ADD COLUMN student_uuid UUID REFERENCES clients(id),
  ADD COLUMN occurred_at TIMESTAMPTZ,           -- date VARCHAR 대체
  ADD COLUMN time_zone VARCHAR(64) DEFAULT 'Asia/Seoul',
  ADD COLUMN client_generated_id UUID UNIQUE;   -- 멱등 쓰기

-- (2) 미디어 자산 대장: 모든 R2 객체의 단일 원장 (§7 미디어 파이프라인의 축)
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  owner_role VARCHAR(20) NOT NULL,
  lesson_id UUID REFERENCES lessons(id),
  r2_key TEXT NOT NULL UNIQUE,
  kind VARCHAR(30) NOT NULL,       -- swing_video | edited_video | compare_video | photo | voice_memo | body_photo | launch_monitor_shot
  role VARCHAR(20),                -- BEFORE | AFTER
  mime_type VARCHAR(100),
  duration_ms INTEGER,
  width INTEGER, height INTEGER, size_bytes BIGINT,
  swing_angle VARCHAR(20),         -- FRONT | SIDE (스윙 영상일 때)
  visibility VARCHAR(20) NOT NULL DEFAULT 'coach',   -- self | coach | branch (기존 3단계 유지)
  source VARCHAR(30),              -- live_lesson | upload | practice_upload
  status VARCHAR(20) NOT NULL DEFAULT 'active',       -- active | deleted (soft delete → 수명주기 정책)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_assets_lesson ON media_assets (lesson_id);

-- (3) 샷 데이터 정규화: 런치모니터 수치를 '샷' 단위 행으로 (통계·AI의 기본 단위)
CREATE TABLE shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id),
  student_uuid UUID NOT NULL,
  shot_index INTEGER NOT NULL DEFAULT 0,
  club VARCHAR(50),
  carry_m NUMERIC(6,1), total_m NUMERIC(6,1),
  ball_speed_ms NUMERIC(6,2), club_speed_ms NUMERIC(6,2),
  launch_deg NUMERIC(5,2), attack_deg NUMERIC(5,2),
  back_spin_rpm INTEGER, side_spin_rpm INTEGER,
  smash_factor NUMERIC(4,2),
  club_path_deg NUMERIC(5,2), face_angle_deg NUMERIC(5,2),
  dynamic_loft_deg NUMERIC(5,2), spin_loft_deg NUMERIC(5,2),
  side_total_m NUMERIC(6,1),
  source VARCHAR(30) NOT NULL DEFAULT 'manual',   -- manual | ocr | device_import
  source_media_id UUID REFERENCES media_assets(id), -- OCR 원본 스크린샷 연결 (학습 페어!)
  raw JSONB,                                        -- OCR 원문/기기 원본 보존
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shots_student_club ON shots (student_uuid, club, created_at);
-- lessons.golf_data JSONB 는 읽기 호환 기간 후 제거

-- (4) 스윙 분석 결과 영속화 (현재 완전 유실 중인 데이터)
CREATE TABLE swing_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id UUID NOT NULL REFERENCES media_assets(id),
  lesson_id UUID REFERENCES lessons(id),
  student_uuid UUID,
  engine VARCHAR(30) NOT NULL,          -- mediapipe_pose | onnx_clubhead | gemini_vision
  engine_version VARCHAR(30) NOT NULL,  -- 재계산·모델 비교의 필수 키
  schema_version SMALLINT NOT NULL DEFAULT 1,
  camera_view VARCHAR(20),              -- face_on | down_the_line
  events JSONB,                         -- 8단계 SwingEvent 타임스탬프
  summary JSONB,                        -- SwingSummary (템포, 플레인, 키네틱 시퀀스...)
  detected_faults JSONB,                -- FaultId[] + 근거 (룰 기반 17종)
  pose_frames_key TEXT,                 -- 프레임별 랜드마크 원본은 R2에 (행당 수 MB 방지)
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (5) 모션캡처/자세 분석 (유실 중인 motionCaptureData, PostureSession)
CREATE TABLE motion_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id),
  student_uuid UUID NOT NULL,
  kind VARCHAR(20) NOT NULL,            -- swing_motion | posture_front | posture_side
  engine_version VARCHAR(30) NOT NULL,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  measurements JSONB NOT NULL,          -- MotionCaptureMeasurement / SkeletonAnalysis
  media_asset_id UUID REFERENCES media_assets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (6) 레슨 리뷰: AI 초안과 코치 최종본을 모두 보존 (AI 학습 골드 데이터, §6)
CREATE TABLE lesson_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) UNIQUE,
  ai_draft JSONB,                       -- AI가 생성한 초안 원본 (LessonReviewSections)
  ai_draft_model VARCHAR(50),
  ai_draft_prompt_hash VARCHAR(16),
  final_sections JSONB NOT NULL,        -- 코치 승인 최종본
  edited_sections TEXT[],               -- 코치가 손댄 섹션 목록
  evidence JSONB,                       -- AIEvidenceEnvelope
  approval_status VARCHAR(20) NOT NULL DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  shared_to_student BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- lessons.review_sections / approval_status 는 마이그레이션 후 이 테이블로 이관

-- (7) 학생 피드백 (client_feedback JSONB 승격)
CREATE TABLE lesson_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id),
  student_uuid UUID NOT NULL,
  text TEXT,
  voice_media_id UUID REFERENCES media_assets(id),  -- data URL 저장 관행 폐지
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`scorecard_detail`(18홀 + 홀별 음성메모)은 라운드 기록의 성격이 강하므로 중기적으로 `rounds` / `round_holes` 테이블로 분리하되, Phase 1에서는 `schema_version` 부여만 하고 유지한다.

### 5.3 L2 — 예약/학습관리/포인트 (localStorage 승격 대상)

```sql
-- 레슨 예약: 12단계 상태머신을 서버에서 강제
CREATE TABLE lesson_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id),
  student_uuid UUID REFERENCES clients(id),
  branch_id UUID REFERENCES branches(id),
  bay_id UUID REFERENCES bays(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL,          -- 기존 ReservationStatus 12값 유지
  lesson_type VARCHAR(30),
  block_reason TEXT,
  rejection_reason TEXT,
  created_by VARCHAR(20) NOT NULL,      -- coach | student | branch_admin
  client_generated_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 이중 예약 방지: 애플리케이션 id 조합 대신 DB 제약으로
CREATE UNIQUE INDEX uniq_bay_slot ON lesson_reservations (bay_id, starts_at)
  WHERE status NOT IN ('CANCELLED','REJECTED');
-- 상태 전이 이력은 domain_events 로 (§5.4) — 별도 이력 테이블 불필요

CREATE TABLE bay_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL, bay_id UUID NOT NULL,
  student_uuid UUID NOT NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
  paid_points INTEGER NOT NULL DEFAULT 0,
  client_generated_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bay_id, slot_start)
);

CREATE TABLE homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID, student_uuid UUID NOT NULL,
  lesson_id UUID REFERENCES lessons(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  due_on DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  client_generated_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quick_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_uuid UUID NOT NULL,
  log_date DATE NOT NULL,
  mood VARCHAR(10) NOT NULL,            -- GREAT..TERRIBLE
  practice_area VARCHAR(20),
  good_point TEXT, problem_point TEXT, notes TEXT,
  client_generated_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 포인트: 잔액 컬럼(current_points)은 파생값으로 강등, 원장이 진실
CREATE TABLE point_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_role VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,              -- +적립 / -차감
  type VARCHAR(40) NOT NULL,
  description TEXT,
  order_id VARCHAR(255),
  granted_by UUID,
  client_generated_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 잔액 = SUM(amount). 정합성 검증 잡이 coaches/clients.current_points 와 대사(reconcile)
```

진단 배터리(`GolferProfile` 인테이크 + `DiagnosisResult`)는 상품화 가치가 높으므로 `diagnosis_sessions`(intake JSONB + result JSONB, 각 `schema_version`) 테이블로 승격한다. 인테이크 폼 구조가 아직 진화 중이므로 정규화보다 버전 있는 문서 저장이 적합하다.

### 5.4 L3 — 이벤트 로그 (신설)

```sql
-- 모든 기록 행위의 불변 로그. UPDATE/DELETE 금지 (DB 권한으로 강제)
CREATE TABLE domain_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,        -- 클라이언트 생성, 멱등 재전송 흡수
  occurred_at TIMESTAMPTZ NOT NULL,     -- 클라이언트 발생 시각
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_role VARCHAR(20) NOT NULL,      -- coach | client | branch_admin | system | ai
  event_type VARCHAR(60) NOT NULL,      -- lesson.created | lesson.approved | reservation.status_changed |
                                        -- homework.completed | quicklog.recorded | media.uploaded | ...
  entity_type VARCHAR(40),
  entity_id UUID,
  student_uuid UUID,                    -- 학생 축 분석을 위한 비정규화
  payload JSONB NOT NULL DEFAULT '{}',
  schema_version SMALLINT NOT NULL DEFAULT 1,
  app_variant VARCHAR(20),              -- coach | student | web
  device_id VARCHAR(64)
);
CREATE INDEX idx_events_entity ON domain_events (entity_type, entity_id);
CREATE INDEX idx_events_student ON domain_events (student_uuid, occurred_at);
CREATE INDEX idx_events_type_time ON domain_events (event_type, occurred_at);
```

운영 방침:
- **쓰기 경로**: 각 도메인 API가 상태 테이블 갱신과 같은 트랜잭션 안에서 이벤트를 insert한다(별도 수집 서버 불필요 — 현 규모에 과설계).
- **파티셔닝**: 월 단위 range partition. 초기엔 미적용, 1천만 행 근접 시 도입.
- **웨어하우스**: 상용화 초기엔 Postgres 안에서 직접 분석. 분석 부하가 서비스에 영향을 주기 시작하면 read replica → 이후 일 배치로 BigQuery/DuckDB 파일 export. **지금 웨어하우스를 세우지 않는 것이 의도된 결정**이다.

### 5.5 L3 — AI 상호작용 로그 (신설, 학습 데이터의 심장)

```sql
-- 현재 localStorage AiCallLog 의 서버 승격 + 원문 보존 옵션
CREATE TABLE ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID, user_role VARCHAR(20),
  student_uuid UUID,                    -- 대상 학생 (있을 때)
  feature VARCHAR(60) NOT NULL,         -- coachx_chat | lesson_review_draft | shot_analysis | ...
  model VARCHAR(50) NOT NULL,
  prompt_hash VARCHAR(16) NOT NULL,
  prompt_text TEXT,                     -- ai_training 동의 있는 사용자만 원문 저장, 아니면 NULL
  response_text TEXT,                   -- 동일
  prompt_tokens INTEGER, response_tokens INTEGER,
  latency_ms INTEGER,
  status VARCHAR(20) NOT NULL,          -- success | fallback | error
  error_message TEXT,
  cached BOOLEAN NOT NULL DEFAULT false,
  injection_suspected BOOLEAN NOT NULL DEFAULT false,
  evidence_count INTEGER, confidence VARCHAR(20),
  referenced_lesson_count INTEGER,
  schema_version SMALLINT NOT NULL DEFAULT 1
);
CREATE INDEX idx_ai_interactions_feature ON ai_interactions (feature, occurred_at);

-- 코치·학생의 AI 출력에 대한 반응 = 라벨
CREATE TABLE ai_feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id UUID REFERENCES ai_interactions(id),
  user_id UUID NOT NULL, user_role VARCHAR(20) NOT NULL,
  kind VARCHAR(20) NOT NULL,            -- starred | edited | dissent | thumbs_up | thumbs_down | regenerated
  original_output TEXT,                 -- AI 원안
  final_output TEXT,                    -- 사용자 수정본 (edited/dissent 일 때)
  target VARCHAR(40),                   -- PromptTarget (10종)
  tier SMALLINT,                        -- CoachStyleExemplar tier 1|2|3 승계
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`ai_interactions.prompt_text/response_text`는 **호출 지점이 이미 서버(`/api/ai/invoke`)이므로 추가 클라이언트 작업 없이 저장 가능**하다 — 가장 저렴하게 확보할 수 있는 대량 데이터다. 저장 여부는 §8의 동의 플래그로 게이팅한다.

### 5.6 L4 — 파생/AI 레이어

```sql
-- AI 메모리: localStorage 유일본 → 서버 스냅샷 + 재계산 가능
CREATE TABLE student_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_uuid UUID NOT NULL,
  context JSONB NOT NULL,               -- StudentContext 문서
  engine_version VARCHAR(30) NOT NULL,  -- 빌더 버전
  schema_version SMALLINT NOT NULL DEFAULT 1,
  built_from_event_id BIGINT,           -- 어느 이벤트까지 반영했는지 (증분 재계산)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ctx_latest ON student_context_snapshots (student_uuid, created_at DESC);

-- weekly_insights, handover_summaries, prompt_templates, coach_style_exemplars 도
-- 동일 패턴(문서 + engine/schema_version)으로 서버 승격.
-- chat_messages 는 (user_id, role, thread, seq, content, created_at) 정규 테이블로.
```

---

## 6. AI 학습 데이터 전략

### 6.1 데이터 가치 서열 — 무엇부터 지킬 것인가

| 순위 | 데이터 | 왜 골드인가 | 현재 상태 → 조치 |
|---|---|---|---|
| 1 | **AI 초안 vs 코치 최종본 diff** (`lessons.review_sections_draft` vs `review_sections`) | 코치가 실제 업무 중 만든 자연 발생 선호 라벨(RLHF/DPO 페어). 돈 주고도 못 사는 데이터 | **완료** — 초안은 write-once로 보존되고, 승인 시 초안≠최종본이면 서버가 `ai_feedback_events`에 `edited` 페어를 남긴다 |
| 2 | **CoachStyleExemplar** (starred/edited/dissent, tier 1-3) | 코치별 스타일 파인튜닝·few-shot의 직접 재료. 코치 락인의 기술적 근거 | **완료** — 예시 풀은 `coach_style_exemplars`, 판정 행위는 `ai_feedback_events`에 동시 기록 |
| 3 | **스윙 영상 + 포즈 시퀀스 + 결함 라벨 + 코치 코멘트 4중 페어** | 자체 CV 모델(클럽헤드/결함 감지) 학습 셋. `docs/ml-club-head-model.md`가 요구하는 바로 그 데이터 | 분석 결과 유실 → `swing_analyses` + R2 pose 원본 |
| 4 | **런치모니터 스크린샷 + OCR 결과 페어** (`shots.source_media_id` + `raw`) | OCR 모델 개선용 지도 데이터가 공짜로 쌓임 | 원본 미연결 → `shots`에 연결 저장 |
| 5 | **채팅 로그 + 만족 신호** | 대화형 코칭 AI 품질 개선, 이탈 신호 | localStorage 200개 캡 → 서버 정규 테이블 |
| 6 | **진단 배터리 + 이후 성과 추적** | "진단→처방→결과" 종단 데이터. 진단 상품의 신뢰도 근거 | localStorage → `diagnosis_sessions` |
| 7 | **QuickLog 감정 × 샷 데이터 상관** | 멘탈 코칭 기능·리텐션 예측 | localStorage → `quick_logs` |

### 6.2 수집 지점 설계 원칙

- **행동 자체를 라벨로 쓴다.** 별도 라벨링 UI를 만들기 전에, 이미 존재하는 행위 — 초안 수정, 별표, 반려, 재생성 요청, 승인 후 5분 내 취소 — 를 `ai_feedback_events`로 남기는 것이 우선이다. 전부 기존 UI에 훅만 추가하면 된다.
- **부정 신호도 데이터다.** `regenerated`(재생성 요청), `dissent`(반려), 승인까지 걸린 편집 시간은 품질 저하 감지와 하드 네거티브 학습 페어의 재료다.
- **근거 봉투를 라벨에 승계한다.** `AIEvidenceEnvelope.confidence`(strong/plausible/speculative)를 학습 셋의 품질 필터로 사용한다.
- **평가 하네스와 연결한다.** 기존 `evals/` 골든 케이스에 실사용에서 나온 diff 페어를 주기적으로 승격(코치 동의 + 가명화)하여 회귀 스위트를 실데이터로 성장시킨다.

### 6.3 학습 데이터셋 추출 파이프라인

```
domain_events + ai_interactions + ai_feedback_events + lesson_reviews
        │  (주 1회 배치 스크립트, read replica)
        ▼
가명화 (student_uuid → dataset_id 해시, 이름·전화·이메일 제거,
        자유 텍스트 PII 스크럽 — 전화번호/이메일 정규식 + LLM 검수)
        ▼
dataset_exports 테이블에 매니페스트 기록
  (export_id, 기간, 필터, 스키마 버전 분포, 동의 정책 버전, 행 수, R2 경로)
        ▼
R2: /datasets/{export_id}/*.jsonl   ← 파인튜닝·평가·분석의 입력
```

- **추출 대상은 `ai_training` 동의가 유효한 사용자 데이터로 한정**한다(§8). 동의 철회 시 다음 export부터 제외되며, 매니페스트에 정책 버전이 남아 소급 추적이 가능하다.
- 모든 JSONB 문서에 `schema_version`이 있으므로, 추출 스크립트는 버전별 변환기를 거쳐 단일 스키마의 JSONL로 정규화한다.

### 6.4 스키마 진화 규약

1. JSONB 문서 필드 추가는 자유, **의미 변경·삭제는 `schema_version` 증가 + 변환기 추가**로만 한다.
2. `engine_version`(분석 엔진)과 `schema_version`(저장 형식)을 혼동하지 않는다 — 전자는 "무엇이 계산했나", 후자는 "어떻게 적혀 있나".
3. 파생 테이블은 언제든 truncate → 재빌드 가능해야 하며, 재빌드 스크립트를 `server/src/jobs/`에 코드로 유지한다.

---

## 7. 미디어·센서 데이터 파이프라인

### 7.1 원칙

- R2가 블롭의 진실, `media_assets`가 메타데이터의 진실. **DB에 base64/data URL 저장 금지**(현재 `ClientFeedback.voiceUrl`이 data URL — 폐지 대상).
- 업로드는 현행 presigned PUT 유지하되, **업로드 완료 확정(confirm) API**를 추가해 `media_assets` 행 생성과 R2 객체 존재를 일치시킨다(고아 객체 방지 — 주기적 대사 잡으로 검증).
- 읽기는 현행 HMAC 서명 URL 유지. `visibility`(self/coach/branch) 검사를 `media_assets` 기준으로 일원화한다.

### 7.2 파생 아티팩트의 계보(lineage)

```
media_assets (원본 스윙 영상)
   ├─ thumbnail          (r2: /derived/{asset_id}/thumb.jpg)
   ├─ pose_frames        (r2: /derived/{asset_id}/pose.v{n}.json.gz)  ← swing_analyses.pose_frames_key
   ├─ edited_video       (media_assets 행, parent_asset_id 참조)
   └─ compare_video      (media_assets 행, parent_asset_id 참조)
```

`media_assets`에 `parent_asset_id UUID` 컬럼을 두어 파생 관계를 기록한다. 원본 삭제 시 파생물 처리 정책(연쇄 삭제)이 이 계보를 따른다.

### 7.3 수명주기·비용 정책

| 데이터 | 보존 정책 (초안) |
|---|---|
| 스윙 영상 원본 | 활성 회원: 무기한. 탈퇴 시 30일 후 삭제(동의된 학습용 가명 사본 제외) |
| 편집/비교 영상 | 원본과 동일 |
| pose_frames 원본 | 무기한 (텍스트 압축, 저렴, 학습 가치 높음) |
| 라이브 레슨 임시 클립 | 레슨 승인 후 미첨부분 7일 뒤 삭제 |
| IndexedDB 로컬 초안 | 서버 업로드 확정 후 즉시 정리 (현행 유지) |

R2 스토리지 비용은 영상이 지배한다. 상용화 초기엔 원본 보존을 기본으로 하되, 요금제와 연동한 보존 기간 차등(FREE 90일 / PRO 무기한 등)을 결제 스키마와 함께 설계할 것.

---

## 8. 동의·소유권·개인정보 설계

### 8.1 데이터 소유권 — 기존 3단계 모델의 확장

기존 `ownership('student'|'shared'|'coach')` × `visibility('self'|'coach'|'branch')` 체계를 유지·확장한다:

| 데이터 | ownership 기본값 | 코치 변경 시 |
|---|---|---|
| 레슨 기록 (승인본) | shared | 학생이 가져감 + 전 코치는 집계 통계만 |
| 코치 개인 메모 (`coach_memo`, `freeMemo`, part_lesson_records) | coach | 전 코치에 잔류, 학생·새 코치 비노출 |
| 학생 자기 기록 (quick_logs, 자기 연습, 프로필) | student | 완전 이동 |
| 커리큘럼 템플릿 | coach | 잔류 (배정 이력은 shared) |
| 인수인계 패키지 | shared | `handover_summary_id`로 관계 종료에 연결 |

새 규칙: **관계 종료는 삭제가 아니라 `coach_student_relationships.status='ended'`**다. 데이터는 남고 접근 권한만 바뀐다. 이 판정을 API 미들웨어 한 곳(`mediaAccess` 확장)에서 수행해 라우트별 중복 구현을 없앤다.

### 8.2 목적별 동의 (consents 테이블)

| purpose | 내용 | 기본값 |
|---|---|---|
| `service` | 서비스 제공을 위한 필수 처리 | 가입 시 필수 |
| `ai_training` | 가명화된 데이터의 AI 학습 활용 (프롬프트/응답 원문 저장 포함) | **opt-in**, 가입 플로우에서 명시 요청 |
| `media_branch_share` | 스윙 영상의 브랜치 공유 (`visibility='branch'`) | opt-in |
| `marketing` | 마케팅 알림 | opt-in |

- 동의는 정책 버전과 함께 저장하고, 철회는 `revoked_at` 기록(행 삭제 아님).
- `ai_interactions`의 원문 저장, §6.3 데이터셋 추출은 모두 이 테이블을 게이트로 사용한다.
- 한국 개인정보보호법 기준으로 설계하되, `policy_version`·목적 분리·가명화 구조는 GDPR 확장을 수용한다(PRD의 글로벌 전제).

### 8.3 즉시 조치가 필요한 보안 부채 (데이터 신뢰의 전제)

1. [x] `BranchAdminAccount` 평문 비밀번호 → `branch_admins.password_hash`(bcrypt) + `POST /api/auth/login/branch-admin`(JWT role `branch_admin`, branchId 스코프). 클라이언트는 서버 로그인 우선, 미이관 계정만 레거시 폴백 — 플랫폼 관리자가 BRANCH_STAFF 탭을 열면 로컬 계정이 자동 이관(서버가 해시만 저장). 지점관리자 포인트 지급도 JWT 기반 원장 경로로 전환됨.
2. 하드코딩 관리자 폴백 크리덴셜(`admin@coachx.kr/admin1234`) 제거 — env 기반 시드로 대체.
3. [x] 회원가입 이메일 미검증 → `email_verifications`(SHA-256 코드 해시, 10분 만료, 행별 5회 시도 제한) + `POST /api/auth/email/verify/request|confirm`. 가입 라우트가 "확인 완료 후 30분 이내, 미소모" 행을 요구하므로 폼을 우회해 엔드포인트를 직접 호출해도 미인증 가입은 성립하지 않는다. 계정 생성 성공 시 해당 행을 소모(consumed_at)시켜 같은 코드의 재사용을 막는다. `REQUIRE_EMAIL_VERIFICATION=false`로만 우회 가능(미이관 배포용).
4. 탈퇴/삭제 요청 처리 절차 정의: 소프트 삭제 → 30일 유예 → 하드 삭제 + 가명 학습 사본 분리. `domain_events`에는 가명 키만 남긴다.

---

## 9. 마이그레이션 로드맵

> 원칙: **한 번에 갈아엎지 않는다.** 각 Phase는 독립 배포 가능하고, 실패 시 롤백 가능하며, 기존 읽기 경로를 깨지 않는다.

### Phase 0 — 기반 공사 (1주 내외, 다른 모든 것의 전제)

- [x] `node-pg-migrate` 도입. 현재 `initDb()`의 결과 스키마를 baseline 마이그레이션으로 스냅샷(`server/migrations/…_baseline.js`, 멱등이므로 신규/기존 운영 DB 모두에 안전 적용). 이후 `initDb()`는 마이그레이션 러너 호출로 대체
- [x] 신규 테이블부터 공통 규약 적용(TIMESTAMPTZ, UUID, 멱등 event_id)
- [x] `domain_events` 테이블 생성 + 이벤트 기록 헬퍼(`server/src/services/events.ts`) — 레슨 create/update/approve/delete에 연결
- [x] `ai_interactions` 생성 — `/api/ai/invoke(-stream)`에 로깅 훅 연결(`server/src/services/aiInteractionLog.ts`). **서버 배포 즉시 AI 텔레메트리 축적 시작** (원문은 동의 게이트 전까지 hash만)
- [ ] 스테이징 DB 분리(현재 단일 Render PG로 추정) + 일일 백업/복구 리허설 — 운영 콘솔 작업, 코드 외

### Phase 1 — localStorage 엔티티의 서버 승격 (상용화 최소선, 2–4주)

우선순위 순:

1. **예약 계열** — 다기기 불일치가 사용자 신뢰를 직접 깨는 영역
   - [x] `lesson_reservations` 서버 승격: 문서 원문(JSONB) + 조회 키 컬럼 방식, `/api/reservations` CRUD(역할 스코프 + 타 학생 PII 새니타이즈), 클라이언트 백엔드 스위치(api→firebase→local) + 로그인별 1회 로컬 데이터 업로드 동기화. 상태 전이는 domain_events(`reservation.*`)로 기록
   - [x] `branches` / `bays` / `bay_price_rules` / `bay_reservations` 승격: `/api/branches`(+bays/price-rules/admins), `/api/bay-reservations`. 결정적 슬롯 id PK + advisory lock 트랜잭션으로 **이중 예약을 DB 레벨에서 원천 차단**(동일 슬롯·다시간 겹침 모두 409 검증 완료). 클라이언트는 `branchService` 파사드(api→firebase→local) + 관리자 세션에서 1회 로컬 데이터 승격. 타 학생 PII는 서버에서 새니타이즈
2. **포인트 원장** — 돈과 직결
   - [x] `point_transactions`를 정식 원장으로 확장(grant 메타데이터 + doc 원문 컬럼), `/api/points` 라우트: 조회(역할 스코프), 원장 추가+잔액 원자 적용(id=멱등 키, 클라이언트 자가 적립은 타입·금액 한도 검증, 탑업 타입은 거부), 감사용 로컬 이력 import(잔액 미적용). 서버 `creditPoints`가 결제 확정 시점에 잔액까지 적용하고, 클라이언트 `pointService`는 API 모드에서 탑업이면 행 삽입 없이 잔액만 새로고침 → **이중 적립 원천 차단**. `point.earned/spent` 이벤트 기록
   - [ ] 잔액 대사(reconcile) 잡: SUM(원장) ↔ current_points 비교 (§10.3 대시보드와 함께)
   - [x] 지점관리자 포인트 지급(grant): 지점관리자 서버 인증 도입으로 JWT 기반 원장 경로로 전환 완료
3. **숙제/퀵로그/진단**
   - [x] `homework` 서버 승격: `/api/homework` (배치 업서트, 완료 토글, 삭제), 코치 권한은 담당 학생 로스터로 판정, `homeworkService` 파사드로 컴포넌트 직접 접근 제거, 로그인별 1회 로컬 동기화. `homework.assigned/self_added/completed/deleted` 이벤트 기록. (기존 apiService.saveHomeworkBatch가 no-op 스텁이라 API 모드에서 코치 숙제 배치가 조용히 유실되던 버그도 함께 해소)
   - [ ] `quick_logs` — 현재 저장 호출부가 없는 미완성 기능(UI만 존재). 쓰기 경로가 생길 때 같은 패턴으로 승격
   - [ ] `diagnosis_sessions`
4. **AI 자산**
   - [x] `student_contexts`(AI 메모리), `coach_style_exemplars`(파인튜닝 골드 데이터 — 코치 소유/글로벌 스코프, `ai.exemplar_*` 이벤트), `chat_threads`(학생 채팅 — 코치 접근 차단, 디바운스 write-through + 새 기기 하이드레이션), `weekly_insights`, `handover_summaries` 서버 승격. `/api/ai-assets` 라우트 + 각 서비스 API 모드 분기
   - [ ] `prompt_templates` / 클라이언트 AiCallLog 이력 승격 (신규 호출은 이미 서버 `ai_interactions`에 축적 중이라 후순위)
5. **알림/골프코스** — 후순위

클라이언트 전환 패턴 (서비스별 동일 적용):
```
storage.ts 폴백 제거 → apiService에 실제 엔드포인트 연결
→ 최초 로그인 시 로컬 데이터 1회 업로드(멱등 키로 중복 흡수) → 로컬은 캐시로 강등
→ 오프라인 쓰기는 outbox 큐(IndexedDB)에 적재, 연결 복구 시 재전송
```

### Phase 2 — 식별자·타입 정규화 (2–3주, Phase 1과 부분 병행 가능)

- [ ] 전 테이블에 `student_uuid` 추가 → `clients` 조인 백필 → 쓰기 경로 이중 기록 → 읽기 경로 전환 → 구 복합 키 컬럼 제거 (4단계 배포)
- [ ] 매칭 실패분 `orphan_records` 스테이징 + 관리자 병합 화면
- [ ] `date VARCHAR` → `occurred_at TIMESTAMPTZ + time_zone` 백필 (KST 가정 명시)
- [ ] `lessons`의 `client_name/client_phone` 비정규화 컬럼과 전화번호 인덱스 제거

### Phase 3 — 레슨 도메인 분해 + 유실 데이터 구조 (3–4주)

- [ ] `media_assets` 대장 구축, 기존 `video_url/video_key/media/additional_media` 백필
- [ ] `shots` 정규화 + OCR 원본 연결
- [ ] `swing_analyses` / `motion_captures` 신설 — **클라이언트가 계산한 결과를 저장하는 API 추가** (이 시점부터 스윙 분석 데이터 축적 시작)
- [ ] `lesson_reviews` 분리 — AI 초안 보존 시작 (골드 데이터 축적 개시)
- [ ] `lesson_feedback` 분리, voice data URL → R2 이전

### Phase 4 — 동의·거버넌스·추출 (2주 + 지속 운영)

- [x] `consents` + 가입/설정 플로우에 동의 UI — `consents` 테이블(활성 동의 1행을 부분 유니크 인덱스로 강제), `GET/PUT /api/consents`, 가입 화면의 선택 동의 체크박스, 코치·학생 설정의 `DataConsentSettings` 토글. 철회는 행 삭제가 아니라 `revoked_at` 기록
- [x] `ai_interactions` 원문 저장을 동의 게이트로 활성화 — `prompt_text`/`response_text`가 `ai_training` 동의가 유효한 사용자에 한해 저장된다(`hasConsent`, 60초 캐시). 시스템 지시문+프롬프트를 함께 담고, 저장 직전 PII 스크럽(`scrubPii`)을 거친다
- [ ] 가명화 추출 스크립트 + `dataset_exports` 매니페스트
- [ ] 보안 부채 청산(§8.3), 탈퇴 절차 구현
- [ ] 데이터 품질 대시보드(§10.3)를 admin에 추가

### 명시적으로 하지 않는 것 (과설계 방지)

- 별도 이벤트 수집 서버/Kafka — 현 규모에 불필요, 트랜잭션 내 insert로 충분
- 지금 웨어하우스(BigQuery) 구축 — Postgres 직접 분석으로 시작
- coaches/clients의 users 테이블 통합 — 이득 대비 전환 리스크 큼, 관계 테이블로 해결
- Firestore 부활 — **제거 방향**. 죽은 경로를 살리는 게 아니라 코드에서 걷어낸다
- 마이크로서비스 분리 — 단일 Express + PG 유지

---

## 10. 인프라 선택과 운영

### 10.1 DB: Render Postgres 유지 (현행) — 근거와 조건

- 현재 서버·클라이언트·배포(render.yaml)가 모두 이 경로에 맞춰져 있고, 문제는 DB가 아니라 **DB를 안 쓰는 코드**다. 엔진 교체는 로드맵 전체를 지연시킨다.
- 참고: 조직에 Supabase 프로젝트(`rtgxlhwwovkggqrdqcjc`, 서울 리전)가 존재하나 **INACTIVE 상태로 미사용**이다. RLS·Auth·Storage 통합이 필요해지는 시점(예: 셀프서브 B2B)에 재평가하되, 그 경우에도 본 문서의 스키마 설계는 그대로 이식된다.
- 조건: `basic-256mb` 인스턴스는 이벤트 로그 축적 시작 후 6개월 내 상향 필요 예상. 스토리지·커넥션 모니터링 알람을 Phase 0에서 설정.

### 10.2 백업·복구

- Render 자동 백업 + **주 1회 복구 리허설**(스테이징에 restore 후 스모크 테스트)을 운영 루틴으로.
- [x] 독립 논리 백업: `.github/workflows/db-backup.yml` — 매주 월 03:00 KST에 `pg_dump -Fc` → Cloudflare R2 적재(무결성 검증 + 180일 보존). GitHub Secrets에 `RENDER_DATABASE_URL`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET` 등록 필요.
- `domain_events` 월 파티션은 콜드 파티션부터 R2로 아카이브 가능하게 설계.

### 10.3 데이터 품질 운영 (admin 대시보드 지표)

| 지표 | 목적 |
|---|---|
| 고아 레코드 수 (student_uuid 매칭 실패) | 마이그레이션 품질 |
| R2 객체 ↔ media_assets 불일치 수 | 미디어 대사 |
| point_ledger 합계 ↔ current_points 불일치 | 정산 신뢰 |
| 이벤트 유입량 (event_type별 일간) | 수집 파이프라인 생존 신호 |
| schema_version 분포 | 변환기 부채 추적 |
| ai_feedback_events 축적량 (kind별) | 학습 데이터 축적 속도 = 북극성 지표 |

---

## 11. 성공 지표 (이 기획의 KPI)

1. **서버 커버리지**: 사용자 입력 엔티티 중 서버 영속화 비율 — 현재 추정 ~40% → Phase 1 후 95%+
2. **데이터 유실 0**: 계산되고 저장 안 되는 필드(§2.3) 0건
3. **다기기 정합**: 예약·숙제·포인트의 기기 간 불일치 신고 0건
4. **골드 데이터 축적 속도**: 주간 `ai_feedback_events`(edited/starred/dissent) 건수, 주간 AI 초안-최종 diff 페어 수
5. **재계산 가능성**: `student_context_snapshots` 전체 재빌드가 스크립트 1회로 성공
6. **복구 능력**: 백업→복구 리허설 소요 시간 < 1시간

---

## 부록 A. 현재 localStorage 전용 엔티티 → 목표 테이블 매핑

| 현재 (localStorage 키/서비스) | 목표 |
|---|---|
| LessonReservation (`reservationService`) | `lesson_reservations` |
| Branch / Bay / BayPriceRule / BayReservation (`bayReservationService`) | `branches` / `bays` / `bay_price_rules` / `bay_reservations` |
| Homework / HomeworkTemplate | `homework` / `homework_templates` |
| PointTransaction 이력 (`pointService`) | `point_ledger` |
| QuickLogEntry | `quick_logs` |
| 진단 세션 (`swingnote_diagnosis_sessions`) | `diagnosis_sessions` |
| StudentContext (`studentContextService`) | `student_context_snapshots` (파생) |
| WeeklyInsight / HandoverSummary | 동 패턴 문서 테이블 |
| PromptTemplate / CoachStyleExemplar (`promptService`, `coachStyleService`) | `prompt_templates` / `ai_feedback_events` |
| AiCallLog (`aiCallLogger`) | `ai_interactions` |
| 채팅 히스토리 (`chatHistoryService`) | `chat_messages` |
| NotificationMessage / GolfCourse | `notifications` / `golf_courses` (후순위) |

## 부록 B. 유실 필드 → 목표 저장처

| 유실 데이터 | 목표 |
|---|---|
| `Lesson.motionCaptureData` | `motion_captures` |
| `SwingAnalysis` 전체 (이벤트, 요약, 키네틱 시퀀스) | `swing_analyses` + R2 pose_frames |
| `PostureAnalysisResult` / `PostureSession` | `motion_captures` (kind=posture_*) |
| 17종 결함 감지 결과 | `swing_analyses.detected_faults` |
| AI 초안 원본 (LessonReview) | `lesson_reviews.ai_draft` |
| 런치모니터 OCR 원본 스크린샷 연결 | `shots.source_media_id` + `raw` |
