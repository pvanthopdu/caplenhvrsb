/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  UserAccount,
  SystemRuleConfig,
  BpSystemConfig,
  AdminOperationalConfig,
} from '../types';
import { repository } from '../services/repository';
import { fileStorageService } from '../services/fileStorageService';
import { formatDateTime } from '../utils/formatters';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
import {
  Settings,
  Users,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Ship,
  Anchor,
  HardDrive,
  Download,
  Upload,
  X,
  Server,
  FolderOpen,
  RefreshCw,
  Loader2,
  FileSignature,
} from 'lucide-react';
import {
  DEFAULT_ORDER_SIGNER_AUTHORITY,
  DEFAULT_ORDER_SIGNER_NAME,
  DEFAULT_ORDER_SIGNER_TITLE,
  DEFAULT_ORDER_SIGN_LOCATION,
} from '../config/systemDefaults';
import { CoastalPageHero } from '../components/CoastalPageHero';
import { PaginationBar, usePagination } from '../components/PaginationBar';
import { dossierArchiveService, ServerDossiersOverview } from '../services/dossierArchiveService';

interface SystemAdminPageProps {
  currentUser: UserAccount;
  onNavigate: (page: string) => void;
}

export const SystemAdminPage: React.FC<SystemAdminPageProps> = ({ currentUser, onNavigate }) => {
  const rulesConfig = repository.getRulesConfig();
  const auditLogs = repository.getAuditLogs();

  const [activeTab, setActiveTab] = useState<
    'OPERATIONAL_CONFIG' | 'PERMISSIONS' | 'RULES' | 'AUDIT_LOGS' | 'RETENTION' | 'DEPLOYMENT_SYNC'
  >('OPERATIONAL_CONFIG');
  const [rules, setRules] = useState<SystemRuleConfig[]>(rulesConfig);
  const [bpConfig, setBpConfig] = useState<BpSystemConfig>(() => repository.getBpConfig());
  const [bpConfigSavedMsg, setBpConfigSavedMsg] = useState<string>('');
  const [adminConfig, setAdminConfig] = useState<AdminOperationalConfig>(() =>
    repository.getAdminConfig()
  );
  const [adminConfigSavedMsg, setAdminConfigSavedMsg] = useState<string>('');
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const personalAccessLogs = repository.getPersonalDataAccessLogs();
  const auditPagination = usePagination(auditLogs, activeTab);
  const personalAccessPagination = usePagination(personalAccessLogs, activeTab);
  const [anonymizeResult, setAnonymizeResult] = useState<any>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string>('');
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Chẩn đoán dung lượng lưu trữ & Sao lưu JSON
  const [storageDiag, setStorageDiag] = useState<ReturnType<typeof repository.getStorageDiagnostics>>(() =>
    repository.getStorageDiagnostics()
  );
  const [idbStats, setIdbStats] = useState<{ count: number; totalBytes: number; readableSize: string }>({
    count: 0,
    totalBytes: 0,
    readableSize: '0 B',
  });
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [serverOverview, setServerOverview] = useState<ServerDossiersOverview | null>(null);
  const [isSyncingAllToServer, setIsSyncingAllToServer] = useState(false);

  const refreshStorageMetrics = async () => {
    setStorageDiag(repository.getStorageDiagnostics());
    const [idb, srv] = await Promise.all([
      fileStorageService.getStoredFilesStats(),
      dossierArchiveService.listServerDossiers(),
    ]);
    setIdbStats(idb);
    if (srv) setServerOverview(srv);
  };

  const handleSyncAllTripsToServer = async () => {
    setIsSyncingAllToServer(true);
    setBackupNotice(null);
    try {
      const trips = repository.getTrips();
      const incoming = repository.getIncomingDossiers();
      let syncedFolders = 0;
      let uploadedFiles = 0;
      for (const t of trips) {
        const linked = incoming.find((d) => d.tripId === t.id || d.tripNumber === t.tripNumber) || null;
        const res = await dossierArchiveService.syncTripToServer(t, {
          incomingDossier: linked,
          actorName: currentUser.fullName,
          syncPendingAttachments: true,
        });
        if (res.dossier) syncedFolders += 1;
        uploadedFiles += res.uploadedCount;
      }
      await refreshStorageMetrics();
      setBackupNotice({
        type: 'success',
        text: `Đã đồng bộ ${syncedFolders}/${trips.length} thư mục hồ sơ (theo Mã hồ sơ) lên Server${
          uploadedFiles > 0 ? `, kèm ${uploadedFiles} tệp giấy tờ đính kèm.` : '.'
        }`,
      });
    } catch (err: any) {
      setBackupNotice({
        type: 'error',
        text: err?.message || 'Không thể đồng bộ toàn bộ hồ sơ lên Server.',
      });
    } finally {
      setIsSyncingAllToServer(false);
    }
  };

  useEffect(() => {
    refreshStorageMetrics();
    const unsub = repository.subscribe(() => {
      setStorageDiag(repository.getStorageDiagnostics());
    });
    return unsub;
  }, []);

  const executeResetSystemData = () => {
    setShowResetConfirm(false);
    setIsResetting(true);
    setTimeout(() => {
      repository.resetAllSystemData();
      setIsResetting(false);
      refreshStorageMetrics();
      setResetSuccessMessage('Đã khôi phục và đồng bộ toàn bộ dữ liệu mẫu hệ thống thành công theo quy trình chuẩn 18 trạng thái (Chủ tàu → BQL Cảng → Sở & Office → Biên phòng).');
      setTimeout(() => setResetSuccessMessage(''), 8000);
    }, 350);
  };

  const handleExportFullBackup = () => {
    try {
      const jsonContent = repository.exportFullBackupJson();
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `VRSB_QuangNgai_Backup_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupNotice({
        type: 'success',
        text: 'Đã xuất tệp sao lưu toàn bộ hồ sơ chuyến, sổ hồ sơ đến, tàu, thuyền viên và nhật ký (.json).',
      });
    } catch (err: any) {
      setBackupNotice({
        type: 'error',
        text: err?.message || 'Không thể xuất tệp sao lưu dữ liệu.',
      });
    }
  };

  const handleImportFullBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const result = repository.importFullBackupJson(text, currentUser);
      await refreshStorageMetrics();
      if (result.success) {
        setBackupNotice({
          type: 'success',
          text: `Khôi phục thành công ${result.tripsCount ?? 0} hồ sơ chuyến và ${result.dossiersCount ?? 0} hồ sơ đến từ tệp sao lưu.`,
        });
      } else {
        setBackupNotice({ type: 'error', text: result.error || 'Tệp sao lưu không hợp lệ.' });
      }
    } catch {
      setBackupNotice({ type: 'error', text: 'Không thể đọc tệp sao lưu đã chọn.' });
    }
  };

  // Bật/tắt quy tắc
  const handleToggleRule = (code: string) => {
    const updated = rules.map((r) => (r.code === code ? { ...r, isEnabled: !r.isEnabled } : r));
    setRules(updated);
    repository.saveRulesConfig(updated);
    repository.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'CẬP_NHẬT_QUY_TẮC',
      targetType: 'RULE',
      details: `Thay đổi cấu hình quy tắc ${code}`,
    });
  };

  // Chuyển đổi trạng thái chặn / cảnh báo
  const handleToggleBlocking = (code: string) => {
    const updated = rules.map((r) => (r.code === code ? { ...r, isBlocking: !r.isBlocking } : r));
    setRules(updated);
    repository.saveRulesConfig(updated);
  };

  // Khởi chạy mô phỏng ẩn danh dữ liệu cũ > 12 tháng
  const handleRunAnonymization = () => {
    const res = repository.simulateAnonymizeOldData();
    setAnonymizeResult(res);
  };

  const handleSaveBpConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized: BpSystemConfig = {
      unitDisplayName: bpConfig.unitDisplayName.trim() || 'Đồn Biên phòng Lý Sơn',
      roleLabelTruc: bpConfig.roleLabelTruc.trim() || 'Cán bộ trực Biên phòng',
      roleLabelChiHuy: bpConfig.roleLabelChiHuy.trim() || 'Chỉ huy Đồn Biên phòng',
      quyenGoDeNghi: bpConfig.quyenGoDeNghi,
      standardTransitMinutesOutbound: Math.max(5, Number(bpConfig.standardTransitMinutesOutbound) || 30),
      standardTransitMinutesInbound: Math.max(5, Number(bpConfig.standardTransitMinutesInbound) || 30),
      overdueGraceMinutes: Math.max(5, Number(bpConfig.overdueGraceMinutes) || 15),
    };
    repository.saveBpConfig(normalized);
    setBpConfig(normalized);
    repository.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'CẬP_NHẬT_CẤU_HÌNH_BIÊN_PHÒNG',
      targetType: 'SYSTEM',
      details: `Cập nhật đơn vị phối hợp "${normalized.unitDisplayName}", quyenGoDeNghi=${normalized.quyenGoDeNghi}, tuyến=${normalized.standardTransitMinutesOutbound}/${normalized.standardTransitMinutesInbound}p + ${normalized.overdueGraceMinutes}p.`,
    });
    setBpConfigSavedMsg('Đã lưu cấu hình lực lượng phối hợp & tham số Biên phòng thành công!');
    setTimeout(() => setBpConfigSavedMsg(''), 5000);
  };

  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAdminConfig((prev) => ({ ...prev, paymentQrImageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAdminConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPageSize = Math.min(
      200,
      Math.max(5, Math.floor(Number(adminConfig.paginationPageSize) || 15))
    );
    const permitSignerName =
      (adminConfig.permitSignerName || '').trim() || DEFAULT_ORDER_SIGNER_NAME;
    const permitSignerAuthority =
      adminConfig.permitSignerAuthority !== undefined
        ? adminConfig.permitSignerAuthority.trim()
        : DEFAULT_ORDER_SIGNER_AUTHORITY;
    const permitSignerTitle =
      (adminConfig.permitSignerTitle || '').trim() || DEFAULT_ORDER_SIGNER_TITLE;
    const permitSignLocation =
      (adminConfig.permitSignLocation || '').trim() || DEFAULT_ORDER_SIGN_LOCATION;
    const normalized: AdminOperationalConfig = {
      ...adminConfig,
      permitSignerName,
      permitSignerAuthority,
      permitSignerTitle,
      permitSignLocation,
      bqlProcessingSlaMinutes: Math.max(5, Number(adminConfig.bqlProcessingSlaMinutes) || 60),
      deptProcessingSlaMinutes: Math.max(5, Number(adminConfig.deptProcessingSlaMinutes) || 60),
      officeUploadSlaMinutes: Math.max(1, Number(adminConfig.officeUploadSlaMinutes) || 10),
      paginationPageSize: normalizedPageSize,
    };
    repository.saveAdminConfig(normalized, currentUser);
    setAdminConfig(normalized);
    setAdminConfigSavedMsg(
      `Đã lưu cấu hình vận hành! Người ký phát hành Giấy phép: ${permitSignerName} (${[
        permitSignerAuthority,
        permitSignerTitle,
      ]
        .filter(Boolean)
        .join(' / ')}), phân trang ${normalizedPageSize} bản ghi/trang.`
    );
    setTimeout(() => setAdminConfigSavedMsg(''), 5000);
  };

  // Ma trận phân quyền chuẩn 7 nhóm vai trò (không duyệt trên app với TP/LĐ; BP kiểm soát cuối cùng)
  const permissionMatrix = [
    { feature: 'Nộp hồ sơ chuyến, biên lai phí QR & rút hồ sơ trước cấp phép', roles: ['ADMIN', 'CAPTAIN'] },
    { feature: 'Kiểm tra thực tế 8 nhóm tại bến, ra Thông báo chấp thuận (theo ca/bến)', roles: ['ADMIN', 'PORT_STAFF'] },
    { feature: 'Kiểm tra thời tiết (R7), duyệt dự thảo, xuất Word/PDF trình Office & tải GP đã ký', roles: ['ADMIN', 'OFFICER'] },
    { feature: 'Xem bảng điều hành, KPI, báo cáo & duyệt giải trình trễ hạn KPI (ký trên Office)', roles: ['ADMIN', 'DEPT_HEAD'] },
    { feature: 'Xem bảng điều hành & báo cáo tổng hợp (chỉ đọc; ký GP trên Office)', roles: ['ADMIN', 'LEADER'] },
    { feature: 'Xem trước (chỉ đọc) danh sách thuyền viên/hành khách chuyến đang làm thủ tục tại bến', roles: ['ADMIN', 'BP_TRUC', 'BP_CHIHUY'] },
    { feature: 'Kiểm soát cuối cùng sau khi đã có Giấy phép (Quét QR, điểm danh, xuất bến / trả R12 / tạm giữ)', roles: ['ADMIN', 'BP_TRUC', 'BP_CHIHUY'] },
    { feature: 'Gỡ tạm giữ bất thường của bất kỳ cán bộ nào & Báo cáo tổng hợp Biên phòng', roles: ['ADMIN', 'BP_CHIHUY'] },
    { feature: 'Xác nhận tàu cập bến đích (Biên phòng chính; BQL Cảng dự phòng)', roles: ['ADMIN', 'BP_TRUC', 'BP_CHIHUY', 'PORT_STAFF'] },
    { feature: 'Quản trị tài khoản, ca trực, cấu hình QR/mẫu, quy tắc R1–R12 & Nhật ký', roles: ['ADMIN'] },
  ];

  const roleHeaders: { code: any; label: string }[] = [
    { code: 'ADMIN', label: 'Quản trị' },
    { code: 'CAPTAIN', label: 'Chủ tàu' },
    { code: 'PORT_STAFF', label: 'BQL Cảng' },
    { code: 'OFFICER', label: 'Chuyên viên' },
    { code: 'DEPT_HEAD', label: 'Trưởng phòng' },
    { code: 'LEADER', label: 'Lãnh đạo Sở' },
    { code: 'BP_TRUC', label: 'BP Trực' },
    { code: 'BP_CHIHUY', label: 'BP Chỉ huy' },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <CoastalPageHero
        title="Quản trị hệ thống & Cấu hình vận hành"
        subtitle="Cấu hình QR thanh toán phí, mẫu văn bản, 8 nhóm checklist BQL, quy tắc R1–R12, định mức 60/60/10 phút và nhật ký hệ thống."
        icon={<Settings className="w-7 h-7" />}
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30 text-[11px] font-bold">
            Quản trị viên • RBAC &amp; Quy tắc R1–R12
          </span>
        }
        rightContent={
          <button
            onClick={() => onNavigate('user-management')}
            className="px-4 py-2.5 bg-[#f4cf47] hover:bg-[#eab308] text-[#072b61] rounded-full text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Quản lý tài khoản (Gmail) →</span>
          </button>
        }
      />

      {/* TABS QUẢN TRỊ */}
      <div className="bg-white/95 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] overflow-hidden">
        <div className="flex border-b border-[#dce8f7] bg-[#f4f8ff] text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('OPERATIONAL_CONFIG')}
            className={`py-3 px-4 border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'OPERATIONAL_CONFIG'
                ? 'border-blue-600 text-blue-700 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4 text-blue-600" />
            <span>QR thu phí, Người ký &amp; Định mức</span>
          </button>
          <button
            onClick={() => setActiveTab('DEPLOYMENT_SYNC')}
            className={`py-3 px-4 border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'DEPLOYMENT_SYNC'
                ? 'border-blue-600 text-blue-700 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-blue-600" />
            <span>Vận hành &amp; Đồng bộ dữ liệu</span>
          </button>
          <button
            onClick={() => setActiveTab('PERMISSIONS')}
            className={`py-3 px-4 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'PERMISSIONS'
                ? 'border-blue-600 text-blue-700 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Ma trận phân quyền
          </button>
          <button
            onClick={() => setActiveTab('RULES')}
            className={`py-3 px-4 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'RULES'
                ? 'border-blue-600 text-blue-700 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Quy tắc R1 – R12 &amp; Biên phòng
          </button>
          <button
            onClick={() => setActiveTab('AUDIT_LOGS')}
            className={`py-3 px-4 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'AUDIT_LOGS'
                ? 'border-blue-600 text-blue-700 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Nhật ký hệ thống (Audit Logs)
          </button>
          <button
            onClick={() => setActiveTab('RETENTION')}
            className={`py-3 px-4 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'RETENTION'
                ? 'border-blue-600 text-blue-700 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Lưu trữ 5 năm &amp; Ẩn danh
          </button>
        </div>

        <div className="p-6">
          {/* TAB MỚI: CẤU HÌNH QR THANH TOÁN, MẪU VĂN BẢN, ĐỊNH MỨC & CHECKLIST 8 NHÓM */}
          {activeTab === 'OPERATIONAL_CONFIG' && (
            <form onSubmit={handleSaveAdminConfig} className="space-y-6 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-black text-[#07244d]">
                    Cấu hình vận hành nghiệp vụ (Mục 2, 3, 4 &amp; 8)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Quản trị mã QR nộp phí do Sở cung cấp, người ký phát hành Giấy phép rời cảng, định mức 60/60/10 phút, mẫu Thông báo chấp thuận / dự thảo Giấy phép và danh mục kiểm tra 8 nhóm của BQL Cảng.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#072b61] hover:bg-[#0c4a9c] text-white font-extrabold rounded-xl cursor-pointer shadow-xs"
                >
                  Lưu cấu hình vận hành
                </button>
              </div>

              {adminConfigSavedMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{adminConfigSavedMsg}</span>
                </div>
              )}

              {/* 1. Mã QR thu phí */}
              <div className="p-4 rounded-2xl bg-[#f4f8ff] border border-[#dce8f7] space-y-3">
                <h4 className="font-extrabold text-[#07244d] uppercase text-[11px]">
                  1. Mã QR thanh toán phí, lệ phí (hiển thị cho Chủ tàu khi nộp hồ sơ)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  <div className="space-y-2">
                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col items-center gap-2">
                      {adminConfig.paymentQrImageUrl ? (
                        <img
                          src={adminConfig.paymentQrImageUrl}
                          alt="Mã QR thu phí"
                          className="w-36 h-36 object-contain rounded-lg border border-slate-100"
                        />
                      ) : (
                        <div className="w-36 h-36 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-center p-2">
                          Chưa tải ảnh QR
                        </div>
                      )}
                      <input
                        ref={qrFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleQrImageUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => qrFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold cursor-pointer"
                      >
                        Tải ảnh QR mới
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Ngân hàng / Kho bạc</label>
                      <input
                        type="text"
                        value={adminConfig.paymentQrBankName}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, paymentQrBankName: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Số tài khoản</label>
                      <input
                        type="text"
                        value={adminConfig.paymentQrAccountNumber}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, paymentQrAccountNumber: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Đơn vị thụ hưởng</label>
                      <input
                        type="text"
                        value={adminConfig.paymentQrAccountHolder}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, paymentQrAccountHolder: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Cú pháp chuyển khoản</label>
                      <input
                        type="text"
                        value={adminConfig.paymentQrNote}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, paymentQrNote: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Cấu hình Người ký phát hành Giấy phép rời cảng */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSignature className="w-4 h-4 text-blue-700 shrink-0" />
                    <h4 className="font-extrabold text-[#07244d] uppercase text-[11px]">
                      2. Cấu hình Người ký phát hành Giấy phép rời cảng (A4, PDF, Word &amp; Office)
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-500">Mẫu nhanh:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAdminConfig({
                          ...adminConfig,
                          permitSignerAuthority: 'KT. GIÁM ĐỐC',
                          permitSignerTitle: 'PHÓ GIÁM ĐỐC',
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-[10px] cursor-pointer transition"
                    >
                      Phó Giám đốc (KT. GIÁM ĐỐC)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAdminConfig({
                          ...adminConfig,
                          permitSignerAuthority: '',
                          permitSignerTitle: 'GIÁM ĐỐC',
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-[10px] cursor-pointer transition"
                    >
                      Giám đốc ký trực tiếp
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                  <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Họ và tên người ký (*)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={DEFAULT_ORDER_SIGNER_NAME}
                        value={adminConfig.permitSignerName ?? DEFAULT_ORDER_SIGNER_NAME}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, permitSignerName: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-blue-300 bg-blue-50/30 rounded-xl font-bold text-[#07244d]"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Tự động áp dụng làm người ký mặc định khi xuất dự thảo Word/PDF và phát hành Giấy phép.
                      </p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Địa danh ký ban hành
                      </label>
                      <input
                        type="text"
                        placeholder={DEFAULT_ORDER_SIGN_LOCATION}
                        value={adminConfig.permitSignLocation ?? DEFAULT_ORDER_SIGN_LOCATION}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, permitSignLocation: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Hiển thị ở dòng ngày tháng ký (VD: Quảng Ngãi, ngày ... tháng ... năm ...).
                      </p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Quyền hạn ký (dòng 1 — tùy chọn)
                      </label>
                      <input
                        type="text"
                        placeholder="KT. GIÁM ĐỐC (để trống nếu Giám đốc ký)"
                        value={adminConfig.permitSignerAuthority ?? DEFAULT_ORDER_SIGNER_AUTHORITY}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, permitSignerAuthority: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white uppercase font-bold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        VD: <span className="font-semibold">KT. GIÁM ĐỐC</span> hoặc <span className="font-semibold">TL. GIÁM ĐỐC</span>. Để trống nếu Giám đốc ký trực tiếp.
                      </p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Chức danh người ký (dòng 2 — bắt buộc)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={DEFAULT_ORDER_SIGNER_TITLE}
                        value={adminConfig.permitSignerTitle ?? DEFAULT_ORDER_SIGNER_TITLE}
                        onChange={(e) =>
                          setAdminConfig({ ...adminConfig, permitSignerTitle: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white uppercase font-bold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        VD: <span className="font-semibold">PHÓ GIÁM ĐỐC</span> hoặc <span className="font-semibold">GIÁM ĐỐC</span>.
                      </p>
                    </div>
                  </div>

                  {/* Khung xem trước khối chữ ký trên Giấy phép A4 */}
                  <div className="p-4 rounded-xl bg-[#f8fbff] border border-[#dce8f7] flex flex-col justify-between">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-800 border-b border-[#dce8f7] pb-1.5 mb-2">
                      Xem trước phần ký Giấy phép (A4)
                    </div>
                    <div className="text-center font-serif text-slate-900 leading-snug py-1">
                      <p className="italic text-[11px]">
                        {(adminConfig.permitSignLocation || DEFAULT_ORDER_SIGN_LOCATION).trim()}, ngày{' '}
                        {String(new Date().getDate()).padStart(2, '0')} tháng{' '}
                        {String(new Date().getMonth() + 1).padStart(2, '0')} năm{' '}
                        {new Date().getFullYear()}
                      </p>
                      <p className="italic text-[10px] text-slate-600">Date.....mm.....yy</p>
                      {(adminConfig.permitSignerAuthority ?? '').trim() && (
                        <p className="font-bold uppercase text-[11.5px] mt-1">
                          {(adminConfig.permitSignerAuthority ?? '').trim()}
                        </p>
                      )}
                      <p className="font-bold uppercase text-[11.5px] mt-0.5">
                        {(adminConfig.permitSignerTitle || DEFAULT_ORDER_SIGNER_TITLE).trim()}
                      </p>
                      <div className="h-10 flex items-center justify-center">
                        <span className="text-[10px] italic text-slate-400 font-sans">
                          (Ký, ghi rõ họ tên &amp; đóng dấu)
                        </span>
                      </div>
                      <p className="font-bold text-[12px]">
                        {(adminConfig.permitSignerName || DEFAULT_ORDER_SIGNER_NAME).trim()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Định mức thời gian 60 / 60 / 10 & Tham số phân trang */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-[#07244d] uppercase text-[11px]">
                  3. Định mức thời gian xử lý chuẩn (SLA) &amp; Tham số phân trang hệ thống
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Đồng hồ 1: BQL Cảng (phút)
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={adminConfig.bqlProcessingSlaMinutes}
                      onChange={(e) =>
                        setAdminConfig({
                          ...adminConfig,
                          bqlProcessingSlaMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Đồng hồ 2: Sở Xây dựng (phút)
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={adminConfig.deptProcessingSlaMinutes}
                      onChange={(e) =>
                        setAdminConfig({
                          ...adminConfig,
                          deptProcessingSlaMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Tải Giấy phép sau duyệt Office (phút)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={adminConfig.officeUploadSlaMinutes}
                      onChange={(e) =>
                        setAdminConfig({
                          ...adminConfig,
                          officeUploadSlaMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-900 mb-1">
                      Phân trang mặc định (bản ghi/trang)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={adminConfig.paginationPageSize ?? 15}
                      onChange={(e) =>
                        setAdminConfig({
                          ...adminConfig,
                          paginationPageSize: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-blue-300 bg-blue-50/40 rounded-xl font-mono font-bold text-blue-950"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Mặc định 15. Tự động hiện thanh phân trang khi bảng vượt quá ngưỡng này.
                    </p>
                  </div>
                </div>
              </div>

              {/* 4. Mẫu văn bản & 5. Danh mục 8 nhóm kiểm tra BQL */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                  <h4 className="font-extrabold text-[#07244d] uppercase text-[11px]">
                    4. Mẫu Thông báo chấp thuận &amp; Dự thảo Giấy phép
                  </h4>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mẫu Thông báo BQL Cảng</label>
                    <textarea
                      rows={3}
                      value={adminConfig.approvalNoticeTemplate}
                      onChange={(e) =>
                        setAdminConfig({ ...adminConfig, approvalNoticeTemplate: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mẫu dự thảo Giấy phép trình Office</label>
                    <textarea
                      rows={3}
                      value={adminConfig.permitDraftTemplate}
                      onChange={(e) =>
                        setAdminConfig({ ...adminConfig, permitDraftTemplate: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                  <h4 className="font-extrabold text-[#07244d] uppercase text-[11px]">
                    5. Danh mục kiểm tra 8 nhóm tại bến ({adminConfig.bqlChecklistConfig.length} mục)
                  </h4>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {adminConfig.bqlChecklistConfig.map((item, idx) => (
                      <div key={item.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700 shrink-0">{item.groupCode}</span>
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => {
                            const next = [...adminConfig.bqlChecklistConfig];
                            next[idx] = { ...item, label: e.target.value };
                            setAdminConfig({ ...adminConfig, bqlChecklistConfig: next });
                          }}
                          className="flex-1 px-2 py-1 border border-slate-300 rounded bg-white text-[11px]"
                        />
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.isRequired}
                            onChange={(e) => {
                              const next = [...adminConfig.bqlChecklistConfig];
                              next[idx] = { ...item, isRequired: e.target.checked };
                              setAdminConfig({ ...adminConfig, bqlChecklistConfig: next });
                            }}
                          />
                          Bắt buộc
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </form>
          )}
          {/* TAB 1: MA TRẬN PHÂN QUYỀN */}
          {activeTab === 'PERMISSIONS' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Ma trận kiểm soát quyền truy cập chi tiết (RBAC). Mỗi vai trò chỉ thấy các menu và thao tác được cấp phép.
              </p>

              <div className="overflow-x-auto border border-[#dce8f7] rounded-2xl">
                <table className="w-full min-w-[720px] text-left text-xs text-slate-700">
                  <thead className="bg-[#edf4fe] text-[#07244d] uppercase text-[10px] font-extrabold border-b border-[#dce8f7]">
                    <tr>
                      <th className="py-3 px-3.5">Chức năng nghiệp vụ</th>
                      {roleHeaders.map((r) => (
                        <th key={r.code} className="py-3 px-2 text-center">
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {permissionMatrix.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3.5 font-bold text-slate-900">{item.feature}</td>
                        {roleHeaders.map((r) => {
                          const hasPerm = item.roles.includes(r.code);
                          return (
                            <td key={r.code} className="py-2.5 px-2 text-center">
                              {hasPerm ? (
                                <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs leading-5">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CẤU HÌNH QUY TẮC R1 - R9 */}
          {activeTab === 'RULES' && (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                Quản trị viên có thể bật/tắt hoặc chuyển đổi mức độ chặn bắt buộc / cảnh báo vàng đối với từng quy tắc:
              </p>

              <div className="space-y-3">
                {rules.map((r) => (
                  <div
                    key={r.code}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-blue-900">[{r.code}]</span>
                        <span className="font-bold text-slate-900">{r.name}</span>
                        {r.isBlocking ? (
                          <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.2 rounded-full">
                            Quy tắc chặn (Bắt buộc)
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.2 rounded-full">
                            Cảnh báo vàng
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">{r.description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleToggleBlocking(r.code)}
                        className="px-3 py-1.5 text-[11px] font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        {r.isBlocking ? 'Đổi sang Cảnh báo' : 'Đổi sang Bắt buộc'}
                      </button>

                      <button
                        onClick={() => handleToggleRule(r.code)}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                          r.isEnabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-300 text-slate-700'
                        }`}
                      >
                        {r.isEnabled ? 'Đang Bật' : 'Đã Tắt'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* CẤU HÌNH LỰC LƯỢNG PHỐI HỢP (BIÊN PHÒNG) */}
              <form
                onSubmit={handleSaveBpConfig}
                className="p-5 bg-[#f4f8ff] border border-[#dce8f7] rounded-2xl space-y-4 mt-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce8f7] pb-3">
                  <div>
                    <h3 className="text-sm font-black text-[#07244d] uppercase">
                      Cấu hình Lực lượng phối hợp (Biên phòng / Đơn vị kiểm soát)
                    </h3>
                    <p className="text-[11px] text-slate-600">
                      Cho phép đổi tên đơn vị, nhãn vai trò, quyền gỡ đề nghị (quyenGoDeNghi) và thời gian chuẩn hành trình mà không cần sửa mã nguồn.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#0d62e8] hover:bg-[#084fc0] text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                  >
                    Lưu cấu hình Biên phòng
                  </button>
                </div>

                {bpConfigSavedMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-bold text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{bpConfigSavedMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tên hiển thị đơn vị phối hợp</label>
                    <input
                      type="text"
                      value={bpConfig.unitDisplayName}
                      onChange={(e) => setBpConfig({ ...bpConfig, unitDisplayName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      placeholder="Đồn Biên phòng Lý Sơn"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nhãn vai trò trực (BP_TRUC)</label>
                    <input
                      type="text"
                      value={bpConfig.roleLabelTruc}
                      onChange={(e) => setBpConfig({ ...bpConfig, roleLabelTruc: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nhãn vai trò chỉ huy (BP_CHIHUY)</label>
                    <input
                      type="text"
                      value={bpConfig.roleLabelChiHuy}
                      onChange={(e) => setBpConfig({ ...bpConfig, roleLabelChiHuy: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Quyền gỡ đề nghị dừng (quyenGoDeNghi)</label>
                    <select
                      value={bpConfig.quyenGoDeNghi}
                      onChange={(e) =>
                        setBpConfig({
                          ...bpConfig,
                          quyenGoDeNghi: e.target.value as BpSystemConfig['quyenGoDeNghi'],
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                    >
                      <option value="chi_bien_phong">Chỉ Biên phòng được gỡ (Mặc định)</option>
                      <option value="bien_phong_hoac_lanh_dao_so">Biên phòng hoặc Lãnh đạo Sở (Tự thông báo BP)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Thời gian chuẩn Đảo Lớn → Đảo Bé (phút)</label>
                    <input
                      type="number"
                      min={5}
                      value={bpConfig.standardTransitMinutesOutbound}
                      onChange={(e) =>
                        setBpConfig({ ...bpConfig, standardTransitMinutesOutbound: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Ngưỡng cảnh báo quá giờ trên biển (+phút)</label>
                    <input
                      type="number"
                      min={5}
                      value={bpConfig.overdueGraceMinutes}
                      onChange={(e) =>
                        setBpConfig({ ...bpConfig, overdueGraceMinutes: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: NHẬT KÝ THAO TÁC AUDIT LOGS */}
          {activeTab === 'AUDIT_LOGS' && (
            <div className="space-y-6 text-xs">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-slate-600">
                    Nhật ký bất biến ghi nhận mọi thao tác: Người thực hiện, thời gian, IP và hành động (Không thể xóa).
                  </p>
                  <span className="font-bold text-slate-800">{auditLogs.length} sự kiện ghi nhận</span>
                </div>

                <div className="border border-[#dce8f7] rounded-2xl overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs text-slate-700">
                      <thead className="bg-[#edf4fe] text-[#07244d] uppercase text-[10px] font-extrabold border-b border-[#dce8f7]">
                        <tr>
                          <th className="py-2.5 px-3">Thời gian</th>
                          <th className="py-2.5 px-3">Người dùng / Ca trực</th>
                          <th className="py-2.5 px-3">Vai trò</th>
                          <th className="py-2.5 px-3">Hành động</th>
                          <th className="py-2.5 px-3">Chi tiết / Thay đổi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditPagination.pageItems.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                              {formatDateTime(log.timestamp)}
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900">{log.userName}</p>
                              {log.shiftName && (
                                <p className="text-[10px] text-emerald-700 font-semibold">{log.shiftName}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-blue-700 font-semibold">{log.userRole}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{log.action}</td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-md">
                              <p className="truncate" title={log.details}>{log.details}</p>
                              {(log.beforeValue || log.afterValue) && (
                                <p className="text-[10px] font-mono text-slate-500">
                                  {log.beforeValue || '—'} → <strong className="text-slate-800">{log.afterValue || '—'}</strong>
                                </p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    currentPage={auditPagination.currentPage}
                    totalPages={auditPagination.totalPages}
                    totalItems={auditPagination.totalItems}
                    pageSize={auditPagination.pageSize}
                    startIndex={auditPagination.startIndex}
                    endIndex={auditPagination.endIndex}
                    onPageChange={auditPagination.setCurrentPage}
                    itemLabel="sự kiện"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-extrabold text-[#07244d] text-xs sm:text-sm">
                      Nhật ký truy cập dữ liệu cá nhân hành khách (BP2 / BP8 — NhatKyTruyCapDuLieuCaNhan)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Ghi nhận mọi lượt mở khóa xem đầy đủ họ tên/CCCD/SĐT hành khách hoặc xuất danh sách tìm kiếm cứu nạn.
                    </p>
                  </div>
                  <span className="font-bold text-slate-800">{personalAccessLogs.length} lượt xem</span>
                </div>

                <div className="border border-[#dce8f7] rounded-2xl overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-xs text-slate-700">
                      <thead className="bg-amber-50 text-amber-950 uppercase text-[10px] font-extrabold border-b border-amber-200">
                        <tr>
                          <th className="py-2.5 px-3">Thời điểm</th>
                          <th className="py-2.5 px-3">Người xem / Khai thác</th>
                          <th className="py-2.5 px-3">Mã hồ sơ chuyến</th>
                          <th className="py-2.5 px-3">Lý do truy cập</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {personalAccessLogs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-400">
                              Chưa có lượt truy cập dữ liệu cá nhân nào được ghi nhận.
                            </td>
                          </tr>
                        ) : (
                          personalAccessPagination.pageItems.map((entry) => (
                            <tr key={entry.id} className="hover:bg-amber-50/30">
                              <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                {formatDateTime(entry.thoiDiem)}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{entry.nguoiXem}</td>
                              <td className="py-2.5 px-3 font-mono font-semibold text-blue-700">{entry.hoSoId}</td>
                              <td className="py-2.5 px-3 text-slate-700">{entry.lyDo}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    currentPage={personalAccessPagination.currentPage}
                    totalPages={personalAccessPagination.totalPages}
                    totalItems={personalAccessPagination.totalItems}
                    pageSize={personalAccessPagination.pageSize}
                    startIndex={personalAccessPagination.startIndex}
                    endIndex={personalAccessPagination.endIndex}
                    onPageChange={personalAccessPagination.setCurrentPage}
                    itemLabel="lượt truy cập"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CHÍNH SÁCH LƯU TRỮ 5 NĂM & ẨN DANH SAU 12 THÁNG */}
          {activeTab === 'RETENTION' && (
            <div className="space-y-4 text-xs max-w-2xl">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-blue-900">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Archive className="w-4 h-4 text-blue-600" />
                  Quy định lưu trữ dữ liệu hàng hải & Bảo vệ quyền riêng tư
                </h3>
                <p>
                  1. <strong>Thời hạn lưu trữ hồ sơ:</strong> 5 năm theo quy định lưu trữ chứng từ hàng hải và an toàn giao thông đường thủy nội địa.
                </p>
                <p>
                  2. <strong>Bảo vệ dữ liệu cá nhân (Nghị định 356/2025/NĐ-CP):</strong> Thông tin cá nhân của hành khách (họ tên, CCCD, số điện thoại, địa chỉ) tự động được mã hóa và ẩn danh sau 12 tháng kể từ ngày hoàn thành chuyến, chỉ giữ lại số liệu nhân khẩu học (năm sinh, giới tính) phục vụ thống kê.
                </p>
              </div>

              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900">Chạy thử mô phỏng tính năng ẩn danh dữ liệu sau 12 tháng:</h4>
                <p className="text-slate-600">
                  Bấm nút bên dưới để quét toàn bộ hồ sơ cũ và tự động che bớt thông tin định danh cá nhân của hành khách:
                </p>
                <button
                  onClick={handleRunAnonymization}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer transition shadow-xs"
                >
                  ▶ Chạy thử nghiệm trình ẩn danh dữ liệu 12 tháng
                </button>

                {anonymizeResult && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-medium">
                    ✓ Đã quét và thực hiện ẩn danh dữ liệu an toàn cho {anonymizeResult.affectedPassengersCount} hành khách trên {anonymizeResult.affectedTripsCount} hồ sơ chuyến cũ.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 0: VẬN HÀNH & ĐỒNG BỘ DỮ LIỆU */}
          {activeTab === 'DEPLOYMENT_SYNC' && (
            <div className="space-y-6">
              {resetSuccessMessage && (
                <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex items-start gap-3 text-emerald-950 animate-in fade-in duration-200 shadow-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-sm text-emerald-900">THỰC HIỆN THÀNH CÔNG!</h4>
                    <p className="text-xs text-emerald-800 mt-0.5 font-medium">{resetSuccessMessage}</p>
                  </div>
                </div>
              )}

              {/* KHỐI TÁC VỤ RESET DỮ LIỆU MẪU */}
              <div className="p-5 sm:p-6 bg-gradient-to-r from-[#065fd4] via-[#0c74e8] to-[#1a8df5] rounded-[22px] text-white shadow-[0_14px_34px_-10px_rgba(10,92,212,0.34)] border border-white/25">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-2 max-w-2xl">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#f4cf47] text-[#072b61] rounded-full text-xs font-extrabold shadow-xs">
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Đồng bộ hóa &amp; Đưa vào vận hành</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                      Khôi phục toàn bộ Dữ liệu mẫu &amp; Đồng bộ Lệnh trên hệ thống
                    </h2>
                    <p className="text-xs text-blue-50 leading-relaxed">
                      Thiết lập lại toàn bộ dữ liệu mẫu về trạng thái chuẩn, đồng bộ liên thông giữa <strong>Chủ tàu nộp hồ sơ + biên lai phí</strong>, <strong>Ban Quản lý cảng kiểm tra 8 nhóm (≤ 60p)</strong>, <strong>Sở Xây dựng &amp; Office cấp Giấy phép (≤ 60p / tải GP ≤ 10p)</strong> và <strong>Biên phòng kiểm soát cuối cùng tại bến</strong>.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={isResetting}
                    className="shrink-0 px-5 py-3.5 bg-[#f4cf47] hover:bg-[#eab308] active:bg-[#ca8a04] disabled:opacity-50 text-[#072b61] font-black text-xs sm:text-sm rounded-full transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
                    <span>{isResetting ? 'Đang thiết lập lại...' : 'RESET DỮ LIỆU & ĐỒNG BỘ TOÀN BỘ'}</span>
                  </button>
                </div>

                {/* THỐNG KÊ HIỆN TRẠNG DỮ LIỆU */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-5 border-t border-white/25 text-center tabular-nums">
                  <div className="p-3 bg-white/15 backdrop-blur-xs rounded-2xl border border-white/25">
                    <p className="text-[11px] text-blue-100 font-semibold uppercase">Hồ sơ chuyến</p>
                    <p className="text-lg font-black text-white mt-0.5">{repository.getTrips().length}</p>
                    <span className="text-[10px] text-emerald-200 font-semibold">Đã đồng bộ</span>
                  </div>
                  <div className="p-3 bg-white/15 backdrop-blur-xs rounded-2xl border border-white/25">
                    <p className="text-[11px] text-blue-100 font-semibold uppercase">Sổ hồ sơ đến</p>
                    <p className="text-lg font-black text-white mt-0.5">{repository.getIncomingDossiers().length}</p>
                    <span className="text-[10px] text-blue-100 font-semibold">5/5 Phụ lục 02</span>
                  </div>
                  <div className="p-3 bg-white/15 backdrop-blur-xs rounded-2xl border border-white/25">
                    <p className="text-[11px] text-blue-100 font-semibold uppercase">Tàu VR-SB</p>
                    <p className="text-lg font-black text-white mt-0.5">{repository.getVessels().length}</p>
                    <span className="text-[10px] text-blue-100 font-semibold">Đăng ký Lý Sơn</span>
                  </div>
                  <div className="p-3 bg-white/15 backdrop-blur-xs rounded-2xl border border-white/25">
                    <p className="text-[11px] text-blue-100 font-semibold uppercase">Thuyền viên</p>
                    <p className="text-lg font-black text-white mt-0.5">{repository.getCrew().length}</p>
                    <span className="text-[10px] text-blue-100 font-semibold">Đủ bằng cấp</span>
                  </div>
                  <div className="p-3 bg-white/15 backdrop-blur-xs rounded-2xl border border-white/25 col-span-2 sm:col-span-1">
                    <p className="text-[11px] text-blue-100 font-semibold uppercase">Xác thực &amp; RBAC</p>
                    <p className="text-lg font-black text-white mt-0.5">Gmail</p>
                    <span className="text-[10px] text-[#fde68a] font-semibold">10 vai trò Firestore</span>
                  </div>
                </div>
              </div>

              {/* KHỐI GIÁM SÁT LƯU TRỮ HỒ SƠ & SAO LƯU / KHÔI PHỤC JSON */}
              <div className="bg-white rounded-[20px] border border-[#dce8f7] p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <HardDrive className="w-5 h-5 text-blue-600" />
                      Kiểm soát lưu trữ hồ sơ &amp; Sao lưu dữ liệu (.json)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Hồ sơ chuyến và danh mục lưu trên LocalStorage (~5 MB/trình duyệt); tệp PDF/ảnh đính kèm lưu trên IndexedDB (tối đa 15 MB/tệp).
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <input
                      ref={backupFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportFullBackup}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={handleExportFullBackup}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Xuất sao lưu (.json)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => backupFileInputRef.current?.click()}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Khôi phục từ tệp</span>
                    </button>
                  </div>
                </div>

                {(storageDiag.warning || backupNotice) && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                      backupNotice?.type === 'error' || storageDiag.warning
                        ? 'bg-red-50 border-red-300 text-red-900'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {backupNotice?.type === 'error' || storageDiag.warning ? (
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <span className="font-semibold">
                        {backupNotice?.text || storageDiag.warning}
                      </span>
                    </div>
                    {backupNotice && (
                      <button
                        type="button"
                        onClick={() => setBackupNotice(null)}
                        className="text-slate-500 hover:text-slate-800 cursor-pointer"
                        aria-label="Đóng thông báo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs tabular-nums">
                  <div className="p-4 rounded-2xl bg-[#f4f8ff] border border-[#dce8f7] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[#07244d]">Bộ nhớ dữ liệu nghiệp vụ (LocalStorage)</span>
                      <span className="font-mono font-bold text-blue-700">
                        {formatBytes(storageDiag.totalBytes)} / 5 MB ({storageDiag.usagePercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          storageDiag.usagePercent >= 80
                            ? 'bg-red-500'
                            : storageDiag.usagePercent >= 50
                            ? 'bg-amber-500'
                            : 'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, storageDiag.usagePercent))}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Nhật ký Audit Log tự giới hạn tối đa 500 bản ghi gần nhất và thông báo 200 bản ghi để tránh tràn bộ nhớ trình duyệt.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-800">Kho tệp PDF &amp; Ảnh chứng từ (IndexedDB)</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {idbStats.count} tệp • {idbStats.readableSize}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Các tệp đính kèm tạm giữ trong IndexedDB sẽ tự động đẩy vào thư mục <strong>mã hồ sơ</strong> trên Server khi lập hoặc đồng bộ hồ sơ.
                    </p>
                  </div>
                </div>

                {/* KHO LƯU TRỮ HỒ SƠ THEO MÃ HỒ SƠ TRÊN SERVER */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-[#f4f8ff] to-white border border-[#cfe0f5] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <h4 className="font-extrabold text-[#07244d] text-xs sm:text-sm flex items-center gap-2">
                        <Server className="w-4 h-4 text-[#0d62e8]" />
                        <span>Kho lưu trữ hồ sơ tập trung trên Server (Thư mục theo Mã hồ sơ)</span>
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 break-all">
                        Thư mục gốc:{' '}
                        <code className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-slate-800">
                          {serverOverview?.storageRoot || 'data/ho-so-chuyen'}
                        </code>{' '}
                        •{' '}
                        <strong className="text-[#0b4ea8]">
                          {serverOverview?.totalFolders ?? 0} thư mục hồ sơ
                        </strong>{' '}
                        • {serverOverview?.totalFiles ?? 0} tệp đính kèm/lệnh ({formatBytes(serverOverview?.totalSizeBytes || 0)})
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSyncingAllToServer}
                      onClick={handleSyncAllTripsToServer}
                      className="shrink-0 px-3.5 py-2 bg-[#0d62e8] hover:bg-[#084fc0] disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                    >
                      {isSyncingAllToServer ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{isSyncingAllToServer ? 'Đang đồng bộ...' : 'Đồng bộ tất cả hồ sơ lên Server'}</span>
                    </button>
                  </div>

                  {serverOverview && serverOverview.dossiers.length > 0 ? (
                    <div className="overflow-x-auto border border-[#dce8f7] rounded-xl bg-white max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-[#f8fbff] text-slate-600 font-bold uppercase text-[10px] border-b border-[#dce8f7] sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Thư mục (Mã hồ sơ)</th>
                            <th className="py-2 px-3">Phương tiện</th>
                            <th className="py-2 px-3">Số hiệu lệnh</th>
                            <th className="py-2 px-3 text-center">Giấy tờ (giay-to/)</th>
                            <th className="py-2 px-3 text-center">Lệnh (lenh-cap-phep/)</th>
                            <th className="py-2 px-3 text-right">Dung lượng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {serverOverview.dossiers.map((d) => (
                            <tr key={d.folderName} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-bold text-[#0b4ea8] flex items-center gap-1.5">
                                <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>{d.folderName}/</span>
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-800">
                                {d.vesselName || '—'} {d.vesselRegNumber ? `(${d.vesselRegNumber})` : ''}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-700">{d.orderNumber || 'Chưa cấp'}</td>
                              <td className="py-2 px-3 text-center font-bold text-blue-700">{d.documentsCount} tệp</td>
                              <td className="py-2 px-3 text-center font-bold text-teal-700">{d.ordersCount} tệp</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">
                                {formatBytes(d.totalSizeBytes)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      Chưa có thư mục hồ sơ nào được tạo trên Server. Bấm <strong>Đồng bộ tất cả hồ sơ lên Server</strong> để khởi tạo ngay toàn bộ thư mục theo mã hồ sơ.
                    </p>
                  )}
                </div>
              </div>

              {/* QUY TRÌNH XỬ LÝ CHUẨN 4 GIAI ĐOẠN (THAY THẾ HOÀN TOÀN NHÓM CHAT) */}
              <div className="bg-white rounded-[20px] border border-[#dce8f7] p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-blue-600" />
                      Quy trình cấp phép rời cảng, bến VR-SB chuẩn (4 giai đoạn khép kín)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mọi bước nộp, trả bổ sung, kiểm tra, tải Giấy phép và thông báo diễn ra 100% trong ứng dụng theo ca trực &amp; bến phụ trách.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                  <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full uppercase">Bước 1</span>
                    <h4 className="text-xs font-black text-sky-950">Chủ tàu / Thuyền trưởng</h4>
                    <p className="text-[11px] text-sky-900 leading-relaxed">
                      Nộp Bản khai chung, DS thuyền viên/hành khách và biên lai nộp phí qua mã QR (R11). Có thể rút hồ sơ trước khi cấp phép.
                    </p>
                  </div>
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full uppercase">Bước 2 (≤ 60 phút)</span>
                    <h4 className="text-xs font-black text-indigo-950">Ban Quản lý cảng</h4>
                    <p className="text-[11px] text-indigo-900 leading-relaxed">
                      Cán bộ trong ca &amp; đúng bến kiểm tra 8 nhóm thực tế, đối chiếu phí và ra Thông báo chấp thuận chuyển Sở.
                    </p>
                  </div>
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full uppercase">Bước 3 (≤ 60p &amp; ≤ 10p)</span>
                    <h4 className="text-xs font-black text-amber-950">Sở Xây dựng &amp; Office</h4>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      Chuyên viên kiểm tra thời tiết (R7), duyệt dự thảo xuất Word/PDF trình ký trên Office, rồi tải PDF dấu đỏ &amp; số GP (≤ 10p).
                    </p>
                  </div>
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">Bước 4 (Kiểm soát cuối)</span>
                    <h4 className="text-xs font-black text-emerald-950">Bộ đội Biên phòng</h4>
                    <p className="text-[11px] text-emerald-900 leading-relaxed">
                      Chỉ kiểm soát sau khi đã có Giấy phép: quét QR, đối chiếu người lên tàu → Cho xuất bến / Trả R12 / Tạm giữ &amp; xác nhận cập bến.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL XÁC NHẬN KHÔI PHỤC DỮ LIỆU MẪU */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center gap-2.5 text-amber-700 font-extrabold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Xác nhận khôi phục dữ liệu mẫu?</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Thao tác này sẽ đưa toàn bộ hồ sơ chuyến, lịch ca trực, cấu hình vận hành và danh mục mẫu trên trình duyệt hiện tại về trạng thái chuẩn ban đầu.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={executeResetSystemData}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold cursor-pointer"
              >
                Đồng ý khôi phục
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
