/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AnyTripStatusInput,
  ReturnEditScope,
  ReturnSourceParty,
  TripRecord,
  TripStatus,
  UserRole,
} from '../types';
import { normalizeStatus } from './userPermissions';

export function normalizeTripStatus(raw?: AnyTripStatusInput | string): TripStatus {
  return normalizeStatus(raw);
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '---';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateTimeString?: string): string {
  if (!dateTimeString) return '---';
  try {
    const d = new Date(dateTimeString);
    if (isNaN(d.getTime())) return dateTimeString;
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateTimeString;
  }
}

export function formatTime(timeString?: string): string {
  if (!timeString) return '---';
  try {
    const d = new Date(timeString);
    if (isNaN(d.getTime())) {
      return timeString.includes('T') ? timeString.split('T')[1].slice(0, 5) : timeString;
    }
    return d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timeString;
  }
}

export function formatClockDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '0 phút';
  const whole = Math.floor(minutes);
  const secs = Math.round((minutes - whole) * 60);
  if (whole >= 60) {
    const h = Math.floor(whole / 60);
    const m = whole % 60;
    return `${h}g ${String(m).padStart(2, '0')}p`;
  }
  return secs > 0 && whole < 5 ? `${whole}p ${secs}s` : `${whole} phút`;
}

export function maskIdNumber(idNumber?: string): string {
  if (!idNumber) return '---';
  if (idNumber.length <= 4) return idNumber;
  const start = idNumber.slice(0, 3);
  const end = idNumber.slice(-3);
  return `${start}******${end}`;
}

export function maskPhone(phone?: string): string {
  if (!phone) return '---';
  if (phone.length <= 4) return phone;
  const start = phone.slice(0, 4);
  const end = phone.slice(-3);
  return `${start}***${end}`;
}

export function maskFullNameInitials(fullName?: string): string {
  if (!fullName) return '---';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '---';
  const first = parts[0];
  const rest = parts.slice(1).map((p) => `${p.charAt(0).toUpperCase()}.`).join(' ');
  return `${first} ${rest}`;
}

export const BP_STOP_REASON_OPTIONS: Array<{
  value: import('../types').BpStopReasonCode;
  label: string;
}> = [
  { value: 'an_ninh_trat_tu', label: 'An ninh, trật tự tại bến / trên tuyến' },
  { value: 'nghi_buon_lau_gian_lan_thuong_mai', label: 'Nghi vấn buôn lậu, gian lận thương mại' },
  {
    value: 'nguoi_dang_bi_truy_tim_hoac_cam_xuat_canh',
    label: 'Có người đang bị truy tìm hoặc cấm xuất cảnh',
  },
  { value: 'so_nguoi_thuc_te_khac_danh_sach', label: 'Số người thực tế khác danh sách khai báo' },
  { value: 'vi_pham_an_toan_giao_thong', label: 'Vi phạm an toàn giao thông đường thủy' },
  { value: 'thoi_tiet_bien_dong', label: 'Thời tiết biển động, nguy cơ mất an toàn' },
  { value: 'khac', label: 'Lý do khác theo chức năng nhiệm vụ' },
];

export function getBpStopReasonLabel(code?: string): string {
  if (!code) return 'Chưa xác định';
  const found = BP_STOP_REASON_OPTIONS.find((o) => o.value === code);
  return found ? found.label : code;
}

export function getReturnPartyLabel(party?: ReturnSourceParty | string): string {
  switch (party) {
    case 'BQL_CANG':
      return 'Ban Quản lý Cảng';
    case 'CHUYEN_VIEN':
      return 'Chuyên viên Sở Xây dựng';
    case 'BIEN_PHONG':
      return 'Đồn Biên phòng (Kiểm soát xuất bến)';
    case 'TRUONG_PHONG':
      return 'Trưởng phòng ATGT (Office)';
    case 'LANH_DAO_SO':
      return 'Lãnh đạo Sở (Office)';
    default:
      return party || 'Cơ quan chức năng';
  }
}

export function getReturnScopeLabel(scope?: ReturnEditScope | string): string {
  switch (scope) {
    case 'sua_thong_tin_chung':
      return 'Sửa thông tin chuyến / giờ chạy / hàng hóa';
    case 'sua_thuyen_vien':
      return 'Sửa danh sách thuyền viên & chứng chỉ';
    case 'sua_hanh_khach':
      return 'Sửa danh sách hành khách';
    case 'bo_sung_chung_tu':
      return 'Bổ sung chứng từ đính kèm / chứng từ phí';
    case 'sua_toan_bo':
      return 'Chỉnh sửa toàn bộ hồ sơ';
    default:
      return 'Chỉnh sửa và bổ sung theo lý do trả lại';
  }
}

export function getStatusMilestoneLabel(milestone?: string): string {
  switch (milestone) {
    case 'BP_DE_NGHI_DUNG':
    case 'BP_TAM_GIU':
      return 'BP_TAM_GIU (Biên phòng tạm giữ sau cấp phép)';
    case 'BP_GO_DE_NGHI':
      return 'BP_GO_TAM_GIU (Biên phòng gỡ tạm giữ)';
    case 'BP_KIEM_SOAT':
      return 'BP_KIEM_SOAT (Kiểm soát cuối cùng tại bến)';
    case 'BP_CHO_XUAT_BEN':
      return 'BP_CHO_XUAT_BEN (Biên phòng cho xuất bến)';
    case 'BP_TRA_R12':
      return 'BP_TRA_R12 (Trả chủ tàu do vi phạm R12)';
    case 'XAC_NHAN_CAP_BEN':
      return 'XAC_NHAN_CAP_BEN (Xác nhận đã cập bến an toàn)';
    case 'OFFICE_TRINH':
      return 'OFFICE_TRINH (Đã trình ký trên Office)';
    case 'OFFICE_TRA_LAI':
      return 'OFFICE_TRA_LAI (Office trả lại chỉnh sửa)';
    case 'OFFICE_PHAT_HANH':
      return 'OFFICE_PHAT_HANH (Tải Giấy phép có dấu đỏ lên app)';
    case 'THU_HOI_GP':
      return 'THU_HOI_GP (Thu hồi Giấy phép rời cảng)';
    default:
      return milestone || '';
  }
}

export function getStatusInfo(rawStatus: AnyTripStatusInput | string): {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  description: string;
} {
  const status = normalizeTripStatus(rawStatus);
  switch (status) {
    case 'NHAP':
      return {
        label: 'Nháp',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-300',
        description: 'Hồ sơ đang soạn thảo, chưa nộp lên hệ thống',
      };
    case 'CHO_KIEM_TRA':
      return {
        label: 'Chờ BQL Cảng kiểm tra',
        badgeBg: 'bg-blue-50',
        badgeText: 'text-blue-700',
        badgeBorder: 'border-blue-200',
        description: 'Chủ tàu đã nộp hồ sơ & chứng từ phí; BQL Cảng đang kiểm tra thực tế (SLA 60 phút)',
      };
    case 'TRA_CHU_TAU':
      return {
        label: 'Trả Chủ tàu bổ sung',
        badgeBg: 'bg-rose-50',
        badgeText: 'text-rose-700',
        badgeBorder: 'border-rose-300',
        description: 'Hồ sơ bị trả lại để Chủ tàu chỉnh sửa và nộp lại',
      };
    case 'KHONG_CHAP_THUAN':
      return {
        label: 'Không chấp thuận',
        badgeBg: 'bg-red-100',
        badgeText: 'text-red-800',
        badgeBorder: 'border-red-300',
        description: 'BQL Cảng kết luận không đủ điều kiện an toàn và đóng hồ sơ',
      };
    case 'DA_CHAP_THUAN':
      return {
        label: 'BQL Cảng đã chấp thuận',
        badgeBg: 'bg-emerald-50',
        badgeText: 'text-emerald-700',
        badgeBorder: 'border-emerald-200',
        description: 'BQL Cảng đã cấp Thông báo chấp thuận và chuyển sang Sở Xây dựng',
      };
    case 'CHO_SO_XU_LY':
      return {
        label: 'Chờ Sở xử lý',
        badgeBg: 'bg-indigo-50',
        badgeText: 'text-indigo-700',
        badgeBorder: 'border-indigo-200',
        description: 'Chuyên viên Sở đang kiểm tra thời tiết, đối chiếu hồ sơ & duyệt dự thảo (SLA 60 phút)',
      };
    case 'TRA_BQL_CANG':
      return {
        label: 'Sở trả lại BQL Cảng',
        badgeBg: 'bg-amber-50',
        badgeText: 'text-amber-800',
        badgeBorder: 'border-amber-300',
        description: 'Chuyên viên Sở trả lại BQL Cảng do sai lệch biên bản kiểm tra / thông báo',
      };
    case 'TAM_DUNG_THOI_TIET':
      return {
        label: 'Tạm dừng do thời tiết',
        badgeBg: 'bg-purple-50',
        badgeText: 'text-purple-800',
        badgeBorder: 'border-purple-300',
        description: 'Hồ sơ tạm dừng vì thời tiết vượt ngưỡng hoặc tạm dừng toàn tuyến',
      };
    case 'DA_DUYET':
      return {
        label: 'Đã duyệt dự thảo',
        badgeBg: 'bg-cyan-50',
        badgeText: 'text-cyan-800',
        badgeBorder: 'border-cyan-300',
        description: 'Chuyên viên đã duyệt dự thảo, sẵn sàng xuất Word/PDF để trình ký trên Office',
      };
    case 'DANG_TRINH_OFFICE':
      return {
        label: 'Đang trình ký Office',
        badgeBg: 'bg-orange-50',
        badgeText: 'text-orange-700',
        badgeBorder: 'border-orange-300',
        description: 'Đã trình ký trên hệ thống quản lý văn bản Office; chờ tải Giấy phép có dấu đỏ lên app',
      };
    case 'OFFICE_TRA_LAI':
      return {
        label: 'Office trả lại',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-900',
        badgeBorder: 'border-amber-400',
        description: 'Trưởng phòng hoặc Lãnh đạo Sở trả lại trên Office để Chuyên viên xử lý lại',
      };
    case 'DA_CAP_PHEP':
      return {
        label: 'Đã cấp Giấy phép',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800',
        badgeBorder: 'border-emerald-400',
        description: 'Đã tải Giấy phép có dấu đỏ lên ứng dụng (Hiệu lực 24h) • Chờ Biên phòng kiểm soát cuối cùng',
      };
    case 'THU_HOI':
      return {
        label: 'Đã thu hồi Giấy phép',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-900',
        badgeBorder: 'border-rose-400',
        description: 'Giấy phép rời cảng đã bị thu hồi hiệu lực',
      };
    case 'HET_HIEU_LUC':
      return {
        label: 'Hết hiệu lực (>24h)',
        badgeBg: 'bg-red-50',
        badgeText: 'text-red-700',
        badgeBorder: 'border-red-300',
        description: 'Quá 24 giờ kể từ lúc cấp Giấy phép mà tàu chưa xuất bến',
      };
    case 'DA_RUT':
      return {
        label: 'Đã rút hồ sơ',
        badgeBg: 'bg-zinc-100',
        badgeText: 'text-zinc-700',
        badgeBorder: 'border-zinc-300',
        description: 'Chủ tàu đã rút hồ sơ trước khi cấp Giấy phép',
      };
    case 'TAM_GIU_BIEN_PHONG':
      return {
        label: 'Biên phòng tạm giữ',
        badgeBg: 'bg-red-100',
        badgeText: 'text-red-900',
        badgeBorder: 'border-red-500',
        description: 'Biên phòng tạm giữ / đình chỉ xuất bến do phát hiện bất thường tại bến',
      };
    case 'DA_XUAT_BEN':
      return {
        label: 'Đã xuất bến',
        badgeBg: 'bg-sky-100',
        badgeText: 'text-sky-800',
        badgeBorder: 'border-sky-400',
        description: 'Biên phòng đã kiểm soát cuối cùng và cho tàu xuất bến hành trình',
      };
    case 'DA_CAP_BEN':
      return {
        label: 'Đã cập bến',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-800',
        badgeBorder: 'border-slate-400',
        description: 'Tàu đã cập bến đích an toàn, hoàn thành chuyến đi',
      };
    default:
      return {
        label: status,
        badgeBg: 'bg-slate-50',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-200',
        description: '',
      };
  }
}

export interface RoleTripStatusInfo {
  statusKey: string;
  label: string;
  subLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  description: string;
  isMyActionRequired: boolean;
  actionLabel?: string;
  actionPage?: string;
}

/**
 * Xác định bước quy trình hiện tại (0..6):
 * 0 = NHAP/DA_RUT/KHONG_CHAP_THUAN
 * 1 = CHO_KIEM_TRA / TRA_CHU_TAU / TRA_BQL_CANG (tại BQL)
 * 2 = DA_CHAP_THUAN / CHO_SO_XU_LY / TAM_DUNG_THOI_TIET / OFFICE_TRA_LAI
 * 3 = DA_DUYET / DANG_TRINH_OFFICE
 * 4 = DA_CAP_PHEP / TAM_GIU_BIEN_PHONG (chờ Biên phòng kiểm soát xuất bến)
 * 5 = DA_XUAT_BEN
 * 6 = DA_CAP_BEN / HET_HIEU_LUC / THU_HOI
 */
export function getActiveInternalPhaseIndex(trip: TripRecord): number {
  const status = normalizeTripStatus(trip.status);
  switch (status) {
    case 'NHAP':
    case 'DA_RUT':
    case 'KHONG_CHAP_THUAN':
      return 0;
    case 'CHO_KIEM_TRA':
    case 'TRA_CHU_TAU':
    case 'TRA_BQL_CANG':
      return 1;
    case 'DA_CHAP_THUAN':
    case 'CHO_SO_XU_LY':
    case 'TAM_DUNG_THOI_TIET':
    case 'OFFICE_TRA_LAI':
      return 2;
    case 'DA_DUYET':
    case 'DANG_TRINH_OFFICE':
      return 3;
    case 'DA_CAP_PHEP':
    case 'TAM_GIU_BIEN_PHONG':
      return 4;
    case 'DA_XUAT_BEN':
      return 5;
    case 'DA_CAP_BEN':
    case 'HET_HIEU_LUC':
    case 'THU_HOI':
      return 6;
    default:
      return 0;
  }
}

export function isReturnedByDepartment(trip: TripRecord): boolean {
  const status = normalizeTripStatus(trip.status);
  if (status === 'TRA_BQL_CANG' || status === 'OFFICE_TRA_LAI') return true;
  if (status !== 'TRA_CHU_TAU') return false;
  return trip.lastReturnInfo?.benTra === 'CHUYEN_VIEN';
}

export function getRejectedOriginLabel(trip: TripRecord): string {
  if (trip.lastReturnInfo?.benTra) {
    return getReturnPartyLabel(trip.lastReturnInfo.benTra);
  }
  if (trip.rejectedByRole === 'OFFICER') return 'Chuyên viên Sở Xây dựng';
  if (trip.rejectedByRole === 'BP_TRUC' || trip.rejectedByRole === 'BP_CHIHUY') {
    return 'Đồn Biên phòng';
  }
  return 'Ban Quản lý Cảng';
}

export function getRoleTripStatusInfo(trip: TripRecord, userRole: UserRole): RoleTripStatusInfo {
  const status = normalizeTripStatus(trip.status);
  const info = getStatusInfo(status);
  const returnOrigin = getRejectedOriginLabel(trip);

  if (status === 'DA_CAP_BEN') {
    return {
      statusKey: 'DA_CAP_BEN',
      label: 'Đã cập bến',
      subLabel: 'Hoàn thành chuyến an toàn',
      badgeBg: info.badgeBg,
      badgeText: info.badgeText,
      badgeBorder: info.badgeBorder,
      description: info.description,
      isMyActionRequired: false,
    };
  }

  if (status === 'HET_HIEU_LUC' || status === 'THU_HOI' || status === 'DA_RUT' || status === 'KHONG_CHAP_THUAN') {
    return {
      statusKey: status,
      label: info.label,
      subLabel: info.description,
      badgeBg: info.badgeBg,
      badgeText: info.badgeText,
      badgeBorder: info.badgeBorder,
      description: info.description,
      isMyActionRequired: false,
    };
  }

  if (status === 'TAM_GIU_BIEN_PHONG') {
    return {
      statusKey: 'TAM_GIU_BIEN_PHONG',
      label: userRole === 'CAPTAIN' ? 'Tạm giữ / Đình chỉ xuất bến' : 'Biên phòng tạm giữ',
      subLabel:
        userRole === 'CAPTAIN'
          ? 'Tàu tạm dừng xuất bến theo kiểm soát của lực lượng Biên phòng'
          : 'Phát hiện bất thường sau cấp phép — QR báo Tạm đình chỉ',
      badgeBg: info.badgeBg,
      badgeText: info.badgeText,
      badgeBorder: info.badgeBorder,
      description: info.description,
      isMyActionRequired: userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY',
      actionLabel: userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY' ? 'Xử lý / Gỡ tạm giữ' : undefined,
      actionPage: userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY' ? 'bp-daily-trips' : undefined,
    };
  }

  if (status === 'DA_XUAT_BEN') {
    const canConfirmArrival =
      userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY' || userRole === 'PORT_STAFF';
    return {
      statusKey: 'DA_XUAT_BEN',
      label: 'Đã xuất bến (Đang hành trình)',
      subLabel: canConfirmArrival
        ? 'Chờ bến đến xác nhận Đã cập bến'
        : 'Tàu đã qua kiểm soát Biên phòng và rời bến',
      badgeBg: info.badgeBg,
      badgeText: info.badgeText,
      badgeBorder: info.badgeBorder,
      description: info.description,
      isMyActionRequired: userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY',
      actionLabel: userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY' ? 'Xác nhận cập bến' : undefined,
      actionPage: userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY' ? 'bp-daily-trips' : undefined,
    };
  }

  switch (userRole) {
    case 'CAPTAIN': {
      if (status === 'NHAP') {
        return {
          statusKey: 'NHAP',
          label: 'Bản nháp',
          subLabel: 'Hoàn thiện biểu mẫu & chứng từ phí để nộp',
          badgeBg: info.badgeBg,
          badgeText: info.badgeText,
          badgeBorder: info.badgeBorder,
          description: info.description,
          isMyActionRequired: true,
          actionLabel: 'Tiếp tục khai',
          actionPage: 'create-trip',
        };
      }
      if (status === 'TRA_CHU_TAU') {
        return {
          statusKey: 'TRA_CHU_TAU',
          label: `Bị trả lại từ ${returnOrigin}`,
          subLabel: trip.lastReturnInfo?.lyDo || trip.rejectReason || 'Cần chỉnh sửa & nộp lại',
          badgeBg: 'bg-rose-100',
          badgeText: 'text-rose-900',
          badgeBorder: 'border-rose-400',
          description: `Trả lại từ ${returnOrigin}. Vui lòng sửa theo phạm vi yêu cầu và nộp lại.`,
          isMyActionRequired: true,
          actionLabel: 'Sửa & Nộp lại',
          actionPage: 'create-trip',
        };
      }
      if (status === 'DA_CAP_PHEP') {
        return {
          statusKey: 'DA_CAP_PHEP',
          label: 'Đã có Giấy phép rời cảng',
          subLabel: 'Trình mã QR cho Biên phòng kiểm soát cuối cùng để xuất bến',
          badgeBg: info.badgeBg,
          badgeText: info.badgeText,
          badgeBorder: info.badgeBorder,
          description: 'Đã nhận Giấy phép PDF & mã QR. Chờ Biên phòng kiểm soát tại bến cho xuất bến.',
          isMyActionRequired: false,
        };
      }
      return {
        statusKey: status,
        label: info.label,
        subLabel: info.description,
        badgeBg: info.badgeBg,
        badgeText: info.badgeText,
        badgeBorder: info.badgeBorder,
        description: info.description,
        isMyActionRequired: false,
      };
    }

    case 'PORT_STAFF': {
      if (status === 'CHO_KIEM_TRA' || status === 'TRA_BQL_CANG') {
        return {
          statusKey: status,
          label: status === 'TRA_BQL_CANG' ? 'Sở trả lại BQL Cảng' : 'Chờ BQL Cảng kiểm tra',
          subLabel:
            status === 'TRA_BQL_CANG'
              ? trip.lastReturnInfo?.lyDo || 'Chuyên viên Sở yêu cầu rà soát lại'
              : 'Kiểm tra chứng từ phí, tàu thực tế & cấp Thông báo chấp thuận',
          badgeBg: 'bg-blue-100',
          badgeText: 'text-blue-900',
          badgeBorder: 'border-blue-400',
          description: info.description,
          isMyActionRequired: true,
          actionLabel: status === 'TRA_BQL_CANG' ? 'Rà soát & Gửi lại Sở' : 'Kiểm tra tại bến',
          actionPage: 'port-inspect',
        };
      }
      return {
        statusKey: status,
        label: info.label,
        subLabel: info.description,
        badgeBg: info.badgeBg,
        badgeText: info.badgeText,
        badgeBorder: info.badgeBorder,
        description: info.description,
        isMyActionRequired: false,
      };
    }

    case 'OFFICER': {
      const needsOfficerAction = [
        'DA_CHAP_THUAN',
        'CHO_SO_XU_LY',
        'DA_DUYET',
        'DANG_TRINH_OFFICE',
        'OFFICE_TRA_LAI',
        'TAM_DUNG_THOI_TIET',
      ].includes(status);

      const actionMap: Partial<Record<TripStatus, string>> = {
        DA_CHAP_THUAN: 'Tiếp nhận & Xử lý',
        CHO_SO_XU_LY: 'KT thời tiết & Duyệt dự thảo',
        DA_DUYET: 'Xuất Word & Trình Office',
        DANG_TRINH_OFFICE: 'Tải Giấy phép đã ký / Ghi trả lại',
        OFFICE_TRA_LAI: 'Xử lý hồ sơ Office trả lại',
        TAM_DUNG_THOI_TIET: 'Theo dõi thời tiết / Mở lại',
      };

      return {
        statusKey: status,
        label: info.label,
        subLabel: info.description,
        badgeBg: info.badgeBg,
        badgeText: info.badgeText,
        badgeBorder: info.badgeBorder,
        description: info.description,
        isMyActionRequired: needsOfficerAction,
        actionLabel: actionMap[status],
        actionPage: needsOfficerAction ? 'internal-workflow' : undefined,
      };
    }

    case 'BP_TRUC':
    case 'BP_CHIHUY': {
      if (status === 'DA_CAP_PHEP') {
        return {
          statusKey: 'DA_CAP_PHEP',
          label: 'Đã cấp Giấy phép • Chờ kiểm soát xuất bến',
          subLabel: 'Quét QR Giấy phép → Kiểm đếm người lên tàu → Cho xuất bến',
          badgeBg: 'bg-emerald-100',
          badgeText: 'text-emerald-900',
          badgeBorder: 'border-emerald-400',
          description: 'Sẵn sàng thực hiện khâu kiểm soát cuối cùng trước khi cho xuất bến',
          isMyActionRequired: true,
          actionLabel: 'Kiểm soát xuất bến',
          actionPage: 'bp-daily-trips',
        };
      }
      if (['NHAP', 'CHO_KIEM_TRA', 'TRA_CHU_TAU', 'DA_CHAP_THUAN', 'CHO_SO_XU_LY', 'TRA_BQL_CANG', 'TAM_DUNG_THOI_TIET', 'DA_DUYET', 'DANG_TRINH_OFFICE', 'OFFICE_TRA_LAI'].includes(status)) {
        return {
          statusKey: status,
          label: info.label,
          subLabel: 'Chỉ xem trước danh sách hành khách/thuyền viên (chưa cấp Giấy phép)',
          badgeBg: 'bg-slate-100',
          badgeText: 'text-slate-700',
          badgeBorder: 'border-slate-300',
          description: 'Biên phòng chỉ xem trước danh sách; kiểm soát xuất bến thực hiện sau khi Sở cấp Giấy phép',
          isMyActionRequired: false,
        };
      }
      return {
        statusKey: status,
        label: info.label,
        subLabel: info.description,
        badgeBg: info.badgeBg,
        badgeText: info.badgeText,
        badgeBorder: info.badgeBorder,
        description: info.description,
        isMyActionRequired: false,
      };
    }

    case 'DEPT_HEAD':
    case 'LEADER':
    default:
      return {
        statusKey: status,
        label: info.label,
        subLabel: info.description,
        badgeBg: info.badgeBg,
        badgeText: info.badgeText,
        badgeBorder: info.badgeBorder,
        description: info.description,
        isMyActionRequired: false,
      };
  }
}

export function getRoleStatusFilterOptions(userRole: UserRole): { value: string; label: string }[] {
  const common: { value: TripStatus; label: string }[] = [
    { value: 'CHO_KIEM_TRA', label: 'Chờ BQL Cảng kiểm tra' },
    { value: 'TRA_CHU_TAU', label: 'Trả Chủ tàu bổ sung' },
    { value: 'KHONG_CHAP_THUAN', label: 'Không chấp thuận' },
    { value: 'DA_CHAP_THUAN', label: 'BQL Cảng đã chấp thuận' },
    { value: 'CHO_SO_XU_LY', label: 'Chờ Sở xử lý' },
    { value: 'TRA_BQL_CANG', label: 'Sở trả lại BQL Cảng' },
    { value: 'TAM_DUNG_THOI_TIET', label: 'Tạm dừng do thời tiết' },
    { value: 'DA_DUYET', label: 'Đã duyệt dự thảo' },
    { value: 'DANG_TRINH_OFFICE', label: 'Đang trình ký Office' },
    { value: 'OFFICE_TRA_LAI', label: 'Office trả lại' },
    { value: 'DA_CAP_PHEP', label: 'Đã cấp Giấy phép' },
    { value: 'TAM_GIU_BIEN_PHONG', label: 'Biên phòng tạm giữ' },
    { value: 'DA_XUAT_BEN', label: 'Đã xuất bến' },
    { value: 'DA_CAP_BEN', label: 'Đã cập bến' },
    { value: 'HET_HIEU_LUC', label: 'Hết hiệu lực (>24h)' },
    { value: 'THU_HOI', label: 'Đã thu hồi Giấy phép' },
    { value: 'DA_RUT', label: 'Đã rút hồ sơ' },
    { value: 'NHAP', label: 'Nháp' },
  ];

  if (userRole === 'BP_TRUC' || userRole === 'BP_CHIHUY') {
    return [
      { value: 'DA_CAP_PHEP', label: '⚡ Đã cấp Giấy phép (Chờ kiểm soát)' },
      { value: 'TAM_GIU_BIEN_PHONG', label: 'Biên phòng tạm giữ' },
      { value: 'DA_XUAT_BEN', label: 'Đã xuất bến (Đang hành trình)' },
      { value: 'DA_CAP_BEN', label: 'Đã cập bến' },
      { value: 'HET_HIEU_LUC', label: 'Hết hiệu lực (>24h)' },
      { value: 'THU_HOI', label: 'Đã thu hồi' },
      { value: 'CHO_SO_XU_LY', label: 'Đang chờ Sở xử lý (Xem trước)' },
    ];
  }

  return common;
}

export function getRoleName(
  role: UserRole,
  bpConfig?: { roleLabelTruc?: string; roleLabelChiHuy?: string }
): string {
  switch (role) {
    case 'UNASSIGNED':
      return 'Chưa phân quyền';
    case 'ADMIN':
      return 'Quản trị hệ thống';
    case 'LEADER':
      return 'Lãnh đạo Sở Xây dựng';
    case 'DEPT_HEAD':
      return 'Trưởng phòng ATGT';
    case 'OFFICER':
      return 'Chuyên viên Phòng ATGT';
    case 'CLERK':
      return 'Văn thư (Dự phòng)';
    case 'PORT_STAFF':
      return 'Nhân viên Ban QL Cảng';
    case 'CAPTAIN':
      return 'Chủ tàu / Thuyền trưởng';
    case 'DUTY_OFFICER':
      return 'Cán bộ trực';
    case 'VERIFIER':
      return 'Người xác thực QR';
    case 'BP_TRUC':
      return bpConfig?.roleLabelTruc || 'Cán bộ trực Biên phòng';
    case 'BP_CHIHUY':
      return bpConfig?.roleLabelChiHuy || 'Chỉ huy Đồn Biên phòng';
    default:
      return role;
  }
}

export function numberToVietnameseWords(num: number): string {
  if (num === 0) return 'không người';
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const tens = [
    '',
    'mười',
    'hai mươi',
    'ba mươi',
    'bốn mươi',
    'năm mươi',
    'sáu mươi',
    'bảy mươi',
    'tám mươi',
    'chín mươi',
  ];

  if (num < 10) {
    return `${units[num]} người`;
  }
  if (num < 100) {
    const t = Math.floor(num / 10);
    const u = num % 10;
    let str = tens[t];
    if (u === 1 && t > 1) str += ' mốt';
    else if (u === 5) str += ' lăm';
    else if (u > 0) str += ` ${units[u]}`;
    return `${str} người`;
  }
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const rem = num % 100;
    let str = `${units[h]} trăm`;
    if (rem === 0) return `${str} người`;
    if (rem < 10) return `${str} linh ${units[rem]} người`;
    const t = Math.floor(rem / 10);
    const u = rem % 10;
    str += ` ${tens[t]}`;
    if (u === 1 && t > 1) str += ' mốt';
    else if (u === 5) str += ' lăm';
    else if (u > 0) str += ` ${units[u]}`;
    return `${str} người`;
  }
  return `${num} người`;
}
