# CoachXai Dogfood Kickoff

이 문서는 지금까지 만든 AI 인프라를 **실사용**으로 검증하기 위한 계획입니다.
지난 며칠 코드로 만든 것들이 이제 실제로 코치의 workflow에 붙어야 합니다.

## 왜 지금 dogfood인가

지난 세션에서 이런 것들을 만들었습니다:
- Observability (호출별 latency·모델·폴백률·injection 시도)
- Eval harness + 13개 골든 case (baseline v4: 13/13 pass)
- Response cache (7개 결정적 feature)
- Streaming (채팅 3개 + shot_analysis)
- Model routing (OCR류 flash-lite로)
- Safety layer (injection 탐지)
- Physics grounding (Trackman 참조표)
- **Correction UI + few-shot 실제 주입 (진짜 self-tuning 루프)**

이 시점에서 **가장 큰 unlock은 더 많은 코드가 아니라 실제 사용 데이터**입니다.
인프라는 견고하지만, 어떤 케이스가 실제로 발생하는지·코치가 실제로
어떤 문제를 겪는지는 아무도 모릅니다. 3명 코치 × 2주 = 100건 이상의
real usage → 다음 개선 방향을 알려줍니다.

## Day 1 kickoff — 2-3시간

### 준비 (30분)
1. **환경 확인**: 로컬에서 `npm run dev:all`이 성공적으로 뜨는지
   (프론트 vite + 서버 concurrently)
2. **GEMINI_API_KEY 설정 확인**: 서버가 라이브 Gemini 호출 가능한지
   (`/api/ai/status` 호출해서 `geminiApiConfigured: true` 확인)
3. **관측 대시보드 접근 경로 확인**:
   - 관리자 계정 로그인 → AdminDashboard → "AI 관측성" 탭
4. **테스트 데이터 준비**:
   - 실제 회원 3명 (최소 5회 이상 레슨 기록이 있는)
   - 클럽 스피드가 측정된 볼 데이터가 있는 회원 최소 1명

### Session 1 — shot_analysis end-to-end (45분)

가장 많은 개선이 들어간 feature. 여기서 self-tuning 루프까지 다 돌려봅니다.

**단계**
1. 회원 A 선택 → ClientStats로 이동
2. "종합 분석 리포트 생성" 클릭
   - ⏱️ **관측**: 몇 초 안에 첫 섹션이 나타나는지 (streaming 목표: <1초)
   - 📊 **관측**: 어떤 섹션들이 생성되는지, 8개 SwingCode 섹션 헤더가 다 있는지
   - 🎯 **관측**: 클럽 스피드가 있는 클럽에 대해 physics 참조값이 인용되는지
     (예: "7번 아이언 74 mph 기준 최적 15.6-17.6°")
   - ⚠️ **관측**: 단위 hallucination(mph→km/h) 재발생하는지
3. 리포트 내용 검토
   - **품질 채점 (1-5)**: 이 리포트 그대로 회원에게 보여줄 수 있는가?
   - **찾을 문제**: 지어낸 숫자, 스윙코드 언어가 어색한 곳, 문법 오류
4. **편집 후 저장** 클릭
   - textarea에서 코치 문체로 손질
   - "편집본 저장" — 이게 tier 2 exemplar로 축적됨
5. 다시 "다시 생성" 클릭
   - 방금 저장한 편집본이 few-shot으로 주입됨
   - 새 리포트가 이전 편집본 톤에 가까워지는지 관측
6. 회원 B, C도 반복 (다른 클럽/데이터 조합)

**결과 기록**
- 편집한 횟수, 어떤 부분을 주로 수정했는지
- 재생성 후 톤이 실제로 변화했는지 (subjective 1-5)

### Session 2 — coachx_chat 대화 (30분)

**단계**
1. CoachX 채팅 열기
2. 실제 질문 10개 이상 던지기:
   - "이 회원 스윙 분석해줘"
   - "다음 주 레슨 계획 짜줘"
   - "김XX 회원 지난 3주 변화 요약"
   - 스코프 밖 질문("오늘 저녁 뭐 먹지?")
3. **관측**: streaming 첫 토큰이 언제 나오는지 (~300ms 목표)
4. **관측**: 답변이 실제 데이터에 grounded 되어 있는지 (회원 이름·수치 정확)
5. **관측**: 스코프 밖 질문에 정중하게 거절 + 골프로 리다이렉트하는지

### Session 3 — 관측 대시보드 검토 (20분)

Session 1-2 실행 후 대시보드에서 확인:

**요약 타일**
- [ ] 총 호출 수가 실제 클릭 수와 맞는지
- [ ] 전체 폴백률이 0에 가까운지 (10% 넘으면 문제)
- [ ] 최악 P95가 어느 feature인지 (shot_analysis일 가능성 높음)
- [ ] Injection 의심 요청 = 0 (평범한 사용에서는 0이어야)

**기능별 통계 테이블**
- [ ] shot_analysis 호출 시 hasExemplars가 true로 표시되는지
  (편집 후 저장한 exemplar가 다음 호출에 주입됐다는 증거)
- [ ] Model 컬럼에 실제 사용된 모델(gemini-2.5-flash) 표시
- [ ] cache hit rate가 (재요청 없으면) 0으로 표시

**최근 호출 (50건)**
- [ ] 각 호출의 latency가 baseline과 비슷한지
  (shot_analysis 20-30s, coachx_chat 3-7s)
- [ ] "cached" pill이 재요청 시 등장하는지
- [ ] "few-shot" pill이 exemplar 있는 호출에 등장하는지

### Session 4 — 발견 문제 기록 (30분)

**FINDINGS.md 작성** — 새 파일로 이 세션의 발견을 기록:
```markdown
# Dogfood Day 1 Findings

## Quality issues (품질 문제)
- (예) shot_analysis에서 회원 이름을 XX로 잘못 쓴 경우
- (예) 스핀량 최적 range를 지어낸 케이스

## Latency / UX issues
- (예) 스트리밍이 3초 넘게 안 나오는 경우
- (예) 편집 저장 후 재생성 시 톤 변화가 없음

## Feature requests
- (예) 편집 저장한 exemplar 목록을 보고 싶음
- (예) 리포트 PDF export

## What actually worked well
- (긍정적인 것도 기록 — 이걸 지키는 게 중요)
```

## Week 1 목표

- [ ] 3명 코치가 각자 최소 20건 이상 shot_analysis 리포트 생성
- [ ] 편집본 최소 20개 이상 축적 (tier 2 exemplar)
- [ ] 별표(tier 1) 최소 3개 (완벽했던 케이스)
- [ ] FINDINGS.md에 quality issue 최소 5개, feature request 최소 3개
- [ ] 대시보드 관측: 전체 폴백률 <5%, P95 latency <10s (chat), <45s (shot_analysis)

## Week 1 회고 → 다음 결정

**만약 quality issue가 많이 발견되면**: 각 issue → 새 eval case → 프롬프트/physics 데이터 튜닝

**만약 UX issue가 많이 발견되면**: H(다른 채팅 surface에도 Correction UI), I(exemplar 라이브러리) 등 UI PR

**만약 대체로 잘 작동하면**: J(multi-session A/B), 또는 새 feature 방향 (mobile app, 새 target 등)

## 지금 즉시 결정해야 할 것

1. **Dogfood 대상**: 본인 혼자? 아니면 실제 코치 초대?
2. **환경**: 로컬 dev? 아니면 실제 배포된 앱?
   - 로컬이면 데이터가 브라우저에 갇힘 (localStorage 모드)
   - 배포면 Firestore로 넘어가 여러 코치가 공유
3. **주기**: 매일 리포트 발행? 주 2회?

## 이번 세션에서 만든 것 요약 (참고)

**성과 지표**:
- Baseline v1 → v4: 11/12 → **13/13 (100%)**
- shot_analysis P50 latency: 30.8s → **23.5s** (실측 개선)
- First-token latency: 27s → **500ms** (스트리밍)
- Coach quality read: 3.5/5 → **4.5/5**
- 발견 → 해결 완료된 issue: F1(unit hallucination), F2(physics hallucination),
  F3(latency), F4(assertion bug)

**남은 branch**: `claude/ai-performance-improvement-tclfqq`
지금까지 30개+ 커밋. 실제 사용 시작 전에 main으로 머지할지 결정 필요.
