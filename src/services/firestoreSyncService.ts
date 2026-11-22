/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User as FirebaseUser } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, OperationType, FirestoreErrorInfo } from '../firebase';
import { UserAccount } from '../types';
import { repository, REPOSITORY_STORAGE_KEYS } from './repository';
import { isSuperAdminEmail } from './firebaseAuthService';

export type SharedStateBucketId =
  | 'trips'
  | 'catalog'
  | 'operations'
  | 'config'
  | 'bp_records'
  | 'kpi'
  | 'audit_logs';

interface BucketDefinition {
  id: SharedStateBucketId;
  keys: Record<string, string>; // fieldName inside Firestore `data` map -> repository STORAGE_KEYS value
}

const SHARED_BUCKETS: readonly BucketDefinition[] = [
  {
    id: 'trips',
    keys: {
      trips: REPOSITORY_STORAGE_KEYS.TRIPS,
      incomingDossiers: REPOSITORY_STORAGE_KEYS.INCOMING_DOSSIERS,
      incomingConfig: REPOSITORY_STORAGE_KEYS.INCOMING_CONFIG,
      orderConfig: REPOSITORY_STORAGE_KEYS.ORDER_CONFIG,
    },
  },
  {
    id: 'catalog',
    keys: {
      vessels: REPOSITORY_STORAGE_KEYS.VESSELS,
      crew: REPOSITORY_STORAGE_KEYS.CREW,
      ports: REPOSITORY_STORAGE_KEYS.PORTS,
      routes: REPOSITORY_STORAGE_KEYS.ROUTES,
    },
  },
  {
    id: 'operations',
    keys: {
      weather: REPOSITORY_STORAGE_KEYS.WEATHER,
      shifts: REPOSITORY_STORAGE_KEYS.SHIFTS,
      notifications: REPOSITORY_STORAGE_KEYS.NOTIFICATIONS,
    },
  },
  {
    id: 'config',
    keys: {
      rules: REPOSITORY_STORAGE_KEYS.RULES,
      adminConfig: REPOSITORY_STORAGE_KEYS.ADMIN_CONFIG,
      bpConfig: REPOSITORY_STORAGE_KEYS.BP_CONFIG,
    },
  },
  {
    id: 'bp_records',
    keys: {
      bpDeNghiDung: REPOSITORY_STORAGE_KEYS.BP_DE_NGHI_DUNG,
      bpKiemSoat: REPOSITORY_STORAGE_KEYS.BP_KIEM_SOAT,
      bpAccessLogs: REPOSITORY_STORAGE_KEYS.BP_ACCESS_LOGS,
    },
  },
  {
    id: 'kpi',
    keys: {
      kpiEvents: REPOSITORY_STORAGE_KEYS.KPI_EVENTS,
      kpiExclusions: REPOSITORY_STORAGE_KEYS.KPI_EXCLUSIONS,
      kpiWarnings: REPOSITORY_STORAGE_KEYS.KPI_WARNINGS,
      kpiConfig: REPOSITORY_STORAGE_KEYS.KPI_CONFIG,
      kpiAuditLogs: REPOSITORY_STORAGE_KEYS.KPI_AUDIT_LOGS,
    },
  },
  {
    id: 'audit_logs',
    keys: {
      auditLogs: REPOSITORY_STORAGE_KEYS.AUDIT_LOGS,
    },
  },
];

const STORAGE_KEY_TO_BUCKET = new Map<string, SharedStateBucketId>();
const BUCKET_BY_ID = new Map<SharedStateBucketId, BucketDefinition>();
SHARED_BUCKETS.forEach((b) => {
  BUCKET_BY_ID.set(b.id, b);
  Object.values(b.keys).forEach((storageKey) => {
    STORAGE_KEY_TO_BUCKET.set(storageKey, b.id);
  });
});

const SCHEMA_VERSION = 1;
const WRITE_DEBOUNCE_MS = 220;
const MAX_INLINE_DATA_URL_CHARS = 80_000;
const MAX_QR_IMAGE_CHARS = 240_000;
const MAX_AUDIT_LOGS_SYNCED = 250;
const MAX_NOTIFICATIONS_SYNCED = 150;
const MAX_BP_ACCESS_LOGS_SYNCED = 250;

function logStructuredFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Sync Error: ', JSON.stringify(errInfo));
}

function sanitizeForFirestore(value: unknown, keyName = ''): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const maxLen =
      keyName === 'paymentQrImageUrl' ? MAX_QR_IMAGE_CHARS : MAX_INLINE_DATA_URL_CHARS;
    if (value.startsWith('data:') && value.length > maxLen) {
      // Omit oversized base64 previews from Firestore doc (files remain on serverUrl / IndexedDB)
      return '';
    }
    return value;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const cleaned = sanitizeForFirestore(item, keyName);
      if (cleaned !== undefined) {
        out.push(cleaned);
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = sanitizeForFirestore(v, k);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  return undefined;
}

class FirestoreSyncService {
  private activeUid: string | null = null;
  private activeEmail: string | null = null;
  private activeRole: UserAccount['role'] | null = null;
  private unsubscribers: Unsubscribe[] = [];
  private hydratedBuckets = new Set<SharedStateBucketId>();
  private bucketExistsMap = new Map<SharedStateBucketId, boolean>();
  private bucketRevisionMap = new Map<SharedStateBucketId, number>();
  private lastSentWriteId = new Map<SharedStateBucketId, string>();
  private pendingWriteTimers = new Map<SharedStateBucketId, number>();
  private pendingDirtyBeforeHydration = new Set<SharedStateBucketId>();
  private writeCounter = 0;
  private tabPrefix = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  private canWriteBucket(bucketId: SharedStateBucketId): boolean {
    if (!this.activeUid || !this.activeEmail || !this.activeRole) return false;
    if (this.activeRole === 'UNASSIGNED') return false;
    if (bucketId === 'config') {
      return (
        this.activeRole === 'ADMIN' ||
        this.activeRole === 'BP_CHIHUY' ||
        isSuperAdminEmail(this.activeEmail)
      );
    }
    return true;
  }

  private nextWriteId(bucketId: SharedStateBucketId): string {
    this.writeCounter += 1;
    return `${this.tabPrefix}-${bucketId}-${this.writeCounter}`.slice(0, 128);
  }

  private buildBucketData(bucketId: SharedStateBucketId): Record<string, unknown> {
    const def = BUCKET_BY_ID.get(bucketId);
    if (!def) return {};
    const payload: Record<string, unknown> = {};
    for (const [fieldName, storageKey] of Object.entries(def.keys)) {
      let rawVal = repository.getSyncedStorageValue(storageKey);
      if (rawVal === undefined) continue;

      if (storageKey === REPOSITORY_STORAGE_KEYS.AUDIT_LOGS && Array.isArray(rawVal)) {
        rawVal = rawVal.slice(0, MAX_AUDIT_LOGS_SYNCED);
      } else if (storageKey === REPOSITORY_STORAGE_KEYS.NOTIFICATIONS && Array.isArray(rawVal)) {
        rawVal = rawVal.slice(0, MAX_NOTIFICATIONS_SYNCED);
      } else if (storageKey === REPOSITORY_STORAGE_KEYS.BP_ACCESS_LOGS && Array.isArray(rawVal)) {
        rawVal = rawVal.slice(0, MAX_BP_ACCESS_LOGS_SYNCED);
      }

      const sanitized = sanitizeForFirestore(rawVal, fieldName);
      if (sanitized !== undefined) {
        payload[fieldName] = sanitized;
      }
    }
    return payload;
  }

  private applyBucketSnapshot(
    bucketId: SharedStateBucketId,
    remoteData: Record<string, unknown>
  ): void {
    const def = BUCKET_BY_ID.get(bucketId);
    if (!def || !remoteData || typeof remoteData !== 'object') return;

    const entries: Record<string, unknown> = {};
    for (const [fieldName, storageKey] of Object.entries(def.keys)) {
      if (Object.prototype.hasOwnProperty.call(remoteData, fieldName)) {
        entries[storageKey] = remoteData[fieldName];
      }
    }

    if (Object.keys(entries).length > 0) {
      repository.applyRemoteKeyValues(entries);
    }
  }

  private async pushBucketToFirestore(bucketId: SharedStateBucketId): Promise<void> {
    if (!this.canWriteBucket(bucketId)) return;
    const uid = this.activeUid;
    const email = this.activeEmail;
    if (!uid || !email) return;

    const docPath = `shared_state/${bucketId}`;
    const docRef = doc(db, 'shared_state', bucketId);
    const bucketData = this.buildBucketData(bucketId);
    if (Object.keys(bucketData).length === 0) return;

    const writeId = this.nextWriteId(bucketId);
    const currentRev = this.bucketRevisionMap.get(bucketId) || 0;
    const nextRev = Math.min(1_000_000_000, currentRev + 1);
    this.lastSentWriteId.set(bucketId, writeId);

    const updateFields = {
      schemaVersion: SCHEMA_VERSION,
      revision: nextRev,
      clientWriteId: writeId,
      updatedByUid: uid,
      updatedByEmail: email,
      data: bucketData,
      updatedAt: serverTimestamp(),
    };

    try {
      let existsOnServer = this.bucketExistsMap.get(bucketId) === true;
      if (!existsOnServer) {
        const snap = await getDoc(docRef);
        existsOnServer = snap.exists();
        if (existsOnServer) {
          const serverRev = Number(snap.data()?.revision || 0);
          if (Number.isFinite(serverRev) && serverRev >= nextRev) {
            updateFields.revision = Math.min(1_000_000_000, serverRev + 1);
          }
        }
      }

      if (existsOnServer) {
        try {
          await updateDoc(docRef, updateFields);
          this.bucketExistsMap.set(bucketId, true);
          this.bucketRevisionMap.set(bucketId, updateFields.revision);
          return;
        } catch (updateErr: any) {
          if (updateErr?.code !== 'not-found') {
            throw updateErr;
          }
        }
      }

      await setDoc(docRef, {
        bucketId,
        ...updateFields,
        createdAt: serverTimestamp(),
      });
      this.bucketExistsMap.set(bucketId, true);
      this.bucketRevisionMap.set(bucketId, updateFields.revision);
    } catch (error) {
      logStructuredFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  private scheduleBucketPush(bucketId: SharedStateBucketId): void {
    if (!this.canWriteBucket(bucketId)) return;

    if (!this.hydratedBuckets.has(bucketId)) {
      this.pendingDirtyBeforeHydration.add(bucketId);
      return;
    }

    const existingTimer = this.pendingWriteTimers.get(bucketId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
      this.pendingWriteTimers.delete(bucketId);
      void this.pushBucketToFirestore(bucketId);
    }, WRITE_DEBOUNCE_MS);

    this.pendingWriteTimers.set(bucketId, timerId);
  }

  public start(firebaseUser: FirebaseUser, profile: UserAccount): void {
    const uid = (firebaseUser.uid || '').trim();
    const email = (firebaseUser.email || '').trim().toLowerCase();
    if (!uid || !email || !firebaseUser.emailVerified) {
      this.stop();
      return;
    }
    if (profile.role === 'UNASSIGNED' || profile.status === 'LOCKED') {
      this.stop();
      return;
    }

    const alreadyActiveSameSession =
      this.activeUid === uid &&
      this.activeEmail === email &&
      this.activeRole === profile.role &&
      this.unsubscribers.length === SHARED_BUCKETS.length;

    if (alreadyActiveSameSession) {
      return;
    }

    this.stop();

    this.activeUid = uid;
    this.activeEmail = email;
    this.activeRole = profile.role;

    // Hook all local repository writes into debounced Firestore pushes
    repository.setStorageWriteHook((storageKey) => {
      const bucketId = STORAGE_KEY_TO_BUCKET.get(storageKey);
      if (bucketId) {
        this.scheduleBucketPush(bucketId);
      }
    });

    for (const bucket of SHARED_BUCKETS) {
      const docPath = `shared_state/${bucket.id}`;
      const docRef = doc(db, 'shared_state', bucket.id);

      const unsub = onSnapshot(
        docRef,
        (snap) => {
          const isFirstHydration = !this.hydratedBuckets.has(bucket.id);
          this.hydratedBuckets.add(bucket.id);

          if (!snap.exists()) {
            this.bucketExistsMap.set(bucket.id, false);
            this.bucketRevisionMap.set(bucket.id, 0);
            // Seed the initial shared state document in Firestore if this user is permitted to write it
            if (isFirstHydration && this.canWriteBucket(bucket.id)) {
              void this.pushBucketToFirestore(bucket.id);
            }
            this.pendingDirtyBeforeHydration.delete(bucket.id);
            return;
          }

          this.bucketExistsMap.set(bucket.id, true);
          const payload = snap.data() as Record<string, any>;
          const remoteRev = Number(payload?.revision || 0);
          if (Number.isFinite(remoteRev) && remoteRev > (this.bucketRevisionMap.get(bucket.id) || 0)) {
            this.bucketRevisionMap.set(bucket.id, remoteRev);
          }

          // Ignore our own local optimistic write or echo of the exact writeId we just sent
          const isSelfEcho =
            snap.metadata.hasPendingWrites ||
            (typeof payload?.clientWriteId === 'string' &&
              payload.clientWriteId === this.lastSentWriteId.get(bucket.id));

          if (!isSelfEcho && payload?.data && typeof payload.data === 'object') {
            this.applyBucketSnapshot(bucket.id, payload.data as Record<string, unknown>);
          }

          if (this.pendingDirtyBeforeHydration.has(bucket.id)) {
            this.pendingDirtyBeforeHydration.delete(bucket.id);
            if (!isFirstHydration) {
              this.scheduleBucketPush(bucket.id);
            }
          }
        },
        (error) => {
          logStructuredFirestoreError(error, OperationType.GET, docPath);
        }
      );

      this.unsubscribers.push(unsub);
    }
  }

  public stop(): void {
    repository.setStorageWriteHook(null);
    this.unsubscribers.forEach((u) => {
      try {
        u();
      } catch {
        // ignore
      }
    });
    this.unsubscribers = [];
    this.pendingWriteTimers.forEach((timerId) => window.clearTimeout(timerId));
    this.pendingWriteTimers.clear();
    this.pendingDirtyBeforeHydration.clear();
    this.hydratedBuckets.clear();
    this.bucketExistsMap.clear();
    this.bucketRevisionMap.clear();
    this.lastSentWriteId.clear();
    this.activeUid = null;
    this.activeEmail = null;
    this.activeRole = null;
  }
}

export const firestoreSyncService = new FirestoreSyncService();
