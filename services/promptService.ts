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
   * Get the active template for a given target, or null if none is active.
   */
  getActive: async (
    target: PromptTarget,
    isFirebaseMode: boolean
  ): Promise<PromptTemplate | null> => {
    if (isFirebaseMode) {
      return firebaseService.getActivePromptTemplate(target);
    }
    return storageService.getActivePromptTemplate(target);
  },

  /**
   * Returns the system-prompt string to pass to Gemini.
   * If an admin-managed template is active for this target it is used;
   * otherwise the built-in fallback is returned.
   */
  getActiveSystemPrompt: async (
    target: PromptTarget,
    isFirebaseMode: boolean
  ): Promise<string> => {
    try {
      const template = await promptService.getActive(target, isFirebaseMode);
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
