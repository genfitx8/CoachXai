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
