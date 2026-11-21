/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, Download, Filter, ShieldAlert, Users } from 'lucide-react';
import { UserAccount } from '../../types';
import { repository } from '../../services/repository';
import {
  BP_STOP_REASON_OPTIONS,
  formatDateTime,
  getBpStopReasonLabel,
} from '../../utils/formatters';

interface BpReportPageProps {
  currentUser: UserAccount;
}

export const BpReportPage: React.FC<BpReportPageProps> = ({ currentUser }) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);

  const [periodMode, setPeriodMode] = useState<'DAY' | 'MONTH'>('MONTH');
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [portFilter, setPortFilter] = useState<string>('ALL');

  const bpConfig = useMemo(() => repository.getBpConfig(), []);
  const ports = useMemo(() => repository.getPorts(), []);
  const trips = useMemo(() => repository.getTrips(), []);
  const deNghiDungs = useMemo(() => repository.getDeNghiDungs(), []);
  const kiemSoatList = useMemo(() => repository.getKiemSoatList(), []);

  const periodMatch = (isoOrDate?: string) => {
    if (!isoOrDate) return false;
    const prefix = isoOrDate.slice(0, 10);
    if (periodMode === 'DAY') return prefix === selectedDay;
    return prefix.startsWith(selectedMonth);
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const dateStr = t.createdDate || t.scheduledDepartureTime;
      if (!periodMatch(dateStr)) return false;
      if (portFilter !== 'ALL' && t.departurePortId !== portFilter && t.arrivalPortId !== portFilter) {
        return false;
      }
      return true;
    });
  }, [trips, periodMode, selectedDay, selectedMonth, portFilter]);

  const filteredTripIds = useMemo(() => new Set(filteredTrips.map((t) => t.id)), [filteredTrips]);

  const filteredStops = useMemo(() => {
    return deNghiDungs.filter((d) => {
      if (portFilter !== 'ALL' && !filteredTripIds.has(d.hoSoId)) return false;
      return periodMatch(d.thoiDiem) || filteredTripIds.has(d.hoSoId);
    });
  }, [deNghiDungs, filteredTripIds, portFilter, periodMode, selectedDay, selectedMonth]);

  const filteredControls = useMemo(() => {
    return kiemSoatList.filter((k) => {
      if (portFilter !== 'ALL' && !filteredTripIds.has(k.hoSoId)) return false;
      return periodMatch(k.thoiDiem) || filteredTripIds.has(k.hoSoId);
    });
  }, [kiemSoatList, filteredTripIds, portFilter, periodMode, selectedDay, selectedMonth]);

  const summary = useMemo(() => {
    const tripTurns = filteredTrips.length;
    const crewTurns = filteredTrips.reduce((sum, t) => sum + (t.crewMembers?.length || 0), 0);
    const paxTurns = filteredTrips.reduce(
      (sum, t) => sum + (t.passengers?.length > 0 ? t.passengers.length : t.passengerCount || 0),
      0
    );
    const departedCount = filteredTrips.filter(
      (t) => t.bpDepartureControl?.action === 'CHO_XUAT_BEN' || Boolean(t.actualDepartureTime)
    ).length;
    const r12ReturnCount = filteredTrips.filter(
      (t) =>
        t.bpDepartureControl?.action === 'TRA_CHU_TAU_R12' ||
        t.lastReturnInfo?.benTra === 'BIEN_PHONG'
    ).length;
    const arrivalByBpCount = filteredTrips.filter(
      (t) => t.arrivingConfirmation && t.arrivingConfirmation.confirmedByRole !== 'PORT_STAFF'
    ).length;

    const totalStops = filteredStops.length;
    const activeStops = filteredStops.filter((d) => d.trangThai === 'dang_hieu_luc').length;
    const liftedStops = filteredStops.filter((d) => d.trangThai === 'da_go');
    const discrepancies = filteredControls.filter((k) => k.ketQua === 'chenh_lech');

    const liftDurations = liftedStops
      .map((d) => {
        if (!d.thoiDiemGo) return 0;
        return Math.max(0, Math.round((new Date(d.thoiDiemGo).getTime() - new Date(d.thoiDiem).getTime()) / 60000));
      })
      .filter((v) => Number.isFinite(v));
    const avgResolveMinutes =
      liftDurations.length > 0
        ? Math.round((liftDurations.reduce((a, b) => a + b, 0) / liftDurations.length) * 10) / 10
        : 0;

    return {
      tripTurns,
      crewTurns,
      paxTurns,
      departedCount,
      r12ReturnCount,
      arrivalByBpCount,
      totalStops,
      activeStops,
      liftedStopsCount: liftedStops.length,
      discrepanciesCount: discrepancies.length,
      totalControlsCount: filteredControls.length,
      avgResolveMinutes,
    };
  }, [filteredTrips, filteredStops, filteredControls]);

  const reasonBreakdown = useMemo(() => {
    return BP_STOP_REASON_OPTIONS.map((opt) => {
      const matched = filteredStops.filter((d) => d.maLyDo === opt.value);
      return {
        code: opt.value,
        label: opt.label,
        total: matched.length,
        active: matched.filter((m) => m.trangThai === 'dang_hieu_luc').length,
        lifted: matched.filter((m) => m.trangThai === 'da_go').length,
      };
    }).filter((r) => r.total > 0);
  }, [filteredStops]);

  const handleExportExcel = () => {
    const overviewSheet = [
      {
        'Đơn vị phối hợp': bpConfig.unitDisplayName,
        'Kỳ báo cáo': periodMode === 'DAY' ? selectedDay : selectedMonth,
        'Bến lọc': portFilter === 'ALL' ? 'Tất cả bến' : ports.find((p) => p.id === portFilter)?.name || portFilter,
        'Số lượt hồ sơ/tàu': summary.tripTurns,
        'Lượt Biên phòng cho xuất bến': summary.departedCount,
        'Lượt xác nhận cập bến (BP)': summary.arrivalByBpCount,
        'Lượt trả Chủ tàu do R12': summary.r12ReturnCount,
        'Lượt thuyền viên': summary.crewTurns,
        'Lượt hành khách': summary.paxTurns,
        'Lượt tạm giữ / đình chỉ': summary.totalStops,
        'Tạm giữ đang hiệu lực': summary.activeStops,
        'Đã gỡ tạm giữ': summary.liftedStopsCount,
        'Thời gian gỡ TB (phút)': summary.avgResolveMinutes,
        'Lượt kiểm soát cuối tại bến': summary.totalControlsCount,
        'Số vụ chênh lệch bến': summary.discrepanciesCount,
        'Người xuất báo cáo': currentUser.fullName,
      },
    ];

    const stopsSheet = filteredStops.map((d, idx) => {
      const trip = trips.find((t) => t.id === d.hoSoId);
      const durMin = d.thoiDiemGo
        ? Math.max(0, Math.round((new Date(d.thoiDiemGo).getTime() - new Date(d.thoiDiem).getTime()) / 60000))
        : null;
      return {
        STT: idx + 1,
        'Mã hồ sơ': trip?.tripNumber || d.hoSoId,
        'Phương tiện': trip ? `${trip.vesselName} (${trip.vesselRegNumber})` : d.hoSoId,
        'Nhóm lý do': getBpStopReasonLabel(d.maLyDo),
        'Mô tả': d.moTa,
        'Người lập': d.nguoiDeNghi,
        'Thời điểm lập': formatDateTime(d.thoiDiem),
        'Trạng thái': d.trangThai === 'dang_hieu_luc' ? 'Đang hiệu lực' : 'Đã gỡ',
        'Thời điểm gỡ': d.thoiDiemGo ? formatDateTime(d.thoiDiemGo) : '',
        'Thời gian xử lý (phút)': durMin ?? '',
        'Kết quả xác minh': d.ketQuaXacMinh || '',
      };
    });

    const controlSheet = filteredControls.map((k, idx) => {
      const trip = trips.find((t) => t.id === k.hoSoId);
      return {
        STT: idx + 1,
        'Mã hồ sơ': trip?.tripNumber || k.hoSoId,
        'Phương tiện': trip?.vesselName || '',
        'Số người thực tế': k.soNguoiThucTe,
        'Số người danh sách': k.soNguoiTheoDanhSach,
        'Kết quả': k.ketQua === 'chenh_lech' ? 'Chênh lệch' : 'Khớp',
        'Ghi chú': k.ghiChu,
        'Người kiểm soát': k.nguoiKiemSoat,
        'Thời điểm': formatDateTime(k.thoiDiem),
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewSheet), 'TongHop');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stopsSheet), 'TamGiuDinhChi');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(controlSheet), 'KiemSoatTaiBen');
    XLSX.writeFile(
      wb,
      `Bao_cao_Bien_phong_${periodMode === 'DAY' ? selectedDay : selectedMonth}.xlsx`
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            {bpConfig.unitDisplayName} · Chỉ huy Đồn (Thống kê nghiệp vụ)
          </p>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Báo cáo công tác kiểm soát xuất bến & cập bến
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thống kê tác nghiệp Biên phòng (không áp dụng chấm điểm KPI cá nhân).
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportExcel}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Xuất Excel báo cáo</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Chế độ kỳ</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setPeriodMode('DAY')}
              className={`min-h-[40px] rounded-lg text-xs font-semibold border cursor-pointer ${
                periodMode === 'DAY'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              Theo ngày
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('MONTH')}
              className={`min-h-[40px] rounded-lg text-xs font-semibold border cursor-pointer ${
                periodMode === 'MONTH'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              Theo tháng
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {periodMode === 'DAY' ? 'Chọn ngày' : 'Chọn tháng'}
          </label>
          {periodMode === 'DAY' ? (
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm font-mono"
            />
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm font-mono"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Lọc theo bến</label>
          <div className="relative flex items-center">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <select
              value={portFilter}
              onChange={(e) => setPortFilter(e.target.value)}
              className="w-full min-h-[40px] pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm"
            >
              <option value="ALL">Tất cả bến</option>
              {ports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Tổng lượt tàu</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">{summary.tripTurns}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <p className="text-xs text-emerald-800 font-medium">Đã cho xuất bến</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-900 mt-1">{summary.departedCount}</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5">
          <p className="text-xs text-sky-800 font-medium">BP xác nhận cập bến</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-900 mt-1">{summary.arrivalByBpCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Lượt hành khách</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">{summary.paxTurns}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5">
          <p className="text-xs text-red-700 font-medium">Tạm giữ / Đình chỉ</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-800 mt-1">{summary.totalStops}</p>
          <p className="text-[11px] text-red-700 mt-0.5 font-mono">
            TB gỡ: {summary.avgResolveMinutes} phút
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
          <p className="text-xs text-amber-800 font-medium">Trả R12 / Chênh lệch</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-900 mt-1">
            {summary.r12ReturnCount}/{summary.discrepanciesCount}
          </p>
        </div>
      </div>

      {/* Breakdown by Reason */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-sky-700" />
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            Thống kê Tạm giữ / Đình chỉ theo nhóm lý do
          </h2>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Lý do</th>
                <th className="px-3 py-2.5 font-semibold text-right">Tổng số lượt</th>
                <th className="px-3 py-2.5 font-semibold text-right">Đang tạm giữ</th>
                <th className="px-3 py-2.5 font-semibold text-right">Đã gỡ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reasonBreakdown.map((row) => (
                <tr key={row.code}>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{row.label}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">{row.total}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-700">{row.active}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">{row.lifted}</td>
                </tr>
              ))}
              {reasonBreakdown.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Chưa có biên bản tạm giữ nào trong kỳ đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Stop Duration & Outcome Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-700" />
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            Chi tiết thời gian từ lúc tạm giữ → gỡ & kết quả xác minh
          </h2>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Hồ sơ / Tàu</th>
                <th className="px-3 py-2.5 font-semibold">Nhóm lý do</th>
                <th className="px-3 py-2.5 font-semibold">Người lập / Thời điểm</th>
                <th className="px-3 py-2.5 font-semibold">Thời gian xử lý</th>
                <th className="px-3 py-2.5 font-semibold">Kết quả xác minh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStops.map((d) => {
                const trip = trips.find((t) => t.id === d.hoSoId);
                const durMin = d.thoiDiemGo
                  ? Math.max(0, Math.round((new Date(d.thoiDiemGo).getTime() - new Date(d.thoiDiem).getTime()) / 60000))
                  : null;
                return (
                  <tr key={d.id}>
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-bold text-slate-900">{trip?.vesselName || d.hoSoId}</p>
                      <p className="font-mono text-xs text-slate-500">{trip?.tripNumber || d.hoSoId}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-semibold text-slate-900">Tạm giữ / Đình chỉ xuất bến</p>
                      <p className="text-xs text-slate-600">{getBpStopReasonLabel(d.maLyDo)}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs">
                      <p className="font-medium text-slate-800">{d.nguoiDeNghi}</p>
                      <p className="font-mono text-slate-500">{formatDateTime(d.thoiDiem)}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top font-mono tabular-nums text-xs">
                      {durMin !== null ? (
                        <span className="text-emerald-700 font-bold">{durMin} phút</span>
                      ) : (
                        <span className="text-red-700 font-bold">Đang tạm giữ</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-slate-700">
                      {d.ketQuaXacMinh || 'Chưa gỡ tạm giữ'}
                    </td>
                  </tr>
                );
              })}
              {filteredStops.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Không có dữ liệu tạm giữ trong kỳ.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discrepancy Cases */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-700" />
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            Các trường hợp chênh lệch quân số kiểm soát tại bến
          </h2>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Hồ sơ / Tàu</th>
                <th className="px-3 py-2.5 font-semibold">Thực tế / Danh sách</th>
                <th className="px-3 py-2.5 font-semibold">Ghi chú</th>
                <th className="px-3 py-2.5 font-semibold">Cán bộ kiểm soát</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredControls
                .filter((k) => k.ketQua === 'chenh_lech')
                .map((k) => {
                  const trip = trips.find((t) => t.id === k.hoSoId);
                  return (
                    <tr key={k.id}>
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-slate-900">{trip?.vesselName || k.hoSoId}</p>
                        <p className="font-mono text-xs text-slate-500">{trip?.tripNumber || k.hoSoId}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums font-bold text-amber-800">
                        {k.soNguoiThucTe} / {k.soNguoiTheoDanhSach} người
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{k.ghiChu || '---'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {k.nguoiKiemSoat} · {formatDateTime(k.thoiDiem)}
                      </td>
                    </tr>
                  );
                })}
              {filteredControls.filter((k) => k.ketQua === 'chenh_lech').length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Không có trường hợp chênh lệch kiểm soát tại bến trong kỳ.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
