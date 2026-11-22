/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertOctagon,
  AlertTriangle,
  Anchor,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  FileDown,
  Ship,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { TripRecord, UserAccount } from '../../types';
import { repository } from '../../services/repository';
import { downloadOrderPdf } from '../../utils/exportUtils';
import {
  formatDateTime,
  formatMetric1,
  formatTime,
  roundMetric1,
  roundOverdueMinutes,
} from '../../utils/formatters';
import { getUserAssignedPortId, normalizeStatus } from '../../utils/userPermissions';
import { BpDossierReadOnlyModal } from '../../components/bp/BpDossierReadOnlyModal';
import { PaginationBar, usePagination } from '../../components/PaginationBar';

interface BpAtSeaMonitorPageProps {
  currentUser: UserAccount;
}

function getSarOnboardManifest(trip: TripRecord) {
  const control = trip.bpDepartureControl;
  const checklist = control?.checklist || [];
  const hasChecklist = checklist.length > 0;

  if (!hasChecklist) {
    const crew = trip.crewMembers || [];
    const pax = trip.passengers || [];
    const paxCount = pax.length > 0 ? pax.length : trip.passengerCount;
    return {
      crew,
      pax,
      absent: [] as Array<{ fullName: string; roleLabel: string; idNumber?: string }>,
      crewCount: crew.length,
      paxCount,
      totalActual: crew.length + paxCount,
      totalDeclared: crew.length + paxCount,
      hasActualControl: false,
    };
  }

  const onboardCrewIds = new Set(
    checklist
      .filter((i) => i.personType === 'CREW' && (i.isOnboard || i.boarded))
      .map((i) => i.personId)
  );
  const onboardPaxIds = new Set(
    checklist
      .filter((i) => i.personType === 'PASSENGER' && (i.isOnboard || i.boarded))
      .map((i) => i.personId)
  );

  const crew = (trip.crewMembers || []).filter((c, idx) =>
    onboardCrewIds.has(c.crewId || `CREW-${idx}`)
  );
  const pax = (trip.passengers || []).filter((p, idx) =>
    onboardPaxIds.has(p.id || `PAX-${idx}`)
  );
  const absent = checklist
    .filter((i) => !(i.isOnboard || i.boarded))
    .map((i) => ({
      fullName: i.fullName,
      roleLabel: i.personType === 'CREW' ? i.positionTitle || 'Thuyền viên' : 'Hành khách',
      idNumber: i.idNumber,
    }));

  const crewCount = control?.actualCrewCount ?? crew.length;
  const paxCount = control?.actualPassengerCount ?? pax.length;
  const totalActual = control?.actualTotalPeople ?? crewCount + paxCount;
  const totalDeclared =
    control?.scheduledTotalPeople ?? (trip.crewMembers?.length || 0) + (trip.passengers?.length || trip.passengerCount);

  return {
    crew,
    pax,
    absent,
    crewCount,
    paxCount,
    totalActual,
    totalDeclared,
    hasActualControl: true,
  };
}

export const BpAtSeaMonitorPage: React.FC<BpAtSeaMonitorPageProps> = ({ currentUser }) => {
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [viewTrip, setViewTrip] = useState<TripRecord | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const bpConfig = useMemo(() => repository.getBpConfig(), [nowMs]);
  const trips = useMemo(() => repository.getTrips(), [nowMs]);
  const userPort = useMemo(() => getUserAssignedPortId(currentUser), [currentUser]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    const unsub = repository.subscribe(() => setNowMs(Date.now()));
    return () => {
      window.clearInterval(timer);
      unsub();
    };
  }, []);

  const underwayList = useMemo(() => {
    return trips
      .filter((t) => normalizeStatus(t.status) === 'DA_XUAT_BEN')
      .map((trip) => {
        const depIso = trip.actualDepartureTime || trip.scheduledDepartureTime;
        const depMs = new Date(depIso).getTime();
        const rawElapsed = Number.isNaN(depMs)
          ? 0
          : Math.max(0, (nowMs - depMs) / 60000);
        const elapsedMinutes = roundMetric1(rawElapsed);
        const isOutbound = trip.departurePortId === 'PORT-01';
        const standardMinutes = isOutbound
          ? bpConfig.standardTransitMinutesOutbound
          : bpConfig.standardTransitMinutesInbound;
        const alertThreshold = standardMinutes + bpConfig.overdueGraceMinutes;
        const isOverdue = rawElapsed > alertThreshold;
        const overdueMinutes = isOverdue ? roundOverdueMinutes(rawElapsed - alertThreshold) : 0;

        return {
          trip,
          depIso,
          elapsedMinutes,
          standardMinutes,
          alertThreshold,
          isOverdue,
          overdueMinutes,
        };
      })
      .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || b.elapsedMinutes - a.elapsedMinutes);
  }, [trips, nowMs, bpConfig]);

  const pagination = usePagination(underwayList, currentUser.id);

  const unacknowledgedOverdue = useMemo(
    () => underwayList.filter((item) => item.isOverdue && !acknowledgedIds.includes(item.trip.id)),
    [underwayList, acknowledgedIds]
  );

  useEffect(() => {
    if (!soundEnabled || unacknowledgedOverdue.length === 0) return;

    const playAlertBeep = () => {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = audioCtxRef.current || new AudioCtx();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.36);
      } catch {
        // ignore audio restriction
      }
    };

    playAlertBeep();
    const beepTimer = window.setInterval(playAlertBeep, 20000);
    return () => window.clearInterval(beepTimer);
  }, [soundEnabled, unacknowledgedOverdue.length]);

  const handleConfirmArrival = (trip: TripRecord) => {
    const res = repository.confirmVesselArrival(trip.id, currentUser);
    if (!res.success) {
      setBannerMsg({ type: 'err', text: res.error || 'Không thể xác nhận đã cập bến.' });
      return;
    }
    setBannerMsg({
      type: 'ok',
      text: `Đã xác nhận tàu ${trip.vesselName} cập bến ${trip.arrivalPortName} an toàn.`,
    });
    setNowMs(Date.now());
  };

  const handleExportSarManifest = async (trip: TripRecord) => {
    setExportingId(trip.id);
    setBannerMsg(null);

    try {
      repository.logPersonalDataAccess({
        hoSoId: trip.id,
        lyDo: 'Xuất danh sách người thực tế trên tàu phục vụ tìm kiếm cứu nạn (BP)',
        actor: currentUser,
      });

      const sar = getSarOnboardManifest(trip);

      const crewRows = sar.crew.map((c, idx) => ({
        STT: idx + 1,
        'Họ và tên': c.fullName,
        'Chức danh': c.positionTitle,
        'Số bằng/Chứng chỉ': c.certNumber,
        'Quốc tịch': c.nationality || 'Việt Nam',
      }));
      const paxRows = sar.pax.map((p, idx) => ({
        STT: idx + 1,
        'Họ và tên': p.fullName,
        'Năm sinh': p.birthYear,
        'Giới tính': p.gender === 'NAM' ? 'Nam' : p.gender === 'NU' ? 'Nữ' : 'Khác',
        'Số CCCD/Hộ chiếu': p.idNumber,
        'Số điện thoại': p.phone,
        'Địa chỉ': p.address,
      }));
      const absentRows = sar.absent.map((a, idx) => ({
        STT: idx + 1,
        'Họ và tên': a.fullName,
        'Phân loại': a.roleLabel,
        'CCCD/Chứng chỉ': a.idNumber || '---',
        'Ghi chú': 'Vắng mặt, không lên tàu khi xuất bến',
      }));
      const summaryRows = [
        {
          'Mã hồ sơ': trip.tripNumber,
          'Số Giấy phép': trip.orderNumber || '',
          'Tên tàu': trip.vesselName,
          'Số đăng ký': trip.vesselRegNumber,
          'Tuyến': trip.routeName,
          'Giờ xuất bến thực tế': formatDateTime(trip.actualDepartureTime || trip.scheduledDepartureTime),
          'Thuyền viên thực tế trên tàu': sar.crewCount,
          'Hành khách thực tế trên tàu': sar.paxCount,
          'Tổng người thực tế trên tàu (TKCN)': sar.totalActual,
          'Số người vắng mặt không lên tàu': sar.absent.length,
          'Người xuất': currentUser.fullName,
          'Thời điểm xuất': formatDateTime(new Date().toISOString()),
        },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ThongTinChuyen');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(crewRows), 'ThuyenVienThucTe');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          paxRows.length > 0
            ? paxRows
            : [{ 'Ghi chú': `Thực tế có ${sar.paxCount} hành khách trên tàu.` }]
        ),
        'HanhKhachThucTe'
      );
      if (absentRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(absentRows), 'VangMatKhongLenTau');
      }
      XLSX.writeFile(wb, `SAR_Danh_sach_nguoi_tren_tau_${trip.tripNumber}.xlsx`);

      await downloadOrderPdf(
        `bp-sar-manifest-${trip.id}`,
        `SAR_Danh_sach_nguoi_tren_tau_${trip.tripNumber}.pdf`
      );

      setBannerMsg({
        type: 'ok',
        text: `Đã xuất đồng thời Excel & PDF danh sách ${sar.totalActual} người thực tế trên tàu ${trip.vesselName} (${trip.tripNumber}) phục vụ TKCN.`,
      });
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            {bpConfig.unitDisplayName} · Giám sát hành trình & Đón tàu cập bến
          </p>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Theo dõi tàu đang chạy trên biển (ĐÃ XUẤT BẾN)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thời gian chuẩn: <strong className="font-mono">{bpConfig.standardTransitMinutesOutbound}</strong> phút (Đảo Lớn → Đảo Bé) /{' '}
            <strong className="font-mono">{bpConfig.standardTransitMinutesInbound}</strong> phút (chiều về) · Cảnh báo đỏ khi quá +
            <strong className="font-mono">{bpConfig.overdueGraceMinutes}</strong> phút.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSoundEnabled((v) => !v)}
          className={`min-h-[44px] px-4 py-2 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
            soundEnabled
              ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
              : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          <span>{soundEnabled ? 'Còi cảnh báo: BẬT' : 'Còi cảnh báo: TẮT'}</span>
        </button>
      </div>

      {unacknowledgedOverdue.length > 0 && (
        <div className="rounded-xl border-2 border-red-500 bg-red-700 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-start gap-3">
            <BellRing className="w-6 h-6 shrink-0 animate-pulse mt-0.5" />
            <div>
              <p className="font-extrabold text-sm sm:text-base">
                CẢNH BÁO ĐỎ: {unacknowledgedOverdue.length} TÀU CHƯA XÁC NHẬN CẬP BẾN QUÁ THỜI GIAN CHUẨN!
              </p>
              <p className="text-xs text-red-100 mt-0.5">
                Đề nghị trực ban Biên phòng liên lạc VHF/điện thoại ngay với thuyền trưởng hoặc xuất danh sách người trên tàu phục vụ TKCN.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setAcknowledgedIds((prev) => [
                ...new Set([...prev, ...unacknowledgedOverdue.map((u) => u.trip.id)]),
              ])
            }
            className="min-h-[44px] px-4 py-2 rounded-lg bg-white text-red-800 font-bold text-xs sm:text-sm hover:bg-red-50 shrink-0 cursor-pointer"
          >
            Đã tiếp nhận cảnh báo
          </button>
        </div>
      )}

      {bannerMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm flex items-center gap-2 ${
            bannerMsg.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          {bannerMsg.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
          )}
          <span>{bannerMsg.text}</span>
        </div>
      )}

      <div className="space-y-3">
        {pagination.pageItems.map(({ trip, depIso, elapsedMinutes, standardMinutes, alertThreshold, isOverdue, overdueMinutes }) => {
          const sar = getSarOnboardManifest(trip);
          const paxCount = sar.paxCount;
          const crewCount = sar.crewCount;
          const canConfirmArrivalHere =
            currentUser.role === 'ADMIN' || !userPort || trip.arrivalPortId === userPort;

          return (
            <div
              key={trip.id}
              className={`rounded-xl border p-4 sm:p-5 bg-white shadow-xs space-y-3 ${
                isOverdue ? 'border-red-500 bg-red-50/40' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isOverdue ? 'bg-red-700 text-white' : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {isOverdue ? <AlertOctagon className="w-5 h-5" /> : <Ship className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">
                      {trip.vesselName} ({trip.vesselRegNumber})
                    </h2>
                    <p className="text-xs text-slate-600">
                      <span className="font-mono">{trip.tripNumber}</span>
                      {trip.orderNumber ? ` · GP ${trip.orderNumber}` : ''} · {trip.departurePortName} → {trip.arrivalPortName}
                    </p>
                  </div>
                </div>

                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono tabular-nums text-xs sm:text-sm font-bold ${
                    isOverdue ? 'bg-red-700 text-white' : 'bg-sky-100 text-sky-900'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>
                    Đã chạy {formatMetric1(elapsedMinutes)} phút (Ngưỡng {alertThreshold}p)
                    {isOverdue && overdueMinutes > 0 ? ` · Quá hạn +${overdueMinutes} phút` : ''}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                  <p className="text-slate-500">Rời bến lúc</p>
                  <p className="font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {formatTime(depIso)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                  <p className="text-slate-500">Thời gian chuẩn</p>
                  <p className="font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {standardMinutes} phút (+{bpConfig.overdueGraceMinutes}p)
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                  <p className="text-slate-500">Thuyền trưởng</p>
                  <p className="font-bold text-slate-900 mt-0.5 truncate">{trip.captainName}</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                  <p className="text-slate-500">Người thực tế trên tàu (TKCN)</p>
                  <p className="font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {crewCount} TV + {paxCount} HK = {sar.totalActual} người
                    {sar.absent.length > 0 ? ` (vắng ${sar.absent.length})` : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setViewTrip(trip)}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Xem hồ sơ</span>
                </button>

                <button
                  type="button"
                  disabled={!canConfirmArrivalHere}
                  onClick={() => handleConfirmArrival(trip)}
                  title={!canConfirmArrivalHere ? `Chỉ Biên phòng bến đến (${trip.arrivalPortName}) được xác nhận cập bến` : undefined}
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Anchor className="w-4 h-4" />
                  <span>Xác nhận đã cập {trip.arrivalPortName}</span>
                </button>

                <button
                  type="button"
                  disabled={exportingId === trip.id}
                  onClick={() => void handleExportSarManifest(trip)}
                  className={`min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50 cursor-pointer ${
                    isOverdue ? 'bg-red-700 hover:bg-red-800' : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  <FileDown className="w-4 h-4" />
                  <span>
                    {exportingId === trip.id
                      ? 'Đang tạo Excel & PDF...'
                      : 'Xuất danh sách TKCN (Excel + PDF)'}
                  </span>
                </button>
              </div>

              {/* Hidden off-screen A4 PDF SAR Manifest */}
              <div className="fixed -left-[9999px] top-0 pointer-events-none">
                <div
                  id={`bp-sar-manifest-${trip.id}`}
                  className="w-[794px] bg-white text-black p-8 font-serif text-xs space-y-4"
                >
                  <div className="flex justify-between items-start border-b border-black pb-3">
                    <div>
                      <p className="font-bold uppercase text-sm">{bpConfig.unitDisplayName}</p>
                      <p>Phân hệ Giám sát & Tìm kiếm cứu nạn</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold uppercase">DANH SÁCH NGƯỜI TRÊN TÀU (TKCN)</p>
                      <p>Mã hồ sơ: {trip.tripNumber} {trip.orderNumber ? `· GP: ${trip.orderNumber}` : ''}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <p>Phương tiện: <strong>{trip.vesselName} ({trip.vesselRegNumber})</strong></p>
                    <p>Tuyến: <strong>{trip.departurePortName} → {trip.arrivalPortName}</strong></p>
                    <p>Thuyền trưởng: <strong>{trip.captainName}</strong></p>
                    <p>Giờ xuất bến thực tế: <strong>{formatDateTime(depIso)}</strong></p>
                    <p>Tổng thực tế trên tàu: <strong>{sar.totalActual} người ({crewCount} TV, {paxCount} HK{sar.absent.length > 0 ? `, vắng ${sar.absent.length}` : ''})</strong></p>
                    <p>Người xuất: <strong>{currentUser.fullName}</strong> ({formatDateTime(new Date().toISOString())})</p>
                  </div>
                  <div>
                    <p className="font-bold mb-1">I. DANH SÁCH THUYỀN VIÊN THỰC TẾ TRÊN TÀU ({crewCount} người)</p>
                    <table className="w-full border-collapse border border-black text-[11px]">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-2 py-1">STT</th>
                          <th className="border border-black px-2 py-1 text-left">Họ và tên</th>
                          <th className="border border-black px-2 py-1 text-left">Chức danh</th>
                          <th className="border border-black px-2 py-1">Số chứng chỉ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sar.crew.map((c, idx) => (
                          <tr key={c.crewId || idx}>
                            <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>
                            <td className="border border-black px-2 py-1">{c.fullName}</td>
                            <td className="border border-black px-2 py-1">{c.positionTitle}</td>
                            <td className="border border-black px-2 py-1 text-center">{c.certNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="font-bold mb-1">II. DANH SÁCH HÀNH KHÁCH THỰC TẾ TRÊN TÀU ({paxCount} người)</p>
                    <table className="w-full border-collapse border border-black text-[11px]">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-2 py-1">STT</th>
                          <th className="border border-black px-2 py-1 text-left">Họ và tên</th>
                          <th className="border border-black px-2 py-1">Năm sinh</th>
                          <th className="border border-black px-2 py-1">CCCD/HC</th>
                          <th className="border border-black px-2 py-1">Điện thoại</th>
                          <th className="border border-black px-2 py-1 text-left">Địa chỉ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sar.pax.map((p, idx) => (
                          <tr key={p.id || idx}>
                            <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>
                            <td className="border border-black px-2 py-1">{p.fullName}</td>
                            <td className="border border-black px-2 py-1 text-center">{p.birthYear}</td>
                            <td className="border border-black px-2 py-1 text-center">{p.idNumber}</td>
                            <td className="border border-black px-2 py-1 text-center">{p.phone}</td>
                            <td className="border border-black px-2 py-1">{p.address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sar.absent.length > 0 && (
                    <div>
                      <p className="font-bold mb-1">III. NGƯỜI VẮNG MẶT KHÔNG LÊN TÀU ({sar.absent.length} người)</p>
                      <p className="text-[11px]">
                        {sar.absent.map((a) => `${a.fullName} (${a.roleLabel}${a.idNumber ? ` · ${a.idNumber}` : ''})`).join('; ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {underwayList.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Hiện không có tàu nào đang hành trình trên biển.
          </div>
        )}

        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white empty:hidden">
          <PaginationBar
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.setCurrentPage}
            itemLabel="tàu đang chạy"
            className="border-t-0"
          />
        </div>
      </div>

      <BpDossierReadOnlyModal
        isOpen={Boolean(viewTrip)}
        onClose={() => setViewTrip(null)}
        trip={viewTrip}
        actor={currentUser}
      />
    </div>
  );
};
