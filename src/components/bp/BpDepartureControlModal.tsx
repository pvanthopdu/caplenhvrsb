/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  BpPersonCheckItem,
  BpStopReasonCode,
  BpUnlistedPerson,
  QrVerifyOutcomeCode,
  TripRecord,
  UserAccount,
} from '../../types';
import { repository } from '../../services/repository';
import {
  BP_STOP_REASON_OPTIONS,
  formatDateTime,
  formatTime,
} from '../../utils/formatters';
import { normalizeStatus } from '../../utils/userPermissions';

interface BpDepartureControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripRecord | null;
  actor: UserAccount;
  onSuccess: (updatedTrip?: TripRecord) => void;
}

interface PermitQrVerificationState {
  scannedCode: string;
  scannedAt: string;
  outcome: QrVerifyOutcomeCode;
  label: string;
  reasonDetail: string;
  hasPermit: boolean;
  matchesVessel: boolean;
  within24h: boolean;
  remainingText: string;
  scannedVesselInfo?: string;
  isFullyValid: boolean;
}

const CORE_ANOMALY_CHIPS: Array<{ value: BpStopReasonCode; label: string }> = [
  { value: 'nghi_buon_lau_gian_lan_thuong_mai', label: 'Nghi buôn lậu' },
  { value: 'hang_cam', label: 'Hàng cấm' },
  { value: 'nguoi_dang_bi_truy_tim_hoac_cam_xuat_canh', label: 'Đối tượng truy nã' },
  { value: 'giay_to_gia', label: 'Giấy tờ giả' },
  { value: 'an_ninh_trat_tu', label: 'Vi phạm an ninh trật tự' },
];

function computeRemaining24hText(trip: TripRecord | undefined): string {
  if (!trip) return 'Không xác định';
  const refIso = trip.orderValidUntil
    ? trip.orderValidUntil
    : trip.issuedAt || trip.sealedAt
    ? new Date(new Date(trip.issuedAt || trip.sealedAt!).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  if (!refIso) return 'Chưa có hạn 24h';
  const diffMs = new Date(refIso).getTime() - Date.now();
  if (isNaN(diffMs)) return 'Không xác định';
  if (diffMs <= 0) return 'Đã quá hạn 24 giờ';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `Còn ${hours}g ${String(mins).padStart(2, '0')}p`;
}

export const BpDepartureControlModal: React.FC<BpDepartureControlModalProps> = ({
  isOpen,
  onClose,
  trip,
  actor,
  onSuccess,
}) => {
  // Nội dung 1: Giấy phép (Quét QR)
  const [permitCodeInput, setPermitCodeInput] = useState('');
  const [permitQrResult, setPermitQrResult] = useState<PermitQrVerificationState | null>(null);

  // Camera QR Scanner (dùng chung cho QR Giấy phép hoặc QR CCCD, không bật đồng thời)
  const [activeCameraMode, setActiveCameraMode] = useState<'NONE' | 'PERMIT_QR' | 'CCCD_QR'>('NONE');
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cameraModeRef = useRef<'NONE' | 'PERMIT_QR' | 'CCCD_QR'>('NONE');
  const readerDomId = 'bp-departure-qr-reader';

  // Nội dung 2: Người trên tàu (Tích có mặt / Quét CCCD / Người ngoài DS / Đổi thuyền viên)
  const [cccdInput, setCccdInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [paxSearch, setPaxSearch] = useState('');
  const [checklist, setChecklist] = useState<BpPersonCheckItem[]>([]);
  const [unlistedPeople, setUnlistedPeople] = useState<BpUnlistedPerson[]>([]);
  const [crewChanged, setCrewChanged] = useState(false);
  const [crewChangeNote, setCrewChangeNote] = useState('');

  // Form thêm người ngoài danh sách (R12)
  const [showUnlistedForm, setShowUnlistedForm] = useState(false);
  const [newUnlistedName, setNewUnlistedName] = useState('');
  const [newUnlistedId, setNewUnlistedId] = useState('');
  const [newUnlistedYear, setNewUnlistedYear] = useState('1990');
  const [newUnlistedType, setNewUnlistedType] = useState<'PASSENGER' | 'CREW'>('PASSENGER');
  const [newUnlistedNote, setNewUnlistedNote] = useState('');

  // Nội dung 3: Kiểm tra bất thường
  const [hasAnomaly, setHasAnomaly] = useState(false);
  const [anomalyCategory, setAnomalyCategory] = useState<BpStopReasonCode>(
    'nghi_buon_lau_gian_lan_thuong_mai'
  );
  const [soBienBanNgoai, setSoBienBanNgoai] = useState('');
  const [anomalyDescription, setAnomalyDescription] = useState('');
  const [anomalyPhotos, setAnomalyPhotos] = useState<string[]>([]);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const loggedAccessRef = useRef<string | null>(null);
  const anomalySectionRef = useRef<HTMLDivElement | null>(null);
  const checklistRef = useRef<BpPersonCheckItem[]>([]);

  useEffect(() => {
    checklistRef.current = checklist;
  }, [checklist]);

  useEffect(() => {
    cameraModeRef.current = activeCameraMode;
  }, [activeCameraMode]);

  const stopCamera = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (inst) {
      try {
        await inst.stop();
      } catch {
        // ignore if already stopped
      }
      try {
        inst.clear();
      } catch {
        // ignore
      }
    }
    setActiveCameraMode('NONE');
  }, []);

  useEffect(() => {
    if (!isOpen || !trip) {
      loggedAccessRef.current = null;
      void stopCamera();
      return;
    }

    const crewItems: BpPersonCheckItem[] = (trip.crewMembers || []).map((c, idx) => ({
      personId: c.crewId || `CREW-${idx}`,
      personType: 'CREW',
      fullName: c.fullName,
      positionTitle: c.positionTitle,
      idNumber: c.certNumber,
      isOnboard: false,
      boarded: false,
      absent: false,
    }));

    const paxItems: BpPersonCheckItem[] = (trip.passengers || []).map((p, idx) => ({
      personId: p.id || `PAX-${idx}`,
      personType: 'PASSENGER',
      fullName: p.fullName,
      idNumber: p.idNumber,
      birthYear: p.birthYear,
      isOnboard: false,
      boarded: false,
      absent: false,
    }));

    setChecklist([...crewItems, ...paxItems]);
    setUnlistedPeople([]);
    setCrewChanged(false);
    setCrewChangeNote('');
    setPermitCodeInput(trip.orderNumber || trip.verificationCode || '');
    setPermitQrResult(null);
    setCameraError('');
    setCccdInput('');
    setScanFeedback(null);
    setPaxSearch('');
    setShowUnlistedForm(false);
    setNewUnlistedName('');
    setNewUnlistedId('');
    setNewUnlistedYear('1990');
    setNewUnlistedType('PASSENGER');
    setNewUnlistedNote('');
    setHasAnomaly(false);
    setAnomalyCategory('nghi_buon_lau_gian_lan_thuong_mai');
    setSoBienBanNgoai('');
    setAnomalyDescription('');
    setAnomalyPhotos([]);
    setError('');
    setSubmitting(false);

    if (
      (actor.role === 'BP_TRUC' || actor.role === 'BP_CHIHUY' || actor.role === 'ADMIN') &&
      loggedAccessRef.current !== trip.id
    ) {
      loggedAccessRef.current = trip.id;
      repository.logPersonalDataAccess({
        hoSoId: trip.id,
        lyDo: 'Biên phòng đối chiếu đầy đủ danh sách thuyền viên/hành khách khi kiểm soát xuất bến',
        actor,
      });
    }

    return () => {
      void stopCamera();
    };
  }, [isOpen, trip?.id, actor, stopCamera]);

  const shiftValidation = useMemo(() => {
    if (!trip) return { allowed: false, reason: '' };
    return repository.validateShiftAndPortForAction(actor, trip.departurePortId);
  }, [actor, trip]);

  const verifyPermitQrCode = useCallback(
    (rawCode: string) => {
      if (!trip) return;
      const trimmed = rawCode.trim();
      if (!trimmed) {
        setError('Vui lòng quét mã QR hoặc nhập số Giấy phép / mã tra cứu.');
        return;
      }
      setError('');
      setPermitCodeInput(trimmed);

      const res = repository.verifyPermitByCode(trimmed);
      const scannedTrip = res.trip;

      const hasPermit =
        Boolean(scannedTrip?.orderNumber) &&
        res.outcome !== 'KHONG_TON_TAI' &&
        res.outcome !== 'DA_THU_HOI';

      const matchesVessel =
        Boolean(scannedTrip) &&
        scannedTrip!.id === trip.id &&
        scannedTrip!.vesselId === trip.vesselId &&
        scannedTrip!.vesselRegNumber === trip.vesselRegNumber;

      const within24h = res.outcome === 'HOP_LE' && res.isValid;

      const isFullyValid = hasPermit && matchesVessel && within24h;

      let reasonDetail = res.reasonDetail;
      if (scannedTrip && !matchesVessel) {
        reasonDetail = `Sai phương tiện / sai chuyến: Mã QR thuộc tàu ${scannedTrip.vesselName} (${scannedTrip.vesselRegNumber} · ${scannedTrip.tripNumber}), không khớp tàu ${trip.vesselName} (${trip.vesselRegNumber}).`;
      } else if (!hasPermit) {
        reasonDetail =
          res.outcome === 'DA_THU_HOI'
            ? `Giấy phép đã bị thu hồi / hủy hiệu lực. ${res.reasonDetail}`
            : `Tàu không có Giấy phép hợp lệ tương ứng với mã "${trimmed}".`;
      } else if (!within24h) {
        reasonDetail = res.reasonDetail;
      }

      setPermitQrResult({
        scannedCode: trimmed,
        scannedAt: new Date().toISOString(),
        outcome: res.outcome,
        label: !matchesVessel && scannedTrip ? 'Sai tàu / Sai chuyến' : res.label,
        reasonDetail,
        hasPermit,
        matchesVessel,
        within24h,
        remainingText: within24h
          ? computeRemaining24hText(scannedTrip)
          : res.outcome === 'HET_HIEU_LUC'
          ? 'Quá hạn 24 giờ'
          : res.outcome === 'TAM_DINH_CHI'
          ? 'Đang Tạm đình chỉ'
          : res.outcome === 'DA_THU_HOI'
          ? 'Đã thu hồi'
          : 'Không hiệu lực',
        scannedVesselInfo: scannedTrip
          ? `${scannedTrip.vesselName} (${scannedTrip.vesselRegNumber})`
          : undefined,
        isFullyValid,
      });
    },
    [trip]
  );

  const matchAndMarkCccd = useCallback((rawInput: string) => {
    const raw = rawInput.trim();
    if (!raw) return;
    // Chuẩn QR CCCD gắn chip Việt Nam: sốCCCD|sốCMND|Họ tên|ddMMyyyy|Giới tính|Địa chỉ|Ngày cấp
    const parts = raw.split('|').map((s) => s.trim());
    const idToken = (parts[0] || '').toLowerCase();
    const nameToken = (parts[2] || raw).toLowerCase();
    const dobToken = parts[3] || '';
    const parsedYear =
      dobToken.length === 8 ? dobToken.slice(4, 8) : dobToken.length === 4 ? dobToken : '';
    const nowIso = new Date().toISOString();

    const currentList = checklistRef.current;
    const matched = currentList.find((item) => {
      const matchId =
        Boolean(item.idNumber) &&
        Boolean(idToken) &&
        item.idNumber!.toLowerCase().includes(idToken);
      const matchName =
        Boolean(nameToken) && item.fullName.toLowerCase().includes(nameToken);
      return matchId || matchName;
    });

    if (matched) {
      setChecklist((prev) =>
        prev.map((item) =>
          item.personId === matched.personId
            ? {
                ...item,
                isOnboard: true,
                boarded: true,
                absent: false,
                checkedAt: nowIso,
                scannedAt: nowIso,
                scanMethod: 'QR_CCCD',
              }
            : item
        )
      );
      setScanFeedback({
        type: 'ok',
        text: `Khớp căn cước: ${matched.fullName} (${matched.idNumber || matched.positionTitle || 'TV'}). Đã tích có mặt lúc ${formatTime(nowIso)}.`,
      });
      setCccdInput('');
    } else {
      setScanFeedback({
        type: 'warn',
        text: `Không tìm thấy "${parts[2] || raw}" (${parts[0] || 'CCCD'}) trong danh sách đã cấp phép. Nếu người này có mặt trên tàu, hãy thêm vào "Người ngoài danh sách" để trả Chủ tàu điều chỉnh.`,
      });
      setShowUnlistedForm(true);
      if (parts[0]) setNewUnlistedId(parts[0]);
      if (parts[2]) setNewUnlistedName(parts[2]);
      if (parsedYear && /^\d{4}$/.test(parsedYear)) setNewUnlistedYear(parsedYear);
    }
  }, []);

  const startCamera = async (mode: 'PERMIT_QR' | 'CCCD_QR') => {
    setCameraError('');
    if (activeCameraMode === mode) {
      await stopCamera();
      return;
    }
    await stopCamera();
    setActiveCameraMode(mode);

    window.setTimeout(async () => {
      try {
        const el = document.getElementById(readerDomId);
        if (!el) return;
        const qr = new Html5Qrcode(readerDomId);
        scannerRef.current = qr;
        await qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 230, height: 230 } },
          (decodedText) => {
            if (cameraModeRef.current === 'PERMIT_QR') {
              verifyPermitQrCode(decodedText);
              void stopCamera();
            } else if (cameraModeRef.current === 'CCCD_QR') {
              matchAndMarkCccd(decodedText);
              void stopCamera();
            }
          },
          () => {
            // ignore frame decode miss
          }
        );
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `Không thể bật camera (${err.message}). Cán bộ có thể nhập/dán mã trực tiếp bên dưới.`
            : 'Không thể bật camera thiết bị. Vui lòng nhập mã trực tiếp.'
        );
        await stopCamera();
      }
    }, 120);
  };

  const filteredChecklist = useMemo(() => {
    const q = paxSearch.trim().toLowerCase();
    if (!q) return checklist;
    return checklist.filter((item) =>
      `${item.fullName} ${item.idNumber || ''} ${item.positionTitle || ''}`.toLowerCase().includes(q)
    );
  }, [checklist, paxSearch]);

  if (!isOpen || !trip) return null;

  const vessel = repository.getVesselById(trip.vesselId);
  const crewList = checklist.filter((c) => c.personType === 'CREW');
  const paxList = checklist.filter((c) => c.personType === 'PASSENGER');
  const onboardCrew = crewList.filter((c) => c.isOnboard).length;
  const onboardPax = paxList.filter((c) => c.isOnboard).length;
  const explicitlyAbsentCount = checklist.filter((c) => c.absent).length;
  const totalListed = checklist.length;
  const totalListedOnboard = onboardCrew + onboardPax;
  const totalOnboard = totalListedOnboard + unlistedPeople.length;
  const effectiveAbsentCount = Math.max(explicitlyAbsentCount, totalListed - totalListedOnboard);
  const maxAllowed = (vessel?.maxPassengers || trip.passengerCount) + (trip.crewMembers?.length || 0);

  // Điều kiện của 3 nội dung kiểm tra:
  // 1. Giấy phép: đã quét QR, có GP, đúng tàu, còn hiệu lực 24h
  const permitCheckPassed = Boolean(permitQrResult?.isFullyValid);
  const permitCheckFailed = Boolean(permitQrResult && !permitQrResult.isFullyValid);

  // 2. Người trên tàu: không có người ngoài DS, không đổi thuyền viên, không vượt sức chở, và đã điểm danh >= 1 người
  const hasUnlistedOrCrewSwap =
    unlistedPeople.length > 0 ||
    crewChanged ||
    totalOnboard > totalListed ||
    totalOnboard > maxAllowed;
  const peopleCheckPassed =
    !hasUnlistedOrCrewSwap && (totalListed === 0 || totalOnboard > 0);

  // 3. Bất thường: không có bất thường
  const anomalyCheckPassed = !hasAnomaly;

  const allThreePassed = permitCheckPassed && peopleCheckPassed && anomalyCheckPassed;

  const setItemState = (personId: string, state: 'ONBOARD' | 'ABSENT' | 'RESET') => {
    const nowIso = new Date().toISOString();
    setChecklist((prev) =>
      prev.map((item) => {
        if (item.personId !== personId) return item;
        if (state === 'ONBOARD') {
          return {
            ...item,
            isOnboard: true,
            boarded: true,
            absent: false,
            checkedAt: nowIso,
            scanMethod: 'MANUAL',
          };
        }
        if (state === 'ABSENT') {
          return {
            ...item,
            isOnboard: false,
            boarded: false,
            absent: true,
            checkedAt: nowIso,
            scanMethod: 'MANUAL',
          };
        }
        return {
          ...item,
          isOnboard: false,
          boarded: false,
          absent: false,
          checkedAt: undefined,
          scanMethod: undefined,
        };
      })
    );
  };

  const handleMarkAllOnboard = () => {
    const nowIso = new Date().toISOString();
    setChecklist((prev) =>
      prev.map((item) => ({
        ...item,
        isOnboard: true,
        boarded: true,
        absent: false,
        checkedAt: nowIso,
        scanMethod: 'MANUAL',
      }))
    );
    setScanFeedback({
      type: 'ok',
      text: `Đã tích có mặt đủ ${checklist.length} thuyền viên & hành khách theo danh sách.`,
    });
  };

  const handleFlagCrewSwap = (crewItem: BpPersonCheckItem) => {
    setCrewChanged(true);
    const label = `${crewItem.positionTitle || 'Thuyền viên'} ${crewItem.fullName}`;
    setCrewChangeNote((prev) => {
      if (!prev.trim()) return `Đổi ${label}`;
      if (prev.includes(crewItem.fullName)) return prev;
      return `${prev}; Đổi ${label}`;
    });
    setItemState(crewItem.personId, 'ABSENT');
    setScanFeedback({
      type: 'warn',
      text: `Đã ghi nhận đổi thuyền viên (${label}) — Cần trả Chủ tàu điều chỉnh hồ sơ.`,
    });
  };

  const handleCccdFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    matchAndMarkCccd(cccdInput);
  };

  const handleAddUnlistedPerson = () => {
    if (!newUnlistedName.trim() || !newUnlistedId.trim()) {
      setError('Vui lòng nhập đầy đủ Họ tên và Số CCCD/Hộ chiếu của người ngoài danh sách.');
      return;
    }
    setError('');
    setUnlistedPeople((prev) => [
      ...prev,
      {
        fullName: newUnlistedName.trim(),
        idNumber: newUnlistedId.trim(),
        birthYear: Number(newUnlistedYear) || undefined,
        personType: newUnlistedType,
        note: newUnlistedNote.trim() || 'Phát hiện qua kiểm soát thực tế tại bến',
      },
    ]);
    if (newUnlistedType === 'CREW') {
      setCrewChanged(true);
    }
    setNewUnlistedName('');
    setNewUnlistedId('');
    setNewUnlistedNote('');
    setShowUnlistedForm(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const slots = Math.max(0, 3 - anomalyPhotos.length);
    files.slice(0, slots).forEach((file) => {
      if (file.size > 4 * 1024 * 1024) {
        setError('Mỗi ảnh biên bản/hiện trường tối đa 4 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAnomalyPhotos((prev) => [...prev.slice(0, 2), reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const executeDecision = (action: 'CHO_XUAT_BEN' | 'TRA_CHU_TAU_R12' | 'TAM_GIU_BIEN_PHONG') => {
    setError('');
    if (!shiftValidation.allowed) {
      setError(shiftValidation.reason || 'Bạn không có quyền thao tác ở ca trực/bến này.');
      return;
    }

    if (action === 'CHO_XUAT_BEN') {
      if (!permitCheckPassed) {
        setError(
          'Nội dung 1 (Giấy phép) chưa đạt: phải quét mã QR xác thực có Giấy phép, đúng tàu và còn hiệu lực 24 giờ. Nếu không hợp lệ thì không cho xuất bến, chủ tàu phải làm lại thủ tục.'
        );
        return;
      }
      if (hasUnlistedOrCrewSwap) {
        setError(
          'Nội dung 2 (Người trên tàu) phát hiện người ngoài danh sách hoặc đổi thuyền viên — phải bấm "Trả Chủ tàu điều chỉnh".'
        );
        return;
      }
      if (totalListed > 0 && totalOnboard <= 0) {
        setError(
          'Vui lòng tích có mặt từng người / quét căn cước (hoặc bấm "Đánh dấu đủ tất cả") để ghi nhận số người thực tế trước khi cho xuất bến.'
        );
        return;
      }
      if (hasAnomaly) {
        setError(
          'Nội dung 3 (Bất thường) đang có dấu hiệu vi phạm — không thể cho xuất bến, hãy chọn "Tạm giữ".'
        );
        return;
      }
    }

    if (action === 'TAM_GIU_BIEN_PHONG' && anomalyDescription.trim().length < 5) {
      setHasAnomaly(true);
      setError('Vui lòng chọn loại bất thường và nhập mô tả chi tiết (≥ 5 ký tự) rồi bấm lại "Tạm giữ".');
      anomalySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Tự động đánh dấu vắng mặt những người chưa tích có mặt khi bấm CHO_XUAT_BEN để dữ liệu TKCN rõ ràng
    const finalizedChecklist =
      action === 'CHO_XUAT_BEN'
        ? checklist.map((item) =>
            item.isOnboard
              ? item
              : {
                  ...item,
                  isOnboard: false,
                  boarded: false,
                  absent: true,
                }
          )
        : checklist;

    setSubmitting(true);
    const res = repository.submitBpDepartureControl(trip.id, actor, {
      qrVerified: permitCheckPassed,
      scannedQrCode: permitQrResult?.scannedCode || permitCodeInput.trim() || undefined,
      permitQrChecks: permitQrResult
        ? {
            hasPermit: permitQrResult.hasPermit,
            matchesVessel: permitQrResult.matchesVessel,
            within24h: permitQrResult.within24h,
            outcome: permitQrResult.outcome,
          }
        : undefined,
      permitStatusAtCheck: normalizeStatus(trip.status),
      scheduledTotalPeople: totalListed,
      actualTotalPeople: totalOnboard,
      actualCrewCount: onboardCrew,
      actualPassengerCount: onboardPax,
      absentCount: effectiveAbsentCount,
      crewChanged,
      crewChangeNote: crewChangeNote.trim() || undefined,
      checklist: finalizedChecklist,
      unlistedPeople,
      hasAnomaly: action === 'TAM_GIU_BIEN_PHONG' ? true : hasAnomaly,
      anomalyCategory: action === 'TAM_GIU_BIEN_PHONG' || hasAnomaly ? anomalyCategory : undefined,
      anomalyDescription:
        action === 'TAM_GIU_BIEN_PHONG' || hasAnomaly ? anomalyDescription.trim() : undefined,
      soBienBanNgoai: soBienBanNgoai.trim() || undefined,
      anomalyPhotos,
      action,
    });
    setSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Không thể lưu kết quả kiểm soát xuất bến.');
      return;
    }
    void stopCamera();
    onSuccess(res.trip);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/75 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-[#07244d] text-white shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-sky-300 font-bold">
              Cán bộ trực Biên phòng · Kiểm soát xuất bến (3 nội dung bắt buộc)
            </p>
            <h3 className="text-sm sm:text-base font-extrabold truncate">
              {trip.vesselName} ({trip.vesselRegNumber}) · {trip.departurePortName} → {trip.arrivalPortName}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              void stopCamera();
              onClose();
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 cursor-pointer shrink-0"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Content Readiness Bar */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-[11px] sm:text-xs shrink-0 divide-x divide-slate-200">
          <div className="px-3 py-2 flex items-center gap-2">
            {permitCheckPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : permitCheckFailed ? (
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <QrCode className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">1. Giấy phép</p>
              <p
                className={`truncate font-medium ${
                  permitCheckPassed
                    ? 'text-emerald-700'
                    : permitCheckFailed
                    ? 'text-red-700'
                    : 'text-slate-500'
                }`}
              >
                {permitCheckPassed
                  ? 'Hợp lệ · Còn 24h'
                  : permitCheckFailed
                  ? 'Không hợp lệ'
                  : 'Chưa quét QR'}
              </p>
            </div>
          </div>

          <div className="px-3 py-2 flex items-center gap-2">
            {hasUnlistedOrCrewSwap ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : peopleCheckPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">2. Người trên tàu</p>
              <p
                className={`truncate font-medium font-mono tabular-nums ${
                  hasUnlistedOrCrewSwap
                    ? 'text-amber-700'
                    : peopleCheckPassed
                    ? 'text-emerald-700'
                    : 'text-slate-500'
                }`}
              >
                {hasUnlistedOrCrewSwap
                  ? 'Cần trả Chủ tàu'
                  : peopleCheckPassed
                  ? `Thực tế ${totalOnboard}/${totalListed}`
                  : 'Chưa điểm danh'}
              </p>
            </div>
          </div>

          <div className="px-3 py-2 flex items-center gap-2">
            {hasAnomaly ? (
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">3. Bất thường</p>
              <p
                className={`truncate font-medium ${
                  hasAnomaly ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {hasAnomaly ? 'Phát hiện — Tạm giữ' : 'Không phát hiện'}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs sm:text-sm">
          {!shiftValidation.allowed && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
              <span>{shiftValidation.reason}</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-red-900 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
              <span>{error}</span>
            </div>
          )}

          {/* Shared Camera QR Viewport (only shown when camera is active) */}
          {activeCameraMode !== 'NONE' && (
            <div className="rounded-xl border border-sky-300 bg-slate-900 p-3 space-y-2">
              <div className="flex items-center justify-between text-white text-xs">
                <span className="font-bold flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-sky-400" />
                  {activeCameraMode === 'PERMIT_QR'
                    ? 'Đang quét mã QR Giấy phép rời cảng...'
                    : 'Đang quét mã QR trên Căn cước công dân (CCCD)...'}
                </span>
                <button
                  type="button"
                  onClick={() => void stopCamera()}
                  className="px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 text-white font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <CameraOff className="w-3.5 h-3.5" />
                  Tắt camera
                </button>
              </div>
              <div
                id={readerDomId}
                className="w-full max-w-sm mx-auto rounded-lg overflow-hidden bg-black min-h-[220px]"
              />
            </div>
          )}

          {cameraError && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-950">
              {cameraError}
            </div>
          )}

          {/* ============================================================== */}
          {/* NỘI DUNG 1: GIẤY PHÉP (QUÉT MÃ QR)                             */}
          {/* ============================================================== */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <span className="w-5 h-5 rounded bg-[#07244d] text-white text-[11px] font-mono flex items-center justify-center shrink-0">
                  1
                </span>
                <span>Giấy phép rời cảng — Quét mã QR xác thực</span>
              </div>
              {permitQrResult ? (
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                    permitQrResult.isFullyValid
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-red-50 text-red-800 border-red-300'
                  }`}
                >
                  {permitQrResult.isFullyValid ? '✓ Hợp lệ' : `✕ ${permitQrResult.label}`}
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-500">Chờ quét mã QR</span>
              )}
            </div>

            <div className="p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={permitCodeInput}
                  onChange={(e) => setPermitCodeInput(e.target.value)}
                  placeholder="Nhập hoặc quét mã QR Giấy phép (VD: 0123/2026/LS-AB)..."
                  className="flex-1 min-h-[44px] px-3 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono focus:border-sky-600 focus:outline-none"
                />
                <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void startCamera('PERMIT_QR')}
                    className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border ${
                      activeCameraMode === 'PERMIT_QR'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>{activeCameraMode === 'PERMIT_QR' ? 'Đang quét' : 'Quét QR GP'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => verifyPermitQrCode(permitCodeInput)}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[#07244d] hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Kiểm tra mã</span>
                  </button>
                </div>
              </div>

              {trip.orderNumber && !permitQrResult && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                  <span className="text-slate-600">
                    Số GP của hồ sơ: <strong className="font-mono text-slate-900">{trip.orderNumber}</strong> · Hạn 24h:{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {formatDateTime(trip.orderValidUntil)}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => verifyPermitQrCode(trip.orderNumber || trip.tripNumber)}
                    className="min-h-[34px] px-3 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer"
                  >
                    Xác thực nhanh GP chuyến này
                  </button>
                </div>
              )}

              {/* 3-Point Verification Breakdown */}
              {permitQrResult && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div
                      className={`rounded-lg border p-2.5 ${
                        permitQrResult.hasPermit
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-red-50 border-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {permitQrResult.hasPermit ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                        )}
                        <span className={permitQrResult.hasPermit ? 'text-emerald-900' : 'text-red-900'}>
                          Có Giấy phép
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-700 mt-1 truncate">
                        {permitQrResult.hasPermit ? permitQrResult.scannedCode : 'Không có / đã thu hồi'}
                      </p>
                    </div>

                    <div
                      className={`rounded-lg border p-2.5 ${
                        permitQrResult.matchesVessel
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-red-50 border-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {permitQrResult.matchesVessel ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                        )}
                        <span className={permitQrResult.matchesVessel ? 'text-emerald-900' : 'text-red-900'}>
                          Đúng tàu ({trip.vesselRegNumber})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 mt-1 truncate">
                        {permitQrResult.matchesVessel
                          ? `${trip.vesselName} · Khớp chính xác`
                          : permitQrResult.scannedVesselInfo
                          ? `QR thuộc: ${permitQrResult.scannedVesselInfo}`
                          : 'Không khớp phương tiện'}
                      </p>
                    </div>

                    <div
                      className={`rounded-lg border p-2.5 ${
                        permitQrResult.within24h
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-red-50 border-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {permitQrResult.within24h ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                        )}
                        <span className={permitQrResult.within24h ? 'text-emerald-900' : 'text-red-900'}>
                          Hiệu lực 24 giờ
                        </span>
                      </div>
                      <p className="font-mono tabular-nums text-[11px] text-slate-700 mt-1">
                        {permitQrResult.remainingText}
                      </p>
                    </div>
                  </div>

                  {!permitQrResult.isFullyValid && (
                    <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-xs text-red-950 flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold">
                          GIẤY PHÉP KHÔNG HỢP LỆ — KHÔNG CHO XUẤT BẾN
                        </p>
                        <p className="mt-0.5">{permitQrResult.reasonDetail}</p>
                        <p className="mt-1 font-semibold text-red-800">
                          Yêu cầu: Chủ tàu phải làm lại thủ tục đề nghị cấp Giấy phép rời cảng.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ============================================================== */}
          {/* NỘI DUNG 2: NGƯỜI TRÊN TÀU (ĐIỂM DANH / QUÉT CCCD)             */}
          {/* ============================================================== */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <span className="w-5 h-5 rounded bg-[#07244d] text-white text-[11px] font-mono flex items-center justify-center shrink-0">
                  2
                </span>
                <span>Người trên tàu — Tích có mặt từng người hoặc quét căn cước</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMarkAllOnboard}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold cursor-pointer"
                >
                  Đủ tất cả ({totalListed})
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnlistedForm((v) => !v)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Người ngoài DS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCrewChanged((v) => !v)}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    crewChanged
                      ? 'bg-rose-600 text-white border-rose-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-rose-50 hover:text-rose-800'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{crewChanged ? 'Đã báo đổi TV' : 'Đổi thuyền viên'}</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 space-y-3">
              {/* Quét QR CCCD / Nhập số CCCD */}
              <form onSubmit={handleCccdFormSubmit} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={cccdInput}
                  onChange={(e) => setCccdInput(e.target.value)}
                  placeholder="Quét QR căn cước hoặc nhập số CCCD / Họ tên để tích có mặt..."
                  className="flex-1 min-h-[44px] px-3 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono focus:border-sky-600 focus:outline-none"
                />
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void startCamera('CCCD_QR')}
                    className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border ${
                      activeCameraMode === 'CCCD_QR'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Quét CCCD</span>
                  </button>
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Đối chiếu
                  </button>
                </div>
              </form>

              {scanFeedback && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    scanFeedback.type === 'ok'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : 'border-amber-300 bg-amber-50 text-amber-950'
                  }`}
                >
                  {scanFeedback.text}
                </div>
              )}

              {/* Ghi chú Đổi thuyền viên */}
              {crewChanged && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-extrabold text-rose-900">
                      Ghi nhận ĐỔI THUYỀN VIÊN so với danh sách đã cấp phép
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCrewChanged(false);
                        setCrewChangeNote('');
                      }}
                      className="text-rose-700 hover:underline font-semibold cursor-pointer"
                    >
                      Bỏ đánh dấu
                    </button>
                  </div>
                  <input
                    type="text"
                    value={crewChangeNote}
                    onChange={(e) => setCrewChangeNote(e.target.value)}
                    placeholder="Ghi rõ chức danh / tên thuyền viên thay đổi (VD: Đổi Máy trưởng Nguyễn Văn A bằng Trần Văn B)..."
                    className="w-full min-h-[40px] px-2.5 rounded-lg border border-rose-300 bg-white text-slate-900"
                  />
                </div>
              )}

              {/* Form thêm người ngoài danh sách */}
              {showUnlistedForm && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2.5 text-xs">
                  <p className="font-bold text-amber-950">
                    Ghi nhận người ngoài danh sách đã cấp phép
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newUnlistedName}
                      onChange={(e) => setNewUnlistedName(e.target.value)}
                      placeholder="Họ và tên (*)"
                      className="min-h-[40px] px-2.5 rounded border border-amber-300 bg-white"
                    />
                    <input
                      type="text"
                      value={newUnlistedId}
                      onChange={(e) => setNewUnlistedId(e.target.value)}
                      placeholder="Số CCCD / Hộ chiếu (*)"
                      className="min-h-[40px] px-2.5 rounded border border-amber-300 bg-white font-mono"
                    />
                    <input
                      type="number"
                      value={newUnlistedYear}
                      onChange={(e) => setNewUnlistedYear(e.target.value)}
                      placeholder="Năm sinh"
                      className="min-h-[40px] px-2.5 rounded border border-amber-300 bg-white font-mono"
                    />
                    <select
                      value={newUnlistedType}
                      onChange={(e) => setNewUnlistedType(e.target.value as 'PASSENGER' | 'CREW')}
                      className="min-h-[40px] px-2.5 rounded border border-amber-300 bg-white"
                    >
                      <option value="PASSENGER">Hành khách ngoài danh sách</option>
                      <option value="CREW">Thuyền viên đổi / ngoài danh sách</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={newUnlistedNote}
                    onChange={(e) => setNewUnlistedNote(e.target.value)}
                    placeholder="Ghi chú tại bến..."
                    className="w-full min-h-[40px] px-2.5 rounded border border-amber-300 bg-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUnlistedForm(false)}
                      className="min-h-[36px] px-3 rounded border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleAddUnlistedPerson}
                      className="min-h-[36px] px-3 rounded bg-amber-700 hover:bg-amber-800 text-white font-bold cursor-pointer"
                    >
                      Thêm người ngoài DS
                    </button>
                  </div>
                </div>
              )}

              {unlistedPeople.length > 0 && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 space-y-1.5 text-xs">
                  <p className="font-extrabold text-rose-900">
                    Phát hiện {unlistedPeople.length} người ngoài danh sách khai báo:
                  </p>
                  {unlistedPeople.map((u, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded border border-rose-200"
                    >
                      <span>
                        <strong>{u.fullName}</strong> (<span className="font-mono">{u.idNumber}</span>) ·{' '}
                        {u.personType === 'CREW' ? 'Thuyền viên' : 'Hành khách'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setUnlistedPeople((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-rose-700 hover:underline font-bold cursor-pointer"
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Live Headcount Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <p className="text-slate-500">Thuyền viên có mặt</p>
                  <p className="font-bold font-mono tabular-nums text-slate-900 text-base">
                    {onboardCrew}/{crewList.length}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <p className="text-slate-500">Hành khách có mặt</p>
                  <p className="font-bold font-mono tabular-nums text-slate-900 text-base">
                    {onboardPax}/{paxList.length}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <p className="text-slate-500">Vắng mặt</p>
                  <p className="font-bold font-mono tabular-nums text-amber-800 text-base">
                    {effectiveAbsentCount}
                  </p>
                </div>
                <div
                  className={`rounded-lg border p-2 ${
                    hasUnlistedOrCrewSwap
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : totalOnboard > 0
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-sky-50 border-sky-200 text-sky-900'
                  }`}
                >
                  <p>Thực tế trên tàu</p>
                  <p className="font-bold font-mono tabular-nums text-base">
                    {totalOnboard}/{totalListed}
                  </p>
                </div>
              </div>

              {/* Outcome Guidance Callout for Step 2 */}
              {hasUnlistedOrCrewSwap ? (
                <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    Có người ngoài danh sách hoặc đổi thuyền viên — Không cho xuất bến!
                  </p>
                  <p>
                    Bấm <strong>“Trả Chủ tàu điều chỉnh”</strong> bên dưới. Quy trình xử lý lại:
                    <strong> Chủ tàu điều chỉnh → Ban Quản lý cảng kiểm tra lại (sức chở, áo phao) → Sở cấp lại Giấy phép → Biên phòng kiểm soát lại.</strong>
                  </p>
                </div>
              ) : totalOnboard > 0 && effectiveAbsentCount > 0 ? (
                <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-950 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                  <span>
                    Chỉ có <strong className="font-mono">{effectiveAbsentCount}</strong> người vắng mặt — Hệ thống ghi nhận số người thực tế{' '}
                    <strong className="font-mono">{totalOnboard}</strong> người ({onboardCrew} TV, {onboardPax} HK) và{' '}
                    <strong>vẫn cho xuất bến</strong>.
                  </span>
                </div>
              ) : totalOnboard === 0 && totalListed > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Tích <strong>Có mặt</strong> / <strong>Vắng mặt</strong> từng người, quét mã QR CCCD hoặc bấm{' '}
                  <strong>Đủ tất cả</strong> để ghi nhận số người thực tế lên tàu (phục vụ tìm kiếm cứu nạn).
                </div>
              ) : null}

              {/* Search & Checklist */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={paxSearch}
                  onChange={(e) => setPaxSearch(e.target.value)}
                  placeholder="Tìm nhanh theo họ tên, CCCD/chứng chỉ, chức danh..."
                  className="w-full min-h-[40px] pl-9 pr-3 rounded-lg border border-slate-300 text-xs focus:border-sky-600 focus:outline-none"
                />
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200">
                {filteredChecklist.map((item, idx) => (
                  <div
                    key={item.personId}
                    className={`p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                      item.isOnboard
                        ? 'bg-emerald-50/60'
                        : item.absent
                        ? 'bg-amber-50/60'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-slate-50/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-slate-400 tabular-nums">{idx + 1}.</span>
                        <span className="font-bold text-slate-900">{item.fullName}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.personType === 'CREW'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.personType === 'CREW' ? item.positionTitle || 'Thuyền viên' : 'Hành khách'}
                        </span>
                        {item.scanMethod === 'QR_CCCD' && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            QR CCCD
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-slate-600 mt-0.5">
                        {item.personType === 'CREW' ? 'Chứng chỉ:' : 'CCCD/HC:'}{' '}
                        <strong>{item.idNumber || '---'}</strong>
                        {item.birthYear ? ` · Năm sinh: ${item.birthYear}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setItemState(item.personId, item.isOnboard ? 'RESET' : 'ONBOARD')}
                        className={`min-h-[36px] px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                          item.isOnboard
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                        }`}
                      >
                        {item.isOnboard ? '✓ Có mặt' : 'Có mặt'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemState(item.personId, item.absent ? 'RESET' : 'ABSENT')}
                        className={`min-h-[36px] px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                          item.absent
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50'
                        }`}
                      >
                        Vắng mặt
                      </button>
                      {item.personType === 'CREW' && (
                        <button
                          type="button"
                          onClick={() => handleFlagCrewSwap(item)}
                          title="Đánh dấu thuyền viên này bị đổi người -> Trả Chủ tàu điều chỉnh"
                          className="min-h-[36px] px-2 py-1 rounded-lg font-bold border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 cursor-pointer"
                        >
                          Đổi TV
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredChecklist.length === 0 && (
                  <p className="p-4 text-center text-xs text-slate-500">
                    Không có dữ liệu người trong danh sách hoặc không khớp từ khóa.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ============================================================== */}
          {/* NỘI DUNG 3: BẤT THƯỜNG (TẠM GIỮ -> QR TỰ CHUYỂN TẠM ĐÌNH CHỈ) */}
          {/* ============================================================== */}
          <section
            ref={anomalySectionRef}
            className={`rounded-xl border overflow-hidden ${
              hasAnomaly ? 'border-red-400 bg-red-50/40' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                <span className="w-5 h-5 rounded bg-[#07244d] text-white text-[11px] font-mono flex items-center justify-center shrink-0">
                  3
                </span>
                <input
                  type="checkbox"
                  checked={hasAnomaly}
                  onChange={(e) => setHasAnomaly(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-red-700"
                />
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className={`w-4 h-4 ${hasAnomaly ? 'text-red-700' : 'text-slate-500'}`} />
                  Bất thường (nghi buôn lậu, hàng cấm, đối tượng truy nã, giấy tờ giả, vi phạm ANTT)
                </span>
              </label>
            </div>

            {hasAnomaly ? (
              <div className="p-3.5 space-y-3 text-xs">
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-950">
                  Khi bấm <strong>Tạm giữ</strong>, Giấy phép tự động chuyển sang trạng thái{' '}
                  <strong>“Tạm đình chỉ”</strong> khi quét mã QR để Biên phòng xử lý theo nghiệp vụ. Nếu không gỡ được, Chuyên viên Sở Xây dựng sẽ{' '}
                  <strong>thu hồi Giấy phép</strong>.
                </div>

                {/* 5 loại bất thường chính */}
                <div>
                  <p className="font-semibold text-slate-700 mb-1.5">Chọn nhanh loại bất thường:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CORE_ANOMALY_CHIPS.map((chip) => {
                      const active = anomalyCategory === chip.value;
                      return (
                        <button
                          key={chip.value}
                          type="button"
                          onClick={() => setAnomalyCategory(chip.value)}
                          className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer ${
                            active
                              ? 'bg-red-700 text-white border-red-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-red-50 hover:text-red-800'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nhóm lý do chi tiết
                    </label>
                    <select
                      value={anomalyCategory}
                      onChange={(e) => setAnomalyCategory(e.target.value as BpStopReasonCode)}
                      className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 bg-white"
                    >
                      {BP_STOP_REASON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Số biên bản hiện trường (nếu có)
                    </label>
                    <input
                      type="text"
                      value={soBienBanNgoai}
                      onChange={(e) => setSoBienBanNgoai(e.target.value)}
                      placeholder="VD: BB-BP-042/2026"
                      className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mô tả chi tiết bất thường (*)
                  </label>
                  <textarea
                    rows={3}
                    value={anomalyDescription}
                    onChange={(e) => setAnomalyDescription(e.target.value)}
                    placeholder="Ghi rõ hàng hóa nghi buôn lậu/hàng cấm, đối tượng truy nã, giấy tờ giả hoặc hành vi vi phạm ANTT..."
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {anomalyPhotos.map((src, idx) => (
                    <div
                      key={idx}
                      className="relative w-16 h-16 rounded border border-slate-300 overflow-hidden"
                    >
                      <img src={src} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setAnomalyPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {anomalyPhotos.length < 3 && (
                    <label className="min-h-[40px] px-3 py-1.5 rounded-lg border border-dashed border-slate-400 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5">
                      <Camera className="w-4 h-4" />
                      <span>Đính kèm ảnh hiện trường (tối đa 3)</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={handlePhotoUpload}
                      />
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-3.5 py-2.5 text-xs text-slate-600">
                Không phát hiện dấu hiệu bất thường. Tích vào ô trên nếu phát hiện nghi buôn lậu, hàng cấm, đối tượng truy nã, giấy tờ giả hoặc vi phạm ANTT để lập <strong>Tạm giữ</strong>.
              </div>
            )}
          </section>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              void stopCamera();
              onClose();
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
          >
            Đóng
          </button>

          <div className="flex flex-col sm:flex-row gap-2">
            {hasUnlistedOrCrewSwap && (
              <button
                type="button"
                disabled={submitting || !shiftValidation.allowed}
                onClick={() => executeDecision('TRA_CHU_TAU_R12')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                Trả Chủ tàu điều chỉnh
              </button>
            )}

            <button
              type="button"
              disabled={submitting || !shiftValidation.allowed}
              onClick={() => {
                if (!hasAnomaly) {
                  setHasAnomaly(true);
                  setError(
                    'Vui lòng chọn loại bất thường và nhập mô tả chi tiết rồi bấm lại "Tạm giữ".'
                  );
                  window.setTimeout(() => {
                    anomalySectionRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    });
                  }, 60);
                  return;
                }
                executeDecision('TAM_GIU_BIEN_PHONG');
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Tạm giữ (QR → Tạm đình chỉ)</span>
            </button>

            <button
              type="button"
              disabled={submitting || !shiftValidation.allowed || !allThreePassed}
              onClick={() => executeDecision('CHO_XUAT_BEN')}
              title={
                !allThreePassed
                  ? 'Cần đạt đủ cả 3 nội dung: 1. Quét QR Giấy phép hợp lệ · 2. Điểm danh người trên tàu (không người ngoài DS/đổi TV) · 3. Không có bất thường'
                  : 'Ghi nhận giờ xuất bến và số người thực tế phục vụ tìm kiếm cứu nạn'
              }
              className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="font-mono tabular-nums">
                {submitting
                  ? 'Đang xử lý...'
                  : `CHO XUẤT BẾN${totalOnboard > 0 ? ` (${totalOnboard} người)` : ''}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
