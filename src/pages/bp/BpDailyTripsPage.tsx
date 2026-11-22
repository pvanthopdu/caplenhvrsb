/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  Filter,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Ship,
} from 'lucide-react';
import { DeNghiDung, TripRecord, UserAccount } from '../../types';
import { repository } from '../../services/repository';
import { RulesEngine } from '../../services/rulesEngine';
import {
  formatTime,
  getBpStopReasonLabel,
  getStatusInfo,
} from '../../utils/formatters';
import { getUserAssignedPortId, normalizeStatus } from '../../utils/userPermissions';
import { BpHeroBanner } from '../../components/bp/BpHeroBanner';
import { BpDossierReadOnlyModal } from '../../components/bp/BpDossierReadOnlyModal';
import { BpLiftStopModal } from '../../components/bp/BpStopActionModals';
import { BpDepartureControlModal } from '../../components/bp/BpDepartureControlModal';
import { PaginationBar, usePagination } from '../../components/PaginationBar';

interface BpDailyTripsPageProps {
  currentUser: UserAccount;
  initialTripId?: string;
}

type StatusGroupFilter =
  | 'ALL'
  | 'READY_CONTROL'
  | 'HELD'
  | 'AT_SEA'
  | 'FINISHED'
  | 'PRE_ISSUANCE';

const CardWaveAccent: React.FC<{ color: string }> = ({ color }) => (
  <svg
    viewBox="0 0 220 56"
    preserveAspectRatio="none"
    aria-hidden="true"
    className="absolute right-0 bottom-0 w-[72%] h-12 pointer-events-none select-none"
  >
    <path
      d="M0 44 C45 34, 85 52, 130 32 C168 15, 194 24, 220 12 L220 56 L0 56 Z"
      fill={color}
      fillOpacity="0.22"
    />
    <path
      d="M28 56 C78 36, 120 48, 166 28 C190 18, 206 20, 220 14 L220 56 Z"
      fill={color}
      fillOpacity="0.16"
    />
  </svg>
);

const HeldClockStopIcon: React.FC = () => (
  <svg viewBox="0 0 36 36" className="w-8 h-8" fill="none" aria-hidden="true">
    <circle cx="16.5" cy="17.5" r="11" fill="#b91c1c" />
    <path d="M16.5 11.5V17.5L20.5 19.8" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="25.5" cy="24.5" r="6" fill="#fef2f2" stroke="#b91c1c" strokeWidth="2" />
    <path d="M23.2 22.2L27.8 26.8" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ShieldStarIcon: React.FC = () => (
  <svg viewBox="0 0 36 36" className="w-8 h-8" fill="none" aria-hidden="true">
    <path
      d="M18 4.5L7.5 8.8V17.2C7.5 23.7 11.9 29.4 18 31.5C24.1 29.4 28.5 23.7 28.5 17.2V8.8L18 4.5Z"
      fill="#0b5ed7"
    />
    <path
      d="M18 11.2L19.9 15.1L24.2 15.7L21.1 18.7L21.8 23L18 21L14.2 23L14.9 18.7L11.8 15.7L16.1 15.1L18 11.2Z"
      fill="#ffffff"
    />
  </svg>
);

const CheckeredFlagIcon: React.FC = () => (
  <svg viewBox="0 0 36 36" className="w-8 h-8" fill="none" aria-hidden="true">
    <path d="M10.5 8V29" stroke="#5b21b6" strokeWidth="2.5" strokeLinecap="round" />
    <path
      d="M11.5 9.5C15.5 7.5 19.5 11.5 24 9.5C25.5 8.8 26.8 8.6 28 9V20.5C26.5 20.1 25.2 20.4 23.8 21C19.5 22.9 15.5 19 11.5 21V9.5Z"
      fill="#ffffff"
      stroke="#5b21b6"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <rect x="12" y="10" width="3.8" height="3.5" fill="#6d28d9" />
    <rect x="19.6" y="10.4" width="3.8" height="3.5" fill="#6d28d9" />
    <rect x="15.8" y="13.5" width="3.8" height="3.5" fill="#6d28d9" />
    <rect x="23.4" y="13.3" width="3.8" height="3.5" fill="#6d28d9" />
    <rect x="12" y="16.8" width="3.8" height="3.5" fill="#6d28d9" />
    <rect x="19.6" y="17.1" width="3.8" height="3.5" fill="#6d28d9" />
  </svg>
);

export const BpDailyTripsPage: React.FC<BpDailyTripsPageProps> = ({ currentUser, initialTripId }) => {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [bpStops, setBpStops] = useState<DeNghiDung[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [portFilter, setPortFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusGroupFilter>('ALL');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [actionBanner, setActionBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [viewTrip, setViewTrip] = useState<TripRecord | null>(null);
  const [controlTrip, setControlTrip] = useState<TripRecord | null>(null);
  const [liftModalState, setLiftModalState] = useState<{
    stop: DeNghiDung | null;
    trip: TripRecord;
  } | null>(null);

  const bpConfig = useMemo(() => repository.getBpConfig(), [lastUpdated]);
  const ports = useMemo(() => repository.getPorts(), []);
  const vessels = useMemo(() => repository.getVessels(), []);
  const weather = useMemo(() => repository.getWeather(), [lastUpdated]);
  const rulesConfig = useMemo(() => repository.getRulesConfig(), [lastUpdated]);
  const userAssignedPort = useMemo(() => getUserAssignedPortId(currentUser), [currentUser]);
  const shiftCheck = useMemo(
    () => repository.validateShiftAndPortForAction(currentUser),
    [currentUser, lastUpdated]
  );

  const reloadData = useCallback(() => {
    repository.sweepExpiredPermits();
    setTrips(repository.getTrips());
    setBpStops(repository.getDeNghiDungs());
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    reloadData();
    const unsub = repository.subscribe(reloadData);
    const timer = window.setInterval(reloadData, 30000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [reloadData]);

  useEffect(() => {
    if (!initialTripId) return;
    const target = repository.getTrips().find((t) => t.id === initialTripId);
    if (target) {
      if (normalizeStatus(target.status) === 'DA_CAP_PHEP') {
        setControlTrip(target);
      } else {
        setViewTrip(target);
      }
    }
  }, [initialTripId]);

  const activeStopsMap = useMemo(() => {
    const map = new Map<string, DeNghiDung>();
    bpStops.forEach((d) => {
      if (d.trangThai === 'dang_hieu_luc') {
        map.set(d.hoSoId, d);
      }
    });
    return map;
  }, [bpStops]);

  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trips
      .filter((t) => {
        const st = normalizeStatus(t.status);
        if (portFilter !== 'ALL' && t.departurePortId !== portFilter && t.arrivalPortId !== portFilter) {
          return false;
        }
        if (statusFilter === 'READY_CONTROL' && st !== 'DA_CAP_PHEP') return false;
        if (statusFilter === 'HELD' && st !== 'TAM_GIU_BIEN_PHONG') return false;
        if (statusFilter === 'AT_SEA' && st !== 'DA_XUAT_BEN') return false;
        if (
          statusFilter === 'FINISHED' &&
          !['DA_CAP_BEN', 'HET_HIEU_LUC', 'THU_HOI'].includes(st)
        ) {
          return false;
        }
        if (
          statusFilter === 'PRE_ISSUANCE' &&
          ['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG', 'DA_XUAT_BEN', 'DA_CAP_BEN', 'HET_HIEU_LUC', 'THU_HOI'].includes(st)
        ) {
          return false;
        }

        if (q) {
          const hay = `${t.tripNumber} ${t.orderNumber || ''} ${t.vesselName} ${t.vesselRegNumber} ${t.captainName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const order = (s: string) => {
          const st = normalizeStatus(s);
          if (st === 'DA_CAP_PHEP') return 0;
          if (st === 'TAM_GIU_BIEN_PHONG') return 1;
          if (st === 'DA_XUAT_BEN') return 2;
          return 3;
        };
        return order(a.status) - order(b.status);
      });
  }, [trips, portFilter, statusFilter, searchQuery]);

  const pagination = usePagination(
    filteredTrips,
    `${portFilter}|${statusFilter}|${searchQuery.trim().toLowerCase()}`
  );

  const metrics = useMemo(() => {
    const readyControl = trips.filter((t) => normalizeStatus(t.status) === 'DA_CAP_PHEP').length;
    const held = trips.filter((t) => normalizeStatus(t.status) === 'TAM_GIU_BIEN_PHONG').length;
    const atSea = trips.filter((t) => normalizeStatus(t.status) === 'DA_XUAT_BEN').length;
    const arrived = trips.filter((t) => normalizeStatus(t.status) === 'DA_CAP_BEN').length;
    return { readyControl, held, atSea, arrived };
  }, [trips]);

  const handleConfirmArrival = (trip: TripRecord) => {
    const res = repository.confirmVesselArrival(trip.id, currentUser);
    if (!res.success) {
      setActionBanner({ type: 'err', text: res.error || 'Không thể xác nhận cập bến.' });
      return;
    }
    setActionBanner({
      type: 'ok',
      text: `Đã xác nhận tàu ${trip.vesselName} cập ${trip.arrivalPortName} an toàn.`,
    });
    reloadData();
  };

  const toggleStatusCard = (target: StatusGroupFilter) => {
    setStatusFilter((prev) => (prev === target ? 'ALL' : target));
  };

  const renderTripAlerts = (trip: TripRecord) => {
    const activeStop = activeStopsMap.get(trip.id);
    const control = repository.getLatestKiemSoatForTrip(trip.id);
    const vessel = vessels.find((v) => v.id === trip.vesselId);
    const evalRes = RulesEngine.evaluateAllRules(
      trip,
      vessel,
      trip.crewMembers || [],
      weather,
      trips,
      rulesConfig,
      Array.from(activeStopsMap.values())
    );
    const failedRules = evalRes.results.filter((r) => r.status !== 'PASSED');

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {activeStop && (
          <span className="inline-flex items-center gap-1 font-bold text-red-700">
            <ShieldAlert className="w-3.5 h-3.5" />
            Tạm giữ: {getBpStopReasonLabel(activeStop.maLyDo)}
          </span>
        )}
        {control?.ketQua === 'chenh_lech' && (
          <span className="inline-flex items-center gap-1 font-bold text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            Chênh lệch ({control.soNguoiThucTe}/{control.soNguoiTheoDanhSach})
          </span>
        )}
        {failedRules.slice(0, 2).map((r) => (
          <span
            key={r.ruleCode}
            className={`inline-flex items-center gap-1 font-medium ${
              r.status === 'FAILED' ? 'text-red-700' : 'text-amber-700'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            {r.ruleCode}
          </span>
        ))}
      </div>
    );
  };

  const renderActionButtons = (trip: TripRecord) => {
    const st = normalizeStatus(trip.status);
    const activeStop = activeStopsMap.get(trip.id);
    const canControlDep =
      st === 'DA_CAP_PHEP' &&
      (currentUser.role === 'ADMIN' || !userAssignedPort || trip.departurePortId === userAssignedPort);
    const canConfirmArr =
      st === 'DA_XUAT_BEN' &&
      (currentUser.role === 'ADMIN' || !userAssignedPort || trip.arrivalPortId === userAssignedPort);
    const canLift =
      st === 'TAM_GIU_BIEN_PHONG' &&
      (activeStop ? repository.canUserLiftBpStop(currentUser, activeStop) : currentUser.role === 'BP_CHIHUY' || currentUser.role === 'ADMIN');

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setViewTrip(trip)}
          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#cfe0f7] bg-white hover:bg-[#f2f7ff] text-xs font-bold text-[#143a70] flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
        >
          <Eye className="w-4 h-4 text-[#2e67b8]" />
          <span>Xem hồ sơ</span>
        </button>

        {st === 'DA_CAP_PHEP' && (
          <button
            type="button"
            disabled={!canControlDep}
            onClick={() => setControlTrip(trip)}
            title={!canControlDep ? 'Chỉ Biên phòng gắn với bến xuất phát mới được kiểm soát xuất bến' : undefined}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Kiểm soát xuất bến</span>
          </button>
        )}

        {canConfirmArr && (
          <button
            type="button"
            onClick={() => handleConfirmArrival(trip)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0d62e8] hover:bg-[#0950bf] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition whitespace-nowrap"
          >
            <Anchor className="w-4 h-4" />
            <span>Xác nhận cập bến</span>
          </button>
        )}

        {canLift && (
          <button
            type="button"
            onClick={() => setLiftModalState({ stop: activeStop || null, trip })}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Gỡ tạm giữ</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Banner đầu trang Đồn Biên phòng Lý Sơn */}
      <BpHeroBanner
        kicker={bpConfig.unitDisplayName}
        title="Bảng chuyến trong ngày & Kiểm soát xuất bến"
        subtitleNode={
          <>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#3470c7] shrink-0" />
              <span>Tự động làm mới 30s</span>
            </span>
            <span className="text-[#9ec0ec] hidden sm:inline" aria-hidden="true">|</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#3470c7] shrink-0" />
              <span>
                Cập nhật lúc{' '}
                <strong className="font-mono tabular-nums text-[#0b2e66]">
                  {lastUpdated.toLocaleTimeString('vi-VN')}
                </strong>
              </span>
            </span>
            <span className="text-[#9ec0ec] hidden sm:inline" aria-hidden="true">|</span>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-[#3470c7] shrink-0" />
              <span>
                Bến phụ trách:{' '}
                <strong className="text-[#0b2e66]">
                  {userAssignedPort
                    ? userAssignedPort === 'PORT-01'
                      ? 'Đảo Lớn'
                      : 'Đảo Bé'
                    : 'Đảo Lớn & Đảo Bé'}
                </strong>
              </span>
            </span>
          </>
        }
        rightAction={
          <button
            type="button"
            onClick={reloadData}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-b from-[#1a7ff5] to-[#0a57c8] hover:from-[#2488ff] hover:to-[#084bb0] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-[0_8px_18px_-6px_rgba(10,87,200,0.6)] border border-white/35 cursor-pointer whitespace-nowrap transition active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Làm mới</span>
          </button>
        }
      />

      {/* Thanh trạng thái ca trực Biên phòng */}
      {shiftCheck.allowed && shiftCheck.shift ? (
        <div className="rounded-2xl border border-[#b4ecc9] bg-gradient-to-r from-[#e9fcf1] via-[#effdf5] to-[#def8ea] px-4 py-2.5 shadow-[0_4px_14px_-8px_rgba(15,157,72,0.22)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-6 h-6 rounded-full bg-[#0f9d48] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
            <span className="text-xs sm:text-sm text-[#0c3f24] truncate">
              Đang trong ca trực:{' '}
              <strong className="font-extrabold text-[#06321b]">
                {shiftCheck.shift.shiftName}
              </strong>
              {currentUser.email ? (
                <span className="text-[#195335]"> ({currentUser.email})</span>
              ) : null}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c5f2d6] text-[#0c6b36] text-xs font-bold font-mono tabular-nums shrink-0">
            <Clock className="w-3.5 h-3.5 text-[#0f9d48]" />
            <span>
              {shiftCheck.shift.startTime}–{shiftCheck.shift.endTime}
            </span>
          </span>
        </div>
      ) : shiftCheck.allowed ? (
        <div className="rounded-2xl border border-[#b4ecc9] bg-gradient-to-r from-[#e9fcf1] via-[#effdf5] to-[#def8ea] px-4 py-2.5 shadow-[0_4px_14px_-8px_rgba(15,157,72,0.22)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-6 h-6 rounded-full bg-[#0f9d48] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
            <span className="text-xs sm:text-sm text-[#0c3f24] truncate">
              Đang trong ca trực:{' '}
              <strong className="font-extrabold text-[#06321b]">
                Ca trực Biên phòng ({currentUser.fullName})
              </strong>
              {currentUser.email ? (
                <span className="text-[#195335]"> ({currentUser.email})</span>
              ) : null}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c5f2d6] text-[#0c6b36] text-xs font-bold font-mono tabular-nums shrink-0">
            <Clock className="w-3.5 h-3.5 text-[#0f9d48]" />
            <span>00:00–23:59</span>
          </span>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs sm:text-sm font-semibold text-amber-950 flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{shiftCheck.reason}</span>
        </div>
      )}

      {actionBanner && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 ${
            actionBanner.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionBanner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{actionBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4 Thẻ thống kê trạng thái chuyến */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* 1. Đã có GP • Chờ kiểm soát */}
        <button
          type="button"
          onClick={() => toggleStatusCard('READY_CONTROL')}
          className={`group relative overflow-hidden rounded-2xl border text-left p-4 sm:px-5 sm:py-4 transition-all duration-150 cursor-pointer bg-gradient-to-br from-[#effdf5] via-[#e4faee] to-[#cef3dd] shadow-[0_8px_20px_-14px_rgba(16,155,74,0.35)] hover:-translate-y-0.5 ${
            statusFilter === 'READY_CONTROL'
              ? 'border-[#16a34a] ring-2 ring-[#16a34a]/25'
              : 'border-[#b3eccb] hover:border-[#16a34a]'
          }`}
        >
          <span
            className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#16a34a] rounded-l-2xl"
            aria-hidden="true"
          />
          <CardWaveAccent color="#34d399" />
          <div className="relative z-10 flex items-center gap-4 pl-1.5">
            <div className="w-14 h-14 rounded-full bg-[#c5f0d6] text-[#117a3b] flex items-center justify-center shrink-0 shadow-inner">
              <Ship className="w-7 h-7 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-[#0f6b35] leading-snug truncate">
                Đã có GP • Chờ kiểm soát
              </p>
              <p className="text-3xl font-black font-mono tabular-nums text-[#0b7a38] leading-tight mt-1">
                {metrics.readyControl}
              </p>
            </div>
          </div>
        </button>

        {/* 2. Đang tạm giữ Biên phòng */}
        <button
          type="button"
          onClick={() => toggleStatusCard('HELD')}
          className={`group relative overflow-hidden rounded-2xl border text-left p-4 sm:px-5 sm:py-4 transition-all duration-150 cursor-pointer bg-gradient-to-br from-[#fff5f5] via-[#feeaea] to-[#fcd6d6] shadow-[0_8px_20px_-14px_rgba(220,38,38,0.32)] hover:-translate-y-0.5 ${
            statusFilter === 'HELD'
              ? 'border-[#dc2626] ring-2 ring-[#dc2626]/25'
              : 'border-[#f8c1c1] hover:border-[#dc2626]'
          }`}
        >
          <span
            className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#dc2626] rounded-l-2xl"
            aria-hidden="true"
          />
          <CardWaveAccent color="#f87171" />
          <div className="relative z-10 flex items-center gap-4 pl-1.5">
            <div className="w-14 h-14 rounded-full bg-[#fbd0d0] flex items-center justify-center shrink-0 shadow-inner">
              <HeldClockStopIcon />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-[#b91c1c] leading-snug truncate">
                Đang tạm giữ Biên phòng
              </p>
              <p className="text-3xl font-black font-mono tabular-nums text-[#b91c1c] leading-tight mt-1">
                {metrics.held}
              </p>
            </div>
          </div>
        </button>

        {/* 3. Đã xuất bến (Trên biển) */}
        <button
          type="button"
          onClick={() => toggleStatusCard('AT_SEA')}
          className={`group relative overflow-hidden rounded-2xl border text-left p-4 sm:px-5 sm:py-4 transition-all duration-150 cursor-pointer bg-gradient-to-br from-[#f1f8ff] via-[#e4f1ff] to-[#cce3ff] shadow-[0_8px_20px_-14px_rgba(13,98,232,0.35)] hover:-translate-y-0.5 ${
            statusFilter === 'AT_SEA'
              ? 'border-[#0d62e8] ring-2 ring-[#0d62e8]/25'
              : 'border-[#b3d4ff] hover:border-[#0d62e8]'
          }`}
        >
          <span
            className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#1565df] rounded-l-2xl"
            aria-hidden="true"
          />
          <CardWaveAccent color="#60a5fa" />
          <div className="relative z-10 flex items-center gap-4 pl-1.5">
            <div className="w-14 h-14 rounded-full bg-[#c4e0ff] flex items-center justify-center shrink-0 shadow-inner">
              <ShieldStarIcon />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-[#0b4eb8] leading-snug truncate">
                Đã xuất bến (Trên biển)
              </p>
              <p className="text-3xl font-black font-mono tabular-nums text-[#0b50b8] leading-tight mt-1">
                {metrics.atSea}
              </p>
            </div>
          </div>
        </button>

        {/* 4. Đã cập bến an toàn */}
        <button
          type="button"
          onClick={() => toggleStatusCard('FINISHED')}
          className={`group relative overflow-hidden rounded-2xl border text-left p-4 sm:px-5 sm:py-4 transition-all duration-150 cursor-pointer bg-gradient-to-br from-[#f8f3ff] via-[#efe6ff] to-[#dfd0ff] shadow-[0_8px_20px_-14px_rgba(109,40,217,0.32)] hover:-translate-y-0.5 ${
            statusFilter === 'FINISHED'
              ? 'border-[#7c3aed] ring-2 ring-[#7c3aed]/25'
              : 'border-[#d2beff] hover:border-[#7c3aed]'
          }`}
        >
          <span
            className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#7c3aed] rounded-l-2xl"
            aria-hidden="true"
          />
          <CardWaveAccent color="#a78bfa" />
          <div className="relative z-10 flex items-center gap-4 pl-1.5">
            <div className="w-14 h-14 rounded-full bg-[#dccaff] flex items-center justify-center shrink-0 shadow-inner">
              <CheckeredFlagIcon />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-[#5b21b6] leading-snug truncate">
                Đã cập bến an toàn
              </p>
              <p className="text-3xl font-black font-mono tabular-nums text-[#5b21b6] leading-tight mt-1">
                {metrics.arrived}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Thanh tìm kiếm & bộ lọc */}
      <div className="bg-white/95 rounded-2xl border border-[#dce8f8] p-3 shadow-[0_6px_20px_-12px_rgba(11,78,168,0.16)] grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#4a6b9a] absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tàu, mã hồ sơ, số Giấy phép..."
            className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-[#d6e4f5] bg-[#fafdff] focus:bg-white text-sm text-[#0c2b59] placeholder:text-[#6b86ad] focus:border-[#0d62e8] focus:ring-2 focus:ring-[#0d62e8]/15 focus:outline-none transition"
          />
        </div>

        <div className="relative flex items-center">
          <Filter className="w-4 h-4 text-[#234d8a] absolute left-3.5 pointer-events-none" />
          <select
            value={portFilter}
            onChange={(e) => setPortFilter(e.target.value)}
            aria-label="Lọc theo bến cảng"
            className="w-full min-h-[44px] pl-10 pr-9 rounded-xl border border-[#d6e4f5] bg-white text-sm font-semibold text-[#0c2b59] appearance-none focus:border-[#0d62e8] focus:ring-2 focus:ring-[#0d62e8]/15 focus:outline-none cursor-pointer transition"
          >
            <option value="ALL">Tất cả bến cảng</option>
            {ports.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.island})
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-[#234d8a] absolute right-3.5 pointer-events-none" />
        </div>

        <div className="relative flex items-center">
          <Ship className="w-4 h-4 text-[#234d8a] absolute left-3.5 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusGroupFilter)}
            aria-label="Lọc theo trạng thái"
            className="w-full min-h-[44px] pl-10 pr-9 rounded-xl border border-[#d6e4f5] bg-white text-sm font-semibold text-[#0c2b59] appearance-none focus:border-[#0d62e8] focus:ring-2 focus:ring-[#0d62e8]/15 focus:outline-none cursor-pointer transition"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="READY_CONTROL">Chờ Biên phòng kiểm soát xuất bến</option>
            <option value="HELD">Đang tạm giữ Biên phòng</option>
            <option value="AT_SEA">Đã xuất bến (Chờ xác nhận cập bến)</option>
            <option value="FINISHED">Đã cập bến / Hết hạn / Thu hồi</option>
            <option value="PRE_ISSUANCE">Đang xử lý tại BQL/Sở (Xem trước)</option>
          </select>
          <ChevronDown className="w-4 h-4 text-[#234d8a] absolute right-3.5 pointer-events-none" />
        </div>
      </div>

      {/* Mobile Cards (< lg) */}
      <div className="lg:hidden space-y-3">
        {pagination.pageItems.map((trip) => {
          const st = getStatusInfo(trip.status);
          const vessel = vessels.find((v) => v.id === trip.vesselId);
          const pax = trip.passengers?.length > 0 ? trip.passengers.length : trip.passengerCount;
          const crewCount = trip.crewMembers?.length || 0;
          const activeStop = activeStopsMap.get(trip.id);

          return (
            <div
              key={trip.id}
              className={`rounded-2xl border bg-white p-4 space-y-3 shadow-xs ${
                activeStop
                  ? 'border-red-300 bg-red-50/25'
                  : normalizeStatus(trip.status) === 'DA_CAP_PHEP'
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : 'border-[#dce8f8]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Ship className="w-4 h-4 text-[#0d62e8] shrink-0" />
                    <h2 className="font-bold text-[#072456] truncate">
                      {trip.vesselName} ({trip.vesselRegNumber})
                    </h2>
                  </div>
                  <p className="text-xs text-[#4b6891] mt-0.5">
                    <span className="font-mono font-semibold text-[#0b4ea8]">{trip.tripNumber}</span>
                    {trip.orderNumber ? ` · GP ${trip.orderNumber}` : ''}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold shrink-0 ${st.badgeBg} ${st.badgeText} ${st.badgeBorder}`}
                >
                  {st.label}
                </span>
              </div>

              <div className="text-xs text-slate-700 space-y-1">
                <p>
                  {trip.departurePortName} → {trip.arrivalPortName} · Giờ DK:{' '}
                  <strong className="font-mono tabular-nums">{formatTime(trip.scheduledDepartureTime)}</strong>
                  {trip.actualDepartureTime && (
                    <>
                      {' '}· XB thực tế:{' '}
                      <strong className="font-mono tabular-nums text-[#0b50b8]">
                        {formatTime(trip.actualDepartureTime)}
                      </strong>
                    </>
                  )}
                </p>
                <p className="font-mono tabular-nums">
                  {crewCount} TV · {pax}/{vessel?.maxPassengers || '--'} HK
                  {typeof trip.bpDepartureControl?.actualTotalPeople === 'number' &&
                    ['DA_XUAT_BEN', 'DA_CAP_BEN'].includes(normalizeStatus(trip.status)) && (
                      <span className="text-emerald-800 font-bold">
                        {' '}· Thực tế: {trip.bpDepartureControl.actualTotalPeople} người
                      </span>
                    )}
                </p>
              </div>

              {renderTripAlerts(trip)}

              {activeStop && (
                <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <strong>{getBpStopReasonLabel(activeStop.maLyDo)}:</strong> {activeStop.moTa}
                </p>
              )}

              {renderActionButtons(trip)}
            </div>
          );
        })}
        {filteredTrips.length === 0 && (
          <div className="rounded-2xl border border-[#dce8f8] bg-white p-8 text-center text-sm text-[#526c93]">
            Không tìm thấy chuyến tàu phù hợp bộ lọc.
          </div>
        )}
        <div className="rounded-2xl overflow-hidden border border-[#dce8f8] bg-white empty:hidden">
          <PaginationBar
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.setCurrentPage}
            itemLabel="chuyến tàu"
            className="border-t-0"
          />
        </div>
      </div>

      {/* Desktop Table (>= lg) */}
      <div className="hidden lg:block bg-white/95 rounded-2xl border border-[#dce8f8] overflow-hidden shadow-[0_10px_28px_-14px_rgba(11,78,168,0.16)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#eef5fe] border-b border-[#dce8f8] text-xs uppercase tracking-wide text-[#1f4882]">
              <tr>
                <th className="px-4 py-3.5 font-extrabold">Tàu / Mã hồ sơ</th>
                <th className="px-4 py-3.5 font-extrabold">Chiều đi & Giờ DK</th>
                <th className="px-4 py-3.5 font-extrabold">Quân số / Sức chở</th>
                <th className="px-4 py-3.5 font-extrabold">Trạng thái & Cảnh báo</th>
                <th className="px-4 py-3.5 font-extrabold text-right">Kiểm soát cuối cùng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8f0fb]">
              {pagination.pageItems.map((trip) => {
                const st = getStatusInfo(trip.status);
                const vessel = vessels.find((v) => v.id === trip.vesselId);
                const pax = trip.passengers?.length > 0 ? trip.passengers.length : trip.passengerCount;
                const crewCount = trip.crewMembers?.length || 0;
                const activeStop = activeStopsMap.get(trip.id);

                return (
                  <tr
                    key={trip.id}
                    className={
                      activeStop
                        ? 'bg-red-50/40 hover:bg-red-50/60 transition'
                        : normalizeStatus(trip.status) === 'DA_CAP_PHEP'
                        ? 'bg-emerald-50/25 hover:bg-emerald-50/50 transition'
                        : 'hover:bg-[#f5f9ff] transition'
                    }
                  >
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-extrabold text-[#072456]">
                        {trip.vesselName}{' '}
                        <span className="text-xs font-semibold text-[#526c93]">
                          ({trip.vesselRegNumber})
                        </span>
                      </p>
                      <p className="text-xs font-mono text-[#0b4ea8] font-semibold mt-0.5">
                        {trip.tripNumber}
                        {trip.orderNumber ? ` · GP ${trip.orderNumber}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top text-xs text-slate-700">
                      <p className="font-bold text-[#0c2b59]">
                        {trip.departurePortName} → {trip.arrivalPortName}
                      </p>
                      <p className="font-mono tabular-nums text-[#526c93] mt-0.5">
                        Giờ DK: {formatTime(trip.scheduledDepartureTime)}
                      </p>
                      {trip.actualDepartureTime && (
                        <p className="font-mono tabular-nums text-[#0b50b8] font-bold mt-0.5">
                          XB thực tế: {formatTime(trip.actualDepartureTime)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top font-mono tabular-nums text-xs text-[#0c2b59]">
                      <p className="font-semibold">{crewCount} thuyền viên</p>
                      <p className="text-[#526c93] mt-0.5">
                        {pax} / {vessel?.maxPassengers || '--'} hành khách
                      </p>
                      {typeof trip.bpDepartureControl?.actualTotalPeople === 'number' &&
                        ['DA_XUAT_BEN', 'DA_CAP_BEN'].includes(normalizeStatus(trip.status)) && (
                          <p className="text-emerald-800 font-bold mt-0.5">
                            Thực tế (TKCN): {trip.bpDepartureControl.actualTotalPeople} người
                          </p>
                        )}
                    </td>
                    <td className="px-4 py-3.5 align-top space-y-1.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-lg border text-xs font-bold ${st.badgeBg} ${st.badgeText} ${st.badgeBorder}`}
                      >
                        {st.label}
                      </span>
                      {renderTripAlerts(trip)}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex justify-end">{renderActionButtons(trip)}</div>
                    </td>
                  </tr>
                );
              })}
              {filteredTrips.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#526c93]">
                    Không có chuyến nào phù hợp bộ lọc hiện tại.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          onPageChange={pagination.setCurrentPage}
          itemLabel="chuyến tàu"
        />
      </div>

      {/* Modals */}
      <BpDossierReadOnlyModal
        isOpen={Boolean(viewTrip)}
        onClose={() => setViewTrip(null)}
        trip={viewTrip}
        actor={currentUser}
      />

      <BpDepartureControlModal
        isOpen={Boolean(controlTrip)}
        onClose={() => setControlTrip(null)}
        trip={controlTrip}
        actor={currentUser}
        onSuccess={(updated) => {
          reloadData();
          if (updated) {
            const st = normalizeStatus(updated.status);
            const actualTotal = updated.bpDepartureControl?.actualTotalPeople;
            setActionBanner({
              type: 'ok',
              text:
                st === 'DA_XUAT_BEN'
                  ? `Đạt cả 3 nội dung — CHO XUẤT BẾN tàu ${updated.vesselName} lúc ${formatTime(updated.actualDepartureTime)} (ghi nhận thực tế ${actualTotal ?? '--'} người phục vụ TKCN).`
                  : st === 'TRA_CHU_TAU'
                  ? `Đã trả hồ sơ ${updated.tripNumber} cho Chủ tàu điều chỉnh (BQL Cảng kiểm tra lại sức chở, áo phao → Sở cấp lại Giấy phép → Biên phòng kiểm soát lại).`
                  : `Đã tạm giữ tàu ${updated.vesselName} — Giấy phép tự chuyển sang "Tạm đình chỉ" khi quét mã QR.`,
            });
          }
        }}
      />

      {liftModalState && (
        <BpLiftStopModal
          isOpen={true}
          onClose={() => setLiftModalState(null)}
          stopRecord={liftModalState.stop}
          tripId={liftModalState.trip.id}
          tripNumber={liftModalState.trip.tripNumber}
          vesselName={liftModalState.trip.vesselName}
          actor={currentUser}
          onSuccess={() => {
            reloadData();
            setActionBanner({
              type: 'ok',
              text: `Đã gỡ tạm giữ Biên phòng và khôi phục Giấy phép cho tàu ${liftModalState.trip.vesselName}.`,
            });
          }}
        />
      )}
    </div>
  );
};
