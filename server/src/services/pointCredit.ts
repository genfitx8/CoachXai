import crypto from 'crypto';

/**
 * Server-side point crediting after successful Toss payment.
 *
 * Strategy:
 *  1. If Firebase Admin is configured → write transaction + update client profile directly.
 *  2. Else → expose a trusted API endpoint that the client calls to apply the credit
 *     (see /api/payments/toss/apply-local-points). For local dev only.
 */

interface PointCreditResult {
  success: boolean;
  /** Set when Firebase updated server-side */
  serverSide?: boolean;
  /** Set when client must call /apply-local-points */
  requiresClientApply?: boolean;
  /** Pending token for local-only flow */
  applyToken?: string;
}

// In-memory store of pending "apply" tokens (local-dev fallback only)
// Maps token → { userId, points, orderId, expiresAt }
export const pendingApplyTokens = new Map<
  string,
  { userId: string; points: number; orderId: string; expiresAt: number }
>();

// ── Firebase Admin ──────────────────────────────────────────────────────────
let adminDb: FirebaseFirestore.Firestore | null = null;

async function getAdminDb(): Promise<FirebaseFirestore.Firestore | null> {
  if (adminDb) return adminDb;
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) return null;
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) return null;
    const admin = await import('firebase-admin');
    if (!admin.default.apps.length) {
      admin.default.initializeApp({
        credential: admin.default.credential.applicationDefault(),
        projectId,
      });
    }
    adminDb = admin.default.firestore();
    return adminDb;
  } catch {
    return null;
  }
}

export async function creditPoints(
  userId: string,
  points: number,
  orderId: string
): Promise<PointCreditResult> {
  const db = await getAdminDb();

  if (db) {
    // === Firebase path ===
    const admin = await import('firebase-admin');
    const now = Date.now();
    const transaction = {
      id: crypto.randomUUID(),
      clientId: userId,
      amount: points,
      type: 'POINT_TOPUP_TOSS',
      description: `토스페이먼츠 포인트 충전 (${orderId})`,
      createdAt: now,
    };

    // Write transaction record
    await db.collection('point_transactions').add(transaction);

    // Update client balance using a Firestore transaction for atomicity
    const clientsRef = db.collection('clients');
    const snapshot = await clientsRef.where('userId', '==', userId).limit(1).get();

    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        const current: number = doc.data()?.currentPoints ?? 0;
        t.update(docRef, { currentPoints: current + points });
      });
    }
    return { success: true, serverSide: true };
  }

  // === Local fallback path ===
  // Generate a short-lived single-use token that the client exchanges
  const token = crypto.randomUUID();
  const TTL_MS = 5 * 60 * 1000; // 5 minutes
  pendingApplyTokens.set(token, {
    userId,
    points,
    orderId,
    expiresAt: Date.now() + TTL_MS,
  });
  return { success: true, requiresClientApply: true, applyToken: token };
}
