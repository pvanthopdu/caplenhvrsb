/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  CheckCircle2,
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
import { BpDossierReadOnlyModal } from '../../components/bp/BpDossierReadOnlyModal';
import { BpLiftStopModal } from '../../components/bp/BpStopActionModals';
import { BpDepartureControlModal } from '../../components/bp/BpDepartureControlModal';

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
          className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
        >
          <Eye className="w-4 h-4 text-slate-600" />
          <span>Xem hồ sơ</span>
        </button>

        {st === 'DA_CAP_PHEP' && (
          <button
            type="button"
            disabled={!canControlDep}
            onClick={() => setControlTrip(trip)}
            title={!canControlDep ? 'Chỉ Biên phòng gắn với bến xuất phát mới được kiểm soát xuất bến' : undefined}
            className="min-h-[44px] px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Kiểm soát xuất bến</span>
          </button>
        )}

        {canConfirmArr && (
          <button
            type="button"
            onClick={() => handleConfirmArrival(trip)}
            className="min-h-[44px] px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Anchor className="w-4 h-4" />
            <span>Xác nhận cập bến</span>
          </button>
        )}

        {canLift && (
          <button
            type="button"
            onClick={() => setLiftModalState({ stop: activeStop || null, trip })}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            {bpConfig.unitDisplayName} · Kiểm soát cuối cùng sau khi có Giấy phép
          </p>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Bảng chuyến trong ngày & Kiểm soát xuất bến
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tự động làm mới 30s · Cập nhật lúc{' '}
            <span className="font-mono tabular-nums">{lastUpdated.toLocaleTimeString('vi-VN')}</span>
            {userAssignedPort && (
              <> · Bến phụ trách: <strong>{userAssignedPort === 'PORT-01' ? 'Đảo Lớn' : 'Đảo Bé'}</strong></>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={reloadData}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Làm mới</span>
        </button>
      </div>

      {!shiftCheck.allowed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs sm:text-sm font-semibold text-amber-950 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{shiftCheck.reason}</span>
        </div>
      )}

      {actionBanner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 ${
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

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <p className="text-xs text-emerald-800 font-medium">Đã có GP • Chờ kiểm soát</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-900 mt-1">{metrics.readyControl}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5">
          <p className="text-xs text-red-700 font-medium">Đang tạm giữ Biên phòng</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-800 mt-1">{metrics.held}</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5">
          <p className="text-xs text-sky-800 font-medium">Đã xuất bến (Trên biển)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-900 mt-1">{metrics.atSea}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Đã cập bến an toàn</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">{metrics.arrived}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tàu, mã hồ sơ, số Giấy phép..."
            className="w-full min-h-[44px] pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:border-sky-600 focus:outline-none"
          />
        </div>

        <div className="relative flex items-center">
          <Filter className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <select
            value={portFilter}
            onChange={(e) => setPortFilter(e.target.value)}
            className="w-full min-h-[44px] pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:border-sky-600 focus:outline-none"
          >
            <option value="ALL">Tất cả bến cảng</option>
            {ports.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.island})
              </option>
            ))}
          </select>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusGroupFilter)}
          className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:border-sky-600 focus:outline-none"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="READY_CONTROL">Chờ Biên phòng kiểm soát xuất bến</option>
          <option value="HELD">Đang tạm giữ Biên phòng</option>
          <option value="AT_SEA">Đã xuất bến (Chờ xác nhận cập bến)</option>
          <option value="FINISHED">Đã cập bến / Hết hạn / Thu hồi</option>
          <option value="PRE_ISSUANCE">Đang xử lý tại BQL/Sở (Xem trước)</option>
        </select>
      </div>

      {/* Mobile Cards (< lg) */}
      <div className="lg:hidden space-y-3">
        {filteredTrips.map((trip) => {
          const st = getStatusInfo(trip.status);
          const vessel = vessels.find((v) => v.id === trip.vesselId);
          const pax = trip.passengers?.length > 0 ? trip.passengers.length : trip.passengerCount;
          const crewCount = trip.crewMembers?.length || 0;
          const activeStop = activeStopsMap.get(trip.id);

          return (
            <div
              key={trip.id}
              className={`rounded-xl border bg-white p-4 space-y-3 shadow-xs ${
                activeStop
                  ? 'border-red-400 bg-red-50/20'
                  : normalizeStatus(trip.status) === 'DA_CAP_PHEP'
                  ? 'border-emerald-400 bg-emerald-50/15'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Ship className="w-4 h-4 text-sky-700 shrink-0" />
                    <h2 className="font-bold text-slate-900 truncate">
                      {trip.vesselName} ({trip.vesselRegNumber})
                    </h2>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    <span className="font-mono font-semibold">{trip.tripNumber}</span>
                    {trip.orderNumber ? ` · GP ${trip.orderNumber}` : ''}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded border text-[11px] font-semibold shrink-0 ${st.badgeBg} ${st.badgeText} ${st.badgeBorder}`}
                >
                  {st.label}
                </span>
              </div>

              <div className="text-xs text-slate-700 space-y-1">
                <p>
                  {trip.departurePortName} → {trip.arrivalPortName} · Giờ dự kiến:{' '}
                  <strong className="font-mono tabular-nums">{formatTime(trip.scheduledDepartureTime)}</strong>
                </p>
                <p className="font-mono tabular-nums">
                  {crewCount} TV · {pax}/{vessel?.maxPassengers || '--'} HK
                </p>
              </div>

              {renderTripAlerts(trip)}

              {activeStop && (
                <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                  <strong>{getBpStopReasonLabel(activeStop.maLyDo)}:</strong> {activeStop.moTa}
                </p>
              )}

              {renderActionButtons(trip)}
            </div>
          );
        })}
        {filteredTrips.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Không tìm thấy chuyến tàu phù hợp bộ lọc.
          </div>
        )}
      </div>

      {/* Desktop Table (>= lg) */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Tàu / Mã hồ sơ</th>
                <th className="px-4 py-3 font-semibold">Chiều đi & Giờ DK</th>
                <th className="px-4 py-3 font-semibold">Quân số / Sức chở</th>
                <th className="px-4 py-3 font-semibold">Trạng thái & Cảnh báo</th>
                <th className="px-4 py-3 font-semibold text-right">Kiểm soát cuối cùng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTrips.map((trip) => {
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
                        ? 'bg-red-50/40'
                        : normalizeStatus(trip.status) === 'DA_CAP_PHEP'
                        ? 'bg-emerald-50/25'
                        : 'hover:bg-slate-50/80'
                    }
                  >
                    <td className="px-4 py-3 align-top">
                      <p className="font-bold text-slate-900">
                        {trip.vesselName} <span className="text-xs font-normal text-slate-500">({trip.vesselRegNumber})</span>
                      </p>
                      <p className="text-xs font-mono text-slate-600 mt-0.5">
                        {trip.tripNumber}
                        {trip.orderNumber ? ` · GP ${trip.orderNumber}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-700">
                      <p className="font-medium">
                        {trip.departurePortName} → {trip.arrivalPortName}
                      </p>
                      <p className="font-mono tabular-nums text-slate-500 mt-0.5">
                        Giờ DK: {formatTime(trip.scheduledDepartureTime)}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top font-mono tabular-nums text-xs text-slate-800">
                      <p>{crewCount} thuyền viên</p>
                      <p className="text-slate-600 mt-0.5">
                        {pax} / {vessel?.maxPassengers || '--'} hành khách
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top space-y-1.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${st.badgeBg} ${st.badgeText} ${st.badgeBorder}`}
                      >
                        {st.label}
                      </span>
                      {renderTripAlerts(trip)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end">{renderActionButtons(trip)}</div>
                    </td>
                  </tr>
                );
              })}
              {filteredTrips.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Không có chuyến nào phù hợp bộ lọc hiện tại.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
            setActionBanner({
              type: 'ok',
              text:
                st === 'DA_XUAT_BEN'
                  ? `Đã hoàn tất kiểm soát cuối cùng — CHO XUẤT BẾN tàu ${updated.vesselName}.`
                  : st === 'TRA_CHU_TAU'
                  ? `Đã trả hồ sơ ${updated.tripNumber} về Chủ tàu do vi phạm R12 (Giấy phép cũ đã đình chỉ).`
                  : `Đã lập biên bản Tạm giữ / Đình chỉ xuất bến tàu ${updated.vesselName}.`,
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
