import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 레슨 필기 정확도 평가 전용 설정 — `npm run eval:transcription`.
 * 일반 `npm test` 에는 섞이지 않는다(파일 이름이 *.eval.ts 라 기본 include 밖).
 * 실제 Gemini 를 부르므로 한 번에 수십 분이 걸릴 수 있다.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['evals/transcription/**/*.eval.ts'],
    // 파이프라인이 FileReader 로 오디오를 base64 로 바꾼다.
    environment: 'jsdom',
    testTimeout: 60 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
});
