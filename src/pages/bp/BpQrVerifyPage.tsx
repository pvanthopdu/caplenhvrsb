/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Eye,
  QrCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { QrVerifyOutcomeCode, TripRecord, UserAccount } from '../../types';
import { repository } from '../../services/repository';
import { formatDateTime } from '../../utils/formatters';
import { normalizeStatus } from '../../utils/userPermissions';
import { BpDossierReadOnlyModal } from '../../components/bp/BpDossierReadOnlyModal';
import { BpLiftStopModal } from '../../components/bp/BpStopActionModals';
import { BpDepartureControlModal } from '../../components/bp/BpDepartureControlModal';

interface BpQrVerifyPageProps {
  currentUser: UserAccount;
}

const OUTCOME_STYLE: Record<
  QrVerifyOutcomeCode,
  { bgClass: string; title: string }
> = {
  HOP_LE: { bgClass: 'bg-emerald-700', title: 'HỢP LỆ' },
  HET_HIEU_LUC: { bgClass: 'bg-red-700', title: 'HẾT HIỆU LỰC (>24H)' },
  TAM_DINH_CHI: { bgClass: 'bg-red-700', title: 'TẠM ĐÌNH CHỈ' },
  DA_THU_HOI: { bgClass: 'bg-rose-800', title: 'ĐÃ THU HỒI' },
  DA_XUAT_BEN: { bgClass: 'bg-sky-700', title: 'ĐÃ XUẤT BẾN' },
  KHONG_TON_TAI: { bgClass: 'bg-slate-900', title: 'KHÔNG TỒN TẠI' },
};

export const BpQrVerifyPage: React.FC<BpQrVerifyPageProps> = ({ currentUser }) => {
  const [manualInput, setManualInput] = useState('110/2026/AB-LS');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const [viewTrip, setViewTrip] = useState<TripRecord | null>(null);
  const [controlTrip, setControlTrip] = useState<TripRecord | null>(null);
  const [liftState, setLiftState] = useState<{ trip: TripRecord; stopId?: string } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRegionId = 'bp-qr-reader-region';

  const bpConfig = useMemo(() => repository.getBpConfig(), [refreshTick]);
  const vessels = useMemo(() => repository.getVessels(), []);

  const extractLookupCode = (rawText: string): string => {
    const trimmed = rawText.trim();
    if (!trimmed) return '';
    if (trimmed.includes('/xac-thuc-lenh/')) {
      const part = trimmed.split('/xac-thuc-lenh/').pop() || '';
      return decodeURIComponent(part.split(/[?#]/)[0]).trim();
    }
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const u = new URL(trimmed);
        const param = u.searchParams.get('code') || u.searchParams.get('id');
        if (param) return param.trim();
      }
    } catch {
      // ignore URL parse error
    }
    return trimmed;
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // ignore cleanup error
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      await stopCamera();
      const html5Qr = new Html5Qrcode(scannerRegionId);
      scannerRef.current = html5Qr;
      setCameraActive(true);
      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          const parsed = extractLookupCode(decodedText);
          setManualInput(parsed);
          setSearchedQuery(parsed);
          void stopCamera();
        },
        () => {
          // ignore frame decode miss
        }
      );
    } catch (err) {
      setCameraActive(false);
      setCameraError(
        err instanceof Error && err.message
          ? `Không mở được camera (${err.message}). Vui lòng dùng ô nhập mã thủ công bên dưới.`
          : 'Thiết bị không hỗ trợ hoặc chưa cấp quyền camera. Vui lòng nhập mã thủ công bên dưới.'
      );
    }
  };

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, []);

  const verifyResult = useMemo(() => {
    const clean = extractLookupCode(searchedQuery);
    if (!clean) return null;
    return repository.verifyPermitByCode(clean);
  }, [searchedQuery, refreshTick]);

  const matchedTrip = verifyResult?.trip;
  const activeStop = matchedTrip ? repository.getActiveDeNghiDungForTrip(matchedTrip.id) : undefined;
  const vessel = matchedTrip ? vessels.find((v) => v.id === matchedTrip.vesselId) : undefined;

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchedQuery(manualInput);
  };

  const isBpActor = currentUser.role === 'BP_TRUC' || currentUser.role === 'BP_CHIHUY' || currentUser.role === 'ADMIN';
  const canLift = Boolean(
    matchedTrip &&
      normalizeStatus(matchedTrip.status) === 'TAM_GIU_BIEN_PHONG' &&
      (activeStop
        ? repository.canUserLiftBpStop(currentUser, activeStop)
        : currentUser.role === 'BP_CHIHUY' || currentUser.role === 'ADMIN')
  );
  const allowedPax = matchedTrip
    ? `${matchedTrip.passengerCount} HK + ${matchedTrip.crewMembers?.length || 0} TV (Tối đa ${vessel?.maxPassengers || matchedTrip.passengerCount} HK)`
    : '';

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          {bpConfig.unitDisplayName} · Kiểm soát QR Giấy phép rời cảng
        </p>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">
          Quét mã QR xác thực Giấy phép rời cảng
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Quét mã QR trên Giấy phép rời cảng hoặc nhập Số Giấy phép / Mã hồ sơ để kiểm tra: Hợp lệ, Hết hiệu lực, Tạm đình chỉ, Đã thu hồi, Đã xuất bến, Không tồn tại.
        </p>
      </div>

      {/* Camera Scanner + Manual Input */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <QrCode className="w-5 h-5 text-sky-700" />
            <span>Camera quét QR</span>
          </div>
          <button
            type="button"
            onClick={() => (cameraActive ? void stopCamera() : void startCamera())}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer ${
              cameraActive
                ? 'bg-red-700 hover:bg-red-800 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {cameraActive ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            <span>{cameraActive ? 'Tắt camera' : 'Bật camera quét QR'}</span>
          </button>
        </div>

        <div
          id={scannerRegionId}
          className={`w-full rounded-xl overflow-hidden border border-slate-300 bg-slate-950 ${
            cameraActive ? 'min-h-[260px]' : 'hidden'
          }`}
        />

        {cameraError && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
        )}

        <form onSubmit={handleManualLookup} className="space-y-2.5">
          <label className="block text-sm font-semibold text-slate-800">
            Nhập mã Giấy phép / Mã hồ sơ / Mã xác thực
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="VD: 001/2026/LS-AB, 002/2026/LS-AB, HS-2026-0003..."
                className="w-full min-h-[44px] pl-9 pr-3 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-bold shrink-0 cursor-pointer"
            >
              Kiểm tra Giấy phép
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-slate-500 py-1">Mã thử nhanh:</span>
            {['001/2026/LS-AB', '002/2026/LS-AB', 'HS-2026-0003', 'KHONG-TON-TAI'].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setManualInput(sample);
                  setSearchedQuery(sample);
                }}
                className="px-2.5 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 font-mono text-slate-700 cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Result Banner + Details */}
      {verifyResult && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div
            className={`px-5 py-4 text-white flex items-center gap-3 ${
              OUTCOME_STYLE[verifyResult.outcome].bgClass
            }`}
          >
            {verifyResult.outcome === 'HOP_LE' && <CheckCircle2 className="w-8 h-8 shrink-0" />}
            {(verifyResult.outcome === 'TAM_DINH_CHI' ||
              verifyResult.outcome === 'HET_HIEU_LUC' ||
              verifyResult.outcome === 'DA_THU_HOI') && (
              <ShieldAlert className="w-8 h-8 shrink-0" />
            )}
            {verifyResult.outcome === 'DA_XUAT_BEN' && <CheckCircle2 className="w-8 h-8 shrink-0" />}
            {verifyResult.outcome === 'KHONG_TON_TAI' && <XCircle className="w-8 h-8 shrink-0" />}
            <div>
              <p className="text-xs uppercase tracking-wider opacity-90">Kết quả xác thực Giấy phép</p>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                {OUTCOME_STYLE[verifyResult.outcome].title}
              </h2>
              <p className="text-xs sm:text-sm opacity-95 mt-0.5">{verifyResult.reasonDetail}</p>
            </div>
          </div>

          {matchedTrip && (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 p-3 space-y-1">
                  <p className="text-xs text-slate-500">Số Giấy phép / Mã hồ sơ</p>
                  <p className="font-bold font-mono text-slate-900">
                    {matchedTrip.orderNumber || 'Chưa cấp'} · {matchedTrip.tripNumber}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 space-y-1">
                  <p className="text-xs text-slate-500">Phương tiện & Thuyền trưởng</p>
                  <p className="font-bold text-slate-900">
                    {matchedTrip.vesselName} ({matchedTrip.vesselRegNumber})
                  </p>
                  <p className="text-xs text-slate-600">Thuyền trưởng: {matchedTrip.captainName}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 space-y-1">
                  <p className="text-xs text-slate-500">Số người được phép chở</p>
                  <p className="font-bold font-mono tabular-nums text-slate-900">{allowedPax}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 space-y-1">
                  <p className="text-xs text-slate-500">Thời điểm cấp & Hạn hiệu lực 24 giờ</p>
                  <p className="text-xs font-mono tabular-nums text-slate-800">
                    Cấp: {formatDateTime(matchedTrip.issuedAt || matchedTrip.sealedAt)}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-slate-800">
                    Hạn 24h: {formatDateTime(matchedTrip.orderValidUntil)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setViewTrip(matchedTrip)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Xem hồ sơ (chỉ đọc)</span>
                </button>

                {isBpActor && verifyResult.outcome === 'HOP_LE' && (
                  <button
                    type="button"
                    onClick={() => setControlTrip(matchedTrip)}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Kiểm soát xuất bến</span>
                  </button>
                )}

                {canLift && (
                  <button
                    type="button"
                    onClick={() => setLiftState({ trip: matchedTrip, stopId: activeStop?.id })}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Gỡ tạm giữ Biên phòng</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
        onSuccess={() => setRefreshTick((v) => v + 1)}
      />

      {liftState && (
        <BpLiftStopModal
          isOpen={true}
          onClose={() => setLiftState(null)}
          stopRecord={
            liftState.stopId
              ? repository.getDeNghiDungs().find((d) => d.id === liftState.stopId) || null
              : null
          }
          tripId={liftState.trip.id}
          tripNumber={liftState.trip.tripNumber}
          vesselName={liftState.trip.vesselName}
          actor={currentUser}
          onSuccess={() => setRefreshTick((v) => v + 1)}
        />
      )}
    </div>
  );
};
