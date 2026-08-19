import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { recordEventSafe } from '../services/events';
import {
  CONSENT_POLICY_VERSION,
  CONSENT_PURPOSES,
  grantConsent,
  isConsentPurpose,
  listConsents,
  revokeConsent,
} from '../services/consents';

/**
 * 목적별 동의 API (docs/DATA_ARCHITECTURE.md §8.2).
 *
 * 사용자는 자기 동의만 읽고 바꾼다. `service`는 가입 시 필수 처리라
 * 이 경로로 철회할 수 없다 — 서비스 해지와 같은 말이므로 탈퇴 절차가
 * 다루어야 한다.
 */

const router = Router();
router.use(authMiddleware);

/** 본인이 이 경로로 켜고 끌 수 있는 목적. */
const SELF_MANAGED = new Set(['ai_training', 'media_branch_share', 'marketing']);

// GET /api/consents — 내 동의 현황 + 현재 정책 버전.
router.get('/', async (req: Request, res: Response) => {
  try {
    const consents = await listConsents(req.user!.id);
    res.json({
      policyVersion: CONSENT_POLICY_VERSION,
      purposes: CONSENT_PURPOSES,
      consents,
    });
  } catch (err) {
    console.error('[consents] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/consents/:purpose  { granted: boolean, source?: string }
router.put('/:purpose', async (req: Request, res: Response) => {
  try {
    const { purpose } = req.params;
    if (!isConsentPurpose(purpose) || !SELF_MANAGED.has(purpose)) {
      res.status(400).json({ error: 'Unknown or non-self-managed purpose' });
      return;
    }
    const { granted, source } = req.body as {
      granted?: unknown;
      source?: unknown;
    };
    if (typeof granted !== 'boolean') {
      res.status(400).json({ error: 'granted (boolean) is required' });
      return;
    }

    const userId = req.user!.id;
    const userRole = req.user!.role;
    const resolvedSource =
      typeof source === 'string' && source.length <= 30 ? source : 'settings';

    if (granted) {
      await grantConsent(userId, userRole, purpose, resolvedSource);
    } else {
      await revokeConsent(userId, purpose);
    }

    // 동의 이력은 감사 대상이다 — 도메인 이벤트로도 남겨 추적 가능하게 한다.
    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: granted ? 'consent.granted' : 'consent.revoked',
      entityType: 'consent',
      entityId: `${userId}:${purpose}`,
      payload: { purpose, policyVersion: CONSENT_POLICY_VERSION, source: resolvedSource },
    });

    const consents = await listConsents(userId);
    res.json({ policyVersion: CONSENT_POLICY_VERSION, consents });
  } catch (err) {
    console.error('[consents] PUT /:purpose error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
