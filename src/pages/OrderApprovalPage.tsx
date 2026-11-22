/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserAccount, TripRecord } from '../types';
import { repository } from '../services/repository';
import { formatDateTime, getStatusInfo } from '../utils/formatters';
import { normalizeStatus } from '../utils/userPermissions';
import { DigitalOrderA4 } from '../components/DigitalOrderA4';
import { CoastalPageHero } from '../components/CoastalPageHero';
import { OfficialFormsModal } from '../components/OfficialFormsModal';
import { PaginationBar, usePagination } from '../components/PaginationBar';
import {
  FileBadge,
  CheckCircle2,
  Search,
  Ship,
  Clock,
  Users,
  Package,
  ShieldCheck,
  AlertTriangle,
  FileText,
  ExternalLink,
  ListChecks,
  Anchor,
  ChevronRight,
  Info,
} from 'lucide-react';

interface OrderApprovalPageProps {
  currentUser: UserAccount;
  initialTripId?: string;
  onNavigate: (page: string, tripId?: string) => void;
}

const OFFICE_TRACKING_STATUSES = new Set([
  'DA_DUYET',
  'DANG_TRINH_OFFICE',
  'OFFICE_TRA_LAI',
  'DA_CAP_PHEP',
  'TAM_GIU_BIEN_PHONG',
  'DA_XUAT_BEN',
  'DA_CAP_BEN',
]);

export const OrderApprovalPage: React.FC<OrderApprovalPageProps> = ({
  currentUser,
  initialTripId,
  onNavigate,
}) => {
  const [, setRepoTick] = useState(0);
  const [activeListTab, setActiveListTab] = useState<'OFFICE' | 'ALL'>('OFFICE');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormsModal, setShowFormsModal] = useState(false);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return repository.subscribe(() => setRepoTick((t) => t + 1));
  }, []);

  const trips = repository.getTrips();
  const vessels = repository.getVessels();

  const officeQueueTrips = useMemo(() => {
    return trips
      .filter((t) => {
        const st = normalizeStatus(t.status);
        return st === 'DA_DUYET' || st === 'DANG_TRINH_OFFICE' || st === 'OFFICE_TRA_LAI';
      })
      .sort((a, b) => (b.scheduledDepartureTime || '').localeCompare(a.scheduledDepartureTime || ''));
  }, [trips]);

  const allRelevantTrips = useMemo(() => {
    return [...trips].sort((a, b) => {
      const aOffice = OFFICE_TRACKING_STATUSES.has(normalizeStatus(a.status)) ? 0 : 1;
      const bOffice = OFFICE_TRACKING_STATUSES.has(normalizeStatus(b.status)) ? 0 : 1;
      if (aOffice !== bOffice) return aOffice - bOffice;
      return (b.scheduledDepartureTime || '').localeCompare(a.scheduledDepartureTime || '');
    });
  }, [trips]);

  const [selectedTripId, setSelectedTripId] = useState<string>(() => {
    if (initialTripId) return initialTripId;
    return officeQueueTrips[0]?.id || trips[0]?.id || '';
  });

  useEffect(() => {
    if (initialTripId) {
      setSelectedTripId(initialTripId);
      const target = trips.find((t) => t.id === initialTripId);
      if (
        target &&
        !['DA_DUYET', 'DANG_TRINH_OFFICE', 'OFFICE_TRA_LAI'].includes(normalizeStatus(target.status))
      ) {
        setActiveListTab('ALL');
      } else {
        setActiveListTab('OFFICE');
      }
    }
  }, [initialTripId, trips]);

  const baseList = activeListTab === 'OFFICE' ? officeQueueTrips : allRelevantTrips;

  const filteredList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter((t) => {
      return (
        t.tripNumber.toLowerCase().includes(q) ||
        (t.orderNumber || '').toLowerCase().includes(q) ||
        t.vesselName.toLowerCase().includes(q) ||
        t.vesselRegNumber.toLowerCase().includes(q) ||
        t.captainName.toLowerCase().includes(q) ||
        t.routeName.toLowerCase().includes(q)
      );
    });
  }, [baseList, searchTerm]);

  const pagination = usePagination(
    filteredList,
    `${activeListTab}|${searchTerm.trim().toLowerCase()}`
  );

  const trip: TripRecord | undefined = useMemo(() => {
    const exact = trips.find((t) => t.id === selectedTripId);
    if (exact) return exact;
    return filteredList[0] || officeQueueTrips[0] || trips[0];
  }, [trips, selectedTripId, filteredList, officeQueueTrips]);

  const selectedVessel = useMemo(
    () =>
      trip
        ? vessels.find((v) => v.id === trip.vesselId || v.regNumber === trip.vesselRegNumber)
        : undefined,
    [vessels, trip]
  );

  const handleSelectOrder = (targetTrip: TripRecord) => {
    setSelectedTripId(targetTrip.id);
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const selectedCanonical = trip ? normalizeStatus(trip.status) : 'NHAP';
  const selectedStatusInfo = trip ? getStatusInfo(selectedCanonical) : null;
  const isSelectedIssued = Boolean(
    trip &&
      ['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG', 'DA_XUAT_BEN', 'DA_CAP_BEN'].includes(selectedCanonical)
  );
  const deptClock = trip ? repository.computeDeptClockMinutes(trip) : null;

  return (
    <div className="w-full mx-auto space-y-5 transition-all duration-300">
      <CoastalPageHero
        title="Theo dõi trình ký trên Office & Giám sát Giấy phép"
        subtitle="Chế độ xem giám sát cho Trưởng phòng / Lãnh đạo Sở — việc duyệt & ký số thực hiện trên phần mềm Office"
        icon={<FileBadge className="w-7 h-7" />}
        rightContent={
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-4 py-2 rounded-2xl bg-white/15 border border-white/25 text-white backdrop-blur-xs text-xs font-bold flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  officeQueueTrips.length > 0 ? 'bg-amber-300 animate-pulse' : 'bg-emerald-300'
                }`}
              />
              <span>
                Đang trình / Dự thảo Office:{' '}
                <strong className="text-sm font-black tabular-nums">{officeQueueTrips.length}</strong> hồ sơ
              </span>
            </div>
          </div>
        }
      />

      {/* Thông báo quy trình Office (không ký trong ứng dụng) */}
      <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-950 text-xs flex items-start gap-3">
        <Info className="w-5 h-5 text-[#0d62e8] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-extrabold text-[#07244d]">
            Quy trình ký &amp; phát hành Giấy phép qua phần mềm quản lý văn bản (Office)
          </p>
          <p className="text-slate-700 leading-relaxed">
            Ứng dụng này chỉ phục vụ <strong>giám sát, đối chiếu và xem bản dự thảo</strong> cho tài khoản Trưởng phòng / Lãnh đạo Sở ({currentUser.fullName}). Việc kiểm tra trình ký, ký số Lãnh đạo Sở và đóng dấu phát hành thực hiện trực tiếp trên <strong>Office</strong>; sau khi phát hành, Chuyên viên Phòng ATGT sẽ tải tệp PDF có dấu đỏ lên ứng dụng trong ≤ 10 phút.
          </p>
        </div>
      </div>

      {/* BỐ CỤC MASTER-DETAIL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* CỘT TRÁI: DANH SÁCH HỒ SƠ */}
        <aside className="lg:col-span-4 bg-white/95 rounded-[22px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] overflow-hidden lg:sticky lg:top-20">
          <div className="p-4 border-b border-[#dce8f7] bg-[#f8fbff] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-[#07244d] flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-[#0d62e8]" />
                <span>Danh sách theo dõi Office</span>
              </h2>
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#eaf2ff] text-[#0b4ea8] border border-[#b8d4ff] tabular-nums">
                {filteredList.length} hồ sơ
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#eaf2ff] rounded-xl border border-[#cfe0f5]">
              <button
                type="button"
                onClick={() => {
                  setActiveListTab('OFFICE');
                  if (
                    officeQueueTrips.length > 0 &&
                    !officeQueueTrips.some((t) => t.id === selectedTripId)
                  ) {
                    setSelectedTripId(officeQueueTrips[0].id);
                  }
                }}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeListTab === 'OFFICE'
                    ? 'bg-[#0d62e8] text-white shadow-xs'
                    : 'text-[#27518c] hover:bg-white/60'
                }`}
              >
                <span>Trình Office</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                    activeListTab === 'OFFICE'
                      ? 'bg-white/25 text-white'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {officeQueueTrips.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveListTab('ALL')}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeListTab === 'ALL'
                    ? 'bg-[#0d62e8] text-white shadow-xs'
                    : 'text-[#27518c] hover:bg-white/60'
                }`}
              >
                <span>Tất cả hồ sơ</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                    activeListTab === 'ALL' ? 'bg-white/25 text-white' : 'bg-white text-[#27518c]'
                  }`}
                >
                  {allRelevantTrips.length}
                </span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#526c93] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã HS, số GP, tên tàu, số ĐK..."
                className="w-full pl-8.5 pr-3 py-2 text-xs border border-[#dce8f7] rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0d62e8]/20 focus:border-[#0d62e8] text-[#07244d] font-medium placeholder:text-[#7c94b8]"
              />
            </div>
          </div>

          <div className="max-h-[420px] lg:max-h-[calc(100vh-300px)] overflow-y-auto divide-y divide-[#e7effa]">
            {filteredList.length === 0 ? (
              <div className="p-6 text-center space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-[#07244d]">
                  {activeListTab === 'OFFICE'
                    ? 'Hiện không có hồ sơ nào đang trình trên Office'
                    : 'Không tìm thấy hồ sơ phù hợp'}
                </p>
                {activeListTab === 'OFFICE' && allRelevantTrips.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveListTab('ALL')}
                    className="px-3.5 py-1.5 bg-[#eaf2ff] hover:bg-[#d8e8ff] text-[#0b4ea8] border border-[#b8d4ff] rounded-full text-[11px] font-extrabold transition cursor-pointer"
                  >
                    Xem tất cả hồ sơ ({allRelevantTrips.length})
                  </button>
                )}
              </div>
            ) : (
              pagination.pageItems.map((item) => {
                const isSelected = trip?.id === item.id;
                const itemCanonical = normalizeStatus(item.status);
                const itemStatus = getStatusInfo(itemCanonical);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectOrder(item)}
                    className={`w-full text-left p-3.5 transition cursor-pointer block ${
                      isSelected
                        ? 'bg-[#eaf2ff] border-l-4 border-l-[#0d62e8]'
                        : 'hover:bg-[#f8fbff] border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-extrabold text-[#07244d]">
                            {item.tripNumber}
                          </span>
                          {item.orderNumber && (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {item.orderNumber}
                            </span>
                          )}
                          {itemCanonical === 'TAM_GIU_BIEN_PHONG' && (
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-red-600 text-white">
                              Tạm giữ BP
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-black text-[#0b4ea8] mt-1 flex items-center gap-1 truncate">
                          <Ship className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {item.vesselName} ({item.vesselRegNumber})
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${itemStatus.badgeBg} ${itemStatus.badgeText} ${itemStatus.badgeBorder}`}
                        >
                          {itemStatus.label}
                        </span>
                        <ChevronRight
                          className={`w-4 h-4 transition ${
                            isSelected ? 'text-[#0d62e8]' : 'text-slate-300'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-[#526c93] tabular-nums">
                      <span className="truncate font-medium">
                        {item.departurePortName} → {item.arrivalPortName}
                      </span>
                      <span className="font-mono font-semibold text-[#27518c]">
                        {formatDateTime(item.scheduledDepartureTime)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#476b99] tabular-nums">
                      <span className="truncate">TT: {item.captainName}</span>
                      <span className="font-bold text-[#07244d] shrink-0">
                        {item.passengerCount} khách · {item.cargoTons || 0}T
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <PaginationBar
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.setCurrentPage}
            itemLabel="hồ sơ"
            compact
          />
        </aside>

        {/* CỘT PHẢI: CHI TIẾT GIÁM SÁT & BẢN XEM TRƯỚC A4 */}
        <section ref={detailPanelRef} className="lg:col-span-8 space-y-5 min-w-0">
          {!trip ? (
            <div className="p-10 text-center bg-white rounded-[22px] border border-[#dce8f7] shadow-xs">
              <p className="text-slate-500 text-sm font-medium">
                Chọn một hồ sơ ở danh sách bên trái để xem thông tin chi tiết và theo dõi Office.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white/95 border border-[#dce8f7] rounded-[22px] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#dce8f7] bg-[#f8fbff] flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-black text-[#07244d]">
                        {trip.tripNumber}
                      </span>
                      {trip.orderNumber && (
                        <span className="font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Số giấy phép: {trip.orderNumber}
                        </span>
                      )}
                      {selectedStatusInfo && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${selectedStatusInfo.badgeBg} ${selectedStatusInfo.badgeText} ${selectedStatusInfo.badgeBorder}`}
                        >
                          {selectedStatusInfo.label}
                        </span>
                      )}
                      {deptClock?.isRed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-red-100 text-red-700 border border-red-300">
                          <AlertTriangle className="w-3 h-3" />
                          Quá hạn đồng hồ Sở ({deptClock.netMinutes}p)
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-black text-[#07244d]">
                      Tàu {trip.vesselName} ({trip.vesselRegNumber}) • {trip.routeName}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFormsModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#eaf2ff] hover:bg-[#d8e8ff] text-[#0b4ea8] border border-[#b8d4ff] text-xs font-bold transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Xem hồ sơ &amp; Thông báo BQL</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('trip-detail', trip.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#07244d] text-xs font-bold transition cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Chi tiết hồ sơ</span>
                    </button>
                  </div>
                </div>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-xs tabular-nums">
                  <div className="p-3 rounded-xl bg-[#f8fbff] border border-[#dce8f7] space-y-1">
                    <span className="text-[11px] font-bold text-[#526c93] flex items-center gap-1">
                      <Anchor className="w-3.5 h-3.5 text-[#0d62e8]" />
                      Hành trình &amp; Thời gian
                    </span>
                    <p className="font-extrabold text-[#07244d] leading-snug">
                      {trip.departurePortName} → {trip.arrivalPortName}
                    </p>
                    <p className="text-[#27518c] font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{formatDateTime(trip.scheduledDepartureTime)}</span>
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#f8fbff] border border-[#dce8f7] space-y-1">
                    <span className="text-[11px] font-bold text-[#526c93] flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-[#0d62e8]" />
                      Thuyền trưởng &amp; Thuyền viên
                    </span>
                    <p className="font-extrabold text-[#07244d]">{trip.captainName}</p>
                    <p className="text-[#526c93]">
                      GCN: <strong className="text-[#07244d]">{trip.captainCertNo}</strong> ·{' '}
                      <strong>{trip.crewMembers.length}</strong> thuyền viên
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#f8fbff] border border-[#dce8f7] space-y-1">
                    <span className="text-[11px] font-bold text-[#526c93] flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-[#0d62e8]" />
                      Khách, Hàng &amp; Phí cảng
                    </span>
                    <p className="font-extrabold text-[#07244d]">
                      {trip.passengerCount} hành khách · {trip.cargoTons || 0} tấn
                    </p>
                    <p className="text-emerald-700 font-bold truncate">
                      Mã phí: {trip.feeTransactionCode || 'Có biên lai đính kèm'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#f8fbff] border border-[#dce8f7] space-y-1">
                    <span className="text-[11px] font-bold text-[#526c93] flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Kiểm tra trước trình Office
                    </span>
                    <p className="font-extrabold text-emerald-800 truncate">
                      {trip.approvalNotice?.noticeNumber
                        ? `BQL: ${trip.approvalNotice.noticeNumber}`
                        : 'Chờ BQL chấp thuận'}
                    </p>
                    <p className="text-[#526c93] truncate">
                      {trip.officeSubmissionRecord?.submittedToOfficeAt
                        ? `Trình Office: ${formatDateTime(trip.officeSubmissionRecord.submittedToOfficeAt)}`
                        : trip.deptApprovedAt
                        ? `Duyệt dự thảo: ${formatDateTime(trip.deptApprovedAt)}`
                        : 'Chưa trình Office'}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  {isSelectedIssued ? (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-extrabold text-emerald-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            Đã tải Giấy phép có dấu đỏ từ Office lên hệ thống
                            {trip.issuedAt ? ` (Phát hành lúc ${formatDateTime(trip.issuedAt)})` : ''}
                          </span>
                        </p>
                        <p className="text-emerald-800">
                          Số giấy phép: <strong className="font-mono">{trip.orderNumber}</strong>
                          {trip.issuedPdfName ? ` · Tệp: ${trip.issuedPdfName}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('view-order', trip.id)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition cursor-pointer shadow-xs"
                      >
                        Mở trang Xem / Tải Giấy phép →
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-800">
                          Trạng thái hiện tại: <strong className="text-[#0b4ea8]">{selectedStatusInfo?.label}</strong>
                        </p>
                        <p className="text-slate-600">
                          Chế độ chỉ xem dành cho Lãnh đạo / Trưởng phòng. Thao tác duyệt dự thảo, trình Office và tải Giấy phép PDF dấu đỏ thuộc thẩm quyền Chuyên viên Phòng ATGT.
                        </p>
                      </div>
                      {currentUser.role === 'OFFICER' || currentUser.role === 'ADMIN' ? (
                        <button
                          type="button"
                          onClick={() => onNavigate('internal-workflow', trip.id)}
                          className="px-4 py-2 bg-[#0d62e8] hover:bg-[#084fc0] text-white font-bold rounded-xl transition cursor-pointer shrink-0"
                        >
                          Mở bàn làm việc Chuyên viên →
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {/* BẢN XEM TRƯỚC A4 */}
              <div className="bg-white/95 border border-[#dce8f7] p-4 sm:p-6 rounded-[22px] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] flex flex-col items-center">
                <p className="text-xs font-extrabold text-[#27518c] uppercase tracking-wider mb-4 text-center">
                  {isSelectedIssued
                    ? `Bản Giấy phép rời cảng A4 — Hồ sơ ${trip.tripNumber} (Đã phát hành)`
                    : `Bản dự thảo trình ký trên Office — Hồ sơ ${trip.tripNumber} (Chưa đóng dấu đỏ)`}
                </p>
                <div className="w-full overflow-x-auto pb-2">
                  <DigitalOrderA4
                    trip={trip}
                    vessel={selectedVessel}
                    showActions={false}
                    forceShowStamp={isSelectedIssued}
                    isDraftForSignature={!isSelectedIssued}
                  />
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {trip && (
        <OfficialFormsModal
          isOpen={showFormsModal}
          onClose={() => setShowFormsModal(false)}
          trip={trip}
          vessel={selectedVessel}
          defaultTab="NOTICE"
          allowUnmask={true}
        />
      )}
    </div>
  );
};
