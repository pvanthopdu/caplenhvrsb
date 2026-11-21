/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  QrCode,
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

export const BpDepartureControlModal: React.FC<BpDepartureControlModalProps> = ({
  isOpen,
  onClose,
  trip,
  actor,
  onSuccess,
}) => {
  const [qrVerified, setQrVerified] = useState(false);
  const [cccdInput, setCccdInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [paxSearch, setPaxSearch] = useState('');
  const [checklist, setChecklist] = useState<BpPersonCheckItem[]>([]);
  const [unlistedPeople, setUnlistedPeople] = useState<BpUnlistedPerson[]>([]);

  // Form thêm người ngoài danh sách (R12)
  const [showUnlistedForm, setShowUnlistedForm] = useState(false);
  const [newUnlistedName, setNewUnlistedName] = useState('');
  const [newUnlistedId, setNewUnlistedId] = useState('');
  const [newUnlistedYear, setNewUnlistedYear] = useState('1990');
  const [newUnlistedType, setNewUnlistedType] = useState<'PASSENGER' | 'CREW'>('PASSENGER');
  const [newUnlistedNote, setNewUnlistedNote] = useState('');

  // Kiểm tra bất thường an ninh / an toàn
  const [hasAnomaly, setHasAnomaly] = useState(false);
  const [anomalyCategory, setAnomalyCategory] = useState<BpStopReasonCode>('an_ninh_trat_tu');
  const [soBienBanNgoai, setSoBienBanNgoai] = useState('');
  const [anomalyDescription, setAnomalyDescription] = useState('');
  const [anomalyPhotos, setAnomalyPhotos] = useState<string[]>([]);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const loggedAccessRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !trip) {
      loggedAccessRef.current = null;
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
    setQrVerified(true);
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
    setAnomalyCategory('an_ninh_trat_tu');
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
  }, [isOpen, trip?.id, actor]);

  const shiftValidation = useMemo(() => {
    if (!trip) return { allowed: false, reason: '' };
    return repository.validateShiftAndPortForAction(actor, trip.departurePortId);
  }, [actor, trip]);

  const qrVerifyResult = useMemo(() => {
    if (!trip) return null;
    return repository.verifyPermitByCode(trip.orderNumber || trip.tripNumber);
  }, [trip]);

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
  const totalListed = checklist.length;
  const totalOnboard = onboardCrew + onboardPax + unlistedPeople.length;
  const maxAllowed = (vessel?.maxPassengers || trip.passengerCount) + (trip.crewMembers?.length || 0);
  const hasR12Violation = unlistedPeople.length > 0 || totalOnboard > totalListed || totalOnboard > maxAllowed;

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
      text: `Đã đánh dấu đủ ${checklist.length} thuyền viên & hành khách có mặt trên tàu.`,
    });
  };

  const handleCccdScanSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = cccdInput.trim();
    if (!raw) return;
    const parts = raw.split('|').map((s) => s.trim());
    const idToken = (parts[0] || '').toLowerCase();
    const nameToken = (parts[2] || raw).toLowerCase();
    const nowIso = new Date().toISOString();

    let matchedId: string | null = null;
    setChecklist((prev) =>
      prev.map((item) => {
        const matchId = item.idNumber && item.idNumber.toLowerCase().includes(idToken);
        const matchName = item.fullName.toLowerCase().includes(nameToken);
        if (!matchedId && (matchId || matchName)) {
          matchedId = item.personId;
          return {
            ...item,
            isOnboard: true,
            boarded: true,
            absent: false,
            checkedAt: nowIso,
            scannedAt: nowIso,
            scanMethod: 'QR_CCCD',
          };
        }
        return item;
      })
    );

    if (matchedId) {
      const matched = checklist.find((i) => i.personId === matchedId);
      setScanFeedback({
        type: 'ok',
        text: `Khớp QR CCCD: ${matched?.fullName} (${matched?.idNumber || 'TV'}). Đã ghi nhận lên tàu lúc ${formatTime(nowIso)}.`,
      });
      setCccdInput('');
    } else {
      setScanFeedback({
        type: 'warn',
        text: `Không tìm thấy "${raw}" trong danh sách đã cấp phép. Nếu người này đang ở trên tàu, hãy thêm vào "Người ngoài danh sách (R12)".`,
      });
      setShowUnlistedForm(true);
      setNewUnlistedId(parts[0] || '');
      if (parts[2]) setNewUnlistedName(parts[2]);
    }
  };

  const handleAddUnlistedPerson = () => {
    if (!newUnlistedName.trim() || !newUnlistedId.trim()) {
      setError('Vui lòng nhập đầy đủ Họ tên và Số CCCD của người ngoài danh sách.');
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
      if (!qrVerified) {
        setError('Phải xác thực mã QR Giấy phép hợp lệ trước khi cho xuất bến.');
        return;
      }
      if (hasAnomaly) {
        setError('Đang đánh dấu có bất thường an ninh/an toàn — không thể cho xuất bến.');
        return;
      }
      if (hasR12Violation) {
        setError('Phát hiện người ngoài danh sách hoặc vượt số người được phép (R12) — hãy chọn Trả Chủ tàu (R12) hoặc Tạm giữ.');
        return;
      }
    }
    if (action === 'TAM_GIU_BIEN_PHONG' && anomalyDescription.trim().length < 5) {
      setError('Vui lòng nhập mô tả bất thường (≥ 5 ký tự) khi lập Tạm giữ / Đình chỉ xuất bến.');
      return;
    }

    setSubmitting(true);
    const res = repository.submitBpDepartureControl(trip.id, actor, {
      qrVerified,
      permitStatusAtCheck: normalizeStatus(trip.status),
      scheduledTotalPeople: totalListed,
      actualTotalPeople: totalOnboard,
      actualCrewCount: onboardCrew,
      actualPassengerCount: onboardPax,
      checklist,
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
    onSuccess(res.trip);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/75 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-[#07244d] text-white">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-sky-300 font-bold">
              Khâu kiểm soát cuối cùng tại bến (Sau khi có Giấy phép)
            </p>
            <h3 className="text-sm sm:text-base font-extrabold truncate">
              {trip.vesselName} ({trip.vesselRegNumber}) · GP: {trip.orderNumber || trip.tripNumber}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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

          {/* BƯỚC 1: XÁC THỰC QR GIẤY PHÉP */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <QrCode className="w-4 h-4 text-sky-700" />
                <span>1. Xác thực Giấy phép rời cảng & Hiệu lực 24h (R8)</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-extrabold ${
                  qrVerifyResult?.isValid
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}
              >
                {qrVerifyResult?.label || 'Không xác định'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-700">
              <p>
                Số GP: <strong className="font-mono text-slate-900">{trip.orderNumber || '---'}</strong>
              </p>
              <p>
                Hành trình: <strong>{trip.departurePortName} → {trip.arrivalPortName}</strong>
              </p>
              <p>
                Hiệu lực đến:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {formatDateTime(trip.orderValidUntil)}
                </strong>
              </p>
            </div>
            <label className="inline-flex items-center gap-2 pt-1 cursor-pointer text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={qrVerified}
                onChange={(e) => setQrVerified(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-700"
              />
              <span>Đã quét kiểm tra mã QR Giấy phép khớp tàu & người ký</span>
            </label>
          </div>

          {/* BƯỚC 2: ĐIỂM DANH THUYỀN VIÊN & HÀNH KHÁCH + QUÉT QR CCCD */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Users className="w-4 h-4 text-sky-700" />
                <span>2. Điểm danh thực tế trên tàu (Hiển thị đầy đủ theo quyền Biên phòng)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAllOnboard}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold cursor-pointer"
                >
                  Đánh dấu đủ tất cả ({totalListed})
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnlistedForm((v) => !v)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Người ngoài DS (R12)</span>
                </button>
              </div>
            </div>

            {/* Quét QR CCCD mô phỏng */}
            <form onSubmit={handleCccdScanSimulate} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={cccdInput}
                onChange={(e) => setCccdInput(e.target.value)}
                placeholder="Quét/nhập số CCCD hoặc chuỗi QR CCCD (VD: 051092001234)..."
                className="flex-1 min-h-[44px] px-3 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono focus:border-sky-600 focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0"
              >
                Đối chiếu CCCD
              </button>
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

            {/* Form thêm người ngoài danh sách */}
            {showUnlistedForm && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2.5 text-xs">
                <p className="font-bold text-amber-950">
                  Ghi nhận người ngoài danh sách khai báo (kích hoạt R12)
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
                    <option value="PASSENGER">Hành khách ngoài DS</option>
                    <option value="CREW">Thuyền viên đổi/ngoài DS</option>
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
                    Thêm vào biên bản R12
                  </button>
                </div>
              </div>
            )}

            {unlistedPeople.length > 0 && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 space-y-1.5 text-xs">
                <p className="font-extrabold text-rose-900">
                  Cảnh báo R12: Phát hiện {unlistedPeople.length} người ngoài danh sách!
                </p>
                {unlistedPeople.map((u, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded border border-rose-200">
                    <span>
                      <strong>{u.fullName}</strong> ({u.idNumber}) ·{' '}
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

            {/* Counters */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                <p className="text-slate-500">Thuyền viên lên tàu</p>
                <p className="font-bold font-mono tabular-nums text-slate-900 text-base">
                  {onboardCrew}/{crewList.length}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                <p className="text-slate-500">Hành khách lên tàu</p>
                <p className="font-bold font-mono tabular-nums text-slate-900 text-base">
                  {onboardPax}/{paxList.length}
                </p>
              </div>
              <div
                className={`rounded-lg border p-2 ${
                  hasR12Violation
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-sky-50 border-sky-200 text-sky-900'
                }`}
              >
                <p>Tổng thực tế / DS</p>
                <p className="font-bold font-mono tabular-nums text-base">
                  {totalOnboard}/{totalListed}
                </p>
              </div>
            </div>

            {/* Search & Checklist */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={paxSearch}
                onChange={(e) => setPaxSearch(e.target.value)}
                placeholder="Tìm nhanh theo họ tên, CCCD, chức danh..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-lg border border-slate-300 text-xs focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200">
              {filteredChecklist.map((item, idx) => (
                <div
                  key={item.personId}
                  className={`p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                    item.isOnboard
                      ? 'bg-emerald-50/60'
                      : item.absent
                      ? 'bg-amber-50/60'
                      : 'bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-slate-400">{idx + 1}.</span>
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
                      Giấy tờ: <strong>{item.idNumber || '---'}</strong>
                      {item.birthYear ? ` · Năm sinh: ${item.birthYear}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
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

          {/* BƯỚC 3: KIỂM TRA BẤT THƯỜNG AN NINH / AN TOÀN */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
              <input
                type="checkbox"
                checked={hasAnomaly}
                onChange={(e) => setHasAnomaly(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-red-700"
              />
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-700" />
                Phát hiện dấu hiệu bất thường an ninh / trật tự / an toàn (Tạm giữ xuất bến)
              </span>
            </label>

            {hasAnomaly && (
              <div className="space-y-3 pt-1 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nhóm lý do bất thường</label>
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
                      Số biên bản ngoài hiện trường (nếu có)
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
                    placeholder="Ghi rõ vi phạm/người nghi vấn/biên bản xử lý..."
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {anomalyPhotos.map((src, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded border border-slate-300 overflow-hidden">
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
                      <span>Đính kèm ảnh hiện trường</span>
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
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
          >
            Đóng
          </button>

          <div className="flex flex-col sm:flex-row gap-2">
            {(hasR12Violation || unlistedPeople.length > 0) && (
              <button
                type="button"
                disabled={submitting || !shiftValidation.allowed}
                onClick={() => executeDecision('TRA_CHU_TAU_R12')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                Trả Chủ tàu do lệch danh sách (R12)
              </button>
            )}

            <button
              type="button"
              disabled={submitting || !shiftValidation.allowed}
              onClick={() => {
                if (!hasAnomaly) {
                  setHasAnomaly(true);
                  setError('Vui lòng nhập mô tả chi tiết bất thường rồi bấm lại Tạm giữ / Đình chỉ.');
                  return;
                }
                executeDecision('TAM_GIU_BIEN_PHONG');
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Tạm giữ / Đình chỉ</span>
            </button>

            <button
              type="button"
              disabled={submitting || !shiftValidation.allowed || hasAnomaly || hasR12Violation}
              onClick={() => executeDecision('CHO_XUAT_BEN')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? 'Đang xử lý...' : 'CHO XUẤT BẾN'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
