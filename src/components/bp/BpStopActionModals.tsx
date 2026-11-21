/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  BpStopReasonCode,
  DeNghiDung,
  TripRecord,
  UserAccount,
} from '../../types';
import { repository } from '../../services/repository';
import {
  BP_STOP_REASON_OPTIONS,
  formatDateTime,
  getBpStopReasonLabel,
} from '../../utils/formatters';

interface BpProposeStopModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripRecord | null;
  actor: UserAccount;
  presetReasonCode?: BpStopReasonCode;
  onSuccess: () => void;
}

/**
 * Biên phòng chỉ được Tạm giữ / Đình chỉ xuất bến SAU KHI đã có Giấy phép (DA_CAP_PHEP).
 * Đã bỏ hoàn toàn luồng đề nghị không cấp lệnh trước khi Sở cấp phép.
 */
export const BpProposeStopModal: React.FC<BpProposeStopModalProps> = ({
  isOpen,
  onClose,
  trip,
  actor,
  presetReasonCode,
  onSuccess,
}) => {
  const [maLyDo, setMaLyDo] = useState<BpStopReasonCode>(presetReasonCode || 'an_ninh_trat_tu');
  const [moTa, setMoTa] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [step, setStep] = useState<'FORM' | 'CONFIRM'>('FORM');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMaLyDo(presetReasonCode || 'an_ninh_trat_tu');
      setMoTa('');
      setImages([]);
      setStep('FORM');
      setError('');
      setSubmitting(false);
    }
  }, [isOpen, presetReasonCode, trip?.id]);

  if (!isOpen || !trip) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remainingSlots = Math.max(0, 3 - images.length);
    files.slice(0, remainingSlots).forEach((file) => {
      if (file.size > 4 * 1024 * 1024) {
        setError('Mỗi ảnh hiện trường tối đa 4 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImages((prev) => [...prev.slice(0, 2), reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleContinueToConfirm = () => {
    setError('');
    if (!maLyDo) {
      setError('Vui lòng chọn nhóm lý do tạm giữ.');
      return;
    }
    if (moTa.trim().length < 10) {
      setError('Mô tả chi tiết bắt buộc có ít nhất 10 ký tự.');
      return;
    }
    setStep('CONFIRM');
  };

  const handleSubmit = () => {
    setSubmitting(true);
    setError('');
    const res = repository.proposeBpStop({
      hoSoId: trip.id,
      loai: 'dinh_chi_lenh',
      maLyDo,
      moTa: moTa.trim(),
      anh: images,
      actor,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Không thể lập biên bản tạm giữ / đình chỉ.');
      setStep('FORM');
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/65 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl bg-white shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 bg-red-700 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">
                Tạm giữ / Đình chỉ xuất bến
              </h3>
              <p className="text-xs text-red-100 truncate">
                {trip.tripNumber} · {trip.vesselName} ({trip.vesselRegNumber})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-red-800 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'FORM' ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                Kiểm soát cuối cùng sau cấp phép: Khi tạm giữ, hồ sơ chuyển sang{' '}
                <strong>BIÊN PHÒNG TẠM GIỮ</strong> và mã QR Giấy phép sẽ báo <strong>Tạm đình chỉ</strong> cho đến khi gỡ giữ.
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Nhóm lý do <span className="text-red-600">*</span>
                </label>
                <select
                  value={maLyDo}
                  onChange={(e) => setMaLyDo(e.target.value as BpStopReasonCode)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-100"
                >
                  {BP_STOP_REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-slate-800">
                    Mô tả chi tiết <span className="text-red-600">*</span>
                  </label>
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      moTa.trim().length >= 10 ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {moTa.trim().length}/10+ ký tự
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={moTa}
                  onChange={(e) => setMoTa(e.target.value)}
                  placeholder="Nêu rõ sự việc phát hiện khi kiểm soát tại bến..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-slate-800">
                    Ảnh hiện trường (tùy chọn, tối đa 3 ảnh)
                  </label>
                  <span className="text-xs text-slate-500 tabular-nums">{images.length}/3 ảnh</span>
                </div>
                <div className="flex flex-wrap gap-2.5 items-center">
                  {images.map((src, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg border border-slate-300 overflow-hidden bg-slate-100">
                      <img src={src} alt={`Hiện trường ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/75 text-white flex items-center justify-center cursor-pointer"
                        aria-label="Xóa ảnh"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {images.length < 3 && (
                    <label className="min-h-[44px] px-3.5 py-2.5 rounded-lg border border-dashed border-slate-400 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer flex items-center gap-2">
                      <Camera className="w-4 h-4 text-slate-600" />
                      <span>Chụp / Chọn ảnh</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-2">
                <p className="text-sm font-bold text-red-900">
                  Xác nhận Tạm giữ / Đình chỉ xuất bến?
                </p>
                <div className="text-xs text-red-950 space-y-1">
                  <p>
                    <span className="font-semibold">Hồ sơ / GP:</span> {trip.tripNumber}
                    {trip.orderNumber ? ` · GP ${trip.orderNumber}` : ''}
                  </p>
                  <p>
                    <span className="font-semibold">Phương tiện:</span> {trip.vesselName} ({trip.vesselRegNumber})
                  </p>
                  <p>
                    <span className="font-semibold">Nhóm lý do:</span> {getBpStopReasonLabel(maLyDo)}
                  </p>
                  <p>
                    <span className="font-semibold">Mô tả:</span> {moTa.trim()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {step === 'FORM' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleContinueToConfirm}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 cursor-pointer"
              >
                Tiếp tục xác nhận
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('FORM')}
                disabled={submitting}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Quay lại sửa
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-bold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Đang xử lý...' : 'Xác nhận tạm giữ'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface BpLiftStopModalProps {
  isOpen: boolean;
  onClose: () => void;
  stopRecord: DeNghiDung | null;
  tripId?: string;
  tripNumber: string;
  vesselName: string;
  actor: UserAccount;
  onSuccess: () => void;
}

export const BpLiftStopModal: React.FC<BpLiftStopModalProps> = ({
  isOpen,
  onClose,
  stopRecord,
  tripId,
  tripNumber,
  vesselName,
  actor,
  onSuccess,
}) => {
  const [ketQuaXacMinh, setKetQuaXacMinh] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setKetQuaXacMinh('');
      setError('');
      setSubmitting(false);
    }
  }, [isOpen, stopRecord?.id, tripId]);

  if (!isOpen || (!stopRecord && !tripId)) return null;

  const handleSubmit = () => {
    setError('');
    if (ketQuaXacMinh.trim().length < 5) {
      setError('Bắt buộc nhập kết quả xác minh / lý do gỡ tạm giữ (tối thiểu 5 ký tự).');
      return;
    }
    setSubmitting(true);
    const res = stopRecord
      ? repository.liftBpStop({
          deNghiId: stopRecord.id,
          ketQuaXacMinh: ketQuaXacMinh.trim(),
          actor,
        })
      : repository.liftBpHold(tripId!, actor, ketQuaXacMinh.trim());
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Không thể gỡ tạm giữ.');
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/65 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl bg-white shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 bg-emerald-700 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">
                Gỡ tạm giữ Biên phòng & Khôi phục Giấy phép
              </h3>
              <p className="text-xs text-emerald-100 truncate">
                {tripNumber} · {vesselName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-emerald-800 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
              {error}
            </div>
          )}

          {stopRecord && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1">
              <p>
                <span className="font-semibold text-slate-900">Lý do tạm giữ:</span>{' '}
                {getBpStopReasonLabel(stopRecord.maLyDo)}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Người lập:</span> {stopRecord.nguoiDeNghi} ({formatDateTime(stopRecord.thoiDiem)})
              </p>
              <p>
                <span className="font-semibold text-slate-900">Nội dung:</span> {stopRecord.moTa}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Kết quả xác minh / Căn cứ gỡ tạm giữ <span className="text-red-600">*</span>
            </label>
            <textarea
              rows={4}
              value={ketQuaXacMinh}
              onChange={(e) => setKetQuaXacMinh(e.target.value)}
              placeholder="Ghi rõ kết quả xác minh nhân thân, hàng hóa hoặc khắc phục đảm bảo an toàn..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Đang khôi phục...' : 'Xác nhận gỡ tạm giữ'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface BpPortControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripRecord | null;
  actor: UserAccount;
  onSuccess: () => void;
}

export const BpPortControlModal: React.FC<BpPortControlModalProps> = ({
  isOpen,
  onClose,
  trip,
  actor,
  onSuccess,
}) => {
  const crewCount = trip?.crewMembers?.length || 0;
  const paxCount =
    trip && trip.passengers && trip.passengers.length > 0
      ? trip.passengers.length
      : trip?.passengerCount || 0;
  const listedTotal = crewCount + paxCount;

  const isBpAccount = actor.role === 'BP_TRUC' || actor.role === 'BP_CHIHUY';
  const [soNguoiThucTe, setSoNguoiThucTe] = useState<number>(listedTotal || 1);
  const [ghiChu, setGhiChu] = useState('');
  const [error, setError] = useState('');
  const [showPaxChecklist, setShowPaxChecklist] = useState(false);
  const [paxSearch, setPaxSearch] = useState('');
  const [checkedPaxIds, setCheckedPaxIds] = useState<string[]>([]);
  const loggedChecklistTripRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && trip) {
      const existing = repository.getLatestKiemSoatForTrip(trip.id);
      setSoNguoiThucTe(existing ? existing.soNguoiThucTe : listedTotal || 1);
      setGhiChu(existing ? existing.ghiChu : '');
      setError('');
      setShowPaxChecklist(false);
      setPaxSearch('');
      setCheckedPaxIds([]);
      loggedChecklistTripRef.current = null;
    } else {
      loggedChecklistTripRef.current = null;
    }
  }, [isOpen, trip?.id, listedTotal]);

  const passengerList = trip?.passengers || [];
  const filteredPassengers = useMemo(() => {
    const q = paxSearch.trim().toLowerCase();
    if (!q) return passengerList;
    return passengerList.filter((p) => {
      const hay = `${p.fullName} ${p.birthYear} ${p.idNumber} ${p.phone} ${p.address || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [passengerList, paxSearch]);

  if (!isOpen || !trip) return null;

  const handleToggleChecklist = () => {
    const next = !showPaxChecklist;
    setShowPaxChecklist(next);
    if (next && isBpAccount && passengerList.length > 0 && loggedChecklistTripRef.current !== trip.id) {
      loggedChecklistTripRef.current = trip.id;
      repository.logPersonalDataAccess({
        hoSoId: trip.id,
        lyDo: 'Rà soát đầy đủ thông tin hành khách khi kiểm đếm tại bến',
        actor,
      });
    }
  };

  const togglePassengerChecked = (paxKey: string) => {
    setCheckedPaxIds((prev) =>
      prev.includes(paxKey) ? prev.filter((id) => id !== paxKey) : [...prev, paxKey]
    );
  };

  const diff = soNguoiThucTe - listedTotal;
  const isMatch = diff === 0;

  const handleSave = () => {
    setError('');
    if (!Number.isFinite(soNguoiThucTe) || soNguoiThucTe < 1) {
      setError('Số người thực tế lên tàu phải lớn hơn hoặc bằng 1.');
      return;
    }
    const res = repository.recordPortControlCheck({
      hoSoId: trip.id,
      soNguoiThucTe,
      ghiChu,
      actor,
    });
    if (!res.success) {
      setError(res.error || 'Không thể lưu ghi nhận đối chiếu.');
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/65 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl bg-white shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="w-5 h-5 shrink-0 text-sky-400" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">
                Kiểm đếm hành khách & Thuyền viên
              </h3>
              <p className="text-xs text-slate-300 truncate">
                {trip.tripNumber} · {trip.vesselName} ({trip.vesselRegNumber})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-800 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-xs text-slate-500">Thuyền viên</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900">{crewCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-xs text-slate-500">Hành khách</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900">{paxCount}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5">
              <p className="text-xs text-sky-700">Tổng danh sách</p>
              <p className="text-lg font-bold font-mono tabular-nums text-sky-900">{listedTotal}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              Số người thực tế ghi nhận
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSoNguoiThucTe((v) => Math.max(1, v - 1))}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer"
                aria-label="Giảm 1"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                min={1}
                value={soNguoiThucTe}
                onChange={(e) => setSoNguoiThucTe(Math.max(0, Number(e.target.value) || 0))}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-300 px-3 text-center text-xl font-bold font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSoNguoiThucTe((v) => v + 1)}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer"
                aria-label="Tăng 1"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div
            className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium flex items-center gap-2 ${
              isMatch
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            {isMatch ? (
              <>
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Khớp danh sách khai báo ({soNguoiThucTe}/{listedTotal} người).</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>
                  Chênh lệch {diff > 0 ? `+${diff}` : diff} người so với danh sách ({soNguoiThucTe}/{listedTotal}).
                </span>
              </>
            )}
          </div>

          {isBpAccount && passengerList.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
              <button
                type="button"
                onClick={handleToggleChecklist}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <UserCheck className="w-4 h-4 text-sky-700 shrink-0" />
                  <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    Rà soát hành khách ({passengerList.length} HK · Đã tích {checkedPaxIds.length})
                  </span>
                </div>
                {showPaxChecklist ? (
                  <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                )}
              </button>

              {showPaxChecklist && (
                <div className="p-3 border-t border-slate-200 bg-white space-y-2.5">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={paxSearch}
                        onChange={(e) => setPaxSearch(e.target.value)}
                        placeholder="Tìm theo tên, CCCD/HC, SĐT..."
                        className="w-full min-h-[38px] pl-8 pr-2.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSoNguoiThucTe(crewCount + checkedPaxIds.length)}
                      className="min-h-[38px] px-3 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Áp dụng ({crewCount + checkedPaxIds.length})
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {filteredPassengers.map((p, idx) => {
                      const paxKey = p.id || `${p.idNumber}-${idx}`;
                      const isChecked = checkedPaxIds.includes(paxKey);
                      return (
                        <label
                          key={paxKey}
                          className={`flex items-start gap-2.5 p-2.5 text-xs cursor-pointer transition-colors ${
                            isChecked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePassengerChecked(paxKey)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-bold text-slate-900">
                                {idx + 1}. {p.fullName}
                              </span>
                              <span className="font-mono text-[11px] text-slate-600">
                                {p.birthYear} · {p.gender === 'NAM' ? 'Nam' : p.gender === 'NU' ? 'Nữ' : 'Khác'}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-slate-700">
                              CCCD/HC: <strong>{p.idNumber}</strong> · SĐT: <strong>{p.phone}</strong>
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Ghi chú kiểm đếm
            </label>
            <textarea
              rows={3}
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Ghi nhận tình hình thực tế..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
          >
            Lưu ghi nhận
          </button>
        </div>
      </div>
    </div>
  );
};
