/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CrewMember,
  TripRecord,
  TripStatus,
  UserAccount,
  Vessel,
} from '../types';
import {
  getUserAccessibleVesselIds,
  getUserAssignedPortId,
  isTripAccessibleToUser,
  normalizeStatus,
} from './userPermissions';

/**
 * Định nghĩa bộ trạng thái chuẩn dùng chung toàn hệ thống
 * Đảm bảo số liệu đồng nhất tuyệt đối giữa Bảng điều khiển, Thanh điều hướng (Sidebar)
 * và từng trang chức năng nghiệp vụ.
 */
export const BQL_QUEUE_STATUSES: readonly TripStatus[] = [
  'CHO_KIEM_TRA',
  'TRA_BQL_CANG',
];

export const DEPT_PROCESSING_STATUSES: readonly TripStatus[] = [
  'DA_CHAP_THUAN',
  'CHO_SO_XU_LY',
  'DA_DUYET',
  'DANG_TRINH_OFFICE',
  'OFFICE_TRA_LAI',
  'TAM_DUNG_THOI_TIET',
];

export const OFFICE_TRACKING_QUEUE_STATUSES: readonly TripStatus[] = [
  'DA_DUYET',
  'DANG_TRINH_OFFICE',
  'OFFICE_TRA_LAI',
];

export const BP_WAIT_CONTROL_STATUSES: readonly TripStatus[] = [
  'DA_CAP_PHEP',
  'TAM_GIU_BIEN_PHONG',
];

export const UNDERWAY_STATUSES: readonly TripStatus[] = ['DA_XUAT_BEN'];

export const COMPLETED_STATUSES: readonly TripStatus[] = ['DA_CAP_BEN'];

export function isBqlQueueStatus(rawStatus?: string): boolean {
  return BQL_QUEUE_STATUSES.includes(normalizeStatus(rawStatus));
}

export function isDeptProcessingStatus(rawStatus?: string): boolean {
  return DEPT_PROCESSING_STATUSES.includes(normalizeStatus(rawStatus));
}

export function isOfficeTrackingQueueStatus(rawStatus?: string): boolean {
  return OFFICE_TRACKING_QUEUE_STATUSES.includes(normalizeStatus(rawStatus));
}

export function isBpWaitControlStatus(rawStatus?: string): boolean {
  return BP_WAIT_CONTROL_STATUSES.includes(normalizeStatus(rawStatus));
}

/**
 * Phạm vi hồ sơ mà tài khoản đang đăng nhập được phép nhìn thấy/thống kê
 * Đồng nhất giữa Sidebar, Dashboard và Danh sách hồ sơ.
 */
export function getScopedTripsForUser(
  user: UserAccount,
  allTrips: TripRecord[],
  vessels: Vessel[],
  crewCatalog: CrewMember[]
): TripRecord[] {
  if (user.role === 'CAPTAIN') {
    const accessibleVesselIds = getUserAccessibleVesselIds(user, vessels, crewCatalog);
    return allTrips.filter((t) => isTripAccessibleToUser(user, t, accessibleVesselIds));
  }
  const assignedPort = getUserAssignedPortId(user);
  if (['PORT_STAFF', 'BP_TRUC', 'BP_CHIHUY'].includes(user.role) && assignedPort) {
    return allTrips.filter(
      (t) => t.departurePortId === assignedPort || t.arrivalPortId === assignedPort
    );
  }
  return allTrips;
}
