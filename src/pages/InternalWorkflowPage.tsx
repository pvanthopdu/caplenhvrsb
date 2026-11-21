/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  UserAccount,
  TripRecord,
  ReturnScope,
  OfficeErrorGroup,
  normalizeStatus,
} from '../types';
import { repository } from '../services/repository';
import { formatDateTime, getStatusInfo } from '../utils/formatters';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Send,
  Lock,
  UploadCloud,
  Ship,
  Printer,
  Eye,
  Download,
  ClipboardCheck,
  X,
  FileDown,
  Loader2,
  RotateCcw,
  CloudRain,
  Sun,
  Calendar,
  MapPin,
  FileWarning,
  Ban,
} from 'lucide-react';
import { OfficialFormsModal, OfficialFormTab } from '../components/OfficialFormsModal';
import { SearchableSelect } from '../components/SearchableSelect';
import { DigitalOrderA4 } from '../components/DigitalOrderA4';
import {
  triggerPrintOrder,
  downloadOrderWord,
  downloadOrderPdf,
} from '../utils/exportUtils';
import { dossierArchiveService } from '../services/dossierArchiveService';
import { fileStorageService } from '../services/fileStorageService';

interface InternalWorkflowPageProps {
  currentUser: UserAccount;
  initialTripId?: string;
  onNavigate: (page: string, tripId?: string) => void;
  onLogout?: () => void;
}

const DEPT_QUEUE_STATUSES = [
  'DA_CHAP_THUAN',
  'CHO_SO_XU_LY',
  'TAM_DUNG_THOI_TIET',
  'DA_DUYET',
  'DANG_TRINH_OFFICE',
  'OFFICE_TRA_LAI',
  'DA_CAP_PHEP',
];

function toDatetimeLocalValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  const yyyy = safe.getFullYear();
  const mm = String(safe.getMonth() + 1).padStart(2, '0');
  const dd = String(safe.getDate()).padStart(2, '0');
  const hh = String(safe.getHours()).padStart(2, '0');
  const mi = String(safe.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export const InternalWorkflowPage: React.FC<InternalWorkflowPageProps> = ({
  currentUser,
  initialTripId,
  onNavigate,
}) => {
  const [, setRepoTick] = useState(0);
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  useEffect(() => {
    const unsub = repository.subscribe(() => setRepoTick((t) => t + 1));
    const timer = window.setInterval(() => setNowTick(new Date()), 15000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  const trips = repository.getTrips();
  const weather = repository.getWeather();
  const adminConfig = repository.getAdminConfig();

  const queueTrips = useMemo(
    () =>
      trips.filter(
        (t) =>
          DEPT_QUEUE_STATUSES.includes(normalizeStatus(t.status)) ||
          t.id === initialTripId
      ),
    [trips, initialTripId]
  );

  const [selectedTripId, setSelectedTripId] = useState<string>(
    initialTripId || queueTrips[0]?.id || trips[0]?.id || ''
  );

  useEffect(() => {
    if (initialTripId) {
      setSelectedTripId(initialTripId);
    } else if (!trips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(queueTrips[0]?.id || trips[0]?.id || '');
    }
  }, [initialTripId, currentUser.id, currentUser.role]);

  const trip = trips.find((t) => t.id === selectedTripId);
  const canonicalStatus = trip ? normalizeStatus(trip.status) : undefined;
  const vessel = trip
    ? repository.getVesselById(trip.vesselId) ||
      repository.getVessels().find((v) => v.regNumber === trip.vesselRegNumber)
    : undefined;

  const isOfficerOrAdmin = currentUser.role === 'OFFICER' || currentUser.role === 'ADMIN';
  const shiftCheck = repository.validateShiftAndPortForAction(currentUser, undefined, nowTick);
  const canEditDept = isOfficerOrAdmin && shiftCheck.allowed;
  const deptClock = trip ? repository.computeDeptClockMinutes(trip, nowTick) : null;

  // Feedback banners
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Weather check inputs
  const [wxWindForce, setWxWindForce] = useState<number>(weather.windForceBeaufort);
  const [wxWaveHeight, setWxWaveHeight] = useState<number>(weather.waveHeightMeters);
  const [wxVisibilityKm, setWxVisibilityKm] = useState<number>(weather.visibilityKm ?? 10);
  const [wxForecastNote, setWxForecastNote] = useState<string>(
    weather.forecastNext24h || 'Khu vực biển Lý Sơn gió Đông Bắc nhẹ, tầm nhìn thông thoáng.'
  );
  const [wxIsSafe, setWxIsSafe] = useState<boolean>(!weather.isRouteSuspended);

  // Route suspension modal
  const [showWeatherSuspendModal, setShowWeatherSuspendModal] = useState<boolean>(false);
  const [weatherSuspendReason, setWeatherSuspendReason] = useState<string>(
    'Gió vượt cấp 6 / sóng trên 2.0m — tạm dừng cấp phép toàn tuyến.'
  );

  // Return modals (Trả Chủ tàu / Trả BQL Cảng)
  const [showReturnCaptainModal, setShowReturnCaptainModal] = useState<boolean>(false);
  const [captainReturnScope, setCaptainReturnScope] = useState<ReturnScope>('BO_SUNG_THONG_TIN');
  const [captainReturnReason, setCaptainReturnReason] = useState<string>('');

  const [showReturnPortModal, setShowReturnPortModal] = useState<boolean>(false);
  const [portReturnReason, setPortReturnReason] = useState<string>('');

  // Office submission & return
  const [officeDocRef, setOfficeDocRef] = useState<string>('');
  const [showOfficeReturnModal, setShowOfficeReturnModal] = useState<boolean>(false);
  const [officeReturnerRole, setOfficeReturnerRole] = useState<'TRUONG_PHONG' | 'LANH_DAO_SO'>('TRUONG_PHONG');
  const [officeErrorGroup, setOfficeErrorGroup] = useState<OfficeErrorGroup>('loi_xu_ly');
  const [officeReturnReason, setOfficeReturnReason] = useState<string>('');

  // Office signed PDF upload
  const [permitOrderNumber, setPermitOrderNumber] = useState<string>('');
  const [permitIssuedAtLocal, setPermitIssuedAtLocal] = useState<string>(() => toDatetimeLocalValue());
  const [permitSignerName, setPermitSignerName] = useState<string>('Phạm Minh Đức');
  const [permitPdfName, setPermitPdfName] = useState<string>('');
  const [permitPdfUrl, setPermitPdfUrl] = useState<string>('');
  const [permitServerPath, setPermitServerPath] = useState<string>('');
  const [isUploadingPdf, setIsUploadingPdf] = useState<boolean>(false);

  // Revoke modal
  const [showRevokeModal, setShowRevokeModal] = useState<boolean>(false);
  const [revokeReason, setRevokeReason] = useState<string>('');

  // Official forms & draft A4 modal
  const [showOfficialFormsModal, setShowOfficialFormsModal] = useState<boolean>(false);
  const [formsModalDefaultTab, setFormsModalDefaultTab] = useState<OfficialFormTab>('GENERAL');
  const [showDraftOrderModal, setShowDraftOrderModal] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  useEffect(() => {
    setActionErrorMsg(null);
    setActionSuccessMsg(null);
    if (!trip) return;
    const wxRec = trip.weatherCheckRecord;
    setWxWindForce(wxRec?.windForceBeaufort ?? weather.windForceBeaufort);
    setWxWaveHeight(wxRec?.waveHeightMeters ?? weather.waveHeightMeters);
    setWxVisibilityKm(wxRec?.visibilityKm ?? weather.visibilityKm ?? 10);
    setWxForecastNote(wxRec?.forecastNote || weather.forecastNext24h || 'Biển êm, tầm nhìn > 10km.');
    setWxIsSafe(wxRec ? Boolean(wxRec.isSafe ?? wxRec.conclusion === 'AN_TOAN') : !weather.isRouteSuspended);

    setOfficeDocRef(trip.officeSubmissionRecord?.officeDocumentRef || '');
    const seqSuffix = trip.departurePortId === 'PORT-02' ? 'AB-LS' : 'LS-AB';
    const nextSuggested =
      trip.orderNumber ||
      `${String(106 + Math.floor(Math.random() * 50)).padStart(3, '0')}/2026/${seqSuffix}`;
    setPermitOrderNumber(nextSuggested);
    setPermitIssuedAtLocal(toDatetimeLocalValue(trip.issuedAt));
    setPermitSignerName(trip.approvedByName || 'Phạm Minh Đức');
    setPermitPdfName(trip.issuedPdfName || '');
    setPermitPdfUrl(trip.issuedPdfUrl || '');
    setPermitServerPath(trip.issuedPdfServerPath || '');
  }, [selectedTripId]);

  const handleOpenDocModal = (tab: OfficialFormTab) => {
    setFormsModalDefaultTab(tab);
    setShowOfficialFormsModal(true);
  };

  if (!trip) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
        <p className="text-slate-600 text-sm font-bold">
          Hiện chưa có hồ sơ nào đang chờ Phòng An toàn giao thông (Sở Xây dựng) xử lý.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('trips')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          Xem danh sách hồ sơ
        </button>
      </div>
    );
  }

  const handleRecordWeatherCheck = () => {
    setActionErrorMsg(null);
    const res = repository.recordDeptWeatherCheck(trip.id, currentUser, {
      isSafe: wxIsSafe,
      windForceBeaufort: Number(wxWindForce),
      waveHeightMeters: Number(wxWaveHeight),
      visibilityKm: Number(wxVisibilityKm),
      forecastNote: wxForecastNote.trim(),
    });
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể ghi nhận kiểm tra thời tiết.');
      return;
    }
    setActionSuccessMsg(
      `Đã ghi nhận kiểm tra thời tiết (Gió cấp ${wxWindForce}, sóng ${wxWaveHeight}m — ${
        wxIsSafe ? 'An toàn' : 'Không an toàn'
      }).`
    );
  };

  const handleToggleWeatherSuspension = () => {
    setActionErrorMsg(null);
    if (weather.isRouteSuspended) {
      const res = repository.resumeWeatherSuspension(currentUser);
      if (!res.success) {
        setActionErrorMsg(res.error || 'Không thể mở lại tuyến.');
        return;
      }
      setWxIsSafe(true);
      setActionSuccessMsg(`Đã mở lại tuyến Đảo Lớn – Đảo Bé và khôi phục ${res.resumedCount} hồ sơ.`);
    } else {
      setShowWeatherSuspendModal(true);
    }
  };

  const handleConfirmWeatherSuspend = () => {
    const res = repository.suspendWaitingTripsByWeather(
      currentUser,
      weatherSuspendReason.trim() || 'Biển động vượt ngưỡng an toàn'
    );
    setShowWeatherSuspendModal(false);
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể tạm dừng toàn tuyến.');
      return;
    }
    setWxIsSafe(false);
    setActionSuccessMsg(
      `Đã kích hoạt TẠM DỪNG TOÀN TUYẾN DO THỜI TIẾT (${res.affectedCount} hồ sơ đang chờ Sở được tạm dừng và dừng đếm SLA).`
    );
  };

  const handleReturnCaptain = () => {
    setActionErrorMsg(null);
    const res = repository.returnTripToCaptainFromDept(
      trip.id,
      currentUser,
      captainReturnReason,
      captainReturnScope
    );
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể trả hồ sơ về Chủ tàu.');
      return;
    }
    setShowReturnCaptainModal(false);
    setCaptainReturnReason('');
    setActionSuccessMsg(
      `Đã trả hồ sơ ${trip.tripNumber} về Chủ tàu. Sau khi sửa, Chủ tàu nộp lại sẽ chuyển thẳng về Chuyên viên Sở.`
    );
  };

  const handleReturnPort = () => {
    setActionErrorMsg(null);
    const res = repository.returnTripToPortFromDept(trip.id, currentUser, portReturnReason);
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể trả hồ sơ về BQL Cảng.');
      return;
    }
    setShowReturnPortModal(false);
    setPortReturnReason('');
    setActionSuccessMsg(`Đã trả hồ sơ ${trip.tripNumber} về Ban Quản lý Cảng để kiểm tra bổ sung.`);
  };

  const handleApproveDraft = () => {
    setActionErrorMsg(null);
    const res = repository.approveDeptDraft(trip.id, currentUser);
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể duyệt dự thảo Giấy phép.');
      return;
    }
    setActionSuccessMsg(
      `Đã duyệt dự thảo Giấy phép cho ${trip.tripNumber}. Chuyên viên có thể xem/tải bản trình Office (chưa có dấu đỏ) và đánh dấu Đã trình Office.`
    );
  };

  const handleMarkSubmittedOffice = () => {
    setActionErrorMsg(null);
    const res = repository.markSubmittedToOffice(trip.id, currentUser, officeDocRef);
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể cập nhật trạng thái Đã trình Office.');
      return;
    }
    setActionSuccessMsg(
      `Đã đánh dấu trình hồ sơ lên phần mềm Office (đồng hồ SLA 60 phút của Sở vẫn đang tiếp tục đếm cho đến khi tải Giấy phép ký số lên ứng dụng).`
    );
  };

  const handleConfirmOfficeReturn = () => {
    setActionErrorMsg(null);
    const res = repository.recordOfficeReturn(trip.id, currentUser, {
      returnerRole: officeReturnerRole,
      nhomLoi: officeErrorGroup,
      reason: officeReturnReason,
    });
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể ghi nhận Office trả lại.');
      return;
    }
    setShowOfficeReturnModal(false);
    setOfficeReturnReason('');
    setActionSuccessMsg(
      `Đã ghi nhận Office trả lại (${
        officeErrorGroup === 'loi_ho_so' ? 'Lỗi hồ sơ' : 'Lỗi xử lý'
      }). Có thể trả Chủ tàu/BQL Cảng hoặc chỉnh sửa và trình lại.`
    );
  };

  const handleUploadSignedPdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploadingPdf(true);
    setActionErrorMsg(null);
    try {
      const saved = await fileStorageService.saveUploadedFile(file, `office_signed_${trip.tripNumber}`);
      let finalUrl = saved.previewUrl || `/local-archive/${encodeURIComponent(trip.tripNumber)}/${encodeURIComponent(file.name)}`;
      let finalPath = '';
      try {
        const uploaded = await dossierArchiveService.uploadBlobToDossier(
          trip.tripNumber,
          'lenh-cap-phep',
          file,
          {
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            category: 'ISSUED_ORDER_PDF',
            categoryName: 'Giấy phép rời cảng PDF đã ký số trên Office',
            note: `Chuyên viên ${currentUser.fullName} tải lên từ Office`,
            uploadedByName: currentUser.fullName,
            overwriteSameName: true,
          }
        );
        finalUrl = uploaded.downloadUrl;
        finalPath = uploaded.relativePath;
      } catch {
        // Giữ URL cục bộ nếu server archive không hoạt động
      }
      setPermitPdfName(file.name);
      setPermitPdfUrl(finalUrl);
      setPermitServerPath(finalPath);
      setActionSuccessMsg(`Đã chọn tệp Giấy phép đã ký số: "${file.name}". Nhấn "Phát hành Giấy phép lên ứng dụng" để hoàn tất.`);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Không thể đọc tệp PDF đã chọn.');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handlePublishPermit = () => {
    setActionErrorMsg(null);
    const issuedIso = permitIssuedAtLocal
      ? new Date(permitIssuedAtLocal).toISOString()
      : new Date().toISOString();
    const res = repository.publishOfficePermit(trip.id, currentUser, {
      orderNumber: permitOrderNumber,
      issuedAt: issuedIso,
      pdfUrl:
        permitPdfUrl ||
        `/api/dossiers/${encodeURIComponent(trip.tripNumber)}/files/lenh-cap-phep/${encodeURIComponent(
          permitPdfName || `Giay_Phep_${trip.tripNumber}.pdf`
        )}`,
      pdfName: permitPdfName || `Giay_Phep_${permitOrderNumber.replace(/[\/\\]/g, '_')}.pdf`,
      serverPath: permitServerPath || undefined,
      signerName: permitSignerName,
    });
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể phát hành Giấy phép.');
      return;
    }
    setActionSuccessMsg(
      `Đã phát hành Giấy phép rời cảng số ${res.trip?.orderNumber} lên ứng dụng! Đã gửi thông báo cho Chủ tàu, BQL Cảng và Biên phòng tại ${trip.departurePortName}.`
    );
  };

  const handleConfirmRevoke = () => {
    setActionErrorMsg(null);
    const res = repository.revokePermit(trip.id, currentUser, revokeReason);
    if (!res.success) {
      setActionErrorMsg(res.error || 'Không thể thu hồi Giấy phép.');
      return;
    }
    setShowRevokeModal(false);
    setRevokeReason('');
    setActionSuccessMsg(`Đã THU HỒI Giấy phép số ${trip.orderNumber}. Biên phòng và Chủ tàu đã nhận cảnh báo.`);
  };

  const handleDownloadWordOrder = () => {
    downloadOrderWord(trip, vessel);
    setActionSuccessMsg(
      `Đã xuất tệp Word (.doc) dự thảo Giấy phép (chưa đóng dấu đỏ) để Chuyên viên trình ký trên phần mềm Office.`
    );
  };

  const handleDownloadPdfOrder = async () => {
    setIsExportingPdf(true);
    try {
      const fileName = `Du_Thao_Giay_Phep_${trip.tripNumber}.pdf`;
      const ok = await downloadOrderPdf('printable-order-a4', fileName);
      if (ok) {
        setActionSuccessMsg(`Đã xuất tệp PDF dự thảo Giấy phép (chưa đóng dấu đỏ) để trình Office.`);
      } else {
        setActionErrorMsg('Không thể xuất PDF trực tiếp. Vui lòng dùng nút In trực tiếp -> Lưu PDF.');
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const statusInfo = getStatusInfo(trip.status);
  const notice = trip.approvalNotice;
  const pi = trip.portInspection;
  const paxMismatch =
    pi?.actualPassengerCount !== undefined && pi.actualPassengerCount !== trip.passengerCount;
  const cargoMismatch =
    pi?.actualCargoTons !== undefined && Math.abs(pi.actualCargoTons - trip.cargoTons) > 0.01;
  const checklist8 = pi?.checklistItems || [];

  // Office upload delay check (>10p between officeApprovedAt and uploadedToSystemAt or now)
  const officeUploadMinutes = (() => {
    const rec = trip.officeSubmissionRecord;
    if (!rec?.officeApprovedAt) return null;
    const endMs = rec.uploadedToSystemAt
      ? new Date(rec.uploadedToSystemAt).getTime()
      : nowTick.getTime();
    return Math.max(0, Math.round(((endMs - new Date(rec.officeApprovedAt).getTime()) / 60000) * 10) / 10);
  })();

  return (
    <div className="w-full mx-auto space-y-5 transition-all duration-300">
      {/* HEADER BANNER SỞ XÂY DỰNG */}
      <div className="bg-gradient-to-r from-[#065fd4] via-[#0c74e8] to-[#1a8df5] text-white p-5 sm:p-7 rounded-[24px] shadow-[0_14px_34px_-10px_rgba(10,92,212,0.38)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#fde68a]" />
                Phòng An toàn giao thông — Sở Xây dựng Quảng Ngãi
              </span>
              <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold border ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.badgeBorder}`}>
                {statusInfo.label}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              Xử lý hồ sơ {trip.tripNumber} — Tàu {trip.vesselName} ({trip.vesselRegNumber})
            </h1>
            <p className="text-xs text-blue-100 flex flex-wrap items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-[#fde68a]" />
              <span>
                Tuyến {trip.routeName} • Rời {trip.departurePortName} • Giờ dự kiến:{' '}
                {formatDateTime(trip.scheduledDepartureTime)}
              </span>
            </p>
            {trip.orderNumber && (
              <p className="text-xs font-mono font-bold text-[#fde68a]">
                Số Giấy phép: {trip.orderNumber} {trip.isPermitSuspended ? '(ĐANG ĐÌNH CHỈ)' : ''}
              </p>
            )}
          </div>

          <div className="bg-white/95 rounded-2xl p-3 sm:min-w-[330px] shadow-md">
            <SearchableSelect
              value={selectedTripId}
              onChange={(val) => setSelectedTripId(val)}
              ariaLabel="Chọn hồ sơ cần Sở xử lý"
              icon={<Calendar className="w-4 h-4 text-[#0d62e8]" />}
              searchPlaceholder="Tìm mã hồ sơ, tàu, số GP..."
              options={queueTrips.map((t) => {
                const info = getStatusInfo(t.status);
                const st = normalizeStatus(t.status);
                const highlight = ['CHO_SO_XU_LY', 'OFFICE_TRA_LAI', 'DA_DUYET', 'DANG_TRINH_OFFICE'].includes(st);
                return {
                  value: t.id,
                  label: `${t.tripNumber} - ${t.vesselName} (${info.label})`,
                  subLabel: `${t.vesselRegNumber} • ${t.routeName} • ${t.passengerCount} khách`,
                  badgeText: highlight ? info.label : undefined,
                  isHighlighted: highlight,
                  searchText: `${t.tripNumber} ${t.vesselName} ${t.vesselRegNumber} ${t.orderNumber || ''}`,
                };
              })}
            />
          </div>
        </div>
      </div>

      {/* ĐỒNG HỒ SỞ 60 PHÚT & CA TRỰC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
        {deptClock && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              deptClock.isRed
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : deptClock.isAmber
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-blue-50/70 border-blue-200 text-blue-950'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-black uppercase text-[11px]">
                  Đồng hồ Sở (Định mức {adminConfig.deptProcessingSlaMinutes}p)
                </p>
                <p className="text-[11px]">
                  Tổng: <strong className="tabular-nums">{deptClock.rawMinutes}p</strong> • Tạm dừng:{' '}
                  <strong className="tabular-nums">{deptClock.pausedMinutes}p</strong>
                </p>
              </div>
            </div>
            <span className="text-lg font-black tabular-nums">
              {deptClock.netMinutes}/{adminConfig.deptProcessingSlaMinutes}p
            </span>
          </div>
        )}

        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
            shiftCheck.allowed
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {shiftCheck.allowed ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <Lock className="w-5 h-5 text-amber-700 shrink-0" />
            )}
            <div>
              <p className="font-black uppercase text-[11px]">Phân quyền &amp; Ca trực Sở</p>
              <p className="text-[11px]">
                {!isOfficerOrAdmin
                  ? 'Chế độ chỉ đọc (Trưởng phòng/Lãnh đạo ký trên Office)'
                  : shiftCheck.allowed
                  ? `Trong ca trực${shiftCheck.shift ? `: ${shiftCheck.shift.shiftName}` : ''}`
                  : shiftCheck.reason}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
            weather.isRouteSuspended
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {weather.isRouteSuspended ? (
              <CloudRain className="w-5 h-5 text-rose-600 shrink-0" />
            ) : (
              <Sun className="w-5 h-5 text-emerald-600 shrink-0" />
            )}
            <div>
              <p className="font-black uppercase text-[11px]">Trạng thái tuyến theo thời tiết</p>
              <p className="text-[11px]">
                {weather.isRouteSuspended
                  ? `ĐANG TẠM DỪNG TOÀN TUYẾN: ${weather.suspensionReason || ''}`
                  : `Đang mở • Gió cấp ${weather.windForceBeaufort}, sóng ${weather.waveHeightMeters}m`}
              </p>
            </div>
          </div>
          {isOfficerOrAdmin && (
            <button
              type="button"
              onClick={handleToggleWeatherSuspension}
              disabled={!canEditDept}
              className={`px-3 py-1.5 rounded-lg font-bold text-[11px] shrink-0 cursor-pointer disabled:opacity-50 ${
                weather.isRouteSuspended
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {weather.isRouteSuspended ? 'Mở lại tuyến' : 'Tạm dừng toàn tuyến'}
            </button>
          )}
        </div>
      </div>

      {/* BANNERS PHẢN HỒI */}
      {actionErrorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-300 rounded-2xl flex items-center justify-between gap-2 text-xs font-bold text-red-950">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionErrorMsg}</span>
          </div>
          <button type="button" onClick={() => setActionErrorMsg(null)} className="cursor-pointer px-2">
            ✕
          </button>
        </div>
      )}
      {actionSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between gap-2 text-xs font-bold text-emerald-950">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button type="button" onClick={() => setActionSuccessMsg(null)} className="cursor-pointer px-2">
            ✕
          </button>
        </div>
      )}

      {/* NỘI DUNG CHÍNH: 3 KHỐI NGHIỆP VỤ CHUYÊN VIÊN & OFFICE */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 text-xs">
        {/* CỘT 1-2: ĐỐI CHIẾU HỒ SƠ CHỦ TÀU VS THÔNG BÁO BQL CẢNG + THỜI TIẾT */}
        <div className="xl:col-span-2 space-y-5">
          {/* KHỐI 1: ĐỐI CHIẾU CHÉO CHỦ TÀU & THÔNG BÁO CHẤP THUẬN BQL CẢNG */}
          <div className="bg-white rounded-[20px] border border-[#dce8f7] p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-blue-600" />
                  1. Đối chiếu hồ sơ Chủ tàu &amp; Thông báo chấp thuận của BQL Cảng
                </h2>
                <p className="text-[11px] text-slate-500">
                  {notice
                    ? `Thông báo ${notice.noticeNumber} cấp lúc ${formatDateTime(notice.issuedAt)} bởi ${notice.issuerName}`
                    : 'Chưa có Thông báo chấp thuận từ BQL Cảng'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['GENERAL', 'CREW', 'PASSENGER', 'APPENDIX01'] as OfficialFormTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => handleOpenDocModal(tab)}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[11px] cursor-pointer"
                  >
                    {tab === 'GENERAL'
                      ? 'Bản khai chung'
                      : tab === 'CREW'
                      ? 'DS Thuyền viên'
                      : tab === 'PASSENGER'
                      ? 'DS Hành khách'
                      : 'Phụ lục 01'}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3 border-b">Chỉ tiêu đối chiếu</th>
                    <th className="py-2 px-3 border-b">Chủ tàu khai</th>
                    <th className="py-2 px-3 border-b">BQL Cảng kiểm thực tế</th>
                    <th className="py-2 px-3 border-b">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  <tr className={paxMismatch ? 'bg-amber-50' : ''}>
                    <td className="py-2 px-3 font-bold">Số hành khách</td>
                    <td className="py-2 px-3 tabular-nums">{trip.passengerCount} người</td>
                    <td className="py-2 px-3 tabular-nums font-bold">
                      {pi?.actualPassengerCount ?? '--'} người
                    </td>
                    <td className="py-2 px-3">
                      {paxMismatch ? (
                        <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-950 font-bold text-[10px]">
                          Chênh lệch
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          Khớp
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr className={cargoMismatch ? 'bg-amber-50' : ''}>
                    <td className="py-2 px-3 font-bold">Hàng hóa</td>
                    <td className="py-2 px-3 tabular-nums">{trip.cargoTons} tấn</td>
                    <td className="py-2 px-3 tabular-nums font-bold">
                      {pi?.actualCargoTons ?? '--'} tấn
                    </td>
                    <td className="py-2 px-3">
                      {cargoMismatch ? (
                        <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-950 font-bold text-[10px]">
                          Chênh lệch
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          Khớp
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-bold">Thuyền viên / Áo phao</td>
                    <td className="py-2 px-3 tabular-nums">
                      {trip.crewMembers.length} TV • {trip.actualLifeJacketsReported ?? '--'} áo phao
                    </td>
                    <td className="py-2 px-3 tabular-nums font-bold">
                      {pi?.crewOrDocChanged ? 'Có thay đổi định biên' : 'Đúng danh sách'} •{' '}
                      {pi?.actualLifeJackets ?? '--'} áo phao
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          pi?.crewOrDocChanged
                            ? 'bg-amber-200 text-amber-950'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {pi?.crewOrDocChanged ? 'Lưu ý đổi định biên' : 'Khớp'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-bold">Phí rời cảng (R11)</td>
                    <td className="py-2 px-3 font-mono">
                      {trip.feeTransactionCode ||
                        (trip.uploadedDocuments?.some((d) => d.category === 'FEE_RECEIPT')
                          ? 'Có biên lai ảnh'
                          : 'Chưa có')}
                    </td>
                    <td className="py-2 px-3">
                      {pi?.feeVerified ? 'BQL đã xác minh đủ phí' : 'Chưa xác minh'}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          pi?.feeVerified
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {pi?.feeVerified ? 'Đạt' : 'Chưa đạt'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {checklist8.length > 0 && (
              <div className="space-y-2">
                <p className="font-bold text-slate-700 text-[11px] uppercase">
                  Kết quả 8 nhóm kiểm tra của BQL Cảng:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {checklist8.map((it) => (
                    <div
                      key={it.itemId || it.groupCode}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-slate-800 truncate">{it.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                          it.status === 'DAT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : it.status === 'KHONG_DAT'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {it.status === 'DAT' ? 'Đạt' : it.status === 'KHONG_DAT' ? 'Không đạt' : 'K.Á.D'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* KHỐI 2: KIỂM TRA THỜI TIẾT TẠI THỜI ĐIỂM CẤP PHÉP (R7) */}
          <div className="bg-white rounded-[20px] border border-[#dce8f7] p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                  <CloudRain className="w-4 h-4 text-blue-600" />
                  2. Ghi nhận kiểm tra thời tiết tại thời điểm xét cấp phép (Quy tắc R7)
                </h2>
                <p className="text-[11px] text-slate-500">
                  {trip.weatherCheckRecord
                    ? `Đã ghi nhận lúc ${formatDateTime(trip.weatherCheckRecord.checkedAt)} bởi ${trip.weatherCheckRecord.checkedByName}`
                    : 'Bắt buộc ghi nhận kết quả kiểm tra thời tiết trước khi Duyệt dự thảo.'}
                </p>
              </div>
              {trip.weatherCheckRecord && (
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black ${
                    trip.weatherCheckRecord.isSafe
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {trip.weatherCheckRecord.isSafe ? '✓ Thời tiết Đạt' : '✕ Thời tiết Nguy hiểm'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cấp gió (Beaufort):</label>
                <input
                  type="number"
                  value={wxWindForce}
                  onChange={(e) => setWxWindForce(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Độ cao sóng (m):</label>
                <input
                  type="number"
                  step="0.1"
                  value={wxWaveHeight}
                  onChange={(e) => setWxWaveHeight(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tầm nhìn xa (km):</label>
                <input
                  type="number"
                  step="0.5"
                  value={wxVisibilityKm}
                  onChange={(e) => setWxVisibilityKm(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Nhận định / Dự báo 24h:</label>
                <input
                  type="text"
                  value={wxForecastNote}
                  onChange={(e) => setWxForecastNote(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWxIsSafe(true)}
                  className={`flex-1 py-2 rounded-xl font-bold cursor-pointer ${
                    wxIsSafe ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  Đạt
                </button>
                <button
                  type="button"
                  onClick={() => setWxIsSafe(false)}
                  className={`flex-1 py-2 rounded-xl font-bold cursor-pointer ${
                    !wxIsSafe ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  Không đạt
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!canEditDept}
                onClick={handleRecordWeatherCheck}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer"
              >
                Ghi nhận kết quả kiểm tra thời tiết
              </button>
            </div>
          </div>
        </div>

        {/* CỘT 3: HÀNH ĐỘNG CHUYÊN VIÊN & QUY TRÌNH OFFICE */}
        <div className="space-y-5">
          {/* TRẢ HỒ SƠ NẾU CHƯA ĐẠT */}
          <div className="bg-white rounded-[20px] border border-[#dce8f7] p-5 shadow-xs space-y-3">
            <h3 className="font-black text-slate-900 uppercase flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              3A. Trả lại nếu hồ sơ có thiếu sót
            </h3>
            <p className="text-[11px] text-slate-500">
              Trả Chủ tàu sẽ nộp thẳng lại Chuyên viên; trả BQL Cảng sẽ tạm dừng đồng hồ Sở cho đến khi BQL gửi lại.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={
                  !canEditDept ||
                  !['CHO_SO_XU_LY', 'DA_DUYET', 'OFFICE_TRA_LAI', 'TAM_DUNG_THOI_TIET'].includes(
                    canonicalStatus || ''
                  )
                }
                onClick={() => setShowReturnCaptainModal(true)}
                className="py-2.5 px-3 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 border border-amber-300 rounded-xl font-bold cursor-pointer"
              >
                Trả Chủ tàu
              </button>
              <button
                type="button"
                disabled={
                  !canEditDept ||
                  !['CHO_SO_XU_LY', 'DA_DUYET', 'OFFICE_TRA_LAI', 'TAM_DUNG_THOI_TIET'].includes(
                    canonicalStatus || ''
                  )
                }
                onClick={() => setShowReturnPortModal(true)}
                className="py-2.5 px-3 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 text-orange-900 border border-orange-300 rounded-xl font-bold cursor-pointer"
              >
                Trả BQL Cảng
              </button>
            </div>
          </div>

          {/* DUYỆT DỰ THẢO & TRÌNH OFFICE (KHÔNG KÝ TRONG APP) */}
          <div className="bg-white rounded-[20px] border border-[#dce8f7] p-5 shadow-xs space-y-3">
            <h3 className="font-black text-slate-900 uppercase flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              3B. Duyệt dự thảo &amp; Trình ký trên Office
            </h3>
            <p className="text-[11px] text-slate-500">
              Trưởng phòng &amp; Lãnh đạo Sở ký trên phần mềm Office (ngoài ứng dụng). Bản xuất trình ký KHÔNG có dấu đỏ.
            </p>

            <button
              type="button"
              disabled={
                !canEditDept ||
                !['CHO_SO_XU_LY', 'OFFICE_TRA_LAI'].includes(canonicalStatus || '')
              }
              onClick={handleApproveDraft}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Duyệt dự thảo Giấy phép
            </button>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setShowDraftOrderModal(true)}
                className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold flex items-center justify-center gap-1 cursor-pointer text-[11px]"
              >
                <Eye className="w-3.5 h-3.5" />
                Xem dự thảo
              </button>
              <button
                type="button"
                onClick={handleDownloadWordOrder}
                className="py-2 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl font-bold flex items-center justify-center gap-1 cursor-pointer text-[11px]"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất Word
              </button>
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={handleDownloadPdfOrder}
                className="py-2 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold flex items-center justify-center gap-1 cursor-pointer text-[11px]"
              >
                <FileDown className="w-3.5 h-3.5" />
                {isExportingPdf ? 'Đang xuất...' : 'Xuất PDF'}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-2">
              <label className="block font-bold text-slate-700 text-[11px]">
                Số hồ sơ / Mã văn bản trình Office:
              </label>
              <input
                type="text"
                value={officeDocRef}
                onChange={(e) => setOfficeDocRef(e.target.value)}
                placeholder="VD: VB-2026-8812 trên Office"
                className="w-full p-2 border border-slate-300 rounded-xl font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={
                    !canEditDept ||
                    !['DA_DUYET', 'OFFICE_TRA_LAI'].includes(canonicalStatus || '')
                  }
                  onClick={handleMarkSubmittedOffice}
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Đánh dấu Đã trình Office
                </button>
                <button
                  type="button"
                  disabled={!canEditDept || canonicalStatus !== 'DANG_TRINH_OFFICE'}
                  onClick={() => setShowOfficeReturnModal(true)}
                  className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-900 border border-rose-300 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileWarning className="w-3.5 h-3.5" />
                  Office trả lại
                </button>
              </div>
            </div>

            {trip.officeSubmissionRecord?.returns && trip.officeSubmissionRecord.returns.length > 0 && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                <p className="font-bold text-rose-900 text-[11px]">
                  Lịch sử Office trả lại ({trip.officeSubmissionRecord.returns.length} lần):
                </p>
                {trip.officeSubmissionRecord.returns.map((ret, idx) => (
                  <p key={idx} className="text-[11px] text-rose-800">
                    • [{ret.nhomLoi === 'loi_xu_ly' ? 'Lỗi xử lý' : 'Lỗi hồ sơ'}] {ret.returnerRole}: {ret.reason}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* TẢI GIẤY PHÉP ĐÃ KÝ SỐ TỪ OFFICE LÊN APP */}
          <div className="bg-white rounded-[20px] border border-[#dce8f7] p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black text-slate-900 uppercase flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-600" />
                3C. Tải Giấy phép có dấu đỏ từ Office lên app
              </h3>
              {officeUploadMinutes !== null && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                    officeUploadMinutes > adminConfig.officeUploadSlaMinutes
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  Trễ tải: {officeUploadMinutes}/{adminConfig.officeUploadSlaMinutes}p
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Số Giấy phép (*):</label>
                <input
                  type="text"
                  value={permitOrderNumber}
                  onChange={(e) => setPermitOrderNumber(e.target.value)}
                  placeholder="106/2026/LS-AB"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Ngày giờ ký phát hành trên Office (*):</label>
                <input
                  type="datetime-local"
                  value={permitIssuedAtLocal}
                  onChange={(e) => setPermitIssuedAtLocal(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Người ký trên Office:</label>
                <input
                  type="text"
                  value={permitSignerName}
                  onChange={(e) => setPermitSignerName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tệp PDF Giấy phép có dấu đỏ (*):</label>
                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 rounded-xl cursor-pointer font-bold text-blue-800">
                  {isUploadingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  <span>{permitPdfName || 'Chọn file PDF đã ký số từ Office'}</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleUploadSignedPdfFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              disabled={
                !canEditDept ||
                !['DANG_TRINH_OFFICE', 'DA_DUYET'].includes(canonicalStatus || '')
              }
              onClick={handlePublishPermit}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Phát hành Giấy phép lên ứng dụng (DA_CAP_PHEP)
            </button>

            {['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG'].includes(canonicalStatus || '') && (
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-950">
                  <p className="font-bold">✓ Đã phát hành Giấy phép số {trip.orderNumber}</p>
                  <p>Hiệu lực 24h đến: {trip.orderValidUntil ? formatDateTime(trip.orderValidUntil) : '--'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(true)}
                  className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                  Thu hồi Giấy phép (THU_HOI)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showWeatherSuspendModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-200 space-y-4 text-xs">
            <h3 className="text-sm font-black text-rose-950 uppercase">
              Kích hoạt Tạm dừng toàn tuyến do thời tiết xấu
            </h3>
            <p className="text-slate-600">
              Toàn bộ hồ sơ đang chờ Sở xử lý sẽ tự động chuyển sang <strong>Tạm dừng thời tiết</strong> và dừng đếm đồng hồ SLA.
            </p>
            <textarea
              rows={3}
              value={weatherSuspendReason}
              onChange={(e) => setWeatherSuspendReason(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWeatherSuspendModal(false)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmWeatherSuspend}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold cursor-pointer"
              >
                Xác nhận tạm dừng toàn tuyến
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturnCaptainModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-amber-200 space-y-4 text-xs">
            <h3 className="text-sm font-black text-amber-950 uppercase">Trả hồ sơ về Chủ tàu</h3>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Phạm vi yêu cầu sửa:</label>
              <select
                value={captainReturnScope}
                onChange={(e) => setCaptainReturnScope(e.target.value as ReturnScope)}
                className="w-full p-2 border border-slate-300 rounded-xl bg-white"
              >
                <option value="BO_SUNG_THONG_TIN">Bổ sung thông tin / chứng từ</option>
                <option value="SUA_DANH_SACH_NGUOI">Sửa danh sách hành khách</option>
                <option value="THAY_DOI_THUYEN_VIEN_CHO">Thay đổi thuyền viên / sức chở</option>
              </select>
            </div>
            <textarea
              rows={3}
              value={captainReturnReason}
              onChange={(e) => setCaptainReturnReason(e.target.value)}
              placeholder="Nhập rõ lý do trả Chủ tàu..."
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReturnCaptainModal(false)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleReturnCaptain}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold cursor-pointer"
              >
                Xác nhận trả Chủ tàu
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturnPortModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-orange-200 space-y-4 text-xs">
            <h3 className="text-sm font-black text-orange-950 uppercase">Trả hồ sơ về Ban Quản lý Cảng</h3>
            <textarea
              rows={3}
              value={portReturnReason}
              onChange={(e) => setPortReturnReason(e.target.value)}
              placeholder="Ghi rõ nội dung BQL Cảng cần kiểm tra lại tại bến..."
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReturnPortModal(false)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleReturnPort}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl font-bold cursor-pointer"
              >
                Xác nhận trả BQL Cảng
              </button>
            </div>
          </div>
        </div>
      )}

      {showOfficeReturnModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-200 space-y-4 text-xs">
            <h3 className="text-sm font-black text-rose-950 uppercase">Ghi nhận Office trả lại</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cấp trả trên Office:</label>
                <select
                  value={officeReturnerRole}
                  onChange={(e) => setOfficeReturnerRole(e.target.value as 'TRUONG_PHONG' | 'LANH_DAO_SO')}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="TRUONG_PHONG">Trưởng phòng ATGT</option>
                  <option value="LANH_DAO_SO">Lãnh đạo Sở</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nhóm lỗi KPI:</label>
                <select
                  value={officeErrorGroup}
                  onChange={(e) => setOfficeErrorGroup(e.target.value as OfficeErrorGroup)}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="loi_xu_ly">Lỗi xử lý (Trừ điểm CV)</option>
                  <option value="loi_ho_so">Lỗi hồ sơ / Chủ tàu (Không trừ CV)</option>
                </select>
              </div>
            </div>
            <textarea
              rows={3}
              value={officeReturnReason}
              onChange={(e) => setOfficeReturnReason(e.target.value)}
              placeholder="Ghi rõ nội dung trả lại từ phần mềm Office..."
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOfficeReturnModal(false)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmOfficeReturn}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold cursor-pointer"
              >
                Ghi nhận trả lại
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevokeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-300 space-y-4 text-xs">
            <h3 className="text-sm font-black text-rose-950 uppercase">
              Thu hồi Giấy phép số {trip.orderNumber}
            </h3>
            <textarea
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Nhập lý do thu hồi Giấy phép (tối thiểu 5 ký tự)..."
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRevokeModal(false)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-semibold cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold cursor-pointer"
              >
                Xác nhận thu hồi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xem trước 3 biểu mẫu & Phụ lục 01 */}
      <OfficialFormsModal
        trip={trip}
        vessel={vessel}
        isOpen={showOfficialFormsModal}
        onClose={() => setShowOfficialFormsModal(false)}
        defaultTab={formsModalDefaultTab}
        allowUnmask={true}
      />

      {/* Modal xem trước & xuất dự thảo Giấy phép A4 (KHÔNG dấu đỏ) */}
      {showDraftOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-[24px] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 bg-[#072b61] text-white flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Ship className="w-4 h-4 text-[#fde68a]" />
                <span className="text-xs font-black uppercase">
                  Bản dự thảo Giấy phép rời cảng trình Office (Chưa đóng dấu đỏ)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerPrintOrder()}
                  className="px-3 py-1.5 bg-white text-[#072b61] rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> In trực tiếp
                </button>
                <button
                  type="button"
                  onClick={() => setShowDraftOrderModal(false)}
                  className="p-1.5 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
              <div id="printable-order-a4">
                <DigitalOrderA4
                  trip={trip}
                  vessel={vessel}
                  isDraftForSignature={normalizeStatus(trip.status) !== 'DA_CAP_PHEP'}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
