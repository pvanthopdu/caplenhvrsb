/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UserAccount,
  Vessel,
  CrewMember,
  TripRecord,
  UserRole,
  PortId,
  TripStatus,
} from '../types';

const LEGACY_STATUS_MAP: Record<string, TripStatus> = {
  DRAFT: 'NHAP',
  SUBMITTED: 'CHO_KIEM_TRA',
  PORT_INSPECTING: 'CHO_KIEM_TRA',
  PORT_REJECTED: 'TRA_CHU_TAU',
  PORT_APPROVED: 'CHO_SO_XU_LY',
  DEPT_PROCESSING: 'CHO_SO_XU_LY',
  PENDING_LEADER_APPROVAL: 'DANG_TRINH_OFFICE',
  APPROVED_ISSUED: 'DA_CAP_PHEP',
  UNDERWAY: 'DA_XUAT_BEN',
  COMPLETED: 'DA_CAP_BEN',
  EXPIRED: 'HET_HIEU_LUC',
  CANCELLED: 'DA_RUT',
  WEATHER_SUSPENDED: 'TAM_DUNG_THOI_TIET',
  BP_STOP_PROPOSED: 'CHO_SO_XU_LY',
  ORDER_SUSPENDED: 'TAM_GIU_BIEN_PHONG',
};

export function normalizeStatus(raw?: string): TripStatus {
  if (!raw) return 'NHAP';
  return LEGACY_STATUS_MAP[raw] || (raw as TripStatus);
}

/**
 * Lấy ID phương tiện duy nhất mà tài khoản Chủ tàu / Thuyền trưởng phụ trách.
 */
export function getCaptainAssignedVesselId(
  user: UserAccount,
  allVessels: Vessel[],
  allCrew: CrewMember[] = []
): string | undefined {
  if (user.role !== 'CAPTAIN') {
    return undefined;
  }

  if (user.assignedVesselIds && user.assignedVesselIds.length > 0) {
    const found = allVessels.find((v) => v.id === user.assignedVesselIds![0]);
    if (found) return found.id;
  }

  const cleanPhone = (user.phone || '').replace(/\D/g, '');
  if (cleanPhone) {
    const vPhone = allVessels.find(
      (v) => v.ownerPhone && v.ownerPhone.replace(/\D/g, '') === cleanPhone
    );
    if (vPhone) return vPhone.id;
  }

  const normName = (user.fullName || '').trim().toLowerCase();
  if (normName) {
    const vOwner = allVessels.find(
      (v) => v.ownerName && v.ownerName.toLowerCase().includes(normName)
    );
    if (vOwner) return vOwner.id;
  }

  if (allCrew.length > 0) {
    const crewMatch = allCrew.find(
      (c) =>
        c.assignedVesselId &&
        ((cleanPhone && c.phone && c.phone.replace(/\D/g, '') === cleanPhone) ||
          (c.fullName && c.fullName.trim().toLowerCase() === normName))
    );
    if (crewMatch?.assignedVesselId) {
      return crewMatch.assignedVesselId;
    }
  }

  return allVessels[0]?.id || 'VES-01';
}

/**
 * Lấy ID bến được phân công cho BQL_CANG hoặc BIEN_PHONG.
 */
export function getUserAssignedPortId(user?: UserAccount | null): PortId | undefined {
  if (!user) return undefined;
  if (user.assignedPortId) return user.assignedPortId;
  if (!['PORT_STAFF', 'BP_TRUC', 'BP_CHIHUY'].includes(user.role)) return undefined;
  const dept = (user.department || '').toLowerCase();
  const uname = (user.username || '').toLowerCase();
  if (dept.includes('đảo bé') || dept.includes('an bình') || uname.includes('daobe') || uname.includes('truc2') || uname.includes('chihuy2')) {
    return 'PORT-02';
  }
  if (dept.includes('đảo lớn') || dept.includes('lý sơn') || uname.includes('daolon') || uname.includes('truc1') || uname.includes('chihuy1')) {
    return 'PORT-01';
  }
  return 'PORT-01';
}

export function isTripAtAssignedDeparturePort(user: UserAccount, trip: TripRecord): boolean {
  if (!['PORT_STAFF', 'BP_TRUC', 'BP_CHIHUY'].includes(user.role)) return true;
  const assignedPort = getUserAssignedPortId(user);
  if (!assignedPort) return true;
  return trip.departurePortId === assignedPort;
}

export function isTripAtAssignedArrivalPort(user: UserAccount, trip: TripRecord): boolean {
  if (!['PORT_STAFF', 'BP_TRUC', 'BP_CHIHUY'].includes(user.role)) return true;
  const assignedPort = getUserAssignedPortId(user);
  if (!assignedPort) return true;
  return trip.arrivalPortId === assignedPort;
}

export function getUserAccessibleVesselIds(
  user: UserAccount,
  allVessels: Vessel[],
  allCrew: CrewMember[] = []
): string[] {
  if (user.role !== 'CAPTAIN') {
    return allVessels.map((v) => v.id);
  }
  const singleVesselId = getCaptainAssignedVesselId(user, allVessels, allCrew);
  return singleVesselId ? [singleVesselId] : [];
}

/**
 * Kiểm tra quyền xem hồ sơ:
 * - CAPTAIN: chỉ xem chuyến của đúng 1 tàu mình phụ trách
 * - Các vai trò cơ quan khác: xem tất cả hồ sơ (riêng thao tác nghiệp vụ kiểm tra/kiểm soát tại bến sẽ lọc theo assignedPortId)
 */
export function isTripAccessibleToUser(
  user: UserAccount,
  trip: TripRecord,
  accessibleVesselIds: string[]
): boolean {
  if (user.role !== 'CAPTAIN') {
    return true;
  }
  const myVesselId = accessibleVesselIds[0];
  if (!myVesselId) {
    return false;
  }
  return trip.vesselId === myVesselId;
}

/**
 * Kiểm tra hồ sơ cần xử lý gấp theo đúng nhiệm vụ của từng vai trò
 */
export function isUrgentTripForUserRole(
  userRole: UserRole,
  trip: TripRecord,
  _evalResult?: {
    activePhaseIndex: number;
    isPhaseOverdue: boolean;
    isTripOverdue: boolean;
  }
): boolean {
  void _evalResult;
  const status = normalizeStatus(trip.status);

  if (userRole === 'ADMIN') {
    return ![
      'NHAP',
      'KHONG_CHAP_THUAN',
      'THU_HOI',
      'HET_HIEU_LUC',
      'DA_RUT',
      'DA_CAP_BEN',
    ].includes(status);
  }

  switch (userRole) {
    case 'PORT_STAFF':
      return ['CHO_KIEM_TRA', 'TRA_BQL_CANG'].includes(status);

    case 'OFFICER':
      return [
        'DA_CHAP_THUAN',
        'CHO_SO_XU_LY',
        'DA_DUYET',
        'DANG_TRINH_OFFICE',
        'OFFICE_TRA_LAI',
        'TAM_DUNG_THOI_TIET',
      ].includes(status);

    case 'DEPT_HEAD':
      // Trưởng phòng theo dõi hồ sơ đang tạm giữ Biên phòng hoặc sắp quá hạn Sở 60p
      return ['TAM_GIU_BIEN_PHONG', 'CHO_SO_XU_LY', 'OFFICE_TRA_LAI'].includes(status);

    case 'LEADER':
      return false;

    case 'CAPTAIN':
      return status === 'TRA_CHU_TAU';

    case 'BP_CHIHUY':
    case 'BP_TRUC':
      return ['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG', 'DA_XUAT_BEN'].includes(status);

    default:
      return false;
  }
}
