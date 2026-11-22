/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { repository } from '../services/repository';
import { QrVerifyOutcomeCode } from '../types';
import { getStatusInfo, formatDateTime } from '../utils/formatters';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
} from 'lucide-react';
import { CoastalPageHero } from '../components/CoastalPageHero';

interface PublicVerifyPageProps {
  initialCode?: string;
  onNavigate?: (page: string) => void;
}

const OUTCOME_BANNER: Record<
  QrVerifyOutcomeCode,
  { bgClass: string; heading: string; icon: 'OK' | 'WARN' | 'ERR' }
> = {
  HOP_LE: { bgClass: 'bg-emerald-600', heading: 'GIẤY PHÉP HỢP LỆ VÀ CÒN HIỆU LỰC', icon: 'OK' },
  HET_HIEU_LUC: { bgClass: 'bg-red-600', heading: 'GIẤY PHÉP ĐÃ HẾT HIỆU LỰC (>24 GIỜ)', icon: 'ERR' },
  TAM_DINH_CHI: { bgClass: 'bg-red-700', heading: 'ĐANG TẠM ĐÌNH CHỈ / TẠM GIỮ', icon: 'ERR' },
  DA_THU_HOI: { bgClass: 'bg-rose-800', heading: 'GIẤY PHÉP ĐÃ BỊ THU HỒI', icon: 'ERR' },
  DA_XUAT_BEN: { bgClass: 'bg-sky-700', heading: 'GIẤY PHÉP ĐÃ SỬ DỤNG (ĐÃ XUẤT BẾN)', icon: 'WARN' },
  KHONG_TON_TAI: { bgClass: 'bg-slate-800', heading: 'KHÔNG TỒN TẠI / CHƯA PHÁT HÀNH', icon: 'ERR' },
};

export const PublicVerifyPage: React.FC<PublicVerifyPageProps> = ({ initialCode = '', onNavigate }) => {
  const defaultCode = useMemo(() => {
    if (initialCode) return initialCode;
    const withOrder = repository.getTrips().find((t) => t.orderNumber);
    return withOrder?.orderNumber || '110/2026/AB-LS';
  }, [initialCode]);

  const [searchCode, setSearchCode] = useState(defaultCode);
  const [activeQuery, setActiveQuery] = useState(defaultCode);

  const verifyResult = useMemo(() => {
    return repository.verifyPermitByCode(activeQuery);
  }, [activeQuery]);

  const handleSearch = () => {
    setActiveQuery(searchCode.trim());
  };

  const searchedTrip = verifyResult.trip;
  const banner = OUTCOME_BANNER[verifyResult.outcome];

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2 sm:py-4 px-1 sm:px-2">
      <CoastalPageHero
        title="Cổng tra cứu xác thực Giấy phép rời cảng VR-SB"
        subtitle="Dành cho Đồn Biên phòng, UBND Đặc khu Lý Sơn, BQL Cảng và Hành khách tra cứu tính hợp lệ theo Số Giấy phép hoặc mã QR."
        icon={<ShieldCheck className="w-7 h-7" />}
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30 text-[11px] font-bold">
            Sở Xây dựng tỉnh Quảng Ngãi • Xác thực công khai
          </span>
        }
      />

      {/* Ô tìm kiếm */}
      <div className="bg-white/95 p-4 sm:p-5 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-3">
        <label className="block text-xs font-bold text-[#07244d]">
          Nhập số hiệu Giấy phép hoặc quét mã QR:
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="VD: 001/2026/LS-AB hoặc HS-2026-0003..."
            className="flex-1 px-3.5 py-2.5 text-xs border border-[#dce8f7] rounded-full bg-[#f4f8ff] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-bold text-[#07244d]"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="px-5 py-2.5 bg-[#0d62e8] hover:bg-[#084fc0] text-white font-bold text-xs rounded-full transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs shrink-0"
          >
            <Search className="w-4 h-4" />
            Tra cứu
          </button>
        </div>
      </div>

      {/* Kết quả xác thực */}
      <div className="bg-white/95 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] overflow-hidden text-xs">
        <div className={`p-4 sm:p-5 flex items-center gap-3 text-white ${banner.bgClass}`}>
          {banner.icon === 'OK' ? (
            <CheckCircle2 className="w-6 h-6 shrink-0" />
          ) : banner.icon === 'WARN' ? (
            <AlertTriangle className="w-6 h-6 shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 shrink-0" />
          )}

          <div>
            <p className="font-extrabold text-sm uppercase">{banner.heading}</p>
            <p className="text-[11px] opacity-95">{verifyResult.reasonDetail}</p>
          </div>
        </div>

        {searchedTrip ? (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-400 font-semibold block text-[11px]">Số hiệu Giấy phép:</span>
                <span className="font-black text-sm text-slate-900 font-mono break-all">
                  {searchedTrip.orderNumber || searchedTrip.tripNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[11px]">Trạng thái hồ sơ:</span>
                <span className="font-bold text-slate-900">{getStatusInfo(searchedTrip.status).label}</span>
              </div>
            </div>

            <div className="space-y-2 text-slate-700">
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">Tên phương tiện:</span>
                <span className="font-bold text-slate-900 sm:text-right">
                  {searchedTrip.vesselName} ({searchedTrip.vesselRegNumber})
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">Tuyến hành trình:</span>
                <span className="font-bold text-slate-900 sm:text-right">{searchedTrip.routeName}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">Bến rời → Bến đến:</span>
                <span className="font-semibold text-slate-900 sm:text-right">
                  {searchedTrip.departurePortName} → {searchedTrip.arrivalPortName}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">Thuyền trưởng:</span>
                <span className="font-bold text-slate-900 sm:text-right">{searchedTrip.captainName}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">Giờ dự kiến rời bến:</span>
                <span className="font-semibold text-slate-900 sm:text-right">
                  {formatDateTime(searchedTrip.scheduledDepartureTime)}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">Tổng số hành khách đăng ký:</span>
                <span className="font-extrabold text-slate-900 text-sm sm:text-right">
                  {searchedTrip.passengerCount} người
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">Cấp phép / Ký phát hành:</span>
                <span className="font-bold text-blue-900 sm:text-right">
                  {!searchedTrip.approvedByName ||
                  searchedTrip.approvedByName === 'Phạm Minh Đức' ||
                  searchedTrip.approvedByName === 'Lãnh đạo Sở Xây dựng'
                    ? repository.getPermitSignerConfig().name
                    : searchedTrip.approvedByName}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-1.5">
                <span className="text-slate-500 shrink-0">Thời hạn hiệu lực (24 giờ):</span>
                <span className="font-semibold text-red-700 sm:text-right">
                  {searchedTrip.orderValidUntil
                    ? formatDateTime(searchedTrip.orderValidUntil)
                    : '24 giờ kể từ thời điểm cấp phép'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-[11px] text-slate-600">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                <strong>Bảo vệ dữ liệu cá nhân (Nghị định 356/2025/NĐ-CP):</strong> Cổng tra cứu công khai không hiển thị họ tên, số điện thoại, số CCCD và địa chỉ cư trú của hành khách.
              </span>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500">
            Không tìm thấy thông tin Giấy phép ứng với mã trên. Vui lòng kiểm tra lại.
          </div>
        )}
      </div>

      {onNavigate && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
          >
            ← Quay lại Bảng điều khiển hệ thống
          </button>
        </div>
      )}
    </div>
  );
};
