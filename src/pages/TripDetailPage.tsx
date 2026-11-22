/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { UserAccount } from '../types';
import { repository } from '../services/repository';
import {
  getStatusInfo,
  getRoleTripStatusInfo,
  getRejectedOriginLabel,
  getBpStopReasonLabel,
  getReturnPartyLabel,
  getReturnScopeLabel,
  getStatusMilestoneLabel,
  formatDateTime,
  formatClockDuration,
  maskFullNameInitials,
  maskIdNumber,
  maskPhone,
} from '../utils/formatters';
import { exportPassengersToExcel } from '../utils/exportUtils';
import {
  getUserAccessibleVesselIds,
  isTripAccessibleToUser,
  normalizeStatus,
} from '../utils/userPermissions';
import { BpLiftStopModal } from '../components/bp/BpStopActionModals';
import {
  ArrowLeft,
  Ship,
  Users,
  ClipboardCheck,
  ShieldCheck,
  Clock,
  Printer,
  Download,
  AlertTriangle,
  CheckCircle2,
  Anchor,
  Sparkles,
  FileText,
  Eye,
  FileCheck,
  GitBranch,
  Server,
  FolderOpen,
  Upload,
  Trash2,
  RefreshCw,
  Loader2,
  Unlock,
  RotateCcw,
  Building2,
} from 'lucide-react';
import { TripTimelineTree } from '../components/TripTimelineTree';
import { CoastalPageHero } from '../components/CoastalPageHero';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import {
  dossierArchiveService,
  ServerArchivedFile,
  ServerDossierDetails,
  ServerDossierSubFolder,
} from '../services/dossierArchiveService';

interface TripDetailPageProps {
  tripId: string;
  currentUser: UserAccount;
  onNavigate: (page: string, tripId?: string) => void;
  onOpenAiDrawer: () => void;
}

export const TripDetailPage: React.FC<TripDetailPageProps> = ({
  tripId,
  currentUser,
  onNavigate,
  onOpenAiDrawer,
}) => {
  const [, setRepoTick] = useState(0);
  const [nowTime, setNowTime] = useState<Date>(() => new Date());
  const trip = repository.getTripById(tripId);
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'TIMELINE' | 'PASSENGERS' | 'DOCUMENTS' | 'APPENDIX01' | 'RULES' | 'PHASES' | 'LOGS'
  >('OVERVIEW');
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [serverArchive, setServerArchive] = useState<ServerDossierDetails | null>(null);
  const [isLoadingServerArchive, setIsLoadingServerArchive] = useState(false);
  const [isSyncingServer, setIsSyncingServer] = useState(false);
  const [isUploadingServerFile, setIsUploadingServerFile] = useState(false);
  const [serverUploadFolder, setServerUploadFolder] = useState<ServerDossierSubFolder>('giay-to');
  const [serverActionNotice, setServerActionNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const serverFileInputRef = React.useRef<HTMLInputElement>(null);

  // Rút hồ sơ trước cấp phép (Chủ tàu)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');

  // Biên phòng mở khóa xem đầy đủ thông tin hành khách (Nghị định 356/2025/NĐ-CP)
  const [showUnlockPaxModal, setShowUnlockPaxModal] = useState(false);
  const [unlockPaxReason, setUnlockPaxReason] = useState('');
  const [paxUnlocked, setPaxUnlocked] = useState(false);

  // Biến động hành khách trước xuất bến
  const [modModalOpen, setModModalOpen] = useState(false);
  const [modAction, setModAction] = useState<'ADD' | 'REMOVE'>('REMOVE');
  const [paxNameToMod, setPaxNameToMod] = useState('');
  const [paxReason, setPaxReason] = useState('');

  const [showLiftBpModal, setShowLiftBpModal] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    const unsub = repository.subscribe(() => setRepoTick((t) => t + 1));
    const timer = setInterval(() => setNowTime(new Date()), 10000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  const loadServerArchive = async (tripNumber?: string) => {
    if (!tripNumber) return;
    setIsLoadingServerArchive(true);
    try {
      const details = await dossierArchiveService.getDossierArchive(tripNumber);
      setServerArchive(details);
    } finally {
      setIsLoadingServerArchive(false);
    }
  };

  useEffect(() => {
    if (trip?.tripNumber) {
      void loadServerArchive(trip.tripNumber);
    }
  }, [trip?.tripNumber, activeTab]);

  if (!trip) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <p className="text-slate-500 text-sm">Không tìm thấy thông tin hồ sơ {tripId}</p>
        <button
          onClick={() => onNavigate('trips')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const vessels = repository.getVessels();
  const crewCatalog = repository.getCrew();
  const accessibleVesselIds = getUserAccessibleVesselIds(currentUser, vessels, crewCatalog);

  if (currentUser.role === 'CAPTAIN') {
    const isAccessible = isTripAccessibleToUser(currentUser, trip, accessibleVesselIds);
    if (!isAccessible) {
      return (
        <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm max-w-xl mx-auto my-12 animate-in fade-in">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Không có quyền truy cập hồ sơ này</h2>
          <p className="text-slate-600 text-xs mt-2 leading-relaxed">
            Thuyền trưởng/chủ tàu chỉ có quyền xem hồ sơ và lệnh xuất bến của phương tiện thuộc quyền quản lý của mình ({trip.vesselName} - {trip.vesselRegNumber} thuộc chủ phương tiện khác).
          </p>
          <button
            onClick={() => onNavigate('trips')}
            className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Quay lại danh sách hồ sơ của tàu bạn
          </button>
        </div>
      );
    }
  }

  const st = normalizeStatus(trip.status);
  const statusInfo = getRoleTripStatusInfo(trip, currentUser.role);
  const activeBpStop = repository.getActiveDeNghiDungForTrip(trip.id);
  const isBpHeld = st === 'TAM_GIU_BIEN_PHONG';
  const canLiftHold =
    isBpHeld &&
    (activeBpStop
      ? repository.canUserLiftBpStop(currentUser, activeBpStop)
      : ['BP_TRUC', 'BP_CHIHUY', 'ADMIN'].includes(currentUser.role));
  const bpConfig = repository.getBpConfig();

  const bqlClock = repository.computeBqlClockMinutes(trip, nowTime);
  const deptClock = repository.computeDeptClockMinutes(trip, nowTime);
  const adminConfig = repository.getAdminConfig();

  const preIssuanceStatuses = [
    'NHAP',
    'CHO_KIEM_TRA',
    'TRA_CHU_TAU',
    'DA_CHAP_THUAN',
    'CHO_SO_XU_LY',
    'TRA_BQL_CANG',
    'TAM_DUNG_THOI_TIET',
    'DA_DUYET',
    'DANG_TRINH_OFFICE',
    'OFFICE_TRA_LAI',
  ];
  const canCaptainWithdraw =
    ['CAPTAIN', 'ADMIN'].includes(currentUser.role) && preIssuanceStatuses.includes(st);

  const isPermitIssuedOrLater = [
    'DA_CAP_PHEP',
    'TAM_GIU_BIEN_PHONG',
    'DA_XUAT_BEN',
    'DA_CAP_BEN',
    'HET_HIEU_LUC',
    'THU_HOI',
  ].includes(st);

  const signedPdfUrl = trip.issuedPdfUrl || trip.officeSubmissionRecord?.issuedPdfUrl;
  const signedPdfName =
    trip.issuedPdfName || trip.officeSubmissionRecord?.issuedPdfName || `GiayPhep_${trip.tripNumber}.pdf`;

  const officeUploadMinutes = (() => {
    const rec = trip.officeSubmissionRecord;
    const refIso = rec?.issuedAt || trip.issuedAt;
    const upIso = rec?.uploadedToSystemAt || rec?.issuedAt;
    if (!refIso || !upIso) return null;
    const diff = Math.max(0, Math.round(((new Date(upIso).getTime() - new Date(refIso).getTime()) / 60000) * 10) / 10);
    return Number.isFinite(diff) ? diff : null;
  })();

  const isBienPhongUser = ['BP_TRUC', 'BP_CHIHUY'].includes(currentUser.role);
  const canSeeFullPassengerPii = currentUser.role === 'CAPTAIN' || (isBienPhongUser && paxUnlocked);

  const handleWithdrawDossier = () => {
    const reason = withdrawReason.trim() || 'Chủ tàu chủ động rút hồ sơ trước khi cấp phép.';
    const res = repository.withdrawTripDossier(trip.id, currentUser, reason);
    setWithdrawModalOpen(false);
    setWithdrawReason('');
    if (!res.success) {
      setActionNotice({ type: 'error', text: res.error || 'Không thể rút hồ sơ.' });
      return;
    }
    setActionNotice({ type: 'success', text: `Đã rút hồ sơ ${trip.tripNumber} thành công.` });
  };

  const handleUnlockPassengerPii = () => {
    if (unlockPaxReason.trim().length < 5) return;
    repository.logPersonalDataAccess({
      hoSoId: trip.id,
      lyDo: unlockPaxReason.trim(),
      actor: currentUser,
    });
    setPaxUnlocked(true);
    setShowUnlockPaxModal(false);
    setUnlockPaxReason('');
    setActionNotice({
      type: 'success',
      text: 'Đã mở khóa thông tin hành khách đầy đủ và ghi nhận vào Nhật ký truy cập dữ liệu cá nhân.',
    });
  };

  const handleModifyPassenger = () => {
    if (!paxNameToMod || !paxReason) return;
    if (!trip.passengerModifications) trip.passengerModifications = [];

    trip.passengerModifications.push({
      modifiedAt: new Date().toISOString(),
      modifiedByName: currentUser.fullName,
      action: modAction,
      passengerName: paxNameToMod,
      passengerIdNumber: '051***999',
      reason: paxReason,
      approvedByLeader: true,
    });

    if (modAction === 'REMOVE') {
      trip.passengerCount = Math.max(0, trip.passengerCount - 1);
    } else {
      trip.passengerCount = trip.passengerCount + 1;
    }

    repository.saveTrip(trip);
    repository.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: `BIẾN_ĐỘNG_HÀNH_KHÁCH_${modAction}`,
      targetId: trip.id,
      targetType: 'TRIP',
      details: `${modAction === 'REMOVE' ? 'Bớt' : 'Thêm'} hành khách "${paxNameToMod}". Lý do: ${paxReason}.`,
    });

    setModModalOpen(false);
    setPaxNameToMod('');
    setPaxReason('');
  };

  // 5 chặng quy trình chuẩn
  const stageCards = [
    {
      num: '1',
      title: 'Chủ tàu nộp HS',
      role: 'Hồ sơ + Phí (R11)',
      done: st !== 'NHAP' && st !== 'DA_RUT',
      active: ['NHAP', 'TRA_CHU_TAU'].includes(st),
    },
    {
      num: '2',
      title: 'BQL Cảng KT',
      role: `8 nhóm · ≤${adminConfig.bqlProcessingSlaMinutes}p`,
      done: Boolean(trip.approvalNotice) || [
        'DA_CHAP_THUAN',
        'CHO_SO_XU_LY',
        'TAM_DUNG_THOI_TIET',
        'DA_DUYET',
        'DANG_TRINH_OFFICE',
        'OFFICE_TRA_LAI',
        'DA_CAP_PHEP',
        'TAM_GIU_BIEN_PHONG',
        'DA_XUAT_BEN',
        'DA_CAP_BEN',
      ].includes(st),
      active: ['CHO_KIEM_TRA', 'TRA_BQL_CANG'].includes(st),
    },
    {
      num: '3',
      title: 'Sở & Office',
      role: `KT + GP ≤${adminConfig.deptProcessingSlaMinutes}p`,
      done: isPermitIssuedOrLater,
      active: [
        'DA_CHAP_THUAN',
        'CHO_SO_XU_LY',
        'TAM_DUNG_THOI_TIET',
        'DA_DUYET',
        'DANG_TRINH_OFFICE',
        'OFFICE_TRA_LAI',
      ].includes(st),
    },
    {
      num: '4',
      title: 'Biên phòng KS',
      role: 'Quét QR & Quân số',
      done: ['DA_XUAT_BEN', 'DA_CAP_BEN'].includes(st),
      active: ['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG'].includes(st),
    },
    {
      num: '5',
      title: 'Cập bến đích',
      role: 'Hoàn thành chuyến',
      done: st === 'DA_CAP_BEN',
      active: st === 'DA_XUAT_BEN',
    },
  ];

  return (
    <div className="space-y-6">
      <CoastalPageHero
        title={`Hồ sơ: ${trip.tripNumber}`}
        subtitle={`Tàu ${trip.vesselName} (${trip.vesselRegNumber}) • Tuyến: ${trip.routeName}`}
        icon={<Ship className="w-7 h-7" />}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigate('trips')}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/25 text-[11px] font-bold transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Danh sách</span>
            </button>
            {trip.orderNumber && (
              <span className="text-[11px] font-mono font-black bg-[#daf5e7] text-[#0c7a45] px-2.5 py-0.5 rounded-full border border-[#a9e4c5]">
                GP: {trip.orderNumber}
              </span>
            )}
            <span
              title={statusInfo.subLabel}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.badgeBorder}`}
            >
              {statusInfo.label}
            </span>
          </div>
        }
        rightContent={
          <div className="flex flex-wrap items-center gap-2">
            {(trip.orderNumber || isPermitIssuedOrLater || ['DA_DUYET', 'DANG_TRINH_OFFICE'].includes(st)) && (
              <button
                onClick={() => onNavigate('view-order', trip.id)}
                className="px-4 py-2 text-xs font-extrabold text-[#072b61] bg-[#f4cf47] hover:bg-[#eab308] rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>{isPermitIssuedOrLater ? 'Xem Giấy phép A4 & QR' : 'Xem dự thảo A4'}</span>
              </button>
            )}

            <button
              onClick={onOpenAiDrawer}
              className="px-4 py-2 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-full transition flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#fde68a]" />
              <span>Rà soát hồ sơ</span>
            </button>
          </div>
        }
      />

      {actionNotice && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            actionNotice.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button type="button" onClick={() => setActionNotice(null)} className="px-2 font-black cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* BANNER BIÊN PHÒNG TẠM GIỮ SAU CẤP PHÉP */}
      {isBpHeld && (
        <div className="p-4 sm:p-5 bg-red-50 border-2 border-red-300 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-red-950">
              <h3 className="text-xs sm:text-sm font-black text-red-900 uppercase">
                TẠM GIỮ / ĐÌNH CHỈ XUẤT BẾN — {bpConfig.unitDisplayName}
              </h3>
              {activeBpStop ? (
                <>
                  <p>
                    Lý do: <strong>{getBpStopReasonLabel(activeBpStop.maLyDo)}</strong> — {activeBpStop.moTa}
                  </p>
                  <p className="text-[11px] text-red-800">
                    Cán bộ lập biên bản: {activeBpStop.nguoiDeNghi} • Thời điểm:{' '}
                    {formatDateTime(activeBpStop.thoiDiem)}
                    {activeBpStop.soBienBanNgoai ? ` • Số biên bản: ${activeBpStop.soBienBanNgoai}` : ''}
                  </p>
                </>
              ) : trip.bpDepartureControl?.anomalyDescription ? (
                <p>
                  Chi tiết bất thường: <strong>{trip.bpDepartureControl.anomalyDescription}</strong>
                  {trip.bpDepartureControl.soBienBanNgoai
                    ? ` (Số BB: ${trip.bpDepartureControl.soBienBanNgoai})`
                    : ''}
                </p>
              ) : (
                <p>Tàu đang bị tạm giữ tại bến sau khi kiểm soát xuất bến. Cần xử lý dứt điểm trước khi cho rời bến.</p>
              )}
            </div>
          </div>
          {canLiftHold && (
            <button
              type="button"
              onClick={() => setShowLiftBpModal(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shrink-0 cursor-pointer shadow-sm"
            >
              Xử lý & Gỡ tạm giữ
            </button>
          )}
        </div>
      )}

      {/* BANNER TRẢ LẠI HỒ SƠ (CHỦ TÀU / BQL CẢNG / OFFICE) */}
      {['TRA_CHU_TAU', 'TRA_BQL_CANG', 'OFFICE_TRA_LAI'].includes(st) && (
        <div className="p-4 sm:p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <RotateCcw className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs sm:text-sm font-black text-rose-900 uppercase">
                {st === 'TRA_CHU_TAU'
                  ? `Hồ sơ bị trả lại từ ${getRejectedOriginLabel(trip)}`
                  : st === 'TRA_BQL_CANG'
                  ? 'Chuyên viên Sở trả lại BQL Cảng rà soát'
                  : 'Office (Trưởng phòng / Lãnh đạo Sở) trả lại dự thảo'}
                {trip.lastReturnInfo?.nguoiTraTen || trip.rejectedByName
                  ? ` (${trip.lastReturnInfo?.nguoiTraTen || trip.rejectedByName})`
                  : ''}
              </h3>
              <p className="text-xs text-rose-800 mt-1">
                Lý do:{' '}
                <strong>
                  {trip.lastReturnInfo?.lyDo || trip.rejectReason || 'Cần chỉnh sửa, bổ sung theo quy định.'}
                </strong>
              </p>
              <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] text-rose-800">
                {trip.lastReturnInfo?.benSai && (
                  <span className="px-2 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-950 font-black">
                    Xác định bên sai:{' '}
                    {trip.lastReturnInfo.benSai === 'BQL_CANG'
                      ? 'Ban Quản lý Cảng'
                      : 'Chủ tàu / Thuyền trưởng'}
                  </span>
                )}
                {trip.lastReturnInfo?.phamVi && (
                  <span className="px-2 py-0.5 rounded bg-white border border-rose-200 font-bold">
                    Phạm vi sửa: {getReturnScopeLabel(trip.lastReturnInfo.phamVi)}
                  </span>
                )}
                {trip.lastReturnInfo?.nhomLoi && (
                  <span className="px-2 py-0.5 rounded bg-white border border-rose-200 font-bold">
                    Phân loại KPI:{' '}
                    {trip.lastReturnInfo.nhomLoi === 'loi_xu_ly' ? 'Lỗi xử lý' : 'Lỗi hồ sơ (không trừ KPI)'}
                  </span>
                )}
                {trip.lastReturnInfo?.benTra === 'BIEN_PHONG' && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-950 font-black">
                    Vi phạm R12: Nộp lại phải cấp Giấy phép mới (số GP cũ tự hủy)
                  </span>
                )}
              </div>
            </div>
          </div>

          {st === 'TRA_CHU_TAU' && ['CAPTAIN', 'ADMIN'].includes(currentUser.role) && (
            <button
              onClick={() => onNavigate('create-trip', trip.id)}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shrink-0 cursor-pointer shadow-sm"
            >
              Sửa hồ sơ &amp; Nộp lại ngay
            </button>
          )}
          {st === 'TRA_BQL_CANG' && ['PORT_STAFF', 'ADMIN'].includes(currentUser.role) && (
            <button
              onClick={() => onNavigate('port-inspect', trip.id)}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shrink-0 cursor-pointer shadow-sm"
            >
              Rà soát lại tại bến
            </button>
          )}
          {st === 'OFFICE_TRA_LAI' && ['OFFICER', 'ADMIN'].includes(currentUser.role) && (
            <button
              onClick={() => onNavigate('internal-workflow', trip.id)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shrink-0 cursor-pointer shadow-sm"
            >
              Xử lý trả lại Office
            </button>
          )}
        </div>
      )}

      {/* KHUNG THAO TÁC, 2 ĐỒNG HỒ SLA & TIẾN TRÌNH */}
      <div className="bg-white/95 p-5 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-4">
        <div className="p-4 bg-[#f4f8ff] rounded-2xl border border-[#dce8f7] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-[#526c93] font-bold">
            Vai trò hiện tại: <strong className="text-[#0d62e8] font-black">{currentUser.role}</strong>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {['CAPTAIN', 'ADMIN'].includes(currentUser.role) && ['NHAP', 'TRA_CHU_TAU'].includes(st) && (
              <button
                onClick={() => onNavigate('create-trip', trip.id)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                {st === 'TRA_CHU_TAU' ? 'Chỉnh sửa & Nộp lại' : 'Tiếp tục khai & Nộp'}
              </button>
            )}

            {canCaptainWithdraw && (
              <button
                type="button"
                onClick={() => setWithdrawModalOpen(true)}
                className="px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition"
              >
                <Trash2 className="w-4 h-4" />
                Rút hồ sơ
              </button>
            )}

            {['PORT_STAFF', 'ADMIN'].includes(currentUser.role) && ['CHO_KIEM_TRA', 'TRA_BQL_CANG'].includes(st) && (
              <button
                onClick={() => onNavigate('port-inspect', trip.id)}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer shadow-sm"
              >
                <ClipboardCheck className="w-4 h-4" />
                Kiểm tra bến (Phụ lục 01) &amp; Thông báo
              </button>
            )}

            {['OFFICER', 'ADMIN'].includes(currentUser.role) &&
              [
                'DA_CHAP_THUAN',
                'CHO_SO_XU_LY',
                'TAM_DUNG_THOI_TIET',
                'DA_DUYET',
                'DANG_TRINH_OFFICE',
                'OFFICE_TRA_LAI',
              ].includes(st) && (
                <button
                  onClick={() => onNavigate('internal-workflow', trip.id)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer shadow-sm"
                >
                  <Building2 className="w-4 h-4" />
                  Xử lý tại Sở &amp; Trình / Tải Office
                </button>
              )}

            {['BP_TRUC', 'BP_CHIHUY', 'ADMIN'].includes(currentUser.role) &&
              ['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG', 'DA_XUAT_BEN'].includes(st) && (
                <button
                  onClick={() => onNavigate('bp-daily-trips', trip.id)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer shadow-sm"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {st === 'DA_CAP_PHEP'
                    ? 'Kiểm soát Biên phòng tại bến'
                    : st === 'TAM_GIU_BIEN_PHONG'
                    ? 'Xử lý tạm giữ Biên phòng'
                    : 'Xác nhận tàu cập bến'}
                </button>
              )}

            {isPermitIssuedOrLater && (
              <button
                onClick={() => onNavigate('view-order', trip.id)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <FileCheck className="w-4 h-4" />
                Giấy phép điện tử &amp; Mã QR
              </button>
            )}

            {signedPdfUrl && (
              <a
                href={signedPdfUrl}
                target="_blank"
                rel="noreferrer"
                download={signedPdfName}
                className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer transition"
              >
                <Download className="w-4 h-4" />
                Tải PDF dấu đỏ (Office)
              </a>
            )}

            {['DA_CAP_PHEP', 'DA_CHAP_THUAN', 'CHO_SO_XU_LY'].includes(st) &&
              ['CAPTAIN', 'OFFICER', 'PORT_STAFF', 'ADMIN'].includes(currentUser.role) && (
                <button
                  onClick={() => setModModalOpen(true)}
                  className="px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  Biến động khách
                </button>
              )}

            <button
              onClick={() => setActiveTab('TIMELINE')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer border ${
                activeTab === 'TIMELINE'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-2xs'
              }`}
            >
              <GitBranch className={`w-4 h-4 ${activeTab === 'TIMELINE' ? 'text-white' : 'text-blue-600'}`} />
              <span>Cây thời gian</span>
            </button>
          </div>
        </div>

        {/* 2 ĐỒNG HỒ ĐO THỜI GIAN XỬ LÝ (BQL ≤60P & SỞ ≤60P) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs tabular-nums">
          <div
            className={`p-3.5 rounded-2xl border ${
              bqlClock.isRed
                ? 'bg-red-50 border-red-300 text-red-950'
                : bqlClock.isAmber
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span>Đồng hồ 1: BQL Cảng</span>
              <span className="text-[11px] font-black">
                Định mức ≤ {adminConfig.bqlProcessingSlaMinutes} phút
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-lg font-black">{formatClockDuration(bqlClock.netMinutes)}</span>
              <span className="text-[11px] font-bold">
                {bqlClock.isCompleted
                  ? '✓ Đã kết thúc'
                  : bqlClock.isPaused
                  ? '⏸ Đang tạm dừng'
                  : trip.submittedAt
                  ? '⏱ Đang chạy'
                  : 'Chưa nộp'}
              </span>
            </div>
            {bqlClock.pausedMinutes > 0 && (
              <p className="text-[10px] opacity-80 mt-0.5">
                Đã trừ {bqlClock.pausedMinutes} phút chờ Chủ tàu sửa hồ sơ
              </p>
            )}
          </div>

          <div
            className={`p-3.5 rounded-2xl border ${
              deptClock.isRed
                ? 'bg-red-50 border-red-300 text-red-950'
                : deptClock.isAmber
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span>Đồng hồ 2: Sở Xây dựng</span>
              <span className="text-[11px] font-black">
                Định mức ≤ {adminConfig.deptProcessingSlaMinutes} phút
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-lg font-black">{formatClockDuration(deptClock.netMinutes)}</span>
              <span className="text-[11px] font-bold">
                {deptClock.isCompleted
                  ? '✓ Đã cấp phép'
                  : deptClock.isPaused
                  ? '⏸ Đang tạm dừng'
                  : trip.approvalNotice?.issuedAt
                  ? '⏱ Đang chạy'
                  : 'Chưa tới Sở'}
              </span>
            </div>
            {deptClock.pausedMinutes > 0 && (
              <p className="text-[10px] opacity-80 mt-0.5">
                Đã trừ {deptClock.pausedMinutes} phút chờ bổ sung / tạm dừng thời tiết
              </p>
            )}
          </div>

          <div
            className={`p-3.5 rounded-2xl border ${
              officeUploadMinutes !== null && officeUploadMinutes > adminConfig.officeUploadSlaMinutes
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span>Đồng bộ Giấy phép từ Office</span>
              <span className="text-[11px] font-black">
                Ngưỡng ≤ {adminConfig.officeUploadSlaMinutes} phút
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-lg font-black">
                {officeUploadMinutes !== null ? `${officeUploadMinutes} phút` : '---'}
              </span>
              <span className="text-[11px] font-bold">
                {trip.issuedAt
                  ? officeUploadMinutes !== null && officeUploadMinutes > adminConfig.officeUploadSlaMinutes
                    ? '⚠ Tải lên chậm'
                    : '✓ Đúng hạn'
                  : 'Chưa phát hành'}
              </span>
            </div>
            {trip.orderValidUntil && (
              <p className="text-[10px] opacity-80 mt-0.5">
                Hiệu lực 24h tới: {formatDateTime(trip.orderValidUntil)}
              </p>
            )}
          </div>
        </div>

        {/* 5 CHẶNG QUY TRÌNH CHUẨN */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Chuỗi xử lý hồ sơ khép kín trực tuyến trên ứng dụng
            </p>
            <button
              onClick={() => setActiveTab('TIMELINE')}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Xem cây thời gian chi tiết</span>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
            {stageCards.map((sc) => (
              <div
                key={sc.num}
                onClick={() => setActiveTab('TIMELINE')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition hover:shadow-xs ${
                  sc.done
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                    : sc.active
                    ? 'bg-blue-50 border-blue-400 text-blue-950 font-black'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                    sc.done
                      ? 'bg-emerald-600 text-white'
                      : sc.active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {sc.num}
                </span>
                <span className="truncate max-w-full font-bold">{sc.title}</span>
                <span className="text-[10px] opacity-85 truncate max-w-full">{sc.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABS NỘI DUNG */}
      <div className="bg-white/95 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] overflow-hidden">
        <div className="flex border-b border-[#dce8f7] bg-[#f4f8ff] text-xs sm:text-sm font-bold overflow-x-auto">
          {[
            { id: 'OVERVIEW', label: 'Thông tin chung' },
            { id: 'TIMELINE', label: 'Cây thời gian' },
            { id: 'PASSENGERS', label: `Hành khách (${trip.passengerCount})` },
            { id: 'DOCUMENTS', label: `Giấy tờ & Phí (${trip.uploadedDocuments?.length || 0})` },
            { id: 'APPENDIX01', label: 'Kiểm tra BQL Cảng' },
            { id: 'RULES', label: 'Đánh giá R1 - R12' },
            { id: 'PHASES', label: 'SLA & Phê duyệt Office' },
            { id: 'LOGS', label: 'Nhật ký trạng thái' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3.5 px-4 sm:px-5 border-b-2 whitespace-nowrap cursor-pointer transition text-xs sm:text-sm ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700 bg-white font-black'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-7">
          {/* TAB 1: THÔNG TIN CHUNG */}
          {activeTab === 'OVERVIEW' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-4">
                <div className="p-4 sm:p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs sm:text-sm">
                    Phương tiện &amp; Luồng tuyến
                  </h3>
                  <div className="space-y-1.5 text-slate-700 text-sm">
                    <p>
                      Tên tàu: <strong className="text-slate-950 font-black text-base">{trip.vesselName}</strong>
                    </p>
                    <p>
                      Số đăng ký: <strong className="font-mono">{trip.vesselRegNumber}</strong> (VR-SB)
                    </p>
                    <p>
                      Tuyến: <strong className="text-slate-900">{trip.routeName}</strong>
                    </p>
                    <p>
                      Bến rời → Bến đến:{' '}
                      <strong className="text-slate-900">
                        {trip.departurePortName} → {trip.arrivalPortName}
                      </strong>
                    </p>
                    <p>
                      Dự kiến rời bến:{' '}
                      <strong className="text-slate-950">{formatDateTime(trip.scheduledDepartureTime)}</strong>
                    </p>
                    {trip.actualDepartureTime && (
                      <p className="text-emerald-800 font-bold">
                        Biên phòng cho xuất bến: {formatDateTime(trip.actualDepartureTime)}
                      </p>
                    )}
                    {trip.actualArrivalTime && (
                      <p className="text-blue-800 font-bold">
                        Xác nhận cập bến: {formatDateTime(trip.actualArrivalTime)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 sm:p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs sm:text-sm">
                    Hàng hóa, Phí &amp; Thiết bị cứu sinh
                  </h3>
                  <div className="space-y-1.5 text-slate-700 text-sm">
                    <p>
                      Khối lượng hàng hóa: <strong className="text-slate-950 font-black">{trip.cargoTons} tấn</strong>
                    </p>
                    <p>Mô tả hàng: {trip.cargoDescription || 'Không có hàng hóa đặc thù'}</p>
                    <p>
                      Áo phao thực tế:{' '}
                      <strong className="text-emerald-800 font-black">{trip.actualLifeJacketsReported} áo</strong> (Tối
                      thiểu: {trip.requiredLifeJackets} áo)
                    </p>
                    <p>
                      Mã giao dịch phí (R11):{' '}
                      <strong className="font-mono text-blue-800">
                        {trip.feeTransactionCode || 'Đính kèm ảnh/PDF biên lai'}
                      </strong>
                    </p>
                  </div>
                </div>

                {trip.bpDepartureControl && (
                  <div className="p-4 sm:p-5 bg-sky-50/70 rounded-xl border border-sky-200 space-y-2 text-xs">
                    <h3 className="font-black text-sky-950 uppercase tracking-wider">
                      Kiểm soát xuất bến cuối cùng ({bpConfig.unitDisplayName})
                    </h3>
                    <p>
                      Cán bộ kiểm soát: <strong>{trip.bpDepartureControl.controllerName || trip.bpDepartureControl.checkedByName}</strong> •{' '}
                      {formatDateTime(trip.bpDepartureControl.controlledAt || trip.bpDepartureControl.checkedAt)}
                    </p>
                    <p>
                      Quân số thực tế / Danh sách:{' '}
                      <strong>
                        {trip.bpDepartureControl.actualTotalPeople} / {trip.bpDepartureControl.scheduledTotalPeople}
                      </strong>{' '}
                      người
                    </p>
                    {trip.bpDepartureControl.unlistedPeople?.length > 0 && (
                      <p className="text-rose-800 font-bold">
                        Phát hiện {trip.bpDepartureControl.unlistedPeople.length} người ngoài danh sách (R12)
                      </p>
                    )}
                    {trip.arrivingConfirmation && (
                      <p className="text-emerald-800 font-bold">
                        Bến đến ({trip.arrivingConfirmation.portName}) xác nhận cập bến lúc{' '}
                        {formatDateTime(trip.arrivingConfirmation.confirmedAt)} bởi{' '}
                        {trip.arrivingConfirmation.confirmedByName}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    Danh sách thuyền viên trực ca ({trip.crewMembers.length})
                  </h3>
                  <div className="space-y-2">
                    {trip.crewMembers.map((cm, idx) => {
                      const crewRecord = crewCatalog.find((c) => c.id === cm.crewId);
                      const tripCrewDoc = trip.uploadedDocuments?.find(
                        (d) => d.category === 'CREW_CERTIFICATE' && (d.crewId === cm.crewId || (idx === 0 && !d.crewId))
                      );
                      const certAttachment = crewRecord?.certDocument || tripCrewDoc;
                      const hasRealFile = Boolean(
                        certAttachment?.storageKey || certAttachment?.previewUrl || certAttachment?.serverUrl
                      );

                      return (
                        <div
                          key={idx}
                          className="p-2.5 bg-white rounded-lg border border-slate-200 flex flex-wrap justify-between items-center gap-2"
                        >
                          <div>
                            <p className="font-bold text-slate-900">{cm.fullName}</p>
                            <p className="text-[11px] text-slate-500">
                              {cm.positionTitle} • Bằng: {cm.certNumber}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              Hạn: {cm.certExpireDate}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewDoc({
                                  categoryName: `Chứng chỉ chuyên môn: ${cm.fullName}`,
                                  badgeText: cm.positionTitle,
                                  fileName: certAttachment?.fileName,
                                  fileType: certAttachment?.fileType,
                                  fileSize: certAttachment?.fileSize,
                                  uploadedAt: certAttachment?.uploadedAt,
                                  uploadedByName: crewRecord?.certDocument?.uploadedByName,
                                  note: certAttachment?.note,
                                  previewUrl: certAttachment?.previewUrl,
                                  storageKey: certAttachment?.storageKey,
                                  serverUrl: certAttachment?.serverUrl,
                                  metadata: [
                                    { label: 'Thuyền viên', value: cm.fullName },
                                    { label: 'Chức danh', value: cm.positionTitle },
                                    { label: 'Số bằng', value: cm.certNumber },
                                    { label: 'Ngày hết hạn', value: cm.certExpireDate },
                                  ],
                                })
                              }
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                                hasRealFile
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                              }`}
                            >
                              <Eye className="w-3 h-3" />
                              <span>{hasRealFile ? 'Xem PDF/Ảnh' : 'Xem CC'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    Thông báo chấp thuận &amp; Phát hành Giấy phép Office
                  </h3>
                  <div className="space-y-1 text-slate-700">
                    <p>
                      Người nộp hồ sơ: <strong>{trip.createdByName}</strong>
                    </p>
                    {trip.approvalNotice && (
                      <p>
                        Thông báo BQL Cảng: <strong className="font-mono">{trip.approvalNotice.noticeNumber}</strong> (
                        {formatDateTime(trip.approvalNotice.issuedAt)})
                      </p>
                    )}
                    <p>
                      Phê duyệt &amp; Ký phát hành:{' '}
                      <strong>{trip.approvedByName || 'Lãnh đạo Sở Xây dựng (Office)'}</strong>
                    </p>
                    {trip.issuedAt && (
                      <p>
                        Thời điểm cấp Giấy phép: <strong>{formatDateTime(trip.issuedAt)}</strong>
                      </p>
                    )}
                    {trip.supersededOrderNumbers && trip.supersededOrderNumbers.length > 0 && (
                      <p className="text-rose-700 font-semibold">
                        Số GP cũ đã hủy (R12): <span className="font-mono">{trip.supersededOrderNumbers.join(', ')}</span>
                      </p>
                    )}
                    <p>
                      Mã xác thực QR: <span className="font-mono text-slate-900">{trip.verificationCode}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CÂY THỜI GIAN */}
          {activeTab === 'TIMELINE' && <TripTimelineTree trip={trip} viewerRole={currentUser.role} />}

          {/* TAB 3: DANH SÁCH HÀNH KHÁCH (CHE PII MẶC ĐỊNH THEO NĐ 356/2025/NĐ-CP) */}
          {activeTab === 'PASSENGERS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                <div>
                  <p className="text-slate-700">
                    Tổng số hành khách: <strong className="text-slate-950">{trip.passengers.length} người</strong>
                  </p>
                  {!canSeeFullPassengerPii && (
                    <p className="text-[11px] text-amber-800 font-semibold mt-0.5">
                      Bảo vệ dữ liệu cá nhân (Nghị định 356/2025/NĐ-CP): Tên viết tắt và số CCCD/SĐT đang được che.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isBienPhongUser && !paxUnlocked && (
                    <button
                      type="button"
                      onClick={() => setShowUnlockPaxModal(true)}
                      className="px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Xem đầy đủ (Rà soát tại bến)
                    </button>
                  )}
                  {currentUser.role !== 'CAPTAIN' && (
                    <button
                      type="button"
                      onClick={() => exportPassengersToExcel(trip)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Xuất Excel
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b">
                    <tr>
                      <th className="py-2.5 px-3">STT</th>
                      <th className="py-2.5 px-3">Họ và tên</th>
                      <th className="py-2.5 px-3">Năm sinh / Giới tính</th>
                      <th className="py-2.5 px-3">Số CCCD / Hộ chiếu</th>
                      <th className="py-2.5 px-3">Số điện thoại</th>
                      <th className="py-2.5 px-3">Địa chỉ cư trú</th>
                      <th className="py-2.5 px-3">Quốc tịch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trip.passengers.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {canSeeFullPassengerPii ? p.fullName : maskFullNameInitials(p.fullName)}
                        </td>
                        <td className="py-2.5 px-3">
                          {p.birthYear} ({p.gender === 'NAM' ? 'Nam' : 'Nữ'})
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {canSeeFullPassengerPii ? p.idNumber : maskIdNumber(p.idNumber)}
                        </td>
                        <td className="py-2.5 px-3">
                          {canSeeFullPassengerPii ? p.phone : maskPhone(p.phone)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {canSeeFullPassengerPii ? p.address : 'Đã ẩn theo NĐ 356/2025/NĐ-CP'}
                        </td>
                        <td className="py-2.5 px-3">
                          {p.isForeigner ? (
                            <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                              {p.nationality}
                            </span>
                          ) : (
                            'Việt Nam'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: GIẤY TỜ ĐÍNH KÈM & SERVER ARCHIVE */}
          {activeTab === 'DOCUMENTS' && (
            <div className="space-y-5 text-xs">
              <div className="bg-gradient-to-br from-[#f4f8ff] to-white rounded-2xl border border-[#cfe0f5] p-4 sm:p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#dce8f7] pb-3">
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-extrabold text-[#07244d] text-sm flex items-center gap-2">
                      <Server className="w-4 h-4 text-[#0d62e8] shrink-0" />
                      <span>
                        Thư mục hồ sơ trên Server: <span className="font-mono text-[#0d62e8]">{trip.tripNumber}</span>
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-600 break-all">
                      Đường dẫn Server:{' '}
                      <code className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-800">
                        {serverArchive?.folderPath || `data/ho-so-chuyen/${trip.tripNumber}`}
                      </code>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isSyncingServer}
                      onClick={async () => {
                        setIsSyncingServer(true);
                        setServerActionNotice(null);
                        try {
                          const linkedIncoming = repository
                            .getIncomingDossiers()
                            .find((d) => d.tripId === trip.id || d.tripNumber === trip.tripNumber);
                          const res = await dossierArchiveService.syncTripToServer(trip, {
                            incomingDossier: linkedIncoming || null,
                            actorName: currentUser.fullName,
                            syncPendingAttachments: true,
                          });
                          if (res.dossier) {
                            setServerArchive(res.dossier);
                            repository.saveTrip({ ...trip });
                            setServerActionNotice({
                              type: 'success',
                              text: `Đã đồng bộ hồ sơ ${trip.tripNumber} lên Server${
                                res.uploadedCount > 0 ? ` (kèm ${res.uploadedCount} tệp đính kèm)` : ''
                              }.`,
                            });
                          } else {
                            setServerActionNotice({
                              type: 'error',
                              text: 'Chưa thể kết nối phiên máy chủ. Vui lòng đăng nhập hợp lệ để đồng bộ.',
                            });
                          }
                        } catch (err: any) {
                          setServerActionNotice({
                            type: 'error',
                            text: err?.message || 'Lỗi khi đồng bộ hồ sơ lên Server.',
                          });
                        } finally {
                          setIsSyncingServer(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-[#0d62e8] hover:bg-[#084fc0] disabled:opacity-60 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                    >
                      {isSyncingServer ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{isSyncingServer ? 'Đang đồng bộ...' : 'Đồng bộ lên Server'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={serverUploadFolder}
                        onChange={(e) => setServerUploadFolder(e.target.value as ServerDossierSubFolder)}
                        className="px-2 py-1.5 border border-slate-300 rounded-xl bg-white text-[11px] font-bold text-slate-700"
                      >
                        <option value="giay-to">Thư mục: giay-to/</option>
                        <option value="lenh-cap-phep">Thư mục: lenh-cap-phep/</option>
                      </select>
                      <input
                        ref={serverFileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setIsUploadingServerFile(true);
                          setServerActionNotice(null);
                          try {
                            const saved = await dossierArchiveService.uploadBlobToDossier(
                              trip.tripNumber,
                              serverUploadFolder,
                              file,
                              {
                                fileName: file.name,
                                mimeType: file.type,
                                category: serverUploadFolder === 'lenh-cap-phep' ? 'ISSUED_ORDER_PDF' : 'OTHER',
                                categoryName:
                                  serverUploadFolder === 'lenh-cap-phep'
                                    ? 'Giấy phép rời cảng có dấu đỏ (Office)'
                                    : 'Giấy tờ hồ sơ bổ sung',
                                uploadedByName: currentUser.fullName,
                              }
                            );
                            if (
                              serverUploadFolder === 'giay-to' &&
                              (saved.mimeType === 'application/pdf' || saved.mimeType.startsWith('image/'))
                            ) {
                              const nextDocs = [
                                ...(trip.uploadedDocuments || []),
                                {
                                  id: saved.id,
                                  category: 'OTHER' as const,
                                  categoryName: 'Giấy tờ lưu trên Server',
                                  fileName: saved.originalFileName,
                                  fileType: (saved.mimeType === 'application/pdf' ? 'PDF' : 'IMAGE') as 'PDF' | 'IMAGE',
                                  fileSize: `${Math.max(1, Math.round(saved.sizeBytes / 1024))} KB`,
                                  uploadedAt: new Date().toLocaleDateString('vi-VN'),
                                  serverUrl: saved.downloadUrl,
                                  serverPath: saved.relativePath,
                                  serverStoredName: saved.storedFileName,
                                  mimeType: saved.mimeType,
                                  note: `Tải trực tiếp vào thư mục ${trip.tripNumber}/giay-to`,
                                },
                              ];
                              repository.saveTrip({ ...trip, uploadedDocuments: nextDocs });
                            } else if (serverUploadFolder === 'lenh-cap-phep') {
                              repository.saveTrip({
                                ...trip,
                                issuedPdfUrl: saved.downloadUrl,
                                issuedPdfName: saved.storedFileName,
                                issuedPdfServerPath: saved.relativePath,
                              });
                            }
                            await loadServerArchive(trip.tripNumber);
                            setServerActionNotice({
                              type: 'success',
                              text: `Đã lưu tệp "${saved.storedFileName}" vào thư mục ${saved.relativePath}`,
                            });
                          } catch (err: any) {
                            setServerActionNotice({
                              type: 'error',
                              text: err?.message || 'Không thể tải tệp lên thư mục Server.',
                            });
                          } finally {
                            setIsUploadingServerFile(false);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={isUploadingServerFile}
                        onClick={() => serverFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition"
                      >
                        {isUploadingServerFile ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>Tải tệp lên Server</span>
                      </button>
                    </div>
                  </div>
                </div>

                {serverActionNotice && (
                  <div
                    className={`p-2.5 rounded-xl border text-xs font-semibold ${
                      serverActionNotice.type === 'error'
                        ? 'bg-red-50 border-red-200 text-red-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    {serverActionNotice.text}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-slate-800">ho-so-chuyen.json</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        serverArchive?.hasTripJson
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {serverArchive?.hasTripJson ? '✓ Đã lưu' : 'Chưa đồng bộ'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-slate-800">giay-to/</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                      {serverArchive?.files.filter((f) => f.subFolder === 'giay-to').length || 0} tệp
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-slate-800">lenh-cap-phep/</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">
                      {serverArchive?.files.filter((f) => f.subFolder === 'lenh-cap-phep').length || 0} tệp
                      {serverArchive?.hasOrderInfoJson ? ' + JSON' : ''}
                    </span>
                  </div>
                </div>

                {isLoadingServerArchive ? (
                  <div className="py-4 text-center text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Đang đọc danh sách tệp trong thư mục Server...</span>
                  </div>
                ) : serverArchive && serverArchive.files.length > 0 ? (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden">
                    {serverArchive.files.map((srvFile: ServerArchivedFile) => {
                      const canPreviewInline =
                        srvFile.mimeType === 'application/pdf' || srvFile.mimeType.startsWith('image/');
                      return (
                        <div
                          key={srvFile.relativePath}
                          className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  srvFile.subFolder === 'lenh-cap-phep'
                                    ? 'bg-teal-100 text-teal-900'
                                    : 'bg-blue-100 text-blue-900'
                                }`}
                              >
                                {srvFile.subFolder}/
                              </span>
                              <span className="font-bold text-slate-900 truncate">{srvFile.originalFileName}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              Lưu tại: <code className="font-mono">{srvFile.relativePath}</code> •{' '}
                              {Math.max(1, Math.round(srvFile.sizeBytes / 1024))} KB
                              {srvFile.uploadedByName ? ` • Bởi: ${srvFile.uploadedByName}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {canPreviewInline && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewDoc({
                                    categoryName: srvFile.categoryName || srvFile.subFolder,
                                    badgeText: `Server: ${srvFile.subFolder}/`,
                                    fileName: srvFile.originalFileName,
                                    fileType: srvFile.mimeType === 'application/pdf' ? 'PDF' : 'IMAGE',
                                    fileSize: `${Math.max(1, Math.round(srvFile.sizeBytes / 1024))} KB`,
                                    uploadedAt: formatDateTime(srvFile.uploadedAt),
                                    uploadedByName: srvFile.uploadedByName,
                                    note: srvFile.note,
                                    serverUrl: srvFile.downloadUrl,
                                  })
                                }
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                dossierArchiveService.downloadServerFile(
                                  srvFile.downloadUrl,
                                  srvFile.originalFileName
                                )
                              }
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Tải về</span>
                            </button>
                            {['ADMIN', 'OFFICER', 'DEPT_HEAD'].includes(currentUser.role) && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await dossierArchiveService.deleteDossierFile(
                                    trip.tripNumber,
                                    srvFile.subFolder,
                                    srvFile.storedFileName
                                  );
                                  if (ok) {
                                    await loadServerArchive(trip.tripNumber);
                                  }
                                }}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Xóa tệp trên Server"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-600 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      Thư mục <strong className="font-mono">{trip.tripNumber}</strong> trên Server chưa có tệp đính kèm nhị phân.
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-blue-600" />
                    Giấy tờ &amp; Chứng từ nộp phí điện tử đính kèm
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Bao gồm chứng chỉ phương tiện, chứng chỉ thuyền viên và ủy nhiệm chi / biên lai phí rời cảng (R11).
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {trip.uploadedDocuments?.length || 0} tài liệu
                </span>
              </div>

              {!trip.uploadedDocuments || trip.uploadedDocuments.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-700 font-bold">Chưa có tệp chứng từ đính kèm</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {trip.uploadedDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-blue-400 transition shadow-2xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            {doc.categoryName}
                          </span>
                          <span className="text-[10px] text-slate-400">{doc.fileSize}</span>
                        </div>
                        <p className="font-bold text-slate-900 text-xs mt-2 truncate" title={doc.fileName}>
                          {doc.fileName}
                        </p>
                        {doc.note && <p className="text-[11px] text-slate-500 mt-1 italic">Ghi chú: {doc.note}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">Tải lên: {formatDateTime(doc.uploadedAt)}</p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Xem tài liệu
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: KIỂM TRA TẠI BẾN (BQL CẢNG - 8 NHÓM) */}
          {activeTab === 'APPENDIX01' && (
            <div className="space-y-4 text-xs">
              {!trip.portInspection ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <ClipboardCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-600 font-semibold">Chưa lập biên bản kiểm tra tại bến (BQL Cảng)</p>
                  {['PORT_STAFF', 'ADMIN'].includes(currentUser.role) &&
                    ['CHO_KIEM_TRA', 'TRA_BQL_CANG'].includes(st) && (
                      <button
                        onClick={() => onNavigate('port-inspect', trip.id)}
                        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold cursor-pointer"
                      >
                        Tiến hành kiểm tra ngay
                      </button>
                    )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap justify-between items-center gap-2">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">
                        Kết luận BQL Cảng:{' '}
                        {trip.portInspection.conclusion === 'ELIGIBLE' ? (
                          <span className="text-emerald-700">CHẤP THUẬN ĐỦ ĐIỀU KIỆN</span>
                        ) : (
                          <span className="text-red-700">KHÔNG CHẤP THUẬN (ĐÓNG HỒ SƠ)</span>
                        )}
                      </p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Kiểm tra bởi: <strong>{trip.portInspection.inspectorName}</strong> • Thời điểm:{' '}
                        {formatDateTime(trip.portInspection.inspectedAt)}
                        {trip.approvalNotice?.noticeNumber ? ` • Số TB: ${trip.approvalNotice.noticeNumber}` : ''}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        trip.portInspection.conclusion === 'ELIGIBLE'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      {trip.portInspection.conclusion === 'ELIGIBLE' ? '✓ Chấp thuận' : '✕ Không chấp thuận'}
                    </span>
                  </div>

                  {trip.portInspection.checklistItems && trip.portInspection.checklistItems.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {trip.portInspection.checklistItems.map((it) => (
                        <div
                          key={it.itemId}
                          className="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center gap-2"
                        >
                          <div>
                            <span className="text-[10px] font-bold text-blue-700 uppercase block">{it.groupTitle}</span>
                            <span className="font-medium text-slate-800">{it.label}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] shrink-0 ${
                              it.status === 'DAT'
                                ? 'bg-emerald-100 text-emerald-800'
                                : it.status === 'KHONG_DAT'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {it.status === 'DAT' ? 'ĐẠT' : it.status === 'KHONG_DAT' ? 'KHÔNG ĐẠT' : 'K/ÁP DỤNG'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { name: '1. Giấy tờ đăng kiểm & GP hoạt động', ok: trip.portInspection.checkVesselDocuments },
                        { name: '2. Bằng, chứng chỉ thuyền viên', ok: trip.portInspection.checkCrewCertificates },
                        {
                          name: '3. Kiểm đếm số lượng người thực tế',
                          ok: trip.portInspection.checkActualPassengers,
                          val: `${trip.portInspection.actualPassengerCount} người`,
                        },
                        {
                          name: '4. Xếp dỡ, chằng buộc hàng hóa',
                          ok: trip.portInspection.checkCargoSafety,
                          val: `${trip.portInspection.actualCargoTons} tấn`,
                        },
                        {
                          name: '5. Áo phao và thiết bị cứu sinh',
                          ok: trip.portInspection.checkLifeSavingEquip,
                          val: `${trip.portInspection.actualLifeJackets} áo`,
                        },
                        { name: '6. Trang thiết bị PCCC', ok: trip.portInspection.checkFireSafety },
                        {
                          name: '7. Điều kiện thời tiết tại bến',
                          ok: trip.portInspection.checkWeatherCondition,
                          val: `Gió cấp ${trip.portInspection.currentWindForce}`,
                        },
                        {
                          name: '8. Chứng từ nộp phí rời cảng',
                          ok: trip.portInspection.feeVerified !== false,
                        },
                      ].map((item, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center">
                          <span className="font-medium text-slate-800">{item.name}</span>
                          <div className="flex items-center gap-2">
                            {item.val && <span className="font-bold text-slate-900">{item.val}</span>}
                            <span className={item.ok ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                              {item.ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {trip.portInspection.notes && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="font-bold text-slate-800">Ghi chú hiện trường:</p>
                      <p className="text-slate-600">{trip.portInspection.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: ĐÁNH GIÁ R1 - R12 */}
          {activeTab === 'RULES' && (
            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Toàn bộ 12 quy tắc kiểm tra nghiệp vụ R1–R12 được áp dụng xuyên suốt từ lúc nộp hồ sơ đến lúc Biên phòng kiểm soát cuối cùng:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trip.rulesCheckResults.map((r) => (
                  <div
                    key={r.ruleCode}
                    className={`p-3 rounded-xl border ${
                      r.status === 'FAILED'
                        ? 'bg-red-50 border-red-200 text-red-950'
                        : r.status === 'WARNING'
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">
                        [{r.ruleCode}] {r.ruleName}
                      </span>
                      <span className="font-extrabold uppercase text-[10px]">
                        {r.status === 'PASSED' ? 'ĐẠT' : r.status === 'WARNING' ? 'CẢNH BÁO' : 'VI PHẠM'}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-90">{r.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: SLA & PHÊ DUYỆT OFFICE */}
          {activeTab === 'PHASES' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h3 className="font-black text-slate-900">1. Đồng hồ BQL Cảng (Định mức ≤ {adminConfig.bqlProcessingSlaMinutes} phút)</h3>
                <p>
                  Thời gian xử lý thực tế (đã trừ tạm dừng chờ Chủ tàu):{' '}
                  <strong className="text-sm">{formatClockDuration(bqlClock.netMinutes)}</strong> • Tạm dừng:{' '}
                  <strong>{bqlClock.pausedMinutes} phút</strong>
                </p>
                {trip.approvalNotice && (
                  <p className="text-emerald-800 font-semibold">
                    ✓ Đã cấp Thông báo chấp thuận số {trip.approvalNotice.noticeNumber} lúc{' '}
                    {formatDateTime(trip.approvalNotice.issuedAt)} ({trip.approvalNotice.issuerName})
                  </p>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h3 className="font-black text-slate-900">2. Đồng hồ Sở Xây dựng &amp; Quy trình Office (Định mức ≤ {adminConfig.deptProcessingSlaMinutes} phút)</h3>
                <p>
                  Thời gian xử lý thực tế (đã trừ chờ Chủ tàu / BQL / Thời tiết):{' '}
                  <strong className="text-sm">{formatClockDuration(deptClock.netMinutes)}</strong> • Tạm dừng:{' '}
                  <strong>{deptClock.pausedMinutes} phút</strong>
                </p>
                {trip.weatherCheckRecord && (
                  <p>
                    • Kiểm tra thời tiết (R7): Gió cấp {trip.weatherCheckRecord.windForceBeaufort}, sóng{' '}
                    {trip.weatherCheckRecord.waveHeightMeters}m ({trip.weatherCheckRecord.checkedByName} •{' '}
                    {formatDateTime(trip.weatherCheckRecord.checkedAt)})
                  </p>
                )}
                {trip.officeSubmissionRecord?.draftApprovedAt && (
                  <p>
                    • Chuyên viên duyệt dự thảo: {trip.officeSubmissionRecord.draftApprovedByName} (
                    {formatDateTime(trip.officeSubmissionRecord.draftApprovedAt)})
                  </p>
                )}
                {(trip.officeSubmissionRecord?.submittedToOfficeAt || trip.officeSubmissionRecord?.submittedAt) && (
                  <p>
                    • Trình ký văn bản trên Office: {trip.officeSubmissionRecord.submittedByName} (
                    {formatDateTime(
                      trip.officeSubmissionRecord.submittedToOfficeAt || trip.officeSubmissionRecord.submittedAt
                    )}
                    )
                  </p>
                )}
                {trip.officeSubmissionRecord?.returns && trip.officeSubmissionRecord.returns.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                    <p className="font-bold text-amber-950">Lịch sử Office trả lại ({trip.officeSubmissionRecord.returns.length}):</p>
                    {trip.officeSubmissionRecord.returns.map((ret, idx) => (
                      <p key={idx} className="text-amber-900">
                        - {ret.returnerRole} trả lúc {formatDateTime(ret.returnedAt)} ({ret.nhomLoi === 'loi_xu_ly' ? 'Lỗi xử lý' : 'Lỗi hồ sơ'}): {ret.reason}
                      </p>
                    ))}
                  </div>
                )}
                {trip.issuedAt && (
                  <p className="text-emerald-800 font-semibold">
                    ✓ Đã tải Giấy phép có dấu đỏ lên hệ thống lúc {formatDateTime(trip.issuedAt)}
                    {officeUploadMinutes !== null ? ` (độ trễ tải lên: ${officeUploadMinutes} phút / định mức ${adminConfig.officeUploadSlaMinutes}p)` : ''}
                  </p>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <h3 className="font-black text-slate-900">3. Biên phòng kiểm soát cuối cùng &amp; Cập bến</h3>
                {trip.bpDepartureControl ? (
                  <p>
                    ✓ Đã kiểm soát lúc{' '}
                    {formatDateTime(trip.bpDepartureControl.controlledAt || trip.bpDepartureControl.checkedAt)} • Kết quả:{' '}
                    <strong>{trip.bpDepartureControl.action || trip.bpDepartureControl.decision}</strong>
                  </p>
                ) : (
                  <p className="text-slate-500">Chưa đến bước Biên phòng kiểm soát xuất bến (chỉ thực hiện sau khi đã cấp Giấy phép).</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 8: NHẬT KÝ CHUYỂN TRẠNG THÁI */}
          {activeTab === 'LOGS' && (
            <div className="space-y-3 text-xs">
              <p className="text-slate-500">Toàn bộ diễn biến thay đổi trạng thái hồ sơ được lưu vết không sửa xóa:</p>
              <div className="border-l-2 border-blue-500 pl-4 space-y-4">
                {trip.statusLogs.map((log, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <p className="font-bold text-slate-900">
                      Chuyển sang: <span className="text-blue-700">{getStatusInfo(log.toStatus).label}</span>
                      {log.milestone && (
                        <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                          {getStatusMilestoneLabel(log.milestone)}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Thực hiện bởi: <strong>{log.changedByName}</strong> • Thời điểm: {formatDateTime(log.changedAt)}
                    </p>
                    {log.reason && <p className="text-slate-700 italic mt-0.5">"{log.reason}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL RÚT HỒ SƠ TRƯỚC KHI CẤP PHÉP */}
      {withdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <h3 className="font-black text-base text-slate-900">Xác nhận rút hồ sơ {trip.tripNumber}</h3>
            <p className="text-slate-600">
              Chủ tàu được quyền rút hồ sơ trước khi Giấy phép rời cảng được phát hành. Hồ sơ sau khi rút sẽ chuyển sang trạng thái <strong>Đã rút hồ sơ</strong>.
            </p>
            <div>
              <label className="block font-bold mb-1">Lý do rút hồ sơ:</label>
              <textarea
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                rows={3}
                placeholder="VD: Tàu hủy chuyến do thay đổi kế hoạch khai thác..."
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWithdrawModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleWithdrawDossier}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black cursor-pointer"
              >
                Xác nhận rút hồ sơ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BIÊN PHÒNG MỞ KHÓA THÔNG TIN HÀNH KHÁCH */}
      {showUnlockPaxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <h3 className="font-black text-base text-slate-900">Xem đầy đủ dữ liệu cá nhân hành khách</h3>
            <p className="text-slate-600">
              Theo Nghị định 356/2025/NĐ-CP về bảo vệ dữ liệu cá nhân, vui lòng nhập lý do nghiệp vụ để ghi vào Nhật ký truy cập dữ liệu cá nhân.
            </p>
            <textarea
              value={unlockPaxReason}
              onChange={(e) => setUnlockPaxReason(e.target.value)}
              rows={3}
              placeholder="VD: Đối chiếu CCCD hành khách trước khi cho tàu xuất bến tại cầu cảng..."
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnlockPaxModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={unlockPaxReason.trim().length < 5}
                onClick={handleUnlockPassengerPii}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-black cursor-pointer"
              >
                Xác nhận xem đầy đủ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NGOẠI LỆ: BIẾN ĐỘNG HÀNH KHÁCH */}
      {modModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <h3 className="font-bold text-base text-slate-900">Biến động hành khách</h3>
            <p className="text-slate-600">
              Quy định: Thêm khách phải bảo đảm kiểm tra lại quy tắc R3 (sức chở) và R9 (áo phao), đồng thời cập nhật trước khi Biên phòng kiểm soát cuối cùng.
            </p>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="radio"
                  name="modAction"
                  checked={modAction === 'REMOVE'}
                  onChange={() => setModAction('REMOVE')}
                />
                Bớt hành khách
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="radio"
                  name="modAction"
                  checked={modAction === 'ADD'}
                  onChange={() => setModAction('ADD')}
                />
                Thêm hành khách
              </label>
            </div>

            <div>
              <label className="block font-semibold mb-1">Tên hành khách:</label>
              <input
                type="text"
                value={paxNameToMod}
                onChange={(e) => setPaxNameToMod(e.target.value)}
                placeholder="Nhập họ tên hành khách..."
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Lý do thay đổi (*):</label>
              <textarea
                value={paxReason}
                onChange={(e) => setPaxReason(e.target.value)}
                placeholder="VD: Khách xin hoãn chuyến sau..."
                className="w-full p-2 border border-slate-300 rounded-lg"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleModifyPassenger}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold cursor-pointer"
              >
                Xác nhận thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.categoryName || previewDoc?.fileName || 'Tài liệu đính kèm'}
        badgeText={previewDoc?.badgeText}
        fileName={previewDoc?.fileName}
        fileType={previewDoc?.fileType}
        fileSize={previewDoc?.fileSize}
        uploadedAt={previewDoc?.uploadedAt}
        uploadedByName={previewDoc?.uploadedByName}
        note={previewDoc?.note}
        previewUrl={previewDoc?.previewUrl}
        storageKey={previewDoc?.storageKey}
        serverUrl={previewDoc?.serverUrl}
        metadata={previewDoc?.metadata}
      />

      {showLiftBpModal && (
        <BpLiftStopModal
          isOpen={showLiftBpModal}
          stopRecord={activeBpStop ?? null}
          tripId={trip.id}
          tripNumber={trip.tripNumber}
          vesselName={trip.vesselName}
          actor={currentUser}
          onClose={() => setShowLiftBpModal(false)}
          onSuccess={() => {
            setShowLiftBpModal(false);
            setActionNotice({
              type: 'success',
              text: 'Đã gỡ tạm giữ thành công và mở lại trạng thái Đã cấp Giấy phép.',
            });
          }}
        />
      )}
    </div>
  );
};
