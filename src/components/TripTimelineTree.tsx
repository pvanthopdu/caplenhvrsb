/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TripRecord, UserRole } from '../types';
import { repository } from '../services/repository';
import { normalizeStatus } from '../utils/userPermissions';
import {
  getStatusInfo,
  formatDateTime,
  formatTime,
  formatClockDuration,
  getStatusMilestoneLabel,
  getReturnPartyLabel,
  getReturnScopeLabel,
} from '../utils/formatters';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileText,
  Stamp,
  Ship,
  Anchor,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Check,
  Maximize2,
  Minimize2,
  Calendar,
} from 'lucide-react';

interface TripTimelineTreeProps {
  trip: TripRecord;
  className?: string;
  defaultExpanded?: boolean;
  viewerRole?: UserRole;
}

export const TripTimelineTree: React.FC<TripTimelineTreeProps> = ({
  trip,
  className = '',
  defaultExpanded = true,
  viewerRole,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    step1: defaultExpanded,
    step2: defaultExpanded,
    step3: defaultExpanded,
    step4: defaultExpanded,
    step5: defaultExpanded,
  });

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: !prev[nodeKey],
    }));
  };

  const expandAll = () => {
    setExpandedNodes({ step1: true, step2: true, step3: true, step4: true, step5: true });
  };

  const collapseAll = () => {
    setExpandedNodes({ step1: false, step2: false, step3: false, step4: false, step5: false });
  };

  const status = normalizeStatus(trip.status);
  const statusInfo = getStatusInfo(status);
  const bqlClock = repository.computeBqlClockMinutes(trip);
  const deptClock = repository.computeDeptClockMinutes(trip);

  const calculateProgress = (): number => {
    switch (status) {
      case 'NHAP':
        return 10;
      case 'CHO_KIEM_TRA':
        return 25;
      case 'TRA_CHU_TAU':
        return 20;
      case 'KHONG_CHAP_THUAN':
      case 'DA_RUT':
      case 'THU_HOI':
      case 'HET_HIEU_LUC':
        return 50;
      case 'DA_CHAP_THUAN':
      case 'CHO_SO_XU_LY':
        return 48;
      case 'TRA_BQL_CANG':
        return 35;
      case 'TAM_DUNG_THOI_TIET':
        return 50;
      case 'DA_DUYET':
        return 62;
      case 'DANG_TRINH_OFFICE':
        return 75;
      case 'OFFICE_TRA_LAI':
        return 60;
      case 'DA_CAP_PHEP':
        return 85;
      case 'TAM_GIU_BIEN_PHONG':
        return 82;
      case 'DA_XUAT_BEN':
        return 92;
      case 'DA_CAP_BEN':
        return 100;
      default:
        return 20;
    }
  };

  const progressPercent = calculateProgress();

  const isStep1Done = status !== 'NHAP';
  const isStep2Done = [
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
    'THU_HOI',
    'HET_HIEU_LUC',
  ].includes(status);
  const isStep2Rejected = status === 'KHONG_CHAP_THUAN' || status === 'TRA_CHU_TAU' || status === 'TRA_BQL_CANG';
  const isStep2InProgress = status === 'CHO_KIEM_TRA';

  const isStep3Done = [
    'DA_CAP_PHEP',
    'TAM_GIU_BIEN_PHONG',
    'DA_XUAT_BEN',
    'DA_CAP_BEN',
    'THU_HOI',
    'HET_HIEU_LUC',
  ].includes(status);
  const isStep3InProgress = [
    'DA_CHAP_THUAN',
    'CHO_SO_XU_LY',
    'TAM_DUNG_THOI_TIET',
    'DA_DUYET',
    'DANG_TRINH_OFFICE',
    'OFFICE_TRA_LAI',
  ].includes(status);

  const isStep4Done = status === 'DA_XUAT_BEN' || status === 'DA_CAP_BEN';
  const isStep4Held = status === 'TAM_GIU_BIEN_PHONG';
  const isStep4InProgress = status === 'DA_CAP_PHEP';

  const isStep5Done = status === 'DA_CAP_BEN';
  const isStep5InProgress = status === 'DA_XUAT_BEN';

  const initialLog = trip.statusLogs[0];
  const submissionTime = trip.submittedAt || initialLog?.changedAt || trip.createdDate;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* THANH TỔNG QUAN TIẾN ĐỘ & 2 ĐỒNG HỒ SLA */}
      <div className="bg-gradient-to-r from-[#065fd4] via-[#0c74e8] to-[#1a8df5] text-white p-5 sm:p-6 rounded-[22px] shadow-[0_14px_34px_-10px_rgba(10,92,212,0.34)] border border-white/25">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/20 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                {trip.tripNumber}
              </span>
              {trip.orderNumber && (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#daf5e7] text-[#0c7a45] border border-[#a9e4c5]">
                  GP: {trip.orderNumber}
                </span>
              )}
              <span
                className={`text-xs font-bold px-3 py-0.5 rounded-full border ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.badgeBorder}`}
              >
                {statusInfo.label}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <Ship className="w-5 h-5 text-[#fde68a]" />
              Tiến độ xử lý: Tàu {trip.vesselName} ({trip.vesselRegNumber})
            </h2>
            <p className="text-xs text-blue-100 mt-1">
              Tuyến: {trip.routeName} ({trip.departurePortName} → {trip.arrivalPortName}) • Dự kiến rời:{' '}
              {formatDateTime(trip.scheduledDepartureTime)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={expandAll}
              className="px-3.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-full text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-white/25"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Mở rộng</span>
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-3.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-full text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-white/25"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Thu gọn</span>
            </button>
          </div>
        </div>

        <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3 tabular-nums">
          <div className="md:col-span-1 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-blue-50 font-semibold">Tiến độ toàn quy trình</span>
              <span className="font-mono font-bold text-[#fde68a]">{progressPercent}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/25">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isStep2Rejected || isStep4Held
                    ? 'bg-rose-400'
                    : progressPercent === 100
                    ? 'bg-emerald-300'
                    : 'bg-gradient-to-r from-[#fbbf24] to-[#fde68a]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="bg-white/15 border border-white/25 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-blue-100 font-bold">Đồng hồ 1 · BQL Cảng (ĐM 60p)</p>
              <p className="font-bold text-white mt-0.5">
                {formatClockDuration(bqlClock.netMinutes)}
                {bqlClock.isPaused && ' (Đang dừng)'}
              </p>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                bqlClock.isRed
                  ? 'bg-red-500 text-white'
                  : bqlClock.isAmber
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-emerald-400 text-slate-900'
              }`}
            >
              {bqlClock.isRed ? 'Vượt 60p' : bqlClock.isAmber ? '>45p' : 'Đạt'}
            </span>
          </div>

          <div className="bg-white/15 border border-white/25 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-blue-100 font-bold">Đồng hồ 2 · Sở XD (ĐM 60p)</p>
              <p className="font-bold text-white mt-0.5">
                {formatClockDuration(deptClock.netMinutes)}
                {deptClock.isPaused && ' (Đang dừng)'}
              </p>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                deptClock.isRed
                  ? 'bg-red-500 text-white'
                  : deptClock.isAmber
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-emerald-400 text-slate-900'
              }`}
            >
              {deptClock.isRed ? 'Vượt 60p' : deptClock.isAmber ? '>45p' : 'Đạt'}
            </span>
          </div>
        </div>
      </div>

      {/* CẢNH BÁO TRẢ LẠI HỒ SƠ NẾU CÓ */}
      {trip.lastReturnInfo && ['TRA_CHU_TAU', 'TRA_BQL_CANG', 'OFFICE_TRA_LAI'].includes(status) && (
        <div className="p-4 rounded-2xl border border-rose-300 bg-rose-50 text-rose-950 text-xs space-y-1">
          <p className="font-black flex items-center gap-1.5 text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Hồ sơ đang ở trạng thái trả lại bởi {getReturnPartyLabel(trip.lastReturnInfo.benTra)}
            </span>
          </p>
          <p>
            <strong>Phạm vi:</strong> {getReturnScopeLabel(trip.lastReturnInfo.phamVi)}
          </p>
          <p>
            <strong>Lý do:</strong> {trip.lastReturnInfo.lyDo}
          </p>
        </div>
      )}

      {/* CÂY 4 BƯỚC CHÍNH */}
      <div className="bg-white/95 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] p-5 sm:p-7 shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)]">
        <div className="relative pl-6 sm:pl-8 space-y-7 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {/* BƯỚC 1: CHỦ TÀU NỘP HỒ SƠ & CHỨNG TỪ PHÍ */}
          <div className="relative">
            <div
              className={`absolute -left-[30px] sm:-left-[34px] top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-white shadow-sm ${
                isStep1Done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isStep1Done ? <Check className="w-4 h-4" /> : '1'}
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/70">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => toggleNode('step1')}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                      Bước 1: Chủ tàu nộp hồ sơ & chứng từ phí
                    </span>
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatDateTime(submissionTime)}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                    Nộp hồ sơ điện tử trực tuyến qua ứng dụng
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Người nộp: <strong>{trip.createdByName}</strong> • Mã/Biên lai phí:{' '}
                    <strong className="font-mono">{trip.feeTransactionCode || 'Đã đính kèm chứng từ'}</strong>
                  </p>
                </div>
                <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                  {expandedNodes.step1 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>

              {expandedNodes.step1 && (
                <div className="mt-4 pt-3.5 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Thuyền viên & Hành khách:</span>
                    <p className="font-bold text-slate-900 text-sm mt-0.5">
                      {trip.crewMembers.length} TV • {trip.passengerCount} HK
                    </p>
                    <p className="text-[11px] text-slate-500">Thuyền trưởng: {trip.captainName}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Hàng hóa & Áo phao:</span>
                    <p className="font-bold text-slate-900 text-sm mt-0.5">
                      {trip.cargoTons} tấn • {trip.actualLifeJacketsReported || trip.requiredLifeJackets} áo phao
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{trip.cargoDescription || 'Không chở hàng nặng'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Tệp đính kèm (incl. Chứng từ phí):</span>
                    <p className="font-bold text-blue-700 text-sm mt-0.5 flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {trip.uploadedDocuments?.length || 0} tài liệu điện tử
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BƯỚC 2: BQL CẢNG KIỂM TRA BẾN & THÔNG BÁO CHẤP THUẬN */}
          <div className="relative">
            <div
              className={`absolute -left-[30px] sm:-left-[34px] top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-white shadow-sm ${
                isStep2Rejected
                  ? 'bg-rose-600 text-white'
                  : isStep2Done
                  ? 'bg-emerald-600 text-white'
                  : isStep2InProgress
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isStep2Rejected ? <XCircle className="w-4 h-4" /> : isStep2Done ? <Check className="w-4 h-4" /> : '2'}
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/70">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => toggleNode('step2')}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
                      Bước 2: Ban Quản lý Cảng kiểm tra & Chấp thuận (ĐM 60p)
                    </span>
                    {trip.approvalNotice && (
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        TB: {trip.approvalNotice.noticeNumber}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                    Kiểm tra 8 nhóm hồ sơ, hiện trường bến & chứng từ phí
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Cán bộ ca trực: <strong>{trip.portInspection?.inspectorName || 'Chờ phân ca tại bến'}</strong>
                    {trip.portInspection?.inspectedAt && ` • Lúc ${formatDateTime(trip.portInspection.inspectedAt)}`}
                  </p>
                </div>
                <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                  {expandedNodes.step2 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>

              {expandedNodes.step2 && (
                <div className="mt-4 pt-3.5 border-t border-slate-200/80 text-xs space-y-2">
                  {trip.portInspection ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <p className="font-bold text-slate-800">Kết quả kiểm tra thực tế:</p>
                        <p className="text-slate-600 mt-1">
                          Thực tế: <strong>{trip.portInspection.actualPassengerCount} HK</strong>,{' '}
                          <strong>{trip.portInspection.actualCargoTons} tấn hàng</strong>,{' '}
                          <strong>{trip.portInspection.actualLifeJackets} áo phao</strong>
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <p className="font-bold text-slate-800">Kết luận BQL Cảng:</p>
                        <p className="text-slate-600 mt-1">
                          {trip.approvalNotice?.conclusionSummary ||
                            trip.portInspection.notes ||
                            'Đủ điều kiện an toàn rời bến'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">Chưa có biên bản kiểm tra của Ban Quản lý Cảng.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* BƯỚC 3: SỞ XÂY DỰNG XỬ LÝ & TRÌNH KÝ OFFICE */}
          <div className="relative">
            <div
              className={`absolute -left-[30px] sm:-left-[34px] top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-white shadow-sm ${
                isStep3Done
                  ? 'bg-emerald-600 text-white'
                  : isStep3InProgress
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isStep3Done ? <Check className="w-4 h-4" /> : '3'}
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/70">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => toggleNode('step3')}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200">
                      Bước 3: Sở Xây dựng đối chiếu, duyệt dự thảo & Office (ĐM 60p + 10p tải PDF)
                    </span>
                    {trip.orderNumber && (
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Số GP: {trip.orderNumber}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                    <Stamp className="w-4 h-4 text-indigo-600" />
                    Chuyên viên xử lý → Trình ký trên Office → Tải Giấy phép có dấu đỏ lên app
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Chuyên viên: <strong>{trip.weatherCheckRecord?.checkedByName || trip.deptApprovedByName || trip.approvedByName || 'Ca trực Phòng ATGT'}</strong>
                    {trip.issuedAt && ` • Phát hành lúc ${formatDateTime(trip.issuedAt)}`}
                  </p>
                </div>
                <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                  {expandedNodes.step3 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>

              {expandedNodes.step3 && (
                <div className="mt-4 pt-3.5 border-t border-slate-200/80 space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500">Kiểm tra thời tiết (R7):</span>
                      <p className="font-bold text-slate-900 mt-0.5">
                        {trip.weatherCheckRecord?.checkedAt ? formatDateTime(trip.weatherCheckRecord.checkedAt) : 'Chờ kiểm tra'}
                      </p>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500">Trình ký Office:</span>
                      <p className="font-bold text-slate-900 mt-0.5">
                        {trip.officeSubmissionRecord?.submittedAt || trip.officeSubmissionRecord?.submittedToOfficeAt
                          ? formatDateTime(
                              (trip.officeSubmissionRecord.submittedAt || trip.officeSubmissionRecord.submittedToOfficeAt)!
                            )
                          : 'Chưa trình Office'}
                      </p>
                      {trip.officeSubmissionRecord?.returns && trip.officeSubmissionRecord.returns.length > 0 && (
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Số lần Office trả lại: {trip.officeSubmissionRecord.returns.length}
                        </p>
                      )}
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500">Hiệu lực Giấy phép (24h):</span>
                      <p className="font-bold text-emerald-800 mt-0.5">
                        {trip.orderValidUntil ? formatDateTime(trip.orderValidUntil) : 'Cấp khi tải PDF'}
                      </p>
                    </div>
                  </div>
                  {trip.supersededOrderNumbers && trip.supersededOrderNumbers.length > 0 && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                      <strong>Giấy phép cũ đã hủy hiệu lực (R12):</strong> {trip.supersededOrderNumbers.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* BƯỚC 4: BIÊN PHÒNG KIỂM SOÁT CUỐI CÙNG TẠI BẾN */}
          <div className="relative">
            <div
              className={`absolute -left-[30px] sm:-left-[34px] top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-white shadow-sm ${
                isStep4Held
                  ? 'bg-red-600 text-white'
                  : isStep4Done
                  ? 'bg-emerald-600 text-white'
                  : isStep4InProgress
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isStep4Held ? <AlertTriangle className="w-4 h-4" /> : isStep4Done ? <ShieldCheck className="w-4 h-4" /> : '4'}
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/70">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => toggleNode('step4')}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-200">
                      Bước 4: Biên phòng kiểm soát cuối cùng tại bến (Sau cấp phép)
                    </span>
                    {isStep4Done && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                        ĐÃ CHO XUẤT BẾN
                      </span>
                    )}
                    {isStep4Held && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white">
                        BIÊN PHÒNG TẠM GIỮ
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                    Quét QR Giấy phép → Kiểm đếm thuyền viên/hành khách thực tế → Cho xuất bến
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {trip.bpDepartureControl
                      ? `Kiểm soát bởi ${trip.bpDepartureControl.inspectorName} lúc ${formatDateTime(
                          trip.bpDepartureControl.checkedAt
                        )}`
                      : 'Thực hiện sau khi Sở cấp Giấy phép rời cảng'}
                  </p>
                </div>
                <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                  {expandedNodes.step4 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>

              {expandedNodes.step4 && trip.bpDepartureControl && (
                <div className="mt-4 pt-3.5 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500">Quân số thực tế lên tàu:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {trip.bpDepartureControl.actualCrewCount} TV • {trip.bpDepartureControl.actualPassengerCount} HK
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Ngoài danh sách (R12): {trip.bpDepartureControl.unlistedPeople.length} người
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500">Kết quả đối chiếu QR & Người:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {trip.bpDepartureControl.decision === 'CHO_XUAT_BEN'
                        ? 'Khớp · Cho xuất bến'
                        : trip.bpDepartureControl.decision === 'TRA_CHU_TAU_R12'
                        ? 'Lệch danh sách (R12) · Trả Chủ tàu'
                        : 'Phát hiện bất thường · Tạm giữ'}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500">Ghi nhận xuất bến:</span>
                    <p className="font-bold text-blue-800 mt-0.5">
                      {trip.actualDepartureTime ? formatDateTime(trip.actualDepartureTime) : 'Chưa rời bến'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BƯỚC 5: XÁC NHẬN CẬP BẾN ĐÍCH AN TOÀN */}
          <div className="relative">
            <div
              className={`absolute -left-[30px] sm:-left-[34px] top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-white shadow-sm ${
                isStep5Done
                  ? 'bg-emerald-600 text-white'
                  : isStep5InProgress
                  ? 'bg-sky-600 text-white animate-pulse'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              <Anchor className="w-4 h-4" />
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/70">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => toggleNode('step5')}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-200">
                      Bước 5: Xác nhận cập bến an toàn tại {trip.arrivalPortName}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                    {isStep5Done
                      ? `Đã cập bến lúc ${formatDateTime(trip.actualArrivalTime)}`
                      : isStep5InProgress
                      ? 'Phương tiện đang hành trình trên biển — Chờ đầu bến đến xác nhận cập bến'
                      : 'Chờ tàu xuất bến'}
                  </h3>
                  {trip.arrivingConfirmation && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      Xác nhận bởi: <strong>{trip.arrivingConfirmation.confirmedByName}</strong> (
                      {trip.arrivingConfirmation.confirmedByRole})
                    </p>
                  )}
                </div>
                <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                  {expandedNodes.step5 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NHẬT KÝ LƯU VẾT CHI TIẾT */}
      <div className="bg-[#f4f8ff] rounded-[22px] border border-[#dce8f7] p-5 sm:p-6 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-[#07244d] flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-[#0d62e8]" />
          Nhật ký lưu vết thay đổi trạng thái (Không sửa xóa)
        </h3>
        <div className="space-y-2 text-xs">
          {trip.statusLogs.map((log, idx) => {
            const displayReason =
              log.hideBpDetailsFromCaptain && viewerRole === 'CAPTAIN'
                ? 'Hồ sơ tạm dừng theo kiểm soát an ninh trật tự tại bến'
                : log.reason;
            return (
              <div
                key={idx}
                className="p-3 bg-white rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">
                      Chuyển sang: <span className="text-blue-700">{getStatusInfo(log.toStatus).label}</span>
                    </span>
                    {log.milestone && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {getStatusMilestoneLabel(log.milestone)}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 font-mono">({formatTime(log.changedAt)})</span>
                  </div>
                  {displayReason && <p className="text-slate-600 italic text-[11px]">"{displayReason}"</p>}
                </div>
                <div className="text-right shrink-0 text-[11px] text-slate-500">
                  Thực hiện:{' '}
                  <strong>
                    {log.hideBpDetailsFromCaptain && viewerRole === 'CAPTAIN'
                      ? 'Lực lượng Biên phòng'
                      : log.changedByName}
                  </strong>{' '}
                  • {formatDateTime(log.changedAt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
