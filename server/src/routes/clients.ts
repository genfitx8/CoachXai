import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { sendToUser } from '../services/fcm';

const router = Router();

router.use(authMiddleware);

function mapClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    coachId: row.coach_id,
    designatedCoach: row.designated_coach,
    // The student's own 자기소개/목표. Written only through PUT /me; the
    // coach sees it read-only for context.
    memo: row.memo,
    currentPoints: row.current_points,
    isSubscribed: row.is_subscribed,
    subscriptionPlan: row.subscription_plan,
    subscriptionEndDate: row.subscription_end_date,
    pushToken: row.push_token,
    // Redesign 7a handover trail (#309): previous coaches the student has
    // worked with. Populated automatically when coach_id changes; the
    // client uses this to render the "코치 이력" block in the passport
    // (6f) and to feed the future 인수인계 요약 endpoint.
    previousCoachIds: (row.previous_coach_ids as string[] | null) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Coach/admin view of a member: everything the student sees, plus the
 * coach's private note.
 *
 * `coachMemo` is deliberately absent from `mapClient` so it cannot leak
 * through a student-facing response by accident — the student-facing
 * routes (GET/PUT /me, and the signup/login payloads in auth.ts) use the
 * plain mapper, and only the coach-scoped routes reach for this one.
 */
function mapClientForCoach(row: Record<string, unknown>) {
  return { ...mapClient(row), coachMemo: row.coach_memo };
}

// GET /api/clients/me — client fetches their own profile
router.get('/me', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.user!.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.json({ client: mapClient(result.rows[0]) });
  } catch (err) {
    console.error('[clients] GET /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/me — client updates their own profile (including coach assignment)
router.put('/me', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const clientId = req.user!.id;

    const {
      name,
      email,
      phone,
      coachId,
      designatedCoach,
      memo,
      pushToken,
    } = req.body as Record<string, unknown>;

    // If coachId is provided (and not null), validate that the coach exists
    // and resolve their name for `designated_coach` consistency.
    let resolvedCoachId: string | null | undefined = undefined;
    let resolvedDesignatedCoach: string | null | undefined = undefined;

    if (coachId === null) {
      // Client is un-assigning their coach.
      resolvedCoachId = null;
      resolvedDesignatedCoach = null;
    } else if (typeof coachId === 'string' && coachId.length > 0) {
      const coach = await pool.query(
        'SELECT id, name FROM coaches WHERE id = $1',
        [coachId]
      );
      if (coach.rows.length === 0) {
        res.status(400).json({ error: 'Coach not found' });
        return;
      }
      resolvedCoachId = coach.rows[0].id as string;
      resolvedDesignatedCoach =
        typeof designatedCoach === 'string' && designatedCoach.length > 0
          ? designatedCoach
          : (coach.rows[0].name as string);
    } else if (typeof designatedCoach === 'string') {
      // Coach name provided without a coachId — allow the caller to clear
      // the display name without touching coach_id.
      resolvedDesignatedCoach = designatedCoach;
    }

    // Snapshot the outgoing coach_id (pre-update) so we can tell a genuinely
    // new designation apart from a no-op re-save and only notify the coach
    // on real changes.
    let previousCoachId: string | null = null;
    if (typeof resolvedCoachId === 'string') {
      const current = await pool.query(
        'SELECT coach_id FROM clients WHERE id = $1',
        [clientId]
      );
      previousCoachId = (current.rows[0]?.coach_id as string | null) ?? null;
    }

    const now = Date.now();

    const result = await pool.query(
      `UPDATE clients SET
        name             = COALESCE($1, name),
        email            = COALESCE($2, email),
        phone            = COALESCE($3, phone),
        coach_id         = CASE WHEN $4::boolean THEN $5::uuid ELSE coach_id END,
        designated_coach = CASE WHEN $6::boolean THEN $7 ELSE designated_coach END,
        -- 7a handover trail: when the student picks a new coach, push the
        -- outgoing coach_id onto previous_coach_ids. The CASE evaluates
        -- against the OLD coach_id (pre-update), and DISTINCT FROM guards
        -- against a no-op change appending a duplicate row.
        previous_coach_ids = CASE
          WHEN $4::boolean
            AND coach_id IS NOT NULL
            AND coach_id IS DISTINCT FROM $5::uuid
          THEN array_append(COALESCE(previous_coach_ids, ARRAY[]::uuid[]), coach_id)
          ELSE previous_coach_ids
        END,
        push_token       = COALESCE($8, push_token),
        -- The student's own bio. coach_memo is intentionally not writable
        -- here: it is the coach's private note about this student.
        memo             = CASE WHEN $9::boolean THEN $10 ELSE memo END,
        updated_at       = $11
      WHERE id = $12
      RETURNING *`,
      [
        typeof name === 'string' ? name : null,
        typeof email === 'string' ? email : null,
        typeof phone === 'string' ? phone : null,
        resolvedCoachId !== undefined,
        resolvedCoachId ?? null,
        resolvedDesignatedCoach !== undefined,
        resolvedDesignatedCoach ?? null,
        typeof pushToken === 'string' ? pushToken : null,
        // Only touch memo when the caller sent one, so a partial patch
        // (e.g. the invite flow's coachId-only PUT) doesn't wipe the bio.
        typeof memo === 'string',
        typeof memo === 'string' ? memo : null,
        now,
        clientId,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const updated = result.rows[0];

    // The student just designated a new coach: push a notification to that
    // coach's devices so their member list updates without waiting for the
    // next app open. Fire-and-forget — the assignment itself already
    // succeeded, so a push failure must not fail the request. The coach app
    // additionally polls GET /api/clients, so web (no FCM) still catches up.
    if (
      typeof resolvedCoachId === 'string' &&
      previousCoachId !== resolvedCoachId
    ) {
      const studentName = (updated.name as string | null) ?? '새 회원';
      sendToUser(resolvedCoachId, 'coach', {
        title: `${studentName}님이 회원으로 등록되었어요`,
        body: '학생 앱에서 코치로 지정했습니다. 학생 목록에서 확인해 보세요.',
        data: {
          type: 'MEMBER_LINKED',
          clientId: String(updated.id),
        },
      }).catch((pushErr) => {
        console.error('[clients] member-linked push failed:', pushErr);
      });
    }

    res.json({ client: mapClient(updated) });
  } catch (err) {
    console.error('[clients] PUT /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients
router.get('/', async (req: Request, res: Response) => {
  try {
    // Admin console reads the whole member table; coaches stay scoped to
    // the members assigned to them.
    //
    // 내 회원 = 가입한 학생이 나를 담당 코치로 지정한 회원 — and designating a
    // coach (PUT /me) requires a signed-in student account, so every real
    // 내 회원 row has a password_hash. Rows without one are legacy phantoms:
    // the removed POST / route minted them with coach_id = the calling coach,
    // and the old local-cache upward sync stamped whole cached member tables
    // (admin/demo/other accounts) onto whichever coach signed in next. Those
    // rows are still in the table, so without this guard they flood every
    // coach-side member surface (학생 탭, 레슨 동반 학생 선택, 스윙 검색)
    // with members that were never the coach's. A phantom that later signs
    // up gains a password_hash via the signup merge and reappears here.
    const result =
      req.user!.role === 'admin'
        ? await pool.query('SELECT * FROM clients ORDER BY created_at DESC')
        : await pool.query(
            `SELECT * FROM clients
              WHERE coach_id = $1
                AND password_hash IS NOT NULL
              ORDER BY created_at DESC`,
            [req.user!.id]
          );
    // Coach/admin surface — carries coachMemo, which GET /me never does.
    res.json({ clients: result.rows.map(mapClientForCoach) });
  } catch (err) {
    console.error('[clients] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients — permanently removed.
//
// This used to back the coach app's "새 회원 등록" form: it INSERTed a member
// row with coach_id = the calling coach, i.e. it linked a member to a coach
// without the student ever signing up or designating anyone. Old builds still
// in the field (and the former local-cache sync, which POSTed any cached row
// lacking a server id) could therefore mint phantom password-less members
// that showed up in a coach's 회원 목록 the moment they signed in.
//
// The only way a member exists is POST /api/auth/signup/client, and the only
// way they become a coach's 회원 is the student designating that coach
// (PUT /api/clients/me). 410 tells lingering callers this write is gone for
// good instead of silently creating data.
router.post('/', (_req: Request, res: Response) => {
  res.status(410).json({
    error:
      '회원은 학생 앱에서 직접 가입하고 담당 코치를 지정해야 등록됩니다. 코치가 회원을 생성하는 기능은 제거되었습니다.',
  });
});

// PUT /api/clients/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND coach_id = $2',
      [id, coachId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Client not found or access denied' });
      return;
    }

    const {
      name,
      email,
      phone,
      coachId: newCoachId,
      designatedCoach,
      currentPoints,
      isSubscribed,
      subscriptionPlan,
      subscriptionEndDate,
      pushToken,
      coachMemo,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    // Only touch coach_id when the caller explicitly included it in the body,
    // so the common "coach edits a client" flow keeps ownership intact.
    const coachIdProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'coachId');
    const nextCoachId =
      typeof newCoachId === 'string' && newCoachId.length > 0 ? newCoachId : null;

    const result = await pool.query(
      `UPDATE clients SET
        name = COALESCE($1, name),
        email = $2,
        phone = $3,
        coach_id = CASE WHEN $4::boolean THEN $5::uuid ELSE coach_id END,
        designated_coach = $6,
        current_points = COALESCE($7, current_points),
        is_subscribed = COALESCE($8, is_subscribed),
        subscription_plan = COALESCE($9, subscription_plan),
        subscription_end_date = $10,
        push_token = $11,
        -- The coach's private note. memo (the student's own bio) is not
        -- writable here — the coach app must not overwrite what the student
        -- wrote about themselves.
        coach_memo = CASE WHEN $12::boolean THEN $13 ELSE coach_memo END,
        updated_at = $14
      WHERE id = $15 AND coach_id = $16
      RETURNING *`,
      [
        name ?? null,
        email ?? null,
        phone ?? null,
        coachIdProvided,
        nextCoachId,
        designatedCoach ?? null,
        currentPoints ?? null,
        isSubscribed ?? null,
        subscriptionPlan ?? null,
        subscriptionEndDate ?? null,
        pushToken ?? null,
        typeof coachMemo === 'string',
        typeof coachMemo === 'string' ? coachMemo : null,
        now,
        id,
        coachId,
      ]
    );

    res.json(mapClientForCoach(result.rows[0]));
  } catch (err) {
    console.error('[clients] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM clients WHERE id = $1 AND coach_id = $2 RETURNING id',
      [id, coachId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found or access denied' });
      return;
    }

    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[clients] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
