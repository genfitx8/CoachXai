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

/**
 * "같은 사람"을 가리키는 키 — 숫자만 남긴 번호 + 공백 없는 이름.
 *
 * 010-1234-5678 과 01012345678, "김 회원"과 "김회원"은 한 사람이다. 번호가
 * 없는 행은 서로 다른 사람을 합칠 위험이 있으므로 id로 각자 고유한 키를 준다.
 * 코치 목록의 중복 접기와 관리자 정리 보고서가 이 하나의 규칙을 나눠 쓴다
 * (프런트의 utils/clientRoster.ts 도 같은 규칙).
 */
const identityKeySql = (alias: string) => `
      CASE
        WHEN REGEXP_REPLACE(COALESCE(${alias}.phone, ''), '[^0-9]', '', 'g') <> ''
          THEN REGEXP_REPLACE(COALESCE(${alias}.phone, ''), '[^0-9]', '', 'g')
               || '|' || LOWER(REGEXP_REPLACE(${alias}.name, '[[:space:]]', '', 'g'))
        ELSE 'id:' || ${alias}.id::text
      END`;

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
    //
    // 한 사람은 한 행으로. 위의 잔재 행 말고도, 같은 사람이 번호 표기만
    // 달리해(010-1234-5678 / 01012345678) 여러 번 가입해 남은 행이 있고,
    // 그것들이 코치 화면(특히 레슨 중 동반의 학생 선택)에서 "같은 이름·같은
    // 번호"가 수십 줄 반복되는 목록을 만든다. 숫자만 남긴 번호 + 공백 없는
    // 이름을 사람의 신원으로 보고, 그중 가장 최근에 갱신된 행 하나만 내려준다.
    // 번호가 없는 행은 서로 다른 사람을 합칠 위험이 있으므로 id를 키로 삼아
    // 절대 합치지 않는다. (관리자 콘솔은 정리 대상 원본을 봐야 하므로 그대로.)
    const result =
      req.user!.role === 'admin'
        ? await pool.query('SELECT * FROM clients ORDER BY created_at DESC')
        : await pool.query(
            `SELECT * FROM (
               SELECT DISTINCT ON (identity_key) *
                 FROM (
                   SELECT c.*, (${identityKeySql('c')}) AS identity_key
                     FROM clients c
                    WHERE c.coach_id = $1
                      AND c.password_hash IS NOT NULL
                 ) scoped
                ORDER BY identity_key, updated_at DESC NULLS LAST, created_at DESC
             ) deduped
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

// ─── 중복 · 유령 회원 정리 (관리자 전용) ──────────────────────────────────────
//
// 코치 화면은 이제 목록을 사람 단위로 접어 보여주므로 잔재 행이 눈에 띄지
// 않지만, 행 자체는 clients 테이블에 그대로 남아 있다(레슨 중 동반 전체 학생
// 433명 건 — 사라진 상향 동기화가 앱을 켤 때마다 같은 회원을 새 행으로
// 찍어 둔 흔적). 관리자 콘솔에서 그 잔재를 눈으로 확인하고 지울 수 있게
// 하는 두 엔드포인트다. 삭제는 되돌릴 수 없으므로 "지워도 아무것도 잃지
// 않는 행"인지 서버가 지우기 직전에 다시 판정한다.

/**
 * 회원 id를 참조하는 테이블 목록 — 스키마에서 직접 읽는다.
 *
 * client_id를 가진 테이블이 나중에 늘어도 정리 판정이 그 테이블을 자동으로
 * 함께 살피도록. (레슨은 client_id 말고 이름+번호로도 매칭되지만, 그쪽은
 * 살아남는 행이 그대로 이어받으므로 잔재 행을 지워도 끊기지 않는다.)
 */
let referencingTablesCache: string[] | null = null;
async function referencingTables(): Promise<string[]> {
  if (referencingTablesCache) return referencingTablesCache;
  const result = await pool.query(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'client_id'
      ORDER BY table_name`
  );
  referencingTablesCache = result.rows.map((row) => row.table_name as string);
  return referencingTablesCache;
}

/** 이 회원 행에 매달린 데이터 건수를 세는 SQL 조각. */
function referenceCountSql(tables: string[], alias: string): string {
  if (tables.length === 0) return '0';
  return tables
    .map(
      (table) =>
        `(SELECT COUNT(*) FROM "${table}" ref WHERE ref.client_id::text = ${alias}.id::text)`
    )
    .join(' + ');
}

interface CleanupRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  coach_id: string | null;
  designated_coach: string | null;
  signed_up: boolean;
  created_at: string | number;
  updated_at: string | number;
  identity_key: string;
  reference_count: string | number;
}

/** 회원 전체를 신원 키 · 가입 여부 · 참조 건수와 함께 읽는다. */
async function loadCleanupRows(): Promise<CleanupRow[]> {
  const tables = await referencingTables();
  const result = await pool.query(
    `SELECT c.id,
            c.name,
            c.phone,
            c.email,
            c.coach_id,
            c.designated_coach,
            c.password_hash IS NOT NULL AS signed_up,
            c.created_at,
            c.updated_at,
            (${identityKeySql('c')}) AS identity_key,
            (${referenceCountSql(tables, 'c')}) AS reference_count
       FROM clients c
      ORDER BY c.created_at ASC`
  );
  return result.rows as CleanupRow[];
}

const groupByIdentity = (rows: CleanupRow[]): Map<string, CleanupRow[]> => {
  const groups = new Map<string, CleanupRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.identity_key);
    if (bucket) bucket.push(row);
    else groups.set(row.identity_key, [row]);
  }
  return groups;
};

/**
 * 한 사람을 대표해 남길 행: 로그인 계정이 있는 행이 먼저, 그다음 데이터가
 * 많이 매달린 행, 그다음 최근에 갱신된 행. 보고서와 삭제가 같은 규칙을 쓴다.
 */
const keepRowOf = (rows: CleanupRow[]): CleanupRow =>
  [...rows].sort((a, b) => {
    if (a.signed_up !== b.signed_up) return a.signed_up ? -1 : 1;
    const refDiff = Number(b.reference_count) - Number(a.reference_count);
    if (refDiff !== 0) return refDiff;
    return Number(b.updated_at) - Number(a.updated_at);
  })[0];

/**
 * 이 행을 지워도 잃는 것이 없는가.
 *
 * 세 가지는 절대 지우지 않는다 — 로그인할 수 있는 계정, 레슨·예약·포인트 등
 * 데이터가 매달린 행, 그리고 그 사람을 대표해 남길 한 줄.
 */
const removalVerdict = (
  row: CleanupRow,
  keep: CleanupRow
): { removable: boolean; reason: string | null } => {
  if (row.id === keep.id) return { removable: false, reason: '이 사람을 대표할 행' };
  if (row.signed_up) return { removable: false, reason: '로그인 계정이 있는 회원' };
  const refCount = Number(row.reference_count);
  if (refCount > 0) return { removable: false, reason: `연결된 데이터 ${refCount}건` };
  return { removable: true, reason: null };
};

/**
 * GET /api/clients/duplicates — 정리 후보 보고서 (관리자 전용).
 *
 * 같은 사람이 여러 행으로 남은 묶음과 가입 흔적이 없는 유령 행을 돌려준다.
 * 각 행에 남길 행인지(keep), 지워도 되는지(removable), 안 되면 왜인지가 붙는다.
 */
router.get('/duplicates', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const rows = await loadCleanupRows();
    const groups = groupByIdentity(rows);

    const report = [];
    let removableTotal = 0;
    let phantomTotal = 0;

    for (const [identityKey, members] of groups) {
      const phantoms = members.filter((m) => !m.signed_up);
      phantomTotal += phantoms.length;
      // 볼 이유가 있는 묶음만 — 같은 사람이 여러 줄이거나, 가입 흔적이 없거나.
      if (members.length === 1 && phantoms.length === 0) continue;

      const keep = keepRowOf(members);
      const mapped = members.map((row) => {
        const verdict = removalVerdict(row, keep);
        if (verdict.removable) removableTotal += 1;
        return {
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          coachId: row.coach_id,
          designatedCoach: row.designated_coach,
          signedUp: row.signed_up,
          referenceCount: Number(row.reference_count),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
          keep: row.id === keep.id,
          removable: verdict.removable,
          blockedReason: verdict.reason,
        };
      });

      report.push({
        identityKey,
        name: keep.name,
        phone: keep.phone,
        removableCount: mapped.filter((m) => m.removable).length,
        members: mapped,
      });
    }

    // 지울 게 많은 묶음부터 — 433줄짜리 잔재가 맨 위로 온다.
    report.sort(
      (a, b) => b.removableCount - a.removableCount || b.members.length - a.members.length
    );

    res.json({
      totalClients: rows.length,
      phantomTotal,
      removableTotal,
      groups: report,
    });
  } catch (err) {
    console.error('[clients] GET /duplicates error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/cleanup — 정리 실행 (관리자 전용).
 *
 * body: { ids: string[] } — 화면에서 고른 행만, 또는 { all: true } — 보고서가
 * 지울 수 있다고 표시한 행 전부.
 *
 * 화면이 보낸 목록을 그대로 믿지 않는다. 지우기 직전에 서버가 같은 규칙으로
 * 다시 판정해서, 그 사이 학생이 가입했거나 레슨이 붙은 행은 건너뛰고 이유를
 * 함께 돌려준다.
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { ids, all } = req.body as { ids?: unknown; all?: unknown };
    const requestedIds = new Set(
      Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : []
    );

    if (all !== true && requestedIds.size === 0) {
      res.status(400).json({ error: 'ids (배열) 또는 all: true 가 필요합니다.' });
      return;
    }

    const rows = await loadCleanupRows();
    const groups = groupByIdentity(rows);

    const deletable: string[] = [];
    const skipped: { id: string; name: string; reason: string }[] = [];

    for (const members of groups.values()) {
      const keep = keepRowOf(members);
      for (const row of members) {
        if (all !== true && !requestedIds.has(row.id)) continue;
        const verdict = removalVerdict(row, keep);
        if (verdict.removable) deletable.push(row.id);
        else if (all !== true) {
          // 하나씩 고른 요청에만 이유를 돌려준다 — 일괄 정리는 애초에
          // 지울 수 있는 행만 대상으로 하므로 나머지는 잡음이다.
          skipped.push({ id: row.id, name: row.name, reason: verdict.reason as string });
        }
      }
    }

    const known = new Set(rows.map((row) => row.id));
    for (const id of requestedIds) {
      if (!known.has(id)) skipped.push({ id, name: '', reason: '이미 없는 회원' });
    }

    let deleted = 0;
    if (deletable.length > 0) {
      // password_hash 조건을 한 번 더 — 판정과 삭제 사이에 학생이 가입했다면
      // 그 행은 이 DELETE를 통과하지 못한다.
      const result = await pool.query(
        `DELETE FROM clients
          WHERE id::text = ANY($1::text[])
            AND password_hash IS NULL
          RETURNING id`,
        [deletable]
      );
      deleted = result.rows.length;
      console.log(`[clients] admin cleanup removed ${deleted} phantom member row(s)`);
    }

    res.json({ deleted, deletedIds: deletable, skipped });
  } catch (err) {
    console.error('[clients] POST /cleanup error:', err);
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
