import crypto from 'crypto';

interface MembershipCreditResult {
  success: boolean;
  requiresClientApply: boolean;
  applyToken: string;
}

export const pendingMembershipApplyTokens = new Map<
  string,
  {
    userId: string;
    role: 'CLIENT' | 'COACH';
    planName: string;
    membershipMonths: number;
    orderId: string;
    expiresAt: number;
  }
>();

/**
 * Membership entitlement is applied on the client side for now.
 * This keeps the flow compatible for local mode and Firebase mode.
 */
export async function creditMembership(
  userId: string,
  role: 'CLIENT' | 'COACH',
  planName: string,
  membershipMonths: number,
  orderId: string
): Promise<MembershipCreditResult> {
  const token = crypto.randomUUID();
  const TTL_MS = 5 * 60 * 1000;

  pendingMembershipApplyTokens.set(token, {
    userId,
    role,
    planName,
    membershipMonths,
    orderId,
    expiresAt: Date.now() + TTL_MS,
  });

  return {
    success: true,
    requiresClientApply: true,
    applyToken: token,
  };
}
