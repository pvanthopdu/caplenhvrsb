/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { UserAccount, normalizeStatus } from '../types';
import { repository } from '../services/repository';
import { computeBpKpiSummary, buildDossierSummaries, computeUnitMetrics } from '../services/kpiEngine';
import { roundMetric1 } from '../utils/formatters';
import { exportTripsToExcel } from '../utils/exportUtils';
import { CoastalPageHero } from '../components/CoastalPageHero';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { BarChart3, Download, Sparkles, ShieldCheck } from 'lucide-react';

interface ReportStatisticsPageProps {
  currentUser: UserAccount;
  onOpenAiDrawer: () => void;
}

export const ReportStatisticsPage: React.FC<ReportStatisticsPageProps> = ({
  onOpenAiDrawer,
}) => {
  const [trips, setTrips] = useState(() => repository.getTrips());
  const [deNghiDungs, setDeNghiDungs] = useState(() => repository.getDeNghiDungs());
  const [kiemSoatList, setKiemSoatList] = useState(() => repository.getKiemSoatList());
  const [kpiEvents, setKpiEvents] = useState(() => repository.getKpiEvents());
  const [kpiExclusions, setKpiExclusions] = useState(() => repository.getKpiExclusions());
  const [kpiConfig, setKpiConfig] = useState(() => repository.getKpiConfig());

  useEffect(() => {
    return repository.subscribe(() => {
      setTrips(repository.getTrips());
      setDeNghiDungs(repository.getDeNghiDungs());
      setKiemSoatList(repository.getKiemSoatList());
      setKpiEvents(repository.getKpiEvents());
      setKpiExclusions(repository.getKpiExclusions());
      setKpiConfig(repository.getKpiConfig());
    });
  }, []);

  const bpMetrics = useMemo(
    () => computeBpKpiSummary(deNghiDungs, kiemSoatList, trips),
    [deNghiDungs, kiemSoatList, trips]
  );

  const unitMetrics = useMemo(() => {
    const summaries = buildDossierSummaries(
      kpiEvents,
      kpiExclusions,
      kpiConfig.timeNorms,
      deNghiDungs,
      trips
    );
    return computeUnitMetrics(summaries, kpiConfig.timeNorms, bpMetrics, trips);
  }, [kpiEvents, kpiExclusions, kpiConfig, deNghiDungs, trips, bpMetrics]);

  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const completedTrips = trips.filter((t) => normalizeStatus(t.status) === 'DA_CAP_BEN').length;
    const underwayTrips = trips.filter((t) => normalizeStatus(t.status) === 'DA_XUAT_BEN').length;
    const totalPassengers = trips.reduce((sum, t) => sum + (t.passengerCount || 0), 0);
    const totalCargo = roundMetric1(trips.reduce((sum, t) => sum + (t.cargoTons || 0), 0));
    const returnedOrRejected = trips.filter((t) =>
      ['TRA_CHU_TAU', 'KHONG_CHAP_THUAN', 'TRA_BQL_CANG', 'OFFICE_TRA_LAI'].includes(
        normalizeStatus(t.status)
      )
    ).length;
    const rejectRate = totalTrips > 0 ? roundMetric1((returnedOrRejected / totalTrips) * 100).toFixed(1) : '0.0';
    const bqlOnTimeRate = roundMetric1(unitMetrics.bqlOnTimeRate).toFixed(1);
    const soOnTimeRate = roundMetric1(unitMetrics.soOnTimeRate).toFixed(1);

    return {
      totalTrips,
      completedTrips,
      underwayTrips,
      totalPassengers,
      totalCargo: totalCargo.toFixed(1),
      returnedOrRejected,
      rejectRate,
      bqlOnTimeRate,
      soOnTimeRate,
      weatherSuspensions: unitMetrics.weatherSuspensionsCount,
    };
  }, [trips, unitMetrics]);

  // Biểu đồ chuyến & hành khách theo ngày thực tế từ dữ liệu trips
  const tripsByDateData = useMemo(() => {
    const map = new Map<string, { date: string; label: string; trips: number; passengers: number }>();
    trips.forEach((t) => {
      const dateStr = (t.createdDate || '').slice(0, 10);
      if (!dateStr) return;
      const parts = dateStr.split('-');
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
      const item = map.get(dateStr) || { date: dateStr, label, trips: 0, passengers: 0 };
      item.trips += 1;
      item.passengers += t.passengerCount || 0;
      map.set(dateStr, item);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-20);
  }, [trips]);

  // Phân bố theo trạng thái chuẩn
  const statusPieData = useMemo(() => {
    const counts: Record<string, number> = {};
    trips.forEach((t) => {
      const st = normalizeStatus(t.status);
      counts[st] = (counts[st] || 0) + 1;
    });

    return [
      { name: 'Đã cập bến', value: counts['DA_CAP_BEN'] || 0, color: '#10b981' },
      { name: 'Đã xuất bến', value: counts['DA_XUAT_BEN'] || 0, color: '#0284c7' },
      { name: 'Đã cấp phép (chờ BP)', value: counts['DA_CAP_PHEP'] || 0, color: '#059669' },
      {
        name: 'Đang xử lý Sở / Office',
        value:
          (counts['DA_CHAP_THUAN'] || 0) +
          (counts['CHO_SO_XU_LY'] || 0) +
          (counts['DA_DUYET'] || 0) +
          (counts['DANG_TRINH_OFFICE'] || 0),
        color: '#6366f1',
      },
      {
        name: 'Chờ BQL Cảng',
        value: (counts['CHO_KIEM_TRA'] || 0) + (counts['TRA_BQL_CANG'] || 0),
        color: '#3b82f6',
      },
      {
        name: 'Trả bổ sung / Office trả',
        value: (counts['TRA_CHU_TAU'] || 0) + (counts['OFFICE_TRA_LAI'] || 0),
        color: '#f59e0b',
      },
      {
        name: 'Tạm giữ BP / Thời tiết',
        value: (counts['TAM_GIU_BIEN_PHONG'] || 0) + (counts['TAM_DUNG_THOI_TIET'] || 0),
        color: '#ef4444',
      },
      {
        name: 'Không chấp thuận / Hết hạn / Thu hồi / Rút',
        value:
          (counts['KHONG_CHAP_THUAN'] || 0) +
          (counts['HET_HIEU_LUC'] || 0) +
          (counts['THU_HOI'] || 0) +
          (counts['DA_RUT'] || 0),
        color: '#64748b',
      },
    ].filter((item) => item.value > 0);
  }, [trips]);

  // So sánh trung vị thời gian thực tế với định mức 60p / 60p / 10p
  const slaComparisonData = useMemo(() => {
    const bqlLimit = kpiConfig.timeNorms.bql_limit || 60;
    const soLimit = kpiConfig.timeNorms.so_limit || 60;
    const uploadLimit = kpiConfig.timeNorms.office_upload_limit || 10;

    const findMedian = (key: string) =>
      roundMetric1(unitMetrics.stageMedians.find((s) => s.stageKey === key)?.medianMinutes ?? 0);

    return [
      { stage: 'Đồng hồ 1: BQL Cảng', actual: findMedian('BQL_60'), sla: bqlLimit },
      { stage: 'Đồng hồ 2: Sở Xây dựng', actual: findMedian('SO_60'), sla: soLimit },
      { stage: 'Tải GP sau Office', actual: findMedian('OFFICE_UPLOAD_10'), sla: uploadLimit },
    ];
  }, [unitMetrics.stageMedians, kpiConfig.timeNorms]);

  // Thống kê vi phạm quy tắc R1–R12 thực tế
  const ruleViolationsData = useMemo(() => {
    if (unitMetrics.ruleBlockSeries.length > 0) {
      return unitMetrics.ruleBlockSeries.slice(0, 6);
    }
    return [
      { rule: 'R11 (Chứng từ nộp phí)', count: 0 },
      { rule: 'R3 (Sức chở khách)', count: 0 },
      { rule: 'R7 (Thời tiết / Gió sóng)', count: 0 },
      { rule: 'R12 (Người ngoài DS tại BP)', count: 0 },
    ];
  }, [unitMetrics.ruleBlockSeries]);

  const maxRuleCount = Math.max(1, ...ruleViolationsData.map((r) => r.count));

  return (
    <div className="space-y-6">
      <CoastalPageHero
        title="Báo cáo – Thống kê công tác cấp phép rời cảng, bến VR-SB"
        subtitle="Tổng hợp số chuyến, sản lượng khách/hàng, định mức 60/60/10 phút và số liệu phối hợp kiểm soát Biên phòng"
        icon={<BarChart3 className="w-7 h-7" />}
        rightContent={
          <>
            <button
              type="button"
              onClick={onOpenAiDrawer}
              className="px-4 py-2.5 text-xs font-extrabold text-[#07244d] bg-white/95 hover:bg-white rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-md whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 text-[#0d62e8]" />
              <span>AI soạn dự thảo báo cáo</span>
            </button>

            <button
              type="button"
              onClick={() => exportTripsToExcel(trips, 'Bao_cao_thong_ke_VRSB_LySon.xlsx')}
              className="px-4 py-2.5 text-xs font-extrabold text-[#072b61] bg-[#f4cf47] hover:bg-[#eab308] rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-md whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel (.xlsx)</span>
            </button>
          </>
        }
      />

      {/* 4 THẺ CHỈ SỐ CHÍNH */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs tabular-nums">
        <div className="bg-white/95 p-5 rounded-[20px] border border-[#dce8f7] shadow-[0_8px_24px_-10px_rgba(10,60,130,0.12)] space-y-1">
          <span className="text-[#27518c] font-bold">Tổng hồ sơ chuyến tàu</span>
          <p className="text-2xl sm:text-3xl font-black text-[#07244d]">{stats.totalTrips}</p>
          <p className="text-[11px] text-[#0c7a45] font-bold">
            {stats.completedTrips} đã cập bến · {stats.underwayTrips} đang hành trình
          </p>
        </div>

        <div className="bg-white/95 p-5 rounded-[20px] border border-[#dce8f7] shadow-[0_8px_24px_-10px_rgba(10,60,130,0.12)] space-y-1">
          <span className="text-[#27518c] font-bold">Lượt hành khách &amp; Hàng hóa</span>
          <p className="text-2xl sm:text-3xl font-black text-[#0d62e8]">
            {stats.totalPassengers.toLocaleString('vi-VN')}
          </p>
          <p className="text-[11px] text-[#526c93]">
            Hàng hóa: <strong>{stats.totalCargo} tấn</strong>
          </p>
        </div>

        <div className="bg-white/95 p-5 rounded-[20px] border border-[#dce8f7] shadow-[0_8px_24px_-10px_rgba(10,60,130,0.12)] space-y-1">
          <span className="text-[#27518c] font-bold">Đúng hạn BQL (≤ 60p) / Sở (≤ 60p)</span>
          <p className="text-2xl sm:text-3xl font-black text-emerald-700">
            {stats.bqlOnTimeRate}% / {stats.soOnTimeRate}%
          </p>
          <p className="text-[11px] text-[#526c93]">
            Tải GP sau Office ≤ 10p: <strong>{unitMetrics.officeUploadOnTimeRate.toFixed(1)}%</strong>
          </p>
        </div>

        <div className="bg-white/95 p-5 rounded-[20px] border border-[#dce8f7] shadow-[0_8px_24px_-10px_rgba(10,60,130,0.12)] space-y-1">
          <span className="text-[#27518c] font-bold">Hồ sơ trả bổ sung / Office trả lại</span>
          <p className="text-2xl sm:text-3xl font-black text-amber-600">{stats.rejectRate}%</p>
          <p className="text-[11px] text-[#526c93]">
            Office trả lỗi hồ sơ: <strong>{unitMetrics.officeReturnByLoiHoSo}</strong> · lỗi xử lý:{' '}
            <strong>{unitMetrics.officeReturnByLoiXuLy}</strong>
          </p>
        </div>
      </div>

      {/* BIỂU ĐỒ 1: SỐ CHUYẾN THEO NGÀY & PHÂN BỐ TRẠNG THÁI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        <div className="lg:col-span-2 bg-white/95 p-5 sm:p-6 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#07244d]">
              Số lượng chuyến tàu theo ngày
            </h2>
            <span className="text-[11px] text-[#526c93]">Đơn vị: Chuyến</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tripsByDateData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="trips" name="Số chuyến" fill="#0d62e8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/95 p-5 sm:p-6 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#07244d]">
            Phân bố trạng thái hồ sơ
          </h2>
          {statusPieData.length === 0 ? (
            <p className="text-slate-500 py-12 text-center">Chưa có dữ liệu chuyến tàu.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={72}
                    label={({ value }) => value}
                  >
                    {statusPieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* BIỂU ĐỒ 2 & 3: THỜI GIAN XỬ LÝ 60/60/10 & CẢNH BÁO QUY TẮC R1-R12 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="bg-white/95 p-5 sm:p-6 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3">
          <h2 className="font-extrabold uppercase tracking-wider text-[#07244d]">
            Trung vị thời gian xử lý thực tế so với định mức (60p / 60p / 10p)
          </h2>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={slaComparisonData}
                margin={{ top: 5, right: 16, left: 20, bottom: 5 }}
              >
                <XAxis type="number" unit="p" tick={{ fontSize: 10 }} />
                <YAxis dataKey="stage" type="category" tick={{ fontSize: 10 }} width={125} />
                <Tooltip />
                <Legend />
                <Bar dataKey="actual" name="Trung vị thực tế (phút)" fill="#0d62e8" radius={[0, 4, 4, 0]} />
                <Bar dataKey="sla" name="Định mức SLA (phút)" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/95 p-5 sm:p-6 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3">
          <h2 className="font-extrabold uppercase tracking-wider text-[#07244d]">
            Thống kê lượt chặn / cảnh báo theo bộ quy tắc R1 – R12
          </h2>
          <div className="space-y-2.5 pt-2">
            {ruleViolationsData.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>Quy tắc {item.rule}</span>
                  <span className="font-bold text-red-600">{item.count} lượt</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (item.count / maxRuleCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* THỐNG KÊ KIỂM SOÁT CUỐI CÙNG CỦA BIÊN PHÒNG (KHÔNG CHẤM KPI) */}
      <div className="bg-white/95 p-5 sm:p-6 rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold uppercase tracking-wider text-[#07244d] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>
                Thống kê kiểm soát cuối cùng tại bến ({repository.getBpConfig().unitDisplayName})
              </span>
            </h2>
            <p className="text-[11px] text-[#526c93] mt-0.5">
              Số liệu phục vụ tổng hợp điều hành &amp; phối hợp liên ngành (Biên phòng không thuộc nhóm chấm điểm KPI xử lý hồ sơ).
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold tabular-nums">
            Xác nhận cập bến: BP {bpMetrics.arrivalConfirmedByBpCount} · BQL dự phòng{' '}
            {bpMetrics.arrivalConfirmedByBqlCount}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-emerald-900 font-semibold">Lượt kiểm soát xuất bến</span>
            <p className="text-xl font-black text-emerald-800 mt-1">
              {bpMetrics.departureControlsCount} lượt
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-amber-900 font-semibold">Trả bổ sung do người ngoài DS (R12)</span>
            <p className="text-xl font-black text-amber-800 mt-1">{bpMetrics.r12ReturnCount} lượt</p>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
            <span className="text-rose-800 font-semibold">Tạm giữ bất thường (đang giữ / tổng)</span>
            <p className="text-xl font-black text-rose-700 mt-1">
              {bpMetrics.activeStopProposals} / {bpMetrics.totalStopProposals}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200">
            <span className="text-indigo-900 font-semibold">Chênh lệch quân số khi kiểm đếm</span>
            <p className="text-xl font-black text-indigo-800 mt-1">
              {bpMetrics.discrepancyCount} / {bpMetrics.totalControlChecks} lượt
            </p>
          </div>
        </div>

        {bpMetrics.byReason.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {bpMetrics.byReason.map((item) => (
              <div
                key={item.maLyDo}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
              >
                <span className="font-semibold text-slate-700 truncate">{item.label}</span>
                <span className="font-black text-rose-700 shrink-0">{item.count} lượt</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
