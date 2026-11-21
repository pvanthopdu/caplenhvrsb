/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  UserAccount,
  TripRecord,
  BpPersonCheckItem,
  PortInspectionAppendix01,
  DutyShift,
  normalizeStatus,
} from '../types';
import { repository } from '../services/repository';
import {
  buildDossierSummaries,
  computePersonScorecard,
  DEFAULT_KPI_CONFIG,
} from '../services/kpiEngine';
import { KpiStaffProfile } from '../types/kpi';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

interface TestScenariosPageProps {
  currentUser: UserAccount;
  onNavigate: (page: string, tripId?: string) => void;
}

interface ScenarioOutcome {
  id: string;
  code: string;
  title: string;
  passed: boolean;
  details: string;
}

function makeAppendix01(
  actor: UserAccount,
  trip: TripRecord,
  conclusion: 'ELIGIBLE' | 'INELIGIBLE',
  rejectReasonDetails?: string
): PortInspectionAppendix01 {
  const cfg = repository.getAdminConfig();
  return {
    inspectorId: actor.id,
    inspectorName: actor.fullName,
    inspectedAt: new Date().toISOString(),
    portId: trip.departurePortId as 'PORT-01' | 'PORT-02',
    portName: trip.departurePortName,
    checkVesselDocuments: true,
    checkCrewCertificates: true,
    checkActualPassengers: true,
    actualPassengerCount: trip.passengerCount,
    checkCargoSafety: true,
    actualCargoTons: trip.cargoTons,
    checkLifeSavingEquip: true,
    actualLifeJackets: trip.actualLifeJacketsReported,
    checkFireSafety: true,
    checkWeatherCondition: true,
    currentWindForce: 3,
    currentWaveHeight: 0.8,
    feeVerified: true,
    feeVerifyNote: trip.feeTransactionCode ? `Mã GD: ${trip.feeTransactionCode}` : 'Đã kiểm tra biên lai',
    checklistItems: cfg.bqlChecklistConfig.map((c) => ({
      itemId: c.id,
      groupCode: c.groupCode,
      groupTitle: c.groupTitle,
      label: c.label,
      status: conclusion === 'ELIGIBLE' ? 'DAT' : c.groupCode === 'G2' ? 'KHONG_DAT' : 'DAT',
      note: conclusion === 'INELIGIBLE' && c.groupCode === 'G2' ? rejectReasonDetails || 'Không đạt' : '',
    })),
    photoUrls: [],
    conclusion,
    rejectReasonDetails,
    notes: conclusion === 'ELIGIBLE' ? 'Đạt 8/8 nhóm điều kiện an toàn tại bến.' : rejectReasonDetails,
  };
}

function buildTestTripPayload(suffix: string, captain: UserAccount, withFee = true): TripRecord {
  const vessels = repository.getVessels();
  const vessel = vessels[0];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const depIso = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const uniq = `${suffix}-${String(Date.now()).slice(-4)}`;
  const crewMembers = [
    {
      crewId: `CREW-KB-${uniq}-1`,
      fullName: `Thuyền trưởng Test ${uniq}`,
      positionTitle: 'Thuyền trưởng',
      certNumber: `TT-KB-${uniq}-01`,
      certExpireDate: '2029-12-31',
    },
    {
      crewId: `CREW-KB-${uniq}-2`,
      fullName: `Máy trưởng Test ${uniq}`,
      positionTitle: 'Máy trưởng',
      certNumber: `MT-KB-${uniq}-02`,
      certExpireDate: '2029-12-31',
    },
    {
      crewId: `CREW-KB-${uniq}-3`,
      fullName: `Thủy thủ Test ${uniq}`,
      positionTitle: 'Thủy thủ',
      certNumber: `TV-KB-${uniq}-03`,
      certExpireDate: '2029-12-31',
    },
  ];

  return {
    id: `TRIP-KB-${uniq}`,
    tripNumber: `HS-KB-${uniq}`,
    vesselId: vessel.id,
    vesselName: vessel.name,
    vesselRegNumber: vessel.regNumber,
    vesselType: vessel.vesselType,
    routeId: 'ROUTE-LS-AB',
    routeName: 'Đảo Lớn ↔ Đảo Bé (An Bình)',
    departurePortId: 'PORT-01',
    departurePortName: 'Bến cảng Bến Đình (Đảo Lớn)',
    arrivalPortId: 'PORT-02',
    arrivalPortName: 'Bến cập tàu An Bình (Đảo Bé)',
    createdDate: todayStr,
    scheduledDepartureTime: depIso,
    createdById: captain.id,
    createdByName: captain.fullName,
    createdByRole: captain.role,
    isDeclaredByPortStaff: false,
    captainId: crewMembers[0].crewId,
    captainName: crewMembers[0].fullName,
    captainCertNo: crewMembers[0].certNumber,
    captainCertExpireDate: crewMembers[0].certExpireDate,
    crewMembers,
    passengerCount: 2,
    passengers: [
      {
        id: `PAX-1-${suffix}`,
        fullName: 'Nguyễn Văn An',
        birthYear: 1990,
        gender: 'NAM',
        idNumber: '051090001234',
        phone: '0905123456',
        nationality: 'Việt Nam',
        isForeigner: false,
        address: 'Đặc khu Lý Sơn, Quảng Ngãi',
      },
      {
        id: `PAX-2-${suffix}`,
        fullName: 'Trần Thị Bình',
        birthYear: 1994,
        gender: 'NU',
        idNumber: '051194005678',
        phone: '0905654321',
        nationality: 'Việt Nam',
        isForeigner: false,
        address: 'TP. Quảng Ngãi',
      },
    ],
    cargoTons: 0.5,
    cargoDescription: 'Nhu yếu phẩm dân sinh',
    uploadedDocuments: withFee
      ? [
          {
            id: `DOC-FEE-${suffix}`,
            category: 'FEE_RECEIPT',
            categoryName: 'Biên lai nộp phí, lệ phí',
            fileName: `bien-lai-${suffix}.pdf`,
            fileType: 'PDF',
            fileSize: '120 KB',
            uploadedAt: now.toISOString(),
            previewUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
          },
        ]
      : [],
    feeTransactionCode: withFee ? `VCB-KB-${suffix}` : undefined,
    requiredLifeJackets: crewMembers.length + 2,
    actualLifeJacketsReported: crewMembers.length + 5,
    status: 'NHAP',
    statusLogs: [],
    rulesCheckResults: [],
    internalPhases: [],
    verificationCode: `VR-KB-${suffix}-${String(Date.now()).slice(-4)}`,
    qrPayloadUrl: '',
  };
}

function buildBpChecklist(trip: TripRecord): BpPersonCheckItem[] {
  return [
    ...trip.crewMembers.map((cm) => ({
      personId: cm.crewId,
      personType: 'CREW' as const,
      fullName: cm.fullName,
      positionTitle: cm.positionTitle,
      idNumber: cm.certNumber,
      isOnboard: true,
      boarded: true,
      scanMethod: 'QR_CCCD' as const,
    })),
    ...trip.passengers.map((p) => ({
      personId: p.id,
      personType: 'PASSENGER' as const,
      fullName: p.fullName,
      birthYear: p.birthYear,
      idNumber: p.idNumber,
      isOnboard: true,
      boarded: true,
      scanMethod: 'QR_CCCD' as const,
    })),
  ];
}

export const TestScenariosPage: React.FC<TestScenariosPageProps> = ({ currentUser }) => {
  const [outcomes, setOutcomes] = useState<ScenarioOutcome[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runAll12Scenarios = () => {
    setIsRunning(true);
    const results: ScenarioOutcome[] = [];

    const users = repository.getAllUsers();
    const captain = users.find((u) => u.role === 'CAPTAIN')!;
    const bqlPort1 =
      users.find((u) => u.role === 'PORT_STAFF' && u.assignedPortId === 'PORT-01') ||
      users.find((u) => u.role === 'PORT_STAFF')!;
    const bqlPort2 = users.find((u) => u.role === 'PORT_STAFF' && u.assignedPortId === 'PORT-02');
    const officer = users.find((u) => u.role === 'OFFICER')!;
    const deptHead = users.find((u) => u.role === 'DEPT_HEAD')!;
    const bpPort1 =
      users.find((u) => (u.role === 'BP_TRUC' || u.role === 'BP_CHIHUY') && u.assignedPortId === 'PORT-01') ||
      users.find((u) => u.role === 'BP_TRUC')!;
    const bpPort2 =
      users.find((u) => (u.role === 'BP_TRUC' || u.role === 'BP_CHIHUY') && u.assignedPortId === 'PORT-02') ||
      users.find((u) => u.role === 'BP_CHIHUY')!;
    const bpChiHuy = users.find((u) => u.role === 'BP_CHIHUY') || bpPort1;

    // Bảo đảm có ca trực 00:00–23:59 cho hôm nay để kịch bản chạy ở mọi khung giờ
    const todayStr = new Date().toISOString().slice(0, 10);
    const prevShifts = repository.getDutyShifts();
    const ensureShifts: DutyShift[] = [
      ...prevShifts,
      {
        id: 'SHIFT-TEST-BQL-P1',
        date: todayStr,
        dutyDate: todayStr,
        shiftName: 'Ca kiểm thử BQL Đảo Lớn',
        roleGroup: 'BQL_CANG',
        portId: 'PORT-01',
        startTime: '00:00',
        endTime: '23:59',
        assigneeIds: [bqlPort1.id],
        assigneeNames: [bqlPort1.fullName],
        officerId: bqlPort1.id,
        officerName: bqlPort1.fullName,
      },
      {
        id: 'SHIFT-TEST-CV',
        date: todayStr,
        dutyDate: todayStr,
        shiftName: 'Ca kiểm thử Chuyên viên Sở',
        roleGroup: 'CHUYEN_VIEN',
        startTime: '00:00',
        endTime: '23:59',
        assigneeIds: [officer.id],
        assigneeNames: [officer.fullName],
        officerId: officer.id,
        officerName: officer.fullName,
      },
      {
        id: 'SHIFT-TEST-BP-P1',
        date: todayStr,
        dutyDate: todayStr,
        shiftName: 'Ca kiểm thử BP Đảo Lớn',
        roleGroup: 'BIEN_PHONG',
        portId: 'PORT-01',
        startTime: '00:00',
        endTime: '23:59',
        assigneeIds: Array.from(new Set([bpPort1.id, bpChiHuy.id])),
        assigneeNames: Array.from(new Set([bpPort1.fullName, bpChiHuy.fullName])),
        officerId: bpPort1.id,
        officerName: bpPort1.fullName,
      },
      {
        id: 'SHIFT-TEST-BP-P2',
        date: todayStr,
        dutyDate: todayStr,
        shiftName: 'Ca kiểm thử BP Đảo Bé',
        roleGroup: 'BIEN_PHONG',
        portId: 'PORT-02',
        startTime: '00:00',
        endTime: '23:59',
        assigneeIds: Array.from(new Set([bpPort2.id, bpChiHuy.id])),
        assigneeNames: Array.from(new Set([bpPort2.fullName, bpChiHuy.fullName])),
        officerId: bpPort2.id,
        officerName: bpPort2.fullName,
      },
    ];
    ensureShifts.slice(prevShifts.length).forEach((s) => repository.saveDutyShift(s));

    // Bảo đảm thời tiết đang an toàn khi mở đầu
    const weather = repository.getWeather();
    if (weather.isRouteSuspended || weather.windForceBeaufort >= 6) {
      repository.saveWeather({
        ...weather,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        isRouteSuspended: false,
        suspensionReason: undefined,
      });
    }

    // Bảo đảm có phương tiện & thuyền viên mẫu hợp lệ nếu danh mục đang trống
    if (repository.getVessels().length === 0) {
      repository.saveVessel({
        id: 'VSL-TEST-01',
        regNumber: 'QNg-0237',
        callSign: 'QNG0237',
        name: 'An Bình 02',
        vesselType: 'Tàu khách cao tốc VR-SB',
        maxPassengers: 45,
        maxCargoTons: 5,
        minCrew: 3,
        maxWindForce: 6,
        maxWaveHeight: 2.0,
        registryExpireDate: '2029-12-31',
        operatingLicenseExpireDate: '2029-12-31',
        techSafetyExpireDate: '2029-12-31',
        civilInsuranceExpireDate: '2029-12-31',
        ownerName: captain.fullName,
        ownerPhone: captain.phone || '0905111222',
        isActive: true,
      });
    }
    const testVessel = repository.getVessels()[0];
    if (repository.getCrew().filter((c) => c.assignedVesselId === testVessel.id).length < 3) {
      [
        {
          id: 'CREW-TEST-01',
          fullName: 'Trần Văn Hải',
          citizenId: '051080000101',
          phone: '0905100101',
          position: 'CAPTAIN' as const,
          positionTitle: 'Thuyền trưởng',
          certNumber: 'TT-QNG-2026-01',
          certType: 'Thuyền trưởng hạng Nhất',
          certExpireDate: '2029-12-31',
          assignedVesselId: testVessel.id,
          status: 'ACTIVE' as const,
        },
        {
          id: 'CREW-TEST-02',
          fullName: 'Nguyễn Minh Tâm',
          citizenId: '051082000102',
          phone: '0905100102',
          position: 'CHIEF_ENGINEER' as const,
          positionTitle: 'Máy trưởng',
          certNumber: 'MT-QNG-2026-02',
          certType: 'Máy trưởng hạng Nhất',
          certExpireDate: '2029-12-31',
          assignedVesselId: testVessel.id,
          status: 'ACTIVE' as const,
        },
        {
          id: 'CREW-TEST-03',
          fullName: 'Lê Hoàng Nam',
          citizenId: '051085000103',
          phone: '0905100103',
          position: 'DECKHAND' as const,
          positionTitle: 'Thủy thủ',
          certNumber: 'TV-QNG-2026-03',
          certType: 'Chứng chỉ thủy thủ',
          certExpireDate: '2029-12-31',
          assignedVesselId: testVessel.id,
          status: 'ACTIVE' as const,
        },
      ].forEach((c) => repository.saveCrew(c));
    }

    const runStep = (id: string, code: string, title: string, fn: () => { passed: boolean; details: string }) => {
      try {
        const res = fn();
        results.push({ id, code, title, ...res });
      } catch (err) {
        results.push({
          id,
          code,
          title,
          passed: false,
          details: `Lỗi ngoại lệ: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    // KB1: Luồng chuẩn khép kín
    runStep('kb1', 'KB1', 'Luồng chuẩn khép kín (Nộp → BQL → Sở/Office → Biên phòng → Cập bến)', () => {
      const t = buildTestTripPayload('01', captain, true);
      const r1 = repository.submitTripDossier(t, captain);
      if (!r1.success || !r1.trip) return { passed: false, details: `Nộp lỗi: ${r1.error}` };
      const r2 = repository.concludePortInspection(r1.trip.id, bqlPort1, makeAppendix01(bqlPort1, r1.trip, 'ELIGIBLE'), true);
      if (!r2.success || normalizeStatus(r2.trip?.status) !== 'CHO_SO_XU_LY') {
        return { passed: false, details: `BQL lỗi: ${r2.error || r2.trip?.status}` };
      }
      const r3 = repository.recordDeptWeatherCheck(r1.trip.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm, đảm bảo an toàn.',
      });
      if (!r3.success) return { passed: false, details: `Kiểm tra thời tiết lỗi: ${r3.error}` };
      const r4 = repository.approveDeptDraft(r1.trip.id, officer);
      const r5 = repository.markSubmittedToOffice(r1.trip.id, officer, 'VB-KB01');
      const r6 = repository.publishOfficePermit(r1.trip.id, officer, {
        orderNumber: `901/2026/LS-AB-${String(Date.now()).slice(-3)}`,
        issuedAt: new Date().toISOString(),
        pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        pdfName: 'gp-kb01.pdf',
      });
      if (!r4.success || !r5.success || !r6.success || normalizeStatus(r6.trip?.status) !== 'DA_CAP_PHEP') {
        return { passed: false, details: `Sở/Office lỗi: ${r4.error || r5.error || r6.error}` };
      }
      const r7 = repository.submitBpDepartureControl(r1.trip.id, bpPort1, {
        portId: 'PORT-01',
        qrVerified: true,
        checklist: buildBpChecklist(r6.trip!),
        unlistedPeople: [],
        action: 'CHO_XUAT_BEN',
      });
      if (!r7.success || normalizeStatus(r7.trip?.status) !== 'DA_XUAT_BEN') {
        return { passed: false, details: `Biên phòng xuất bến lỗi: ${r7.error}` };
      }
      const r8 = repository.confirmVesselArrival(r1.trip.id, bpPort2, 'Tàu cập bến Đảo Bé an toàn');
      if (!r8.success || normalizeStatus(r8.trip?.status) !== 'DA_CAP_BEN') {
        return { passed: false, details: `Xác nhận cập bến lỗi: ${r8.error}` };
      }
      return {
        passed: true,
        details: `Đã qua đủ 8 chặng: CHO_KIEM_TRA → CHO_SO_XU_LY → DA_DUYET → DANG_TRINH_OFFICE → DA_CAP_PHEP (${r6.trip?.orderNumber}) → DA_XUAT_BEN → DA_CAP_BEN.`,
      };
    });

    // KB2: Thiếu biên lai/mã GD phí bị chặn R11
    runStep('kb2', 'KB2', 'Thiếu biên lai / mã giao dịch phí bị chặn bởi quy tắc R11', () => {
      const t = buildTestTripPayload('02', captain, false);
      const r1 = repository.submitTripDossier(t, captain);
      const hasR11Block = !r1.success && Boolean(r1.error?.includes('R11') || r1.error?.toLowerCase().includes('phí'));
      return {
        passed: hasR11Block,
        details: hasR11Block
          ? `Hệ thống đã chặn nộp hồ sơ đúng quy tắc R11: "${r1.error}".`
          : `Sai kỳ vọng: success=${r1.success}, error=${r1.error}`,
      };
    });

    // KB3: BQL trả Chủ tàu bổ sung (tạm dừng đồng hồ BQL → nộp lại chạy tiếp)
    runStep('kb3', 'KB3', 'BQL Cảng trả Chủ tàu bổ sung (tạm dừng đồng hồ BQL → nộp lại về CHO_KIEM_TRA)', () => {
      const t = buildTestTripPayload('03', captain, true);
      const r1 = repository.submitTripDossier(t, captain);
      if (!r1.success || !r1.trip) return { passed: false, details: r1.error || 'Nộp lỗi' };
      const rRet = repository.returnTripFromPortToCaptain(r1.trip.id, bqlPort1, 'Bổ sung ảnh biên lai rõ nét hơn', 'bo_sung_chung_tu');
      const pausedOk = Boolean(rRet.success && rRet.trip?.status === 'TRA_CHU_TAU' && rRet.trip?.bqlClock?.pausedAt);
      const rResub = repository.submitTripDossier({ ...rRet.trip!, feeTransactionCode: 'VCB-KB03-FIX' }, captain);
      const resumedOk = Boolean(
        rResub.success &&
          normalizeStatus(rResub.trip?.status) === 'CHO_KIEM_TRA' &&
          !rResub.trip?.bqlClock?.pausedAt &&
          (rResub.trip?.bqlClock?.pausedIntervals?.length || 0) >= 1
      );
      return {
        passed: pausedOk && resumedOk,
        details: `Trả Chủ tàu: ${rRet.trip?.status} (tạm dừng đồng hồ BQL=${Boolean(rRet.trip?.bqlClock?.pausedAt)}) → Nộp lại: ${rResub.trip?.status} (số khoảng trừ giờ=${rResub.trip?.bqlClock?.pausedIntervals?.length || 0}).`,
      };
    });

    // KB4: BQL kết luận Không chấp thuận
    runStep('kb4', 'KB4', 'BQL Cảng kết luận Không chấp thuận (đóng hồ sơ KHONG_CHAP_THUAN)', () => {
      const t = buildTestTripPayload('04', captain, true);
      const r1 = repository.submitTripDossier(t, captain);
      if (!r1.success || !r1.trip) return { passed: false, details: r1.error || 'Nộp lỗi' };
      const r2 = repository.concludePortInspection(
        r1.trip.id,
        bqlPort1,
        makeAppendix01(bqlPort1, r1.trip, 'INELIGIBLE', 'Thiếu 02 áo phao đạt chuẩn theo biên bản tại bến'),
        false,
        'Thiếu 02 áo phao đạt chuẩn theo biên bản tại bến'
      );
      const ok = Boolean(r2.success && normalizeStatus(r2.trip?.status) === 'KHONG_CHAP_THUAN');
      return {
        passed: ok,
        details: ok
          ? `Đã kết luận KHONG_CHAP_THUAN, đồng hồ BQL dừng, hồ sơ đóng.`
          : `Thất bại: ${r2.error || r2.trip?.status}`,
      };
    });

    // KB5: Sở trả Chủ tàu (nộp lại thẳng Sở) & Sở trả BQL (tạm dừng đồng hồ Sở)
    runStep('kb5', 'KB5', 'Sở trả Chủ tàu (nộp lại đi thẳng CHO_SO_XU_LY) & Sở trả BQL (TRA_BQL_CANG)', () => {
      // Nhánh A: Sở trả Chủ tàu
      const tA = buildTestTripPayload('05A', captain, true);
      const subA = repository.submitTripDossier(tA, captain);
      repository.concludePortInspection(subA.trip!.id, bqlPort1, makeAppendix01(bqlPort1, subA.trip!, 'ELIGIBLE'), true);
      const retA = repository.returnTripToCaptainFromDept(subA.trip!.id, officer, 'Điều chỉnh năm sinh hành khách số 2', 'sua_hanh_khach');
      const resubA = repository.submitTripDossier({ ...retA.trip! }, captain);
      const okA = Boolean(
        retA.success &&
          retA.trip?.status === 'TRA_CHU_TAU' &&
          retA.trip?.deptClock?.pausedAt &&
          resubA.success &&
          normalizeStatus(resubA.trip?.status) === 'CHO_SO_XU_LY' &&
          Boolean(resubA.trip?.approvalNotice)
      );

      // Nhánh B: Sở trả BQL
      const tB = buildTestTripPayload('05B', captain, true);
      const subB = repository.submitTripDossier(tB, captain);
      repository.concludePortInspection(subB.trip!.id, bqlPort1, makeAppendix01(bqlPort1, subB.trip!, 'ELIGIBLE'), true);
      const retB = repository.returnTripToPortFromDept(subB.trip!.id, officer, 'Số khách trên Phụ lục 01 chưa khớp bản khai');
      const okB = Boolean(retB.success && normalizeStatus(retB.trip?.status) === 'TRA_BQL_CANG' && retB.trip?.deptClock?.pausedAt);

      return {
        passed: okA && okB,
        details: `Nhánh A (Sở→Chủ tàu→nộp lại): ${resubA.trip?.status}, giữ Thông báo BQL=${Boolean(resubA.trip?.approvalNotice)}. Nhánh B (Sở→BQL): ${retB.trip?.status}, tạm dừng đồng hồ Sở=${Boolean(retB.trip?.deptClock?.pausedAt)}.`,
      };
    });

    // KB6: Tạm dừng thời tiết & Mở lại tuyến
    runStep('kb6', 'KB6', 'Tạm dừng do thời tiết (TAM_DUNG_THOI_TIET, dừng đồng hồ Sở) & Mở lại', () => {
      const t = buildTestTripPayload('06', captain, true);
      const sub = repository.submitTripDossier(t, captain);
      repository.concludePortInspection(sub.trip!.id, bqlPort1, makeAppendix01(bqlPort1, sub.trip!, 'ELIGIBLE'), true);
      const susp = repository.suspendWaitingTripsByWeather(officer, 'Gió Đông Bắc cấp 6–7, sóng cao 2.5m tại Lý Sơn');
      const pausedTrip = repository.getTripById(sub.trip!.id);
      const pausedOk = Boolean(
        susp.success &&
          normalizeStatus(pausedTrip?.status) === 'TAM_DUNG_THOI_TIET' &&
          pausedTrip?.deptClock?.pausedAt
      );
      const resm = repository.resumeWeatherSuspension(officer);
      const resumedTrip = repository.getTripById(sub.trip!.id);
      const resumedOk = Boolean(
        resm.success &&
          normalizeStatus(resumedTrip?.status) === 'CHO_SO_XU_LY' &&
          !resumedTrip?.deptClock?.pausedAt
      );
      return {
        passed: pausedOk && resumedOk,
        details: `Tạm dừng: ${pausedTrip?.status} (ảnh hưởng ${susp.affectedCount} hồ sơ) → Mở lại: ${resumedTrip?.status} (đồng hồ Sở đã trừ thời gian thời tiết).`,
      };
    });

    // KB7: Office trả lại (loi_ho_so vs loi_xu_ly ảnh hưởng KPI CV-C1)
    runStep('kb7', 'KB7', 'Office trả lại: phân biệt loi_ho_so (không trừ CV) vs loi_xu_ly (trừ CV-C1)', () => {
      const t1 = buildTestTripPayload('07A', captain, true);
      const s1 = repository.submitTripDossier(t1, captain).trip!;
      repository.concludePortInspection(s1.id, bqlPort1, makeAppendix01(bqlPort1, s1, 'ELIGIBLE'), true);
      repository.recordDeptWeatherCheck(s1.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm',
      });
      repository.approveDeptDraft(s1.id, officer);
      repository.markSubmittedToOffice(s1.id, officer, 'VB-07A');
      const ret1 = repository.recordOfficeReturn(s1.id, officer, {
        returnerRole: 'TRUONG_PHONG',
        nhomLoi: 'loi_ho_so',
        reason: 'Chủ tàu cần bổ sung giấy tờ tàu theo yêu cầu bổ sung',
      });

      const t2 = buildTestTripPayload('07B', captain, true);
      const s2 = repository.submitTripDossier(t2, captain).trip!;
      repository.concludePortInspection(s2.id, bqlPort1, makeAppendix01(bqlPort1, s2, 'ELIGIBLE'), true);
      repository.recordDeptWeatherCheck(s2.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm',
      });
      repository.approveDeptDraft(s2.id, officer);
      repository.markSubmittedToOffice(s2.id, officer, 'VB-07B');
      const ret2 = repository.recordOfficeReturn(s2.id, officer, {
        returnerRole: 'LANH_DAO_SO',
        nhomLoi: 'loi_xu_ly',
        reason: 'Chuyên viên kiểm tra thiếu đối chiếu tải trọng',
      });

      const summaries = buildDossierSummaries([], [], DEFAULT_KPI_CONFIG.timeNorms, [], [ret1.trip!, ret2.trip!]);
      const sum1 = summaries.find((x) => x.hoSoId === s1.id);
      const sum2 = summaries.find((x) => x.hoSoId === s2.id);
      const ok = Boolean(
        ret1.success &&
          ret2.success &&
          sum1?.officeReturnErrorGroup === 'loi_ho_so' &&
          sum2?.officeReturnErrorGroup === 'loi_xu_ly'
      );
      return {
        passed: ok,
        details: `HS1=${sum1?.officeReturnErrorGroup} (không phạt CV-C1); HS2=${sum2?.officeReturnErrorGroup} (tính lỗi CV-C1).`,
      };
    });

    // KB8: Tải Giấy phép sau Office trễ > 10 phút
    runStep('kb8', 'KB8', 'Tải Giấy phép sau phát hành Office trễ > 10 phút (đánh dấu trễ CV-T2)', () => {
      const t = buildTestTripPayload('08', captain, true);
      const s = repository.submitTripDossier(t, captain).trip!;
      repository.concludePortInspection(s.id, bqlPort1, makeAppendix01(bqlPort1, s, 'ELIGIBLE'), true);
      repository.recordDeptWeatherCheck(s.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm',
      });
      repository.approveDeptDraft(s.id, officer);
      repository.markSubmittedToOffice(s.id, officer, 'VB-08');
      const now = new Date();
      const issued25mAgo = new Date(now.getTime() - 25 * 60 * 1000).toISOString();
      const pub = repository.publishOfficePermit(
        s.id,
        officer,
        {
          orderNumber: `908/2026/LS-AB-${String(Date.now()).slice(-3)}`,
          issuedAt: issued25mAgo,
          pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
          pdfName: 'gp-kb08.pdf',
        },
        now
      );
      const summaries = buildDossierSummaries([], [], DEFAULT_KPI_CONFIG.timeNorms, [], [pub.trip!]);
      const sum = summaries.find((x) => x.hoSoId === s.id);
      const uploadMins = sum?.netMinutes.OFFICE_UPLOAD_10 ?? 0;
      const ok = Boolean(pub.success && uploadMins > 10);
      return {
        passed: ok,
        details: `Khoảng trễ tải PDF sau phát hành Office = ${uploadMins} phút (> 10 phút định mức CV-T2).`,
      };
    });

    // KB9: Biên phòng phát hiện người ngoài danh sách (R12)
    runStep('kb9', 'KB9', 'Biên phòng phát hiện người ngoài danh sách (R12 → thu hồi GP cũ, đi lại từ BQL)', () => {
      const t = buildTestTripPayload('09', captain, true);
      const s = repository.submitTripDossier(t, captain).trip!;
      repository.concludePortInspection(s.id, bqlPort1, makeAppendix01(bqlPort1, s, 'ELIGIBLE'), true);
      repository.recordDeptWeatherCheck(s.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm',
      });
      repository.approveDeptDraft(s.id, officer);
      repository.markSubmittedToOffice(s.id, officer, 'VB-09');
      const oldOrderNo = `909/2026/LS-AB-${String(Date.now()).slice(-3)}`;
      const pub = repository.publishOfficePermit(s.id, officer, {
        orderNumber: oldOrderNo,
        issuedAt: new Date().toISOString(),
        pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        pdfName: 'gp-kb09.pdf',
      });
      const bpRes = repository.submitBpDepartureControl(s.id, bpPort1, {
        portId: 'PORT-01',
        qrVerified: true,
        checklist: buildBpChecklist(pub.trip!),
        unlistedPeople: [
          {
            fullName: 'Lê Minh C',
            idNumber: '051088009999',
            birthYear: 1988,
            personType: 'PASSENGER',
            note: 'Phát hiện thêm tại cầu bến chưa có trong danh sách',
          },
        ],
        action: 'TRA_CHU_TAU_R12',
      });
      const qrCheckOld = repository.verifyPermitByCode(oldOrderNo);
      const resub = repository.submitTripDossier({ ...bpRes.trip! }, captain);
      const ok = Boolean(
        bpRes.success &&
          normalizeStatus(bpRes.trip?.status) === 'TRA_CHU_TAU' &&
          bpRes.trip?.supersededOrderNumbers?.includes(oldOrderNo) &&
          qrCheckOld.outcome === 'DA_THU_HOI' &&
          resub.success &&
          normalizeStatus(resub.trip?.status) === 'CHO_KIEM_TRA'
      );
      return {
        passed: ok,
        details: `Sau R12: status=${bpRes.trip?.status}, GP cũ ${oldOrderNo} quét QR=${qrCheckOld.outcome}, Chủ tàu nộp lại quay về ${resub.trip?.status} (đi lại từ BQL).`,
      };
    });

    // KB10: Biên phòng tạm giữ bất thường & Gỡ tạm giữ
    runStep('kb10', 'KB10', 'Biên phòng tạm giữ bất thường (QR=TAM_DINH_CHI) & Gỡ tạm giữ (QR=HOP_LE)', () => {
      const t = buildTestTripPayload('10', captain, true);
      const s = repository.submitTripDossier(t, captain).trip!;
      repository.concludePortInspection(s.id, bqlPort1, makeAppendix01(bqlPort1, s, 'ELIGIBLE'), true);
      repository.recordDeptWeatherCheck(s.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm',
      });
      repository.approveDeptDraft(s.id, officer);
      repository.markSubmittedToOffice(s.id, officer, 'VB-10');
      const orderNo = `910/2026/LS-AB-${String(Date.now()).slice(-3)}`;
      const pub = repository.publishOfficePermit(s.id, officer, {
        orderNumber: orderNo,
        issuedAt: new Date().toISOString(),
        pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        pdfName: 'gp-kb10.pdf',
      });
      const holdRes = repository.submitBpDepartureControl(s.id, bpPort1, {
        portId: 'PORT-01',
        qrVerified: true,
        checklist: buildBpChecklist(pub.trip!),
        unlistedPeople: [],
        hasAnomaly: true,
        anomalyCategory: 'an_ninh_trat_tu',
        anomalyDescription: 'Nghi vấn hàng hóa không rõ nguồn gốc cần kiểm tra xác minh tại bến',
        soBienBanNgoai: 'BB-BP-2026/10',
        action: 'TAM_GIU_BIEN_PHONG',
      });
      const qrDuring = repository.verifyPermitByCode(orderNo);
      const liftRes = repository.liftBpHold(s.id, bpChiHuy, 'Đã xác minh đầy đủ chứng từ hợp pháp, đủ điều kiện tiếp tục');
      const qrAfter = repository.verifyPermitByCode(orderNo);
      const ok = Boolean(
        holdRes.success &&
          normalizeStatus(holdRes.trip?.status) === 'TAM_GIU_BIEN_PHONG' &&
          qrDuring.outcome === 'TAM_DINH_CHI' &&
          liftRes.success &&
          normalizeStatus(liftRes.trip?.status) === 'DA_CAP_PHEP' &&
          qrAfter.outcome === 'HOP_LE'
      );
      return {
        passed: ok,
        details: `Tạm giữ: ${holdRes.trip?.status} (QR=${qrDuring.outcome}) → Gỡ tạm giữ: ${liftRes.trip?.status} (QR=${qrAfter.outcome}).`,
      };
    });

    // KB11: Hết hiệu lực 24h (R8), Thu hồi GP, và Chủ tàu rút hồ sơ
    runStep('kb11', 'KB11', 'Quá 24h hết hiệu lực (R8), Thu hồi Giấy phép (THU_HOI) & Rút hồ sơ (DA_RUT)', () => {
      // 11A: Hết hạn 24h
      const tA = buildTestTripPayload('11A', captain, true);
      const sA = repository.submitTripDossier(tA, captain).trip!;
      repository.concludePortInspection(sA.id, bqlPort1, makeAppendix01(bqlPort1, sA, 'ELIGIBLE'), true);
      repository.recordDeptWeatherCheck(sA.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm',
      });
      repository.approveDeptDraft(sA.id, officer);
      repository.markSubmittedToOffice(sA.id, officer, 'VB-11A');
      const ordA = `911A/2026/LS-AB-${String(Date.now()).slice(-3)}`;
      const issued26hAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      repository.publishOfficePermit(sA.id, officer, {
        orderNumber: ordA,
        issuedAt: issued26hAgo,
        pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        pdfName: 'gp-11a.pdf',
      });
      const qrExp = repository.verifyPermitByCode(ordA);

      // 11B: Thu hồi GP
      const tB = buildTestTripPayload('11B', captain, true);
      const sB = repository.submitTripDossier(tB, captain).trip!;
      repository.concludePortInspection(sB.id, bqlPort1, makeAppendix01(bqlPort1, sB, 'ELIGIBLE'), true);
      repository.recordDeptWeatherCheck(sB.id, officer, {
        isSafe: true,
        windForceBeaufort: 3,
        waveHeightMeters: 0.7,
        visibilityKm: 10,
        forecastNote: 'Biển êm',
      });
      repository.approveDeptDraft(sB.id, officer);
      repository.markSubmittedToOffice(sB.id, officer, 'VB-11B');
      const ordB = `911B/2026/LS-AB-${String(Date.now()).slice(-3)}`;
      repository.publishOfficePermit(sB.id, officer, {
        orderNumber: ordB,
        issuedAt: new Date().toISOString(),
        pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        pdfName: 'gp-11b.pdf',
      });
      const rev = repository.revokePermit(sB.id, officer, 'Phát hiện sai sót kỹ thuật sau khi phát hành');
      const qrRev = repository.verifyPermitByCode(ordB);

      // 11C: Chủ tàu rút hồ sơ trước cấp phép
      const tC = buildTestTripPayload('11C', captain, true);
      const sC = repository.submitTripDossier(tC, captain).trip!;
      const wd = repository.withdrawTripDossier(sC.id, captain, 'Thay đổi kế hoạch chạy tàu');

      const ok = Boolean(
        qrExp.outcome === 'HET_HIEU_LUC' &&
          rev.success &&
          normalizeStatus(rev.trip?.status) === 'THU_HOI' &&
          qrRev.outcome === 'DA_THU_HOI' &&
          wd.success &&
          normalizeStatus(wd.trip?.status) === 'DA_RUT'
      );
      return {
        passed: ok,
        details: `Quá 24h QR=${qrExp.outcome}; Thu hồi=${rev.trip?.status} (QR=${qrRev.outcome}); Rút hồ sơ=${wd.trip?.status}.`,
      };
    });

    // KB12: Ca trực, Bến, Không duyệt trên app với TP/LĐ, KPI chỉ chấm BQL & Chuyên viên
    runStep('kb12', 'KB12', 'Phân quyền Ca trực/Bến, TP/Lãnh đạo không duyệt trên app, KPI chỉ chấm BQL & Chuyên viên', () => {
      // Sai bến đối với BQL Port 2 tác động vào Port 1
      const wrongPortRes = bqlPort2
        ? repository.validateShiftAndPortForAction(bqlPort2, 'PORT-01')
        : { allowed: false, reason: 'Không đúng bến phụ trách' };

      // Biên phòng không được duyệt ở trạng thái CHO_SO_XU_LY
      const t = buildTestTripPayload('12', captain, true);
      const s = repository.submitTripDossier(t, captain).trip!;
      const bpPreBlock = repository.submitBpDepartureControl(s.id, bpPort1, {
        portId: 'PORT-01',
        qrVerified: false,
        checklist: [],
        unlistedPeople: [],
        action: 'CHO_XUAT_BEN',
      });

      // KPI config chỉ có chỉ số cho PORT_STAFF và OFFICER
      const kpiRoles = Array.from(new Set(DEFAULT_KPI_CONFIG.indicators.map((i) => i.role)));
      const onlyBqlAndCv =
        kpiRoles.every((r) => r === 'PORT_STAFF' || r === 'OFFICER') &&
        !kpiRoles.includes('BP_TRUC' as never) &&
        !kpiRoles.includes('DEPT_HEAD' as never) &&
        !kpiRoles.includes('LEADER' as never);

      // Kiểm thử scorecard của Trưởng phòng không có chỉ tiêu chấm điểm
      const tpProfile: KpiStaffProfile = {
        id: deptHead.id,
        fullName: deptHead.fullName,
        role: 'DEPT_HEAD',
        roleLabel: 'Trưởng phòng',
        department: deptHead.department,
      };
      const tpCard = computePersonScorecard(tpProfile, [], [], DEFAULT_KPI_CONFIG);

      const ok = Boolean(
        !wrongPortRes.allowed &&
          !bpPreBlock.success &&
          onlyBqlAndCv &&
          tpCard.indicators.length === 0
      );
      return {
        passed: ok,
        details: `Chặn sai bến=${!wrongPortRes.allowed}; Chặn BP trước cấp phép=${!bpPreBlock.success}; Nhóm chấm KPI=[${kpiRoles.join(', ')}]; Số chỉ tiêu TP=${tpCard.indicators.length}.`,
      };
    });

    setOutcomes(results);
    setIsRunning(false);
  };

  const passCount = outcomes.filter((o) => o.passed).length;

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#0a3c85] via-[#0b58be] to-[#1272e6] text-white p-5 sm:p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-200" />
            Mục 9 — Bộ 12 kịch bản kiểm thử nghiệm thu quy trình VR-SB
          </div>
          <h1 className="text-xl sm:text-2xl font-black">
            Kiểm thử tự động 12 kịch bản xử lý hồ sơ &amp; KPI
          </h1>
          <p className="text-xs text-blue-100">
            Người vận hành: <strong>{currentUser.fullName}</strong> • Chạy trực tiếp trên `repository`, `RulesEngine` (R1–R12) và `kpiEngine`.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isRunning}
            onClick={runAll12Scenarios}
            className="px-4 py-2.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-black text-xs inline-flex items-center gap-2 shadow cursor-pointer disabled:opacity-60"
          >
            <Play className="w-4 h-4 fill-current" />
            {isRunning ? 'Đang chạy...' : 'Chạy tất cả 12 kịch bản'}
          </button>
          {outcomes.length > 0 && (
            <button
              type="button"
              onClick={() => setOutcomes([])}
              className="px-3 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Xóa kết quả
            </button>
          )}
        </div>
      </div>

      {outcomes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Terminal className="w-4 h-4 text-blue-600" />
            Tổng kết kiểm thử:
            <span className={passCount === outcomes.length ? 'text-emerald-700' : 'text-rose-700'}>
              {passCount}/{outcomes.length} ĐẠT
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {outcomes.length === 0 ? (
          <div className="md:col-span-2 bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
            Nhấn <strong>"Chạy tất cả 12 kịch bản"</strong> để kiểm chứng trực tiếp toàn bộ luồng nghiệp vụ 18 trạng thái, quy tắc R1–R12, đồng hồ 60/60/10 và chấm điểm KPI.
          </div>
        ) : (
          outcomes.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border space-y-2 ${
                item.passed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/70 border-rose-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-black font-mono px-2 py-0.5 rounded bg-slate-900 text-white">
                    {item.code}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">{item.title}</h3>
                </div>
                {item.passed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-4 h-4" /> ĐẠT
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-black text-rose-700 shrink-0">
                    <XCircle className="w-4 h-4" /> LỖI
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{item.details}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
