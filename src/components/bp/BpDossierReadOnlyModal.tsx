/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
  History,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Ship,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { DeNghiDung, TripRecord, UserAccount } from '../../types';
import { repository } from '../../services/repository';
import {
  formatDate,
  formatDateTime,
  getBpStopReasonLabel,
  getStatusInfo,
  getStatusMilestoneLabel,
  maskFullNameInitials,
} from '../../utils/formatters';

interface BpDossierReadOnlyModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripRecord | null;
  actor: UserAccount;
}

type DossierTab = 'GENERAL' | 'CREW' | 'PASSENGERS' | 'APPENDIX_01' | 'HISTORY';

export const BpDossierReadOnlyModal: React.FC<BpDossierReadOnlyModalProps> = ({
  isOpen,
  onClose,
  trip,
  actor,
}) => {
  const isBpAccount = actor.role === 'BP_TRUC' || actor.role === 'BP_CHIHUY';
  const [activeTab, setActiveTab] = useState<DossierTab>('GENERAL');
  const [isUnmasked, setIsUnmasked] = useState(isBpAccount);
  const [showReasonPrompt, setShowReasonPrompt] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [paxSearch, setPaxSearch] = useState('');
  const autoLoggedTripRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('GENERAL');
      setIsUnmasked(isBpAccount);
      setShowReasonPrompt(false);
      setUnlockReason('');
      setUnlockError('');
      setPaxSearch('');
      autoLoggedTripRef.current = null;
    } else {
      autoLoggedTripRef.current = null;
    }
  }, [isOpen, trip?.id, isBpAccount]);

  useEffect(() => {
    if (!isOpen || !trip || !isBpAccount || activeTab !== 'PASSENGERS' || !isUnmasked) {
      return;
    }
    if (autoLoggedTripRef.current === trip.id) return;
    if ((trip.passengers || []).length > 0) {
      autoLoggedTripRef.current = trip.id;
      repository.logPersonalDataAccess({
        hoSoId: trip.id,
        lyDo: 'Biên phòng rà soát đầy đủ danh sách hành khách trên tàu',
        actor,
      });
    }
  }, [isOpen, trip, isBpAccount, activeTab, isUnmasked, actor]);

  const filteredPassengers = useMemo(() => {
    const list = trip?.passengers || [];
    const q = paxSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const hay = `${p.fullName} ${p.birthYear} ${p.idNumber} ${p.phone} ${p.address || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [trip?.passengers, paxSearch]);

  if (!isOpen || !trip) return null;

  const statusInfo = getStatusInfo(trip.status);
  const activeStop: DeNghiDung | undefined = repository.getActiveDeNghiDungForTrip(trip.id);
  const stopHistory = repository.getDeNghiDungsForTrip(trip.id);
  const latestControl = repository.getLatestKiemSoatForTrip(trip.id);

  const handleConfirmUnlock = () => {
    setUnlockError('');
    if (unlockReason.trim().length < 5) {
      setUnlockError('Vui lòng nhập rõ lý do nghiệp vụ (tối thiểu 5 ký tự) để mở xem dữ liệu cá nhân đầy đủ.');
      return;
    }
    repository.logPersonalDataAccess({
      hoSoId: trip.id,
      lyDo: unlockReason.trim(),
      actor,
    });
    setIsUnmasked(true);
    setShowReasonPrompt(false);
  };

  const tabs: { id: DossierTab; label: string; icon: React.ReactNode }[] = [
    { id: 'GENERAL', label: 'Bản khai chung', icon: <FileText className="w-4 h-4" /> },
    { id: 'CREW', label: `Thuyền viên (${trip.crewMembers?.length || 0})`, icon: <Anchor className="w-4 h-4" /> },
    {
      id: 'PASSENGERS',
      label: `Hành khách (${trip.passengers?.length || trip.passengerCount || 0})`,
      icon: <Users className="w-4 h-4" />,
    },
    { id: 'APPENDIX_01', label: 'Phụ lục 01 & Chấp thuận', icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: 'HISTORY', label: 'Lịch sử trạng thái', icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/70 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full sm:max-w-4xl rounded-t-2xl sm:rounded-xl bg-white shadow-2xl border border-slate-200 max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
              <Ship className="w-5 h-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  Hồ sơ {trip.tripNumber} · {trip.vesselName}
                </h3>
                <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200">
                  Chỉ đọc
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate">
                {trip.vesselRegNumber} · {trip.routeName} · {statusInfo.label}
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

        {/* Active Hold Banner */}
        {activeStop && (
          <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 flex items-start gap-2.5 text-xs text-red-900">
            <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                ĐANG TẠM GIỮ / ĐÌNH CHỈ XUẤT BẾN ({getBpStopReasonLabel(activeStop.maLyDo)})
              </p>
              <p>
                {activeStop.moTa} · Lập bởi: {activeStop.nguoiDeNghi} ({formatDateTime(activeStop.thoiDiem)})
              </p>
            </div>
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 bg-slate-50 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'GENERAL' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 p-3.5 space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Thông tin chuyến & Giấy phép
                  </p>
                  <p><span className="text-slate-500">Mã hồ sơ:</span> <strong className="font-mono">{trip.tripNumber}</strong></p>
                  <p><span className="text-slate-500">Số Giấy phép:</span> <strong className="font-mono">{trip.orderNumber || 'Chưa cấp'}</strong></p>
                  <p><span className="text-slate-500">Hành trình:</span> {trip.departurePortName} → {trip.arrivalPortName}</p>
                  <p><span className="text-slate-500">Giờ rời dự kiến:</span> <span className="font-mono tabular-nums">{formatDateTime(trip.scheduledDepartureTime)}</span></p>
                  {trip.orderValidUntil && (
                    <p><span className="text-slate-500">Hiệu lực GP đến:</span> <span className="font-mono tabular-nums">{formatDateTime(trip.orderValidUntil)}</span></p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 p-3.5 space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Phương tiện & nhân lực
                  </p>
                  <p><span className="text-slate-500">Tên tàu:</span> <strong>{trip.vesselName}</strong> ({trip.vesselRegNumber})</p>
                  <p><span className="text-slate-500">Thuyền trưởng:</span> <strong>{trip.captainName}</strong></p>
                  <p><span className="text-slate-500">Thuyền viên / Hành khách:</span> <strong className="font-mono tabular-nums">{trip.crewMembers?.length || 0} TV · {trip.passengerCount} HK</strong></p>
                  <p><span className="text-slate-500">Hàng hóa:</span> <span className="font-mono tabular-nums">{trip.cargoTons} tấn</span> {trip.cargoDescription ? `(${trip.cargoDescription})` : ''}</p>
                  <p><span className="text-slate-500">Áo phao báo cáo:</span> <span className="font-mono tabular-nums">{trip.actualLifeJacketsReported}/{trip.requiredLifeJackets}</span></p>
                </div>
              </div>

              {trip.bpDepartureControl && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3.5 text-xs space-y-1 text-sky-950">
                  <p className="font-bold">
                    Kết quả kiểm soát cuối cùng tại bến ({formatDateTime(trip.bpDepartureControl.checkedAt || trip.bpDepartureControl.controlledAt)})
                  </p>
                  <p>
                    Người kiểm soát: <strong>{trip.bpDepartureControl.checkedByName || trip.bpDepartureControl.controllerName}</strong> ·
                    Quyết định: <strong>{trip.bpDepartureControl.action || trip.bpDepartureControl.decision}</strong> ·
                    Thực tế trên tàu: <strong className="font-mono">{trip.bpDepartureControl.actualTotalPeople ?? '--'}</strong> người
                  </p>
                </div>
              )}

              {latestControl && (
                <div className={`rounded-lg border p-3.5 text-xs ${
                  latestControl.ketQua === 'chenh_lech'
                    ? 'border-amber-300 bg-amber-50 text-amber-950'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-950'
                }`}>
                  <p className="font-bold">
                    Kiểm đếm tại bến ({formatDateTime(latestControl.thoiDiem)}):{' '}
                    {latestControl.ketQua === 'chenh_lech' ? 'CHÊNH LỆCH QUÂN SỐ' : 'KHỚP DANH SÁCH'}
                  </p>
                  <p className="mt-1">
                    Thực tế: <strong className="font-mono">{latestControl.soNguoiThucTe}</strong> / Danh sách:{' '}
                    <strong className="font-mono">{latestControl.soNguoiTheoDanhSach}</strong> · Cán bộ: {latestControl.nguoiKiemSoat}
                  </p>
                </div>
              )}

              {stopHistory.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-3.5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Biên bản tạm giữ / đình chỉ ({stopHistory.length})
                  </p>
                  {stopHistory.map((d) => (
                    <div key={d.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          Tạm giữ / Đình chỉ xuất bến — {getBpStopReasonLabel(d.maLyDo)}
                        </span>
                        <span className={`font-semibold ${d.trangThai === 'dang_hieu_luc' ? 'text-red-700' : 'text-emerald-700'}`}>
                          {d.trangThai === 'dang_hieu_luc' ? 'Đang hiệu lực' : 'Đã gỡ'}
                        </span>
                      </div>
                      <p className="text-slate-700">{d.moTa}</p>
                      <p className="text-slate-500">
                        Lập bởi: {d.nguoiDeNghi} ({formatDateTime(d.thoiDiem)})
                        {d.trangThai === 'da_go' && d.nguoiGo && ` · Gỡ bởi: ${d.nguoiGo} (${formatDateTime(d.thoiDiemGo)})`}
                      </p>
                      {d.ketQuaXacMinh && (
                        <p className="text-emerald-800 font-medium">Kết quả xác minh: {d.ketQuaXacMinh}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'CREW' && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">STT</th>
                    <th className="px-3 py-2.5 font-semibold">Họ và tên</th>
                    <th className="px-3 py-2.5 font-semibold">Chức danh</th>
                    <th className="px-3 py-2.5 font-semibold">Số bằng/Chứng chỉ</th>
                    <th className="px-3 py-2.5 font-semibold">Hạn bằng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(trip.crewMembers || []).map((c, idx) => (
                    <tr key={c.crewId || idx}>
                      <td className="px-3 py-2.5 font-mono tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{c.fullName}</td>
                      <td className="px-3 py-2.5 text-slate-700">{c.positionTitle}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{c.certNumber}</td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700">{formatDate(c.certExpireDate)}</td>
                    </tr>
                  ))}
                  {(!trip.crewMembers || trip.crewMembers.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        Không có dữ liệu thuyền viên.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'PASSENGERS' && (
            <div className="space-y-3">
              <div
                className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  isBpAccount && isUnmasked
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2 text-xs text-slate-700">
                  {isBpAccount && isUnmasked ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : isUnmasked ? (
                    <Unlock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">
                      {isBpAccount && isUnmasked
                        ? 'Quyền Biên phòng đối chiếu hành khách trên tàu: Đang hiển thị đầy đủ thông tin.'
                        : isUnmasked
                        ? 'Đã mở xem dữ liệu cá nhân đầy đủ (đã ghi nhật ký truy cập).'
                        : 'Dữ liệu cá nhân hành khách đang được che theo mặc định (Nghị định 356/2025/NĐ-CP).'}
                    </p>
                    <p className="text-slate-600">
                      {isBpAccount && isUnmasked
                        ? 'Hiển thị đầy đủ họ tên, năm sinh, giới tính, số CCCD/hộ chiếu, SĐT và địa chỉ cư trú (đã ghi nhật ký truy cập).'
                        : 'Hiển thị rút gọn: Họ tên viết tắt tên đệm/tên, năm sinh đầy đủ, che số giấy tờ, SĐT và địa chỉ (***).'}
                    </p>
                  </div>
                </div>
                {isBpAccount ? (
                  <button
                    type="button"
                    onClick={() => setIsUnmasked((v) => !v)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {isUnmasked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    <span>{isUnmasked ? 'Tạm che trên màn hình' : 'Hiển thị đầy đủ'}</span>
                  </button>
                ) : (
                  !isUnmasked && (
                    <button
                      type="button"
                      onClick={() => setShowReasonPrompt((v) => !v)}
                      className="min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Xem đầy đủ</span>
                    </button>
                  )
                )}
              </div>

              {!isBpAccount && showReasonPrompt && !isUnmasked && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-2.5">
                  <p className="text-xs font-bold text-amber-950">
                    Nhập lý do truy cập dữ liệu cá nhân đầy đủ (bắt buộc ghi nhật ký)
                  </p>
                  {unlockError && <p className="text-xs text-red-700 font-medium">{unlockError}</p>}
                  <input
                    type="text"
                    value={unlockReason}
                    onChange={(e) => setUnlockReason(e.target.value)}
                    placeholder="VD: Đối chiếu hành khách nghi vấn theo yêu cầu xác minh an ninh..."
                    className="w-full min-h-[44px] rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReasonPrompt(false)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmUnlock}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Xác nhận & Ghi nhật ký
                    </button>
                  </div>
                </div>
              )}

              {(trip.passengers || []).length > 0 && (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={paxSearch}
                    onChange={(e) => setPaxSearch(e.target.value)}
                    placeholder="Tìm nhanh hành khách theo họ tên, CCCD/hộ chiếu, SĐT, địa chỉ..."
                    className="w-full min-h-[40px] pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">STT</th>
                      <th className="px-3 py-2.5 font-semibold">Họ và tên</th>
                      <th className="px-3 py-2.5 font-semibold">Năm sinh</th>
                      <th className="px-3 py-2.5 font-semibold">Giới tính</th>
                      <th className="px-3 py-2.5 font-semibold">Số giấy tờ</th>
                      <th className="px-3 py-2.5 font-semibold">Điện thoại</th>
                      <th className="px-3 py-2.5 font-semibold">Địa chỉ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredPassengers.map((p, idx) => (
                      <tr key={p.id || idx}>
                        <td className="px-3 py-2.5 font-mono tabular-nums">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">
                          {isUnmasked ? p.fullName : maskFullNameInitials(p.fullName)}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-slate-800">{p.birthYear}</td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {p.gender === 'NAM' ? 'Nam' : p.gender === 'NU' ? 'Nữ' : 'Khác'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">
                          {isUnmasked ? p.idNumber : '***'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">
                          {isUnmasked ? p.phone : '***'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {isUnmasked ? p.address || '—' : '***'}
                        </td>
                      </tr>
                    ))}
                    {(!trip.passengers || trip.passengers.length === 0) && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          Chuyến có {trip.passengerCount} hành khách khai báo tổng (danh sách chi tiết chưa đính kèm).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'APPENDIX_01' && (
            <div className="space-y-3">
              {trip.approvalNotice && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs space-y-1 text-emerald-950">
                  <p className="font-bold">
                    Thông báo chấp thuận BQL Cảng số: <span className="font-mono">{trip.approvalNotice.noticeNumber}</span>
                  </p>
                  <p>
                    Người cấp: <strong>{trip.approvalNotice.issuerName || trip.approvalNotice.issuedByName}</strong> ·{' '}
                    {formatDateTime(trip.approvalNotice.issuedAt)}
                  </p>
                </div>
              )}

              {trip.portInspection ? (
                <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div>
                      <p className="font-bold text-slate-900">Biên bản kiểm tra thực tế tại bến (8 nhóm)</p>
                      <p className="text-xs text-slate-500">
                        Cán bộ BQL Cảng: {trip.portInspection.inspectorName} · {formatDateTime(trip.portInspection.inspectedAt)}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold ${
                        trip.portInspection.conclusion === 'ELIGIBLE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {trip.portInspection.conclusion === 'ELIGIBLE' ? 'ĐỦ ĐIỀU KIỆN' : 'KHÔNG ĐỦ ĐIỀU KIỆN'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <p>Giấy tờ tàu: <strong>{trip.portInspection.checkVesselDocuments ? 'Đạt' : 'Không đạt'}</strong></p>
                    <p>Bằng cấp TV: <strong>{trip.portInspection.checkCrewCertificates ? 'Đạt' : 'Không đạt'}</strong></p>
                    <p>Số người thực tế (BQL Cảng): <strong className="font-mono">{trip.portInspection.actualPassengerCount}</strong></p>
                    <p>Áo phao thực tế: <strong className="font-mono">{trip.portInspection.actualLifeJackets}</strong></p>
                    <p>PCCC & Cứu sinh: <strong>{trip.portInspection.checkFireSafety && trip.portInspection.checkLifeSavingEquip ? 'Đạt' : 'Chưa đạt'}</strong></p>
                    <p>Chứng từ phí (R11): <strong>{trip.portInspection.feeVerified ? 'Đã kiểm tra' : 'Chưa rõ'}</strong></p>
                  </div>
                  {trip.portInspection.notes && (
                    <p className="text-xs text-slate-700 bg-slate-50 rounded p-2.5 border border-slate-200">
                      Ghi chú BQL Cảng: {trip.portInspection.notes}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Ban Quản lý Cảng chưa lập biên bản kiểm tra tại bến cho hồ sơ này.
                </div>
              )}
            </div>
          )}

          {activeTab === 'HISTORY' && (
            <div className="space-y-2.5">
              {(trip.statusLogs || []).map((log, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {getStatusInfo(log.fromStatus).label} → {getStatusInfo(log.toStatus).label}
                    </span>
                    <span className="font-mono text-slate-500">{formatDateTime(log.changedAt)}</span>
                  </div>
                  {log.milestone && (
                    <p className="font-mono text-[11px] font-semibold text-sky-700">
                      Mốc: {getStatusMilestoneLabel(log.milestone)}
                    </p>
                  )}
                  <p className="text-slate-700">Người thực hiện: {log.changedByName}</p>
                  {log.reason && <p className="text-slate-600">{log.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
          >
            Đóng hồ sơ
          </button>
        </div>
      </div>
    </div>
  );
};
