import * as fs from 'fs';
import * as path from 'path';

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

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'payment_orders.json');

// Ensure data directory and file exist
function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf-8');
  }
}

function readOrders(): PaymentOrder[] {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as PaymentOrder[];
  } catch (err) {
    console.error('[orderStorage] Failed to parse payment_orders.json:', err);
    return [];
  }
}

function writeOrders(orders: PaymentOrder[]): void {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf-8');
}

// ── Firebase Admin (optional) ──────────────────────────────────────────────
let adminDb: FirebaseFirestore.Firestore | null = null;

async function getAdminDb(): Promise<FirebaseFirestore.Firestore | null> {
  if (adminDb) return adminDb;
  try {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) return null;

    const admin = await import('firebase-admin');
    if (!admin.default.apps.length) {
      if (serviceAccountPath) {
        admin.default.initializeApp({
          credential: admin.default.credential.applicationDefault(),
          projectId,
        });
      } else {
        // Running without service account – skip Firebase
        return null;
      }
    }
    adminDb = admin.default.firestore();
    return adminDb;
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
export const orderStorage = {
  async create(order: PaymentOrder): Promise<void> {
    const db = await getAdminDb();
    if (db) {
      await db.collection('payment_orders').doc(order.orderId).set(order);
    } else {
      const orders = readOrders();
      orders.push(order);
      writeOrders(orders);
    }
  },

  async findById(orderId: string): Promise<PaymentOrder | null> {
    const db = await getAdminDb();
    if (db) {
      const doc = await db.collection('payment_orders').doc(orderId).get();
      return doc.exists ? (doc.data() as PaymentOrder) : null;
    }
    const orders = readOrders();
    return orders.find((o) => o.orderId === orderId) ?? null;
  },

  async update(orderId: string, patch: Partial<PaymentOrder>): Promise<void> {
    const db = await getAdminDb();
    if (db) {
      await db.collection('payment_orders').doc(orderId).update(patch);
    } else {
      const orders = readOrders();
      const idx = orders.findIndex((o) => o.orderId === orderId);
      if (idx !== -1) {
        orders[idx] = { ...orders[idx], ...patch };
        writeOrders(orders);
      }
    }
  },
};
