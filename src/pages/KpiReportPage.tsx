/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { UserAccount } from '../types';
import { KpiEvaluatedRole, KpiPersonScorecard, KpiStaffProfile } from '../types/kpi';
import { repository } from '../services/repository';
import {
  buildDossierSummaries,
  computeBpKpiSummary,
  computePersonScorecard,
  computeUnitMetrics,
  extractOverdueStageRows,
  filterDossiersByRangeAndPort,
  filterWarningsByRangeAndPort,
  getDateRangeForPeriod,
  getPreviousDateRange,
  round1,
} from '../services/kpiEngine';
import { exportKpiWorkbook } from '../utils/kpiExcelExport';
import { CoastalPageHero } from '../components/CoastalPageHero';
import { KpiScorecardTab } from '../components/kpi/KpiScorecardTab';
import { KpiUnitSummaryTab } from '../components/kpi/KpiUnitSummaryTab';
import { KpiOverdueExclusionTab } from '../components/kpi/KpiOverdueExclusionTab';
import { KpiExecutiveDashboardTab } from '../components/kpi/KpiExecutiveDashboardTab';
import { KpiConfigTab } from '../components/kpi/KpiConfigTab';
import {
  Award,
  FileSpreadsheet,
  UserCheck,
  Users,
  Clock,
  BarChart3,
  Settings,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
} from 'lucide-react';

interface KpiReportPageProps {
  currentUser: UserAccount;
}

type KpiSubTab = 'SCORECARD' | 'UNIT_SUMMARY' | 'OVERDUE' | 'EXECUTIVE' | 'CONFIG';

export const KpiReportPage: React.FC<KpiReportPageProps> = ({ currentUser }) => {
  const [events, setEvents] = useState(() => repository.getKpiEvents());
  const [exclusions, setExclusions] = useState(() => repository.getKpiExclusions());
  const [warnings, setWarnings] = useState(() => repository.getKpiWarnings());
  const [config, setConfig] = useState(() => repository.getKpiConfig());
  const [auditLogs, setAuditLogs] = useState(() => repository.getKpiAuditLogs());
  const [deNghiDungs, setDeNghiDungs] = useState(() => repository.getDeNghiDungs());
  const [kiemSoatList, setKiemSoatList] = useState(() => repository.getKiemSoatList());
  const [trips, setTrips] = useState(() => repository.getTrips());
  const ports = useMemo(() => repository.getPorts(), []);

  useEffect(() => {
    return repository.subscribe(() => {
      setEvents(repository.getKpiEvents());
      setExclusions(repository.getKpiExclusions());
      setWarnings(repository.getKpiWarnings());
      setConfig(repository.getKpiConfig());
      setAuditLogs(repository.getKpiAuditLogs());
      setDeNghiDungs(repository.getDeNghiDungs());
      setKiemSoatList(repository.getKiemSoatList());
      setTrips(repository.getTrips());
    });
  }, []);

  const isAdmin = currentUser.role === 'ADMIN';
  const isLeader = currentUser.role === 'LEADER';
  const isDeptHead = currentUser.role === 'DEPT_HEAD';
  const canViewAllStaff = isAdmin || isLeader || isDeptHead;
  const canViewExecutive = isAdmin || isLeader || isDeptHead;
  const canEditConfig = isAdmin;

  const [activeTab, setActiveTab] = useState<KpiSubTab>(() => {
    if (['LEADER', 'ADMIN', 'DEPT_HEAD'].includes(currentUser.role)) return 'EXECUTIVE';
    return 'SCORECARD';
  });

  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const monthOptions = useMemo(() => {
    const base = new Set<string>(['2026-11', '2026-10', '2026-09', currentMonthStr]);
    trips.forEach((t) => {
      if (t.createdDate && t.createdDate.length >= 7) {
        base.add(t.createdDate.slice(0, 7));
      }
    });
    return Array.from(base).sort((a, b) => b.localeCompare(a));
  }, [currentMonthStr, trips]);

  const [periodType, setPeriodType] = useState<'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    monthOptions.includes('2026-11') ? '2026-11' : currentMonthStr
  );
  const [selectedQuarter, setSelectedQuarter] = useState<string>('2026-Q4');
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [customFrom, setCustomFrom] = useState<string>('2026-09-01');
  const [customTo, setCustomTo] = useState<string>('2026-12-31');
  const [portFilter, setPortFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | KpiEvaluatedRole>('ALL');

  const kpiRoster = useMemo<KpiStaffProfile[]>(() => {
    const evaluatedRoles: KpiEvaluatedRole[] = ['PORT_STAFF', 'OFFICER'];
    const users = repository.getAllUsers();
    const mapped: KpiStaffProfile[] = users
      .filter((u) => evaluatedRoles.includes(u.role as KpiEvaluatedRole))
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        role: u.role as KpiEvaluatedRole,
        roleLabel:
          u.role === 'PORT_STAFF' ? 'Nhân viên BQL Cảng (60p)' : 'Chuyên viên Sở Xây dựng (60p + 10p)',
        department: u.department || 'Sở Xây dựng tỉnh Quảng Ngãi',
      }));

    if (
      evaluatedRoles.includes(currentUser.role as KpiEvaluatedRole) &&
      !mapped.some((m) => m.id === currentUser.id)
    ) {
      mapped.unshift({
        id: currentUser.id,
        fullName: currentUser.fullName,
        role: currentUser.role as KpiEvaluatedRole,
        roleLabel:
          currentUser.role === 'PORT_STAFF'
            ? 'Nhân viên BQL Cảng (60p)'
            : 'Chuyên viên Sở Xây dựng (60p + 10p)',
        department: currentUser.department || 'Sở Xây dựng tỉnh Quảng Ngãi',
      });
    }
    return mapped;
  }, [currentUser, trips]);

  const [selectedStaffId, setSelectedStaffId] = useState<string>(() => {
    const matched = kpiRoster.find((s) => s.id === currentUser.id);
    return matched ? matched.id : kpiRoster[0]?.id || currentUser.id;
  });

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 5000);
  };

  const accessibleStaffList = useMemo(() => {
    if (canViewAllStaff) return kpiRoster;
    const own = kpiRoster.filter((s) => s.id === currentUser.id);
    return own.length > 0 ? own : kpiRoster.slice(0, 1);
  }, [canViewAllStaff, kpiRoster, currentUser.id]);

  const filteredRoster = useMemo(() => {
    return accessibleStaffList.filter((s) => {
      if (departmentFilter !== 'ALL' && s.department !== departmentFilter) return false;
      if (roleFilter !== 'ALL' && s.role !== roleFilter) return false;
      return true;
    });
  }, [accessibleStaffList, departmentFilter, roleFilter]);

  useEffect(() => {
    if (filteredRoster.length > 0 && !filteredRoster.some((s) => s.id === selectedStaffId)) {
      setSelectedStaffId(filteredRoster[0].id);
    }
  }, [filteredRoster, selectedStaffId]);

  const dateRange = useMemo(
    () =>
      getDateRangeForPeriod(
        periodType,
        selectedMonth,
        selectedQuarter,
        selectedYear,
        customFrom,
        customTo
      ),
    [periodType, selectedMonth, selectedQuarter, selectedYear, customFrom, customTo]
  );

  const prevDateRange = useMemo(
    () => getPreviousDateRange(periodType, dateRange),
    [periodType, dateRange]
  );

  const allDossiers = useMemo(
    () => buildDossierSummaries(events, exclusions, config.timeNorms, deNghiDungs, trips),
    [events, exclusions, config.timeNorms, deNghiDungs, trips]
  );

  const periodDossiers = useMemo(
    () => filterDossiersByRangeAndPort(allDossiers, dateRange, portFilter),
    [allDossiers, dateRange, portFilter]
  );

  const prevDossiers = useMemo(
    () => filterDossiersByRangeAndPort(allDossiers, prevDateRange, portFilter),
    [allDossiers, prevDateRange, portFilter]
  );

  const periodWarnings = useMemo(
    () => filterWarningsByRangeAndPort(warnings, dateRange, portFilter),
    [warnings, dateRange, portFilter]
  );

  const prevWarnings = useMemo(
    () => filterWarningsByRangeAndPort(warnings, prevDateRange, portFilter),
    [warnings, prevDateRange, portFilter]
  );

  const quarterRange = useMemo(() => {
    const [y, m] = dateRange.from.slice(0, 7).split('-').map(Number);
    const q = Math.ceil(m / 3);
    return getDateRangeForPeriod('QUARTER', selectedMonth, `${y}-Q${q}`, String(y), '', '');
  }, [dateRange.from, selectedMonth]);

  const yearRange = useMemo(() => {
    const y = dateRange.from.slice(0, 4);
    return getDateRangeForPeriod('YEAR', selectedMonth, selectedQuarter, y, '', '');
  }, [dateRange.from, selectedMonth, selectedQuarter]);

  const quarterDossiers = useMemo(
    () => filterDossiersByRangeAndPort(allDossiers, quarterRange, portFilter),
    [allDossiers, quarterRange, portFilter]
  );
  const yearDossiers = useMemo(
    () => filterDossiersByRangeAndPort(allDossiers, yearRange, portFilter),
    [allDossiers, yearRange, portFilter]
  );
  const quarterWarnings = useMemo(
    () => filterWarningsByRangeAndPort(warnings, quarterRange, portFilter),
    [warnings, quarterRange, portFilter]
  );
  const yearWarnings = useMemo(
    () => filterWarningsByRangeAndPort(warnings, yearRange, portFilter),
    [warnings, yearRange, portFilter]
  );

  const scorecards: KpiPersonScorecard[] = useMemo(() => {
    return filteredRoster.map((staff) => {
      const current = computePersonScorecard(staff, periodDossiers, periodWarnings, config);
      const prev = computePersonScorecard(staff, prevDossiers, prevWarnings, config);
      const qCard = computePersonScorecard(staff, quarterDossiers, quarterWarnings, config);
      const yCard = computePersonScorecard(staff, yearDossiers, yearWarnings, config);
      return {
        ...current,
        previousScore: prev.totalScore,
        scoreDelta: round1(current.totalScore - prev.totalScore),
        quarterCumulativeScore: qCard.totalScore,
        yearCumulativeScore: yCard.totalScore,
      };
    });
  }, [
    filteredRoster,
    periodDossiers,
    periodWarnings,
    prevDossiers,
    prevWarnings,
    quarterDossiers,
    quarterWarnings,
    yearDossiers,
    yearWarnings,
    config,
  ]);

  const activeScorecard = useMemo(() => {
    return scorecards.find((s) => s.staff.id === selectedStaffId) || scorecards[0] || null;
  }, [scorecards, selectedStaffId]);

  const bpMetrics = useMemo(
    () => computeBpKpiSummary(deNghiDungs, kiemSoatList, trips),
    [deNghiDungs, kiemSoatList, trips]
  );

  const unitMetrics = useMemo(
    () => computeUnitMetrics(periodDossiers, config.timeNorms, bpMetrics, trips),
    [periodDossiers, config.timeNorms, bpMetrics, trips]
  );

  const overdueRows = useMemo(() => {
    const allOverdue = extractOverdueStageRows(periodDossiers, exclusions, config.timeNorms);
    if (canViewAllStaff) return allOverdue;
    return allOverdue.filter((r) => !r.actorId || r.actorId === currentUser.id);
  }, [periodDossiers, exclusions, config.timeNorms, canViewAllStaff, currentUser.id]);

  const handleExportExcel = () => {
    const dossiersToExport = canViewAllStaff
      ? periodDossiers
      : periodDossiers.filter(
          (d) => d.officerId === currentUser.id || d.inspectorId === currentUser.id
        );
    exportKpiWorkbook(scorecards, dossiersToExport, dateRange.label, config);
    showToast(
      'success',
      `Đã xuất file Excel KPI (${scorecards.length} cán bộ, ${dossiersToExport.length} hồ sơ).`
    );
  };

  const handleQuickRegenerate = () => {
    const res = repository.regenerateKpiSampleData(currentUser);
    showToast(
      'success',
      `Đã đồng bộ lại dữ liệu KPI với ${res.eventsCount.toLocaleString('vi-VN')} sự kiện.`
    );
  };

  const availableDepartments = useMemo(() => {
    return Array.from(new Set(accessibleStaffList.map((s) => s.department)));
  }, [accessibleStaffList]);

  return (
    <div className="w-full mx-auto space-y-5 transition-all duration-300">
      <div className="print:hidden">
        <CoastalPageHero
          title="Báo cáo & Thống kê KPI (BQL Cảng 60p · Sở 60p · Tải GP 10p)"
          subtitle="Chấm điểm KPI cho BQL Cảng và Chuyên viên Sở Xây dựng · Biên phòng & Lãnh đạo chỉ thống kê điều hành, không chấm điểm KPI"
          icon={<Award className="w-7 h-7" />}
        />
      </div>

      {toast && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 print:hidden ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#edf4ff] rounded-xl border border-[#cde1fb]">
            {canViewExecutive && (
              <button
                type="button"
                onClick={() => setActiveTab('EXECUTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  activeTab === 'EXECUTIVE'
                    ? 'bg-[#072b61] text-white'
                    : 'text-[#27518c] hover:text-[#07244d]'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Bảng điều hành</span>
              </button>
            )}

            {canViewAllStaff && (
              <button
                type="button"
                onClick={() => setActiveTab('UNIT_SUMMARY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  activeTab === 'UNIT_SUMMARY'
                    ? 'bg-[#072b61] text-white'
                    : 'text-[#27518c] hover:text-[#07244d]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Tổng hợp đơn vị</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('SCORECARD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                activeTab === 'SCORECARD'
                  ? 'bg-[#072b61] text-white'
                  : 'text-[#27518c] hover:text-[#07244d]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Phiếu điểm cá nhân</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('OVERDUE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                activeTab === 'OVERDUE'
                  ? 'bg-[#072b61] text-white'
                  : 'text-[#27518c] hover:text-[#07244d]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Trễ hạn &amp; Giải trình</span>
            </button>

            {canEditConfig && (
              <button
                type="button"
                onClick={() => setActiveTab('CONFIG')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  activeTab === 'CONFIG'
                    ? 'bg-[#072b61] text-white'
                    : 'text-[#27518c] hover:text-[#07244d]'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Cấu hình KPI</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={handleQuickRegenerate}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tạo lại dữ liệu mẫu</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel KPI</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-3 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Loại kỳ</label>
            <select
              value={periodType}
              onChange={(e) =>
                setPeriodType(e.target.value as 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM')
              }
              className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold"
            >
              <option value="MONTH">Theo Tháng</option>
              <option value="QUARTER">Theo Quý</option>
              <option value="YEAR">Theo Năm</option>
              <option value="CUSTOM">Khoảng ngày</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Kỳ thời gian</label>
            {periodType === 'MONTH' && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m.slice(5, 7)}/{m.slice(0, 4)}
                  </option>
                ))}
              </select>
            )}
            {periodType === 'QUARTER' && (
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold"
              >
                <option value="2026-Q4">Quý IV/2026</option>
                <option value="2026-Q3">Quý III/2026</option>
              </select>
            )}
            {periodType === 'YEAR' && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold"
              >
                <option value="2026">Năm 2026</option>
              </select>
            )}
            {periodType === 'CUSTOM' && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-1/2 p-1.5 border border-slate-300 rounded-lg text-[11px]"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-1/2 p-1.5 border border-slate-300 rounded-lg text-[11px]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Bến cảng</label>
            <select
              value={portFilter}
              onChange={(e) => setPortFilter(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold"
            >
              <option value="ALL">Tất cả bến</option>
              {ports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Đơn vị</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              disabled={!canViewAllStaff}
              className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold disabled:bg-slate-50"
            >
              {canViewAllStaff && <option value="ALL">Tất cả đơn vị</option>}
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Vai trò chấm KPI</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'ALL' | KpiEvaluatedRole)}
              disabled={!canViewAllStaff}
              className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold disabled:bg-slate-50"
            >
              {canViewAllStaff && <option value="ALL">Tất cả vai trò chấm KPI</option>}
              <option value="PORT_STAFF">Nhân viên BQL Cảng</option>
              <option value="OFFICER">Chuyên viên Phòng ATGT</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Cán bộ</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              disabled={!canViewAllStaff || filteredRoster.length <= 1}
              className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold disabled:bg-slate-50"
            >
              {filteredRoster.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {activeTab === 'SCORECARD' && (
        <KpiScorecardTab scorecard={activeScorecard} periodLabel={dateRange.label} auditLogs={auditLogs} />
      )}

      {activeTab === 'UNIT_SUMMARY' && canViewAllStaff && (
        <KpiUnitSummaryTab
          scorecards={scorecards}
          periodLabel={dateRange.label}
          onSelectStaff={(staffId) => {
            setSelectedStaffId(staffId);
            setActiveTab('SCORECARD');
          }}
        />
      )}

      {activeTab === 'OVERDUE' && (
        <KpiOverdueExclusionTab
          overdueRows={overdueRows}
          exclusions={exclusions}
          currentUser={currentUser}
          onNotify={showToast}
        />
      )}

      {activeTab === 'EXECUTIVE' && canViewExecutive && (
        <KpiExecutiveDashboardTab metrics={unitMetrics} periodLabel={dateRange.label} />
      )}

      {activeTab === 'CONFIG' && canEditConfig && (
        <KpiConfigTab config={config} currentUser={currentUser} onNotify={showToast} />
      )}
    </div>
  );
};
