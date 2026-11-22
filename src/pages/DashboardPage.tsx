/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  UserAccount,
  TripRecord,
  WeatherCondition,
  IncomingDossier,
  normalizeStatus,
} from '../types';
import { repository } from '../services/repository';
import {
  getRoleTripStatusInfo,
  formatDateTime,
  formatMetric1,
  getLocalIsoDate,
  getRoleName,
  roundOverdueMinutes,
} from '../utils/formatters';
import {
  ACTIVE_MONITORING_STATUSES,
} from '../utils/userPermissions';
import {
  getScopedTripsForUser,
  isBqlQueueStatus,
  isDeptProcessingStatus,
  isBpWaitControlStatus,
} from '../utils/systemMetrics';
import { TripTimelineTree } from '../components/TripTimelineTree';
import { PaginationBar, usePagination } from '../components/PaginationBar';
import heroSeaportImg from '../assets/images/hero_seaport_panorama_1795076039376.jpg';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Ship,
  CalendarCheck,
  ShieldCheck,
  Inbox,
  Zap,
  GitCommit,
  ExternalLink,
  MapPin,
  Clock,
  User,
  UserCheck,
  Eye,
  Check,
  List,
  ArrowRight,
  Sparkles,
  FilePlus,
  ClipboardCheck,
  QrCode,
} from 'lucide-react';

interface DashboardPageProps {
  currentUser: UserAccount;
  weather: WeatherCondition;
  onNavigate: (page: string, tripId?: string) => void;
  onOpenAiDrawer: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  currentUser,
  weather,
  onNavigate,
  onOpenAiDrawer,
}) => {
  const [allTrips, setAllTrips] = useState<TripRecord[]>(() => repository.getTrips());
  const [incomingDossiers, setIncomingDossiers] = useState<IncomingDossier[]>(() =>
    repository.getIncomingDossiers()
  );
  const [vessels, setVessels] = useState(() => repository.getVessels());
  const [crewCatalog, setCrewCatalog] = useState(() => repository.getCrew());
  const [exclusions, setExclusions] = useState(() => repository.getKpiExclusions());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [timelineTripId, setTimelineTripId] = useState<string | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<'MY_TASKS' | 'RELATED'>('MY_TASKS');

  const [flashSuccessMsg, setFlashSuccessMsg] = useState<string | null>(() => {
    try {
      const msg = sessionStorage.getItem('vrsb_workflow_completed_msg');
      if (msg) {
        sessionStorage.removeItem('vrsb_workflow_completed_msg');
        return msg;
      }
      return null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (flashSuccessMsg) {
      setTimeout(() => {
        const el = document.getElementById('urgent-tasks-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [flashSuccessMsg]);

  useEffect(() => {
    const unsubscribe = repository.subscribe(() => {
      setAllTrips(repository.getTrips());
      setIncomingDossiers(repository.getIncomingDossiers());
      setVessels(repository.getVessels());
      setCrewCatalog(repository.getCrew());
      setExclusions(repository.getKpiExclusions());
    });

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const showLiveToast = (msg: string) => {
    setLiveToast(msg);
    setTimeout(() => setLiveToast(null), 4000);
  };

  const trips = useMemo(
    () => getScopedTripsForUser(currentUser, allTrips, vessels, crewCatalog),
    [allTrips, currentUser, vessels, crewCatalog]
  );

  const adminConfig = repository.getAdminConfig();
  const bqlLimit = adminConfig.bqlProcessingSlaMinutes || 60;
  const deptLimit = adminConfig.deptProcessingSlaMinutes || 60;

  const shiftCheck = useMemo(
    () => repository.validateShiftAndPortForAction(currentUser, currentUser.assignedPortId, currentTime),
    [currentUser, currentTime]
  );

  const realTimeTripsEvaluation = useMemo(() => {
    return trips.map((t) => {
      const st = normalizeStatus(t.status);
      const evalRes = repository.evaluateTripPhaseRealtime(t, currentTime);
      const bqlClock = repository.computeBqlClockMinutes(t, currentTime);
      const deptClock = repository.computeDeptClockMinutes(t, currentTime);
      const isMyTask = repository.isTripMyAction(currentUser, t, currentTime);
      const handler = repository.getCurrentTripHandler(t, currentTime);
      return { trip: t, st, eval: evalRes, bqlClock, deptClock, isMyTask, handler };
    });
  }, [trips, currentUser, currentTime]);

  const sortByUrgency = (
    a: (typeof realTimeTripsEvaluation)[number],
    b: (typeof realTimeTripsEvaluation)[number]
  ) => {
    const score = (item: (typeof realTimeTripsEvaluation)[number]) => {
      if (item.st === 'TAM_GIU_BIEN_PHONG') return 0;
      const isBql = item.st === 'CHO_KIEM_TRA' || item.st === 'TRA_BQL_CANG';
      const isDept = ['DA_CHAP_THUAN', 'CHO_SO_XU_LY', 'DA_DUYET', 'DANG_TRINH_OFFICE', 'OFFICE_TRA_LAI'].includes(item.st);
      const mins = isBql ? item.bqlClock.netMinutes : isDept ? item.deptClock.netMinutes : 0;
      const limit = isBql ? bqlLimit : deptLimit;
      if ((isBql || isDept) && mins > limit) return 1;
      if ((isBql || isDept) && mins >= limit * 0.75) return 2;
      if (item.st === 'TRA_CHU_TAU' || item.st === 'TRA_BQL_CANG' || item.st === 'OFFICE_TRA_LAI') return 3;
      return 4;
    };
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return (b.trip.submittedAt || b.trip.createdDate || '').localeCompare(
      a.trip.submittedAt || a.trip.createdDate || ''
    );
  };

  // CHỈ hiển thị hồ sơ là nhiệm vụ cần xử lý trực tiếp của tài khoản đang đăng nhập
  const urgentTasks = useMemo(() => {
    return realTimeTripsEvaluation.filter(({ isMyTask }) => isMyTask).sort(sortByUrgency);
  }, [realTimeTripsEvaluation, bqlLimit, deptLimit]);

  // Hồ sơ liên quan đang được các bộ phận / cán bộ khác xử lý (kèm Người xử lý để theo dõi)
  const relatedTasks = useMemo(() => {
    return realTimeTripsEvaluation
      .filter(({ st, isMyTask }) => !isMyTask && ACTIVE_MONITORING_STATUSES.has(st))
      .sort(sortByUrgency);
  }, [realTimeTripsEvaluation, bqlLimit, deptLimit]);

  const pendingExclusionsCount = useMemo(
    () => exclusions.filter((ex) => ex.trangThai === 'cho_duyet').length,
    [exclusions]
  );

  const stats = useMemo(() => {
    const today = getLocalIsoDate(currentTime);
    const tripsToday = trips.filter((t) => (t.createdDate || '').slice(0, 10) === today);

    let waitBql = 0;
    let waitDeptOffice = 0;
    let waitBpControl = 0;
    let underwayCount = 0;
    let completedToday = 0;
    let slaOrHoldAlertCount = 0;

    realTimeTripsEvaluation.forEach(({ trip, st, bqlClock, deptClock }) => {
      if (isBqlQueueStatus(st)) {
        waitBql += 1;
        if (bqlClock.isAmber || bqlClock.isRed) slaOrHoldAlertCount += 1;
      } else if (isDeptProcessingStatus(st)) {
        waitDeptOffice += 1;
        if (st !== 'TAM_DUNG_THOI_TIET' && (deptClock.isAmber || deptClock.isRed)) {
          slaOrHoldAlertCount += 1;
        }
      } else if (isBpWaitControlStatus(st)) {
        waitBpControl += 1;
        if (st === 'TAM_GIU_BIEN_PHONG') slaOrHoldAlertCount += 1;
      } else if (st === 'DA_XUAT_BEN') {
        underwayCount += 1;
      } else if (st === 'DA_CAP_BEN' && (trip.createdDate || '').slice(0, 10) === today) {
        completedToday += 1;
      }
    });

    const pendingIncoming = incomingDossiers.filter((d) => d.status === 'PENDING_INTAKE').length;

    return {
      waitBql,
      waitDeptOffice,
      pendingOrProcessing: waitBql + waitDeptOffice,
      pendingIncoming,
      waitBpControl,
      underwayCount,
      completedToday,
      slaOrHoldAlertCount,
      totalTripsToday: tripsToday.length,
      totalPassengersToday: tripsToday.reduce((sum, t) => sum + (t.passengerCount || 0), 0),
    };
  }, [trips, incomingDossiers, realTimeTripsEvaluation, currentTime, bqlLimit, deptLimit]);

  const activeTrips = useMemo(() => {
    return realTimeTripsEvaluation
      .filter(({ st, isMyTask }) => ACTIVE_MONITORING_STATUSES.has(st) || isMyTask)
      .sort((a, b) => {
        const aReq = a.isMyTask ? 0 : 1;
        const bReq = b.isMyTask ? 0 : 1;
        return aReq - bReq;
      });
  }, [realTimeTripsEvaluation]);

  const activeTripsPagination = usePagination(activeTrips, currentUser.id);

  const canQuickIntake = currentUser.role === 'OFFICER' || currentUser.role === 'ADMIN';

  const handleQuickIntake = (dossier: IncomingDossier) => {
    if (!canQuickIntake) return;
    const res = repository.intakeDossier(dossier.id, currentUser.id, currentUser.fullName, 'Tiếp nhận nhanh từ Bảng điều khiển');
    if (res.success) {
      showLiveToast(`Đã tiếp nhận vào sổ ${dossier.incomingNumber} (${dossier.vesselName}).`);
    } else if (res.error) {
      showLiveToast(res.error);
    }
  };

  const navigateActionForTrip = (trip: TripRecord) => {
    const st = normalizeStatus(trip.status);
    if (currentUser.role === 'PORT_STAFF' && (st === 'CHO_KIEM_TRA' || st === 'TRA_BQL_CANG')) {
      onNavigate('port-inspect', trip.id);
      return;
    }
    if (
      currentUser.role === 'OFFICER' &&
      ['DA_CHAP_THUAN', 'CHO_SO_XU_LY', 'DA_DUYET', 'DANG_TRINH_OFFICE', 'OFFICE_TRA_LAI', 'TAM_DUNG_THOI_TIET'].includes(st)
    ) {
      onNavigate('internal-workflow', trip.id);
      return;
    }
    if (['BP_TRUC', 'BP_CHIHUY'].includes(currentUser.role)) {
      onNavigate('bp-daily-trips', trip.id);
      return;
    }
    if (currentUser.role === 'CAPTAIN' && (st === 'TRA_CHU_TAU' || st === 'NHAP')) {
      onNavigate('create-trip', trip.id);
      return;
    }
    if (currentUser.role === 'ADMIN') {
      if (st === 'CHO_KIEM_TRA' || st === 'TRA_BQL_CANG') {
        onNavigate('port-inspect', trip.id);
        return;
      }
      if (['DA_CHAP_THUAN', 'CHO_SO_XU_LY', 'DA_DUYET', 'DANG_TRINH_OFFICE', 'OFFICE_TRA_LAI'].includes(st)) {
        onNavigate('internal-workflow', trip.id);
        return;
      }
    }
    // Trưởng phòng & Lãnh đạo Sở chỉ xem điều hành trên ứng dụng (ký duyệt trên phần mềm Office)
    onNavigate('trip-detail', trip.id);
  };

  const getPrimaryActionLabel = (trip: TripRecord): string => {
    const st = normalizeStatus(trip.status);
    if (currentUser.role === 'PORT_STAFF' && (st === 'CHO_KIEM_TRA' || st === 'TRA_BQL_CANG')) {
      return 'Kiểm tra tại bến →';
    }
    if (currentUser.role === 'OFFICER') {
      return 'Xử lý hồ sơ →';
    }
    if (['BP_TRUC', 'BP_CHIHUY'].includes(currentUser.role)) {
      if (st === 'DA_CAP_PHEP') return 'Kiểm soát xuất bến →';
      if (st === 'DA_XUAT_BEN') return 'Xác nhận cập bến →';
      if (st === 'TAM_GIU_BIEN_PHONG') return 'Xử lý tạm giữ →';
      return 'Mở bảng Biên phòng →';
    }
    if (currentUser.role === 'CAPTAIN') {
      if (st === 'TRA_CHU_TAU') return 'Bổ sung & Nộp lại →';
      if (st === 'NHAP') return 'Tiếp tục khai →';
    }
    return 'Xem hồ sơ →';
  };

  return (
    <div className="space-y-6">
      {liveToast && (
        <div className="fixed top-20 right-5 z-50 bg-[#07244d] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold border border-[#1d4e9e]">
          <Zap className="w-4 h-4 text-[#f4cf47] shrink-0" />
          <span>{liveToast}</span>
        </div>
      )}

      {/* BANNER ĐIỀU HÀNH */}
      <div className="w-full bg-gradient-to-r from-[#0054c2] via-[#046ee4] to-[#1a8df5] rounded-[24px] p-5 sm:p-7 text-white shadow-[0_14px_34px_-10px_rgba(10,92,212,0.34)] border border-[#3a9cff]/35 relative overflow-hidden">
        <img
          src={heroSeaportImg}
          alt="Cảng biển đặc khu Lý Sơn - Sở Xây dựng Quảng Ngãi"
          referrerPolicy="no-referrer"
          className="hidden sm:block absolute inset-y-0 right-0 h-full w-full sm:w-[70%] lg:w-[62%] object-cover object-center pointer-events-none select-none"
        />
        <div className="hidden sm:block absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,#0054c2_0%,#0366db_42%,rgba(4,110,228,0.78)_58%,rgba(16,134,245,0.12)_85%,rgba(16,134,245,0)_100%)]" />

        <div className="relative z-10 w-full flex flex-col gap-3.5">
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#003e99]/55 text-white text-xs font-bold backdrop-blur-xs border border-white/25">
              <MapPin className="w-3.5 h-3.5 text-sky-200 shrink-0" />
              <span>Hệ thống cấp lệnh vào/rời bến điện tử VR-SB · Tuyến Đảo Lớn – Đảo Bé</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-blue-50/95">
              {['PORT_STAFF', 'OFFICER', 'BP_TRUC', 'BP_CHIHUY'].includes(currentUser.role) && (
                <span
                  className={`px-3 py-1 rounded-full border backdrop-blur-xs ${
                    shiftCheck.allowed
                      ? 'bg-emerald-500/30 border-emerald-200/40 text-emerald-50'
                      : 'bg-amber-500/35 border-amber-200/50 text-amber-50'
                  }`}
                >
                  {shiftCheck.allowed
                    ? shiftCheck.shift
                      ? `Trong ca: ${shiftCheck.shift.shiftName}`
                      : 'Sẵn sàng xử lý theo quyền'
                    : shiftCheck.reason || 'Chế độ chỉ xem'}
                </span>
              )}
              <div className="hidden md:flex items-center gap-2 bg-[#00409c]/45 px-3 py-1 rounded-full border border-white/20 backdrop-blur-xs">
                <span>{getRoleName(currentUser.role)}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{currentTime.toLocaleTimeString('vi-VN')}</span>
              </div>
            </div>
          </div>

          <div className="w-full space-y-1">
            <h1 className="w-full text-2xl sm:text-3xl lg:text-[34px] font-black tracking-tight text-white">
              Xin chào, {currentUser.fullName}
            </h1>
            <p className="w-full text-xs sm:text-sm text-blue-50/95 font-medium leading-relaxed">
              {currentUser.department || 'Sở Xây dựng tỉnh Quảng Ngãi'} · Bảng điều hành tổng hợp hoạt động tàu VR-SB tuyến Đảo Lớn – Đảo Bé (Đặc khu Lý Sơn).
            </p>
          </div>

          {/* Thanh thao tác nhanh trên Banner */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {['CAPTAIN', 'PORT_STAFF', 'ADMIN'].includes(currentUser.role) && (
              <button
                type="button"
                onClick={() => onNavigate('create-trip')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#004eb8] hover:bg-blue-50 text-xs font-extrabold shadow-sm transition cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5" />
                <span>Lập hồ sơ mới</span>
              </button>
            )}
            {['PORT_STAFF', 'ADMIN'].includes(currentUser.role) && (
              <button
                type="button"
                onClick={() => onNavigate('port-inspect')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#003e99]/60 hover:bg-[#003e99]/80 text-white border border-white/25 text-xs font-bold backdrop-blur-xs transition cursor-pointer"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-sky-200" />
                <span>Kiểm tra bến ({stats.waitBql})</span>
              </button>
            )}
            {['OFFICER', 'ADMIN'].includes(currentUser.role) && (
              <button
                type="button"
                onClick={() => onNavigate('internal-workflow')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#003e99]/60 hover:bg-[#003e99]/80 text-white border border-white/25 text-xs font-bold backdrop-blur-xs transition cursor-pointer"
              >
                <Inbox className="w-3.5 h-3.5 text-sky-200" />
                <span>Xử lý hồ sơ ({stats.waitDeptOffice})</span>
              </button>
            )}
            {['BP_TRUC', 'BP_CHIHUY', 'ADMIN'].includes(currentUser.role) && (
              <button
                type="button"
                onClick={() => onNavigate('bp-daily-trips')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#003e99]/60 hover:bg-[#003e99]/80 text-white border border-white/25 text-xs font-bold backdrop-blur-xs transition cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-200" />
                <span>Kiểm soát Biên phòng ({stats.waitBpControl})</span>
              </button>
            )}
            {['DEPT_HEAD', 'ADMIN'].includes(currentUser.role) && pendingExclusionsCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('kpi-reports')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs font-extrabold shadow-sm transition cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Duyệt giải trình KPI ({pendingExclusionsCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('public-verify')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#003e99]/50 hover:bg-[#003e99]/75 text-white border border-white/25 text-xs font-bold backdrop-blur-xs transition cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-sky-200" />
              <span>Tra cứu &amp; Xác thực QR</span>
            </button>
            <button
              type="button"
              onClick={onOpenAiDrawer}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#003e99]/50 hover:bg-[#003e99]/75 text-white border border-white/25 text-xs font-bold backdrop-blur-xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Trợ lý AI</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 THẺ CHỈ SỐ TỔNG QUAN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 auto-rows-fr gap-3 sm:gap-4 tabular-nums">
        {/* 1. Chuyến tàu hôm nay */}
        <div
          onClick={() => onNavigate('trips')}
          className="w-full h-full min-h-[142px] bg-gradient-to-b from-white via-[#f7fbff] to-[#e9f3ff] px-4 py-4 rounded-[20px] border border-[#8ec4ff] shadow-[0_10px_24px_-12px_rgba(13,98,232,0.22)] hover:border-[#0d62e8] hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5"
        >
          <div className="flex items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#e3f0ff] text-[#0b56c8] flex items-center justify-center shrink-0">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-extrabold text-[#0c3f7a]">Chuyến tàu hôm nay</span>
          </div>
          <div className="text-3xl sm:text-[34px] font-black text-[#083b75] leading-tight">
            {stats.totalTripsToday}
          </div>
          <p className="text-xs font-bold text-[#0d62e8]">
            {stats.totalPassengersToday} hành khách trên tuyến
          </p>
        </div>

        {/* 2. Đang chờ kiểm tra & xử lý */}
        <div
          onClick={() =>
            onNavigate(
              currentUser.role === 'PORT_STAFF'
                ? 'port-inspect'
                : currentUser.role === 'OFFICER'
                ? 'internal-workflow'
                : 'incoming-dossiers'
            )
          }
          className="w-full h-full min-h-[142px] bg-gradient-to-b from-white via-[#f9f6ff] to-[#efe7ff] px-4 py-4 rounded-[20px] border border-[#b996f9] shadow-[0_10px_24px_-12px_rgba(124,58,237,0.22)] hover:border-[#6d28d9] hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5"
        >
          <div className="flex items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#efe7ff] text-[#6d28d9] flex items-center justify-center shrink-0">
              <Inbox className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-extrabold text-[#3b1c7a]">Đang kiểm tra &amp; Xử lý</span>
          </div>
          <div className="text-3xl sm:text-[34px] font-black text-[#4c1d95] leading-tight">
            {stats.pendingOrProcessing}
          </div>
          <p className="text-xs font-bold text-[#5b21b6]">
            {stats.waitBql} tại BQL · {stats.waitDeptOffice} tại Sở
          </p>
        </div>

        {/* 3. Đã cấp phép / Chờ xuất bến */}
        <div
          onClick={() =>
            onNavigate(['BP_TRUC', 'BP_CHIHUY'].includes(currentUser.role) ? 'bp-daily-trips' : 'trips')
          }
          className="w-full h-full min-h-[142px] bg-gradient-to-b from-white via-[#f3fdfc] to-[#e1faf7] px-4 py-4 rounded-[20px] border border-[#6be2d6] shadow-[0_10px_24px_-12px_rgba(13,148,136,0.22)] hover:border-[#0d9488] hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5"
        >
          <div className="flex items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#d8f8f3] text-[#0f766e] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-extrabold text-[#115e59]">Đã cấp phép · Chờ xuất bến</span>
          </div>
          <div className="text-3xl sm:text-[34px] font-black text-[#0f5b55] leading-tight">
            {stats.waitBpControl}
          </div>
          <p className="text-xs font-bold text-[#0f766e]">Biên phòng kiểm soát tại bến</p>
        </div>

        {/* 4. Đang hành trình trên biển */}
        <div
          onClick={() =>
            onNavigate(['BP_TRUC', 'BP_CHIHUY'].includes(currentUser.role) ? 'bp-sea-monitor' : 'trips')
          }
          className="w-full h-full min-h-[142px] bg-gradient-to-b from-white via-[#f4fdf6] to-[#e4f9e8] px-4 py-4 rounded-[20px] border border-[#74dc87] shadow-[0_10px_24px_-12px_rgba(22,163,74,0.2)] hover:border-[#16a34a] hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5"
        >
          <div className="flex items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#e0f8e6] text-[#15803d] flex items-center justify-center shrink-0">
              <Ship className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-extrabold text-[#14532d]">Đang hành trình</span>
          </div>
          <div className="text-3xl sm:text-[34px] font-black text-[#15803d] leading-tight">
            {stats.underwayCount}
          </div>
          <p className="text-xs font-bold text-[#166534]">
            Đã cập bến hôm nay: {stats.completedToday} chuyến
          </p>
        </div>

        {/* 5. Cảnh báo quá hạn / Tạm giữ */}
        <div
          onClick={() =>
            onNavigate(['DEPT_HEAD', 'LEADER', 'ADMIN'].includes(currentUser.role) ? 'kpi-reports' : 'trips')
          }
          className={`w-full h-full min-h-[142px] bg-gradient-to-b from-white via-[#fff6f6] to-[#ffe7e7] px-4 py-4 rounded-[20px] border border-[#fb8f8f] shadow-[0_10px_24px_-12px_rgba(220,38,38,0.24)] hover:border-[#dc2626] hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 ${
            stats.slaOrHoldAlertCount > 0 ? 'ring-2 ring-red-200/80' : ''
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#ffe2e2] text-[#dc2626] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-extrabold text-[#991b1b]">Cảnh báo quá hạn (SLA)</span>
          </div>
          <div className="text-3xl sm:text-[34px] font-black text-[#b91c1c] leading-tight">
            {stats.slaOrHoldAlertCount}
          </div>
          <p className="text-xs font-bold text-[#dc2626]">
            {pendingExclusionsCount > 0
              ? `${pendingExclusionsCount} giải trình chờ duyệt`
              : 'Sắp quá hạn / Đang tạm giữ'}
          </p>
        </div>
      </div>

      {/* KHỐI 1: HÀNG CHỜ CÔNG VIỆC KHẨN & ĐỒNG HỒ SLA THỜI GIAN THỰC */}
      <div
        id="urgent-tasks-section"
        className="bg-white/95 p-4 sm:p-5 rounded-[22px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3.5 scroll-mt-20"
      >
        {flashSuccessMsg && (
          <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold text-emerald-950">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-emerald-950 font-black text-sm">{flashSuccessMsg}</p>
                <p className="text-emerald-800 text-[11px] font-medium mt-0.5">
                  Hàng chờ công việc của {getRoleName(currentUser.role)} đã được cập nhật theo thời gian thực.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFlashSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-950 font-black px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 text-sm cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 text-[#0d62e8] flex items-center justify-center shrink-0">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-black text-[#07244d]">
              Hồ sơ cần xử lý / Công việc khẩn ({urgentTasks.length})
            </h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#072b61] text-white text-[11px] font-extrabold tabular-nums">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                {currentTime.toLocaleTimeString('vi-VN')} · {currentTime.toLocaleDateString('vi-VN')}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('trips')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#cde1fb] bg-[#f4f8ff] hover:bg-[#e6f0ff] text-[#0c56c8] text-xs font-extrabold transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <List className="w-3.5 h-3.5" />
            <span>Tất cả hồ sơ →</span>
          </button>
        </div>

        {/* Bộ chuyển đổi: Nhiệm vụ của tôi vs Hồ sơ liên quan để theo dõi */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setQueueTab('MY_TASKS')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
              queueTab === 'MY_TASKS'
                ? 'bg-[#072b61] text-white border-[#072b61] shadow-xs'
                : 'bg-[#f4f8ff] text-[#0c4a9e] border-[#cde1fb] hover:bg-[#e6f0ff]'
            }`}
          >
            <span>Nhiệm vụ cần xử lý ({urgentTasks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setQueueTab('RELATED')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
              queueTab === 'RELATED'
                ? 'bg-[#072b61] text-white border-[#072b61] shadow-xs'
                : 'bg-[#f4f8ff] text-[#0c4a9e] border-[#cde1fb] hover:bg-[#e6f0ff]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Hồ sơ liên quan theo dõi ({relatedTasks.length})</span>
          </button>
        </div>

        {queueTab === 'MY_TASKS' ? (
          urgentTasks.length === 0 ? (
            <div className="p-5 sm:p-6 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  Hiện không có hồ sơ thuộc nhiệm vụ cần xử lý của tài khoản {currentUser.fullName} ({getRoleName(currentUser.role)}).
                </span>
              </div>
              <p className="text-xs text-emerald-700 font-medium">
                Chỉ các hồ sơ thuộc đúng vai trò và bến phụ trách của tài khoản này mới hiển thị tại đây.
              </p>
              {relatedTasks.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setQueueTab('RELATED')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-emerald-100/70 text-emerald-800 border border-emerald-300 text-xs font-extrabold transition cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Xem {relatedTasks.length} hồ sơ liên quan &amp; người xử lý để theo dõi →</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {urgentTasks.slice(0, 8).map(({ trip, st, bqlClock, deptClock }) => {
                const roleStatus = getRoleTripStatusInfo(trip, currentUser.role);
                const isBqlStage = st === 'CHO_KIEM_TRA' || st === 'TRA_BQL_CANG';
                const isDeptStage = [
                  'DA_CHAP_THUAN',
                  'CHO_SO_XU_LY',
                  'DA_DUYET',
                  'DANG_TRINH_OFFICE',
                  'OFFICE_TRA_LAI',
                ].includes(st);
                const activeClockMins = isBqlStage
                  ? bqlClock.netMinutes
                  : isDeptStage
                  ? deptClock.netMinutes
                  : 0;
                const activeLimit = isBqlStage ? bqlLimit : deptLimit;
                const isOverSla = (isBqlStage || isDeptStage) && activeClockMins > activeLimit;
                const isNearSla =
                  (isBqlStage || isDeptStage) && !isOverSla && activeClockMins >= activeLimit * 0.75;

                return (
                  <div
                    key={trip.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 transition ${
                      isOverSla || st === 'TAM_GIU_BIEN_PHONG'
                        ? 'bg-[#fff9f9] border-[#f8b4b4]'
                        : isNearSla
                        ? 'bg-amber-50/60 border-amber-300'
                        : 'bg-[#f8fbff] border-[#dce8f7]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0 mt-0.5 font-black text-xs ${
                          isOverSla || st === 'TAM_GIU_BIEN_PHONG'
                            ? 'bg-[#e02424]'
                            : isNearSla
                            ? 'bg-amber-500'
                            : 'bg-[#0d62e8]'
                        }`}
                      >
                        {isOverSla || st === 'TAM_GIU_BIEN_PHONG' ? '!' : '•'}
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-extrabold text-xs text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                            {trip.tripNumber}
                          </span>
                          <span className="inline-flex items-center gap-1 font-extrabold text-sm text-[#083b75]">
                            <User className="w-3.5 h-3.5 text-[#0d62e8] shrink-0" />
                            <span>
                              {trip.vesselName} ({trip.vesselRegNumber})
                            </span>
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${roleStatus.badgeBg} ${roleStatus.badgeText} ${roleStatus.badgeBorder}`}
                          >
                            {roleStatus.label}
                          </span>
                          {(isBqlStage || isDeptStage) && (
                            <span
                              className={`text-xs font-extrabold tabular-nums ${
                                isOverSla
                                  ? 'text-red-700'
                                  : isNearSla
                                  ? 'text-amber-700'
                                  : 'text-[#0a4ca8]'
                              }`}
                            >
                              · {isBqlStage ? 'Đồng hồ BQL' : 'Đồng hồ Sở'}: {formatMetric1(activeClockMins)} /{' '}
                              {activeLimit} phút
                              {isOverSla && ` (Quá hạn +${roundOverdueMinutes(activeClockMins - activeLimit)} phút)`}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium tabular-nums">
                          <span>
                            {trip.departurePortName} → {trip.arrivalPortName}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span>Thuyền trưởng: {trip.captainName}</span>
                          <span className="text-slate-300">|</span>
                          <span>
                            {trip.crewMembers.length} TV · {trip.passengerCount} khách
                          </span>
                          <span className="text-slate-300">|</span>
                          <span>Dự kiến: {formatDateTime(trip.scheduledDepartureTime)}</span>
                        </p>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-[#0c4a9e] inline-flex items-center gap-1">
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                            <span>{roleStatus.subLabel}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 pl-11 lg:pl-0">
                      <button
                        type="button"
                        onClick={() => setTimelineTripId(trip.id)}
                        className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#0c4a9e] font-extrabold text-xs rounded-full border border-[#c7dbf7] transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#0d62e8]" />
                        <span>Tiến độ</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigateActionForTrip(trip)}
                        className={`px-4 py-2 text-white font-extrabold text-xs rounded-full shadow-sm transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                          isOverSla || st === 'TAM_GIU_BIEN_PHONG'
                            ? 'bg-gradient-to-r from-[#e01e26] to-[#c8121a] hover:from-[#c8121a] hover:to-[#a50d14]'
                            : 'bg-[#072b61] hover:bg-[#0c4a9c]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{getPrimaryActionLabel(trip)}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : relatedTasks.length === 0 ? (
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs font-semibold text-slate-600">
            Hiện không có hồ sơ liên quan nào đang trong quá trình xử lý để theo dõi.
          </div>
        ) : (
          <div className="space-y-3">
            {relatedTasks.slice(0, 10).map(({ trip, st, bqlClock, deptClock, handler }) => {
              const roleStatus = getRoleTripStatusInfo(trip, currentUser.role);
              const isBqlStage = st === 'CHO_KIEM_TRA' || st === 'TRA_BQL_CANG';
              const isDeptStage = [
                'DA_CHAP_THUAN',
                'CHO_SO_XU_LY',
                'DA_DUYET',
                'DANG_TRINH_OFFICE',
                'OFFICE_TRA_LAI',
              ].includes(st);
              const activeClockMins = isBqlStage
                ? bqlClock.netMinutes
                : isDeptStage
                ? deptClock.netMinutes
                : 0;
              const activeLimit = isBqlStage ? bqlLimit : deptLimit;
              const isOverSla = (isBqlStage || isDeptStage) && activeClockMins > activeLimit;
              const isNearSla =
                (isBqlStage || isDeptStage) && !isOverSla && activeClockMins >= activeLimit * 0.75;

              return (
                <div
                  key={trip.id}
                  className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 transition ${
                    isOverSla || st === 'TAM_GIU_BIEN_PHONG'
                      ? 'bg-[#fff9f9] border-[#f8b4b4]'
                      : isNearSla
                      ? 'bg-amber-50/50 border-amber-300'
                      : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0 mt-0.5 font-black text-xs ${
                        isOverSla || st === 'TAM_GIU_BIEN_PHONG'
                          ? 'bg-[#e02424]'
                          : isNearSla
                          ? 'bg-amber-500'
                          : 'bg-slate-600'
                      }`}
                    >
                      {isOverSla || st === 'TAM_GIU_BIEN_PHONG' ? '!' : '•'}
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-extrabold text-xs text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                          {trip.tripNumber}
                        </span>
                        <span className="inline-flex items-center gap-1 font-extrabold text-sm text-[#083b75]">
                          <Ship className="w-3.5 h-3.5 text-[#0d62e8] shrink-0" />
                          <span>
                            {trip.vesselName} ({trip.vesselRegNumber})
                          </span>
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${roleStatus.badgeBg} ${roleStatus.badgeText} ${roleStatus.badgeBorder}`}
                        >
                          {roleStatus.label}
                        </span>
                        {(isBqlStage || isDeptStage) && (
                          <span
                            className={`text-xs font-extrabold tabular-nums ${
                              isOverSla
                                ? 'text-red-700'
                                : isNearSla
                                ? 'text-amber-700'
                                : 'text-[#0a4ca8]'
                            }`}
                          >
                            · {isBqlStage ? 'Đồng hồ BQL' : 'Đồng hồ Sở'}: {formatMetric1(activeClockMins)} /{' '}
                            {activeLimit} phút
                            {isOverSla && ` (Quá hạn +${roundOverdueMinutes(activeClockMins - activeLimit)} phút)`}
                          </span>
                        )}
                      </div>

                      {/* Thông tin Người xử lý để theo dõi */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs bg-white/90 border border-indigo-200/80 rounded-xl px-2.5 py-1.5 text-slate-800">
                        <span className="inline-flex items-center gap-1 font-extrabold text-indigo-800">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Người xử lý:</span>
                        </span>
                        <span className="font-extrabold text-[#07244d]">{handler.handlerName}</span>
                        <span className="text-slate-300">|</span>
                        <span className="font-semibold text-indigo-700">{handler.unitLabel}</span>
                        {handler.portName && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-600 font-medium">{handler.portName}</span>
                          </>
                        )}
                        {handler.shiftName && (
                          <>
                            <span className="text-slate-300 hidden sm:inline">|</span>
                            <span className="text-[11px] text-slate-500 font-medium">{handler.shiftName}</span>
                          </>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium tabular-nums">
                        <span>
                          {trip.departurePortName} → {trip.arrivalPortName}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span>Thuyền trưởng: {trip.captainName}</span>
                        <span className="text-slate-300">|</span>
                        <span>
                          {trip.crewMembers.length} TV · {trip.passengerCount} khách
                        </span>
                        <span className="text-slate-300">|</span>
                        <span>Dự kiến: {formatDateTime(trip.scheduledDepartureTime)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 pl-11 lg:pl-0">
                    <button
                      type="button"
                      onClick={() => setTimelineTripId(trip.id)}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#0c4a9e] font-extrabold text-xs rounded-full border border-[#c7dbf7] transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#0d62e8]" />
                      <span>Tiến độ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate('trip-detail', trip.id)}
                      className="px-4 py-2 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 font-extrabold text-xs rounded-full transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <span>Theo dõi hồ sơ →</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* KHỐI 2: HỒ SƠ ĐẾN MỚI NHẤT & THỜI TIẾT BIỂN LÝ SƠN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        <div className="lg:col-span-2 bg-white/95 p-4 sm:p-5 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#e8f0fb]">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-[#edf4ff] text-[#0d62e8] rounded-xl">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-[#07244d]">
                  Hồ sơ đến từ Ban Quản lý Cảng ({incomingDossiers.length})
                </h2>
                <p className="text-[11px] text-[#526c93]">
                  Tiếp nhận vào sổ và theo dõi tiến độ xử lý tại Sở Xây dựng
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('incoming-dossiers')}
              className="text-xs font-bold text-[#0d62e8] hover:underline cursor-pointer whitespace-nowrap"
            >
              Xem sổ theo dõi ({incomingDossiers.length}) →
            </button>
          </div>

          <div className="divide-y divide-[#eef4fc]">
            {incomingDossiers.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Chưa có hồ sơ nào chuyển lên Sở Xây dựng.
              </p>
            ) : (
              incomingDossiers.slice(0, 4).map((dossier) => {
                const linkedTrip = repository.getTripById(dossier.tripId);
                const roleInfo = linkedTrip
                  ? getRoleTripStatusInfo(linkedTrip, currentUser.role)
                  : null;
                return (
                  <div
                    key={dossier.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#f5f9ff] rounded-xl px-2 transition"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-xs text-[#0a4ca8] bg-[#edf4ff] px-2 py-0.5 rounded border border-[#cde1fb]">
                          {dossier.incomingNumber}
                        </span>
                        <span className="font-bold text-xs text-[#07244d]">
                          {dossier.vesselName} ({dossier.vesselRegNumber})
                        </span>
                        <span className="text-[10px] text-[#526c93] tabular-nums">
                          · {formatDateTime(dossier.receivedAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#526c93] truncate">
                        {dossier.senderUnit} · {dossier.dossierType}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canQuickIntake && dossier.status === 'PENDING_INTAKE' && (
                        <button
                          type="button"
                          onClick={() => handleQuickIntake(dossier)}
                          className="px-2.5 py-1 rounded-lg bg-[#0d62e8] hover:bg-[#094eb8] text-white text-[11px] font-bold transition cursor-pointer whitespace-nowrap"
                        >
                          Tiếp nhận
                        </button>
                      )}
                      {roleInfo ? (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${roleInfo.badgeBg} ${roleInfo.badgeText} ${roleInfo.badgeBorder}`}
                        >
                          {roleInfo.label}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-[#526c93]">
                          {dossier.status === 'APPROVED' ? 'Đã cấp phép' : 'Đang thụ lý'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate('trip-detail', dossier.tripId)}
                        className="p-1.5 text-[#526c93] hover:text-[#0d62e8] rounded-lg hover:bg-[#edf4ff] transition cursor-pointer"
                        title="Chi tiết hồ sơ"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Thời tiết biển Lý Sơn + Phân tích AI */}
        <div className="bg-white/95 p-4 sm:p-5 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-[#edf4ff] text-[#0d62e8] rounded-xl">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-[#07244d]">Thời tiết vùng biển Lý Sơn</h2>
                <div className="text-[10px] text-[#526c93] tabular-nums">
                  Cập nhật · {formatDateTime(weather.recordedAt)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('weather')}
              className="text-xs font-bold text-[#0d62e8] hover:underline cursor-pointer whitespace-nowrap"
            >
              Chi tiết →
            </button>
          </div>

          <div className="p-3.5 bg-[#f4f8ff] rounded-2xl border border-[#dce8f7] space-y-2 text-xs tabular-nums">
            <div className="flex justify-between items-center">
              <span className="text-[#526c93]">Cấp gió đo tại bến:</span>
              <span className="font-extrabold text-[#07244d] text-sm">
                Cấp {weather.windForceBeaufort} ({weather.windDirection})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#526c93]">Chiều cao sóng biển:</span>
              <span className="font-extrabold text-[#07244d] text-sm">{weather.waveHeightMeters} m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#526c93]">Tình trạng tuyến:</span>
              {weather.isRouteSuspended ? (
                <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-bold text-[11px]">
                  ĐANG TẠM DỪNG
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-[#daf5e7] text-[#0c7a45] font-bold text-[11px]">
                  BÌNH THƯỜNG
                </span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-[#526c93] italic">"{weather.seaStatusText}"</p>

          <div className="pt-2 border-t border-[#e8f0fb] flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[#3f5d88] line-clamp-2">
              {weather.aiSummary || 'Hỗ trợ phân tích nhanh rủi ro thời tiết và điều kiện an toàn tàu VR-SB.'}
            </span>
            <button
              type="button"
              onClick={onOpenAiDrawer}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hỏi AI</span>
            </button>
          </div>
        </div>
      </div>

      {/* KHỐI 3: TIẾN TRÌNH CÁC CHUYẾN TÀU ĐANG HOẠT ĐỘNG */}
      <div className="bg-white/95 p-4 sm:p-5 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-[#07244d]">
              Tiến trình các chuyến tàu đang xử lý &amp; hành trình theo thời gian thực
            </h2>
            <p className="text-xs text-[#526c93]">
              Giám sát liên thông từ Chủ tàu → BQL Cảng → Sở Xây dựng &amp; Office → Biên phòng → Cập bến
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('trips')}
            className="text-xs font-bold text-[#0d62e8] hover:underline cursor-pointer whitespace-nowrap"
          >
            Xem tất cả hồ sơ ({trips.length}) →
          </button>
        </div>

        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full min-w-[860px] text-left text-xs text-[#1e3a5f] tabular-nums">
            <thead className="bg-[#edf4fe] text-[#07244d] uppercase text-[10px] font-extrabold border-y border-[#dce8f7]">
              <tr>
                <th className="py-2.5 px-3">Mã hồ sơ / Số GP</th>
                <th className="py-2.5 px-3">Tàu VR-SB</th>
                <th className="py-2.5 px-3">Bến đi → Bến đến</th>
                <th className="py-2.5 px-3">Giờ dự kiến</th>
                <th className="py-2.5 px-3">Khách / Hàng</th>
                <th className="py-2.5 px-3">Người xử lý</th>
                <th className="py-2.5 px-3">Trạng thái hiện tại</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTripsPagination.pageItems.map(({ trip, isMyTask, handler }) => {
                const s = getRoleTripStatusInfo(trip, currentUser.role);
                return (
                  <tr key={trip.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      <div>{trip.tripNumber}</div>
                      {trip.orderNumber && (
                        <div className="text-[10px] font-bold text-emerald-700 font-mono">
                          {trip.orderNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{trip.vesselName}</div>
                      <div className="text-[10px] text-slate-500">{trip.vesselRegNumber}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">
                        {trip.departurePortName} → {trip.arrivalPortName}
                      </div>
                      <div className="text-[10px] text-slate-500">{trip.routeName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">
                        {formatDateTime(trip.scheduledDepartureTime)}
                      </div>
                      {trip.actualDepartureTime && (
                        <div className="text-[10px] text-emerald-700">
                          Xuất bến: {formatDateTime(trip.actualDepartureTime)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-900">{trip.passengerCount}</span> khách
                      {trip.cargoTons > 0 && (
                        <span className="text-slate-500 ml-1">({trip.cargoTons}T)</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#07244d] flex items-center gap-1">
                        <span>{handler.handlerName}</span>
                        {isMyTask && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-extrabold uppercase whitespace-nowrap">
                            Của tôi
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-indigo-700 font-semibold">{handler.unitLabel}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${s.badgeBg} ${s.badgeText} ${s.badgeBorder}`}
                      >
                        {s.label}
                      </span>
                      <div
                        className={`text-[10px] font-semibold mt-0.5 ${
                          isMyTask ? 'text-blue-700' : 'text-slate-500'
                        }`}
                      >
                        {s.subLabel}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setTimelineTripId(trip.id)}
                        className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                      >
                        Tiến độ
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          isMyTask ? navigateActionForTrip(trip) : onNavigate('trip-detail', trip.id)
                        }
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                      >
                        {isMyTask ? 'Xử lý →' : 'Theo dõi →'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar
          currentPage={activeTripsPagination.currentPage}
          totalPages={activeTripsPagination.totalPages}
          totalItems={activeTripsPagination.totalItems}
          pageSize={activeTripsPagination.pageSize}
          startIndex={activeTripsPagination.startIndex}
          endIndex={activeTripsPagination.endIndex}
          onPageChange={activeTripsPagination.setCurrentPage}
          itemLabel="chuyến tàu"
          className="rounded-b-[20px] -mx-4 sm:-mx-5 -mb-4 sm:-mb-5"
        />
      </div>

      {/* Modal Cây tiến độ */}
      {timelineTripId && (
        <div
          onClick={() => setTimelineTripId(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <GitCommit className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900">
                  Cây tiến độ hồ sơ theo thời gian thực
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTimelineTripId(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {(() => {
              const trip = repository.getTripById(timelineTripId);
              if (!trip) return <p className="text-xs text-slate-500">Không tìm thấy hồ sơ chuyến</p>;
              return <TripTimelineTree trip={trip} />;
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
