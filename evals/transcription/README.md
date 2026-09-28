# 레슨 필기 정확도 평가

실제 레슨 녹음으로 필기 파이프라인이 **얼마나 정확하게 받아 적고 골프 용어를
바로잡는지** 숫자로 잰다. 프롬프트·모델·용어 목록을 바꿀 때마다 돌려서 좋아졌는지
나빠졌는지 확인하는 용도다.

## 1. 케이스 만들기

`evals/transcription/cases/<케이스 이름>/` 폴더 하나가 케이스 하나다.

| 파일 | 내용 |
|---|---|
| `audio.webm` (또는 `.m4a` `.mp3` `.wav` `.ogg`) | 레슨 녹음 **3~10분 발췌**, 20MB 이하 |
| `reference.txt` | 그 녹음을 사람이 끝까지 듣고 받아 적은 **정답 필기** |
| `meta.json` (선택) | `studentName`, `durationSec`, 코치 사전 `vocabulary`, 추가로 채점할 `extraTerms` — `cases/example/meta.json` 참고 |

정답 필기 작성 요령
- 들린 그대로 적되, 골프 용어는 **표준 표기**로 적는다(섕크, 다운블로, 얼리 익스텐션).
- 줄마다 `코치:` / `학생:` 을 붙여도 되고 안 붙여도 된다(채점 때 지운다).
- 띄어쓰기·문장부호는 채점에 영향이 없다.
- 소음이 많은 구간, 용어가 많이 나오는 구간, 학생이 말을 많이 하는 구간을 골고루 5개 이상 모으면 좋다.

`cases/` 안의 녹음과 필기는 **커밋되지 않는다**(회원 개인정보).

## 2. 실행

```bash
GEMINI_API_KEY=... npm run eval:transcription
GEMINI_API_KEY=... EVAL_CASE=lesson01 npm run eval:transcription    # 한 케이스만

# 모델을 바꿔 비교 (서버와 같은 라우팅 오버라이드)
MODEL_ROUTING_OVERRIDES='{"lesson_audio_term_verify":"gemini-3.6-flash"}' \
  GEMINI_API_KEY=... npm run eval:transcription
```

## 3. 결과 읽기

`evals/runs/<시각>-transcription.md` 에 저장된다(커밋 안 됨).

| 단계 | 파이프라인 경로 |
|---|---|
| 1. 정밀 전사 | `lesson_audio_precise_transcribe` — 녹음을 통째로 받아 적기 |
| 2. + 오디오 대조 | `lesson_audio_term_verify` — 같은 녹음을 다시 들으며 용어 확인 |
| 3. + 최종 교정 | `lesson_transcript_final_repair` — 필기 전체를 읽으며 용어 교정 |

- **CER(문자 오류율)**: 낮을수록 좋다. 공백·문장부호·화자 표기는 빼고 잰다.
- **골프 용어 재현율**: 정답에 나온 골프 용어가 필기에도 바른 표기로 적힌 비율. 높을수록 좋다. 이 서비스의 핵심 지표다.
- **놓친 용어**: 케이스별 상세에 `용어(맞힌 횟수/정답 횟수)` 로 나온다 — 공용 용어 목록이나 오인식 예시에 무엇을 더할지 여기서 찾는다.
- **호출량**: 경로·모델별 토큰 수. 비용 비교의 근거다. 실패 호출이 있으면 그 단계 점수는 "측정 안 됨"일 수 있다.
