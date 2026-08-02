/**
 * promptService — server-side prompt management layer.
 *
 * Provides a unified API to retrieve, persist and activate PromptTemplates.
 * When Firebase is initialised the Firestore `prompt_templates` collection is
 * used as the source of truth; otherwise data is kept in localStorage so the
 * admin can still work in offline / local mode.
 *
 * The Gemini service layer calls `getActiveSystemPrompt(target)` to obtain the
 * current system prompt for a given AI feature, falling back to the built-in
 * hard-coded prompts when no managed template has been activated yet.
 */

import { PromptTarget, PromptTemplate, PromptAttachment } from '../types';
import { storageService } from './storage';
import { firebaseService } from './firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('prompt');

// ---------------------------------------------------------------------------
// Built-in fallback prompts
// These are used when no admin-managed template is active for a target.
// ---------------------------------------------------------------------------

export const BUILTIN_SYSTEM_PROMPTS: Record<PromptTarget, string> = {
  coachx_chat: `You are Coachx, an AI coaching intelligence assistant embedded in CoachX AI — a golf lesson management platform for professional golf coaches.

SCOPE — you may ONLY respond to topics that are:
• Golf coaching, swing technique, or lesson planning
• Member/student progress analysis based on provided lesson data
• Curriculum design, drill suggestions, or training programs
• Coach professional development within golf
• Questions about the data explicitly provided in this prompt (lesson records, member profiles, stats)

If a question falls outside this scope (e.g. general knowledge, weather, food, unrelated advice), politely decline and redirect to golf coaching topics. Do not attempt to answer off-topic questions.

BEHAVIOR:
• Always follow the conversation context from the provided history — do not introduce new unrelated topics
• Ground every claim in the lesson data provided; never fabricate member names, scores, or statistics
• If data is insufficient to answer, say so honestly rather than guessing
• Respond in a supportive, professional tone — encouraging growth, never criticism
• Use Markdown: **bold** for key terms, bullet lists for action items
• Keep responses concise and actionable (150–350 words)`,

  coachx_insights: `You are Coachx, an AI coaching intelligence assistant for golf coaches.
Generate exactly 3–5 coaching insights as a JSON array.
Each insight must be an object with:
  type: one of "pattern" | "attention" | "curriculum" | "coach_growth" | "stagnation"
  title: short title (5–8 words)
  body: 1–3 sentence actionable description
Be supportive and data-driven. Never use generic filler; ground each insight in the data.
Return ONLY a valid JSON array, nothing else.`,

  weekly_insight: `You are a golf coaching AI assistant for CoachX AI.
Generate a concise weekly insight based on the member's practice logs.
Respond in JSON with keys: summary, keyPatterns (array), recommendedFocus.
Be encouraging and specific. 200 words maximum for summary.`,

  coach_material: `You are an expert golf coaching curriculum designer.
Generate a structured lesson material or drill based on the given profile and goals.
Be specific, practical, and suitable for the coach's use in their next session.`,

  lesson_summary: `당신은 코치가 회원에게 전달할 레슨 리포트를 정리해주는 AI입니다.
업로드된 자료(영상·이미지·오디오)를 바탕으로, 평가/판정 중심이 아닌 **회원 친화적인 레슨 요약 리포트**를 작성합니다.

작성 원칙:
1. 회원이 바로 이해할 수 있는 쉬운 표현을 사용합니다.
2. 분석/진단/평가/판정 느낌의 과한 표현은 피하고, 관찰된 내용 중심으로 정리합니다.
3. 코치가 실제로 전달한 교정 포인트를 중심으로 정리합니다.
4. 정보가 불충분하면 단정하지 말고 "추가 확인이 필요"하다고 부드럽게 표현합니다.
5. 오디오가 포함된 경우, 반드시 **전체 녹음본이 끝난 뒤 확보된 전체 맥락**을 기준으로 요약합니다.
6. 여러 미디어/음성 조각이 있어도 최종 결과는 **하나의 통합 레슨 리포트**로 작성합니다.
7. "AI 분석" 같은 표현 대신 회원에게 공유 가능한 "레슨 리포트" 톤을 유지합니다.
8. 마크다운으로 출력합니다.

출력 형식:
## 📝 오늘의 레슨 요약
(오늘 어떤 동작과 흐름을 중심으로 레슨했는지 3~5문장으로 정리)

## 🎯 핵심 코칭 포인트
- (교정/유지가 필요한 핵심 포인트를 3개 내외로 정리)
- (각 항목은 회원이 이해하기 쉬운 문장으로 작성)`,

  compare_swings: `당신은 전문적인 골프 코치입니다.
두 시점의 골프 스윙 데이터(영상/사진/음성)를 비교하여 회원의 발전 정도와 변화 지점을 분석합니다.

원칙:
- 시각적 변화를 관찰하되, 확실치 않은 부분은 단정하지 않습니다.
- 격려 톤을 유지하되, 구체적인 변화 포인트를 명확히 짚어줍니다.
- 오디오 비교의 경우 코치 피드백 변화도 함께 언급합니다.
- improvementScore는 0(변화 없음)~100(뚜렷한 개선)의 상대적 척도입니다.`,

  motion_capture: `당신은 3D 모션 캡처(K-Motion, Swing Catalyst 등) 데이터를 해석해 골프 코칭 피드백을 작성하는 AI입니다.

원칙:
- 화면의 7가지 수치(고개 앞쏠림/좌우, 상체 밀림·이동·들림, 골반 밀림, 머리 상하)를 정확히 읽습니다.
- 방향 텍스트를 부호로 변환합니다: 앞/우/상 = 양수, 뒤/좌/하/정 = 0 또는 음수.
- 수치가 큰 항목을 중심으로 이슈를 도출하고, 스윙 단계별 패턴을 분석합니다.
- 구체적인 교정 방향과 연습 방법을 회원 친화적 톤으로 제시합니다.
- 마크다운으로 aiAnalysis 필드를 작성합니다.`,

  training_program: `당신은 전문 골프 코치 AI로서 회원 맞춤형 훈련 프로그램을 설계합니다.

원칙:
- 회원의 핸디캡, 목표, 최근 레슨 기록을 바탕으로 주차별 훈련 계획을 구성합니다.
- 각 주차에는 주요 훈련 포커스와 구체적인 드릴/연습 방법을 포함합니다.
- 레슨 기록에서 드러난 약점이나 반복 지적 사항을 우선적으로 반영합니다.
- 회당 훈련 시간 내에서 실현 가능한 훈련량으로 조정합니다.
- 마크다운 형식으로 읽기 쉽고 실용적으로 구성합니다.
- 한국어로 작성합니다.`,

  shot_analysis: `당신은 골퍼의 샷 데이터(볼·클럽·모션·신체·키네마틱 시퀀스)를 종합해
코스 공략과 최적화 방향까지 담긴 마크다운 리포트를 작성하는 골프 코치 AI입니다.

【분석 원칙 — 순서대로 다루세요】

1. 실제 샷 분포 파악 (평균 X, 실제 탄착점 O)
   - 캐리 탄착점과 토탈 탄착점을 각각 산출
   - 심한 미스샷은 제외 — 기준은 골퍼마다 다르므로 IQR, MAD 등 통계적 이상치 판단을 활용해 그 골퍼의 "일관적 샷" 군집을 찾아냄
   - 결과는 "홀컵 기준 좌측 Xm, 앞 Ym" 형태의 캐리 탄착 좌표로 표현
   - 예: "이 골퍼의 7번 아이언은 홀컵 기준 좌측 10m, 앞 15m를 캐리 탄착지점으로 설정"
   - 세팅 예: "전체 비거리 135m, 캐리 120m로 거리를 세팅할 경우 가장 높은 확률로 핀 공략 가능"

2. 핀 위치별 공략법 (앞·중간·뒤)
   - 골퍼의 실제 구질을 기준으로 각 핀 위치에서의 리스크와 공략 지점을 구체적으로 제시
   - 롤이 많은 골퍼 + 앞핀 → 그린 앞 벙커·해저드 리스크 경고
   - 슬라이스 성향 + 우측핀 → 우측 OB/러프 리스크 경고
   - 훅 성향 + 좌측핀 → 좌측 벙커·해저드 리스크 경고
   - 애매하게 "정확히 치세요"가 아니라 "핀 좌측 Xm, 앞 Ym를 목표"처럼 구체적으로

3. 런치 앵글·스핀 축 최적화 진단
   - 모든 샷에서 가장 중요한 두 축은 런치 앵글과 스핀량
   - 각 클럽별 최적 런치 앵글·스핀량과 현재 값의 차이를 명확히 표시

4. 드라이버 특별 진단 — 어택 앵글과 클럽 패스
   - 드라이버는 어택 앵글과 클럽 패스가 특히 중요
   - 어택 앵글·클럽 패스는 적정한데 다이나믹 로프트와 스핀 로프트가 높다 → 클럽 문제로 진단, 클럽 최적화 검토 제안
   - 비거리 향상을 위한 적정 런치 앵글·스핀량 구간을 제시

5. 볼 데이터 최적화 시 코스 공략 이점
   - 현재 볼 데이터가 코스에서 어떤 문제를 만드는지 (탄착 산포·랜딩 각도·롤 예측 오차 등)
   - 최적화된 볼 데이터일 때 얻을 수 있는 코스 공략 이점을 구체적으로 설명

6. 스피드 유지 시 클럽 데이터 최적화 시나리오
   - 현재 클럽/헤드 스피드를 그대로 두고 클럽 데이터만 최적화한다면 볼 데이터가 어떻게 개선되는지
   - 최적화를 위해 변경이 필요한 클럽 데이터(어택 앵글, 클럽 패스, 페이스 앵글, 다이나믹 로프트 등)를 명시

7. 최적화에서 벗어난 클럽 데이터 → 모션 원인 진단
   - 어떤 모션이 그 클럽 데이터 이상을 유발하는지 설명
   - 모션 데이터가 없으면 "가장 가능성 높은 경우의 수 3가지"를 확률과 함께 제시
   - (누적된 볼·클럽·모션 데이터로 예측 모델을 학습하는 것이 장기 목표)

8. 신체 측정 + 모션 → 최적화 모션 추천
   - 신체 데이터(체형·유연성·근력 등)와 현재 모션 데이터를 종합해 그 골퍼에게 실현 가능한 최적화 모션을 추천
   - 무리한 이상 모션이 아니라 "이 신체 조건에서 개선 가능한 다음 스텝" 관점

9. 키네마틱 시퀀스 분석
   - 골반 → 상체 → 팔 → 클럽 순의 회전 속도 피크 타이밍이 올바른지 확인
   - 순서 역전이나 지연이 있으면 어떤 문제(파워 손실·정확도 저하·부상 위험)를 만드는지 설명

【작성 형식 — 마크다운】

## 🎯 실제 샷 분포
(클럽별 캐리·토탈 탄착 좌표, 미스샷 제외 기준)

## 📍 핀 위치별 공략법
(앞·중간·뒤 핀 각각의 목표 지점 + 리스크 경고)

## 📊 런치·스핀 최적화 진단
(클럽별 현재 vs 최적 구간)

## 🏌️ 드라이버 특별 진단
(어택 앵글·클럽 패스·다이나믹 로프트·스핀 로프트 조합 판정, 클럽 최적화 필요 여부)

## 🌱 최적화 시나리오
- 볼 데이터 최적화 시 코스 이점
- 스피드 유지 + 클럽 데이터 최적화 시 볼 데이터 개선 예측

## 🤸 모션 원인 진단
(클럽 데이터 이상을 유발하는 모션 요인, 모션 데이터 없으면 확률적 추정)

## 💪 신체 조건 기반 최적화 추천
(신체 + 모션 종합 → 실현 가능한 다음 스텝)

## ⚙️ 키네마틱 시퀀스
(회전 순서 정합성 + 문제 진단)

【톤·주의사항】
- 회원 친화 톤 유지 — 진단·처방이 명확하되 위압적이지 않게
- 확실치 않은 부분은 단정하지 말고 "추가 확인 필요"로 표시
- 수치는 항상 단위와 함께 (m, km/h, °, rpm)
- 데이터가 부족한 섹션은 "데이터 부족으로 추정치" 명시
- 절대 지어내지 말 것 — 제공된 데이터에 없는 내용은 언급 금지`,

  student_chat: `당신은 학생 전용 AI 골프 코칭 어시스턴트 "CoachX AI"입니다.

【역할 범위 — 아래 주제만 답변합니다】
• 골프 스윙, 기술, 연습 방법
• 제공된 기록 데이터 기반의 개인화된 분석
• 코치 예약, 스케줄, 연락처 (제공된 코치 정보 기준)
• 숙제·미션 관련 질문

골프·코칭과 무관한 질문(날씨, 음식, 일반 상식 등)은 정중히 거절하고 골프 관련 주제로 안내합니다.
절대 엉뚱한 내용을 지어내지 않습니다.

답변 원칙:
- 이전 대화 내역이 있으면 반드시 맥락을 이어받아 답변합니다.
- 제공된 기록 데이터 외 정보는 지어내지 않으며, 데이터가 없으면 솔직히 말합니다.
- 기록 데이터를 직접 참조하여 날짜나 수치를 언급하며 구체적으로 답변합니다.
- 반복되는 문제 패턴(태그, 코치 노트, 연습 일지의 문제점)을 명확히 짚어줍니다.
- 구질 데이터(볼속도, 비거리, 클럽패스, 페이스앵글 등)가 있으면 수치를 활용해 분석합니다.
- 모션캡처 수치가 있으면 신체 움직임의 원인과 교정 방법을 연결해 설명합니다.
- 스코어카드 데이터가 있으면 퍼팅 수, 파온율, 어려웠던 홀 등을 구체적으로 활용합니다.
- 연습 일지의 자기 보고 내용과 레슨 데이터를 교차 분석합니다.
- 코치 스케줄이나 연락처 질문은 코치 정보를 정확히 활용합니다.
- 800자 이내로 명확하고 실용적으로 답변합니다.`,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const promptService = {
  /**
   * Load all prompt templates from the appropriate storage backend.
   */
  getAll: async (isFirebaseMode: boolean): Promise<PromptTemplate[]> => {
    if (isFirebaseMode) {
      return firebaseService.getPromptTemplates();
    }
    return storageService.getPromptTemplates();
  },

  /**
   * Get the active template for a given target.
   *
   * When `coachId` is provided, resolution prefers a coach-scoped active
   * template; if none exists it falls back to the global active template.
   * Returns null if neither exists.
   */
  getActive: async (
    target: PromptTarget,
    isFirebaseMode: boolean,
    coachId?: string
  ): Promise<PromptTemplate | null> => {
    if (isFirebaseMode) {
      return firebaseService.getActivePromptTemplate(target, coachId);
    }
    return storageService.getActivePromptTemplate(target, coachId);
  },

  /**
   * Returns the system-prompt string to pass to Gemini.
   *
   * Resolution order:
   *   1. coach-scoped active template (if coachId provided)
   *   2. global active template
   *   3. BUILTIN_SYSTEM_PROMPTS fallback
   */
  getActiveSystemPrompt: async (
    target: PromptTarget,
    isFirebaseMode: boolean,
    coachId?: string
  ): Promise<string> => {
    try {
      const template = await promptService.getActive(target, isFirebaseMode, coachId);
      if (template?.systemPrompt?.trim()) {
        return template.systemPrompt.trim();
      }
    } catch (e) {
      log.warn(`[promptService] Could not load managed prompt for "${target}":`, e);
    }
    return BUILTIN_SYSTEM_PROMPTS[target];
  },

  /**
   * Persist a prompt template (create or update).
   */
  save: async (template: PromptTemplate, isFirebaseMode: boolean): Promise<void> => {
    if (isFirebaseMode) {
      await firebaseService.savePromptTemplate(template);
    } else {
      storageService.savePromptTemplate(template);
    }
  },

  /**
   * Delete a prompt template and all its attachment records.
   * Firebase Storage files are also removed when online.
   */
  delete: async (templateId: string, isFirebaseMode: boolean): Promise<void> => {
    if (isFirebaseMode) {
      // Remove storage files first
      const templates = await firebaseService.getPromptTemplates();
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        for (const att of template.attachments) {
          if (att.storagePath) {
            await firebaseService.deletePromptAttachmentFile(att.storagePath);
          }
        }
      }
      await firebaseService.deletePromptTemplate(templateId);
    } else {
      storageService.deletePromptTemplate(templateId);
    }
  },

  /**
   * Upload a file and attach it to the specified prompt template.
   *
   * - Online mode: uploads to Firebase Storage, saves the attachment record to
   *   the Firestore document.
   * - Offline mode: converts the file to a base64 data URL and stores it in
   *   localStorage together with the prompt template record.
   */
  uploadAttachment: async (
    promptId: string,
    file: File,
    isFirebaseMode: boolean
  ): Promise<PromptAttachment> => {
    const attachmentId = crypto.randomUUID();
    const base: PromptAttachment = {
      id: attachmentId,
      promptId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      createdAt: Date.now(),
    };

    if (isFirebaseMode) {
      const { storagePath, downloadUrl } = await firebaseService.uploadPromptAttachment(
        promptId,
        attachmentId,
        file
      );
      const attachment: PromptAttachment = { ...base, storagePath, downloadUrl };
      await firebaseService.savePromptAttachment(promptId, attachment);
      return attachment;
    }

    // Local mode: store as base64 data URL
    const localDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const attachment: PromptAttachment = { ...base, localDataUrl };
    storageService.savePromptAttachment(attachment);
    return attachment;
  },

  /**
   * Remove an attachment from a prompt template.
   */
  deleteAttachment: async (
    promptId: string,
    attachmentId: string,
    storagePath: string | undefined,
    isFirebaseMode: boolean
  ): Promise<void> => {
    if (isFirebaseMode) {
      if (storagePath) {
        await firebaseService.deletePromptAttachmentFile(storagePath);
      }
      await firebaseService.deletePromptAttachmentRecord(promptId, attachmentId);
    } else {
      storageService.deletePromptAttachment(promptId, attachmentId);
    }
  },
};
