import pool from './db';

export interface PaymentOrder {
  orderId: string;
  userId: string;
  amount: number;
  points: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  paymentKey?: string;
  orderType?: 'POINT_TOPUP' | 'MEMBERSHIP';
  role?: 'CLIENT' | 'COACH';
  planName?: string;
  membershipMonths?: number;
  createdAt: number;
  updatedAt: number;
}

function rowToOrder(row: Record<string, unknown>): PaymentOrder {
  return {
    orderId: row.order_id as string,
    userId: row.user_id as string,
    amount: row.amount as number,
    points: row.points as number,
    status: row.status as 'PENDING' | 'PAID' | 'FAILED',
    paymentKey: (row.payment_key as string | null) ?? undefined,
    orderType: (row.order_type as 'POINT_TOPUP' | 'MEMBERSHIP' | null) ?? undefined,
    role: (row.role as 'CLIENT' | 'COACH' | null) ?? undefined,
    planName: (row.plan_name as string | null) ?? undefined,
    membershipMonths: (row.membership_months as number | null) ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export const orderStorage = {
  async create(order: PaymentOrder): Promise<void> {
    await pool.query(
      `INSERT INTO payment_orders
        (order_id, user_id, amount, points, status, payment_key, order_type,
         role, plan_name, membership_months, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        order.orderId,
        order.userId,
        order.amount,
        order.points,
        order.status,
        order.paymentKey ?? null,
        order.orderType ?? null,
        order.role ?? null,
        order.planName ?? null,
        order.membershipMonths ?? null,
        order.createdAt,
        order.updatedAt,
      ]
    );
  },

  async findById(orderId: string): Promise<PaymentOrder | null> {
    const result = await pool.query(
      'SELECT * FROM payment_orders WHERE order_id = $1',
      [orderId]
    );
    return result.rows.length === 0 ? null : rowToOrder(result.rows[0]);
  },

  async update(orderId: string, patch: Partial<PaymentOrder>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const add = (col: string, val: unknown) => {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    };

    if (patch.status !== undefined) add('status', patch.status);
    if (patch.paymentKey !== undefined) add('payment_key', patch.paymentKey);
    if (patch.updatedAt !== undefined) add('updated_at', patch.updatedAt);
    if (patch.orderType !== undefined) add('order_type', patch.orderType);
    if (patch.role !== undefined) add('role', patch.role);
    if (patch.planName !== undefined) add('plan_name', patch.planName);
    if (patch.membershipMonths !== undefined) add('membership_months', patch.membershipMonths);

    if (fields.length === 0) return;

    values.push(orderId);
    await pool.query(
      `UPDATE payment_orders SET ${fields.join(', ')} WHERE order_id = $${idx}`,
      values
    );
  },
};
