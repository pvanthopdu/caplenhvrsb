/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BpPersonCheckItem,
  Passenger,
  PortInspectionAppendix01,
  TripRecord,
} from '../types';
import {
  DEFAULT_BQL_CHECKLIST_CONFIG,
  DEFAULT_ORDER_SIGNER_AUTHORITY,
  DEFAULT_ORDER_SIGNER_NAME,
  DEFAULT_ORDER_SIGNER_TITLE,
  DEFAULT_VESSELS,
  createDefaultPhases,
} from './systemDefaults';

interface SignerInfoInput {
  name?: string;
  authority?: string;
  title?: string;
  fullTitle?: string;
}

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalDateTimeInput(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${toLocalDateInput(d)}T${hh}:${mm}`;
}

function makePassengers(prefix: string, count: number, boarded = false): Passenger[] {
  const samplePool: Array<{
    fullName: string;
    birthYear: number;
    gender: 'NAM' | 'NU';
    phone: string;
    address: string;
  }> = [
    { fullName: 'Nguyễn Minh Quân', birthYear: 1988, gender: 'NAM', phone: '0914112201', address: 'TP. Quảng Ngãi, Quảng Ngãi' },
    { fullName: 'Trần Thị Thu Hà', birthYear: 1992, gender: 'NU', phone: '0914112202', address: 'TP. Quảng Ngãi, Quảng Ngãi' },
    { fullName: 'Lê Hoàng Nam', birthYear: 1985, gender: 'NAM', phone: '0914112203', address: 'Bình Sơn, Quảng Ngãi' },
    { fullName: 'Phạm Thị Ngọc Lan', birthYear: 1995, gender: 'NU', phone: '0914112204', address: 'Sơn Tịnh, Quảng Ngãi' },
    { fullName: 'Võ Quốc Huy', birthYear: 1990, gender: 'NAM', phone: '0914112205', address: 'Đặc khu Lý Sơn, Quảng Ngãi' },
    { fullName: 'Đặng Thị Mỹ Linh', birthYear: 1997, gender: 'NU', phone: '0914112206', address: 'Đà Nẵng' },
    { fullName: 'Huỳnh Tấn Phát', birthYear: 1983, gender: 'NAM', phone: '0914112207', address: 'Tư Nghĩa, Quảng Ngãi' },
    { fullName: 'Bùi Thị Thanh Thảo', birthYear: 1994, gender: 'NU', phone: '0914112208', address: 'Quảng Nam' },
    { fullName: 'Ngô Đức Thịnh', birthYear: 1989, gender: 'NAM', phone: '0914112209', address: 'TP. Hồ Chí Minh' },
    { fullName: 'Phan Thị Kim Oanh', birthYear: 1991, gender: 'NU', phone: '0914112210', address: 'Hà Nội' },
  ];

  return Array.from({ length: count }, (_, idx) => {
    const item = samplePool[idx % samplePool.length];
    const seq = String(idx + 1).padStart(2, '0');
    return {
      id: `${prefix}-PAX-${seq}`,
      fullName: item.fullName,
      birthYear: item.birthYear,
      gender: item.gender,
      idNumber: `0510${String(item.birthYear).slice(-2)}${prefix.replace(/\D/g, '').padStart(2, '0')}${seq}89`,
      phone: item.phone,
      address: item.address,
      nationality: 'Việt Nam',
      isForeigner: false,
      isBoarded: boarded,
    };
  });
}

function makePassedPortInspection(params: {
  inspectedAt: string;
  vesselRegExpire?: string;
  vesselTechExpire?: string;
  vesselInsExpire?: string;
  enginePowerCv?: number;
  deadweightTons?: number;
  actualPassengerCount: number;
  actualCargoTons: number;
  actualLifeJackets: number;
  noticeNumber: string;
  shiftId: string;
  shiftName: string;
}): PortInspectionAppendix01 {
  return {
    inspectorId: 'USR-05',
    inspectorName: 'Hoàng Văn Thắng',
    inspectedAt: params.inspectedAt,
    portId: 'PORT-01',
    portName: 'Bến cảng Lý Sơn (Đảo Lớn)',
    shiftId: params.shiftId,
    shiftName: params.shiftName,
    movementDirection: 'DEPARTURE',
    nationality: 'Việt Nam',
    enginePowerCv: params.enginePowerCv,
    deadweightTons: params.deadweightTons,
    certRegistrationExpireDate: params.vesselRegExpire,
    certTechSafetyExpireDate: params.vesselTechExpire,
    certInsuranceExpireDate: params.vesselInsExpire,
    checkCrewRosterMatch: true,
    checkTechSafetyAndEnv: true,
    checkCertsAndCrewQual: true,
    checkFireAndPollution: true,
    checkOverloadAndPassengers: true,
    checkBerthPositionSafe: true,
    crewOrDocChanged: false,
    checkVesselDocuments: true,
    checkCrewCertificates: true,
    checkActualPassengers: true,
    actualPassengerCount: params.actualPassengerCount,
    checkCargoSafety: true,
    actualCargoTons: params.actualCargoTons,
    checkLifeSavingEquip: true,
    actualLifeJackets: params.actualLifeJackets,
    checkFireSafety: true,
    checkWeatherCondition: true,
    currentWindForce: 4,
    currentWaveHeight: 1.0,
    feeVerified: true,
    feeVerifyNote: 'Đã đối chiếu chứng từ nộp phí rời cảng hợp lệ.',
    checklistItems: DEFAULT_BQL_CHECKLIST_CONFIG.map((cfg) => ({
      itemId: cfg.id,
      groupCode: cfg.groupCode,
      groupTitle: cfg.groupTitle,
      label: cfg.label,
      status: 'DAT' as const,
      note: 'Đạt yêu cầu',
    })),
    photoUrls: [],
    conclusion: 'ELIGIBLE',
    notes: 'Phương tiện, thuyền viên, hành khách, áo phao và chứng từ phí đạt đầy đủ 8 nhóm kiểm tra tại bến.',
    noticeNumber: params.noticeNumber,
    noticeIssuedAt: params.inspectedAt,
  };
}

/**
 * Bộ đúng 4 hồ sơ vận hành tinh gọn theo đúng 4 chặng nghiệp vụ:
 * 1. HS-2026-0001 (CHO_KIEM_TRA): Thuyền trưởng vừa gửi hồ sơ lên, chờ BQL Cảng kiểm tra.
 * 2. HS-2026-0002 (CHO_SO_XU_LY): BQL Cảng đã kiểm tra & chấp thuận, đang chờ Sở Xây dựng xử lý.
 * 3. HS-2026-0003 (DA_CAP_PHEP): Sở đã cấp Giấy phép 001/2026/LS-AB, chờ Biên phòng kiểm tra xuất bến.
 * 4. HS-2026-0004 (DA_XUAT_BEN): Biên phòng đã cho xuất bến (002/2026/LS-AB), tàu đang hành trình trên biển.
 */
export function buildFourCanonicalTrips(signerInfo?: SignerInfoInput, refNow = new Date()): TripRecord[] {
  const nowMs = refNow.getTime();
  const todayStr = toLocalDateInput(refNow);
  const bqlShiftId = `SHIFT-BQL-P1-${todayStr}`;
  const bqlShiftName = 'Ca trực BQL Cảng Đảo Lớn (00:00–23:59)';
  const deptShiftId = `SHIFT-SO-${todayStr}`;
  const deptShiftName = 'Ca trực Chuyên viên Sở XD (00:00–23:59)';
  const bpShiftId = `SHIFT-BP-P1-${todayStr}`;
  const bpShiftName = 'Ca trực Biên phòng Đảo Lớn (00:00–23:59)';

  const signerName = (signerInfo?.name || DEFAULT_ORDER_SIGNER_NAME).trim();
  const signerFullTitle =
    signerInfo?.fullTitle ||
    [
      signerInfo?.authority ?? DEFAULT_ORDER_SIGNER_AUTHORITY,
      signerInfo?.title || DEFAULT_ORDER_SIGNER_TITLE,
    ]
      .filter(Boolean)
      .join(' • ');

  const v1 = DEFAULT_VESSELS.find((v) => v.id === 'VES-11') || DEFAULT_VESSELS[0]; // AN BÌNH 02
  const v2 = DEFAULT_VESSELS.find((v) => v.id === 'VES-01') || DEFAULT_VESSELS[0]; // CÙ LAO RÉ 02
  const v3 = DEFAULT_VESSELS.find((v) => v.id === 'VES-02') || DEFAULT_VESSELS[1]; // CÙ LAO RÉ 05
  const v4 = DEFAULT_VESSELS.find((v) => v.id === 'VES-05') || DEFAULT_VESSELS[4]; // LYSONTOURIST 02

  // ================= 1. HỒ SƠ THUYỀN TRƯỞNG GỬI LÊN (CHO_KIEM_TRA) =================
  const t1SubmittedIso = new Date(nowMs - 12 * 60_000).toISOString();
  const t1DepDate = new Date(nowMs + 120 * 60_000);
  const t1Passengers = makePassengers('T1', 6, false);
  const t1Crew = [
    {
      crewId: 'CRW-VES-11',
      fullName: v1.captainName || 'Võ Minh Thạch',
      positionTitle: 'Thuyền trưởng',
      nationality: 'Việt Nam',
      certNumber: 'TT-VRSB-QNG-011',
      certExpireDate: '2028-12-31',
    },
    {
      crewId: 'CRW-MT-01',
      fullName: 'Trần Văn Lộc',
      positionTitle: 'Máy trưởng',
      nationality: 'Việt Nam',
      certNumber: 'MT-VRSB-QNG-101',
      certExpireDate: '2028-10-31',
    },
    {
      crewId: 'CRW-TT-01',
      fullName: 'Nguyễn Thanh Vũ',
      positionTitle: 'Thủy thủ',
      nationality: 'Việt Nam',
      certNumber: 'TH-VRSB-QNG-201',
      certExpireDate: '2028-09-30',
    },
  ];

  const trip1Submitted: TripRecord = {
    id: 'TRIP-0001',
    tripNumber: 'HS-2026-0001',
    vesselId: v1.id,
    vesselName: v1.name,
    vesselRegNumber: v1.regNumber,
    vesselType: v1.vesselType,
    callSign: v1.callSign,
    movementType: 'DEPARTURE',
    tripSeqOfDay: 1,
    routeId: 'ROUTE-01',
    routeName: 'Tuyến Đảo Lớn – Đảo Bé (Chiều đi)',
    departurePortId: 'PORT-01',
    departurePortName: 'Bến cảng Lý Sơn (Đảo Lớn)',
    arrivalPortId: 'PORT-02',
    arrivalPortName: 'Bến Đảo Bé (An Bình)',
    berthLocation: 'Cầu cảng số 1 – Bến Đảo Lớn',
    deadweightTons: v1.deadweightTons || v1.maxCargoTons,
    createdDate: todayStr,
    submittedAt: t1SubmittedIso,
    scheduledDepartureTime: toLocalDateTimeInput(t1DepDate),
    createdById: 'USR-07',
    createdByName: v1.captainName || 'Võ Minh Thạch',
    createdByRole: 'CAPTAIN',
    isDeclaredByPortStaff: false,
    actualDeclarantName: v1.captainName || 'Võ Minh Thạch',
    declarantPhone: v1.captainPhone || '0339002376',
    captainId: 'CRW-VES-11',
    captainName: v1.captainName || 'Võ Minh Thạch',
    captainCertNo: 'TT-VRSB-QNG-011',
    captainCertExpireDate: '2028-12-31',
    chiefEngineerId: 'CRW-MT-01',
    chiefEngineerName: 'Trần Văn Lộc',
    chiefEngineerCertNo: 'MT-VRSB-QNG-101',
    crewMembers: t1Crew,
    passengerCount: t1Passengers.length,
    passengers: t1Passengers,
    cargoTons: 0.5,
    cargoDescription: 'Nhu yếu phẩm dân sinh ra Đảo Bé',
    hasTransitCargo: false,
    feeTransactionCode: 'FT2611220001',
    requiredLifeJackets: t1Crew.length + t1Passengers.length,
    actualLifeJacketsReported: t1Crew.length + t1Passengers.length + 4,
    status: 'CHO_KIEM_TRA',
    bqlClock: {
      startedAt: t1SubmittedIso,
      pausedIntervals: [],
    },
    statusLogs: [
      {
        fromStatus: 'NHAP',
        toStatus: 'CHO_KIEM_TRA',
        changedAt: t1SubmittedIso,
        changedById: 'USR-07',
        changedByName: v1.captainName || 'Võ Minh Thạch',
        changedByRole: 'CAPTAIN',
        reason: 'Thuyền trưởng lập và gửi hồ sơ đề nghị cấp Giấy phép rời cảng kèm mã giao dịch phí FT2611220001.',
      },
    ],
    rulesCheckResults: [],
    internalPhases: createDefaultPhases('CHO_KIEM_TRA'),
    verificationCode: 'VRSB-HS-2026-0001',
    qrPayloadUrl: '#/xac-thuc-lenh/HS-2026-0001',
    isSynced: true,
  };

  // ================= 2. HỒ SƠ CHỜ XỬ LÝ Ở SỞ (CHO_SO_XU_LY) =================
  const t2SubmittedIso = new Date(nowMs - 45 * 60_000).toISOString();
  const t2InspectedIso = new Date(nowMs - 15 * 60_000).toISOString();
  const t2DepDate = new Date(nowMs + 95 * 60_000);
  const t2Passengers = makePassengers('T2', 10, false);
  const t2Crew = [
    {
      crewId: 'CRW-VES-01',
      fullName: v2.captainName || 'Lê Tấn Lý',
      positionTitle: 'Thuyền trưởng',
      nationality: 'Việt Nam',
      certNumber: 'TT-VRSB-QNG-001',
      certExpireDate: '2028-12-31',
    },
    {
      crewId: 'CRW-MT-02',
      fullName: 'Phan Hữu Nghĩa',
      positionTitle: 'Máy trưởng',
      nationality: 'Việt Nam',
      certNumber: 'MT-VRSB-QNG-102',
      certExpireDate: '2028-11-30',
    },
    {
      crewId: 'CRW-TT-02',
      fullName: 'Đỗ Văn Khải',
      positionTitle: 'Thủy thủ',
      nationality: 'Việt Nam',
      certNumber: 'TH-VRSB-QNG-202',
      certExpireDate: '2028-08-30',
    },
  ];

  const trip2WaitingDept: TripRecord = {
    id: 'TRIP-0002',
    tripNumber: 'HS-2026-0002',
    vesselId: v2.id,
    vesselName: v2.name,
    vesselRegNumber: v2.regNumber,
    vesselType: v2.vesselType,
    callSign: v2.callSign,
    movementType: 'DEPARTURE',
    tripSeqOfDay: 1,
    routeId: 'ROUTE-01',
    routeName: 'Tuyến Đảo Lớn – Đảo Bé (Chiều đi)',
    departurePortId: 'PORT-01',
    departurePortName: 'Bến cảng Lý Sơn (Đảo Lớn)',
    arrivalPortId: 'PORT-02',
    arrivalPortName: 'Bến Đảo Bé (An Bình)',
    berthLocation: 'Cầu cảng số 2 – Bến Đảo Lớn',
    createdDate: todayStr,
    submittedAt: t2SubmittedIso,
    scheduledDepartureTime: toLocalDateTimeInput(t2DepDate),
    createdById: 'CAP-VES-01',
    createdByName: v2.captainName || 'Lê Tấn Lý',
    createdByRole: 'CAPTAIN',
    isDeclaredByPortStaff: false,
    actualDeclarantName: v2.captainName || 'Lê Tấn Lý',
    declarantPhone: v2.captainPhone || '0906569293',
    captainId: 'CRW-VES-01',
    captainName: v2.captainName || 'Lê Tấn Lý',
    captainCertNo: 'TT-VRSB-QNG-001',
    captainCertExpireDate: '2028-12-31',
    chiefEngineerId: 'CRW-MT-02',
    chiefEngineerName: 'Phan Hữu Nghĩa',
    chiefEngineerCertNo: 'MT-VRSB-QNG-102',
    crewMembers: t2Crew,
    passengerCount: t2Passengers.length,
    passengers: t2Passengers,
    cargoTons: 0,
    hasTransitCargo: false,
    feeTransactionCode: 'FT2611220002',
    requiredLifeJackets: t2Crew.length + t2Passengers.length,
    actualLifeJacketsReported: 38,
    status: 'CHO_SO_XU_LY',
    bqlClock: {
      startedAt: t2SubmittedIso,
      completedAt: t2InspectedIso,
      pausedIntervals: [],
    },
    deptClock: {
      startedAt: t2InspectedIso,
      pausedIntervals: [],
    },
    portInspection: makePassedPortInspection({
      inspectedAt: t2InspectedIso,
      vesselRegExpire: v2.registryExpireDate,
      vesselTechExpire: v2.techSafetyExpireDate,
      vesselInsExpire: v2.civilInsuranceExpireDate,
      enginePowerCv: v2.enginePowerCv,
      actualPassengerCount: t2Passengers.length,
      actualCargoTons: 0,
      actualLifeJackets: 38,
      noticeNumber: 'TB-01/2026/TB-CTLS',
      shiftId: bqlShiftId,
      shiftName: bqlShiftName,
    }),
    approvalNotice: {
      noticeNumber: 'TB-01/2026/TB-CTLS',
      issuedAt: t2InspectedIso,
      approvedAt: t2InspectedIso,
      portId: 'PORT-01',
      portName: 'Bến cảng Lý Sơn (Đảo Lớn)',
      issuerId: 'USR-05',
      issuerName: 'Hoàng Văn Thắng',
      issuedById: 'USR-05',
      issuedByName: 'Hoàng Văn Thắng',
      inspectorName: 'Hoàng Văn Thắng',
      checklistSummary: 'Đạt đủ 8/8 nhóm kiểm tra thực tế tại bến Đảo Lớn',
      conclusionSummary: 'Đủ điều kiện an toàn rời bến, kính chuyển Sở Xây dựng xem xét cấp Giấy phép.',
      feeVerified: true,
    },
    statusLogs: [
      {
        fromStatus: 'NHAP',
        toStatus: 'CHO_KIEM_TRA',
        changedAt: t2SubmittedIso,
        changedById: 'CAP-VES-01',
        changedByName: v2.captainName || 'Lê Tấn Lý',
        changedByRole: 'CAPTAIN',
        reason: 'Thuyền trưởng gửi hồ sơ đề nghị cấp phép rời cảng.',
      },
      {
        fromStatus: 'CHO_KIEM_TRA',
        toStatus: 'CHO_SO_XU_LY',
        changedAt: t2InspectedIso,
        changedById: 'USR-05',
        changedByName: 'Hoàng Văn Thắng',
        changedByRole: 'PORT_STAFF',
        shiftId: bqlShiftId,
        shiftName: bqlShiftName,
        reason: 'BQL Cảng Đảo Lớn kiểm tra đạt 8/8 nhóm và cấp Thông báo chấp thuận số TB-01/2026/TB-CTLS, chuyển Sở Xây dựng xử lý.',
      },
    ],
    rulesCheckResults: [],
    internalPhases: createDefaultPhases('CHO_SO_XU_LY'),
    verificationCode: 'VRSB-HS-2026-0002',
    qrPayloadUrl: '#/xac-thuc-lenh/HS-2026-0002',
    isSynced: true,
  };

  // ================= 3. HỒ SƠ ĐÃ CẤP PHÉP, CHỜ BIÊN PHÒNG KIỂM TRA XUẤT BẾN (DA_CAP_PHEP) =================
  const t3SubmittedIso = new Date(nowMs - 80 * 60_000).toISOString();
  const t3InspectedIso = new Date(nowMs - 55 * 60_000).toISOString();
  const t3WeatherIso = new Date(nowMs - 40 * 60_000).toISOString();
  const t3IssuedMs = nowMs - 20 * 60_000;
  const t3IssuedIso = new Date(t3IssuedMs).toISOString();
  const t3ValidUntilIso = new Date(t3IssuedMs + 24 * 3600 * 1000).toISOString();
  const t3DepDate = new Date(nowMs + 40 * 60_000);
  const t3Passengers = makePassengers('T3', 8, false);
  const t3Crew = [
    {
      crewId: 'CRW-VES-02',
      fullName: v3.captainName || 'Nguyễn Anh Tuấn',
      positionTitle: 'Thuyền trưởng',
      nationality: 'Việt Nam',
      certNumber: 'TT-VRSB-QNG-002',
      certExpireDate: '2028-12-31',
    },
    {
      crewId: 'CRW-MT-03',
      fullName: 'Lê Minh Trung',
      positionTitle: 'Máy trưởng',
      nationality: 'Việt Nam',
      certNumber: 'MT-VRSB-QNG-103',
      certExpireDate: '2028-12-31',
    },
    {
      crewId: 'CRW-TT-03',
      fullName: 'Võ Duy Khánh',
      positionTitle: 'Thủy thủ',
      nationality: 'Việt Nam',
      certNumber: 'TH-VRSB-QNG-203',
      certExpireDate: '2028-10-15',
    },
  ];

  const trip3WaitingBp: TripRecord = {
    id: 'TRIP-0003',
    tripNumber: 'HS-2026-0003',
    orderNumber: '001/2026/LS-AB',
    isPermitSuspended: false,
    vesselId: v3.id,
    vesselName: v3.name,
    vesselRegNumber: v3.regNumber,
    vesselType: v3.vesselType,
    callSign: v3.callSign,
    movementType: 'DEPARTURE',
    tripSeqOfDay: 1,
    routeId: 'ROUTE-01',
    routeName: 'Tuyến Đảo Lớn – Đảo Bé (Chiều đi)',
    departurePortId: 'PORT-01',
    departurePortName: 'Bến cảng Lý Sơn (Đảo Lớn)',
    arrivalPortId: 'PORT-02',
    arrivalPortName: 'Bến Đảo Bé (An Bình)',
    berthLocation: 'Cầu cảng số 2 – Bến Đảo Lớn',
    createdDate: todayStr,
    submittedAt: t3SubmittedIso,
    scheduledDepartureTime: toLocalDateTimeInput(t3DepDate),
    issuedAt: t3IssuedIso,
    orderValidUntil: t3ValidUntilIso,
    issuedPdfName: 'Giay_Phep_Roi_Cang_001_2026_LS-AB.pdf',
    deptApprovedById: 'USR-04',
    deptApprovedByName: 'Nguyễn Phùng Nguyễn',
    deptApprovedAt: t3WeatherIso,
    approvedById: 'USR-02',
    approvedByName: signerName,
    approvedByTitle: signerFullTitle,
    approvedAt: t3IssuedIso,
    sealedAt: t3IssuedIso,
    sealedByName: 'Nguyễn Phùng Nguyễn',
    createdById: 'CAP-VES-02',
    createdByName: v3.captainName || 'Nguyễn Anh Tuấn',
    createdByRole: 'CAPTAIN',
    isDeclaredByPortStaff: false,
    actualDeclarantName: v3.captainName || 'Nguyễn Anh Tuấn',
    declarantPhone: v3.captainPhone || '0965123642',
    captainId: 'CRW-VES-02',
    captainName: v3.captainName || 'Nguyễn Anh Tuấn',
    captainCertNo: 'TT-VRSB-QNG-002',
    captainCertExpireDate: '2028-12-31',
    chiefEngineerId: 'CRW-MT-03',
    chiefEngineerName: 'Lê Minh Trung',
    chiefEngineerCertNo: 'MT-VRSB-QNG-103',
    crewMembers: t3Crew,
    passengerCount: t3Passengers.length,
    passengers: t3Passengers,
    cargoTons: 0,
    hasTransitCargo: false,
    feeTransactionCode: 'FT2611220003',
    requiredLifeJackets: t3Crew.length + t3Passengers.length,
    actualLifeJacketsReported: 38,
    status: 'DA_CAP_PHEP',
    bqlClock: {
      startedAt: t3SubmittedIso,
      completedAt: t3InspectedIso,
      pausedIntervals: [],
    },
    deptClock: {
      startedAt: t3InspectedIso,
      completedAt: t3IssuedIso,
      pausedIntervals: [],
    },
    portInspection: makePassedPortInspection({
      inspectedAt: t3InspectedIso,
      vesselRegExpire: v3.registryExpireDate,
      vesselTechExpire: v3.techSafetyExpireDate,
      vesselInsExpire: v3.civilInsuranceExpireDate,
      enginePowerCv: v3.enginePowerCv,
      actualPassengerCount: t3Passengers.length,
      actualCargoTons: 0,
      actualLifeJackets: 38,
      noticeNumber: 'TB-02/2026/TB-CTLS',
      shiftId: bqlShiftId,
      shiftName: bqlShiftName,
    }),
    approvalNotice: {
      noticeNumber: 'TB-02/2026/TB-CTLS',
      issuedAt: t3InspectedIso,
      approvedAt: t3InspectedIso,
      portId: 'PORT-01',
      portName: 'Bến cảng Lý Sơn (Đảo Lớn)',
      issuerId: 'USR-05',
      issuerName: 'Hoàng Văn Thắng',
      issuedById: 'USR-05',
      issuedByName: 'Hoàng Văn Thắng',
      inspectorName: 'Hoàng Văn Thắng',
      checklistSummary: 'Đạt đủ 8/8 nhóm kiểm tra thực tế tại bến Đảo Lớn',
      conclusionSummary: 'Đủ điều kiện an toàn rời bến.',
      feeVerified: true,
    },
    appendix02Review: {
      noticeApproved: true,
      generalDeclarationApproved: true,
      crewListApproved: true,
      passengerListApproved: true,
      appendix01Approved: true,
      allApproved: true,
      reviewedAt: t3WeatherIso,
      reviewerName: 'Nguyễn Phùng Nguyễn',
    },
    weatherCheckRecord: {
      checkedAt: t3WeatherIso,
      checkedById: 'USR-04',
      checkedByName: 'Nguyễn Phùng Nguyễn',
      area: 'Vùng biển Lý Sơn – Bình Sơn (Quảng Ngãi)',
      isSafe: true,
      windForceBeaufort: 4,
      waveHeightMeters: 1.0,
      visibilityKm: 12,
      forecastNote: 'Biển bình thường, gió Đông Bắc cấp 4, tầm nhìn > 10km, đủ điều kiện an toàn hành hải.',
      isRouteSuspended: false,
      conclusion: 'AN_TOAN',
    },
    officeSubmissionRecord: {
      draftApprovedAt: t3WeatherIso,
      draftApprovedById: 'USR-04',
      draftApprovedByName: 'Nguyễn Phùng Nguyễn',
      submittedToOfficeAt: new Date(nowMs - 32 * 60_000).toISOString(),
      submittedById: 'USR-04',
      submittedByName: 'Nguyễn Phùng Nguyễn',
      officeDocumentRef: 'VB-2026-0001-SXD',
      officeApprovedAt: t3IssuedIso,
      uploadedToSystemAt: t3IssuedIso,
      uploadedById: 'USR-04',
      uploadedByName: 'Nguyễn Phùng Nguyễn',
      issuedPdfName: 'Giay_Phep_Roi_Cang_001_2026_LS-AB.pdf',
      issuedAt: t3IssuedIso,
      issuedById: 'USR-04',
      issuedByName: 'Nguyễn Phùng Nguyễn',
      returns: [],
    },
    statusLogs: [
      {
        fromStatus: 'NHAP',
        toStatus: 'CHO_KIEM_TRA',
        changedAt: t3SubmittedIso,
        changedById: 'CAP-VES-02',
        changedByName: v3.captainName || 'Nguyễn Anh Tuấn',
        changedByRole: 'CAPTAIN',
        reason: 'Thuyền trưởng gửi hồ sơ rời cảng.',
      },
      {
        fromStatus: 'CHO_KIEM_TRA',
        toStatus: 'CHO_SO_XU_LY',
        changedAt: t3InspectedIso,
        changedById: 'USR-05',
        changedByName: 'Hoàng Văn Thắng',
        changedByRole: 'PORT_STAFF',
        shiftId: bqlShiftId,
        shiftName: bqlShiftName,
        reason: 'BQL Cảng cấp Thông báo chấp thuận TB-02/2026/TB-CTLS.',
      },
      {
        fromStatus: 'CHO_SO_XU_LY',
        toStatus: 'DA_CAP_PHEP',
        changedAt: t3IssuedIso,
        changedById: 'USR-04',
        changedByName: 'Nguyễn Phùng Nguyễn',
        changedByRole: 'OFFICER',
        shiftId: deptShiftId,
        shiftName: deptShiftName,
        milestone: 'OFFICE_PHAT_HANH',
        reason: `Phát hành Giấy phép rời cảng số 001/2026/LS-AB (Người ký: ${signerName}). Hiệu lực 24 giờ, chờ Biên phòng kiểm soát xuất bến.`,
      },
    ],
    rulesCheckResults: [],
    internalPhases: createDefaultPhases('DA_CAP_PHEP'),
    verificationCode: 'VRSB-001/2026/LS-AB',
    qrPayloadUrl: '#/xac-thuc-lenh/001%2F2026%2FLS-AB',
    isSynced: true,
  };

  // ================= 4. HỒ SƠ (TÀU) ĐANG CHẠY TRÊN BIỂN (DA_XUAT_BEN) =================
  const t4SubmittedIso = new Date(nowMs - 110 * 60_000).toISOString();
  const t4InspectedIso = new Date(nowMs - 85 * 60_000).toISOString();
  const t4WeatherIso = new Date(nowMs - 65 * 60_000).toISOString();
  const t4IssuedMs = nowMs - 45 * 60_000;
  const t4IssuedIso = new Date(t4IssuedMs).toISOString();
  const t4ValidUntilIso = new Date(t4IssuedMs + 24 * 3600 * 1000).toISOString();
  const t4DepartedIso = new Date(nowMs - 12 * 60_000).toISOString();
  const t4DepDate = new Date(nowMs - 15 * 60_000);
  const t4Passengers = makePassengers('T4', 8, true);
  const t4Crew = [
    {
      crewId: 'CRW-VES-05',
      fullName: v4.captainName || 'Bùi Tiến Dũng',
      positionTitle: 'Thuyền trưởng',
      nationality: 'Việt Nam',
      certNumber: 'TT-VRSB-QNG-005',
      certExpireDate: '2028-12-31',
    },
    {
      crewId: 'CRW-MT-04',
      fullName: 'Trương Quang Vinh',
      positionTitle: 'Máy trưởng',
      nationality: 'Việt Nam',
      certNumber: 'MT-VRSB-QNG-104',
      certExpireDate: '2028-11-30',
    },
    {
      crewId: 'CRW-TT-04',
      fullName: 'Lâm Văn Hậu',
      positionTitle: 'Thủy thủ',
      nationality: 'Việt Nam',
      certNumber: 'TH-VRSB-QNG-204',
      certExpireDate: '2028-10-31',
    },
  ];

  const t4BpChecklist: BpPersonCheckItem[] = [
    ...t4Crew.map((c) => ({
      personId: c.crewId,
      personType: 'CREW' as const,
      fullName: c.fullName,
      positionTitle: c.positionTitle,
      idNumber: c.certNumber,
      isOnboard: true,
      boarded: true,
      absent: false,
      checkedAt: t4DepartedIso,
      scanMethod: 'MANUAL' as const,
    })),
    ...t4Passengers.map((p) => ({
      personId: p.id,
      personType: 'PASSENGER' as const,
      fullName: p.fullName,
      idNumber: p.idNumber,
      birthYear: p.birthYear,
      isOnboard: true,
      boarded: true,
      absent: false,
      checkedAt: t4DepartedIso,
      scannedAt: t4DepartedIso,
      scanMethod: 'QR_CCCD' as const,
    })),
  ];

  const trip4AtSea: TripRecord = {
    id: 'TRIP-0004',
    tripNumber: 'HS-2026-0004',
    orderNumber: '002/2026/LS-AB',
    isPermitSuspended: false,
    vesselId: v4.id,
    vesselName: v4.name,
    vesselRegNumber: v4.regNumber,
    vesselType: v4.vesselType,
    callSign: v4.callSign,
    movementType: 'DEPARTURE',
    tripSeqOfDay: 1,
    routeId: 'ROUTE-01',
    routeName: 'Tuyến Đảo Lớn – Đảo Bé (Chiều đi)',
    departurePortId: 'PORT-01',
    departurePortName: 'Bến cảng Lý Sơn (Đảo Lớn)',
    arrivalPortId: 'PORT-02',
    arrivalPortName: 'Bến Đảo Bé (An Bình)',
    berthLocation: 'Cầu cảng số 3 – Bến Đảo Lớn',
    createdDate: todayStr,
    submittedAt: t4SubmittedIso,
    scheduledDepartureTime: toLocalDateTimeInput(t4DepDate),
    actualDepartureTime: t4DepartedIso,
    issuedAt: t4IssuedIso,
    orderValidUntil: t4ValidUntilIso,
    issuedPdfName: 'Giay_Phep_Roi_Cang_002_2026_LS-AB.pdf',
    deptApprovedById: 'USR-04',
    deptApprovedByName: 'Nguyễn Phùng Nguyễn',
    deptApprovedAt: t4WeatherIso,
    approvedById: 'USR-02',
    approvedByName: signerName,
    approvedByTitle: signerFullTitle,
    approvedAt: t4IssuedIso,
    sealedAt: t4IssuedIso,
    sealedByName: 'Nguyễn Phùng Nguyễn',
    createdById: 'CAP-VES-05',
    createdByName: v4.captainName || 'Bùi Tiến Dũng',
    createdByRole: 'CAPTAIN',
    isDeclaredByPortStaff: false,
    actualDeclarantName: v4.captainName || 'Bùi Tiến Dũng',
    declarantPhone: v4.captainPhone || '0985064479',
    captainId: 'CRW-VES-05',
    captainName: v4.captainName || 'Bùi Tiến Dũng',
    captainCertNo: 'TT-VRSB-QNG-005',
    captainCertExpireDate: '2028-12-31',
    chiefEngineerId: 'CRW-MT-04',
    chiefEngineerName: 'Trương Quang Vinh',
    chiefEngineerCertNo: 'MT-VRSB-QNG-104',
    crewMembers: t4Crew,
    passengerCount: t4Passengers.length,
    passengers: t4Passengers,
    cargoTons: 0,
    hasTransitCargo: false,
    feeTransactionCode: 'FT2611220004',
    requiredLifeJackets: t4Crew.length + t4Passengers.length,
    actualLifeJacketsReported: 40,
    status: 'DA_XUAT_BEN',
    bqlClock: {
      startedAt: t4SubmittedIso,
      completedAt: t4InspectedIso,
      pausedIntervals: [],
    },
    deptClock: {
      startedAt: t4InspectedIso,
      completedAt: t4IssuedIso,
      pausedIntervals: [],
    },
    portInspection: makePassedPortInspection({
      inspectedAt: t4InspectedIso,
      vesselRegExpire: v4.registryExpireDate,
      vesselTechExpire: v4.techSafetyExpireDate,
      vesselInsExpire: v4.civilInsuranceExpireDate,
      enginePowerCv: v4.enginePowerCv,
      actualPassengerCount: t4Passengers.length,
      actualCargoTons: 0,
      actualLifeJackets: 40,
      noticeNumber: 'TB-03/2026/TB-CTLS',
      shiftId: bqlShiftId,
      shiftName: bqlShiftName,
    }),
    approvalNotice: {
      noticeNumber: 'TB-03/2026/TB-CTLS',
      issuedAt: t4InspectedIso,
      approvedAt: t4InspectedIso,
      portId: 'PORT-01',
      portName: 'Bến cảng Lý Sơn (Đảo Lớn)',
      issuerId: 'USR-05',
      issuerName: 'Hoàng Văn Thắng',
      issuedById: 'USR-05',
      issuedByName: 'Hoàng Văn Thắng',
      inspectorName: 'Hoàng Văn Thắng',
      checklistSummary: 'Đạt đủ 8/8 nhóm kiểm tra thực tế tại bến Đảo Lớn',
      conclusionSummary: 'Đủ điều kiện an toàn rời bến.',
      feeVerified: true,
    },
    appendix02Review: {
      noticeApproved: true,
      generalDeclarationApproved: true,
      crewListApproved: true,
      passengerListApproved: true,
      appendix01Approved: true,
      allApproved: true,
      reviewedAt: t4WeatherIso,
      reviewerName: 'Nguyễn Phùng Nguyễn',
    },
    weatherCheckRecord: {
      checkedAt: t4WeatherIso,
      checkedById: 'USR-04',
      checkedByName: 'Nguyễn Phùng Nguyễn',
      area: 'Vùng biển Lý Sơn – Bình Sơn (Quảng Ngãi)',
      isSafe: true,
      windForceBeaufort: 4,
      waveHeightMeters: 1.0,
      visibilityKm: 12,
      forecastNote: 'Biển êm, tầm nhìn tốt > 10km, đảm bảo an toàn xuất bến.',
      isRouteSuspended: false,
      conclusion: 'AN_TOAN',
    },
    officeSubmissionRecord: {
      draftApprovedAt: t4WeatherIso,
      draftApprovedById: 'USR-04',
      draftApprovedByName: 'Nguyễn Phùng Nguyễn',
      submittedToOfficeAt: new Date(nowMs - 55 * 60_000).toISOString(),
      submittedById: 'USR-04',
      submittedByName: 'Nguyễn Phùng Nguyễn',
      officeDocumentRef: 'VB-2026-0002-SXD',
      officeApprovedAt: t4IssuedIso,
      uploadedToSystemAt: t4IssuedIso,
      uploadedById: 'USR-04',
      uploadedByName: 'Nguyễn Phùng Nguyễn',
      issuedPdfName: 'Giay_Phep_Roi_Cang_002_2026_LS-AB.pdf',
      issuedAt: t4IssuedIso,
      issuedById: 'USR-04',
      issuedByName: 'Nguyễn Phùng Nguyễn',
      returns: [],
    },
    bpDepartureControl: {
      id: 'BP-CTRL-0004',
      controlledAt: t4DepartedIso,
      checkedAt: t4DepartedIso,
      controllerId: 'USR-BP-TRUC-01',
      checkedById: 'USR-BP-TRUC-01',
      controllerName: 'Đại úy Lê Minh Tuấn',
      checkedByName: 'Đại úy Lê Minh Tuấn',
      inspectorName: 'Đại úy Lê Minh Tuấn',
      portId: 'PORT-01',
      portName: 'Bến cảng Lý Sơn (Đảo Lớn)',
      shiftId: bpShiftId,
      shiftName: bpShiftName,
      qrVerified: true,
      scannedQrCode: '002/2026/LS-AB',
      permitQrChecks: {
        hasPermit: true,
        matchesVessel: true,
        within24h: true,
        outcome: 'HOP_LE',
      },
      permitStatusAtCheck: 'HOP_LE',
      scheduledTotalPeople: t4Crew.length + t4Passengers.length,
      actualTotalPeople: t4Crew.length + t4Passengers.length,
      actualCrewCount: t4Crew.length,
      actualPassengerCount: t4Passengers.length,
      absentCount: 0,
      crewChanged: false,
      checklist: t4BpChecklist,
      unlistedPeople: [],
      hasAnomaly: false,
      action: 'CHO_XUAT_BEN',
      decision: 'CHO_XUAT_BEN',
    },
    statusLogs: [
      {
        fromStatus: 'NHAP',
        toStatus: 'CHO_KIEM_TRA',
        changedAt: t4SubmittedIso,
        changedById: 'CAP-VES-05',
        changedByName: v4.captainName || 'Bùi Tiến Dũng',
        changedByRole: 'CAPTAIN',
        reason: 'Thuyền trưởng gửi hồ sơ rời cảng.',
      },
      {
        fromStatus: 'CHO_KIEM_TRA',
        toStatus: 'CHO_SO_XU_LY',
        changedAt: t4InspectedIso,
        changedById: 'USR-05',
        changedByName: 'Hoàng Văn Thắng',
        changedByRole: 'PORT_STAFF',
        shiftId: bqlShiftId,
        shiftName: bqlShiftName,
        reason: 'BQL Cảng cấp Thông báo chấp thuận TB-03/2026/TB-CTLS.',
      },
      {
        fromStatus: 'CHO_SO_XU_LY',
        toStatus: 'DA_CAP_PHEP',
        changedAt: t4IssuedIso,
        changedById: 'USR-04',
        changedByName: 'Nguyễn Phùng Nguyễn',
        changedByRole: 'OFFICER',
        shiftId: deptShiftId,
        shiftName: deptShiftName,
        milestone: 'OFFICE_PHAT_HANH',
        reason: `Phát hành Giấy phép rời cảng số 002/2026/LS-AB (Người ký: ${signerName}).`,
      },
      {
        fromStatus: 'DA_CAP_PHEP',
        toStatus: 'DA_XUAT_BEN',
        changedAt: t4DepartedIso,
        changedById: 'USR-BP-TRUC-01',
        changedByName: 'Đại úy Lê Minh Tuấn',
        changedByRole: 'BP_TRUC',
        shiftId: bpShiftId,
        shiftName: bpShiftName,
        milestone: 'BP_CHO_XUAT_BEN',
        reason: `Biên phòng Đảo Lớn kiểm soát đạt cả 3 nội dung và cho xuất bến lúc ${t4DepartedIso}. Số người thực tế trên tàu: 11 người (3 thuyền viên, 8 hành khách).`,
      },
    ],
    rulesCheckResults: [],
    internalPhases: createDefaultPhases('DA_XUAT_BEN'),
    verificationCode: 'VRSB-002/2026/LS-AB',
    qrPayloadUrl: '#/xac-thuc-lenh/002%2F2026%2FLS-AB',
    isSynced: true,
  };

  return [trip1Submitted, trip2WaitingDept, trip3WaitingBp, trip4AtSea];
}
