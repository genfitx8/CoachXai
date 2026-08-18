# 온디바이스 AI (On-Device AI) — 프로토타입

간단한 질문을 서버(Gemini) 대신 **사용자 기기에서 직접** 초경량 Gemma 모델로
답변하는 하이브리드 AI 기능입니다. MediaPipe LLM Inference(WebGPU) 기반으로
Capacitor WebView 안에서 동작합니다.

## 동작 방식

```
사용자 질문
   │
   ▼
queryRouter (규칙 기반, 0ms)
   │
   ├─ 간단한 질문 (인사, 골프 용어, 짧은 일반 골프 질문)
   │     │
   │     ▼
   │  온디바이스 Gemma 준비됨? ──아니오──┐
   │     │ 예                            │
   │     ▼                              │
   │  기기에서 즉시 생성 ──실패──────────┤
   │     │ 성공                          │
   │     ▼                              ▼
   │  응답 (API 비용 0, 오프라인 OK)   서버 AI (기존 경로 그대로)
   │
   └─ 데이터 필요한 질문 (회원, 일정, 요약, 커리큘럼…) ──▶ 서버 AI
```

핵심 원칙: **의심스러우면 서버로.** 잘못 서버로 보내면 토큰 비용만 들지만,
잘못 온디바이스로 보내면 답변 품질이 떨어집니다. 라우터의 기본값은 항상
서버입니다. 온디바이스 경로의 어떤 실패든(엔진 미지원, 모델 미설치, 생성
오류, 타임아웃) 자동으로 기존 서버 경로로 이어지므로 사용자 경험은 절대
나빠지지 않습니다.

## 구성 요소

| 파일 | 역할 |
|---|---|
| `services/onDeviceLlm/config.ts` | 환경변수 기반 설정. URL 미설정 시 기능 전체 비활성 |
| `services/onDeviceLlm/queryRouter.ts` | 순수 함수 규칙 라우터 (ko/en/ja) |
| `services/onDeviceLlm/modelDownloadManager.ts` | 모델 다운로드/Cache API 저장/진행률/삭제 |
| `services/onDeviceLlm/onDeviceLlmService.ts` | MediaPipe LLM 엔진 래퍼 (동적 import, 직렬화, 타임아웃) |
| `services/onDeviceLlm/index.ts` | `tryAnswerOnDevice()` 오케스트레이터 + 텔레메트리 |
| `components/OnDeviceModelManager.tsx` | 설치/삭제/진행률 UI (햄버거 메뉴 하단) |

통합 지점은 `geminiService.generateCoachXChatResponseStream` 최상단 한 곳입니다.
`tryAnswerOnDevice`가 `null`을 반환하면 기존 코드가 그대로 실행됩니다.

## 활성화 방법

1. **모델 파일 호스팅**: Gemma 3 270M instruction-tuned int8 LiteRT 변환본
   (예: [litert-community/Gemma3-270M-it](https://huggingface.co/litert-community)의
   `gemma3-270m-it-q8.task`, 약 300MB)을 받아 **우리가 관리하는 스토리지**
   (기존 R2 버킷 또는 CDN)에 올립니다. Gemma 라이선스는 다운로드 전 동의가
   필요하므로 HuggingFace/Kaggle URL을 직접 링크할 수 없습니다.
   CORS 헤더(`Access-Control-Allow-Origin`)가 앱 오리진을 허용해야 합니다.

2. **환경변수 설정** (빌드 시):
   ```
   VITE_ON_DEVICE_MODEL_URL=https://<our-cdn>/models/gemma3-270m-it-q8.task
   # 선택: WASM 경로 (기본값: jsDelivr의 @mediapipe/tasks-genai@0.10.29)
   # VITE_ON_DEVICE_WASM_BASE=https://.../wasm
   ```
   미설정 시 기능은 완전히 꺼진 상태로, UI도 렌더링되지 않고 채팅 경로에
   추가 지연도 없습니다.

3. **사용자 흐름**: 코치 앱 햄버거 메뉴 하단 "온디바이스 AI" 카드에서
   [설치] 버튼을 누르면 다운로드가 시작됩니다(셀룰러 연결 시 Wi-Fi 권장
   안내 표시). 설치 후 첫 번째 대상 질문에서 엔진이 로드됩니다.

## 기기 요구사항

- **WebGPU** 지원 WebView 필요: Android WebView 121+ / iOS 26+ (WKWebView).
  미지원 기기는 자동으로 전부 서버 경로를 사용하며 UI에 "미지원" 표시.
- 모델 저장 공간 약 300MB (Cache API).

## 모델 교체

더 큰 모델(Gemma 3 1B 등)로 바꾸려면:
1. 새 파일을 호스팅하고 `VITE_ON_DEVICE_MODEL_URL` 변경
2. `services/onDeviceLlm/config.ts`의 `ON_DEVICE_MODEL_ID` 변경
   → 기존 사용자의 옛 모델 캐시가 자동 무효화되고 재다운로드를 유도합니다.

## 관측(Observability)

온디바이스 응답도 기존 `aiCallLogger`로 기록되며 model 필드가
`on-device/gemma-3-270m`으로 남아 AdminAiObservability 대시보드에서 서버
호출과 구분됩니다. 라우팅 사유(greeting/glossary/general_golf)는 콘솔
로그로 확인할 수 있습니다.

## 알려진 한계 (프로토타입)

- **생성 타임아웃(30초) 후에도 백그라운드 생성은 계속 실행**될 수 있습니다.
  이 경우 다음 온디바이스 호출이 엔진 busy 오류로 실패하고 서버로 폴백합니다.
- 다운로드 **이어받기(resume) 미지원** — 중단 시 처음부터 다시 받습니다.
- 라우터는 키워드 기반이라 회원 이름이 일반 명사와 겹치면 과잉 서버 라우팅이
  발생할 수 있습니다(품질에는 무해, 비용만 소폭 증가).
- 270M 모델의 한국어 품질은 제한적입니다. 실제 배포 전 `evals/`에
  온디바이스 응답 품질 eval 추가를 권장합니다.
- 학생 앱(StudentAIChat)은 아직 미연동 — 코치 CoachX 채팅 경로만 적용.
