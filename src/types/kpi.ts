/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole } from './index';

export type KpiMilestoneCode =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9'
  | 'M10';

export type KpiErrorGroup = 'loi_ho_so' | 'loi_xu_ly';
export type KpiFaultStage = 'CV' | 'TP' | 'VT' | 'KT';
export type KpiStageKey = 'BQL_60' | 'SO_60' | 'OFFICE_UPLOAD_10' | 'M3_M2' | 'M4_M3' | 'M5_M4' | 'M6_M5' | 'M7_M6';
export type KpiExclusionReason =
  | 'cho_bo_sung_ho_so'
  | 'tam_dung_thoi_tiet'
  | 'cho_bql_cang'
  | 'su_co_he_thong';
export type KpiExclusionStatus = 'cho_duyet' | 'da_duyet' | 'tu_choi';

// Chỉ chấm điểm Chuyên viên Sở (OFFICER) và Nhân viên BQL Cảng (PORT_STAFF).
// Trưởng phòng / Lãnh đạo / Biên phòng KHÔNG bị chấm điểm KPI xử lý.
export type KpiEvaluatedRole = 'OFFICER' | 'PORT_STAFF' | 'DEPT_HEAD' | 'CLERK';

export interface KpiEventRecord {
  id: string;
  hoSoId: string;
  maHoSo?: string;
  phuongTienId?: string;
  phuongTienTen?: string;
  benId?: string;
  benTen?: string;
  donVi?: string;
  moc: KpiMilestoneCode;
  thoiDiem: string; // ISO datetime
  nguoiThucHienId?: string;
  nguoiThucHien?: string;
  vaiTro: UserRole;
  ketQua: string;
  maLyDo?: string;
  nhomLoi?: KpiErrorGroup;
  khauGayLoi?: KpiFaultStage;
  coAnh?: boolean;
  coViTri?: boolean;
  ketLuanDat?: boolean;
  hauKiemPhatHienSai?: boolean;
  soLenh?: string;
  loiCapSo?: boolean;
  thoiDiemThucTe?: string;
  thoiDiemXacNhan?: string;
  soSao?: number;
  quyTacChan?: string[];
  hetHieuLuc24h?: boolean;
  ghiChu?: string;
  bqlNetMinutes?: number;
  deptNetMinutes?: number;
  officeUploadMinutes?: number;
}

export interface KpiTimeExclusion {
  id: string;
  hoSoId: string;
  maHoSo?: string;
  khau: KpiStageKey;
  soPhut: number;
  lyDo: KpiExclusionReason;
  ghiChu?: string;
  nguoiDeNghiId?: string;
  nguoiDeNghi: string;
  ngayDeNghi: string;
  nguoiDuyetId?: string;
  nguoiDuyet?: string;
  ngayDuyet?: string;
  lyDoTuChoi?: string;
  trangThai: KpiExclusionStatus;
}

export interface KpiDocumentWarning {
  canhBaoId: string;
  loai: 'R2' | 'R6';
  phuongTienId?: string;
  phuongTien: string;
  benId?: string;
  ngayPhatSinh: string;
  ngayCapNhat?: string;
  ngayHetHan: string;
  nguoiPhuTrachId?: string;
}

export interface KpiTimeNorms {
  bql_limit: number;          // Mặc định 60 phút (BQL Cảng: từ CHO_KIEM_TRA -> DA_CHAP_THUAN, trừ TRA_CHU_TAU)
  so_limit: number;           // Mặc định 60 phút (Sở: từ CHO_SO_XU_LY -> DA_CAP_PHEP, trừ TRA_CHU_TAU, TRA_BQL_CANG, TAM_DUNG_THOI_TIET)
  office_upload_limit: number;// Mặc định 10 phút (Tải Giấy phép lên app sau duyệt Office)
  m3_m2: number;              // Giữ tương thích hiển thị phân rã
  m4_m3: number;
  m5_m4: number;
  m6_m5: number;
  m7_m6: number;
  total_m7_m2: number;        // Giữ alias = 60 phút
  m8_confirm_limit: number;
  r6_update_days: number;
}

export type KpiIndicatorDirection = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'ZERO_TARGET';

export interface KpiIndicatorConfig {
  code: string;
  name: string;
  description: string;
  role: KpiEvaluatedRole;
  direction: KpiIndicatorDirection;
  weight: number;
  target: number;
  zeroScoreThreshold?: number;
  unit: '%' | 'vụ';
}

export interface KpiRatingThresholds {
  xuatSac: number;
  tot: number;
  hoanThanh: number;
}

export interface KpiExcelColumnConfig {
  key: string;
  header: string;
  enabled: boolean;
}

export interface KpiConfig {
  timeNorms: KpiTimeNorms;
  indicators: KpiIndicatorConfig[];
  ratingThresholds: KpiRatingThresholds;
  excelSummaryColumns: KpiExcelColumnConfig[];
  excelDetailColumns: KpiExcelColumnConfig[];
}

export interface KpiAuditEntry {
  id: string;
  thoiDiem: string;
  nguoiThucHien: string;
  vaiTro: UserRole;
  loai: 'DUYET_LOAI_TRU' | 'TU_CHOI_LOAI_TRU' | 'SUA_CAU_HINH' | 'TAO_LAI_DU_LIEU';
  moTa: string;
  giaTriCu?: string;
  giaTriMoi?: string;
}

export interface KpiStaffProfile {
  id: string;
  fullName: string;
  role: KpiEvaluatedRole;
  roleLabel: string;
  department: string;
}

export interface KpiDossierSummary {
  hoSoId: string;
  maHoSo: string;
  phuongTienId?: string;
  phuongTienTen: string;
  benId?: string;
  benTen: string;
  ngay: string;
  m1Time?: string;
  m2Time?: string;
  m3Time?: string;
  m4Time?: string;
  m5Time?: string;
  m6Time?: string;
  m7Time?: string;
  m8ActualTime?: string;
  m8ConfirmTime?: string;
  officerId?: string;
  officerName?: string;
  deptHeadId?: string;
  deptHeadName?: string;
  leaderId?: string;
  leaderName?: string;
  clerkId?: string;
  clerkName?: string;
  inspectorId?: string;
  inspectorName?: string;
  bqlNetMinutes?: number;
  deptNetMinutes?: number;
  officeUploadMinutes?: number;
  rawMinutes: {
    BQL_60?: number;
    SO_60?: number;
    OFFICE_UPLOAD_10?: number;
    M3_M2?: number;
    M4_M3?: number;
    M5_M4?: number;
    M6_M5?: number;
    M7_M6?: number;
    M7_M2?: number;
    M8_CONFIRM?: number;
  };
  approvedExclusionMinutes: {
    BQL_60: number;
    SO_60: number;
    OFFICE_UPLOAD_10: number;
    M3_M2: number;
    M4_M3: number;
    M5_M4: number;
    M6_M5: number;
    M7_M6: number;
    TOTAL: number;
  };
  netMinutes: {
    BQL_60?: number;
    SO_60?: number;
    OFFICE_UPLOAD_10?: number;
    M3_M2?: number;
    M4_M3?: number;
    M5_M4?: number;
    M6_M5?: number;
    M7_M6?: number;
    M7_M2?: number;
    M8_CONFIRM?: number;
  };
  isLate: {
    BQL_60: boolean;
    SO_60: boolean;
    OFFICE_UPLOAD_10: boolean;
    M3_M2: boolean;
    M4_M3: boolean;
    M5_M4: boolean;
    M6_M5: boolean;
    M7_M6: boolean;
    M7_M2: boolean;
    M8_CONFIRM: boolean;
    any: boolean;
  };
  returnedAtM4OrM5?: boolean;
  returnedErrorGroup?: KpiErrorGroup;
  returnedReason?: string;
  officeSubmitted?: boolean;
  officeReturnedCount?: number;
  officeReturnErrorGroup?: KpiErrorGroup;
  arrivingConfirmedByBql?: boolean;
  weatherPausedCount?: number;
  m9FaultStage?: KpiFaultStage;
  m9FaultActorId?: string;
  m9Reason?: string;
  m2HasPhoto?: boolean;
  m2HasLocation?: boolean;
  m2PostAuditError?: boolean;
  m6OrderNumber?: string;
  m6NumberError?: boolean;
  m10Stars?: number;
  blockedRules: string[];
  expired24h: boolean;
}

export interface KpiDrilldownRecord {
  id: string;
  maHoSo: string;
  phuongTien: string;
  benTen: string;
  ngay: string;
  chiTiet: string;
  thoiGianKhau?: string;
  loaiTruPhut?: number;
  trangThaiDat: 'DAT' | 'KHONG_DAT' | 'CANH_BAO';
  dossier?: KpiDossierSummary;
  warning?: KpiDocumentWarning;
}

export interface KpiIndicatorResult {
  code: string;
  name: string;
  description: string;
  direction: KpiIndicatorDirection;
  numerator: number;
  denominator: number;
  value: number;
  valueDisplay: string;
  targetDisplay: string;
  weight: number;
  score: number;
  isNotApplicable: boolean;
  note?: string;
  drilldownRecords: KpiDrilldownRecord[];
}

export type KpiRatingLevel =
  | 'Hoàn thành xuất sắc'
  | 'Hoàn thành tốt'
  | 'Hoàn thành'
  | 'Không hoàn thành';

export interface KpiPersonScorecard {
  staff: KpiStaffProfile;
  indicators: KpiIndicatorResult[];
  totalScore: number;
  maxScore: number;
  rating: KpiRatingLevel;
  previousScore?: number;
  scoreDelta?: number;
  quarterCumulativeScore?: number;
  yearCumulativeScore?: number;
  totalDossiersCount: number;
}

export interface BpKpiSummaryMetrics {
  totalStopProposals: number;
  activeStopProposals: number;
  dinhChiCount: number;
  byReason: Array<{
    maLyDo: string;
    label: string;
    count: number;
  }>;
  departureControlsCount: number;
  r12ReturnCount: number;
  arrivalConfirmedByBpCount: number;
  arrivalConfirmedByBqlCount: number;
  totalControlChecks: number;
  discrepancyCount: number;
}

export interface KpiUnitMetrics {
  totalDossiers: number;
  bqlCompletedCount: number;
  bqlOnTimeCount: number;
  bqlOnTimeRate: number;
  soCompletedCount: number;
  soOnTimeCount: number;
  soOnTimeRate: number;
  completedToM7Count: number;
  onTimeOverallCount: number;
  onTimeOverallRate: number;
  leaderOnTimeCount: number;
  leaderTotalCount: number;
  leaderOnTimeRate: number;
  officeUploadOnTimeRate: number;
  officeReturnByLoiHoSo: number;
  officeReturnByLoiXuLy: number;
  weatherSuspensionsCount: number;
  totalPassengers: number;
  totalCargoTons: number;
  satisfactionCount: number;
  satisfactionTotalCount: number;
  satisfactionRate: number;
  expired24hCount: number;
  medianOverallMinutes: number;
  stageMedians: Array<{
    stageKey: KpiStageKey;
    label: string;
    medianMinutes: number;
    normMinutes: number;
    isOverNorm: boolean;
  }>;
  dailyOnTimeSeries: Array<{
    date: string;
    label: string;
    total: number;
    onTime: number;
    onTimeRate: number;
  }>;
  ruleBlockSeries: Array<{
    rule: string;
    count: number;
  }>;
  bpMetrics?: BpKpiSummaryMetrics;
}

