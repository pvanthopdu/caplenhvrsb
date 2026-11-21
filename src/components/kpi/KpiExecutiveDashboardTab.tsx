/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { KpiUnitMetrics } from '../../types/kpi';
import { formatViInteger, formatViNumber } from '../../services/kpiEngine';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  FileText,
  Clock,
  CheckCircle2,
  ShieldAlert,
  UserCheck,
  ShieldCheck,
  FileWarning,
} from 'lucide-react';

interface KpiExecutiveDashboardTabProps {
  metrics: KpiUnitMetrics;
  periodLabel: string;
}

export const KpiExecutiveDashboardTab: React.FC<KpiExecutiveDashboardTabProps> = ({
  metrics,
  periodLabel,
}) => {
  return (
    <div className="space-y-5 tabular-nums">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Tổng hồ sơ phát sinh ({periodLabel})</span>
            <FileText className="w-4 h-4 text-[#0d62e8]" />
          </div>
          <p className="text-2xl font-black text-[#07244d]">
            {formatViInteger(metrics.totalDossiers)} hồ sơ
          </p>
          <p className="text-[11px] text-slate-500">
            Cấp phép hoàn tất:{' '}
            <strong className="text-slate-800">{formatViInteger(metrics.soCompletedCount)}</strong> ·
            Hết hạn 24h (R8):{' '}
            <strong className="text-amber-700">{formatViInteger(metrics.expired24hCount)}</strong>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Đúng hạn BQL Cảng (≤ 60 phút)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700">
            {formatViNumber(metrics.bqlOnTimeRate, 1)}%
          </p>
          <p className="text-[11px] text-slate-500">
            {formatViInteger(metrics.bqlOnTimeCount)} / {formatViInteger(metrics.bqlCompletedCount)} hồ sơ
            (đã trừ thời gian chờ Chủ tàu)
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Đúng hạn Sở Xây dựng (≤ 60 phút)</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-[#07244d]">
            {formatViNumber(metrics.soOnTimeRate, 1)}%
          </p>
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-blue-600 shrink-0" />
            <span>
              Tải GP sau Office ≤ 10p:{' '}
              <strong className="text-[#0a4ca8]">
                {formatViNumber(metrics.officeUploadOnTimeRate, 1)}%
              </strong>
            </span>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Office trả lại (Lỗi XL / Lỗi HS)</span>
            <FileWarning className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-[#07244d]">
            {formatViInteger(metrics.officeReturnByLoiXuLy)} /{' '}
            {formatViInteger(metrics.officeReturnByLoiHoSo)} lượt
          </p>
          <p className="text-[11px] text-slate-500">
            Chỉ trừ KPI Chuyên viên với nhóm <strong>lỗi xử lý</strong> · Trung vị Sở:{' '}
            <strong>{formatViNumber(metrics.medianOverallMinutes, 1)}p</strong>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div>
          <p className="text-xs text-slate-500 font-semibold">Xu hướng chất lượng xử lý hồ sơ</p>
          <h3 className="text-sm font-extrabold text-[#07244d]">
            Tỷ lệ hồ sơ Sở Xây dựng đạt định mức ≤ 60 phút theo ngày (%)
          </h3>
        </div>

        {metrics.dailyOnTimeSeries.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            Chưa có dữ liệu hồ sơ theo ngày trong kỳ đã chọn.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.dailyOnTimeSeries} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis
                  domain={[
                    (dataMin: number) => Math.max(0, Math.floor((dataMin - 5) / 10) * 10),
                    100,
                  ]}
                  tick={{ fontSize: 11, fill: '#475569' }}
                  unit="%"
                />
                <Tooltip
                  formatter={(value: unknown) => [`${formatViNumber(Number(value), 1)}%`, 'Tỷ lệ đúng hạn']}
                  labelFormatter={(label) => `Ngày ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="onTimeRate"
                  stroke="#0d62e8"
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#07244d]">
              Thời gian xử lý trung vị theo 3 đồng hồ SLA (phút)
            </h3>
            <p className="text-[11px] text-slate-500">
              Cột đỏ vượt định mức (BQL ≤ 60p · Sở ≤ 60p · Tải GP Office ≤ 10p); đã trừ thời gian chờ Chủ tàu / BQL / Thời tiết
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.stageMedians} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit=" ph" />
                <Tooltip
                  formatter={(value: unknown, _name, item) => {
                    const norm = (item?.payload as { normMinutes?: number })?.normMinutes ?? 0;
                    return [
                      `${formatViNumber(Number(value), 1)} phút (định mức ≤ ${norm} phút)`,
                      'Trung vị',
                    ];
                  }}
                />
                <Bar dataKey="medianMinutes" radius={[6, 6, 0, 0]}>
                  {metrics.stageMedians.map((entry) => (
                    <Cell key={entry.stageKey} fill={entry.isOverNorm ? '#dc2626' : '#0d62e8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-[#07244d]">
                Số lần cảnh báo / chặn theo quy tắc R1–R12
              </h3>
              <p className="text-[11px] text-slate-500">
                Bao gồm R11 (thiếu chứng từ phí khi nộp) và R12 (người ngoài danh sách khi Biên phòng kiểm soát xuất bến)
              </p>
            </div>
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.ruleBlockSeries} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="rule" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  formatter={(value: unknown) => [`${formatViInteger(Number(value))} lượt`, 'Số lần chặn/cảnh báo']}
                />
                <Bar dataKey="count" fill="#d97706" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {metrics.bpMetrics && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="text-sm font-extrabold text-[#07244d]">
                Thống kê kiểm soát xuất bến của Biên phòng (Sau cấp phép — Không chấm điểm KPI)
              </h3>
              <p className="text-[11px] text-slate-500">
                Theo dõi số lượt kiểm soát cuối cùng tại bến, tạm giữ bất thường, trả R12 và xác nhận tàu cập bến đích
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 space-y-1">
              <span className="text-sky-900 font-semibold">Tổng lượt kiểm soát xuất bến</span>
              <p className="text-xl font-black text-[#07244d]">
                {formatViInteger(metrics.bpMetrics.departureControlsCount)} lượt
              </p>
              <span className="text-[11px] text-sky-800">
                Xác nhận cập bến (BP / BQL):{' '}
                <strong>
                  {formatViInteger(metrics.bpMetrics.arrivalConfirmedByBpCount)} /{' '}
                  {formatViInteger(metrics.bpMetrics.arrivalConfirmedByBqlCount)}
                </strong>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
              <span className="text-rose-800 font-semibold">Tạm giữ sau cấp phép</span>
              <p className="text-xl font-black text-rose-700">
                {formatViInteger(metrics.bpMetrics.totalStopProposals)} lượt
              </p>
              <span className="text-[11px] text-rose-800">
                Đang tạm giữ: <strong>{formatViInteger(metrics.bpMetrics.activeStopProposals)}</strong> · Đã gỡ:{' '}
                <strong>
                  {formatViInteger(
                    Math.max(0, metrics.bpMetrics.totalStopProposals - metrics.bpMetrics.activeStopProposals)
                  )}
                </strong>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
              <span className="text-amber-900 font-semibold">Trả hồ sơ vi phạm R12</span>
              <p className="text-xl font-black text-amber-800">
                {formatViInteger(metrics.bpMetrics.r12ReturnCount)} lượt
              </p>
              <span className="text-[11px] text-amber-800">Có người ngoài danh sách / nộp lại GP mới</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-700 font-semibold">Chênh lệch quân số tại bến</span>
              <p className="text-xl font-black text-slate-900">
                {formatViInteger(metrics.bpMetrics.discrepancyCount)} /{' '}
                {formatViInteger(metrics.bpMetrics.totalControlChecks)} lượt
              </p>
            </div>
          </div>

          {metrics.bpMetrics.byReason.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-extrabold text-[#07244d]">Phân loại lý do tạm giữ tại bến:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {metrics.bpMetrics.byReason.map((item) => (
                  <div
                    key={item.maLyDo}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <span className="text-slate-700 font-semibold truncate">{item.label}</span>
                    <span className="font-black text-rose-700 shrink-0">{formatViInteger(item.count)} lượt</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
