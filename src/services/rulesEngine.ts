/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TripRecord,
  Vessel,
  WeatherCondition,
  RuleEvaluationResult,
  SystemRuleConfig,
  DeNghiDung,
  BpDepartureControlRecord,
  AnyTripStatusInput,
  TripStatus,
} from '../types';

export type RuleEvaluationContext = 'SUBMIT' | 'DEPT_APPROVE' | 'DEPARTURE_CONTROL';

const LEGACY_TO_CANONICAL_STATUS: Record<string, TripStatus> = {
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

function toCanonical(status?: AnyTripStatusInput | string): TripStatus {
  if (!status) return 'NHAP';
  return LEGACY_TO_CANONICAL_STATUS[status] || (status as TripStatus);
}

const FINISHED_TRIP_STATUSES = new Set<TripStatus>([
  'NHAP',
  'KHONG_CHAP_THUAN',
  'THU_HOI',
  'HET_HIEU_LUC',
  'DA_RUT',
  'DA_CAP_BEN',
]);

/**
 * Động cơ kiểm tra 12 quy tắc tự động R1 - R12 theo đặc tả quy trình VR-SB
 * Tuyến Đảo Lớn – Đảo Bé (Lý Sơn, Quảng Ngãi)
 */
export class RulesEngine {
  public static evaluateAllRules(
    trip: Partial<TripRecord>,
    vessel: Vessel | undefined,
    crewMembers: {
      crewId?: string;
      fullName: string;
      certNumber: string;
      certExpireDate: string;
      positionTitle?: string;
    }[] = [],
    weather: WeatherCondition,
    allActiveTrips: TripRecord[] = [],
    rulesConfig: SystemRuleConfig[] = [],
    activeBpStops: DeNghiDung[] = [],
    options?: {
      context?: RuleEvaluationContext;
      now?: Date;
      departureControl?: Partial<BpDepartureControlRecord>;
    }
  ): {
    results: RuleEvaluationResult[];
    hasBlockingFailure: boolean;
    hasWarning: boolean;
    blockingCount: number;
    warningCount: number;
  } {
    const context: RuleEvaluationContext = options?.context || 'SUBMIT';
    const nowDate = options?.now || new Date();
    const nowTimestamp = nowDate.getTime();
    const todayStr = nowDate.toISOString().slice(0, 10);
    const depDateStr = (trip.scheduledDepartureTime || todayStr).slice(0, 10);
    const checkDateStr = depDateStr > todayStr ? depDateStr : todayStr;

    const results: RuleEvaluationResult[] = [];

    const getRuleCfg = (code: string) => rulesConfig.find((c) => c.code === code);
    const isEnabled = (code: string) => {
      const cfg = getRuleCfg(code);
      return cfg ? cfg.isEnabled : true;
    };

    // ==========================================
    // R1 (Chặn): Vượt sức chở người hoặc vượt trọng tải hàng
    // ==========================================
    if (isEnabled('R1')) {
      const paxCount = trip.passengerCount ?? (trip.passengers?.length || 0);
      const crewCount = crewMembers.length;
      const totalPeople = paxCount + crewCount;
      const maxPax = vessel?.maxPassengers ?? 0;
      const cargoTons = Number(trip.cargoTons || 0);
      const maxCargo = vessel?.maxCargoTons ?? 0;

      const overPax = Boolean(
        vessel && (paxCount > maxPax || totalPeople > maxPax + (vessel.minCrew || 2))
      );
      const overCargo = Boolean(vessel && cargoTons > maxCargo);

      if (!vessel) {
        results.push({
          ruleCode: 'R1',
          ruleName: 'Sức chở hành khách & trọng tải hàng hóa',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: 'Chưa xác định thông số sức chở phương tiện.',
        });
      } else if (overPax || overCargo) {
        const reasons: string[] = [];
        if (overPax) {
          reasons.push(
            `${paxCount} khách (tổng ${totalPeople} người) vượt sức chở ${maxPax} khách`
          );
        }
        if (overCargo) {
          reasons.push(`${cargoTons} tấn hàng vượt trọng tải ${maxCargo} tấn`);
        }
        results.push({
          ruleCode: 'R1',
          ruleName: 'Sức chở hành khách & trọng tải hàng hóa',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Vượt định mức phương tiện ${vessel.name}: ${reasons.join('; ')}.`,
          details: 'Nghiêm cấm chở quá số người hoặc quá trọng tải hàng hóa cho phép.',
        });
      } else {
        results.push({
          ruleCode: 'R1',
          ruleName: 'Sức chở hành khách & trọng tải hàng hóa',
          status: 'PASSED',
          severity: 'INFO',
          message: `Hợp lệ: ${paxCount}/${maxPax} khách (tổng ${totalPeople} người), ${cargoTons}/${maxCargo} tấn hàng.`,
        });
      }
    }

    // ==========================================
    // R2 (Chặn): Giấy tờ tàu hoặc chứng chỉ thuyền viên hết hạn
    // ==========================================
    if (isEnabled('R2')) {
      if (!vessel) {
        results.push({
          ruleCode: 'R2',
          ruleName: 'Hiệu lực giấy tờ tàu & chứng chỉ thuyền viên',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: 'Chưa chọn hoặc không tìm thấy phương tiện VR-SB.',
        });
      } else {
        const expiredVesselDocs: string[] = [];
        if (!vessel.registryExpireDate || vessel.registryExpireDate < checkDateStr) {
          expiredVesselDocs.push(`Đăng kiểm (${vessel.registryExpireDate || 'thiếu'})`);
        }
        if (!vessel.operatingLicenseExpireDate || vessel.operatingLicenseExpireDate < checkDateStr) {
          expiredVesselDocs.push(`GP hoạt động (${vessel.operatingLicenseExpireDate || 'thiếu'})`);
        }
        if (vessel.techSafetyExpireDate && vessel.techSafetyExpireDate < checkDateStr) {
          expiredVesselDocs.push(`ATKT & BVMT (${vessel.techSafetyExpireDate})`);
        }
        if (vessel.civilInsuranceExpireDate && vessel.civilInsuranceExpireDate < checkDateStr) {
          expiredVesselDocs.push(`BH TNDS (${vessel.civilInsuranceExpireDate})`);
        }

        const expiredCrewCerts: string[] = [];
        crewMembers.forEach((cm) => {
          if (!cm.certExpireDate || cm.certExpireDate < checkDateStr) {
            expiredCrewCerts.push(
              `${cm.positionTitle || 'Thuyền viên'} ${cm.fullName || '(chưa nhập tên)'} (hạn ${cm.certExpireDate || 'thiếu'})`
            );
          }
        });

        if (expiredVesselDocs.length > 0 || expiredCrewCerts.length > 0) {
          const parts: string[] = [];
          if (expiredVesselDocs.length > 0) {
            parts.push(`Giấy tờ tàu hết hạn: ${expiredVesselDocs.join(', ')}`);
          }
          if (expiredCrewCerts.length > 0) {
            parts.push(`Chứng chỉ thuyền viên hết hạn: ${expiredCrewCerts.join(', ')}`);
          }
          results.push({
            ruleCode: 'R2',
            ruleName: 'Hiệu lực giấy tờ tàu & chứng chỉ thuyền viên',
            status: 'FAILED',
            severity: 'BLOCKING',
            message: parts.join('. '),
            details: 'Giấy tờ tàu và chứng chỉ chuyên môn thuyền viên bắt buộc còn hạn tại ngày khởi hành.',
          });
        } else {
          results.push({
            ruleCode: 'R2',
            ruleName: 'Hiệu lực giấy tờ tàu & chứng chỉ thuyền viên',
            status: 'PASSED',
            severity: 'INFO',
            message: `Giấy tờ tàu ${vessel.name} và chứng chỉ ${crewMembers.length} thuyền viên đều còn hạn.`,
          });
        }
      }
    }

    // ==========================================
    // R3 (Chặn): Thiếu định biên tối thiểu hoặc chức danh bắt buộc
    // ==========================================
    if (isEnabled('R3')) {
      const minCrew = vessel?.minCrew || 2;
      const blankCrew = crewMembers.find((c) => !c.fullName || c.fullName.trim() === '');
      const hasCaptain = crewMembers.some(
        (c) =>
          (c.positionTitle || '').toLowerCase().includes('thuyền trưởng') &&
          c.fullName.trim() !== ''
      );
      const hasChiefEngineer = crewMembers.some(
        (c) =>
          (c.positionTitle || '').toLowerCase().includes('máy trưởng') &&
          c.fullName.trim() !== ''
      );

      if (crewMembers.length < minCrew) {
        results.push({
          ruleCode: 'R3',
          ruleName: 'Định biên thuyền viên tối thiểu & chức danh bắt buộc',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Thiếu định biên thuyền viên: Hiện có ${crewMembers.length}/${minCrew} thuyền viên tối thiểu của tàu ${vessel?.name || ''}.`,
        });
      } else if (blankCrew) {
        results.push({
          ruleCode: 'R3',
          ruleName: 'Định biên thuyền viên tối thiểu & chức danh bắt buộc',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Vị trí "${blankCrew.positionTitle || 'Thuyền viên'}" bị để trống họ tên.`,
        });
      } else if (!hasCaptain || (minCrew >= 2 && !hasChiefEngineer)) {
        const missingPos: string[] = [];
        if (!hasCaptain) missingPos.push('Thuyền trưởng');
        if (minCrew >= 2 && !hasChiefEngineer) missingPos.push('Máy trưởng');
        results.push({
          ruleCode: 'R3',
          ruleName: 'Định biên thuyền viên tối thiểu & chức danh bắt buộc',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Thiếu chức danh bắt buộc trong danh sách thuyền viên: ${missingPos.join(', ')}.`,
        });
      } else {
        results.push({
          ruleCode: 'R3',
          ruleName: 'Định biên thuyền viên tối thiểu & chức danh bắt buộc',
          status: 'PASSED',
          severity: 'INFO',
          message: `Đủ ${crewMembers.length}/${minCrew} định biên và đầy đủ chức danh bắt buộc.`,
        });
      }
    }

    // ==========================================
    // R4 (Chặn): Thuyền viên (BẤT KỲ AI) đang ở trên một chuyến chưa kết thúc khác
    // ==========================================
    if (isEnabled('R4')) {
      const overlapping: string[] = [];

      allActiveTrips.forEach((other) => {
        if (trip.id && other.id === trip.id) return;
        const otherStatus = toCanonical(other.status);
        if (FINISHED_TRIP_STATUSES.has(otherStatus)) return;

        crewMembers.forEach((cm) => {
          const matchedOther = (other.crewMembers || []).find((oc) => {
            if (cm.crewId && oc.crewId && cm.crewId === oc.crewId) return true;
            if (cm.certNumber && oc.certNumber && cm.certNumber.trim() === oc.certNumber.trim()) {
              return true;
            }
            return (
              cm.fullName &&
              oc.fullName &&
              cm.fullName.trim().toLowerCase() === oc.fullName.trim().toLowerCase()
            );
          });
          if (matchedOther) {
            overlapping.push(
              `${cm.positionTitle || 'Thuyền viên'} ${cm.fullName} đang tham gia chuyến ${other.tripNumber} (${other.vesselName})`
            );
          }
        });
      });

      if (overlapping.length > 0) {
        results.push({
          ruleCode: 'R4',
          ruleName: 'Không trùng thuyền viên trên chuyến chưa kết thúc',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Phát hiện trùng thuyền viên trên chuyến chưa kết thúc: ${Array.from(new Set(overlapping)).join('; ')}.`,
          details: 'Mỗi thuyền viên chỉ được tham gia 01 chuyến đang hoạt động tại một thời điểm.',
        });
      } else {
        results.push({
          ruleCode: 'R4',
          ruleName: 'Không trùng thuyền viên trên chuyến chưa kết thúc',
          status: 'PASSED',
          severity: 'INFO',
          message: 'Không có thuyền viên nào trùng lịch trên chuyến khác chưa kết thúc.',
        });
      }
    }

    // ==========================================
    // R5 (Cảnh báo): Chuyến trước của tàu vẫn đang hành trình chưa cập bến
    // ==========================================
    if (isEnabled('R5')) {
      const underwayOther = allActiveTrips.find(
        (other) =>
          (!trip.id || other.id !== trip.id) &&
          trip.vesselId &&
          other.vesselId === trip.vesselId &&
          toCanonical(other.status) === 'DA_XUAT_BEN'
      );

      if (underwayOther) {
        results.push({
          ruleCode: 'R5',
          ruleName: 'Cảnh báo chuyến trước của tàu chưa xác nhận cập bến',
          status: 'WARNING',
          severity: 'WARNING',
          message: `Cảnh báo: Tàu ${vessel?.name || trip.vesselName || ''} còn chuyến trước (${underwayOther.tripNumber}) đang ở trạng thái Đã xuất bến, chưa xác nhận cập bến.`,
          details: 'Vẫn cho phép chuẩn bị/nộp hồ sơ chuyến kế tiếp nhưng cần đối chiếu tình trạng cập bến thực tế.',
        });
      } else {
        results.push({
          ruleCode: 'R5',
          ruleName: 'Cảnh báo chuyến trước của tàu chưa xác nhận cập bến',
          status: 'PASSED',
          severity: 'INFO',
          message: 'Phương tiện không có chuyến trước đang hành trình chưa cập bến.',
        });
      }
    }

    // ==========================================
    // R6 (Cảnh báo): Giấy tờ tàu / chứng chỉ thuyền viên sắp hết hạn ≤ 30 ngày
    // ==========================================
    if (isEnabled('R6')) {
      const thresholdDays = getRuleCfg('R6')?.warningThreshold ?? 30;
      const nearItems: string[] = [];

      const isNearExpiry = (dateStr?: string): number | null => {
        if (!dateStr) return null;
        const diffDays = Math.ceil(
          (new Date(dateStr).getTime() - new Date(todayStr).getTime()) / (1000 * 3600 * 24)
        );
        if (diffDays >= 0 && diffDays <= thresholdDays) return diffDays;
        return null;
      };

      if (vessel) {
        const regDays = isNearExpiry(vessel.registryExpireDate);
        if (regDays !== null) nearItems.push(`Đăng kiểm tàu (còn ${regDays} ngày)`);
        const licDays = isNearExpiry(vessel.operatingLicenseExpireDate);
        if (licDays !== null) nearItems.push(`GP hoạt động tàu (còn ${licDays} ngày)`);
        const techDays = isNearExpiry(vessel.techSafetyExpireDate);
        if (techDays !== null) nearItems.push(`GCN ATKT & BVMT (còn ${techDays} ngày)`);
        const insDays = isNearExpiry(vessel.civilInsuranceExpireDate);
        if (insDays !== null) nearItems.push(`BH TNDS (còn ${insDays} ngày)`);
      }

      crewMembers.forEach((cm) => {
        const cDays = isNearExpiry(cm.certExpireDate);
        if (cDays !== null) {
          nearItems.push(`Chứng chỉ ${cm.fullName} (còn ${cDays} ngày)`);
        }
      });

      if (nearItems.length > 0) {
        results.push({
          ruleCode: 'R6',
          ruleName: `Cảnh báo giấy tờ sắp hết hạn (≤ ${thresholdDays} ngày)`,
          status: 'WARNING',
          severity: 'WARNING',
          message: `Sắp hết hạn trong ≤ ${thresholdDays} ngày: ${nearItems.join('; ')}.`,
          details: 'Hệ thống vẫn cho phép nộp và xử lý nhưng nhắc chủ tàu sớm gia hạn.',
        });
      } else {
        results.push({
          ruleCode: 'R6',
          ruleName: `Cảnh báo giấy tờ sắp hết hạn (≤ ${thresholdDays} ngày)`,
          status: 'PASSED',
          severity: 'INFO',
          message: `Không có giấy tờ tàu hoặc chứng chỉ thuyền viên sắp hết hạn trong ${thresholdDays} ngày tới.`,
        });
      }
    }

    // ==========================================
    // R7 (Chặn duyệt/cấp phép): Tuyến tạm dừng hoặc gió/sóng vượt ngưỡng tàu
    // ==========================================
    if (isEnabled('R7')) {
      const vesselWindLimit = vessel?.maxWindForce ?? 5;
      const vesselWaveLimit = vessel?.maxWaveHeight ?? 2.0;
      const unsafeByWeather =
        weather.windForceBeaufort > vesselWindLimit ||
        weather.waveHeightMeters > vesselWaveLimit;

      if (weather.isRouteSuspended || unsafeByWeather) {
        const reasonText = weather.isRouteSuspended
          ? `Tuyến đang tạm dừng do thời tiết (${weather.suspensionReason || 'Biển động nguy hiểm'}).`
          : `Thời tiết hiện tại (Gió cấp ${weather.windForceBeaufort}, sóng ${weather.waveHeightMeters}m) vượt ngưỡng tàu ${vessel?.name || ''} (Gió cấp ${vesselWindLimit}, sóng ${vesselWaveLimit}m).`;

        const isBlockingContext = context === 'DEPT_APPROVE' || context === 'DEPARTURE_CONTROL';
        results.push({
          ruleCode: 'R7',
          ruleName: 'Điều kiện thời tiết & trạng thái hoạt động tuyến',
          status: isBlockingContext ? 'FAILED' : 'WARNING',
          severity: isBlockingContext ? 'BLOCKING' : 'WARNING',
          message: reasonText,
          details: isBlockingContext
            ? 'Không thể duyệt dự thảo / cấp phép hoặc cho xuất bến khi tuyến tạm dừng hoặc thời tiết vượt ngưỡng an toàn.'
            : 'Chủ tàu có thể lưu hoặc nộp chờ thời tiết ổn định; Chuyên viên Sở sẽ chặn duyệt/cấp phép nếu gió sóng còn vượt ngưỡng.',
        });
      } else {
        results.push({
          ruleCode: 'R7',
          ruleName: 'Điều kiện thời tiết & trạng thái hoạt động tuyến',
          status: 'PASSED',
          severity: 'INFO',
          message: `Thời tiết an toàn: Gió cấp ${weather.windForceBeaufort} (≤ cấp ${vesselWindLimit}), sóng ${weather.waveHeightMeters}m (≤ ${vesselWaveLimit}m), tuyến hoạt động bình thường.`,
        });
      }
    }

    // ==========================================
    // R8 (Chặn xuất bến): Giấy phép quá 24 giờ kể từ lúc cấp
    // ==========================================
    if (isEnabled('R8')) {
      const issuedAtIso =
        trip.officeSubmissionRecord?.issuedAt || trip.sealedAt || trip.approvedAt;
      const canonical = toCanonical(trip.status);
      let isExpired24h = canonical === 'HET_HIEU_LUC';

      if (issuedAtIso && ['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG', 'HET_HIEU_LUC'].includes(canonical)) {
        const issuedMs = new Date(issuedAtIso).getTime();
        if (!isNaN(issuedMs) && nowTimestamp - issuedMs > 24 * 60 * 60 * 1000) {
          isExpired24h = true;
        }
      }

      if (isExpired24h) {
        results.push({
          ruleCode: 'R8',
          ruleName: 'Thời hạn hiệu lực Giấy phép rời cảng (24 giờ)',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: 'Giấy phép đã quá thời hạn 24 giờ kể từ lúc cấp → Hết hiệu lực, chặn xuất bến.',
          details: 'Chủ tàu phải lập hồ sơ đề nghị cấp Giấy phép mới.',
        });
      } else {
        results.push({
          ruleCode: 'R8',
          ruleName: 'Thời hạn hiệu lực Giấy phép rời cảng (24 giờ)',
          status: 'PASSED',
          severity: 'INFO',
          message: issuedAtIso
            ? 'Giấy phép còn trong thời hạn hiệu lực 24 giờ kể từ lúc cấp.'
            : 'Hiệu lực 24 giờ sẽ tính từ thời điểm tải Giấy phép chính thức lên ứng dụng.',
        });
      }
    }

    // ==========================================
    // R9 (Chặn): Thiếu trường bắt buộc, giờ dự kiến < hiện tại + 30p, hoặc lệch số khách
    // ==========================================
    if (isEnabled('R9')) {
      const missingFields: string[] = [];
      if (!trip.vesselId) missingFields.push('Phương tiện');
      if (!trip.routeId) missingFields.push('Tuyến');
      if (!trip.departurePortId) missingFields.push('Bến rời');
      if (!trip.arrivalPortId) missingFields.push('Bến đến');

      const timeStr = trip.scheduledDepartureTime || '';
      let isFormatValid = false;
      let isTooSoon = false;

      if (timeStr) {
        const parts = timeStr.split('T');
        if (parts.length === 2) {
          const [hours, minutes] = parts[1].split(':').map(Number);
          if (
            !isNaN(hours) &&
            !isNaN(minutes) &&
            hours >= 0 &&
            hours <= 23 &&
            minutes >= 0 &&
            minutes <= 59
          ) {
            isFormatValid = true;
          }
        }
        const scheduledMs = new Date(timeStr).getTime();
        if (isNaN(scheduledMs)) {
          isFormatValid = false;
        } else if (scheduledMs < nowTimestamp + 30 * 60 * 1000) {
          isTooSoon = true;
        }
      }

      const declaredPax = trip.passengerCount ?? 0;
      const listPaxCount = trip.passengers ? trip.passengers.length : 0;
      const paxMismatch = declaredPax !== listPaxCount;

      if (missingFields.length > 0) {
        results.push({
          ruleCode: 'R9',
          ruleName: 'Thông tin hợp lệ, giờ rời bến ≥ hiện tại + 30p & khớp số khách',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Thiếu thông tin bắt buộc: ${missingFields.join(', ')}.`,
        });
      } else if (!timeStr || !isFormatValid) {
        results.push({
          ruleCode: 'R9',
          ruleName: 'Thông tin hợp lệ, giờ rời bến ≥ hiện tại + 30p & khớp số khách',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Giờ dự kiến rời bến "${timeStr || 'Chưa chọn'}" không đúng định dạng.`,
        });
      } else if (isTooSoon && context === 'SUBMIT') {
        results.push({
          ruleCode: 'R9',
          ruleName: 'Thông tin hợp lệ, giờ rời bến ≥ hiện tại + 30p & khớp số khách',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Giờ dự kiến rời bến (${timeStr.replace('T', ' ')}) nhỏ hơn thời điểm hiện tại + 30 phút.`,
          details: 'Cần đặt giờ dự kiến rời bến tối thiểu sau hiện tại 30 phút để BQL Cảng và Sở kịp xử lý.',
        });
      } else if (paxMismatch) {
        results.push({
          ruleCode: 'R9',
          ruleName: 'Thông tin hợp lệ, giờ rời bến ≥ hiện tại + 30p & khớp số khách',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: `Lệch số lượng hành khách: Bản khai chung (${declaredPax}) khác Danh sách hành khách (${listPaxCount}).`,
        });
      } else {
        results.push({
          ruleCode: 'R9',
          ruleName: 'Thông tin hợp lệ, giờ rời bến ≥ hiện tại + 30p & khớp số khách',
          status: 'PASSED',
          severity: 'INFO',
          message: `Đủ trường bắt buộc, giờ rời bến hợp lệ và khớp ${declaredPax} hành khách.`,
        });
      }
    }

    // ==========================================
    // R10 (Chặn xuất bến): Biên phòng tạm giữ / đình chỉ sau khi cấp Giấy phép
    // QUAN TRỌNG: Tuyệt đối KHÔNG chặn nộp hoặc chặn duyệt/cấp phép trước khi phát hành!
    // ==========================================
    if (isEnabled('R10')) {
      const canonical = toCanonical(trip.status);
      const postIssuanceHold =
        canonical === 'TAM_GIU_BIEN_PHONG' ||
        Boolean(trip.isPermitSuspended) ||
        activeBpStops.some(
          (s) =>
            s.trangThai === 'dang_hieu_luc' &&
            s.loai === 'dinh_chi_lenh' &&
            (!trip.id || s.hoSoId === trip.id)
        );

      if (postIssuanceHold && context !== 'SUBMIT') {
        results.push({
          ruleCode: 'R10',
          ruleName: 'Biên phòng tạm giữ / đình chỉ xuất bến',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: 'Giấy phép đang bị Biên phòng tạm giữ / tạm đình chỉ xuất bến (phát hiện bất thường tại bến).',
          details: 'Mã QR hiển thị "Tạm đình chỉ". Chỉ được xuất bến sau khi Biên phòng xác minh và gỡ tạm giữ.',
        });
      } else {
        results.push({
          ruleCode: 'R10',
          ruleName: 'Biên phòng tạm giữ / đình chỉ xuất bến',
          status: 'PASSED',
          severity: 'INFO',
          message: 'Không có lệnh tạm giữ / tạm đình chỉ của Biên phòng.',
        });
      }
    }

    // ==========================================
    // R11 (Chặn nộp): Thiếu chứng từ và mã giao dịch nộp phí rời cảng
    // ==========================================
    if (isEnabled('R11')) {
      const hasFeeDoc = (trip.uploadedDocuments || []).some(
        (d) => d.category === 'FEE_RECEIPT'
      );
      const hasFeeCode = Boolean(trip.feeTransactionCode && trip.feeTransactionCode.trim().length >= 3);

      if (!hasFeeDoc && !hasFeeCode) {
        results.push({
          ruleCode: 'R11',
          ruleName: 'Chứng từ / mã giao dịch nộp phí rời cảng',
          status: 'FAILED',
          severity: 'BLOCKING',
          message: 'Chưa có ảnh/PDF chứng từ nộp phí rời cảng (FEE_RECEIPT) và chưa nhập mã giao dịch nộp phí.',
          details: 'Chủ tàu phải quét mã QR thanh toán và tải lên ảnh/PDF ủy nhiệm chi hoặc nhập mã giao dịch nộp phí trước khi nộp hồ sơ.',
        });
      } else {
        results.push({
          ruleCode: 'R11',
          ruleName: 'Chứng từ / mã giao dịch nộp phí rời cảng',
          status: 'PASSED',
          severity: 'INFO',
          message: hasFeeDoc
            ? `Đã đính kèm chứng từ nộp phí${hasFeeCode ? ` (Mã GD: ${trip.feeTransactionCode})` : ''}.`
            : `Đã khai mã giao dịch nộp phí: ${trip.feeTransactionCode}.`,
        });
      }
    }

    // ==========================================
    // R12 (Chặn xuất bến): Kiểm soát Biên phòng phát hiện người lạ / tăng người / đổi thuyền viên
    // ==========================================
    if (isEnabled('R12')) {
      const control =
        context === 'SUBMIT' ? undefined : options?.departureControl || trip.bpDepartureControl;
      if (control) {
        const unlistedCount = control.unlistedPeople?.length || 0;
        const scheduledTotal =
          control.scheduledTotalPeople ??
          ((trip.crewMembers?.length || 0) + (trip.passengers?.length || trip.passengerCount || 0));
        const actualTotal = control.actualTotalPeople ?? scheduledTotal;
        const hasExtra = actualTotal > scheduledTotal;
        const hasMissingCrew = (control.checklist || []).some(
          (item) => item.personType === 'CREW' && item.absent
        );
        const hasCrewUnlisted = (control.unlistedPeople || []).some(
          (u) => u.personType === 'CREW'
        );

        if (unlistedCount > 0 || hasExtra || hasCrewUnlisted || hasMissingCrew) {
          const issues: string[] = [];
          if (unlistedCount > 0) issues.push(`phát hiện ${unlistedCount} người ngoài danh sách`);
          if (hasExtra) issues.push(`số người thực tế (${actualTotal}) vượt danh sách (${scheduledTotal})`);
          if (hasCrewUnlisted || hasMissingCrew) issues.push('có thay đổi / thiếu thuyền viên ngoài danh sách');
          results.push({
            ruleCode: 'R12',
            ruleName: 'Kiểm soát người lên tàu khớp danh sách đã cấp phép',
            status: 'FAILED',
            severity: 'BLOCKING',
            message: `Vi phạm R12 khi kiểm soát xuất bến: ${issues.join('; ')}. Chặn xuất bến và chuyển trả Chủ tàu sửa hồ sơ.`,
            details: 'Giấy phép cũ bị Tạm đình chỉ; Chủ tàu phải sửa danh sách và nộp lại qua BQL Cảng → Sở để cấp Giấy phép mới.',
          });
        } else {
          results.push({
            ruleCode: 'R12',
            ruleName: 'Kiểm soát người lên tàu khớp danh sách đã cấp phép',
            status: 'PASSED',
            severity: 'INFO',
            message: `Người lên tàu thực tế (${actualTotal}/${scheduledTotal}) khớp danh sách đã cấp phép.`,
          });
        }
      } else {
        results.push({
          ruleCode: 'R12',
          ruleName: 'Kiểm soát người lên tàu khớp danh sách đã cấp phép',
          status: 'PASSED',
          severity: 'INFO',
          message: 'Sẽ kiểm tra đối chiếu trực tiếp tại khâu Biên phòng kiểm soát cuối cùng trước khi xuất bến.',
        });
      }
    }

    const hasBlockingFailure = results.some(
      (r) => r.status === 'FAILED' && r.severity === 'BLOCKING'
    );
    const hasWarning = results.some((r) => r.status === 'WARNING');
    const blockingCount = results.filter(
      (r) => r.status === 'FAILED' && r.severity === 'BLOCKING'
    ).length;
    const warningCount = results.filter((r) => r.status === 'WARNING').length;

    return {
      results,
      hasBlockingFailure,
      hasWarning,
      blockingCount,
      warningCount,
    };
  }

  /**
   * Kiểm tra nhanh cho bước Biên phòng kiểm soát cuối cùng tại bến (R8, R10, R12, R7)
   */
  public static evaluateDepartureControlRules(
    trip: TripRecord,
    vessel: Vessel | undefined,
    weather: WeatherCondition,
    control: Partial<BpDepartureControlRecord>,
    rulesConfig: SystemRuleConfig[] = [],
    activeBpStops: DeNghiDung[] = [],
    now: Date = new Date()
  ) {
    return this.evaluateAllRules(
      trip,
      vessel,
      trip.crewMembers || [],
      weather,
      [],
      rulesConfig,
      activeBpStops,
      {
        context: 'DEPARTURE_CONTROL',
        now,
        departureControl: control,
      }
    );
  }
}
