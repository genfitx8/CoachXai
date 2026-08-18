import {
  Branch,
  BranchAdminAccount,
  Bay,
  BayPriceRule,
  BayReservation,
} from '../types';
import { apiService } from './apiService';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('branch');

const BRANCH_SYNC_FLAG = 'swingnote_branch_domain_synced_v1';

/**
 * Branch-domain persistence facade (docs/DATA_ARCHITECTURE.md Phase 1):
 * branches, branch-admin accounts, bays, price rules, bay reservations.
 *
 * Backend priority: server API → Firebase (legacy) → localStorage. Writes to
 * branch configuration require an admin or branch_admin token server-side;
 * unauthorized sync attempts are skipped, so devices holding stale copies
 * can never overwrite server state.
 */
class BranchService {
  private isApiMode(): boolean {
    return apiService.isAvailable() && !!apiService.getToken();
  }

  private isFirebaseMode(): boolean {
    return firebaseService.isInitialized();
  }

  /**
   * One-time promotion of this device's branch-domain data. Only succeeds
   * from a platform-admin session (server rejects other roles for config
   * writes) — which also migrates legacy plaintext branch-admin accounts:
   * the server hashes the password and stores no plaintext.
   */
  private localSyncPromise: Promise<void> | null = null;

  private syncLocalOnce(): Promise<void> {
    if (!this.localSyncPromise) {
      this.localSyncPromise = this.uploadLocalData().catch((e) => {
        log.warn('Local branch-domain sync failed; will retry on next read:', e);
        this.localSyncPromise = null;
      });
    }
    return this.localSyncPromise;
  }

  private async uploadLocalData(): Promise<void> {
    const token = apiService.getToken() ?? '';
    try {
      if (localStorage.getItem(BRANCH_SYNC_FLAG) === token) return;
    } catch {
      return;
    }
    let transient = false;
    const attempt = async (fn: () => Promise<void>, label: string): Promise<void> => {
      try {
        await fn();
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === undefined || status === 0 || status >= 500) transient = true;
        log.warn(`Skipping ${label} during branch-domain sync:`, e);
      }
    };

    for (const branch of storageService.getBranches()) {
      await attempt(() => apiService.saveBranch(branch), `branch ${branch.id}`);
    }
    for (const bay of storageService.getBays()) {
      await attempt(() => apiService.saveBay(bay), `bay ${bay.id}`);
    }
    for (const rule of storageService.getBayPriceRules()) {
      await attempt(() => apiService.saveBayPriceRule(rule), `price rule ${rule.id}`);
    }
    for (const account of storageService.getBranchAdminAccounts()) {
      await attempt(
        () => apiService.saveBranchAdminAccount(account),
        `branch admin ${account.id}`
      );
    }

    if (transient) throw new Error('transient branch-domain sync failure');
    try {
      localStorage.setItem(BRANCH_SYNC_FLAG, token);
    } catch { /* ignore */ }
  }

  // ── Branches ──────────────────────────────────────────────────────────────

  async getBranches(): Promise<Branch[]> {
    if (this.isApiMode()) {
      await this.syncLocalOnce();
      return apiService.getBranches();
    }
    if (this.isFirebaseMode()) return firebaseService.getBranches();
    return storageService.getBranches();
  }

  async saveBranch(branch: Branch): Promise<void> {
    if (this.isApiMode()) {
      await apiService.saveBranch(branch);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveBranch(branch);
      return;
    }
    storageService.saveBranch(branch);
  }

  /** Read-modify-write partial update (hours/holidays edits). */
  async updateBranch(branchId: string, fields: Partial<Omit<Branch, 'id'>>): Promise<void> {
    if (this.isApiMode()) {
      const branches = await apiService.getBranches();
      const current = branches.find((b) => b.id === branchId);
      if (!current) throw new Error('지점을 찾을 수 없습니다.');
      await apiService.saveBranch({ ...current, ...fields, id: branchId });
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.updateBranch(branchId, fields);
      return;
    }
    storageService.updateBranch(branchId, fields);
  }

  // ── Branch admin accounts ─────────────────────────────────────────────────

  async getBranchAdminAccounts(branchId?: string): Promise<BranchAdminAccount[]> {
    if (this.isApiMode()) {
      await this.syncLocalOnce();
      return apiService.getBranchAdminAccounts(branchId);
    }
    if (this.isFirebaseMode()) return firebaseService.getBranchAdminAccounts(branchId);
    return storageService.getBranchAdminAccounts(branchId);
  }

  async saveBranchAdminAccount(account: BranchAdminAccount): Promise<void> {
    if (this.isApiMode()) {
      await apiService.saveBranchAdminAccount(account);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveBranchAdminAccount(account);
      return;
    }
    storageService.saveBranchAdminAccount(account);
  }

  // ── Bays ──────────────────────────────────────────────────────────────────

  async getBays(branchId: string): Promise<Bay[]> {
    if (this.isApiMode()) {
      await this.syncLocalOnce();
      return apiService.getBays(branchId);
    }
    if (this.isFirebaseMode()) return firebaseService.getBays(branchId);
    return storageService.getBays(branchId);
  }

  async saveBay(bay: Bay): Promise<void> {
    if (this.isApiMode()) {
      await apiService.saveBay(bay);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveBay(bay);
      return;
    }
    storageService.saveBay(bay);
  }

  async updateBay(
    branchId: string,
    bayId: string,
    fields: Partial<Omit<Bay, 'id'>>
  ): Promise<void> {
    if (this.isApiMode()) {
      const bays = await apiService.getBays(branchId);
      const current = bays.find((b) => b.id === bayId);
      if (!current) throw new Error('타석을 찾을 수 없습니다.');
      await apiService.saveBay({ ...current, ...fields, id: bayId, branchId });
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.updateBay(bayId, fields);
      return;
    }
    storageService.updateBay(bayId, fields);
  }

  async deleteBay(branchId: string, bayId: string): Promise<void> {
    if (this.isApiMode()) {
      // Legacy backends soft-delete (isActive=false); mirror that so the
      // reservation history keeps resolving bay labels.
      await this.updateBay(branchId, bayId, { isActive: false });
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.deleteBay(bayId);
      return;
    }
    storageService.deleteBay(bayId);
  }

  // ── Price rules ───────────────────────────────────────────────────────────

  async getBayPriceRules(branchId: string): Promise<BayPriceRule[]> {
    if (this.isApiMode()) {
      await this.syncLocalOnce();
      return apiService.getBayPriceRules(branchId);
    }
    if (this.isFirebaseMode()) return firebaseService.getBayPriceRules(branchId);
    return storageService.getBayPriceRules(branchId);
  }

  async saveBayPriceRule(rule: BayPriceRule): Promise<void> {
    if (this.isApiMode()) {
      await apiService.saveBayPriceRule(rule);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveBayPriceRule(rule);
      return;
    }
    storageService.saveBayPriceRule(rule);
  }

  async deleteBayPriceRule(branchId: string, ruleId: string): Promise<void> {
    if (this.isApiMode()) {
      await apiService.deleteBayPriceRule(branchId, ruleId);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.deleteBayPriceRule(ruleId);
      return;
    }
    storageService.deleteBayPriceRule(ruleId);
  }

  // ── Bay reservations ──────────────────────────────────────────────────────

  async getBayReservationsByBranch(
    branchId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<BayReservation[]> {
    if (this.isApiMode()) {
      return apiService.getBayReservations({ branchId, dateFrom, dateTo });
    }
    if (this.isFirebaseMode()) {
      return firebaseService.getBayReservationsByBranch(branchId, dateFrom, dateTo);
    }
    return storageService.getBayReservationsByBranch(branchId, dateFrom, dateTo);
  }

  async getBayReservationsByClient(clientId: string): Promise<BayReservation[]> {
    if (this.isApiMode()) {
      const all = await apiService.getBayReservations();
      return all.filter((r) => r.clientId === clientId);
    }
    if (this.isFirebaseMode()) return firebaseService.getBayReservationsByClient(clientId);
    return storageService.getBayReservationsByClient(clientId);
  }

  async saveBayReservation(reservation: BayReservation): Promise<void> {
    if (this.isApiMode()) {
      await apiService.createBayReservation(reservation);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveBayReservation(reservation);
      return;
    }
    storageService.saveBayReservation(reservation);
  }

  async updateBayReservation(
    reservationId: string,
    fields: Partial<BayReservation>
  ): Promise<void> {
    if (this.isApiMode()) {
      await apiService.updateBayReservation(reservationId, fields);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.updateBayReservation(reservationId, fields);
      return;
    }
    storageService.updateBayReservation(reservationId, fields);
  }
}

export const branchService = new BranchService();
