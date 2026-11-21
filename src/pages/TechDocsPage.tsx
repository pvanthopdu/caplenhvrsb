/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserAccount } from '../types';
import { Code2, Database, Network, Copy } from 'lucide-react';
import { CoastalPageHero } from '../components/CoastalPageHero';

export const TechDocsPage: React.FC<{ currentUser: UserAccount }> = () => {
  const [copied, setCopied] = useState(false);

  const djangoModelSnippet = `# models.py - Ứng dụng Cấp phép rời cảng, bến VR-SB Lý Sơn (18 trạng thái chuẩn)
from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    ROLE_CHOICES = [
        ('ADMIN', 'Quản trị hệ thống (QUAN_TRI)'),
        ('CAPTAIN', 'Chủ tàu / Thuyền trưởng (CHU_TAU)'),
        ('PORT_STAFF', 'Ban Quản lý cảng (BQL_CANG)'),
        ('OFFICER', 'Chuyên viên Phòng ATGT (CHUYEN_VIEN)'),
        ('DEPT_HEAD', 'Trưởng phòng ATGT (TRUONG_PHONG - xem & duyệt giải trình KPI)'),
        ('LEADER', 'Lãnh đạo Sở Xây dựng (LANH_DAO_SO - chỉ xem, ký trên Office)'),
        ('BP_TRUC', 'Cán bộ trực Biên phòng (BIEN_PHONG - kiểm soát cuối)'),
        ('BP_CHIHUY', 'Chỉ huy Đồn Biên phòng (BIEN_PHONG)'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='CAPTAIN')
    assigned_port_id = models.CharField(max_length=16, blank=True) # PORT-01 | PORT-02
    phone = models.CharField(max_length=20, blank=True)
    department = models.CharField(max_length=255, blank=True)

class DutyShift(models.Model):
    date = models.DateField(db_index=True)
    role_group = models.CharField(max_length=20) # BQL_CANG | CHUYEN_VIEN | BIEN_PHONG
    port_id = models.CharField(max_length=16, null=True, blank=True)
    shift_name = models.CharField(max_length=120)
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(max_length=20, default='ACTIVE')

class TripRecord(models.Model):
    trip_number = models.CharField(max_length=50, unique=True, db_index=True)
    order_number = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    status = models.CharField(max_length=32, default='NHAP') # 18 trạng thái chuẩn
    departure_port_id = models.CharField(max_length=16)
    arrival_port_id = models.CharField(max_length=16)
    scheduled_departure = models.DateTimeField()
    actual_departure = models.DateTimeField(null=True, blank=True)
    actual_arrival = models.DateTimeField(null=True, blank=True)
    order_valid_until = models.DateTimeField(null=True, blank=True) # 24h (R8)
    bql_clock_json = models.JSONField(default=dict)  # Đồng hồ 1 <= 60 phút
    dept_clock_json = models.JSONField(default=dict) # Đồng hồ 2 <= 60 phút
    office_submission_json = models.JSONField(default=dict) # Trình Office & tải GP <= 10 phút
    bp_departure_control_json = models.JSONField(null=True, blank=True) # Kiểm soát cuối cùng
    superseded_order_numbers = models.JSONField(default=list) # GP cũ bị thay thế sau R12
    verification_code = models.CharField(max_length=64, unique=True)
`;

  return (
    <div className="w-full mx-auto space-y-6">
      <CoastalPageHero
        title="Tài liệu kiến trúc & Đặc tả dữ liệu hệ thống"
        subtitle="Mô hình 18 trạng thái chuẩn, lịch ca trực theo bến, 2 đồng hồ SLA 60 phút + tải Giấy phép 10 phút và kiểm soát cuối cùng Biên phòng."
        icon={<Code2 className="w-7 h-7" />}
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30 text-[11px] font-bold">
            Kiến trúc kỹ thuật · Chuẩn liên thông
          </span>
        }
        rightContent={
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(djangoModelSnippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="px-4 py-2 text-xs font-extrabold text-[#072b61] bg-white hover:bg-blue-50 rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Copy className="w-3.5 h-3.5 text-[#0d62e8]" />
            <span>{copied ? 'Đã sao chép models.py!' : 'Sao chép Models'}</span>
          </button>
        }
      />

      {/* SƠ ĐỒ QUAN HỆ THỰC THỂ */}
      <div className="bg-white/95 p-5 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3 text-xs">
        <h2 className="font-bold uppercase tracking-wider text-slate-800 text-xs flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-600" />
          Mô hình thực thể chính (Database ERD Schema)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <p className="font-bold text-blue-900">users &amp; duty_shifts</p>
            <p className="text-[11px] text-slate-600 font-mono">role (7 nhóm), assigned_port_id</p>
            <p className="text-[11px] text-slate-600 font-mono">role_group: BQL_CANG | CHUYEN_VIEN | BIEN_PHONG</p>
            <p className="text-[11px] text-slate-600 font-mono">date, start_time, end_time, assignee_ids[]</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <p className="font-bold text-blue-900">trip_records (18 trạng thái)</p>
            <p className="text-[11px] text-slate-600 font-mono">trip_number, order_number, status</p>
            <p className="text-[11px] text-slate-600 font-mono">bql_clock (≤60p), dept_clock (≤60p)</p>
            <p className="text-[11px] text-slate-600 font-mono">office_submission (≤10p), superseded_orders[]</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <p className="font-bold text-blue-900">port_inspections (8 nhóm)</p>
            <p className="text-[11px] text-slate-600 font-mono">checklist_8_groups, fee_verified</p>
            <p className="text-[11px] text-slate-600 font-mono">approval_notice_number, photo_urls[]</p>
            <p className="text-[11px] text-slate-600 font-mono">inspector_id, shift_id, conclusion</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <p className="font-bold text-blue-900">bp_departure_controls</p>
            <p className="text-[11px] text-slate-600 font-mono">qr_verified, checked_people[], unlisted[]</p>
            <p className="text-[11px] text-slate-600 font-mono">decision: CHO_XUAT_BEN | TRA_R12 | TAM_GIU</p>
            <p className="text-[11px] text-slate-600 font-mono">arriving_confirmation (BP / BQL dự phòng)</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <p className="font-bold text-blue-900">kpi_events &amp; exclusions</p>
            <p className="text-[11px] text-slate-600 font-mono">Chỉ chấm PORT_STAFF &amp; OFFICER</p>
            <p className="text-[11px] text-slate-600 font-mono">exclusions: cho_duyet → da_duyet / tu_choi</p>
            <p className="text-[11px] text-slate-600 font-mono">office_returns: loi_ho_so vs loi_xu_ly</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <p className="font-bold text-blue-900">audit_logs &amp; pii_access_logs</p>
            <p className="text-[11px] text-slate-600 font-mono">user_id, shift_name, before/after_value</p>
            <p className="text-[11px] text-slate-600 font-mono">NhatKyTruyCapDuLieuCaNhan (NĐ 356/2025)</p>
            <p className="text-[11px] text-slate-600 font-mono">100% thông báo In-app + chuông + Email/SMS</p>
          </div>
        </div>
      </div>

      {/* DANH MỤC API CHUẨN */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs">
        <h2 className="font-bold uppercase tracking-wider text-slate-800 text-xs flex items-center gap-2">
          <Network className="w-4 h-4 text-blue-600" />
          Danh mục API nghiệp vụ tương ứng của lớp Repository
        </h2>

        <div className="space-y-2">
          {[
            { method: 'POST', path: '/api/v1/trips/submit/', desc: 'Chủ tàu nộp hồ sơ + biên lai phí QR (R11) → CHO_KIEM_TRA' },
            { method: 'POST', path: '/api/v1/trips/{id}/withdraw/', desc: 'Chủ tàu rút hồ sơ trước khi cấp phép → DA_RUT' },
            { method: 'POST', path: '/api/v1/trips/{id}/port-inspection/', desc: 'BQL Cảng trong ca/bến kiểm tra 8 nhóm → CHO_SO_XU_LY / TRA_CHU_TAU / KHONG_CHAP_THUAN' },
            { method: 'POST', path: '/api/v1/trips/{id}/dept-weather-check/', desc: 'Chuyên viên Sở kiểm tra thời tiết (R7) / tạm dừng & mở lại thời tiết' },
            { method: 'POST', path: '/api/v1/trips/{id}/office-submit/', desc: 'Duyệt dự thảo không dấu đỏ → Trình ký trên phần mềm Office → Ghi nhận trả lại (lỗi hồ sơ / lỗi xử lý)' },
            { method: 'POST', path: '/api/v1/trips/{id}/publish-permit/', desc: 'Tải PDF Giấy phép đã ký trên Office + số GP + giờ cấp (≤ 10p, hiệu lực 24h R8)' },
            { method: 'POST', path: '/api/v1/trips/{id}/bp-departure-control/', desc: 'Biên phòng kiểm soát cuối cùng: Cho xuất bến / Trả bổ sung R12 / Tạm giữ bất thường' },
            { method: 'POST', path: '/api/v1/trips/{id}/confirm-arrival/', desc: 'Biên phòng bến đến (hoặc BQL dự phòng) xác nhận tàu đã cập bến → DA_CAP_BEN' },
            { method: 'GET', path: '/api/v1/public/verify/{code}/', desc: 'Xác thực QR Giấy phép công khai (6 kết quả: HOP_LE / HET_HIEU_LUC / TAM_DINH_CHI / DA_THU_HOI / DA_XUAT_BEN / KHONG_TON_TAI)' },
          ].map((api, idx) => (
            <div key={idx} className="p-2.5 bg-slate-50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 shrink-0">
                  {api.method}
                </span>
                <span className="font-mono font-semibold text-slate-900">{api.path}</span>
              </div>
              <span className="text-slate-600 text-[11px]">{api.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CODE SNIPPET */}
      <div className="bg-slate-900 text-slate-200 p-5 rounded-2xl shadow-md space-y-2 text-xs font-mono">
        <p className="text-slate-400 font-bold uppercase text-[10px]">
          Lược đồ dữ liệu chuẩn (Django ORM / PostgreSQL):
        </p>
        <pre className="overflow-x-auto p-3 bg-slate-950 rounded-xl leading-relaxed text-[11px]">
          {djangoModelSnippet}
        </pre>
      </div>
    </div>
  );
};
