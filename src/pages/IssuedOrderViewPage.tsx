/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UserAccount } from '../types';
import { repository } from '../services/repository';
import { DigitalOrderA4 } from '../components/DigitalOrderA4';
import {
  getUserAccessibleVesselIds,
  isTripAccessibleToUser,
  normalizeStatus,
} from '../utils/userPermissions';
import { ArrowLeft, AlertTriangle, FileCheck, Download, QrCode, CheckCircle2, XCircle } from 'lucide-react';
import { CoastalPageHero } from '../components/CoastalPageHero';

interface IssuedOrderViewPageProps {
  tripId: string;
  currentUser: UserAccount;
  onNavigate: (page: string, tripId?: string) => void;
}

export const IssuedOrderViewPage: React.FC<IssuedOrderViewPageProps> = ({
  tripId,
  currentUser,
  onNavigate,
}) => {
  const trip = repository.getTripById(tripId);

  if (!trip) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <p className="text-slate-500 text-sm">Không tìm thấy Giấy phép rời cảng</p>
        <button
          onClick={() => onNavigate('trips')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const vessels = repository.getVessels();
  const crewCatalog = repository.getCrew();
  const accessibleVesselIds = getUserAccessibleVesselIds(currentUser, vessels, crewCatalog);

  if (currentUser.role === 'CAPTAIN') {
    const isAccessible = isTripAccessibleToUser(currentUser, trip, accessibleVesselIds);
    if (!isAccessible) {
      return (
        <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm max-w-xl mx-auto my-12 animate-in fade-in">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Không có quyền xem Giấy phép này</h2>
          <p className="text-slate-600 text-xs mt-2 leading-relaxed">
            Chủ tàu / Thuyền trưởng chỉ xem được Giấy phép của tàu mình. Hồ sơ này thuộc phương tiện {trip.vesselName} ({trip.vesselRegNumber}).
          </p>
          <button
            onClick={() => onNavigate('trips')}
            className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Quay lại danh sách hồ sơ của tàu bạn
          </button>
        </div>
      );
    }
  }

  const st = normalizeStatus(trip.status);
  const isDraftForSignature = [
    'NHAP',
    'CHO_KIEM_TRA',
    'TRA_CHU_TAU',
    'KHONG_CHAP_THUAN',
    'DA_CHAP_THUAN',
    'CHO_SO_XU_LY',
    'TRA_BQL_CANG',
    'TAM_DUNG_THOI_TIET',
    'DA_DUYET',
    'DANG_TRINH_OFFICE',
    'OFFICE_TRA_LAI',
  ].includes(st);

  const signedPdfUrl = trip.issuedPdfUrl || trip.officeSubmissionRecord?.issuedPdfUrl;
  const signedPdfName =
    trip.issuedPdfName || trip.officeSubmissionRecord?.issuedPdfName || `GiayPhep_${trip.tripNumber}.pdf`;
  const verifyResult = repository.verifyPermitByCode(trip.orderNumber || trip.tripNumber);

  return (
    <div className="space-y-5">
      <div className="print:hidden space-y-4">
        <CoastalPageHero
          title={
            isDraftForSignature
              ? `Dự thảo Giấy phép (Chưa đóng dấu): ${trip.tripNumber}`
              : `Giấy phép rời cảng số: ${trip.orderNumber || trip.tripNumber}`
          }
          subtitle={`Tàu ${trip.vesselName} (${trip.vesselRegNumber}) • Tuyến: ${trip.routeName}`}
          icon={<FileCheck className="w-7 h-7" />}
          badge={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigate('trip-detail', trip.id)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/25 text-[11px] font-bold transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Chi tiết hồ sơ</span>
              </button>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                  verifyResult.outcome === 'HOP_LE'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : verifyResult.outcome === 'DA_XUAT_BEN'
                    ? 'bg-sky-100 text-sky-900 border-sky-300'
                    : 'bg-rose-100 text-rose-900 border-rose-300'
                }`}
              >
                {verifyResult.outcome === 'HOP_LE' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                QR: {verifyResult.outcome}
              </span>
            </div>
          }
          rightContent={
            <button
              onClick={() => onNavigate('public-verify', trip.orderNumber || trip.tripNumber)}
              className="px-4 py-2 text-xs font-extrabold text-[#072b61] bg-[#f4cf47] hover:bg-[#eab308] rounded-full transition cursor-pointer shadow-sm inline-flex items-center gap-1.5"
            >
              <QrCode className="w-4 h-4" />
              <span>Mở cổng xác thực QR →</span>
            </button>
          }
        />

        {signedPdfUrl && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-black text-emerald-950">Bản PDF Giấy phép đã ký số / đóng dấu đỏ từ hệ thống Office</p>
              <p className="text-emerald-800 mt-0.5">
                Tệp phát hành chính thức: <strong className="font-mono">{signedPdfName}</strong>
              </p>
            </div>
            <a
              href={signedPdfUrl}
              target="_blank"
              rel="noreferrer"
              download={signedPdfName}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              Tải bản PDF dấu đỏ
            </a>
          </div>
        )}
      </div>

      <DigitalOrderA4
        trip={trip}
        showActions={true}
        isDraftForSignature={isDraftForSignature}
      />
    </div>
  );
};
