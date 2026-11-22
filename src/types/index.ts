/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Vai trò người dùng
export type UserRole =
  | 'UNASSIGNED'      // Chưa được phân quyền (mới đăng nhập Gmail)
  | 'ADMIN'           // Quản trị hệ thống (QUAN_TRI)
  | 'LEADER'          // Lãnh đạo Sở Xây dựng (LANH_DAO_SO - chỉ xem trên app, ký trên Office)
  | 'DEPT_HEAD'       // Trưởng phòng An toàn giao thông (TRUONG_PHONG - giám sát, KPI, duyệt loại trừ trễ hạn)
  | 'OFFICER'         // Chuyên viên Phòng An toàn giao thông (CHUYEN_VIEN)
  | 'CLERK'           // Văn thư (tài khoản dự phòng / kế thừa lịch sử, không bắt buộc trong quy trình mới)
  | 'PORT_STAFF'      // Nhân viên Ban Quản lý cảng (BQL_CANG - gắn với bến & ca trực)
  | 'CAPTAIN'         // Chủ tàu / Thuyền trưởng / Người làm thủ tục (CHU_TAU)
  | 'DUTY_OFFICER'    // Cán bộ trực (kế thừa)
  | 'VERIFIER'        // Người xác thực công khai
  | 'BP_TRUC'         // Cán bộ trực Biên phòng (BIEN_PHONG - kiểm soát cuối cùng tại bến)
  | 'BP_CHIHUY';      // Chỉ huy Đồn Biên phòng (BIEN_PHONG)

export type PortId = 'PORT-01' | 'PORT-02' | string;

export interface UserAccount {
  id: string;
  uid?: string;
  username: string;
  password?: string;
  fullName: string;
  role: UserRole;
  phone: string;
  department: string;
  email?: string;
  avatar?: string;
  signatureImage?: string;
  sealImage?: string;
  assignedVesselIds?: string[]; // Dành cho Thuyền trưởng / Chủ tàu (1 tàu duy nhất)
  assignedPortId?: PortId;      // Dành cho BQL_CANG và BIEN_PHONG (PORT-01 Đảo Lớn | PORT-02 Đảo Bé)
  status?: 'ACTIVE' | 'LOCKED';
  isActive?: boolean;
  assignedByEmail?: string;
  assignedAt?: string;
  createdAt?: string;
  lastLogin?: string;
  notes?: string;
  isPreAssigned?: boolean;
}

// 18 Trạng thái hồ sơ chuẩn theo đặc tả quy trình
export type TripStatus =
  | 'NHAP'                 // Nháp
  | 'CHO_KIEM_TRA'         // Chủ tàu đã nộp -> Chờ BQL Cảng kiểm tra
  | 'TRA_CHU_TAU'          // BQL / Chuyên viên / Biên phòng trả lại Chủ tàu
  | 'KHONG_CHAP_THUAN'     // BQL Cảng không chấp thuận -> Đóng hồ sơ
  | 'DA_CHAP_THUAN'        // BQL Cảng đã cấp Thông báo chấp thuận (chuyển Sở)
  | 'CHO_SO_XU_LY'         // Chờ Chuyên viên Sở Xây dựng xử lý
  | 'TRA_BQL_CANG'         // Chuyên viên Sở trả lại BQL Cảng
  | 'TAM_DUNG_THOI_TIET'   // Tạm dừng do thời tiết
  | 'DA_DUYET'             // Chuyên viên đã duyệt dự thảo Giấy phép (chờ trình Office)
  | 'DANG_TRINH_OFFICE'    // Đã trình ký trên Office
  | 'OFFICE_TRA_LAI'       // Office (Trưởng phòng / Lãnh đạo Sở) trả lại
  | 'DA_CAP_PHEP'          // Đã tải Giấy phép có dấu đỏ lên app (Hiệu lực 24h)
  | 'THU_HOI'              // Đã thu hồi Giấy phép
  | 'HET_HIEU_LUC'         // Hết hiệu lực (> 24h chưa xuất bến)
  | 'DA_RUT'               // Chủ tàu rút hồ sơ trước khi cấp phép
  | 'TAM_GIU_BIEN_PHONG'   // Biên phòng tạm giữ / đình chỉ xuất bến (có bất thường)
  | 'DA_XUAT_BEN'          // Biên phòng cho xuất bến (đang hành trình)
  | 'DA_CAP_BEN';          // Đã cập bến (hoàn thành chuyến)

export type LegacyTripStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PORT_INSPECTING'
  | 'PORT_REJECTED'
  | 'PORT_APPROVED'
  | 'DEPT_PROCESSING'
  | 'PENDING_LEADER_APPROVAL'
  | 'APPROVED_ISSUED'
  | 'UNDERWAY'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'WEATHER_SUSPENDED'
  | 'BP_STOP_PROPOSED'
  | 'ORDER_SUSPENDED';

export type AnyTripStatusInput = TripStatus | LegacyTripStatus;

const LEGACY_TRIP_STATUS_TO_CANONICAL: Record<string, TripStatus> = {
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
  return LEGACY_TRIP_STATUS_TO_CANONICAL[raw] || (raw as TripStatus);
}

// Phương tiện thủy nội địa cấp VR-SB
export interface Vessel {
  id: string;
  regNumber: string;         // Số đăng ký (VD: QNg-0237 hoặc QNg-0828)
  callSign?: string;         // Hô hiệu (VD: QNG 0237)
  name: string;              // Tên tàu (VD: An Bình 02)
  vesselType: string;        // Loại tàu (Khách cao tốc VR-SB)
  maxPassengers: number;     // Sức chở hành khách (người)
  maxCargoTons: number;      // Trọng tải hàng hóa (tấn)
  minCrew: number;           // Định biên thuyền viên tối thiểu
  maxWindForce: number;      // Ngưỡng cấp gió an toàn tối đa (cấp B Beaufort)
  maxWaveHeight: number;     // Chiều cao sóng tối đa cho phép (m)
  registryExpireDate: string;// Hạn đăng kiểm (YYYY-MM-DD)
  operatingLicenseExpireDate: string; // Hạn giấy phép hoạt động
  techSafetyExpireDate?: string;      // Hạn GCN an toàn kỹ thuật và BVMT
  civilInsuranceExpireDate?: string;  // Hạn bảo hiểm TNDS
  registryCertNo?: string;   // Số GCN đăng ký
  registryDate?: string;     // Ngày cấp đăng ký
  registryPort?: string;     // Cảng đăng ký (Quảng Ngãi)
  grossTonnage?: number;     // Tổng dung tích (GT)
  netTonnage?: number;       // Dung tích có ích (NT)
  deadweightTons?: number;   // Trọng tải toàn phần DWT (tấn)
  enginePowerCv?: number;    // Công suất máy (CV)
  lengthOverall?: number;    // Chiều dài lớn nhất (m)
  beamMax?: number;          // Chiều rộng lớn nhất (m)
  draftForward?: number;     // Mớn nước mũi (m)
  draftAft?: number;         // Mớn nước lái (m)
  airDraft?: number;         // Chiều cao tĩnh không (m)
  ownerName: string;         // Chủ sở hữu
  ownerPhone: string;
  ownerAddress?: string;     // Địa chỉ chủ phương tiện
  ownerEmail?: string;       // Email liên hệ chủ phương tiện
  captainName?: string;      // Tên thuyền trưởng phụ trách
  captainPhone?: string;     // Số điện thoại thuyền trưởng
  notes?: string;            // Ghi chú liên hệ / điều hành
  isActive: boolean;
}

export interface CrewCertificateAttachment {
  storageKey?: string;
  fileName: string;
  fileType: 'PDF' | 'IMAGE';
  mimeType: string;
  fileSize: string;
  uploadedAt: string;
  uploadedByName?: string;
  uploadedByRole?: UserRole;
  previewUrl?: string;
  serverUrl?: string;
  serverPath?: string;
  note?: string;
}

// Thuyền viên & Chứng chỉ
export interface CrewMember {
  id: string;
  fullName: string;
  citizenId: string;         // CCCD
  phone: string;
  position: 'CAPTAIN' | 'CHIEF_ENGINEER' | 'DECKHAND' | 'ENGINEER_ASSISTANT';
  positionTitle: string;     // Thuyền trưởng, Máy trưởng, Thủy thủ, Thợ máy
  nationality?: string;
  birthDate?: string;
  birthPlace?: string;
  passportNumber?: string;
  certNumber: string;        // Số bằng/chứng chỉ
  certType: string;
  certExpireDate: string;    // Ngày hết hạn chứng chỉ (YYYY-MM-DD)
  assignedVesselId?: string;
  isTemporary?: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'EXPIRING_SOON';
  certDocument?: CrewCertificateAttachment;
}

// Hành khách
export interface Passenger {
  id: string;
  fullName: string;
  birthYear: number;
  gender: 'NAM' | 'NU' | 'KHAC';
  phone: string;
  idNumber: string;          // Số CCCD hoặc Hộ chiếu
  isForeigner: boolean;
  passportNumber?: string;
  nationality?: string;
  address: string;
  notes?: string;
  isBoarded?: boolean;
}

export type ChecklistItemResultStatus = 'DAT' | 'KHONG_DAT' | 'KHONG_AP_DUNG';
export type ChecklistItemStatus = ChecklistItemResultStatus;

export interface BqlChecklistItemResult {
  itemId: string;
  groupCode: string;
  groupTitle?: string;
  label: string;
  status: ChecklistItemResultStatus;
  note?: string;
}

// Biên bản kiểm tra thực tế tại bến (Ban QL Cảng - 8 nhóm mục)
export interface PortInspectionAppendix01 {
  inspectorId: string;
  inspectorName: string;
  inspectedAt: string;
  portId?: PortId;
  portName?: string;
  shiftId?: string;
  shiftName?: string;
  movementDirection?: 'DEPARTURE' | 'ARRIVAL';
  nationality?: string;
  enginePowerCv?: number;
  deadweightTons?: number;
  // Mục I: Hồ sơ giấy tờ, tài liệu của tàu
  certRegistrationIssueDate?: string;
  certRegistrationExpireDate?: string;
  certRegistrationNote?: string;
  certTechSafetyIssueDate?: string;
  certTechSafetyExpireDate?: string;
  certTechSafetyNote?: string;
  certInsuranceIssueDate?: string;
  certInsuranceExpireDate?: string;
  certInsuranceNote?: string;
  // Mục II: 4 nội dung kiểm tra điều kiện an toàn
  checkCrewRosterMatch?: boolean;
  checkTechSafetyAndEnv?: boolean;
  noteTechSafetyAndEnv?: string;
  checkCertsAndCrewQual?: boolean;
  noteCertsAndCrewQual?: string;
  checkFireAndPollution?: boolean;
  noteFireAndPollution?: string;
  checkOverloadAndPassengers?: boolean;
  noteOverloadAndPassengers?: string;
  // Mục III & IV
  checkBerthPositionSafe?: boolean;
  crewOrDocChanged?: boolean;
  crewOrDocChangedDetails?: string;
  // Các tiêu chí kiểm tra cốt lõi
  checkVesselDocuments: boolean;
  checkCrewCertificates: boolean;
  checkActualPassengers: boolean;
  actualPassengerCount: number;
  checkCargoSafety: boolean;
  actualCargoTons: number;
  checkLifeSavingEquip: boolean;
  actualLifeJackets: number;
  checkFireSafety: boolean;
  checkWeatherCondition: boolean;
  currentWindForce: number;
  currentWaveHeight: number;
  feeVerified?: boolean;
  feeVerifyNote?: string;
  checklistItems?: BqlChecklistItemResult[];
  photoUrls: string[];
  conclusion: 'ELIGIBLE' | 'INELIGIBLE';
  rejectReasonCategory?: string;
  rejectReasonDetails?: string;
  notes?: string;
  noticeNumber?: string;
  noticeIssuedAt?: string;
}

// Tiến trình xử lý tại Sở (giữ tương thích dữ liệu & hiển thị Timeline)
export interface InternalPhase {
  phaseIndex: number;
  phaseName: string;
  slaMinutes: number;
  assignedRole: UserRole;
  assignedUserId?: string;
  assignedUserName?: string;
  receivedAt?: string;
  completedAt?: string;
  durationMinutes?: number;
  isOverdue?: boolean;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'SKIPPED' | 'REJECTED';
  notes?: string;
  uploadedPdfUrl?: string;
  uploadedPdfName?: string;
  uploadedPdfServerPath?: string;
  deliveredToCaptainAt?: string;
}

// Quy tắc kiểm tra tự động R1 - R12
export type RuleCode =
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R7'
  | 'R8'
  | 'R9'
  | 'R10'
  | 'R11'
  | 'R12';

export interface RuleEvaluationResult {
  ruleCode: RuleCode | string;
  ruleName: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  message: string;
  details?: string;
}

export type RuleCheckResult = RuleEvaluationResult;

// Giấy tờ, chứng từ tải lên đính kèm hồ sơ
export interface UploadedDocument {
  id: string;
  category: 'REGISTRATION_CERT' | 'TECH_SAFETY_CERT' | 'CREW_CERTIFICATE' | 'FEE_RECEIPT' | 'CIVIL_INSURANCE' | 'OTHER';
  categoryName: string;
  fileName: string;
  fileType: 'IMAGE' | 'PDF';
  fileSize: string;
  uploadedAt: string;
  previewUrl?: string;
  storageKey?: string;
  serverUrl?: string;
  serverPath?: string;
  serverStoredName?: string;
  mimeType?: string;
  crewId?: string;
  note?: string;
  isRequired?: boolean;
  isReusable?: boolean;
  reusableSource?: 'VESSEL' | 'CREW' | 'MANUAL';
  validUntil?: string;
}

export type ReturnSourceParty =
  | 'BQL_CANG'
  | 'CHUYEN_VIEN'
  | 'BIEN_PHONG'
  | 'TRUONG_PHONG'
  | 'LANH_DAO_SO';

export type ReturnErrorGroup = 'loi_ho_so' | 'loi_xu_ly';
export type OfficeErrorGroup = ReturnErrorGroup;

export type ReturnEditScope =
  | 'sua_thong_tin_chung'
  | 'sua_thuyen_vien'
  | 'sua_hanh_khach'
  | 'bo_sung_chung_tu'
  | 'sua_toan_bo';

export type ReturnScope =
  | ReturnEditScope
  | 'BO_SUNG_THONG_TIN'
  | 'SUA_DANH_SACH_NGUOI'
  | 'THAY_DOI_THUYEN_VIEN_CHO'
  | 'bql_sai_kiem_tra_ben'
  | 'bql_sai_thong_bao'
  | 'bql_thieu_xac_minh_phi'
  | 'bql_lech_doi_chieu';

export interface LastReturnInfo {
  benTra: ReturnSourceParty;
  benSai?: 'BQL_CANG' | 'CHU_TAU';
  lyDo: string;
  nhomLoi?: ReturnErrorGroup;
  phamVi?: ReturnScope;
  traBoiId?: string;
  traBoiName?: string;
  nguoiTraId?: string;
  nguoiTraTen?: string;
  thoiDiem: string;
}

export interface PauseInterval {
  id?: string;
  reason: 'TRA_CHU_TAU' | 'TRA_BQL_CANG' | 'TAM_DUNG_THOI_TIET';
  pausedAt: string;
  resumedAt?: string;
}

export interface ProcessingClockState {
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  pausedIntervals: PauseInterval[];
}

export interface DeptWeatherCheckRecord {
  checkedAt: string;
  checkedById: string;
  checkedByName: string;
  area?: string;
  isSafe?: boolean;
  windForceBeaufort: number;
  waveHeightMeters: number;
  visibilityKm?: number;
  forecastNote?: string;
  isRouteSuspended?: boolean;
  conclusion?: 'AN_TOAN' | 'CANH_BAO' | 'KHONG_AN_TOAN';
  note?: string;
}

export interface OfficeReturnEntry {
  id?: string;
  returnedAt: string;
  recordedById: string;
  recordedByName: string;
  returnerRole: 'TRUONG_PHONG' | 'LANH_DAO_SO';
  nhomLoi: ReturnErrorGroup;
  reason: string;
}

export interface OfficeSubmissionRecord {
  draftApprovedAt?: string;
  draftApprovedById?: string;
  draftApprovedByName?: string;
  submittedAt?: string;
  submittedToOfficeAt?: string;
  submittedById?: string;
  submittedByName?: string;
  officeDocumentRef?: string;
  officeApprovedAt?: string;
  uploadedToSystemAt?: string;
  uploadedById?: string;
  uploadedByName?: string;
  returns?: OfficeReturnEntry[];
  issuedPdfUrl?: string;
  issuedPdfName?: string;
  issuedPdfServerPath?: string;
  issuedAt?: string;
  issuedById?: string;
  issuedByName?: string;
  revokedAt?: string;
  revokedById?: string;
  revokedByName?: string;
  revokeReason?: string;
}

export interface BpPersonCheckItem {
  personId: string;
  personType: 'CREW' | 'PASSENGER';
  fullName: string;
  positionTitle?: string;
  idNumber?: string;
  birthYear?: number;
  isOnboard?: boolean;
  boarded?: boolean;
  absent?: boolean;
  checkedAt?: string;
  scannedAt?: string;
  scanMethod?: 'QR_CCCD' | 'MANUAL';
  isUnlisted?: boolean;
}

export interface BpUnlistedPerson {
  fullName: string;
  idNumber: string;
  birthYear?: number;
  personType: 'CREW' | 'PASSENGER';
  note?: string;
}

export interface BpDepartureControlRecord {
  id?: string;
  controlledAt?: string;
  checkedAt?: string;
  controllerId?: string;
  checkedById?: string;
  controllerName?: string;
  checkedByName?: string;
  inspectorName?: string;
  portId?: PortId;
  portName?: string;
  shiftId?: string;
  shiftName?: string;
  qrVerified?: boolean;
  scannedQrCode?: string;
  permitQrChecks?: {
    hasPermit: boolean;
    matchesVessel: boolean;
    within24h: boolean;
    outcome?: QrVerifyOutcomeCode;
  };
  permitStatusAtCheck?: string;
  scheduledTotalPeople?: number;
  actualTotalPeople?: number;
  actualCrewCount?: number;
  actualPassengerCount?: number;
  absentCount?: number;
  crewChanged?: boolean;
  crewChangeNote?: string;
  checklist: BpPersonCheckItem[];
  unlistedPeople: BpUnlistedPerson[];
  hasAnomaly?: boolean;
  anomalyCategory?: BpStopReasonCode;
  anomalyType?: BpStopReasonCode;
  anomalyDescription?: string;
  soBienBanNgoai?: string;
  anomalyRecordNumber?: string;
  anomalyPhotos?: string[];
  action?: 'CHO_XUAT_BEN' | 'TRA_CHU_TAU_R12' | 'TAM_GIU_BIEN_PHONG';
  decision?: 'CHO_XUAT_BEN' | 'TRA_HO_SO_R12' | 'TRA_CHU_TAU_R12' | 'TAM_GIU_BIEN_PHONG';
}

export interface ApprovalNoticeData {
  noticeNumber: string;
  issuedAt: string;
  approvedAt?: string;
  portId?: PortId;
  portName?: string;
  issuerId?: string;
  issuerName?: string;
  issuedById?: string;
  issuedByName?: string;
  inspectorName?: string;
  checklistSummary?: string;
  conclusionSummary?: string;
  summary?: string;
  feeVerified?: boolean;
  notes?: string;
}

export interface ArrivingConfirmation {
  confirmedAt: string;
  confirmedById: string;
  confirmedByName: string;
  confirmedByRole: UserRole;
  portId: PortId;
  portName: string;
  shiftId?: string;
  shiftName?: string;
  actualPeopleArrived?: number;
  note?: string;
}

// Hồ sơ chuyến cấp phép rời cảng, bến
export interface TripRecord {
  id: string;
  tripNumber: string;                 // Mã hồ sơ (VD: HS-2026-0038)
  orderNumber?: string;               // Số hiệu Giấy phép (VD: 0123/2026/LS-AB)
  supersededOrderNumbers?: string[];  // Các số Giấy phép cũ đã bị thu hồi/hủy khi nộp lại từ Biên phòng
  isPermitSuspended?: boolean;        // Cờ tạm đình chỉ (hiển thị QR "Tạm đình chỉ")
  vesselId: string;
  vesselName: string;
  vesselRegNumber: string;
  vesselType?: string;
  callSign?: string;
  imoNumber?: string;
  movementType?: 'DEPARTURE' | 'ARRIVAL';
  tripSeqOfDay?: number;
  routeId: string;
  routeName: string;
  departurePortId: string;
  departurePortName: string;
  arrivalPortId: string;
  arrivalPortName: string;
  lastPortOfCall?: string;
  destinationPort?: string;
  berthLocation?: string;

  grossTonnage?: number;
  netTonnage?: number;
  draftForward?: number;
  draftAft?: number;
  deadweightTons?: number;
  lengthOverall?: number;
  beamMax?: number;
  airDraft?: number;

  createdDate: string;                // YYYY-MM-DD
  submittedAt?: string;               // Thời điểm chủ tàu nộp hồ sơ chính thức
  scheduledDepartureTime: string;     // YYYY-MM-DDTHH:mm
  actualDepartureTime?: string;
  actualArrivalTime?: string;
  issuedAt?: string;                  // Thời điểm phát hành Giấy phép trên Office
  orderValidUntil?: string;           // Thời hạn hiệu lực Giấy phép (24h kể từ issuedAt)
  issuedPdfUrl?: string;              // Tệp PDF Giấy phép có dấu đỏ đã tải lên
  issuedPdfName?: string;
  issuedPdfServerPath?: string;
  deptApprovedById?: string;
  deptApprovedByName?: string;
  deptApprovedAt?: string;

  createdById: string;
  createdByName: string;
  createdByRole: UserRole;
  isDeclaredByPortStaff: boolean;
  actualDeclarantName?: string;
  declarantPhone?: string;
  declarantAddress?: string;
  staffDeclarationReason?: string;

  captainId: string;
  captainName: string;
  captainCertNo: string;
  captainCertExpireDate?: string;
  chiefEngineerId?: string;
  chiefEngineerName?: string;
  chiefEngineerCertNo?: string;
  crewMembers: {
    crewId: string;
    fullName: string;
    positionTitle: string;
    nationality?: string;
    birthDate?: string;
    birthPlace?: string;
    passportNumber?: string;
    certNumber: string;
    certExpireDate: string;
    isTemporary?: boolean;
  }[];

  passengerCount: number;
  passengers: Passenger[];
  cargoTons: number;
  cargoDescription?: string;
  cargoItems?: {
    itemType: string;
    itemName: string;
    quantity: number;
    unit: string;
    isTransit?: boolean;
  }[];
  hasTransitCargo?: boolean;
  transitCargoDescription?: string;

  attachmentsState?: {
    cargoDeclaration: boolean;
    shipStoresDeclaration: boolean;
    crewList: boolean;
    passengerList: boolean;
    wasteDeliveryRequirement: boolean;
    crewEffectsDeclaration: boolean;
    maritimeHealthDeclaration: boolean;
    portClearanceOrder: boolean;
  };

  uploadedDocuments?: UploadedDocument[];
  feeTransactionCode?: string;        // Mã giao dịch nộp phí (bù cho ảnh ủy nhiệm chi trong R11)

  confirmationDevice?: string;
  confirmedAt?: string;

  requiredLifeJackets: number;
  actualLifeJacketsReported: number;

  status: TripStatus;
  previousStatusBeforeBpStop?: TripStatus;
  previousStatusBeforeWeatherPause?: TripStatus;
  lastReturnInfo?: LastReturnInfo;

  bqlClock?: ProcessingClockState;
  deptClock?: ProcessingClockState;

  statusLogs: {
    fromStatus: TripStatus;
    toStatus: TripStatus;
    changedAt: string;
    changedById: string;
    changedByName: string;
    changedByRole?: UserRole;
    shiftId?: string;
    shiftName?: string;
    reason?: string;
    milestone?: 'BP_DE_NGHI_DUNG' | 'BP_GO_DE_NGHI' | 'BP_KIEM_SOAT' | 'BP_CHO_XUAT_BEN' | 'BP_TAM_GIU' | 'BP_TRA_R12' | 'XAC_NHAN_CAP_BEN' | 'OFFICE_TRINH' | 'OFFICE_TRA_LAI' | 'OFFICE_PHAT_HANH' | 'THU_HOI_GP' | string;
    hideBpDetailsFromCaptain?: boolean;
  }[];

  rulesCheckResults: RuleEvaluationResult[];

  portInspection?: PortInspectionAppendix01;
  approvalNotice?: ApprovalNoticeData;

  appendix02Review?: {
    noticeApproved?: boolean;
    generalDeclarationApproved?: boolean;
    crewListApproved?: boolean;
    passengerListApproved?: boolean;
    appendix01Approved?: boolean;
    allApproved?: boolean;
    reviewedAt?: string;
    reviewerName?: string;
  };

  weatherCheckRecord?: DeptWeatherCheckRecord;
  officeSubmissionRecord?: OfficeSubmissionRecord;
  bpDepartureControl?: BpDepartureControlRecord;
  arrivingConfirmation?: ArrivingConfirmation;

  internalPhases: InternalPhase[];
  totalProcessingMinutes?: number;
  isOverallOverdue?: boolean;

  approvedById?: string;
  approvedByName?: string;
  approvedByTitle?: string;
  approvedAt?: string;
  sealedAt?: string;
  sealedByName?: string;
  rejectReason?: string;
  rejectedAtStep?: number;
  rejectedByRole?: UserRole;
  rejectedByName?: string;

  verificationCode: string;
  qrPayloadUrl: string;

  passengerModifications?: {
    modifiedAt: string;
    modifiedByName: string;
    action: 'REMOVE' | 'ADD';
    passengerName: string;
    passengerIdNumber: string;
    reason: string;
    approvedByLeader?: boolean;
  }[];

  isSavedOffline?: boolean;
  isSynced?: boolean;
  isAnonymized?: boolean;
}

// Bản tin thời tiết & Tình trạng tuyến
export interface WeatherCondition {
  recordedAt: string;
  recordedBy?: string;
  area: string;
  windForceBeaufort: number;
  windDirection: string;
  waveHeightMeters: number;
  visibilityKm?: number;
  seaStatusText: string;
  rawForecastText: string;
  forecastNext24h?: string;
  aiSummary?: string;
  aiRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  isRouteSuspended: boolean;
  suspensionReason?: string;
  suspendedAt?: string;
  suspendedByName?: string;
  resumeEstimatedAt?: string;
}

// Cấu hình quy tắc R1 - R12
export interface SystemRuleConfig {
  code: RuleCode;
  name: string;
  description: string;
  isEnabled: boolean;
  isBlocking: boolean;
  warningThreshold?: number;
}

export type ShiftRoleGroup = 'BQL_CANG' | 'CHUYEN_VIEN' | 'BIEN_PHONG';

// Lịch ca trực (tạo bởi Quản trị cho BQL_CANG, CHUYEN_VIEN, BIEN_PHONG)
export interface DutyShift {
  id: string;
  date?: string;                     // YYYY-MM-DD
  dutyDate?: string;                 // YYYY-MM-DD (alias)
  roleGroup?: ShiftRoleGroup;        // Nhóm vai trò trực ca
  portId?: PortId;                   // Bắt buộc với BQL_CANG & BIEN_PHONG (PORT-01 | PORT-02)
  shiftType?: 'EARLY_MORNING' | 'MORNING' | 'AFTERNOON' | 'WEEKEND' | 'HOLIDAY' | 'NIGHT';
  shiftName: string;                 // Ca sáng (06:00 - 12:00)...
  startTime?: string;                // HH:mm
  endTime?: string;                  // HH:mm
  startAt?: string;                  // ISO timestamp tùy chọn
  endAt?: string;                    // ISO timestamp tùy chọn
  assigneeIds?: string[];            // Danh sách ID cán bộ trong ca
  assigneeNames?: string[];          // Danh sách tên cán bộ trong ca
  portStaffId?: string;
  portStaffName?: string;
  officerId?: string;                // Người trực chính
  officerName?: string;
  leaderId?: string;
  leaderName?: string;
  phone?: string;
  processedOrdersCount?: number;
  handoverNote?: string;
  status?: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
}

// Bến cảng
export interface PortLocation {
  id: string;
  code: string;
  name: string;
  island: string;
  description: string;
  isOperating: boolean;
}

// Tuyến vận tải
export interface MaritimeRoute {
  id: string;
  code: string;
  name: string;
  fromPortId: string;
  toPortId: string;
  distanceNauticalMiles: number;
  normalDurationMinutes: number;
  frequencyText?: string;
  isSuspended: boolean;
  suspensionNotice?: string;
}

// Nhật ký hệ thống (Audit Log không sửa xóa)
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  shiftId?: string;
  shiftName?: string;
  action: string;
  targetId?: string;
  targetType: 'TRIP' | 'VESSEL' | 'CREW' | 'RULE' | 'WEATHER' | 'SYSTEM' | 'SHIFT' | 'CONFIG';
  details: string;
  beforeValue?: string;
  afterValue?: string;
  ipAddress?: string;
}

// Kênh thông báo (In-app + Chuông + Email/SMS cấu hình; KHÔNG dùng Zalo)
export interface SystemNotification {
  id: string;
  createdAt: string;
  recipientUserId: string;
  recipientPhone?: string;
  recipientPortId?: PortId;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  channel: 'IN_APP' | 'EMAIL' | 'SMS_SIMULATED';
  isRead: boolean;
  tripId?: string;
}

// Hồ sơ đến (Tiếp nhận tại Sở)
export type IncomingDossierSource = 'PORT_GATEWAY' | 'DIRECT' | 'SYSTEM_PORTAL';

export type IncomingDossierStatus =
  | 'PENDING_INTAKE'
  | 'INTAKEN'
  | 'PROCESSING'
  | 'APPROVED'
  | 'REJECTED';

export interface IncomingDossier {
  id: string;
  incomingNumber: string;
  receivedAt: string;
  tripId: string;
  tripNumber: string;
  vesselName: string;
  vesselRegNumber: string;
  source: IncomingDossierSource;
  senderUnit: string;
  senderOfficerName: string;
  senderPhone?: string;
  dossierType: string;
  status: IncomingDossierStatus;
  assignedOfficerId: string;
  assignedOfficerName: string;
  currentPhaseIndex?: number;
  deadlineMinutes: number;
  notes?: string;
  documentsCount: number;
  isOverdue?: boolean;
  intakenAt?: string;
}

// =================== PHÂN HỆ BIÊN PHÒNG / LỰC LƯỢNG PHỐI HỢP ===================
export type BpStopType = 'dinh_chi_lenh'; // Chỉ còn tạm giữ / đình chỉ sau khi đã cấp phép

export type BpStopReasonCode =
  | 'nghi_buon_lau_gian_lan_thuong_mai'
  | 'hang_cam'
  | 'nguoi_dang_bi_truy_tim_hoac_cam_xuat_canh'
  | 'giay_to_gia'
  | 'an_ninh_trat_tu'
  | 'so_nguoi_thuc_te_khac_danh_sach'
  | 'vi_pham_an_toan_giao_thong'
  | 'thoi_tiet_bien_dong'
  | 'khac';

export type BpStopStatus = 'dang_hieu_luc' | 'da_go';

export interface DeNghiDung {
  id: string;
  hoSoId: string;
  loai: BpStopType;
  maLyDo: BpStopReasonCode;
  moTa: string;
  soBienBanNgoai?: string;          // Số biên bản lập ngoài khi tạm giữ
  anh: string[];
  nguoiDeNghi: string;
  nguoiDeNghiId?: string;
  thoiDiem: string;
  trangThai: BpStopStatus;
  nguoiGo?: string;
  nguoiGoId?: string;
  thoiDiemGo?: string;
  ketQuaXacMinh?: string;
}

export interface KiemSoatTaiBen {
  id: string;
  hoSoId: string;
  soNguoiThucTe: number;
  soNguoiTheoDanhSach: number;
  ketQua: 'khop' | 'chenh_lech';
  ghiChu: string;
  nguoiKiemSoat: string;
  nguoiKiemSoatId?: string;
  thoiDiem: string;
}

export interface NhatKyTruyCapDuLieuCaNhan {
  id: string;
  nguoiXem: string;
  nguoiXemId?: string;
  vaiTro?: UserRole;
  hoSoId: string;
  lyDo: string;
  thoiDiem: string;
}

export type BpLiftPermissionMode = 'chi_bien_phong' | 'bien_phong_hoac_lanh_dao_so';

export interface BpSystemConfig {
  unitDisplayName: string;
  roleLabelTruc: string;
  roleLabelChiHuy: string;
  quyenGoDeNghi: BpLiftPermissionMode;
  standardTransitMinutesOutbound: number;
  standardTransitMinutesInbound: number;
  overdueGraceMinutes: number;
}

export interface BqlChecklistItemConfig {
  id: string;
  groupCode: string;
  groupTitle: string;
  label: string;
  isRequired: boolean;
}

export interface AdminOperationalConfig {
  paymentQrImageUrl: string;
  paymentQrBankName: string;
  paymentQrAccountNumber: string;
  paymentQrAccountHolder: string;
  paymentQrNote: string;
  permitSignerName?: string;          // Họ và tên người ký phát hành Giấy phép (mặc định: Võ Phiên)
  permitSignerAuthority?: string;     // Dòng quyền hạn ký (VD: KT. GIÁM ĐỐC; để trống nếu Giám đốc ký trực tiếp)
  permitSignerTitle?: string;         // Chức danh người ký (VD: PHÓ GIÁM ĐỐC hoặc GIÁM ĐỐC)
  permitSignLocation?: string;        // Địa danh ký ban hành (mặc định: Quảng Ngãi)
  adminContactEmail?: string;         // Email quản trị hệ thống hiển thị trong thông tin liên hệ (hỗ trợ nhiều email ngăn cách dấu phẩy)
  adminContactName?: string;          // Tên đầu mối / đơn vị quản trị hệ thống
  adminContactPhone?: string;         // Số điện thoại liên hệ quản trị hệ thống (tùy chọn)
  approvalNoticeTemplate: string;
  permitDraftTemplate: string;
  bqlProcessingSlaMinutes: number;    // Mặc định 60 phút
  deptProcessingSlaMinutes: number;   // Mặc định 60 phút
  officeUploadSlaMinutes: number;     // Mặc định 10 phút
  paginationPageSize?: number;        // Mặc định 15 bản ghi / trang
  bqlChecklistConfig: BqlChecklistItemConfig[];
}

export type QrVerifyOutcomeCode =
  | 'HOP_LE'
  | 'HET_HIEU_LUC'
  | 'TAM_DINH_CHI'
  | 'DA_THU_HOI'
  | 'DA_XUAT_BEN'
  | 'KHONG_TON_TAI';
