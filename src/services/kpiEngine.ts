/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  KpiConfig,
  KpiDocumentWarning,
  KpiDossierSummary,
  KpiDrilldownRecord,
  KpiEventRecord,
  KpiIndicatorConfig,
  KpiIndicatorResult,
  KpiPersonScorecard,
  KpiRatingLevel,
  KpiRatingThresholds,
  KpiStaffProfile,
  KpiStageKey,
  KpiTimeExclusion,
  KpiTimeNorms,
  KpiUnitMetrics,
  BpKpiSummaryMetrics,
} from '../types/kpi';
import { DeNghiDung, KiemSoatTaiBen, TripRecord } from '../types';
import { getBpStopReasonLabel } from '../utils/formatters';

export function round1(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

/**
 * Thời gian Quá hạn luôn làm tròn lên số nguyên (không có phần thập phân).
 */
export function roundOverdueUp(val: number): number {
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.ceil(val);
}

/**
 * Định dạng số theo chuẩn Việt Nam: dấu phẩy thập phân (,), dấu chấm phân cách nghìn (.)
 */
export function formatViNumber(val: number, decimals = 1): string {
  if (!Number.isFinite(val)) return '0';
  const factor = Math.pow(10, decimals);
  const rounded = Math.round((val + Number.EPSILON) * factor) / factor;
  const fixed = rounded.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals > 0 ? `${formattedInt},${decPart}` : formattedInt;
}

export function formatViInteger(val: number): string {
  return formatViNumber(val, 0);
}

const STAFF_NAME_BY_ID: Record<string, string> = {
  'USR-02': 'Võ Phiên',
  'USR-03': 'Nguyễn Thị Mỹ Hạnh',
  'USR-04': 'Nguyễn Phùng Nguyễn',
  'USR-05': 'Hoàng Văn Thắng',
  'USR-06': 'Trần Văn Nam',
  'USR-BP-TRUC-01': 'Đại úy Lê Minh Tuấn',
  'USR-BP-TRUC-02': 'Thượng úy Phạm Quốc Bảo',
};

function resolveActorName(ev?: KpiEventRecord): string | undefined {
  if (!ev) return undefined;
  return ev.nguoiThucHien || (ev.nguoiThucHienId ? STAFF_NAME_BY_ID[ev.nguoiThucHienId] : undefined);
}

export const DEFAULT_KPI_CONFIG: KpiConfig = {
  timeNorms: {
    bql_limit: 60,
    so_limit: 60,
    office_upload_limit: 10,
    m3_m2: 60,
    m4_m3: 0,
    m5_m4: 0,
    m6_m5: 10,
    m7_m6: 10,
    total_m7_m2: 60,
    m8_confirm_limit: 15,
    r6_update_days: 3,
  },
  ratingThresholds: {
    xuatSac: 90,
    tot: 70,
    hoanThanh: 50,
  },
  indicators: [
    // BQL Cảng (PORT_STAFF - 100 điểm) theo Mục 8
    {
      code: 'BQL-T1',
      name: 'Thời gian BQL kiểm tra & ra Thông báo chấp thuận ≤ 60 phút',
      description: 'Tỷ lệ hồ sơ BQL xử lý ≤ 60 phút (đã trừ khoảng thời gian trả Chủ tàu)',
      role: 'PORT_STAFF',
      direction: 'HIGHER_BETTER',
      weight: 45,
      target: 95,
      unit: '%',
    },
    {
      code: 'BQL-C1',
      name: 'Tỷ lệ biên bản kiểm tra 8 nhóm đủ ảnh hiện trường',
      description: 'Tỷ lệ hồ sơ hoàn thành kiểm tra tại bến có đính kèm ảnh hiện trường',
      role: 'PORT_STAFF',
      direction: 'HIGHER_BETTER',
      weight: 35,
      target: 100,
      unit: '%',
    },
    {
      code: 'BQL-C2',
      name: 'Tỷ lệ xác nhận cập bến kịp thời (khi dự phòng thay Biên phòng)',
      description: 'Tỷ lệ lượt BQL xác nhận đã cập bến đúng hạn khi thực hiện vai trò dự phòng',
      role: 'PORT_STAFF',
      direction: 'HIGHER_BETTER',
      weight: 20,
      target: 95,
      unit: '%',
    },

    // Chuyên viên Phòng ATGT - Sở Xây dựng (OFFICER - 100 điểm) theo Mục 8
    {
      code: 'CV-T1',
      name: 'Thời gian Sở từ nhận Thông báo BQL đến tải Giấy phép ≤ 60 phút',
      description: 'Tỷ lệ hồ sơ Sở hoàn tất ≤ 60 phút (đã trừ chờ Chủ tàu, BQL, thời tiết; không trừ thời gian chờ Office)',
      role: 'OFFICER',
      direction: 'HIGHER_BETTER',
      weight: 45,
      target: 95,
      unit: '%',
    },
    {
      code: 'CV-T2',
      name: 'Thời gian tải Giấy phép sau khi Office phát hành ≤ 10 phút',
      description: 'Tỷ lệ hồ sơ tải bản PDF đã ký và nhập số Giấy phép trong ≤ 10 phút sau duyệt Office',
      role: 'OFFICER',
      direction: 'HIGHER_BETTER',
      weight: 30,
      target: 95,
      unit: '%',
    },
    {
      code: 'CV-C1',
      name: 'Tỷ lệ hồ sơ bị Office trả lại do lỗi xử lý',
      description: 'Số lần Office trả lại với nhóm lỗi "lỗi xử lý" / tổng số lượt trình Office (lỗi hồ sơ không trừ KPI)',
      role: 'OFFICER',
      direction: 'LOWER_BETTER',
      weight: 25,
      target: 2,
      zeroScoreThreshold: 15,
      unit: '%',
    },
  ],
  excelSummaryColumns: [
    { key: 'fullName', header: 'Họ và tên', enabled: true },
    { key: 'department', header: 'Đơn vị', enabled: true },
    { key: 'roleLabel', header: 'Vai trò', enabled: true },
    { key: 'periodLabel', header: 'Kỳ đánh giá', enabled: true },
    { key: 'indicatorDetails', header: 'Điểm chi tiết từng chỉ số', enabled: true },
    { key: 'totalScore', header: 'Tổng điểm KPI', enabled: true },
    { key: 'rating', header: 'Xếp mức đánh giá', enabled: true },
  ],
  excelDetailColumns: [
    { key: 'maHoSo', header: 'Mã hồ sơ', enabled: true },
    { key: 'ngay', header: 'Ngày phát sinh', enabled: true },
    { key: 'phuongTienTen', header: 'Phương tiện VR-SB', enabled: true },
    { key: 'benTen', header: 'Bến cảng', enabled: true },
    { key: 'm1Time', header: 'Chủ tàu nộp', enabled: true },
    { key: 'm2Time', header: 'BQL chấp thuận', enabled: true },
    { key: 'm6Time', header: 'Sở tải Giấy phép', enabled: true },
    { key: 'netBql', header: 'Đồng hồ BQL (phút)', enabled: true },
    { key: 'netSo', header: 'Đồng hồ Sở (phút)', enabled: true },
    { key: 'uploadDelay', header: 'Tải GP sau Office (phút)', enabled: true },
    { key: 'excludedMinutes', header: 'Loại trừ / Tạm dừng (phút)', enabled: true },
    { key: 'statusText', header: 'Trạng thái hạn', enabled: true },
  ],
};

// =================== CÔNG THỨC QUY ĐỔI ĐIỂM THUẦN TÚY ===================

export function scoreHigherIsBetter(
  numerator: number,
  denominator: number,
  weight: number,
  target: number
): { value: number; score: number; isNotApplicable: boolean } {
  if (denominator <= 0) {
    return { value: 100, score: round1(weight), isNotApplicable: true };
  }
  const value = (numerator / denominator) * 100;
  const ratio = target > 0 ? Math.min(value / target, 1) : 1;
  return {
    value: round1(value),
    score: round1(weight * ratio),
    isNotApplicable: false,
  };
}

export function scoreLowerIsBetter(
  numerator: number,
  denominator: number,
  weight: number,
  target: number,
  zeroThreshold: number
): { value: number; score: number; isNotApplicable: boolean } {
  if (denominator <= 0) {
    return { value: 0, score: round1(weight), isNotApplicable: true };
  }
  const value = (numerator / denominator) * 100;
  let score = 0;
  if (value <= target) {
    score = weight;
  } else if (value < zeroThreshold && zeroThreshold > target) {
    score = weight * ((zeroThreshold - value) / (zeroThreshold - target));
  } else {
    score = 0;
  }
  return {
    value: round1(value),
    score: round1(score),
    isNotApplicable: false,
  };
}

export function scoreZeroTarget(
  incidentCount: number,
  contextDenominator: number,
  weight: number
): { value: number; score: number; isNotApplicable: boolean } {
  if (contextDenominator <= 0) {
    return { value: 0, score: round1(weight), isNotApplicable: true };
  }
  let score = 0;
  if (incidentCount <= 0) {
    score = weight;
  } else if (incidentCount === 1) {
    score = weight * 0.5;
  } else {
    score = 0;
  }
  return {
    value: incidentCount,
    score: round1(score),
    isNotApplicable: false,
  };
}

export function getRatingLevel(
  totalScore: number,
  thresholds: KpiRatingThresholds = DEFAULT_KPI_CONFIG.ratingThresholds
): KpiRatingLevel {
  if (totalScore >= thresholds.xuatSac) return 'Hoàn thành xuất sắc';
  if (totalScore >= thresholds.tot) return 'Hoàn thành tốt';
  if (totalScore >= thresholds.hoanThanh) return 'Hoàn thành';
  return 'Không hoàn thành';
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med =
    sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return round1(med);
}

function diffMinutes(startIso?: string, endIso?: string): number | undefined {
  if (!startIso || !endIso) return undefined;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end)) return undefined;
  return Math.max(0, round1((end - start) / 60000));
}

function calcClockPauseMinutes(
  intervals: Array<{ pausedAt: string; resumedAt?: string }> | undefined
): number {
  if (!intervals || intervals.length === 0) return 0;
  let totalMs = 0;
  intervals.forEach((iv) => {
    const start = new Date(iv.pausedAt).getTime();
    const end = iv.resumedAt ? new Date(iv.resumedAt).getTime() : Date.now();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      totalMs += end - start;
    }
  });
  return round1(totalMs / 60000);
}

// =================== TỔNG HỢP NHẬT KÝ THÀNH HỒ SƠ ===================

export function buildDossierSummaries(
  events: KpiEventRecord[],
  exclusions: KpiTimeExclusion[],
  norms: KpiTimeNorms,
  deNghiDungs: DeNghiDung[] = [],
  trips: TripRecord[] = []
): KpiDossierSummary[] {
  const byHoSo = new Map<string, KpiEventRecord[]>();
  events.forEach((ev) => {
    const arr = byHoSo.get(ev.hoSoId) || [];
    arr.push(ev);
    byHoSo.set(ev.hoSoId, arr);
  });

  // Cũng tạo summary cho các trip mới chưa có đủ KPI event
  trips.forEach((t) => {
    if (!byHoSo.has(t.id)) {
      byHoSo.set(t.id, []);
    }
  });

  const exclMap = new Map<string, Record<string, number>>();
  exclusions.forEach((ex) => {
    if (ex.trangThai !== 'da_duyet') return;
    const rec = exclMap.get(ex.hoSoId) || {};
    rec[ex.khau] = (rec[ex.khau] || 0) + Math.max(0, ex.soPhut);
    exclMap.set(ex.hoSoId, rec);
  });

  const bpStopByHoSo = new Map<string, DeNghiDung[]>();
  deNghiDungs.forEach((d) => {
    const arr = bpStopByHoSo.get(d.hoSoId) || [];
    arr.push(d);
    bpStopByHoSo.set(d.hoSoId, arr);
  });

  const tripById = new Map<string, TripRecord>();
  trips.forEach((t) => tripById.set(t.id, t));

  const summaries: KpiDossierSummary[] = [];

  byHoSo.forEach((evList, hoSoId) => {
    const trip = tripById.get(hoSoId);
    const sorted = [...evList].sort((a, b) => a.thoiDiem.localeCompare(b.thoiDiem));
    const first = sorted[0];

    const findLast = (moc: KpiEventRecord['moc']) => {
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].moc === moc) return sorted[i];
      }
      return undefined;
    };

    const m1 = findLast('M1');
    const m2 = findLast('M2');
    const m3 = findLast('M3');
    const m6 = findLast('M6');
    const m8 = findLast('M8');
    const m9 = findLast('M9');
    const m10 = findLast('M10');

    const baseEx = exclMap.get(hoSoId) || {};
    const bqlApprovedExcl = baseEx['BQL_60'] || 0;
    const soApprovedExcl = (baseEx['SO_60'] || 0) + (baseEx['M3_M2'] || 0) + (baseEx['M7_M6'] || 0);
    const uploadApprovedExcl = baseEx['OFFICE_UPLOAD_10'] || 0;

    // 1. Đồng hồ BQL: M1 (chủ tàu nộp) -> M2 (BQL ra thông báo) trừ TRA_CHU_TAU
    const bqlStartIso = trip?.bqlClock?.startedAt || m1?.thoiDiem || trip?.submittedAt;
    const bqlEndIso = trip?.bqlClock?.completedAt || m2?.thoiDiem || trip?.approvalNotice?.issuedAt;
    const rawBql = diffMinutes(bqlStartIso, bqlEndIso);
    const bqlPaused = calcClockPauseMinutes(trip?.bqlClock?.pausedIntervals) + bqlApprovedExcl;
    const netBql = rawBql !== undefined ? Math.max(0, round1(rawBql - bqlPaused)) : undefined;

    // 2. Đồng hồ Sở: BQL chấp thuận -> Sở tải Giấy phép lên hệ thống (trừ TRA_CHU_TAU, TRA_BQL_CANG, TAM_DUNG_THOI_TIET; KHÔNG trừ Office)
    const soStartIso = trip?.deptClock?.startedAt || m2?.thoiDiem || m3?.thoiDiem;
    const soEndIso = trip?.deptClock?.completedAt || m6?.thoiDiem || trip?.sealedAt;
    const rawSo = diffMinutes(soStartIso, soEndIso);
    const soPaused = calcClockPauseMinutes(trip?.deptClock?.pausedIntervals) + soApprovedExcl;
    const netSo = rawSo !== undefined ? Math.max(0, round1(rawSo - soPaused)) : undefined;

    // 3. Thời gian tải GP sau duyệt Office: Office issuedAt -> uploadedToSystemAt (M6)
    const officeIssuedIso = trip?.issuedAt || trip?.officeSubmissionRecord?.officeApprovedAt;
    const systemUploadedIso = trip?.officeSubmissionRecord?.uploadedToSystemAt || trip?.sealedAt || m6?.thoiDiem;
    const rawUpload = diffMinutes(officeIssuedIso, systemUploadedIso);
    const netUpload = rawUpload !== undefined ? Math.max(0, round1(rawUpload - uploadApprovedExcl)) : undefined;

    const totalExcl = round1(bqlPaused + soPaused + uploadApprovedExcl);

    const lateBql = netBql !== undefined && netBql > (norms.bql_limit || 60);
    const lateSo = netSo !== undefined && netSo > (norms.so_limit || 60);
    const lateUpload = netUpload !== undefined && netUpload > (norms.office_upload_limit || 10);
    const rawM8Confirm = diffMinutes(m8?.thoiDiemThucTe, m8?.thoiDiemXacNhan || m8?.thoiDiem);
    const lateM8 = rawM8Confirm !== undefined && rawM8Confirm > (norms.m8_confirm_limit || 15);

    const blockedSet = new Set<string>();
    let expired24h = trip?.status === 'HET_HIEU_LUC';
    sorted.forEach((ev) => {
      (ev.quyTacChan || []).forEach((r) => blockedSet.add(r));
      if (ev.hetHieuLuc24h) expired24h = true;
    });
    (trip?.rulesCheckResults || []).forEach((rr) => {
      if (rr.status === 'FAILED' && rr.severity === 'BLOCKING') {
        blockedSet.add(rr.ruleCode);
      }
    });

    const officeReturns = trip?.officeSubmissionRecord?.returns || [];
    const officeReturnErrorGroup =
      officeReturns.length > 0 ? officeReturns[officeReturns.length - 1].nhomLoi : undefined;
    const officeReturnedCount = officeReturns.length;
    const officeSubmitted = Boolean(
      trip?.officeSubmissionRecord?.submittedToOfficeAt ||
        trip?.status === 'DANG_TRINH_OFFICE' ||
        trip?.status === 'OFFICE_TRA_LAI' ||
        trip?.status === 'DA_CAP_PHEP' ||
        trip?.status === 'DA_XUAT_BEN' ||
        trip?.status === 'DA_CAP_BEN'
    );

    const ngay =
      (trip?.createdDate || m1?.thoiDiem || m2?.thoiDiem || first?.thoiDiem || new Date().toISOString()).slice(
        0,
        10
      );
    const metaEv = sorted.find((e) => e.phuongTienTen || e.benTen || e.maHoSo) || first;

    summaries.push({
      hoSoId,
      maHoSo: trip?.tripNumber || metaEv?.maHoSo || hoSoId,
      phuongTienId: trip?.vesselId || metaEv?.phuongTienId || '',
      phuongTienTen:
        trip ? `${trip.vesselName} (${trip.vesselRegNumber})` : metaEv?.phuongTienTen || 'Phương tiện VR-SB',
      benId: trip?.departurePortId || metaEv?.benId || 'PORT-01',
      benTen: trip?.departurePortName || metaEv?.benTen || 'Bến Lý Sơn (Đảo Lớn)',
      ngay,
      m1Time: bqlStartIso,
      m2Time: bqlEndIso,
      m3Time: m3?.thoiDiem,
      m6Time: systemUploadedIso,
      m7Time: systemUploadedIso,
      m8ActualTime: trip?.actualArrivalTime || trip?.actualDepartureTime || m8?.thoiDiemThucTe,
      m8ConfirmTime: trip?.arrivingConfirmation?.confirmedAt || m8?.thoiDiemXacNhan || m8?.thoiDiem,
      officerId: trip?.deptApprovedById || m3?.nguoiThucHienId || m6?.nguoiThucHienId,
      officerName: trip?.deptApprovedByName || resolveActorName(m3) || resolveActorName(m6),
      inspectorId: trip?.portInspection?.inspectorId || m2?.nguoiThucHienId,
      inspectorName: trip?.portInspection?.inspectorName || resolveActorName(m2),
      rawMinutes: {
        BQL_60: rawBql,
        SO_60: rawSo,
        OFFICE_UPLOAD_10: rawUpload,
        M3_M2: rawBql,
        M7_M2: rawSo,
        M7_M6: rawUpload,
        M8_CONFIRM: rawM8Confirm,
      },
      approvedExclusionMinutes: {
        BQL_60: round1(bqlPaused),
        SO_60: round1(soPaused),
        OFFICE_UPLOAD_10: round1(uploadApprovedExcl),
        M3_M2: round1(bqlPaused),
        M4_M3: 0,
        M5_M4: 0,
        M6_M5: 0,
        M7_M6: round1(uploadApprovedExcl),
        TOTAL: totalExcl,
      },
      netMinutes: {
        BQL_60: netBql,
        SO_60: netSo,
        OFFICE_UPLOAD_10: netUpload,
        M3_M2: netBql,
        M7_M2: netSo,
        M7_M6: netUpload,
        M8_CONFIRM: rawM8Confirm,
      },
      isLate: {
        BQL_60: lateBql,
        SO_60: lateSo,
        OFFICE_UPLOAD_10: lateUpload,
        M3_M2: lateBql,
        M4_M3: false,
        M5_M4: false,
        M6_M5: false,
        M7_M6: lateUpload,
        M7_M2: lateSo,
        M8_CONFIRM: lateM8,
        any: lateBql || lateSo || lateUpload,
      },
      returnedAtM4OrM5: officeReturnedCount > 0,
      returnedErrorGroup: officeReturnErrorGroup,
      officeSubmitted,
      officeReturnedCount,
      officeReturnErrorGroup,
      m9FaultStage: m9?.khauGayLoi,
      m9FaultActorId: m9?.nguoiThucHienId,
      m9Reason: m9?.maLyDo || m9?.ghiChu,
      m2HasPhoto:
        trip?.portInspection ? (trip.portInspection.photoUrls?.length || 0) > 0 : m2?.coAnh,
      m2HasLocation: trip?.portInspection
        ? Boolean(trip.portInspection.checkBerthPositionSafe ?? true)
        : m2?.coViTri,
      m2PostAuditError: Boolean(m2?.hauKiemPhatHienSai),
      m6OrderNumber: trip?.orderNumber || m6?.soLenh,
      m10Stars: m10?.soSao,
      blockedRules: Array.from(blockedSet),
      expired24h,
      arrivingConfirmedByBql: trip?.arrivingConfirmation?.confirmedByRole === 'PORT_STAFF',
      weatherPausedCount: trip?.status === 'TAM_DUNG_THOI_TIET' ? 1 : 0,
    });
  });

  return summaries.sort((a, b) => b.ngay.localeCompare(a.ngay));
}

// =================== BỘ LỌC KỲ & PHẠM VI ===================

export interface KpiDateRange {
  from: string;
  to: string;
  label: string;
}

export function getDateRangeForPeriod(
  periodType: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM',
  selectedMonth: string,
  selectedQuarter: string,
  selectedYear: string,
  customFrom: string,
  customTo: string
): KpiDateRange {
  if (periodType === 'MONTH') {
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${selectedMonth}-01`,
      to: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
      label: `Tháng ${String(m).padStart(2, '0')}/${y}`,
    };
  }
  if (periodType === 'QUARTER') {
    const [yStr, qStr] = selectedQuarter.split('-Q');
    const q = parseInt(qStr, 10);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const lastDay = new Date(Number(yStr), endMonth, 0).getDate();
    return {
      from: `${yStr}-${String(startMonth).padStart(2, '0')}-01`,
      to: `${yStr}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      label: `Quý ${q}/${yStr}`,
    };
  }
  if (periodType === 'YEAR') {
    return {
      from: `${selectedYear}-01-01`,
      to: `${selectedYear}-12-31`,
      label: `Năm ${selectedYear}`,
    };
  }
  return {
    from: customFrom || '2026-09-01',
    to: customTo || '2026-12-31',
    label: `Từ ${customFrom} đến ${customTo}`,
  };
}

export function getPreviousDateRange(
  periodType: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM',
  range: KpiDateRange
): KpiDateRange {
  if (periodType === 'MONTH') {
    const [y, m] = range.from.slice(0, 7).split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const lastDay = new Date(py, pm, 0).getDate();
    const ym = `${py}-${String(pm).padStart(2, '0')}`;
    return {
      from: `${ym}-01`,
      to: `${ym}-${String(lastDay).padStart(2, '0')}`,
      label: `Tháng ${String(pm).padStart(2, '0')}/${py}`,
    };
  }
  if (periodType === 'QUARTER') {
    const [y, m] = range.from.slice(0, 7).split('-').map(Number);
    const curQ = Math.ceil(m / 3);
    const prevQ = curQ === 1 ? 4 : curQ - 1;
    const py = curQ === 1 ? y - 1 : y;
    const startMonth = (prevQ - 1) * 3 + 1;
    const endMonth = prevQ * 3;
    const lastDay = new Date(py, endMonth, 0).getDate();
    return {
      from: `${py}-${String(startMonth).padStart(2, '0')}-01`,
      to: `${py}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      label: `Quý ${prevQ}/${py}`,
    };
  }
  const fromMs = new Date(`${range.from}T00:00:00`).getTime();
  const toMs = new Date(`${range.to}T00:00:00`).getTime();
  const span = Math.max(86400000, toMs - fromMs + 86400000);
  const prevTo = new Date(fromMs - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(fromMs - span).toISOString().slice(0, 10);
  return { from: prevFrom, to: prevTo, label: 'Kỳ trước' };
}

export function filterDossiersByRangeAndPort(
  dossiers: KpiDossierSummary[],
  range: KpiDateRange,
  portId: string
): KpiDossierSummary[] {
  return dossiers.filter((d) => {
    if (d.ngay < range.from || d.ngay > range.to) return false;
    if (portId !== 'ALL' && d.benId !== portId) return false;
    return true;
  });
}

export function filterWarningsByRangeAndPort(
  warnings: KpiDocumentWarning[],
  range: KpiDateRange,
  portId: string
): KpiDocumentWarning[] {
  return warnings.filter((w) => {
    const d = w.ngayPhatSinh.slice(0, 10);
    if (d < range.from || d > range.to) return false;
    if (portId !== 'ALL' && w.benId && w.benId !== portId) return false;
    return true;
  });
}

// =================== CHẤM ĐIỂM KPI CÁ NHÂN (MỤC 8) ===================

function buildDrilldown(
  dossiers: KpiDossierSummary[],
  evaluate: (d: KpiDossierSummary) => {
    status: 'DAT' | 'KHONG_DAT' | 'CANH_BAO';
    detail: string;
    stageText?: string;
    excl?: number;
  }
): KpiDrilldownRecord[] {
  return dossiers.map((d) => {
    const info = evaluate(d);
    return {
      id: d.hoSoId,
      maHoSo: d.maHoSo,
      phuongTien: d.phuongTienTen,
      benTen: d.benTen,
      ngay: d.ngay,
      chiTiet: info.detail,
      thoiGianKhau: info.stageText,
      loaiTruPhut: info.excl,
      trangThaiDat: info.status,
      dossier: d,
    };
  });
}

function evaluateIndicator(
  cfg: KpiIndicatorConfig,
  numerator: number,
  denominator: number,
  contextCount: number,
  drilldownRecords: KpiDrilldownRecord[]
): KpiIndicatorResult {
  let calc: { value: number; score: number; isNotApplicable: boolean };
  let valueDisplay = '';
  let targetDisplay = '';

  if (cfg.direction === 'HIGHER_BETTER') {
    calc = scoreHigherIsBetter(numerator, denominator, cfg.weight, cfg.target);
    valueDisplay = calc.isNotApplicable
      ? 'Không phát sinh'
      : `${formatViInteger(numerator)}/${formatViInteger(denominator)} (${formatViNumber(calc.value, 1)}%)`;
    targetDisplay = `≥ ${formatViNumber(cfg.target, 0)}%`;
  } else if (cfg.direction === 'LOWER_BETTER') {
    const N = cfg.zeroScoreThreshold ?? 15;
    calc = scoreLowerIsBetter(numerator, denominator, cfg.weight, cfg.target, N);
    valueDisplay = calc.isNotApplicable
      ? 'Không phát sinh'
      : `${formatViInteger(numerator)}/${formatViInteger(denominator)} (${formatViNumber(calc.value, 1)}%)`;
    targetDisplay = `≤ ${formatViNumber(cfg.target, 0)}% (0đ ≥ ${formatViNumber(N, 0)}%)`;
  } else {
    calc = scoreZeroTarget(numerator, contextCount, cfg.weight);
    valueDisplay = calc.isNotApplicable
      ? 'Không phát sinh'
      : `${formatViInteger(numerator)} vụ`;
    targetDisplay = '0 vụ';
  }

  return {
    code: cfg.code,
    name: cfg.name,
    description: cfg.description,
    direction: cfg.direction,
    numerator,
    denominator: cfg.direction === 'ZERO_TARGET' ? contextCount : denominator,
    value: calc.value,
    valueDisplay,
    targetDisplay,
    weight: cfg.weight,
    score: calc.score,
    isNotApplicable: calc.isNotApplicable,
    note: calc.isNotApplicable
      ? 'Mẫu số bằng 0 trong kỳ — tự động tính đủ điểm trọng số theo quy định.'
      : undefined,
    drilldownRecords,
  };
}

export function computePersonScorecard(
  staff: KpiStaffProfile,
  dossiers: KpiDossierSummary[],
  _warnings: KpiDocumentWarning[],
  config: KpiConfig
): KpiPersonScorecard {
  // Chỉ chấm KPI cho PORT_STAFF và OFFICER (Mục 8); không chấm Trưởng phòng / Lãnh đạo / Biên phòng
  const roleIndicators = config.indicators.filter((ind) => ind.role === staff.role);
  const norms = config.timeNorms;
  const results: KpiIndicatorResult[] = [];
  let relatedDossiersCount = 0;

  if (staff.role === 'OFFICER') {
    const assigned = dossiers.filter(
      (d) => d.officerId === staff.id || (!d.officerId && (d.m2Time || d.officeSubmitted))
    );
    relatedDossiersCount = assigned.length;
    const withSoClock = assigned.filter((d) => d.netMinutes.SO_60 !== undefined);
    const withUpload = assigned.filter((d) => d.netMinutes.OFFICE_UPLOAD_10 !== undefined);
    const officeSubmittedList = assigned.filter((d) => d.officeSubmitted);

    roleIndicators.forEach((cfg) => {
      if (cfg.code === 'CV-T1') {
        const limit = norms.so_limit || 60;
        const onTime = withSoClock.filter((d) => (d.netMinutes.SO_60 ?? 0) <= limit);
        results.push(
          evaluateIndicator(
            cfg,
            onTime.length,
            withSoClock.length,
            withSoClock.length,
            buildDrilldown(withSoClock, (d) => {
              const net = d.netMinutes.SO_60 ?? 0;
              return {
                status: net <= limit ? 'DAT' : 'KHONG_DAT',
                detail:
                  net <= limit
                    ? `Đúng hạn Sở (${formatViNumber(net, 1)}/${limit} phút)`
                    : `Trễ đồng hồ Sở (${formatViNumber(net, 1)}/${limit} phút)`,
                stageText: `${formatViNumber(net, 1)} phút`,
                excl: d.approvedExclusionMinutes.SO_60,
              };
            })
          )
        );
      } else if (cfg.code === 'CV-T2') {
        const limit = norms.office_upload_limit || 10;
        const onTime = withUpload.filter((d) => (d.netMinutes.OFFICE_UPLOAD_10 ?? 0) <= limit);
        results.push(
          evaluateIndicator(
            cfg,
            onTime.length,
            withUpload.length,
            withUpload.length,
            buildDrilldown(withUpload, (d) => {
              const net = d.netMinutes.OFFICE_UPLOAD_10 ?? 0;
              return {
                status: net <= limit ? 'DAT' : 'KHONG_DAT',
                detail:
                  net <= limit
                    ? `Tải GP kịp thời (${formatViNumber(net, 1)}/${limit} phút)`
                    : `Tải GP trễ (${formatViNumber(net, 1)}/${limit} phút)`,
                stageText: `${formatViNumber(net, 1)} phút`,
                excl: d.approvedExclusionMinutes.OFFICE_UPLOAD_10,
              };
            })
          )
        );
      } else if (cfg.code === 'CV-C1') {
        const errList = officeSubmittedList.filter(
          (d) => d.officeReturnErrorGroup === 'loi_xu_ly'
        );
        results.push(
          evaluateIndicator(
            cfg,
            errList.length,
            officeSubmittedList.length,
            officeSubmittedList.length,
            buildDrilldown(officeSubmittedList, (d) => {
              const isErr = d.officeReturnErrorGroup === 'loi_xu_ly';
              return {
                status: isErr ? 'KHONG_DAT' : 'DAT',
                detail: isErr
                  ? 'Office trả lại do lỗi xử lý của Chuyên viên'
                  : d.officeReturnErrorGroup === 'loi_ho_so'
                  ? 'Office trả lại do lỗi hồ sơ (không trừ KPI Chuyên viên)'
                  : 'Không bị Office trả lại do lỗi xử lý',
              };
            })
          )
        );
      }
    });
  } else if (staff.role === 'PORT_STAFF') {
    const portDossiers = dossiers.filter(
      (d) => d.inspectorId === staff.id || (!d.inspectorId && d.m2Time)
    );
    relatedDossiersCount = portDossiers.length;

    roleIndicators.forEach((cfg) => {
      if (cfg.code === 'BQL-T1') {
        const limit = norms.bql_limit || 60;
        const withBqlClock = portDossiers.filter((d) => d.netMinutes.BQL_60 !== undefined);
        const onTime = withBqlClock.filter((d) => (d.netMinutes.BQL_60 ?? 0) <= limit);
        results.push(
          evaluateIndicator(
            cfg,
            onTime.length,
            withBqlClock.length,
            withBqlClock.length,
            buildDrilldown(withBqlClock, (d) => {
              const net = d.netMinutes.BQL_60 ?? 0;
              return {
                status: net <= limit ? 'DAT' : 'KHONG_DAT',
                detail:
                  net <= limit
                    ? `Đúng hạn BQL (${formatViNumber(net, 1)}/${limit} phút)`
                    : `Trễ đồng hồ BQL (${formatViNumber(net, 1)}/${limit} phút)`,
                stageText: `${formatViNumber(net, 1)} phút`,
                excl: d.approvedExclusionMinutes.BQL_60,
              };
            })
          )
        );
      } else if (cfg.code === 'BQL-C1') {
        const checkedList = portDossiers.filter((d) => Boolean(d.m2Time));
        const withPhoto = checkedList.filter((d) => Boolean(d.m2HasPhoto));
        results.push(
          evaluateIndicator(
            cfg,
            withPhoto.length,
            checkedList.length,
            checkedList.length,
            buildDrilldown(checkedList, (d) => ({
              status: d.m2HasPhoto ? 'DAT' : 'KHONG_DAT',
              detail: d.m2HasPhoto ? 'Đủ ảnh hiện trường kiểm tra 8 nhóm' : 'Thiếu ảnh hiện trường đính kèm',
            }))
          )
        );
      } else if (cfg.code === 'BQL-C2') {
        const arrivals = portDossiers.filter((d) => d.arrivingConfirmedByBql);
        const onTime = arrivals.filter(
          (d) => (d.netMinutes.M8_CONFIRM ?? 0) <= (norms.m8_confirm_limit || 15)
        );
        results.push(
          evaluateIndicator(
            cfg,
            onTime.length,
            arrivals.length,
            arrivals.length,
            buildDrilldown(arrivals, (d) => {
              const mins = d.netMinutes.M8_CONFIRM ?? 0;
              return {
                status: mins <= (norms.m8_confirm_limit || 15) ? 'DAT' : 'CANH_BAO',
                detail: `Xác nhận cập bến dự phòng trong ${formatViNumber(mins, 1)} phút`,
                stageText: `${formatViNumber(mins, 1)} phút`,
              };
            })
          )
        );
      }
    });
  }

  const maxScore = round1(roleIndicators.reduce((sum, i) => sum + i.weight, 0));
  const rawTotal = round1(results.reduce((sum, i) => sum + i.score, 0));
  const totalScore = maxScore > 0 ? Math.min(100, rawTotal) : 100;

  return {
    staff,
    indicators: results,
    totalScore,
    maxScore,
    rating: getRatingLevel(totalScore, config.ratingThresholds),
    totalDossiersCount: relatedDossiersCount,
  };
}

// =================== THỐNG KÊ NGHIỆP VỤ BIÊN PHÒNG & TOÀN ĐƠN VỊ (KHÔNG CHẤM KPI BP) ===================

export function computeBpKpiSummary(
  deNghiDungs: DeNghiDung[],
  kiemSoatList: KiemSoatTaiBen[],
  trips: TripRecord[]
): BpKpiSummaryMetrics {
  const reasonMap = new Map<string, number>();

  deNghiDungs.forEach((d) => {
    reasonMap.set(d.maLyDo, (reasonMap.get(d.maLyDo) || 0) + 1);
  });

  const byReason = Array.from(reasonMap.entries())
    .map(([maLyDo, count]) => ({
      maLyDo,
      label: getBpStopReasonLabel(maLyDo),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const departureControlsCount = trips.filter((t) => Boolean(t.bpDepartureControl)).length;
  const r12ReturnCount = trips.filter(
    (t) => t.lastReturnInfo?.benTra === 'BIEN_PHONG' || t.bpDepartureControl?.action === 'TRA_CHU_TAU_R12'
  ).length;
  const arrivalConfirmedByBpCount = trips.filter(
    (t) => t.arrivingConfirmation && t.arrivingConfirmation.confirmedByRole !== 'PORT_STAFF'
  ).length;
  const arrivalConfirmedByBqlCount = trips.filter(
    (t) => t.arrivingConfirmation?.confirmedByRole === 'PORT_STAFF'
  ).length;

  return {
    totalStopProposals: deNghiDungs.length,
    activeStopProposals: deNghiDungs.filter((d) => d.trangThai === 'dang_hieu_luc').length,
    dinhChiCount: deNghiDungs.length,
    byReason,
    departureControlsCount: Math.max(departureControlsCount, kiemSoatList.length),
    r12ReturnCount,
    arrivalConfirmedByBpCount,
    arrivalConfirmedByBqlCount,
    totalControlChecks: Math.max(departureControlsCount, kiemSoatList.length),
    discrepancyCount: kiemSoatList.filter((k) => k.ketQua === 'chenh_lech').length + r12ReturnCount,
  };
}

export function computeUnitMetrics(
  dossiers: KpiDossierSummary[],
  norms: KpiTimeNorms,
  bpMetrics?: BpKpiSummaryMetrics,
  trips: TripRecord[] = []
): KpiUnitMetrics {
  const bqlLimit = norms.bql_limit || 60;
  const soLimit = norms.so_limit || 60;
  const uploadLimit = norms.office_upload_limit || 10;

  const bqlCompleted = dossiers.filter((d) => d.netMinutes.BQL_60 !== undefined);
  const bqlOnTime = bqlCompleted.filter((d) => (d.netMinutes.BQL_60 ?? 0) <= bqlLimit);

  const soCompleted = dossiers.filter((d) => d.netMinutes.SO_60 !== undefined);
  const soOnTime = soCompleted.filter((d) => (d.netMinutes.SO_60 ?? 0) <= soLimit);

  const uploadCompleted = dossiers.filter((d) => d.netMinutes.OFFICE_UPLOAD_10 !== undefined);
  const uploadOnTime = uploadCompleted.filter(
    (d) => (d.netMinutes.OFFICE_UPLOAD_10 ?? 0) <= uploadLimit
  );

  const rated = dossiers.filter((d) => d.m10Stars !== undefined);
  const satisfied = rated.filter((d) => (d.m10Stars ?? 0) >= 4);
  const expired24hCount = dossiers.filter((d) => d.expired24h).length;

  const bqlVals = bqlCompleted.map((d) => d.netMinutes.BQL_60!).filter((v) => v !== undefined);
  const soVals = soCompleted.map((d) => d.netMinutes.SO_60!).filter((v) => v !== undefined);
  const uploadVals = uploadCompleted
    .map((d) => d.netMinutes.OFFICE_UPLOAD_10!)
    .filter((v) => v !== undefined);

  const medBql = computeMedian(bqlVals);
  const medSo = computeMedian(soVals);
  const medUpload = computeMedian(uploadVals);

  const stageMedians: KpiUnitMetrics['stageMedians'] = [
    {
      stageKey: 'BQL_60',
      label: 'Đồng hồ BQL Cảng (≤ 60p)',
      medianMinutes: medBql,
      normMinutes: bqlLimit,
      isOverNorm: medBql > bqlLimit,
    },
    {
      stageKey: 'SO_60',
      label: 'Đồng hồ Sở Xây dựng (≤ 60p)',
      medianMinutes: medSo,
      normMinutes: soLimit,
      isOverNorm: medSo > soLimit,
    },
    {
      stageKey: 'OFFICE_UPLOAD_10',
      label: 'Tải Giấy phép sau Office (≤ 10p)',
      medianMinutes: medUpload,
      normMinutes: uploadLimit,
      isOverNorm: medUpload > uploadLimit,
    },
  ];

  // Chuỗi tỷ lệ đúng hạn theo ngày (Sở + BQL)
  const dailyMap = new Map<string, { total: number; onTime: number }>();
  soCompleted.forEach((d) => {
    const cur = dailyMap.get(d.ngay) || { total: 0, onTime: 0 };
    cur.total += 1;
    if ((d.netMinutes.SO_60 ?? 0) <= soLimit) cur.onTime += 1;
    dailyMap.set(d.ngay, cur);
  });

  const dailyOnTimeSeries = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      total: v.total,
      onTime: v.onTime,
      onTimeRate: v.total > 0 ? round1((v.onTime / v.total) * 100) : 100,
    }));

  // Đếm R1 - R12
  const ruleCounts = new Map<string, number>();
  for (let i = 1; i <= 12; i++) {
    ruleCounts.set(`R${i}`, 0);
  }
  dossiers.forEach((d) => {
    d.blockedRules.forEach((r) => {
      if (ruleCounts.has(r)) {
        ruleCounts.set(r, (ruleCounts.get(r) || 0) + 1);
      }
    });
  });
  if (bpMetrics) {
    ruleCounts.set('R10', (ruleCounts.get('R10') || 0) + bpMetrics.activeStopProposals);
    ruleCounts.set('R12', (ruleCounts.get('R12') || 0) + bpMetrics.r12ReturnCount);
  }

  const ruleBlockSeries = Array.from(ruleCounts.entries()).map(([rule, count]) => ({
    rule,
    count,
  }));

  const officeReturnByLoiHoSo = dossiers
    .filter((d) => d.officeReturnErrorGroup === 'loi_ho_so')
    .reduce((acc, d) => acc + (d.officeReturnedCount || 1), 0);
  const officeReturnByLoiXuLy = dossiers
    .filter((d) => d.officeReturnErrorGroup === 'loi_xu_ly')
    .reduce((acc, d) => acc + (d.officeReturnedCount || 1), 0);

  const weatherSuspensionsCount = trips.filter((t) =>
    t.statusLogs.some((l) => l.toStatus === 'TAM_DUNG_THOI_TIET')
  ).length;
  const totalPassengers = trips.reduce((acc, t) => acc + (t.passengerCount || 0), 0);
  const totalCargoTons = round1(trips.reduce((acc, t) => acc + (t.cargoTons || 0), 0));

  return {
    totalDossiers: dossiers.length,
    bqlCompletedCount: bqlCompleted.length,
    bqlOnTimeCount: bqlOnTime.length,
    bqlOnTimeRate:
      bqlCompleted.length > 0 ? round1((bqlOnTime.length / bqlCompleted.length) * 100) : 100,
    soCompletedCount: soCompleted.length,
    soOnTimeCount: soOnTime.length,
    soOnTimeRate:
      soCompleted.length > 0 ? round1((soOnTime.length / soCompleted.length) * 100) : 100,
    completedToM7Count: soCompleted.length,
    onTimeOverallCount: soOnTime.length,
    onTimeOverallRate:
      soCompleted.length > 0 ? round1((soOnTime.length / soCompleted.length) * 100) : 100,
    leaderOnTimeCount: uploadOnTime.length,
    leaderTotalCount: uploadCompleted.length,
    leaderOnTimeRate:
      uploadCompleted.length > 0
        ? round1((uploadOnTime.length / uploadCompleted.length) * 100)
        : 100,
    officeUploadOnTimeRate:
      uploadCompleted.length > 0
        ? round1((uploadOnTime.length / uploadCompleted.length) * 100)
        : 100,
    officeReturnByLoiHoSo,
    officeReturnByLoiXuLy,
    weatherSuspensionsCount,
    totalPassengers,
    totalCargoTons,
    satisfactionCount: satisfied.length,
    satisfactionTotalCount: rated.length,
    satisfactionRate:
      rated.length > 0 ? round1((satisfied.length / rated.length) * 100) : 100,
    expired24hCount,
    medianOverallMinutes: medSo,
    stageMedians,
    dailyOnTimeSeries,
    ruleBlockSeries,
    bpMetrics,
  };
}

export interface OverdueStageRow {
  id: string;
  hoSoId: string;
  maHoSo: string;
  ngay: string;
  phuongTienTen: string;
  benTen: string;
  khau: KpiStageKey;
  khauLabel: string;
  actorId?: string;
  actorName: string;
  rawMinutes: number;
  excludedMinutes: number;
  netMinutes: number;
  normMinutes: number;
  lateMinutes: number;
  exclusions: KpiTimeExclusion[];
}

export const STAGE_LABELS: Record<KpiStageKey, string> = {
  BQL_60: 'BQL Cảng kiểm tra & Chấp thuận (≤ 60p)',
  SO_60: 'Sở Xây dựng xử lý & Phát hành GP (≤ 60p)',
  OFFICE_UPLOAD_10: 'Tải GP lên hệ thống sau Office (≤ 10p)',
  M3_M2: 'BQL → Sở tiếp nhận',
  M4_M3: 'Trình Office',
  M5_M4: 'Duyệt Office',
  M6_M5: 'Phát hành Giấy phép',
  M7_M6: 'Tải lên hệ thống',
};

export function extractOverdueStageRows(
  dossiers: KpiDossierSummary[],
  exclusions: KpiTimeExclusion[],
  norms: KpiTimeNorms
): OverdueStageRow[] {
  const rows: OverdueStageRow[] = [];

  const stageDefs: Array<{
    key: KpiStageKey;
    norm: number;
    actor: (d: KpiDossierSummary) => { id?: string; name?: string };
  }> = [
    {
      key: 'BQL_60',
      norm: norms.bql_limit || 60,
      actor: (d) => ({ id: d.inspectorId, name: d.inspectorName }),
    },
    {
      key: 'SO_60',
      norm: norms.so_limit || 60,
      actor: (d) => ({ id: d.officerId, name: d.officerName }),
    },
    {
      key: 'OFFICE_UPLOAD_10',
      norm: norms.office_upload_limit || 10,
      actor: (d) => ({ id: d.officerId, name: d.officerName }),
    },
  ];

  dossiers.forEach((d) => {
    stageDefs.forEach((st) => {
      const raw = d.rawMinutes[st.key];
      const net = d.netMinutes[st.key];
      if (raw === undefined || net === undefined) return;
      const relatedExcl = exclusions.filter(
        (e) => e.hoSoId === d.hoSoId && e.khau === st.key
      );
      if (net > st.norm || relatedExcl.length > 0) {
        const actor = st.actor(d);
        rows.push({
          id: `${d.hoSoId}__${st.key}`,
          hoSoId: d.hoSoId,
          maHoSo: d.maHoSo,
          ngay: d.ngay,
          phuongTienTen: d.phuongTienTen,
          benTen: d.benTen,
          khau: st.key,
          khauLabel: STAGE_LABELS[st.key],
          actorId: actor.id,
          actorName: actor.name || 'Chưa xác định',
          rawMinutes: raw,
          excludedMinutes: d.approvedExclusionMinutes[st.key] || 0,
          netMinutes: round1(net),
          normMinutes: st.norm,
          lateMinutes: net > st.norm ? roundOverdueUp(net - st.norm) : 0,
          exclusions: relatedExcl,
        });
      }
    });
  });

  return rows.sort((a, b) => b.lateMinutes - a.lateMinutes || b.ngay.localeCompare(a.ngay));
}
