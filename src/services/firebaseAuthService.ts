/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  OperationType,
  handleFirestoreError,
} from '../firebase';
import { UserAccount, UserRole } from '../types';
import { sessionManager } from './sessionManager';

export const SUPER_ADMIN_EMAIL = 'pvtho@pdu.edu.vn';
export const SUPER_ADMIN_EMAILS = ['pvtho@pdu.edu.vn', 'pvantho@gmail.com'] as const;

export function isSuperAdminEmail(email: string | undefined | null): boolean {
  const normalized = (email || '').trim().toLowerCase();
  return (SUPER_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

const VALID_ROLES: UserRole[] = [
  'UNASSIGNED',
  'ADMIN',
  'LEADER',
  'DEPT_HEAD',
  'OFFICER',
  'CLERK',
  'PORT_STAFF',
  'CAPTAIN',
  'DUTY_OFFICER',
  'VERIFIER',
  'BP_TRUC',
  'BP_CHIHUY',
];

const PORT_BOUND_ROLES: UserRole[] = ['PORT_STAFF', 'BP_TRUC', 'BP_CHIHUY'];

function sanitizeString(value: string | undefined | null, maxLen: number): string {
  return (value || '').trim().slice(0, maxLen);
}

function toIsoString(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof (val as any)?.toDate === 'function') {
    return (val as any).toDate().toISOString();
  }
  return undefined;
}

/**
 * Deterministic, collision-free document ID for `/gmail_invites/{inviteId}`.
 * Mirrors `emailToInviteId(email)` in `firestore.rules`.
 */
export function emailToInviteId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/_/g, '__')
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/\+/g, '_plus_');
}

export function isValidGmailInviteEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 5 || normalized.length > 120) return false;
  if (!/^[a-z0-9._+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(normalized)) return false;
  const inviteId = emailToInviteId(normalized);
  return inviteId.length > 0 && inviteId.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(inviteId);
}

export function mapFirestoreDocToUserAccount(
  id: string,
  data: Record<string, any>,
  isPreAssigned: boolean = false
): UserAccount {
  const rawEmail = sanitizeString(data.email, 200).toLowerCase();
  const rawRole = VALID_ROLES.includes(data.role) ? (data.role as UserRole) : 'UNASSIGNED';
  const status: 'ACTIVE' | 'LOCKED' = data.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE';

  return {
    id,
    uid: isPreAssigned ? '' : sanitizeString(data.uid || id, 128),
    username: rawEmail ? rawEmail.split('@')[0] : id,
    fullName: sanitizeString(data.fullName, 150) || rawEmail || 'Người dùng Gmail',
    email: rawEmail,
    avatar: sanitizeString(data.avatar, 500) || undefined,
    phone: sanitizeString(data.phone, 30),
    department: sanitizeString(data.department, 200) || 'Chưa phân công đơn vị',
    role: rawRole,
    status,
    isActive: status === 'ACTIVE',
    assignedVesselIds: Array.isArray(data.assignedVesselIds)
      ? data.assignedVesselIds.filter((v): v is string => typeof v === 'string').slice(0, 10)
      : undefined,
    assignedPortId:
      data.assignedPortId === 'PORT-01' || data.assignedPortId === 'PORT-02'
        ? data.assignedPortId
        : undefined,
    notes: sanitizeString(data.notes, 500) || undefined,
    assignedByEmail: sanitizeString(data.assignedByEmail, 200) || undefined,
    assignedAt: toIsoString(data.assignedAt),
    lastLogin: isPreAssigned ? undefined : toIsoString(data.lastLogin),
    createdAt: toIsoString(data.createdAt),
    isPreAssigned,
  };
}

export async function signInWithGmailPopup(): Promise<FirebaseUser> {
  sessionManager.beginInteractiveSignIn();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (!result.user.email || !result.user.emailVerified) {
      await signOut(auth);
      throw new Error('Tài khoản Google chưa có email xác thực hợp lệ.');
    }
    const idToken = await result.user.getIdToken(true);
    try {
      await sessionManager.createServerSession(idToken);
    } catch (sessionErr) {
      await signOut(auth).catch(() => {});
      throw sessionErr;
    }
    return result.user;
  } finally {
    sessionManager.endInteractiveSignIn();
  }
}

export async function signOutGmail(): Promise<void> {
  await signOut(auth);
}

async function fetchMatchingGmailInvite(
  email: string
): Promise<{ inviteId: string; data: Record<string, any> } | null> {
  if (!isValidGmailInviteEmail(email)) return null;
  const inviteId = emailToInviteId(email);
  try {
    const inviteSnap = await getDoc(doc(db, 'gmail_invites', inviteId));
    if (!inviteSnap.exists()) return null;
    const data = inviteSnap.data() as Record<string, any>;
    if (sanitizeString(data.email, 200).toLowerCase() !== email.trim().toLowerCase()) {
      return null;
    }
    return { inviteId, data };
  } catch (err) {
    console.warn('Could not read pre-assigned Gmail invite:', err);
    return null;
  }
}

export async function ensureUserProfileInFirestore(firebaseUser: FirebaseUser): Promise<UserAccount> {
  const uid = sanitizeString(firebaseUser.uid, 128);
  const email = sanitizeString(firebaseUser.email, 200).toLowerCase();
  const isSuperAdmin = isSuperAdminEmail(email) && firebaseUser.emailVerified;
  const userRef = doc(db, 'users', uid);
  const docPath = `users/${uid}`;

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  const nowIso = new Date().toISOString().slice(0, 64);
  const emailPrefix = email ? email.split('@')[0] : 'Người dùng Gmail';
  const displayName = sanitizeString(firebaseUser.displayName || emailPrefix, 150);
  const avatarUrl = sanitizeString(firebaseUser.photoURL, 500);

  if (!snap.exists()) {
    const matchedInvite = !isSuperAdmin ? await fetchMatchingGmailInvite(email) : null;

    if (matchedInvite) {
      const inv = matchedInvite.data;
      const inviteRole: UserRole = VALID_ROLES.includes(inv.role) ? (inv.role as UserRole) : 'UNASSIGNED';
      const inviteStatus: 'ACTIVE' | 'LOCKED' = inv.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE';
      const inviteVesselIds = Array.isArray(inv.assignedVesselIds)
        ? inv.assignedVesselIds.filter((v): v is string => typeof v === 'string').slice(0, 10)
        : [];
      const invitePortId =
        inv.assignedPortId === 'PORT-01' || inv.assignedPortId === 'PORT-02' ? inv.assignedPortId : '';
      const inviteFullName = sanitizeString(inv.fullName, 150);
      const resolvedFullName =
        inviteFullName && inviteFullName.toLowerCase() !== emailPrefix.toLowerCase()
          ? inviteFullName
          : displayName;

      const payload: Record<string, any> = {
        uid,
        email,
        fullName: resolvedFullName,
        avatar: avatarUrl,
        phone: sanitizeString(inv.phone, 30),
        department: sanitizeString(inv.department, 200) || 'Sở Xây dựng tỉnh Quảng Ngãi',
        role: inviteRole,
        status: inviteStatus,
        assignedVesselIds: inviteVesselIds,
        assignedPortId: invitePortId,
        notes: sanitizeString(inv.notes, 500),
        assignedByEmail: sanitizeString(inv.assignedByEmail, 200).toLowerCase(),
        assignedAt: sanitizeString(inv.assignedAt, 64) || nowIso,
        lastLogin: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        await setDoc(userRef, payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }

      // Consume the pre-assignment invite after profile creation succeeds
      await deleteDoc(doc(db, 'gmail_invites', matchedInvite.inviteId)).catch((err) => {
        console.warn('Could not clean up consumed Gmail invite:', err);
      });

      return mapFirestoreDocToUserAccount(uid, {
        ...payload,
        createdAt: nowIso,
      });
    }

    const initialRole: UserRole = isSuperAdmin ? 'ADMIN' : 'UNASSIGNED';
    const initialDept = isSuperAdmin
      ? 'Sở Xây dựng tỉnh Quảng Ngãi • Quản trị hệ thống VR-SB'
      : 'Chưa phân công đơn vị';

    const payload: Record<string, any> = {
      uid,
      email,
      fullName: displayName,
      avatar: avatarUrl,
      phone: '',
      department: sanitizeString(initialDept, 200),
      role: initialRole,
      status: 'ACTIVE',
      assignedVesselIds: [],
      assignedPortId: '',
      lastLogin: nowIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }

    return mapFirestoreDocToUserAccount(uid, {
      ...payload,
      createdAt: nowIso,
    });
  }

  const existingData = snap.data() as Record<string, any>;
  const updatePayload: Record<string, any> = {
    fullName: sanitizeString(existingData.fullName || displayName, 150),
    avatar: avatarUrl || sanitizeString(existingData.avatar, 500),
    lastLogin: nowIso,
    updatedAt: serverTimestamp(),
  };

  let consumedInviteId: string | null = null;

  if (isSuperAdmin && (existingData.role !== 'ADMIN' || existingData.status !== 'ACTIVE')) {
    updatePayload.role = 'ADMIN';
    updatePayload.status = 'ACTIVE';
    updatePayload.department = sanitizeString(
      existingData.department && existingData.department !== 'Chưa phân công đơn vị'
        ? existingData.department
        : 'Sở Xây dựng tỉnh Quảng Ngãi • Quản trị hệ thống VR-SB',
      200
    );
  } else if (!isSuperAdmin && existingData.role === 'UNASSIGNED') {
    // If admin pre-assigned this Gmail while user was waiting as UNASSIGNED, auto-apply on next sign-in/refresh
    const matchedInvite = await fetchMatchingGmailInvite(email);
    if (matchedInvite) {
      const inv = matchedInvite.data;
      const inviteRole: UserRole = VALID_ROLES.includes(inv.role) ? (inv.role as UserRole) : 'UNASSIGNED';
      const inviteStatus: 'ACTIVE' | 'LOCKED' = inv.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE';
      const inviteVesselIds = Array.isArray(inv.assignedVesselIds)
        ? inv.assignedVesselIds.filter((v): v is string => typeof v === 'string').slice(0, 10)
        : [];
      const invitePortId =
        inv.assignedPortId === 'PORT-01' || inv.assignedPortId === 'PORT-02' ? inv.assignedPortId : '';
      const inviteFullName = sanitizeString(inv.fullName, 150);

      updatePayload.role = inviteRole;
      updatePayload.status = inviteStatus;
      updatePayload.department = sanitizeString(inv.department, 200) || 'Sở Xây dựng tỉnh Quảng Ngãi';
      updatePayload.phone = sanitizeString(inv.phone || existingData.phone, 30);
      updatePayload.assignedVesselIds = inviteVesselIds;
      updatePayload.assignedPortId = invitePortId;
      updatePayload.notes = sanitizeString(inv.notes, 500);
      updatePayload.assignedByEmail = sanitizeString(inv.assignedByEmail, 200).toLowerCase();
      updatePayload.assignedAt = sanitizeString(inv.assignedAt, 64) || nowIso;
      if (inviteFullName && inviteFullName.toLowerCase() !== emailPrefix.toLowerCase()) {
        updatePayload.fullName = inviteFullName;
      }
      consumedInviteId = matchedInvite.inviteId;
    }
  }

  try {
    await updateDoc(userRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }

  if (consumedInviteId) {
    await deleteDoc(doc(db, 'gmail_invites', consumedInviteId)).catch((err) => {
      console.warn('Could not clean up consumed Gmail invite:', err);
    });
  }

  return mapFirestoreDocToUserAccount(uid, {
    ...existingData,
    ...updatePayload,
  });
}

export function subscribeCurrentUserProfile(
  uid: string,
  onProfile: (user: UserAccount | null) => void
): () => void {
  const cleanUid = sanitizeString(uid, 128);
  const docPath = `users/${cleanUid}`;
  const userRef = doc(db, 'users', cleanUid);

  return onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) {
        onProfile(null);
        return;
      }
      onProfile(mapFirestoreDocToUserAccount(snap.id, snap.data() as Record<string, any>));
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, docPath);
    }
  );
}

export function subscribeAllGmailUsers(
  currentAuthEmail: string | undefined,
  currentAuthUid: string,
  onUsers: (users: UserAccount[]) => void,
  onPermissionError?: (err: unknown) => void
): () => void {
  const isSuperAdmin = isSuperAdminEmail(currentAuthEmail);
  const usersCollection = collection(db, 'users');
  const q = isSuperAdmin
    ? usersCollection
    : query(usersCollection, where('uid', '==', currentAuthUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        mapFirestoreDocToUserAccount(d.id, d.data() as Record<string, any>, false)
      );
      // Sort: UNASSIGNED first so admin notices pending accounts immediately, then ADMIN, then newest
      list.sort((a, b) => {
        if (a.role === 'UNASSIGNED' && b.role !== 'UNASSIGNED') return -1;
        if (a.role !== 'UNASSIGNED' && b.role === 'UNASSIGNED') return 1;
        if (isSuperAdminEmail(a.email) && !isSuperAdminEmail(b.email)) return -1;
        if (!isSuperAdminEmail(a.email) && isSuperAdminEmail(b.email)) return 1;
        return (b.lastLogin || b.createdAt || '').localeCompare(a.lastLogin || a.createdAt || '');
      });
      onUsers(list);
    },
    (error) => {
      if (onPermissionError) {
        onPermissionError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    }
  );
}

export function subscribeAllGmailInvites(
  currentAuthEmail: string | undefined,
  onInvites: (invites: UserAccount[]) => void,
  onPermissionError?: (err: unknown) => void
): () => void {
  const isSuperAdmin = isSuperAdminEmail(currentAuthEmail);
  const normalizedEmail = sanitizeString(currentAuthEmail, 200).toLowerCase();
  const invitesCollection = collection(db, 'gmail_invites');
  const q = isSuperAdmin
    ? invitesCollection
    : query(invitesCollection, where('email', '==', normalizedEmail));

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        mapFirestoreDocToUserAccount(d.id, d.data() as Record<string, any>, true)
      );
      list.sort((a, b) => (b.assignedAt || b.createdAt || '').localeCompare(a.assignedAt || a.createdAt || ''));
      onInvites(list);
    },
    (error) => {
      if (onPermissionError) {
        onPermissionError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, 'gmail_invites');
      }
    }
  );
}

export async function assignUserPermissions(
  targetUid: string,
  updates: {
    role: UserRole;
    fullName: string;
    department: string;
    phone: string;
    assignedVesselIds?: string[];
    assignedPortId?: 'PORT-01' | 'PORT-02' | '';
    notes?: string;
    status?: 'ACTIVE' | 'LOCKED';
  },
  adminEmail: string
): Promise<void> {
  const cleanUid = sanitizeString(targetUid, 128);
  const docPath = `users/${cleanUid}`;
  const userRef = doc(db, 'users', cleanUid);

  const validRole = VALID_ROLES.includes(updates.role) ? updates.role : 'UNASSIGNED';
  const vesselIds =
    validRole === 'CAPTAIN' && Array.isArray(updates.assignedVesselIds)
      ? updates.assignedVesselIds.map((v) => sanitizeString(v, 64)).filter(Boolean).slice(0, 10)
      : [];
  const assignedPortId =
    PORT_BOUND_ROLES.includes(validRole) &&
    (updates.assignedPortId === 'PORT-01' || updates.assignedPortId === 'PORT-02')
      ? updates.assignedPortId
      : '';

  const payload: Record<string, any> = {
    role: validRole,
    fullName: sanitizeString(updates.fullName, 150) || 'Người dùng Gmail',
    department: sanitizeString(updates.department, 200) || 'Sở Xây dựng tỉnh Quảng Ngãi',
    phone: sanitizeString(updates.phone, 30),
    assignedVesselIds: vesselIds,
    assignedPortId,
    notes: sanitizeString(updates.notes, 500),
    status: updates.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
    assignedByEmail: sanitizeString(adminEmail, 200).toLowerCase(),
    assignedAt: new Date().toISOString().slice(0, 64),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function upsertGmailInvite(
  input: {
    email: string;
    role: UserRole;
    fullName?: string;
    department?: string;
    phone?: string;
    assignedVesselIds?: string[];
    assignedPortId?: 'PORT-01' | 'PORT-02' | '';
    notes?: string;
    status?: 'ACTIVE' | 'LOCKED';
  },
  adminEmail: string
): Promise<{ inviteId: string; isUpdate: boolean }> {
  const normalizedEmail = sanitizeString(input.email, 120).toLowerCase();
  if (!isValidGmailInviteEmail(normalizedEmail)) {
    throw new Error('Địa chỉ Gmail không hợp lệ. Vui lòng nhập đúng định dạng email (VD: tennguoidung@gmail.com).');
  }

  const inviteId = emailToInviteId(normalizedEmail);
  const docPath = `gmail_invites/${inviteId}`;
  const inviteRef = doc(db, 'gmail_invites', inviteId);

  const validRole = VALID_ROLES.includes(input.role) ? input.role : 'OFFICER';
  const vesselIds =
    validRole === 'CAPTAIN' && Array.isArray(input.assignedVesselIds)
      ? input.assignedVesselIds.map((v) => sanitizeString(v, 64)).filter(Boolean).slice(0, 10)
      : [];
  const assignedPortId =
    PORT_BOUND_ROLES.includes(validRole) &&
    (input.assignedPortId === 'PORT-01' || input.assignedPortId === 'PORT-02')
      ? input.assignedPortId
      : '';
  const defaultName = normalizedEmail.split('@')[0];
  const nowIso = new Date().toISOString().slice(0, 64);

  let existingSnap;
  try {
    existingSnap = await getDoc(inviteRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  const sharedFields: Record<string, any> = {
    fullName: sanitizeString(input.fullName, 150) || defaultName,
    phone: sanitizeString(input.phone, 30),
    department: sanitizeString(input.department, 200) || 'Sở Xây dựng tỉnh Quảng Ngãi',
    role: validRole,
    status: input.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
    assignedVesselIds: vesselIds,
    assignedPortId,
    notes: sanitizeString(input.notes, 500),
    assignedByEmail: sanitizeString(adminEmail, 200).toLowerCase() || SUPER_ADMIN_EMAIL,
    assignedAt: nowIso,
    updatedAt: serverTimestamp(),
  };

  if (existingSnap.exists()) {
    try {
      await updateDoc(inviteRef, sharedFields);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
    return { inviteId, isUpdate: true };
  }

  const createPayload: Record<string, any> = {
    id: inviteId,
    email: normalizedEmail,
    ...sharedFields,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(inviteRef, createPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }

  return { inviteId, isUpdate: false };
}

export async function toggleGmailUserStatus(
  targetUid: string,
  nextStatus: 'ACTIVE' | 'LOCKED'
): Promise<void> {
  const cleanUid = sanitizeString(targetUid, 128);
  const docPath = `users/${cleanUid}`;
  try {
    await updateDoc(doc(db, 'users', cleanUid), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function toggleGmailInviteStatus(
  inviteId: string,
  nextStatus: 'ACTIVE' | 'LOCKED'
): Promise<void> {
  const cleanId = sanitizeString(inviteId, 128);
  const docPath = `gmail_invites/${cleanId}`;
  try {
    await updateDoc(doc(db, 'gmail_invites', cleanId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteGmailUser(targetUid: string): Promise<void> {
  const cleanUid = sanitizeString(targetUid, 128);
  const docPath = `users/${cleanUid}`;
  try {
    await deleteDoc(doc(db, 'users', cleanUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function deleteGmailInvite(inviteId: string): Promise<void> {
  const cleanId = sanitizeString(inviteId, 128);
  const docPath = `gmail_invites/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'gmail_invites', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
