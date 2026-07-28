/**
 * Tests for the promptService layer:
 * 1. getActiveSystemPrompt returns built-in fallback when no templates exist.
 * 2. getActiveSystemPrompt returns the active template's systemPrompt.
 * 3. getActiveSystemPrompt returns built-in when template is not active.
 * 4. savePromptTemplate deactivates other templates for the same target.
 * 5. deletePromptTemplate removes the template.
 * 6. savePromptAttachment stores attachment on the template.
 * 7. deletePromptAttachment removes attachment from the template.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { promptService, BUILTIN_SYSTEM_PROMPTS } from '../services/promptService';
import { storageService } from '../services/storage';
import { PromptTemplate } from '../types';

// Clear localStorage before each test so templates don't bleed between tests.
beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(
  overrides: Partial<PromptTemplate> = {}
): PromptTemplate {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: 'Test Template',
    target: 'coachx_chat',
    systemPrompt: 'You are a custom CoachX assistant.',
    isActive: false,
    language: 'all',
    attachments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('promptService.getActiveSystemPrompt', () => {
  it('returns built-in fallback when no templates are stored', async () => {
    const result = await promptService.getActiveSystemPrompt('coachx_chat', false);
    expect(result).toBe(BUILTIN_SYSTEM_PROMPTS.coachx_chat);
  });

  it('returns active template systemPrompt when one is stored and active', async () => {
    const template = makeTemplate({ isActive: true, systemPrompt: 'My custom prompt' });
    storageService.savePromptTemplate(template);

    const result = await promptService.getActiveSystemPrompt('coachx_chat', false);
    expect(result).toBe('My custom prompt');
  });

  it('returns built-in fallback when the template exists but is not active', async () => {
    const template = makeTemplate({ isActive: false, systemPrompt: 'Should not be used' });
    storageService.savePromptTemplate(template);

    const result = await promptService.getActiveSystemPrompt('coachx_chat', false);
    expect(result).toBe(BUILTIN_SYSTEM_PROMPTS.coachx_chat);
  });

  it('returns built-in fallback for a different target even if another target is active', async () => {
    const chatTemplate = makeTemplate({ target: 'coachx_chat', isActive: true });
    storageService.savePromptTemplate(chatTemplate);

    const result = await promptService.getActiveSystemPrompt('coachx_insights', false);
    expect(result).toBe(BUILTIN_SYSTEM_PROMPTS.coachx_insights);
  });
});

describe('promptService.save', () => {
  it('saves a new template to localStorage', async () => {
    const template = makeTemplate();
    await promptService.save(template, false);
    const stored = storageService.getPromptTemplates();
    expect(stored.some((t) => t.id === template.id)).toBe(true);
  });

  it('deactivates other templates for the same target when saving an active template', async () => {
    const first = makeTemplate({ isActive: true });
    await promptService.save(first, false);

    const second = makeTemplate({ isActive: true, id: crypto.randomUUID() });
    await promptService.save(second, false);

    const stored = storageService.getPromptTemplates();
    const firstStored = stored.find((t) => t.id === first.id);
    const secondStored = stored.find((t) => t.id === second.id);

    expect(firstStored?.isActive).toBe(false);
    expect(secondStored?.isActive).toBe(true);
  });

  it('updates an existing template when saving with the same id', async () => {
    const template = makeTemplate();
    await promptService.save(template, false);

    const updated = { ...template, name: 'Updated Name' };
    await promptService.save(updated, false);

    const stored = storageService.getPromptTemplates();
    const found = stored.find((t) => t.id === template.id);
    expect(found?.name).toBe('Updated Name');
    expect(stored.filter((t) => t.id === template.id)).toHaveLength(1);
  });
});

describe('promptService.delete', () => {
  it('removes the template from localStorage', async () => {
    const template = makeTemplate();
    await promptService.save(template, false);
    await promptService.delete(template.id, false);

    const stored = storageService.getPromptTemplates();
    expect(stored.some((t) => t.id === template.id)).toBe(false);
  });
});

describe('promptService.getAll', () => {
  it('returns all stored templates', async () => {
    const t1 = makeTemplate();
    const t2 = makeTemplate({ id: crypto.randomUUID(), target: 'coachx_insights' });
    await promptService.save(t1, false);
    await promptService.save(t2, false);

    const all = await promptService.getAll(false);
    expect(all.length).toBe(2);
  });
});

describe('storageService prompt attachment helpers', () => {
  it('adds an attachment to an existing template', () => {
    const template = makeTemplate();
    storageService.savePromptTemplate(template);

    const attachment = {
      id: crypto.randomUUID(),
      promptId: template.id,
      fileName: 'guide.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      createdAt: Date.now(),
    };
    storageService.savePromptAttachment(attachment);

    const stored = storageService.getPromptTemplates();
    const found = stored.find((t) => t.id === template.id);
    expect(found?.attachments).toHaveLength(1);
    expect(found?.attachments[0].fileName).toBe('guide.pdf');
  });

  it('removes an attachment from an existing template', () => {
    const template = makeTemplate();
    storageService.savePromptTemplate(template);

    const attachment = {
      id: crypto.randomUUID(),
      promptId: template.id,
      fileName: 'guide.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      createdAt: Date.now(),
    };
    storageService.savePromptAttachment(attachment);
    storageService.deletePromptAttachment(template.id, attachment.id);

    const stored = storageService.getPromptTemplates();
    const found = stored.find((t) => t.id === template.id);
    expect(found?.attachments).toHaveLength(0);
  });
});

describe('BUILTIN_SYSTEM_PROMPTS coverage', () => {
  // Each PromptTarget must have a built-in fallback so getActiveSystemPrompt
  // never returns undefined for a valid target.
  it.each([
    'coachx_chat',
    'coachx_insights',
    'weekly_insight',
    'coach_material',
    'lesson_summary',
    'compare_swings',
    'motion_capture',
    'training_program',
    'student_chat',
  ] as const)('has a non-empty built-in for %s', (target) => {
    const prompt = BUILTIN_SYSTEM_PROMPTS[target];
    expect(typeof prompt).toBe('string');
    expect(prompt.trim().length).toBeGreaterThan(0);
  });

  it('resolves fallback for each newly-added target via getActiveSystemPrompt', async () => {
    const newTargets = [
      'lesson_summary',
      'compare_swings',
      'motion_capture',
      'training_program',
      'student_chat',
    ] as const;
    for (const target of newTargets) {
      const result = await promptService.getActiveSystemPrompt(target, false);
      expect(result).toBe(BUILTIN_SYSTEM_PROMPTS[target]);
    }
  });

  it('overrides the built-in when an active template is stored for a new target', async () => {
    const template = makeTemplate({
      target: 'lesson_summary',
      isActive: true,
      systemPrompt: '코치 김철수의 커스텀 레슨 요약 프롬프트',
    });
    storageService.savePromptTemplate(template);

    const result = await promptService.getActiveSystemPrompt('lesson_summary', false);
    expect(result).toBe('코치 김철수의 커스텀 레슨 요약 프롬프트');
  });
});

describe('coachId scoping', () => {
  it('coach-scoped active wins over global active for the same target', async () => {
    const globalT = makeTemplate({
      target: 'lesson_summary',
      isActive: true,
      systemPrompt: '전역 기본 프롬프트',
    });
    const coachT = makeTemplate({
      target: 'lesson_summary',
      isActive: true,
      coachId: 'coach-A',
      systemPrompt: '코치A 전용 프롬프트',
    });
    storageService.savePromptTemplate(globalT);
    storageService.savePromptTemplate(coachT);

    const forCoachA = await promptService.getActiveSystemPrompt(
      'lesson_summary',
      false,
      'coach-A'
    );
    expect(forCoachA).toBe('코치A 전용 프롬프트');
  });

  it('falls back to global active when coachId has no scoped template', async () => {
    const globalT = makeTemplate({
      target: 'lesson_summary',
      isActive: true,
      systemPrompt: '전역 기본 프롬프트',
    });
    storageService.savePromptTemplate(globalT);

    const forCoachB = await promptService.getActiveSystemPrompt(
      'lesson_summary',
      false,
      'coach-B'
    );
    expect(forCoachB).toBe('전역 기본 프롬프트');
  });

  it('falls back to BUILTIN when neither coach-scoped nor global active exists', async () => {
    const forCoachC = await promptService.getActiveSystemPrompt(
      'lesson_summary',
      false,
      'coach-C'
    );
    expect(forCoachC).toBe(BUILTIN_SYSTEM_PROMPTS.lesson_summary);
  });

  it('saving a coach-scoped active template does not deactivate the global one', async () => {
    const globalT = makeTemplate({
      target: 'lesson_summary',
      isActive: true,
      systemPrompt: '전역',
    });
    storageService.savePromptTemplate(globalT);

    const coachT = makeTemplate({
      target: 'lesson_summary',
      isActive: true,
      coachId: 'coach-A',
      systemPrompt: '코치A 전용',
    });
    storageService.savePromptTemplate(coachT);

    // Global still active for callers without coachId (and other coaches).
    const stillGlobal = await promptService.getActiveSystemPrompt('lesson_summary', false);
    expect(stillGlobal).toBe('전역');
    const otherCoach = await promptService.getActiveSystemPrompt(
      'lesson_summary',
      false,
      'coach-B'
    );
    expect(otherCoach).toBe('전역');
  });

  it('saving a coach-scoped active template deactivates other actives for the SAME coach+target', async () => {
    const first = makeTemplate({
      id: 'first',
      target: 'lesson_summary',
      isActive: true,
      coachId: 'coach-A',
      systemPrompt: '첫 번째 버전',
    });
    storageService.savePromptTemplate(first);

    const second = makeTemplate({
      id: 'second',
      target: 'lesson_summary',
      isActive: true,
      coachId: 'coach-A',
      systemPrompt: '두 번째 버전',
    });
    storageService.savePromptTemplate(second);

    const stored = storageService.getPromptTemplates();
    const firstStored = stored.find((t) => t.id === 'first');
    const secondStored = stored.find((t) => t.id === 'second');
    expect(firstStored?.isActive).toBe(false);
    expect(secondStored?.isActive).toBe(true);

    const active = await promptService.getActiveSystemPrompt(
      'lesson_summary',
      false,
      'coach-A'
    );
    expect(active).toBe('두 번째 버전');
  });

  it('activating a global template does not deactivate a coach-scoped active', async () => {
    const coachT = makeTemplate({
      id: 'coach-t',
      target: 'lesson_summary',
      isActive: true,
      coachId: 'coach-A',
      systemPrompt: '코치A 전용',
    });
    storageService.savePromptTemplate(coachT);

    const globalT = makeTemplate({
      id: 'global-t',
      target: 'lesson_summary',
      isActive: true,
      systemPrompt: '나중에 추가한 전역',
    });
    storageService.savePromptTemplate(globalT);

    const stored = storageService.getPromptTemplates();
    const coachStored = stored.find((t) => t.id === 'coach-t');
    expect(coachStored?.isActive).toBe(true);
  });
});
