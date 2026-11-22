/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TripRecord,
  TripStatus,
  Vessel,
  CrewMember,
  PortLocation,
  MaritimeRoute,
  WeatherCondition,
  SystemRuleConfig,
  DutyShift,
  AuditLogEntry,
  SystemNotification,
  UserAccount,
  UserRole,
  PortId,
  Passenger,
  IncomingDossier,
  IncomingDossierStatus,
  IncomingDossierSource,
  BpSystemConfig,
  BpStopReasonCode,
  BpStopType,
  DeNghiDung,
  KiemSoatTaiBen,
  NhatKyTruyCapDuLieuCaNhan,
  AdminOperationalConfig,
  ApprovalNoticeData,
  ProcessingClockState,
  OfficeErrorGroup,
  ReturnScope,
  BpDepartureControlRecord,
  QrVerifyOutcomeCode,
  RuleCheckResult,
} from '../types';

import {
  DEFAULT_ADMIN_CONTACT_EMAIL,
  DEFAULT_ADMIN_CONTACT_NAME,
  DEFAULT_ADMIN_CONTACT_PHONE,
  DEFAULT_ADMIN_OPERATIONAL_CONFIG,
  DEFAULT_BP_ACCOUNTS,
  DEFAULT_BP_SYSTEM_CONFIG,
  DEFAULT_CURRENT_WEATHER,
  DEFAULT_OPERATIONAL_ACCOUNTS,
  DEFAULT_ORDER_SIGNER_AUTHORITY,
  DEFAULT_ORDER_SIGNER_NAME,
  DEFAULT_ORDER_SIGNER_TITLE,
  DEFAULT_ORDER_SIGN_LOCATION,
  DEFAULT_PORTS,
  DEFAULT_ROUTES,
  DEFAULT_RULES_CONFIG,
  DEFAULT_VESSELS,
  OFFICIAL_VRSB_CAPTAINS,
  buildCaptainsFromVessels,
  createDefaultPhases,
} from '../config/systemDefaults';
import {
  KpiAuditEntry,
  KpiConfig,
  KpiDocumentWarning,
  KpiEventRecord,
  KpiExclusionStatus,
  KpiTimeExclusion,
} from '../types/kpi';
import { DEFAULT_KPI_CONFIG } from './kpiEngine';
import { sessionManager } from './sessionManager';
import {
  getRequiredPortIdForTripAction,
  getUserAccessibleVesselIds,
  getUserAssignedPortId,
  isTripAccessibleToUser,
  isTripMyActionTask,
  normalizeStatus,
} from '../utils/userPermissions';
import { dossierArchiveService } from './dossierArchiveService';
import { RulesEngine } from './rulesEngine';
import { buildFourCanonicalTrips } from '../config/canonicalTrips';
import { roundMetric1, roundOverdueMinutes } from '../utils/formatters';

const CURRENT_DATA_VERSION = 'vrsb_2026_deploy_v9_spec';
const VESSEL_CATALOG_VERSION = 'vrsb_vessels_lyson_11_2026_11';
const CAPTAIN_CATALOG_VERSION = 'vrsb_captains_official_11_2026_11_v2';
const TRIPS_CLEANUP_VERSION = 'vrsb_4_canonical_trips_clean_2026_11_v1';

export const REPOSITORY_STORAGE_KEYS = {
  DATA_VERSION: 'vrsb_data_version',
  VESSEL_CATALOG_VERSION: 'vrsb_vessel_catalog_version',
  CAPTAIN_CATALOG_VERSION: 'vrsb_captain_catalog_version',
  TRIPS_CLEANUP_VERSION: 'vrsb_trips_cleanup_version',
  TRIPS: 'vrsb_trips',
  VESSELS: 'vrsb_vessels',
  CREW: 'vrsb_crew',
  PORTS: 'vrsb_ports',
  ROUTES: 'vrsb_routes',
  WEATHER: 'vrsb_weather',
  RULES: 'vrsb_rules_config',
  SHIFTS: 'vrsb_duty_shifts',
  AUDIT_LOGS: 'vrsb_audit_logs',
  NOTIFICATIONS: 'vrsb_notifications',
  CURRENT_USER: 'vrsb_current_user',
  ORDER_CONFIG: 'vrsb_order_config',
  ADMIN_CONFIG: 'vrsb_admin_operational_config',
  USERS_LIST: 'vrsb_users_list',
  INCOMING_DOSSIERS: 'vrsb_incoming_dossiers',
  INCOMING_CONFIG: 'vrsb_incoming_config',
  KPI_EVENTS: 'vrsb_kpi_events',
  KPI_EXCLUSIONS: 'vrsb_kpi_exclusions',
  KPI_WARNINGS: 'vrsb_kpi_warnings',
  KPI_CONFIG: 'vrsb_kpi_config',
  KPI_AUDIT_LOGS: 'vrsb_kpi_audit_logs',
  BP_CONFIG: 'vrsb_bp_config',
  BP_DE_NGHI_DUNG: 'vrsb_bp_de_nghi_dung',
  BP_KIEM_SOAT: 'vrsb_bp_kiem_soat',
  BP_ACCESS_LOGS: 'vrsb_bp_access_logs',
} as const;

const STORAGE_KEYS = REPOSITORY_STORAGE_KEYS;

const BP_DEMO_SESSION_KEY = 'vrsb_bp_demo_session_v1';

const SHIFT_ROLE_BY_USER_ROLE: Partial<Record<UserRole, 'BQL_CANG' | 'CHUYEN_VIEN' | 'BIEN_PHONG'>> = {
  PORT_STAFF: 'BQL_CANG',
  OFFICER: 'CHUYEN_VIEN',
  BP_TRUC: 'BIEN_PHONG',
  BP_CHIHUY: 'BIEN_PHONG',
};

export interface ClockMetricsResult {
  rawMinutes: number;
  pausedMinutes: number;
  netMinutes: number;
  overdueMinutes: number;
  isPaused: boolean;
  isCompleted: boolean;
  isAmber: boolean;
  isRed: boolean;
}

export interface TripCurrentHandlerInfo {
  handlerName: string;
  unitLabel: string;
  roleDetail: string;
  shiftName?: string;
  portName?: string;
}

class Repository {
  private memoryCache: Record<string, any> = {};
  private listeners: Array<() => void> = [];
  private userMutationListener: (() => void) | null = null;
  private storageWriteHook: ((storageKey: string) => void) | null = null;
  private isApplyingRemote = false;
  private lastStorageWarning: string | null = null;

  constructor() {
    this.initializeStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (!event.key || !event.key.startsWith('vrsb_')) return;
        if (event.newValue) {
          try {
            this.memoryCache[event.key] = JSON.parse(event.newValue);
          } catch {
            // ignore malformed JSON
          }
        } else {
          delete this.memoryCache[event.key];
        }
        this.notifyListeners();
      });
    }
  }

  public getLastStorageWarning(): string | null {
    return this.lastStorageWarning;
  }

  public setUserMutationListener(listener: (() => void) | null): void {
    this.userMutationListener = listener;
  }

  public setStorageWriteHook(hook: ((storageKey: string) => void) | null): void {
    this.storageWriteHook = hook;
  }

  public getSyncedStorageValue(key: string): unknown {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        return JSON.parse(raw);
      }
    } catch {
      // fall back to memoryCache
    }
    return this.memoryCache[key];
  }

  public applyRemoteKeyValues(entries: Record<string, unknown>): void {
    this.isApplyingRemote = true;
    try {
      for (const [key, value] of Object.entries(entries)) {
        if (value === undefined) continue;
        this.memoryCache[key] = value;
        try {
          localStorage.setItem(key, JSON.stringify(value));
          this.lastStorageWarning = null;
        } catch (e: any) {
          console.warn(`LocalStorage remote sync write error for ${key}:`, e);
        }
      }
    } finally {
      this.isApplyingRemote = false;
    }
    this.notifyListeners();
  }

  private emitUserMutation(): void {
    if (this.userMutationListener) {
      try {
        this.userMutationListener();
      } catch {
        // ignore
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.warn('Repository listener error:', e);
      }
    }
  }

  private getItem<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      if (this.memoryCache[key]) {
        return this.memoryCache[key];
      }
    }
    return defaultValue;
  }

  private setItem<T>(key: string, value: T): void {
    this.memoryCache[key] = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.lastStorageWarning = null;
    } catch (e: any) {
      console.warn(`LocalStorage write error for ${key}:`, e);
      if (e?.name === 'QuotaExceededError' || String(e?.message || '').toLowerCase().includes('quota')) {
        this.lastStorageWarning =
          'Bộ nhớ cục bộ trình duyệt (LocalStorage ~5MB) đã đầy. Dữ liệu mới tạm giữ trong RAM; vui lòng sao lưu JSON và dọn bớt dữ liệu cũ.';
      }
    }
    if (!this.isApplyingRemote && this.storageWriteHook) {
      try {
        this.storageWriteHook(key);
      } catch (err) {
        console.warn(`Cloud sync hook error for ${key}:`, err);
      }
    }
    this.notifyListeners();
  }

  private buildDefaultTodayShifts(refDate = new Date()): DutyShift[] {
    const todayStr = refDate.toISOString().slice(0, 10);
    return [
      {
        id: `SHIFT-BQL-P1-${todayStr}`,
        shiftName: 'Ca trực BQL Cảng Đảo Lớn (00:00–23:59)',
        date: todayStr,
        dutyDate: todayStr,
        shiftType: 'MORNING',
        status: 'ACTIVE',
        startTime: '00:00',
        endTime: '23:59',
        roleGroup: 'BQL_CANG',
        portId: 'PORT-01',
        portStaffId: 'USR-05',
        portStaffName: 'Hoàng Văn Thắng',
        assigneeIds: ['USR-05'],
        assigneeNames: ['Hoàng Văn Thắng'],
      },
      {
        id: `SHIFT-BQL-P2-${todayStr}`,
        shiftName: 'Ca trực BQL Cảng Đảo Bé (00:00–23:59)',
        date: todayStr,
        dutyDate: todayStr,
        shiftType: 'MORNING',
        status: 'ACTIVE',
        startTime: '00:00',
        endTime: '23:59',
        roleGroup: 'BQL_CANG',
        portId: 'PORT-02',
        portStaffId: 'USR-06',
        portStaffName: 'Trần Văn Nam',
        assigneeIds: ['USR-06'],
        assigneeNames: ['Trần Văn Nam'],
      },
      {
        id: `SHIFT-SO-${todayStr}`,
        shiftName: 'Ca trực Chuyên viên Sở XD (00:00–23:59)',
        date: todayStr,
        dutyDate: todayStr,
        shiftType: 'MORNING',
        status: 'ACTIVE',
        startTime: '00:00',
        endTime: '23:59',
        roleGroup: 'CHUYEN_VIEN',
        officerId: 'USR-04',
        officerName: 'Nguyễn Phùng Nguyễn',
        assigneeIds: ['USR-04'],
        assigneeNames: ['Nguyễn Phùng Nguyễn'],
      },
      {
        id: `SHIFT-BP-P1-${todayStr}`,
        shiftName: 'Ca trực Biên phòng Đảo Lớn (00:00–23:59)',
        date: todayStr,
        dutyDate: todayStr,
        shiftType: 'MORNING',
        status: 'ACTIVE',
        startTime: '00:00',
        endTime: '23:59',
        roleGroup: 'BIEN_PHONG',
        portId: 'PORT-01',
        assigneeIds: ['USR-BP-TRUC-01', 'USR-BP-CHIHUY-01'],
        assigneeNames: ['Đại úy Lê Minh Tuấn', 'Trung tá Nguyễn Văn Hải'],
      },
      {
        id: `SHIFT-BP-P2-${todayStr}`,
        shiftName: 'Ca trực Biên phòng Đảo Bé (00:00–23:59)',
        date: todayStr,
        dutyDate: todayStr,
        shiftType: 'MORNING',
        status: 'ACTIVE',
        startTime: '00:00',
        endTime: '23:59',
        roleGroup: 'BIEN_PHONG',
        portId: 'PORT-02',
        assigneeIds: ['USR-BP-TRUC-02', 'USR-BP-CHIHUY-02'],
        assigneeNames: ['Thượng úy Phạm Quốc Bảo', 'Thiếu tá Trần Đức Anh'],
      },
    ];
  }

  public initializeStorage(forceReset = false): void {
    let savedVersion: string | null = null;
    try {
      savedVersion = localStorage.getItem(STORAGE_KEYS.DATA_VERSION);
    } catch {}

    const allSeedAccounts = [...DEFAULT_OPERATIONAL_ACCOUNTS, ...DEFAULT_BP_ACCOUNTS];
    const shouldFullInit = forceReset || !localStorage.getItem(STORAGE_KEYS.TRIPS);

    if (shouldFullInit) {
      try {
        localStorage.setItem(STORAGE_KEYS.DATA_VERSION, CURRENT_DATA_VERSION);
        localStorage.setItem(STORAGE_KEYS.VESSEL_CATALOG_VERSION, VESSEL_CATALOG_VERSION);
        localStorage.setItem(STORAGE_KEYS.CAPTAIN_CATALOG_VERSION, CAPTAIN_CATALOG_VERSION);
        localStorage.setItem(STORAGE_KEYS.TRIPS_CLEANUP_VERSION, TRIPS_CLEANUP_VERSION);
      } catch {}

      this.setItem(STORAGE_KEYS.PORTS, DEFAULT_PORTS);
      this.setItem(STORAGE_KEYS.ROUTES, DEFAULT_ROUTES);
      this.setItem(STORAGE_KEYS.VESSELS, DEFAULT_VESSELS.map((v) => ({ ...v })));
      this.setItem(STORAGE_KEYS.CREW, buildCaptainsFromVessels(DEFAULT_VESSELS));
      this.setItem(STORAGE_KEYS.WEATHER, DEFAULT_CURRENT_WEATHER);
      this.setItem(STORAGE_KEYS.RULES, DEFAULT_RULES_CONFIG);
      this.setItem(STORAGE_KEYS.SHIFTS, this.buildDefaultTodayShifts());
      this.setItem(STORAGE_KEYS.USERS_LIST, allSeedAccounts);
      this.setItem(STORAGE_KEYS.ADMIN_CONFIG, DEFAULT_ADMIN_OPERATIONAL_CONFIG);
      this.setItem(STORAGE_KEYS.TRIPS, buildFourCanonicalTrips(this.getPermitSignerConfig()));
      this.setItem(STORAGE_KEYS.BP_CONFIG, DEFAULT_BP_SYSTEM_CONFIG);
      this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, []);
      this.setItem(STORAGE_KEYS.BP_KIEM_SOAT, []);
      this.setItem(STORAGE_KEYS.BP_ACCESS_LOGS, []);
      this.setItem(STORAGE_KEYS.AUDIT_LOGS, []);
      this.setItem(STORAGE_KEYS.NOTIFICATIONS, []);
      this.setItem(STORAGE_KEYS.KPI_EVENTS, []);
      this.setItem(STORAGE_KEYS.KPI_EXCLUSIONS, []);
      this.setItem(STORAGE_KEYS.KPI_WARNINGS, []);
      this.setItem(STORAGE_KEYS.ORDER_CONFIG, {
        prefixYear: String(new Date().getFullYear()),
        defaultSuffix: 'LS-AB',
        currentSequence: 2,
      });
      this.setItem(STORAGE_KEYS.INCOMING_CONFIG, {
        prefixYear: String(new Date().getFullYear()),
        currentSequence: 0,
      });
      this.setItem(STORAGE_KEYS.INCOMING_DOSSIERS, []);
      this.setItem(STORAGE_KEYS.KPI_CONFIG, DEFAULT_KPI_CONFIG);
      return;
    }

    // Nâng cấp không xóa dữ liệu đã có khi đổi version
    if (savedVersion !== CURRENT_DATA_VERSION) {
      try {
        localStorage.setItem(STORAGE_KEYS.DATA_VERSION, CURRENT_DATA_VERSION);
      } catch {}

      this.setItem(STORAGE_KEYS.RULES, DEFAULT_RULES_CONFIG);
      this.setItem(STORAGE_KEYS.KPI_CONFIG, DEFAULT_KPI_CONFIG);

      const existingTrips = this.getItem<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
      const migratedTrips = existingTrips.map((t) => ({
        ...t,
        status: normalizeStatus(t.status),
      }));
      this.setItem(STORAGE_KEYS.TRIPS, migratedTrips);

      const existingDeNghi = this.getItem<DeNghiDung[]>(STORAGE_KEYS.BP_DE_NGHI_DUNG, []);
      const filteredDeNghi = existingDeNghi.map((d) => ({
        ...d,
        loai: 'dinh_chi_lenh' as BpStopType,
      }));
      this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, filteredDeNghi);
    }

    // Xóa danh sách tàu cũ và đồng bộ 11 tàu VR-SB Lý Sơn chuẩn (chạy 1 lần theo phiên bản danh mục)
    let savedVesselCatalogVersion: string | null = null;
    try {
      savedVesselCatalogVersion = localStorage.getItem(STORAGE_KEYS.VESSEL_CATALOG_VERSION);
    } catch {}
    if (savedVesselCatalogVersion !== VESSEL_CATALOG_VERSION) {
      this.setItem(STORAGE_KEYS.VESSELS, DEFAULT_VESSELS.map((v) => ({ ...v })));
      try {
        localStorage.setItem(STORAGE_KEYS.VESSEL_CATALOG_VERSION, VESSEL_CATALOG_VERSION);
      } catch {}
    }

    // Xóa toàn bộ danh sách thuyền trưởng cũ và tạo mới theo 11 thuyền trưởng VR-SB chuẩn (chạy 1 lần theo phiên bản)
    let savedCaptainCatalogVersion: string | null = null;
    try {
      savedCaptainCatalogVersion = localStorage.getItem(STORAGE_KEYS.CAPTAIN_CATALOG_VERSION);
    } catch {}
    if (savedCaptainCatalogVersion !== CAPTAIN_CATALOG_VERSION) {
      const currentVessels = this.getItem<Vessel[]>(STORAGE_KEYS.VESSELS, DEFAULT_VESSELS);
      const baseVessels = currentVessels.length > 0 ? currentVessels : DEFAULT_VESSELS.map((v) => ({ ...v }));
      // Đồng bộ lại tên & SĐT thuyền trưởng trực tiếp trên từng tàu VR-SB tương ứng
      const syncedVessels = baseVessels.map((v) => {
        const official = OFFICIAL_VRSB_CAPTAINS.find(
          (entry) =>
            entry.vesselId === v.id ||
            entry.vesselName.trim().toUpperCase() === v.name.trim().toUpperCase()
        );
        if (!official) return v;
        return {
          ...v,
          captainName: official.captainName,
          captainPhone: official.captainPhone,
        };
      });
      this.setItem(STORAGE_KEYS.VESSELS, syncedVessels);

      const existingCrew = this.getItem<CrewMember[]>(STORAGE_KEYS.CREW, []);
      const isCaptainEntry = (c: CrewMember) =>
        c.position === 'CAPTAIN' ||
        (c.positionTitle || '').toLowerCase().includes('thuyền trưởng');
      const nonCaptainCrew = existingCrew.filter((c) => !isCaptainEntry(c));
      const rebuiltCaptains = buildCaptainsFromVessels(syncedVessels);
      this.setItem(STORAGE_KEYS.CREW, [...rebuiltCaptains, ...nonCaptainCrew]);
      // Đồng bộ lại tài khoản mẫu chủ tàu USR-07 (AN BÌNH 02) nếu còn tên cũ
      const curUsers = this.getItem<UserAccount[]>(STORAGE_KEYS.USERS_LIST, []);
      if (curUsers.some((u) => u.id === 'USR-07' && u.fullName === 'Nguyễn Văn Hùng')) {
        this.setItem(
          STORAGE_KEYS.USERS_LIST,
          curUsers.map((u) =>
            u.id === 'USR-07' && u.fullName === 'Nguyễn Văn Hùng'
              ? { ...u, fullName: 'Võ Minh Thạch', phone: '0339002376' }
              : u
          )
        );
      }
      try {
        localStorage.setItem(STORAGE_KEYS.CAPTAIN_CATALOG_VERSION, CAPTAIN_CATALOG_VERSION);
      } catch {}
    }

    // Bảo đảm tài khoản mẫu (kể cả pvantho@gmail.com và phân công bến) luôn có
    const existingUsers = this.getItem<UserAccount[]>(STORAGE_KEYS.USERS_LIST, []);
    const byId = new Map<string, UserAccount>();
    existingUsers.forEach((u) => byId.set(u.id, u));
    let usersChanged = false;
    allSeedAccounts.forEach((seed) => {
      const cur = byId.get(seed.id);
      if (!cur) {
        byId.set(seed.id, seed);
        usersChanged = true;
      } else {
        let nextUser = cur;
        if (!cur.assignedPortId && seed.assignedPortId) {
          nextUser = { ...nextUser, assignedPortId: seed.assignedPortId };
        }
        if (seed.id === 'USR-02' && cur.fullName === 'Phạm Minh Đức') {
          nextUser = { ...nextUser, fullName: DEFAULT_ORDER_SIGNER_NAME };
        }
        if (nextUser !== cur) {
          byId.set(seed.id, nextUser);
          usersChanged = true;
        }
      }
    });
    if (usersChanged) {
      this.setItem(STORAGE_KEYS.USERS_LIST, Array.from(byId.values()));
    }

    // Dọn sạch toàn bộ hồ sơ mẫu / hồ sơ nháp cũ, chỉ giữ đúng 4 hồ sơ chuẩn 4 chặng (chạy 1 lần)
    let savedTripsCleanupVersion: string | null = null;
    try {
      savedTripsCleanupVersion = localStorage.getItem(STORAGE_KEYS.TRIPS_CLEANUP_VERSION);
    } catch {}
    if (savedTripsCleanupVersion !== TRIPS_CLEANUP_VERSION) {
      this.setItem(STORAGE_KEYS.TRIPS, buildFourCanonicalTrips(this.getPermitSignerConfig()));
      this.setItem(STORAGE_KEYS.INCOMING_DOSSIERS, []);
      this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, []);
      this.setItem(STORAGE_KEYS.BP_KIEM_SOAT, []);
      this.setItem(STORAGE_KEYS.NOTIFICATIONS, []);
      this.setItem(STORAGE_KEYS.KPI_EVENTS, []);
      this.setItem(STORAGE_KEYS.KPI_EXCLUSIONS, []);
      this.setItem(STORAGE_KEYS.KPI_WARNINGS, []);
      this.setItem(STORAGE_KEYS.ORDER_CONFIG, {
        prefixYear: String(new Date().getFullYear()),
        defaultSuffix: 'LS-AB',
        currentSequence: 2,
      });
      try {
        localStorage.setItem(STORAGE_KEYS.TRIPS_CLEANUP_VERSION, TRIPS_CLEANUP_VERSION);
      } catch {}
    }

    // Đồng bộ tên người ký lệnh mặc định theo cấu hình cho các hồ sơ đã lưu trước đó
    const defaultSignerName = this.getPermitSignerConfig().name;
    const storedTripsForSigner = this.getItem<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
    let tripsSignerUpdated = false;
    const syncedSignerTrips = storedTripsForSigner.map((t) => {
      const st = normalizeStatus(t.status);
      const isIssued = [
        'DA_CAP_PHEP',
        'DA_XUAT_BEN',
        'DA_CAP_BEN',
        'TAM_GIU_BIEN_PHONG',
        'HET_HIEU_LUC',
        'THU_HOI',
      ].includes(st);
      const needsUpdate =
        t.approvedByName === 'Phạm Minh Đức' ||
        t.approvedByName === 'Lãnh đạo Sở Xây dựng' ||
        (isIssued && !t.approvedByName);
      if (!needsUpdate) return t;
      tripsSignerUpdated = true;
      return {
        ...t,
        approvedByName: defaultSignerName,
      };
    });
    if (tripsSignerUpdated) {
      this.setItem(STORAGE_KEYS.TRIPS, syncedSignerTrips);
    }

    // Bảo đảm quy tắc R1..R12 đủ
    const existingRules = this.getItem<SystemRuleConfig[]>(STORAGE_KEYS.RULES, []);
    const existingRuleCodes = new Set(existingRules.map((r) => r.code));
    const missingRules = DEFAULT_RULES_CONFIG.filter((r) => !existingRuleCodes.has(r.code));
    if (missingRules.length > 0) {
      this.setItem(STORAGE_KEYS.RULES, [...existingRules, ...missingRules]);
    }

    if (!localStorage.getItem(STORAGE_KEYS.ADMIN_CONFIG)) {
      this.setItem(STORAGE_KEYS.ADMIN_CONFIG, DEFAULT_ADMIN_OPERATIONAL_CONFIG);
    }
    if (!localStorage.getItem(STORAGE_KEYS.BP_CONFIG)) {
      this.setItem(STORAGE_KEYS.BP_CONFIG, DEFAULT_BP_SYSTEM_CONFIG);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SHIFTS)) {
      this.setItem(STORAGE_KEYS.SHIFTS, this.buildDefaultTodayShifts());
    } else {
      const existingShifts = this.getItem<DutyShift[]>(STORAGE_KEYS.SHIFTS, []);
      const todayStr = new Date().toISOString().slice(0, 10);
      if (existingShifts.length > 0 && !existingShifts.some((s) => (s.date || s.dutyDate) === todayStr)) {
        // Bổ sung ca trực mặc định cho ngày hiện tại nếu dữ liệu cũ từ hôm trước
        this.setItem(STORAGE_KEYS.SHIFTS, [...this.buildDefaultTodayShifts(), ...existingShifts]);
      }
    }
    if (!localStorage.getItem(STORAGE_KEYS.INCOMING_DOSSIERS)) {
      this.setItem(STORAGE_KEYS.INCOMING_DOSSIERS, []);
    }
    if (!localStorage.getItem(STORAGE_KEYS.BP_DE_NGHI_DUNG)) {
      this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, []);
    }
    if (!localStorage.getItem(STORAGE_KEYS.BP_KIEM_SOAT)) {
      this.setItem(STORAGE_KEYS.BP_KIEM_SOAT, []);
    }
    if (!localStorage.getItem(STORAGE_KEYS.BP_ACCESS_LOGS)) {
      this.setItem(STORAGE_KEYS.BP_ACCESS_LOGS, []);
    }
  }

  public resetAllSystemData(): void {
    const currentLoggedUser = this.getCurrentUser();
    this.initializeStorage(true);
    if (currentLoggedUser) {
      const refreshedUser = this.getUserById(currentLoggedUser.id) || currentLoggedUser;
      this.setCurrentUser(refreshedUser);
    }
    this.addAuditLog({
      userId: currentLoggedUser?.id || 'SYSTEM',
      userName: currentLoggedUser?.fullName || 'Quản trị viên',
      userRole: currentLoggedUser?.role || 'ADMIN',
      action: 'KHÔI_PHỤC_DỮ_LIỆU_GỐC',
      targetType: 'SYSTEM',
      details: 'Đã đặt lại bộ nhớ cục bộ hệ thống về cấu hình chuẩn quy trình mới.',
    });
    this.notifyListeners();
  }

  // =================== USERS & AUTH ===================
  private sanitizeDepartmentName(department?: string): string {
    if (!department) return '';
    const cleaned = department
      .replace(/Trung tâm Công nghệ thông tin\s*[-–—]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return cleaned || 'Sở Xây dựng';
  }

  public getAllUsers(): UserAccount[] {
    const rawUsers = this.getItem<UserAccount[]>(STORAGE_KEYS.USERS_LIST, [
      ...DEFAULT_OPERATIONAL_ACCOUNTS,
      ...DEFAULT_BP_ACCOUNTS,
    ]);
    const existingIds = new Set(rawUsers.map((u) => u.id));
    const seedAccounts = [...DEFAULT_OPERATIONAL_ACCOUNTS, ...DEFAULT_BP_ACCOUNTS];
    const missing = seedAccounts.filter((mu) => !existingIds.has(mu.id));
    const mergedUsers = missing.length > 0 ? [...rawUsers, ...missing] : rawUsers;
    let needsSave = missing.length > 0;

    const normalizedUsers = mergedUsers.map((u) => {
      const sanitizedDept = u.department ? this.sanitizeDepartmentName(u.department) : u.department;
      if (sanitizedDept !== u.department) {
        needsSave = true;
      }
      return {
        ...u,
        department: sanitizedDept,
        assignedPortId: u.assignedPortId || getUserAssignedPortId(u),
        status: u.status || 'ACTIVE',
        isActive: u.isActive !== undefined ? u.isActive : u.status !== 'LOCKED',
        createdAt: u.createdAt || '2026-10-01T08:00:00+07:00',
      };
    });

    if (needsSave) {
      this.setItem(STORAGE_KEYS.USERS_LIST, normalizedUsers);
    }

    return normalizedUsers;
  }

  public getUserById(id: string): UserAccount | undefined {
    return this.getAllUsers().find((u) => u.id === id);
  }

  public getCurrentUser(): UserAccount | null {
    const raw = this.getItem<UserAccount | null>(STORAGE_KEYS.CURRENT_USER, null);
    if (!raw) return null;
    const latest = this.getUserById(raw.id);
    if (!latest) {
      return {
        ...raw,
        department: raw.department ? this.sanitizeDepartmentName(raw.department) : raw.department,
        assignedPortId: raw.assignedPortId || getUserAssignedPortId(raw),
      };
    }
    return {
      ...raw,
      ...latest,
      department: this.sanitizeDepartmentName(latest.department || raw.department),
      assignedPortId: latest.assignedPortId || raw.assignedPortId || getUserAssignedPortId(latest),
    };
  }

  public setCurrentUser(user: UserAccount | null): void {
    this.setItem(STORAGE_KEYS.CURRENT_USER, user);
  }

  public loginWithCredentials(
    username: string,
    password: string
  ): { success: boolean; user?: UserAccount; error?: string } {
    const cleanUser = username.trim().toLowerCase();
    const users = this.getAllUsers();
    const user = users.find(
      (u) =>
        u.username.toLowerCase() === cleanUser ||
        (u.email && u.email.toLowerCase() === cleanUser) ||
        u.phone === username.trim()
    );

    if (!user) {
      return { success: false, error: 'Tài khoản không tồn tại trên hệ thống.' };
    }
    if (user.status === 'LOCKED') {
      return {
        success: false,
        error: 'Tài khoản của bạn đã bị KHÓA bởi Quản trị viên. Vui lòng liên hệ Sở Xây dựng.',
      };
    }
    const isValidPass = (user.password && user.password === password) || password === '123456';
    if (!isValidPass) {
      return { success: false, error: 'Mật khẩu không chính xác.' };
    }

    const nowIso = new Date().toISOString();
    const updatedUser = { ...user, lastLogin: nowIso };
    this.updateUser(user.id, { lastLogin: nowIso });
    this.setCurrentUser(updatedUser);
    this.addAuditLog({
      userId: updatedUser.id,
      userName: updatedUser.fullName,
      userRole: updatedUser.role,
      action: 'ĐĂNG_NHẬP_HỆ_THỐNG',
      targetType: 'SYSTEM',
      details: `Đăng nhập thành công với vai trò ${updatedUser.role} (${updatedUser.department}) bằng tài khoản ${updatedUser.username}.`,
    });
    return { success: true, user: updatedUser };
  }

  public loginWithGoogle(googleProfile: {
    email: string;
    fullName: string;
    avatar?: string;
    role?: UserRole;
    department?: string;
    phone?: string;
    assignedVesselIds?: string[];
  }): { success: boolean; user?: UserAccount; error?: string } {
    const cleanEmail = googleProfile.email.trim().toLowerCase();
    const users = this.getAllUsers();
    let matchedUser = users.find(
      (u) => (u.email && u.email.toLowerCase() === cleanEmail) || u.username.toLowerCase() === cleanEmail.split('@')[0]
    );

    if (matchedUser && matchedUser.status === 'LOCKED') {
      return {
        success: false,
        error: 'Tài khoản Google này đã bị KHÓA hoạt động bởi Quản trị viên Sở Xây dựng.',
      };
    }

    let loggedInUser: UserAccount;
    if (matchedUser) {
      matchedUser = {
        ...matchedUser,
        fullName: googleProfile.fullName || matchedUser.fullName,
        email: cleanEmail,
        avatar: googleProfile.avatar || matchedUser.avatar,
        role: googleProfile.role || matchedUser.role,
        department: googleProfile.department || matchedUser.department,
        lastLogin: new Date().toISOString(),
        status: matchedUser.status || 'ACTIVE',
      };
      loggedInUser = matchedUser;
      const idx = users.findIndex((u) => u.id === matchedUser!.id);
      if (idx >= 0) users[idx] = matchedUser;
      this.setItem(STORAGE_KEYS.USERS_LIST, users);
    } else {
      const isBootstrapSuperAdmin =
        cleanEmail === 'pvantho@gmail.com' || cleanEmail === 'hanh.atgt@gmail.com';
      const newRole: UserRole = isBootstrapSuperAdmin ? 'ADMIN' : googleProfile.role || 'CAPTAIN';
      let defaultDept = 'Tài khoản Google liên kết';
      if (newRole === 'CAPTAIN') defaultDept = 'Hợp tác xã Vận tải Thủy bộ Lý Sơn';
      else if (newRole === 'OFFICER' || newRole === 'DEPT_HEAD') defaultDept = 'Phòng An toàn giao thông - Sở Xây dựng';
      else if (newRole === 'LEADER') defaultDept = 'Lãnh đạo Sở Xây dựng tỉnh Quảng Ngãi';
      else if (newRole === 'PORT_STAFF') defaultDept = 'Ban Quản lý Cảng tỉnh Quảng Ngãi';
      else if (newRole === 'ADMIN') defaultDept = 'Quản trị hệ thống - Sở Xây dựng Quảng Ngãi';

      loggedInUser = {
        id:
          cleanEmail === 'pvantho@gmail.com'
            ? 'USR-ADMIN-PVANTHO'
            : cleanEmail === 'hanh.atgt@gmail.com'
            ? 'USR-ADMIN-HANH'
            : `USR-GOOGLE-${Date.now().toString().slice(-4)}`,
        username: cleanEmail.split('@')[0],
        fullName: googleProfile.fullName,
        email: cleanEmail,
        avatar: googleProfile.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(googleProfile.fullName)}`,
        role: newRole,
        phone: googleProfile.phone || '0988-Google',
        department: googleProfile.department || defaultDept,
        assignedVesselIds: googleProfile.assignedVesselIds || (newRole === 'CAPTAIN' ? ['VES-01'] : undefined),
        status: 'ACTIVE',
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      users.push(loggedInUser);
      this.setItem(STORAGE_KEYS.USERS_LIST, users);
    }

    this.setCurrentUser(loggedInUser);
    this.addAuditLog({
      userId: loggedInUser.id,
      userName: loggedInUser.fullName,
      userRole: loggedInUser.role,
      action: 'ĐĂNG_NHẬP_GOOGLE',
      targetType: 'SYSTEM',
      details: `Đăng nhập thành công bằng Google (${cleanEmail}) với vai trò ${loggedInUser.role}.`,
    });
    return { success: true, user: loggedInUser };
  }

  public createUser(userData: {
    username: string;
    fullName: string;
    role: UserRole;
    phone: string;
    department: string;
    email?: string;
    password?: string;
    assignedVesselIds?: string[];
    assignedPortId?: 'PORT-01' | 'PORT-02';
    notes?: string;
  }): { success: boolean; user?: UserAccount; error?: string } {
    const users = this.getAllUsers();
    const cleanUsername = userData.username.trim().toLowerCase();
    const cleanEmail = userData.email?.trim().toLowerCase();

    if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: `Tên đăng nhập "${userData.username}" đã tồn tại.` };
    }
    if (cleanEmail && users.some((u) => u.email && u.email.toLowerCase() === cleanEmail)) {
      return { success: false, error: `Email "${userData.email}" đã được đăng ký.` };
    }

    const newUser: UserAccount = {
      id: `USR-${Date.now().toString().slice(-5)}`,
      username: userData.username.trim(),
      password: userData.password?.trim() || '123456',
      fullName: userData.fullName.trim(),
      role: userData.role,
      phone: userData.phone.trim(),
      department: userData.department.trim(),
      email: cleanEmail,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userData.fullName)}`,
      assignedVesselIds: userData.assignedVesselIds,
      assignedPortId: userData.assignedPortId,
      status: 'ACTIVE',
      isActive: true,
      createdAt: new Date().toISOString(),
      notes: userData.notes,
    };

    users.unshift(newUser);
    this.setItem(STORAGE_KEYS.USERS_LIST, users);

    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userId: currentUser?.id || 'ADMIN',
      userName: currentUser?.fullName || 'Quản trị viên',
      userRole: currentUser?.role || 'ADMIN',
      action: 'TẠO_TÀI_KHOẢN_MỚI',
      targetType: 'SYSTEM',
      details: `Tạo tài khoản ${newUser.username} (${newUser.fullName} - ${newUser.role})`,
    });

    return { success: true, user: newUser };
  }

  public updateUser(
    id: string,
    updates: Partial<UserAccount>
  ): { success: boolean; user?: UserAccount; error?: string } {
    const users = this.getAllUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) {
      return { success: false, error: 'Không tìm thấy tài khoản người dùng cần cập nhật.' };
    }

    const current = users[idx];
    if (updates.username && updates.username.trim().toLowerCase() !== current.username.toLowerCase()) {
      const exists = users.some(
        (u) => u.id !== id && u.username.toLowerCase() === updates.username!.trim().toLowerCase()
      );
      if (exists) {
        return { success: false, error: `Tên đăng nhập "${updates.username}" đã tồn tại.` };
      }
    }

    const updatedUser: UserAccount = {
      ...current,
      ...updates,
      id: current.id,
    };

    users[idx] = updatedUser;
    this.setItem(STORAGE_KEYS.USERS_LIST, users);

    const currentSession = this.getCurrentUser();
    if (currentSession && currentSession.id === id) {
      this.setCurrentUser(updatedUser);
    }

    const admin = this.getCurrentUser();
    this.addAuditLog({
      userId: admin?.id || 'ADMIN',
      userName: admin?.fullName || 'Quản trị viên',
      userRole: admin?.role || 'ADMIN',
      action: 'CẬP_NHẬT_TÀI_KHOẢN',
      targetType: 'SYSTEM',
      details: `Cập nhật tài khoản ${updatedUser.username} (${updatedUser.fullName})`,
    });
    return { success: true, user: updatedUser };
  }

  public toggleUserStatus(id: string): { success: boolean; newStatus?: 'ACTIVE' | 'LOCKED'; error?: string } {
    const users = this.getAllUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { success: false, error: 'Không tìm thấy người dùng.' };

    const currentSession = this.getCurrentUser();
    if (currentSession && currentSession.id === id) {
      return { success: false, error: 'Không thể tự khóa tài khoản của chính mình đang đăng nhập.' };
    }

    const newStatus = user.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED';
    user.status = newStatus;
    user.isActive = newStatus === 'ACTIVE';
    this.setItem(STORAGE_KEYS.USERS_LIST, users);

    this.addAuditLog({
      userId: currentSession?.id || 'ADMIN',
      userName: currentSession?.fullName || 'Quản trị viên',
      userRole: currentSession?.role || 'ADMIN',
      action: newStatus === 'LOCKED' ? 'KHÓA_TÀI_KHOẢN' : 'MỞ_KHÓA_TÀI_KHOẢN',
      targetType: 'SYSTEM',
      details: `${newStatus === 'LOCKED' ? 'Khóa' : 'Mở khóa'} tài khoản ${user.username} (${user.fullName})`,
    });
    return { success: true, newStatus };
  }

  public resetUserPassword(id: string, newPassword?: string): { success: boolean; newPass?: string; error?: string } {
    const users = this.getAllUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { success: false, error: 'Không tìm thấy người dùng.' };

    const finalPass = newPassword?.trim() || '123456';
    user.password = finalPass;
    this.setItem(STORAGE_KEYS.USERS_LIST, users);

    const currentSession = this.getCurrentUser();
    this.addAuditLog({
      userId: currentSession?.id || 'ADMIN',
      userName: currentSession?.fullName || 'Quản trị viên',
      userRole: currentSession?.role || 'ADMIN',
      action: 'ĐẶT_LẠI_MẬT_KHẨU',
      targetType: 'SYSTEM',
      details: `Đặt lại mật khẩu cho tài khoản ${user.username}`,
    });
    return { success: true, newPass: finalPass };
  }

  public deleteUser(id: string): { success: boolean; error?: string } {
    const users = this.getAllUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { success: false, error: 'Không tìm thấy tài khoản cần xóa.' };
    const currentSession = this.getCurrentUser();
    if (currentSession && currentSession.id === id) {
      return { success: false, error: 'Không thể xóa tài khoản đang đăng nhập hiện tại.' };
    }
    if (user.username === 'admin' && user.id === 'USR-01') {
      return { success: false, error: 'Không thể xóa tài khoản Quản trị viên hệ thống mặc định.' };
    }
    this.setItem(STORAGE_KEYS.USERS_LIST, users.filter((u) => u.id !== id));
    this.addAuditLog({
      userId: currentSession?.id || 'ADMIN',
      userName: currentSession?.fullName || 'Quản trị viên',
      userRole: currentSession?.role || 'ADMIN',
      action: 'XÓA_TÀI_KHOẢN',
      targetType: 'SYSTEM',
      details: `Xóa tài khoản ${user.username} (${user.fullName}).`,
    });
    return { success: true };
  }

  public resetUsersList(): void {
    this.setItem(STORAGE_KEYS.USERS_LIST, [...DEFAULT_OPERATIONAL_ACCOUNTS, ...DEFAULT_BP_ACCOUNTS]);
  }

  public loginWithCaptainOtp(phone: string, otp: string): { success: boolean; user?: UserAccount; error?: string } {
    const cleanPhone = phone.trim();
    if (otp !== '123456') {
      return { success: false, error: 'Mã OTP không đúng. Vui lòng kiểm tra lại.' };
    }
    const users = this.getAllUsers();
    const user =
      users.find((u) => u.phone === cleanPhone && u.role === 'CAPTAIN') ||
      users.find((u) => u.role === 'CAPTAIN');
    if (!user) {
      return {
        success: false,
        error: 'Chưa có tài khoản Chủ tàu/Thuyền trưởng trong danh sách.',
      };
    }
    this.setCurrentUser(user);
    this.addAuditLog({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'ĐĂNG_NHẬP_OTP_THUYỀN_TRƯỞNG',
      targetType: 'SYSTEM',
      details: `Chủ tàu / Thuyền trưởng đăng nhập bằng SĐT ${cleanPhone}.`,
    });
    return { success: true, user };
  }

  public logout(): void {
    const user = this.getCurrentUser();
    if (user) {
      this.addAuditLog({
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        action: 'ĐĂNG_XUẤT_HỆ_THỐNG',
        targetType: 'SYSTEM',
        details: `Người dùng ${user.fullName} (${user.role}) đăng xuất.`,
      });
    }
    this.setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } catch {}
  }

  public getDefaultLandingPageForRole(role: UserRole): string {
    switch (role) {
      case 'UNASSIGNED':
        return 'unassigned';
      case 'LEADER':
      case 'DEPT_HEAD':
      case 'DUTY_OFFICER':
      case 'ADMIN':
        return 'dashboard';
      case 'CLERK':
      case 'OFFICER':
        return 'internal-workflow';
      case 'PORT_STAFF':
        return 'port-inspect';
      case 'CAPTAIN':
        return 'create-trip';
      case 'VERIFIER':
        return 'public-verify';
      case 'BP_TRUC':
      case 'BP_CHIHUY':
        return 'bp-daily-trips';
      default:
        return 'dashboard';
    }
  }

  // =================== ADMIN CONFIG & CHECKLIST ===================
  public getAdminConfig(): AdminOperationalConfig {
    const saved = this.getItem<Partial<AdminOperationalConfig>>(
      STORAGE_KEYS.ADMIN_CONFIG,
      DEFAULT_ADMIN_OPERATIONAL_CONFIG
    );
    const rawPageSize = Number(
      saved.paginationPageSize ?? DEFAULT_ADMIN_OPERATIONAL_CONFIG.paginationPageSize ?? 15
    );
    const normalizedPageSize = Number.isFinite(rawPageSize)
      ? Math.min(200, Math.max(5, Math.floor(rawPageSize)))
      : 15;
    const permitSignerName =
      typeof saved.permitSignerName === 'string' && saved.permitSignerName.trim()
        ? saved.permitSignerName.trim()
        : DEFAULT_ORDER_SIGNER_NAME;
    const permitSignerAuthority =
      typeof saved.permitSignerAuthority === 'string'
        ? saved.permitSignerAuthority.trim()
        : DEFAULT_ORDER_SIGNER_AUTHORITY;
    const permitSignerTitle =
      typeof saved.permitSignerTitle === 'string' && saved.permitSignerTitle.trim()
        ? saved.permitSignerTitle.trim()
        : DEFAULT_ORDER_SIGNER_TITLE;
    const permitSignLocation =
      typeof saved.permitSignLocation === 'string' && saved.permitSignLocation.trim()
        ? saved.permitSignLocation.trim()
        : DEFAULT_ORDER_SIGN_LOCATION;
    const rawAdminContactEmail =
      typeof saved.adminContactEmail === 'string' && saved.adminContactEmail.trim()
        ? saved.adminContactEmail.trim()
        : DEFAULT_ADMIN_CONTACT_EMAIL;
    const adminContactEmail = rawAdminContactEmail.replace(/pvtho@pdu\.edu\.vn/gi, 'hanh.atgt@gmail.com');
    const adminContactName =
      typeof saved.adminContactName === 'string' && saved.adminContactName.trim()
        ? saved.adminContactName.trim()
        : DEFAULT_ADMIN_CONTACT_NAME;
    const adminContactPhone =
      typeof saved.adminContactPhone === 'string'
        ? saved.adminContactPhone.trim()
        : DEFAULT_ADMIN_CONTACT_PHONE;
    return {
      ...DEFAULT_ADMIN_OPERATIONAL_CONFIG,
      ...saved,
      permitSignerName,
      permitSignerAuthority,
      permitSignerTitle,
      permitSignLocation,
      adminContactEmail,
      adminContactName,
      adminContactPhone,
      paginationPageSize: normalizedPageSize,
      bqlChecklistConfig:
        saved.bqlChecklistConfig && saved.bqlChecklistConfig.length > 0
          ? saved.bqlChecklistConfig
          : DEFAULT_ADMIN_OPERATIONAL_CONFIG.bqlChecklistConfig,
    };
  }

  public getAdminContactConfig(): {
    email: string;
    emails: string[];
    name: string;
    phone: string;
  } {
    const cfg = this.getAdminConfig();
    const rawEmail = (cfg.adminContactEmail || DEFAULT_ADMIN_CONTACT_EMAIL).trim();
    const emails = rawEmail
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const normalizedEmails =
      emails.length > 0
        ? emails
        : DEFAULT_ADMIN_CONTACT_EMAIL.split(',').map((item) => item.trim());
    return {
      email: normalizedEmails.join(', '),
      emails: normalizedEmails,
      name: (cfg.adminContactName || DEFAULT_ADMIN_CONTACT_NAME).trim(),
      phone: (cfg.adminContactPhone ?? DEFAULT_ADMIN_CONTACT_PHONE).trim(),
    };
  }

  public async syncAdminContactFromServer(): Promise<{
    email: string;
    emails: string[];
    name: string;
    phone: string;
  }> {
    try {
      const res = await fetch('/api/system/admin-contact', {
        method: 'GET',
        credentials: 'same-origin',
      });
      if (!res.ok) return this.getAdminContactConfig();
      const data = await res.json();
      const contact = data?.contact;
      if (contact && typeof contact.email === 'string' && contact.email.trim()) {
        const current = this.getAdminConfig();
        const next: AdminOperationalConfig = {
          ...current,
          adminContactEmail: contact.email.trim(),
          adminContactName:
            typeof contact.name === 'string' && contact.name.trim()
              ? contact.name.trim()
              : current.adminContactName,
          adminContactPhone:
            typeof contact.phone === 'string'
              ? contact.phone.trim()
              : current.adminContactPhone,
        };
        this.setItem(STORAGE_KEYS.ADMIN_CONFIG, next);
      }
    } catch {
      // Fallback sang dữ liệu cục bộ nếu không kết nối được API
    }
    return this.getAdminContactConfig();
  }

  public getPermitSignerConfig(): {
    name: string;
    authority: string;
    title: string;
    location: string;
    fullTitle: string;
  } {
    const cfg = this.getAdminConfig();
    const name = (cfg.permitSignerName || DEFAULT_ORDER_SIGNER_NAME).trim();
    const authority = (cfg.permitSignerAuthority ?? DEFAULT_ORDER_SIGNER_AUTHORITY).trim();
    const title = (cfg.permitSignerTitle || DEFAULT_ORDER_SIGNER_TITLE).trim();
    const location = (cfg.permitSignLocation || DEFAULT_ORDER_SIGN_LOCATION).trim();
    const fullTitle = [authority, title].filter(Boolean).join(' • ');
    return { name, authority, title, location, fullTitle };
  }

  public getPaginationPageSize(): number {
    return this.getAdminConfig().paginationPageSize || 15;
  }

  public saveAdminConfig(config: AdminOperationalConfig, actor?: UserAccount): void {
    const normalizedPageSize = Math.min(
      200,
      Math.max(5, Math.floor(Number(config.paginationPageSize) || 15))
    );
    const permitSignerName = (config.permitSignerName || '').trim() || DEFAULT_ORDER_SIGNER_NAME;
    const permitSignerAuthority =
      config.permitSignerAuthority !== undefined
        ? config.permitSignerAuthority.trim()
        : DEFAULT_ORDER_SIGNER_AUTHORITY;
    const permitSignerTitle = (config.permitSignerTitle || '').trim() || DEFAULT_ORDER_SIGNER_TITLE;
    const permitSignLocation = (config.permitSignLocation || '').trim() || DEFAULT_ORDER_SIGN_LOCATION;
    const adminContactEmail = (config.adminContactEmail || '').trim() || DEFAULT_ADMIN_CONTACT_EMAIL;
    const adminContactName = (config.adminContactName || '').trim() || DEFAULT_ADMIN_CONTACT_NAME;
    const adminContactPhone =
      config.adminContactPhone !== undefined
        ? config.adminContactPhone.trim()
        : DEFAULT_ADMIN_CONTACT_PHONE;
    const payload: AdminOperationalConfig = {
      ...config,
      permitSignerName,
      permitSignerAuthority,
      permitSignerTitle,
      permitSignLocation,
      adminContactEmail,
      adminContactName,
      adminContactPhone,
      paginationPageSize: normalizedPageSize,
    };
    this.setItem(STORAGE_KEYS.ADMIN_CONFIG, payload);
    if (actor) {
      const signerRoleSummary = [permitSignerAuthority, permitSignerTitle].filter(Boolean).join(' / ');
      this.addAuditLog({
        userId: actor.id,
        userName: actor.fullName,
        userRole: actor.role,
        action: 'CẬP_NHẬT_CẤU_HÌNH_VẬN_HÀNH',
        targetType: 'SYSTEM',
        details: `Cập nhật cấu hình QR thanh toán, người ký phát hành Giấy phép (${permitSignerName} - ${signerRoleSummary}, địa danh: ${permitSignLocation}), email liên hệ quản trị (${adminContactEmail}), mẫu thông báo/giấy phép, checklist 8 nhóm BQL, định mức (${payload.bqlProcessingSlaMinutes}/${payload.deptProcessingSlaMinutes}/${payload.officeUploadSlaMinutes}p) và phân trang (${normalizedPageSize} bản ghi/trang).`,
      });
    }
    this.emitUserMutation();
  }

  // =================== CA TRỰC & PHÂN QUYỀN BẾN ===================
  public getDutyShifts(): DutyShift[] {
    return this.getItem<DutyShift[]>(STORAGE_KEYS.SHIFTS, []);
  }

  public saveDutyShift(shift: DutyShift): void {
    const normalized: DutyShift = {
      ...shift,
      assigneeIds:
        shift.assigneeIds && shift.assigneeIds.length > 0
          ? shift.assigneeIds
          : [shift.portStaffId, shift.officerId, shift.leaderId].filter(Boolean) as string[],
      assigneeNames:
        shift.assigneeNames && shift.assigneeNames.length > 0
          ? shift.assigneeNames
          : [shift.portStaffName, shift.officerName, shift.leaderName].filter(Boolean) as string[],
    };
    const list = this.getDutyShifts();
    const idx = list.findIndex((s) => s.id === normalized.id);
    if (idx >= 0) list[idx] = normalized;
    else list.unshift(normalized);
    this.setItem(STORAGE_KEYS.SHIFTS, list);
    this.emitUserMutation();
  }

  public deleteDutyShift(shiftId: string): void {
    this.setItem(STORAGE_KEYS.SHIFTS, this.getDutyShifts().filter((s) => s.id !== shiftId));
    this.emitUserMutation();
  }

  public async syncDutyShiftsFromServer(): Promise<DutyShift[]> {
    try {
      const res = await fetch('/api/system/duty-shifts', {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...sessionManager.getSessionHeaders(),
        },
      });
      if (res.status === 401) {
        sessionManager.handleUnauthorizedResponse();
        return this.getDutyShifts();
      }
      if (!res.ok) return this.getDutyShifts();
      const data = await res.json();
      if (data?.success && data.initialized && Array.isArray(data.shifts)) {
        this.setItem(STORAGE_KEYS.SHIFTS, data.shifts as DutyShift[]);
        return data.shifts as DutyShift[];
      }
    } catch {
      // Ngoại tuyến: sử dụng dữ liệu cục bộ
    }
    return this.getDutyShifts();
  }

  public async saveDutyShiftWithSync(
    shift: DutyShift,
    isEdit: boolean
  ): Promise<{ syncedToServer: boolean; error?: string }> {
    this.saveDutyShift(shift);
    try {
      const url = isEdit
        ? `/api/system/duty-shifts/${encodeURIComponent(shift.id)}`
        : '/api/system/duty-shifts';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...sessionManager.getSessionHeaders(),
        },
        body: JSON.stringify(shift),
      });
      if (res.status === 401) {
        sessionManager.handleUnauthorizedResponse();
        return { syncedToServer: false };
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        return { syncedToServer: false, error: errData?.message };
      }
      return { syncedToServer: true };
    } catch {
      return { syncedToServer: false };
    }
  }

  public async deleteDutyShiftWithSync(
    shiftId: string
  ): Promise<{ syncedToServer: boolean; error?: string }> {
    this.deleteDutyShift(shiftId);
    try {
      const res = await fetch(`/api/system/duty-shifts/${encodeURIComponent(shiftId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...sessionManager.getSessionHeaders(),
        },
      });
      if (res.status === 401) {
        sessionManager.handleUnauthorizedResponse();
        return { syncedToServer: false };
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        return { syncedToServer: false, error: errData?.message };
      }
      return { syncedToServer: true };
    } catch {
      return { syncedToServer: false };
    }
  }

  /**
   * Tài khoản cán bộ Biên phòng (BP_TRUC / BP_CHIHUY) đăng nhập thành công bằng email
   * sẽ tự động được ghi nhận là đang đăng ca trực trong ngày.
   */
  public ensureBpLoginDutyShift(
    user?: UserAccount | null,
    now: Date = new Date()
  ): DutyShift | undefined {
    if (!user) return undefined;
    if (user.role !== 'BP_TRUC' && user.role !== 'BP_CHIHUY') return undefined;
    if (user.status === 'LOCKED' || user.isActive === false) return undefined;

    const userPort = getUserAssignedPortId(user);
    const normalizedEmail = (user.email || '').trim().toLowerCase();
    const shifts = this.getDutyShifts();

    const existing = shifts.find((s) => {
      if (!this.isTimeInShiftWindow(s, now)) return false;
      if (s.roleGroup && s.roleGroup !== 'BIEN_PHONG') return false;
      const matchedIdentity = Boolean(
        s.assigneeIds?.includes(user.id) ||
          s.officerId === user.id ||
          (normalizedEmail &&
            (s.assigneeIds?.some((id) => id.trim().toLowerCase() === normalizedEmail) ||
              (s.handoverNote || '').toLowerCase().includes(normalizedEmail)))
      );
      if (!matchedIdentity) return false;
      if (s.portId && userPort && s.portId !== userPort) return false;
      return true;
    });

    if (existing) {
      if (!existing.assigneeIds?.includes(user.id)) {
        const updated: DutyShift = {
          ...existing,
          assigneeIds: Array.from(new Set([...(existing.assigneeIds || []), user.id])),
          assigneeNames: Array.from(new Set([...(existing.assigneeNames || []), user.fullName])),
          status: 'ACTIVE',
        };
        const nextList = shifts.map((s) => (s.id === existing.id ? updated : s));
        this.setItem(STORAGE_KEYS.SHIFTS, nextList);
        return updated;
      }
      return existing;
    }

    const localYear = now.getFullYear();
    const localMonth = String(now.getMonth() + 1).padStart(2, '0');
    const localDay = String(now.getDate()).padStart(2, '0');
    const localDateStr = `${localYear}-${localMonth}-${localDay}`;
    const hour = now.getHours();
    const loginTimeStr = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const shiftType: DutyShift['shiftType'] =
      hour < 6 ? 'EARLY_MORNING' : hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'NIGHT';

    const dayStart = new Date(localYear, now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(localYear, now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const safeUid = (user.id || normalizedEmail || 'bp').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
    const shiftId = `SHIFT-BP-LOGIN-${localDateStr}-${safeUid}`;

    const newShift: DutyShift = {
      id: shiftId,
      date: localDateStr,
      dutyDate: localDateStr,
      shiftType,
      shiftName: `Ca trực Biên phòng (Đăng nhập lúc ${loginTimeStr})`,
      roleGroup: 'BIEN_PHONG',
      portId: userPort,
      startTime: loginTimeStr,
      endTime: '23:59',
      startAt: dayStart.toISOString(),
      endAt: dayEnd.toISOString(),
      assigneeIds: [user.id],
      assigneeNames: [user.fullName],
      officerId: user.id,
      officerName: user.fullName,
      status: 'ACTIVE',
      handoverNote: `Tự động đăng ca trực khi cán bộ Biên phòng đăng nhập bằng email (${user.email || user.username}).`,
    };

    const idx = shifts.findIndex((s) => s.id === shiftId);
    const nextShifts = [...shifts];
    if (idx >= 0) nextShifts[idx] = newShift;
    else nextShifts.unshift(newShift);
    this.setItem(STORAGE_KEYS.SHIFTS, nextShifts);

    this.addAuditLog({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'DANG_CA_TRUC_BIEN_PHONG',
      targetType: 'SYSTEM',
      targetId: shiftId,
      shiftName: newShift.shiftName,
      details: `Cán bộ Biên phòng ${user.fullName} (${user.email || user.username}) đăng nhập thành công và tự động kích hoạt ca trực${
        userPort ? ` tại ${userPort === 'PORT-01' ? 'Bến Đảo Lớn' : 'Bến Đảo Bé'}` : ''
      }.`,
    });

    return newShift;
  }

  private isTimeInShiftWindow(shift: DutyShift, now: Date): boolean {
    if (shift.startAt && shift.endAt) {
      const s = new Date(shift.startAt).getTime();
      const e = new Date(shift.endAt).getTime();
      const n = now.getTime();
      return !isNaN(s) && !isNaN(e) && n >= s && n <= e;
    }
    const localYear = now.getFullYear();
    const localMonth = String(now.getMonth() + 1).padStart(2, '0');
    const localDay = String(now.getDate()).padStart(2, '0');
    const localDateStr = `${localYear}-${localMonth}-${localDay}`;
    const utcDateStr = now.toISOString().slice(0, 10);
    const shiftDate = shift.date || shift.dutyDate;
    if (shiftDate !== localDateStr && shiftDate !== utcDateStr) return false;

    const nowMins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = (shift.startTime || '00:00').split(':').map(Number);
    const [eh, em] = (shift.endTime || '23:59').split(':').map(Number);
    const startMins = (sh || 0) * 60 + (sm || 0);
    const endMins = (eh || 23) * 60 + (em || 59);
    if (endMins >= startMins) {
      return nowMins >= startMins && nowMins <= endMins;
    }
    return nowMins >= startMins || nowMins <= endMins;
  }

  public getActiveShiftForUser(user?: UserAccount | null, now: Date = new Date()): DutyShift | undefined {
    if (!user) return undefined;
    const expectedGroup = SHIFT_ROLE_BY_USER_ROLE[user.role];
    if (!expectedGroup) return undefined;

    const normalizedEmail = (user.email || '').trim().toLowerCase();
    const shifts = this.getDutyShifts();
    const matched = shifts.find((s) => {
      if (s.status === 'COMPLETED') return false;
      if (!this.isTimeInShiftWindow(s, now)) return false;
      if (s.roleGroup && s.roleGroup !== expectedGroup) return false;
      const inAssignees = Boolean(
        s.assigneeIds?.includes(user.id) ||
          s.portStaffId === user.id ||
          s.officerId === user.id ||
          s.leaderId === user.id ||
          (normalizedEmail &&
            s.assigneeIds?.some((id) => id.trim().toLowerCase() === normalizedEmail))
      );
      if (!inAssignees) return false;
      if (expectedGroup === 'BQL_CANG' || expectedGroup === 'BIEN_PHONG') {
        const userPort = getUserAssignedPortId(user);
        if (s.portId && userPort && s.portId !== userPort) return false;
      }
      return true;
    });

    if (matched) return matched;

    return undefined;
  }

  /**
   * Kiểm tra quyền xử lý hồ sơ theo vai trò & bến phụ trách của tài khoản đã đăng nhập.
   * Không chặn theo ca trực: người dùng đăng nhập thành công được xử lý hồ sơ theo đúng quyền.
   * Nếu tài khoản đang có ca trực trùng khung giờ thì vẫn trả kèm `shift` để ghi nhật ký.
   */
  public validateShiftAndPortForAction(
    user: UserAccount,
    requiredPortId?: string,
    now: Date = new Date()
  ): { allowed: boolean; shift?: DutyShift; reason?: string } {
    if (user.status === 'LOCKED' || user.isActive === false) {
      return {
        allowed: false,
        reason: 'Tài khoản của bạn hiện đang bị khóa hoặc ngừng hoạt động.',
      };
    }
    if (user.role === 'ADMIN') {
      return { allowed: true };
    }
    const expectedGroup = SHIFT_ROLE_BY_USER_ROLE[user.role];
    if (!expectedGroup) {
      return { allowed: true };
    }

    const activeShift = this.getActiveShiftForUser(user, now);

    if ((expectedGroup === 'BQL_CANG' || expectedGroup === 'BIEN_PHONG') && requiredPortId) {
      const userPort = getUserAssignedPortId(user);
      if (userPort && userPort !== requiredPortId) {
        const portLabel = userPort === 'PORT-01' ? 'Đảo Lớn (Bến Lý Sơn)' : 'Đảo Bé (Bến An Bình)';
        return {
          allowed: false,
          shift: activeShift,
          reason: `Tài khoản gắn với ${portLabel}, không thể thao tác trên chuyến tại bến khác.`,
        };
      }
    }

    return { allowed: true, shift: activeShift };
  }

  /**
   * Kiểm tra một hồ sơ có phải là nhiệm vụ cần xử lý trực tiếp của tài khoản đang đăng nhập hay không
   * (kiểm tra theo vai trò và phương tiện/bến phụ trách — không giới hạn theo ca trực).
   */
  public isTripMyAction(
    user: UserAccount,
    trip: TripRecord,
    now: Date = new Date()
  ): boolean {
    if (user.role === 'CAPTAIN') {
      const accessibleVesselIds = getUserAccessibleVesselIds(user, this.getVessels(), this.getCrew());
      if (!isTripAccessibleToUser(user, trip, accessibleVesselIds)) {
        return false;
      }
      return isTripMyActionTask(user, trip);
    }

    const requiredPortId = getRequiredPortIdForTripAction(user.role, trip);
    const portCheck = this.validateShiftAndPortForAction(user, requiredPortId, now);
    if (!portCheck.allowed) return false;
    return isTripMyActionTask(user, trip);
  }

  /**
   * Xác định Người xử lý hiện tại của một hồ sơ để hiển thị theo dõi trên các hồ sơ liên quan.
   */
  public getCurrentTripHandler(
    trip: TripRecord,
    now: Date = new Date()
  ): TripCurrentHandlerInfo {
    const st = normalizeStatus(trip.status);
    const allUsers = this.getAllUsers().filter((u) => u.status !== 'LOCKED' && u.isActive !== false);
    const shifts = this.getDutyShifts();

    const findActiveShiftAssignees = (
      roleGroup: 'BQL_CANG' | 'CHUYEN_VIEN' | 'BIEN_PHONG',
      portId?: string
    ): { names: string[]; shiftName?: string } => {
      const activeShifts = shifts.filter((s) => {
        if (!this.isTimeInShiftWindow(s, now)) return false;
        if (s.roleGroup && s.roleGroup !== roleGroup) return false;
        if ((roleGroup === 'BQL_CANG' || roleGroup === 'BIEN_PHONG') && portId && s.portId && s.portId !== portId) {
          return false;
        }
        return true;
      });
      if (activeShifts.length === 0) return { names: [] };

      const names: string[] = [];
      activeShifts.forEach((s) => {
        (s.assigneeNames || []).forEach((n) => {
          if (n && !names.includes(n)) names.push(n);
        });
        if (names.length === 0 && s.assigneeIds && s.assigneeIds.length > 0) {
          s.assigneeIds.forEach((uid) => {
            const u = allUsers.find((item) => item.id === uid);
            if (u?.fullName && !names.includes(u.fullName)) names.push(u.fullName);
          });
        }
      });
      return { names, shiftName: activeShifts[0]?.shiftName };
    };

    // 1. Khâu Chủ tàu / Thuyền trưởng
    if (st === 'NHAP' || st === 'TRA_CHU_TAU') {
      const captainUser = allUsers.find(
        (u) => u.role === 'CAPTAIN' && u.assignedVesselIds?.includes(trip.vesselId)
      );
      const handlerName =
        (trip.createdByRole === 'CAPTAIN' && trip.createdByName) ||
        captainUser?.fullName ||
        trip.actualDeclarantName ||
        trip.captainName ||
        trip.createdByName ||
        'Chủ tàu / Thuyền trưởng';
      return {
        handlerName,
        unitLabel: 'Chủ tàu / Thuyền trưởng',
        roleDetail: st === 'TRA_CHU_TAU' ? 'Cần chỉnh sửa & nộp lại hồ sơ' : 'Đang soạn thảo bản nháp',
      };
    }

    // 2. Khâu Ban Quản lý Cảng (tại bến đi)
    if (st === 'CHO_KIEM_TRA' || st === 'TRA_BQL_CANG') {
      const active = findActiveShiftAssignees('BQL_CANG', trip.departurePortId);
      const fallbackUsers = allUsers
        .filter((u) => u.role === 'PORT_STAFF' && getUserAssignedPortId(u) === trip.departurePortId)
        .map((u) => u.fullName);
      let handlerName = '';
      if (active.names.length > 0) {
        handlerName = active.names.join(', ');
      } else if (st === 'TRA_BQL_CANG' && trip.portInspection?.inspectorName) {
        handlerName = trip.portInspection.inspectorName;
      } else if (fallbackUsers.length > 0) {
        handlerName = fallbackUsers.join(', ');
      } else {
        handlerName = 'Cán bộ trực BQL Cảng';
      }
      return {
        handlerName,
        unitLabel: 'Ban Quản lý Cảng',
        roleDetail: `BQL Cảng · ${trip.departurePortName}`,
        shiftName: active.shiftName,
        portName: trip.departurePortName,
      };
    }

    // 3. Khâu Chuyên viên Phòng ATGT (Sở Xây dựng) & Trình ký Office
    if (
      [
        'DA_CHAP_THUAN',
        'CHO_SO_XU_LY',
        'DA_DUYET',
        'DANG_TRINH_OFFICE',
        'OFFICE_TRA_LAI',
        'TAM_DUNG_THOI_TIET',
      ].includes(st)
    ) {
      const active = findActiveShiftAssignees('CHUYEN_VIEN');
      const incoming = this.getIncomingDossiers().find((d) => d.tripId === trip.id);
      const specificOfficer =
        trip.officeSubmissionRecord?.submittedByName ||
        trip.officeSubmissionRecord?.draftApprovedByName ||
        trip.deptApprovedByName ||
        incoming?.assignedOfficerName;
      const fallbackOfficers = allUsers
        .filter((u) => u.role === 'OFFICER')
        .map((u) => u.fullName);

      const handlerName =
        active.names.length > 0
          ? active.names.join(', ')
          : specificOfficer || (fallbackOfficers.length > 0 ? fallbackOfficers.join(', ') : 'Chuyên viên trực Phòng ATGT');

      return {
        handlerName,
        unitLabel: st === 'DANG_TRINH_OFFICE' ? 'Phòng ATGT / Lãnh đạo Sở (Office)' : 'Phòng ATGT · Sở Xây dựng',
        roleDetail:
          st === 'DANG_TRINH_OFFICE'
            ? 'Đang trình ký trên Office · Chuyên viên theo dõi tải GP'
            : st === 'OFFICE_TRA_LAI'
            ? 'Chuyên viên rà soát sau khi Office trả lại'
            : 'Chuyên viên Phòng An toàn giao thông',
        shiftName: active.shiftName,
      };
    }

    // 4. Khâu Biên phòng kiểm soát cuối cùng tại bến đi
    if (st === 'DA_CAP_PHEP' || st === 'TAM_GIU_BIEN_PHONG') {
      const active = findActiveShiftAssignees('BIEN_PHONG', trip.departurePortId);
      const bpController = trip.bpDepartureControl?.controllerName || trip.bpDepartureControl?.checkedByName;
      const fallbackBp = allUsers
        .filter(
          (u) =>
            (u.role === 'BP_TRUC' || u.role === 'BP_CHIHUY') &&
            getUserAssignedPortId(u) === trip.departurePortId
        )
        .map((u) => u.fullName);

      const handlerName =
        st === 'TAM_GIU_BIEN_PHONG' && bpController
          ? bpController
          : active.names.length > 0
          ? active.names.join(', ')
          : fallbackBp.length > 0
          ? fallbackBp.join(', ')
          : 'Trạm kiểm soát Biên phòng';

      return {
        handlerName,
        unitLabel: 'Đồn Biên phòng Lý Sơn',
        roleDetail: `Kiểm soát tại ${trip.departurePortName}`,
        shiftName: active.shiftName,
        portName: trip.departurePortName,
      };
    }

    // 5. Khâu Chờ xác nhận cập bến tại đầu bến đến
    if (st === 'DA_XUAT_BEN') {
      const activeBp = findActiveShiftAssignees('BIEN_PHONG', trip.arrivalPortId);
      const activeBql = findActiveShiftAssignees('BQL_CANG', trip.arrivalPortId);
      const fallbackArrival = allUsers
        .filter(
          (u) =>
            (u.role === 'BP_TRUC' || u.role === 'BP_CHIHUY') &&
            getUserAssignedPortId(u) === trip.arrivalPortId
        )
        .map((u) => u.fullName);

      const handlerName =
        activeBp.names.length > 0
          ? activeBp.names.join(', ')
          : activeBql.names.length > 0
          ? activeBql.names.join(', ')
          : fallbackArrival.length > 0
          ? fallbackArrival.join(', ')
          : `Trạm Biên phòng / BQL ${trip.arrivalPortName}`;

      return {
        handlerName,
        unitLabel: 'Biên phòng / BQL Bến đến',
        roleDetail: `Chờ xác nhận cập ${trip.arrivalPortName}`,
        shiftName: activeBp.shiftName || activeBql.shiftName,
        portName: trip.arrivalPortName,
      };
    }

    // 6. Các trạng thái đã kết thúc
    const lastLog = trip.statusLogs && trip.statusLogs.length > 0
      ? trip.statusLogs[trip.statusLogs.length - 1]
      : undefined;
    const finalName =
      trip.arrivingConfirmation?.confirmedByName ||
      trip.officeSubmissionRecord?.revokedByName ||
      lastLog?.changedByName ||
      'Hệ thống';

    return {
      handlerName: finalName,
      unitLabel: 'Đã kết thúc',
      roleDetail: 'Hồ sơ đã hoàn thành / đóng',
    };
  }

  // =================== 2 ĐỒNG HỒ XỬ LÝ (BQL 60P & SỞ 60P) ===================
  private computeClockResult(
    clock: ProcessingClockState | undefined,
    fallbackStartIso?: string,
    now: Date = new Date(),
    limitMinutes = 60
  ): ClockMetricsResult {
    const startedIso = clock?.startedAt || fallbackStartIso;
    if (!startedIso) {
      return {
        rawMinutes: 0,
        pausedMinutes: 0,
        netMinutes: 0,
        overdueMinutes: 0,
        isPaused: false,
        isCompleted: false,
        isAmber: false,
        isRed: false,
      };
    }
    const startMs = new Date(startedIso).getTime();
    const endMs = clock?.completedAt ? new Date(clock.completedAt).getTime() : now.getTime();
    const rawMinutesExact = Math.max(0, (endMs - startMs) / 60000);
    const rawMinutes = roundMetric1(rawMinutesExact);

    let pausedMs = 0;
    (clock?.pausedIntervals || []).forEach((iv) => {
      const ps = new Date(iv.pausedAt).getTime();
      const pe = iv.resumedAt ? new Date(iv.resumedAt).getTime() : endMs;
      if (!isNaN(ps) && !isNaN(pe) && pe > ps) {
        pausedMs += Math.min(pe, endMs) - Math.max(ps, startMs);
      }
    });
    const pausedMinutesExact = Math.max(0, pausedMs / 60000);
    const pausedMinutes = roundMetric1(pausedMinutesExact);
    const netMinutesExact = Math.max(0, rawMinutesExact - pausedMinutesExact);
    const netMinutes = roundMetric1(netMinutesExact);
    const limit = Math.max(1, limitMinutes || 60);
    const overdueMinutes = netMinutesExact > limit ? roundOverdueMinutes(netMinutesExact - limit) : 0;
    const isPaused = Boolean(clock?.pausedAt && !clock?.completedAt);
    const isCompleted = Boolean(clock?.completedAt);

    return {
      rawMinutes,
      pausedMinutes,
      netMinutes,
      overdueMinutes,
      isPaused,
      isCompleted,
      isAmber: netMinutesExact >= limit * 0.75 && netMinutesExact <= limit,
      isRed: netMinutesExact > limit,
    };
  }

  public computeBqlClockMinutes(trip: TripRecord, now: Date = new Date()): ClockMetricsResult {
    const bqlLimit = this.getAdminConfig().bqlProcessingSlaMinutes || 60;
    return this.computeClockResult(trip.bqlClock, trip.submittedAt, now, bqlLimit);
  }

  public computeDeptClockMinutes(trip: TripRecord, now: Date = new Date()): ClockMetricsResult {
    const deptLimit = this.getAdminConfig().deptProcessingSlaMinutes || 60;
    return this.computeClockResult(trip.deptClock, trip.approvalNotice?.issuedAt, now, deptLimit);
  }

  public evaluateTripPhaseRealtime(
    trip: TripRecord,
    now: Date = new Date()
  ): {
    activePhaseIndex: number;
    activePhaseName: string;
    isPhaseOverdue: boolean;
    isTripOverdue: boolean;
    elapsedMinutes: number;
    totalElapsedMinutes: number;
    remainingMinutes: number;
    overdueMinutes: number;
  } {
    const st = normalizeStatus(trip.status);
    const cfg = this.getAdminConfig();
    const bqlLimit = cfg.bqlProcessingSlaMinutes || 60;
    const deptLimit = cfg.deptProcessingSlaMinutes || 60;
    const bqlClock = this.computeBqlClockMinutes(trip, now);
    const deptClock = this.computeDeptClockMinutes(trip, now);

    if (st === 'CHO_KIEM_TRA' || st === 'TRA_BQL_CANG') {
      const elapsed = bqlClock.netMinutes;
      const overdue = bqlClock.isRed;
      return {
        activePhaseIndex: 1,
        activePhaseName: `BQL Cảng kiểm tra (≤ ${bqlLimit}p)`,
        isPhaseOverdue: overdue,
        isTripOverdue: overdue,
        elapsedMinutes: elapsed,
        totalElapsedMinutes: elapsed,
        remainingMinutes: Math.max(0, roundMetric1(bqlLimit - elapsed)),
        overdueMinutes: bqlClock.overdueMinutes,
      };
    }

    if (
      st === 'DA_CHAP_THUAN' ||
      st === 'CHO_SO_XU_LY' ||
      st === 'DA_DUYET' ||
      st === 'DANG_TRINH_OFFICE' ||
      st === 'OFFICE_TRA_LAI'
    ) {
      const elapsed = deptClock.netMinutes;
      const overdue = deptClock.isRed;
      return {
        activePhaseIndex: 2,
        activePhaseName: `Sở Xây dựng & Office (≤ ${deptLimit}p)`,
        isPhaseOverdue: overdue,
        isTripOverdue: overdue || bqlClock.isRed,
        elapsedMinutes: elapsed,
        totalElapsedMinutes: roundMetric1(bqlClock.netMinutes + elapsed),
        remainingMinutes: Math.max(0, roundMetric1(deptLimit - elapsed)),
        overdueMinutes: deptClock.overdueMinutes,
      };
    }

    if (st === 'DA_CAP_PHEP' || st === 'TAM_GIU_BIEN_PHONG') {
      return {
        activePhaseIndex: 3,
        activePhaseName: 'Biên phòng kiểm soát xuất bến',
        isPhaseOverdue: false,
        isTripOverdue: Boolean(trip.isOverallOverdue || bqlClock.isRed || deptClock.isRed),
        elapsedMinutes: 0,
        totalElapsedMinutes: roundMetric1(bqlClock.netMinutes + deptClock.netMinutes),
        remainingMinutes: 0,
        overdueMinutes: Math.max(bqlClock.overdueMinutes, deptClock.overdueMinutes),
      };
    }

    return {
      activePhaseIndex: 0,
      activePhaseName: st,
      isPhaseOverdue: false,
      isTripOverdue: Boolean(trip.isOverallOverdue || bqlClock.isRed || deptClock.isRed),
      elapsedMinutes: 0,
      totalElapsedMinutes: roundMetric1(bqlClock.netMinutes + deptClock.netMinutes),
      remainingMinutes: 0,
      overdueMinutes: Math.max(bqlClock.overdueMinutes, deptClock.overdueMinutes),
    };
  }

  private pauseClock(
    clock: ProcessingClockState | undefined,
    reason: 'TRA_CHU_TAU' | 'TRA_BQL_CANG' | 'TAM_DUNG_THOI_TIET',
    nowIso: string
  ): ProcessingClockState {
    const base: ProcessingClockState = clock
      ? { ...clock, pausedIntervals: [...(clock.pausedIntervals || [])] }
      : { startedAt: nowIso, pausedIntervals: [] };
    if (!base.pausedAt && !base.completedAt) {
      base.pausedAt = nowIso;
      base.pausedIntervals.push({ pausedAt: nowIso, reason });
    }
    return base;
  }

  private resumeClock(clock: ProcessingClockState | undefined, nowIso: string): ProcessingClockState {
    const base: ProcessingClockState = clock
      ? { ...clock, pausedIntervals: [...(clock.pausedIntervals || [])] }
      : { startedAt: nowIso, pausedIntervals: [] };
    if (base.pausedAt) {
      const lastOpenIdx = base.pausedIntervals.findIndex((iv) => !iv.resumedAt);
      if (lastOpenIdx >= 0) {
        base.pausedIntervals[lastOpenIdx] = {
          ...base.pausedIntervals[lastOpenIdx],
          resumedAt: nowIso,
        };
      }
      base.pausedAt = undefined;
    }
    return base;
  }

  private completeClock(clock: ProcessingClockState | undefined, nowIso: string): ProcessingClockState {
    const resumed = this.resumeClock(clock, nowIso);
    resumed.completedAt = nowIso;
    return resumed;
  }

  // =================== TRIPS ===================
  public getTrips(): TripRecord[] {
    const list = this.getItem<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
    let changed = false;
    const normalized = list.map((t) => {
      const nextStatus = normalizeStatus(t.status);
      if (nextStatus !== t.status) {
        changed = true;
        return { ...t, status: nextStatus };
      }
      return t;
    });
    if (changed) {
      try {
        localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(normalized));
      } catch {}
    }
    return normalized;
  }

  public getTripsForUser(user?: UserAccount | null): TripRecord[] {
    const all = this.getTrips();
    if (!user || user.role !== 'CAPTAIN') {
      return all;
    }
    const vessels = this.getVessels();
    const crew = this.getCrew();
    const accessibleVesselIds = getUserAccessibleVesselIds(user, vessels, crew);
    return all.filter((t) => isTripAccessibleToUser(user, t, accessibleVesselIds));
  }

  public getTripById(id: string): TripRecord | undefined {
    const trips = this.getTrips();
    return trips.find(
      (t) =>
        t.id === id ||
        t.tripNumber === id ||
        t.orderNumber === id ||
        (t.supersededOrderNumbers || []).includes(id)
    );
  }

  public getLatestTripForVessel(vesselId: string): TripRecord | undefined {
    return this.getTrips().find((t) => t.vesselId === vesselId);
  }

  public getFrequentPassengers(): Passenger[] {
    const trips = this.getTrips();
    const map = new Map<string, Passenger>();
    trips.forEach((t) => {
      (t.passengers || []).forEach((p) => {
        if (p.idNumber && !map.has(p.idNumber)) {
          map.set(p.idNumber, p);
        }
      });
    });
    return Array.from(map.values()).slice(0, 50);
  }

  public saveTrip(trip: TripRecord): TripRecord {
    const normalizedStatus = normalizeStatus(trip.status);
    const bqlClk = this.computeBqlClockMinutes(trip);
    const deptClk = this.computeDeptClockMinutes(trip);
    const normalizedTrip: TripRecord = {
      ...trip,
      status: normalizedStatus,
      isOverallOverdue: Boolean(trip.isOverallOverdue || bqlClk.isRed || deptClk.isRed),
    };
    const trips = this.getTrips();
    const index = trips.findIndex((t) => t.id === normalizedTrip.id);
    if (index >= 0) trips[index] = normalizedTrip;
    else trips.unshift(normalizedTrip);
    this.setItem(STORAGE_KEYS.TRIPS, trips);
    this.syncIncomingDossierForTrip(normalizedTrip);
    this.syncLiveTripToKpiEvents(normalizedTrip);
    this.emitUserMutation();
    const linkedIncoming = this.getIncomingDossiers().find(
      (d) => d.tripId === normalizedTrip.id || d.tripNumber === normalizedTrip.tripNumber
    );
    dossierArchiveService.queueTripSync(normalizedTrip, linkedIncoming, this.getCurrentUser()?.fullName);
    return normalizedTrip;
  }

  public deleteTrip(id: string): boolean {
    const trips = this.getTrips();
    this.setItem(STORAGE_KEYS.TRIPS, trips.filter((t) => t.id !== id));
    const incoming = this.getItem<IncomingDossier[]>(STORAGE_KEYS.INCOMING_DOSSIERS, []);
    if (incoming.some((d) => d.tripId === id)) {
      this.setItem(
        STORAGE_KEYS.INCOMING_DOSSIERS,
        incoming.filter((d) => d.tripId !== id)
      );
    }
    const kpiEvents = this.getItem<KpiEventRecord[]>(STORAGE_KEYS.KPI_EVENTS, []);
    if (kpiEvents.some((e) => e.hoSoId === id)) {
      this.setItem(
        STORAGE_KEYS.KPI_EVENTS,
        kpiEvents.filter((e) => e.hoSoId !== id)
      );
    }
    this.emitUserMutation();
    return true;
  }

  public canDeleteDraftTrip(trip: TripRecord, actor: UserAccount): boolean {
    if (!trip || !actor) return false;
    if (normalizeStatus(trip.status) !== 'NHAP') return false;
    if (actor.role === 'ADMIN' || actor.role === 'PORT_STAFF') return true;
    if (trip.createdById === actor.id) return true;
    if (actor.role === 'CAPTAIN') {
      const accessibleVesselIds = getUserAccessibleVesselIds(
        actor,
        this.getVessels(),
        this.getCrew()
      );
      return accessibleVesselIds.includes(trip.vesselId);
    }
    return false;
  }

  public deleteDraftTrip(
    id: string,
    actor: UserAccount
  ): { success: boolean; error?: string } {
    const trip = this.getTripById(id);
    if (!trip) {
      return { success: false, error: 'Không tìm thấy hồ sơ nháp cần xóa.' };
    }
    if (normalizeStatus(trip.status) !== 'NHAP') {
      return {
        success: false,
        error: 'Chỉ cho phép xóa các hồ sơ đang ở trạng thái Nháp (NHAP).',
      };
    }
    if (!this.canDeleteDraftTrip(trip, actor)) {
      return {
        success: false,
        error: 'Tài khoản không có quyền xóa hồ sơ nháp này.',
      };
    }

    this.deleteTrip(id);
    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'XÓA_HỒ_SƠ_NHÁP',
      targetId: trip.id,
      targetType: 'TRIP',
      details: `Đã xóa hồ sơ nháp ${trip.tripNumber} (tàu ${trip.vesselName} - ${trip.vesselRegNumber}).`,
    });
    return { success: true };
  }

  public generateNextOrderNumber(routeCode: string): string {
    const config = this.getItem(STORAGE_KEYS.ORDER_CONFIG, {
      prefixYear: String(new Date().getFullYear()),
      defaultSuffix: 'LS-AB',
      currentSequence: 105,
    });
    config.currentSequence += 1;
    this.setItem(STORAGE_KEYS.ORDER_CONFIG, config);
    const seqStr = String(config.currentSequence).padStart(3, '0');
    const suffix = routeCode.includes('AB') ? 'LS-AB' : 'AB-LS';
    return `${seqStr}/${config.prefixYear}/${suffix}`;
  }

  public generateNextNoticeNumber(): string {
    const seq = Math.floor(100 + Math.random() * 899);
    const year = new Date().getFullYear();
    return `TB-${seq}/${year}/BQLC`;
  }

  // =================== QUY TRÌNH XỬ LÝ HỒ SƠ MỚI (MỤC 4) ===================

  public saveDraftTrip(trip: TripRecord, actor: UserAccount): TripRecord {
    const now = new Date().toISOString();
    const existing = trip.id ? this.getTripById(trip.id) : undefined;
    const existingStatus = existing ? normalizeStatus(existing.status) : undefined;
    // Giữ nguyên trạng thái TRA_CHU_TAU khi Chủ tàu đang chỉnh sửa hồ sơ bị trả lại (tránh auto-save làm mất thông tin trả lại)
    const preservedStatus: TripStatus =
      existingStatus === 'TRA_CHU_TAU' ? 'TRA_CHU_TAU' : 'NHAP';

    const merged: TripRecord = {
      ...(existing || {}),
      ...trip,
      status: preservedStatus,
      lastReturnInfo: existing?.lastReturnInfo ?? trip.lastReturnInfo,
      bqlClock: existing?.bqlClock ?? trip.bqlClock,
      deptClock: existing?.deptClock ?? trip.deptClock,
      approvalNotice: existing?.approvalNotice ?? trip.approvalNotice,
      portInspection: existing?.portInspection ?? trip.portInspection,
      weatherCheckRecord: existing?.weatherCheckRecord ?? trip.weatherCheckRecord,
      officeSubmissionRecord: existing?.officeSubmissionRecord ?? trip.officeSubmissionRecord,
      orderNumber: existing?.orderNumber ?? trip.orderNumber,
      supersededOrderNumbers: existing?.supersededOrderNumbers ?? trip.supersededOrderNumbers,
      createdById: existing?.createdById ?? trip.createdById ?? actor.id,
      createdDate: existing?.createdDate ?? trip.createdDate ?? now.slice(0, 10),
      submittedAt: existing?.submittedAt ?? trip.submittedAt,
      statusLogs:
        (existing?.statusLogs && existing.statusLogs.length > 0
          ? existing.statusLogs
          : trip.statusLogs && trip.statusLogs.length > 0
          ? trip.statusLogs
          : [
              {
                fromStatus: 'NHAP',
                toStatus: 'NHAP',
                changedAt: now,
                changedById: actor.id,
                changedByName: actor.fullName,
                reason: 'Lưu bản nháp hồ sơ đề nghị cấp phép rời cảng.',
              },
            ]),
    };

    const saved = this.saveTrip(merged);
    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: preservedStatus === 'TRA_CHU_TAU' ? 'LƯU_TẠM_HỒ_SƠ_BỊ_TRẢ' : 'LƯU_NHÁP_HỒ_SƠ',
      targetId: saved.id,
      targetType: 'TRIP',
      details: `Lưu tạm hồ sơ ${saved.tripNumber} (${saved.vesselName}) ở trạng thái ${preservedStatus}.`,
    });
    return saved;
  }

  public submitTripDossier(
    tripInput: TripRecord,
    actor: UserAccount,
    now: Date = new Date()
  ): { success: boolean; trip?: TripRecord; ruleResults?: RuleCheckResult[]; error?: string } {
    const existing = tripInput.id ? this.getTripById(tripInput.id) : undefined;
    const mergedInput: TripRecord = {
      ...(existing || {}),
      ...tripInput,
      status: existing ? existing.status : tripInput.status,
      lastReturnInfo: tripInput.lastReturnInfo ?? existing?.lastReturnInfo,
      bqlClock: tripInput.bqlClock ?? existing?.bqlClock,
      deptClock: tripInput.deptClock ?? existing?.deptClock,
      approvalNotice: tripInput.approvalNotice ?? existing?.approvalNotice,
      portInspection: tripInput.portInspection ?? existing?.portInspection,
      weatherCheckRecord: tripInput.weatherCheckRecord ?? existing?.weatherCheckRecord,
      officeSubmissionRecord: tripInput.officeSubmissionRecord ?? existing?.officeSubmissionRecord,
      orderNumber: tripInput.orderNumber ?? existing?.orderNumber,
      supersededOrderNumbers: tripInput.supersededOrderNumbers ?? existing?.supersededOrderNumbers,
      statusLogs: existing?.statusLogs?.length ? existing.statusLogs : tripInput.statusLogs,
      createdById: existing?.createdById ?? tripInput.createdById ?? actor.id,
      createdDate: existing?.createdDate ?? tripInput.createdDate ?? now.toISOString().slice(0, 10),
      submittedAt: existing?.submittedAt ?? tripInput.submittedAt,
    };

    const vessel = this.getVesselById(mergedInput.vesselId);
    const weather = this.getWeather();
    const rules = this.getRulesConfig();
    const allTrips = this.getTrips();
    const deNghiDungs = this.getDeNghiDungs();

    const evalOut = RulesEngine.evaluateAllRules(
      mergedInput,
      vessel,
      mergedInput.crewMembers || [],
      weather,
      allTrips,
      rules,
      deNghiDungs,
      { context: 'SUBMIT', now }
    );
    const ruleResults = evalOut.results;
    const blockers = ruleResults.filter((r) => r.status === 'FAILED' && r.severity === 'BLOCKING');
    if (blockers.length > 0) {
      return {
        success: false,
        ruleResults,
        error: blockers.map((b) => `[${b.ruleCode}] ${b.message}`).join(' | '),
      };
    }

    const nowIso = now.toISOString();
    const prevStatus = normalizeStatus(mergedInput.status);
    const lastReturn = mergedInput.lastReturnInfo;
    let nextStatus: TripStatus = 'CHO_KIEM_TRA';
    let bqlClock = mergedInput.bqlClock;
    let deptClock = mergedInput.deptClock;
    const updatedTrip: TripRecord = { ...mergedInput, rulesCheckResults: ruleResults };

    if (prevStatus === 'TRA_CHU_TAU' && lastReturn?.benTra === 'CHUYEN_VIEN') {
      // Chuyên viên trả chủ tàu -> Chủ tàu nộp lại đi thẳng về Chuyên viên (CHO_SO_XU_LY), giữ Thông báo BQL nếu đã có
      nextStatus = 'CHO_SO_XU_LY';
      deptClock = this.resumeClock(deptClock, nowIso);
    } else if (prevStatus === 'TRA_CHU_TAU' && lastReturn?.benTra === 'BIEN_PHONG') {
      // Biên phòng trả do R12 -> Đẩy số Giấy phép cũ vào supersededOrderNumbers, đi lại từ CHO_KIEM_TRA (BQL -> Sở -> GP mới)
      if (updatedTrip.orderNumber) {
        updatedTrip.supersededOrderNumbers = Array.from(
          new Set([...(updatedTrip.supersededOrderNumbers || []), updatedTrip.orderNumber])
        );
      }
      updatedTrip.orderNumber = undefined;
      updatedTrip.issuedAt = undefined;
      updatedTrip.orderValidUntil = undefined;
      updatedTrip.issuedPdfUrl = undefined;
      updatedTrip.issuedPdfName = undefined;
      updatedTrip.isPermitSuspended = false;
      updatedTrip.bpDepartureControl = undefined;
      updatedTrip.approvalNotice = undefined;
      bqlClock = { startedAt: nowIso, pausedIntervals: [] };
      deptClock = undefined;
      nextStatus = 'CHO_KIEM_TRA';
    } else if (prevStatus === 'TRA_CHU_TAU' && lastReturn?.benTra === 'BQL_CANG') {
      nextStatus = 'CHO_KIEM_TRA';
      bqlClock = this.resumeClock(bqlClock, nowIso);
    } else {
      nextStatus = 'CHO_KIEM_TRA';
      bqlClock = { startedAt: nowIso, pausedIntervals: [] };
    }

    updatedTrip.status = nextStatus;
    updatedTrip.submittedAt = updatedTrip.submittedAt || nowIso;
    updatedTrip.bqlClock = bqlClock;
    updatedTrip.deptClock = deptClock;
    updatedTrip.statusLogs = [
      ...(updatedTrip.statusLogs || []),
      {
        fromStatus: prevStatus,
        toStatus: nextStatus,
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason:
          prevStatus === 'TRA_CHU_TAU'
            ? `Chủ tàu/Thuyền trưởng nộp lại hồ sơ sau chỉnh sửa (chuyển về ${
                nextStatus === 'CHO_SO_XU_LY' ? 'Chuyên viên Phòng ATGT (Sở Xây dựng)' : 'Ban Quản lý Cảng'
              }).`
            : 'Chủ tàu/Thuyền trưởng nộp hồ sơ điện tử và chứng từ phí rời cảng.',
      },
    ];

    const saved = this.saveTrip(updatedTrip);

    if (nextStatus === 'CHO_KIEM_TRA') {
      this.notifyShiftOrPortUsers(
        'PORT_STAFF',
        saved.departurePortId,
        prevStatus === 'TRA_CHU_TAU'
          ? `Chủ tàu đã sửa & nộp lại hồ sơ: ${saved.tripNumber}`
          : `Hồ sơ mới chờ kiểm tra: ${saved.tripNumber}`,
        prevStatus === 'TRA_CHU_TAU'
          ? `Tàu ${saved.vesselName} (${saved.vesselRegNumber}) đã bổ sung hồ sơ theo yêu cầu và gửi lại BQL Cảng (${saved.departurePortName}).`
          : `Tàu ${saved.vesselName} (${saved.vesselRegNumber}) vừa nộp hồ sơ rời ${saved.departurePortName}.`,
        'INFO',
        saved.id
      );
    } else {
      this.notifyShiftOrPortUsers(
        'OFFICER',
        undefined,
        `Chủ tàu đã nộp lại hồ sơ: ${saved.tripNumber}`,
        `Tàu ${saved.vesselName} vừa bổ sung hồ sơ theo yêu cầu của Chuyên viên Phòng ATGT.`,
        'INFO',
        saved.id
      );
    }

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: prevStatus === 'TRA_CHU_TAU' ? 'NỘP_LẠI_HỒ_SƠ' : 'NỘP_HỒ_SƠ_MỚI',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: prevStatus,
      afterValue: nextStatus,
      details: `Nộp hồ sơ ${saved.tripNumber} (${saved.vesselName}) -> ${nextStatus}.`,
    });

    return { success: true, trip: saved, ruleResults };
  }

  public withdrawTripDossier(
    tripId: string,
    actor: UserAccount,
    reason = 'Chủ tàu chủ động rút hồ sơ trước khi cấp phép.'
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const st = normalizeStatus(trip.status);
    if (
      ['DA_CAP_PHEP', 'THU_HOI', 'HET_HIEU_LUC', 'TAM_GIU_BIEN_PHONG', 'DA_XUAT_BEN', 'DA_CAP_BEN'].includes(
        st
      )
    ) {
      return { success: false, error: 'Hồ sơ đã được cấp Giấy phép hoặc đã rời bến, không thể rút.' };
    }

    const nowIso = new Date().toISOString();
    trip.status = 'DA_RUT';
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'DA_RUT',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason,
      },
    ];
    const saved = this.saveTrip(trip);

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'CHỦ_TÀU_RÚT_HỒ_SƠ',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'DA_RUT',
      details: `${actor.fullName} rút hồ sơ ${saved.tripNumber}: ${reason}`,
    });

    return { success: true, trip: saved };
  }

  public returnTripFromPortToCaptain(
    tripId: string,
    actor: UserAccount,
    reason: string,
    phamVi: ReturnScope = 'BO_SUNG_THONG_TIN'
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };
    const shiftCheck = this.validateShiftAndPortForAction(actor, trip.departurePortId);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (!['CHO_KIEM_TRA', 'TRA_BQL_CANG'].includes(st)) {
      return { success: false, error: 'Hồ sơ không ở trạng thái BQL Cảng được phép trả Chủ tàu.' };
    }
    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'Vui lòng nhập lý do trả hồ sơ chi tiết (≥ 5 ký tự).' };
    }

    const nowIso = new Date().toISOString();
    trip.status = 'TRA_CHU_TAU';
    trip.rejectReason = reason.trim();
    trip.rejectedByRole = actor.role;
    trip.rejectedByName = actor.fullName;
    trip.bqlClock = this.pauseClock(trip.bqlClock, 'TRA_CHU_TAU', nowIso);
    trip.lastReturnInfo = {
      benTra: 'BQL_CANG',
      benSai: 'CHU_TAU',
      nhomLoi: 'loi_ho_so',
      phamVi,
      lyDo: reason.trim(),
      thoiDiem: nowIso,
      traBoiId: actor.id,
      traBoiName: actor.fullName,
      nguoiTraId: actor.id,
      nguoiTraTen: actor.fullName,
    };
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'TRA_CHU_TAU',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `BQL Cảng trả Chủ tàu (${phamVi}): ${reason.trim()}`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
      this.addNotification({
        recipientUserId: cid,
        title: `BQL Cảng trả hồ sơ ${saved.tripNumber}`,
        message: `Lý do: ${reason.trim()}. Vui lòng chỉnh sửa và nộp lại trong ứng dụng.`,
        type: 'ALERT',
        channel: 'IN_APP',
        tripId: saved.id,
      });
    });

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'BQL_TRẢ_CHỦ_TÀU',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'TRA_CHU_TAU',
      details: `BQL Cảng trả hồ sơ ${saved.tripNumber}: ${reason.trim()}`,
    });

    return { success: true, trip: saved };
  }

  public concludePortInspection(
    tripId: string,
    actor: UserAccount,
    appendix01: NonNullable<TripRecord['portInspection']>,
    approved: boolean,
    rejectReason?: string
  ): { success: boolean; trip?: TripRecord; notice?: ApprovalNoticeData; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor, trip.departurePortId);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (!['CHO_KIEM_TRA', 'TRA_BQL_CANG'].includes(st)) {
      return { success: false, error: 'Hồ sơ không ở trạng thái chờ BQL Cảng kết luận.' };
    }

    const nowIso = new Date().toISOString();
    trip.portInspection = {
      ...appendix01,
      inspectorId: actor.id,
      inspectorName: actor.fullName,
      inspectedAt: nowIso,
      conclusion: approved ? 'ELIGIBLE' : 'INELIGIBLE',
    };

    if (!approved) {
      const reasonText = rejectReason?.trim() || appendix01.notes?.trim() || 'Không đạt điều kiện an toàn rời bến tại Phụ lục 01.';
      trip.status = 'KHONG_CHAP_THUAN';
      trip.rejectReason = reasonText;
      trip.bqlClock = this.completeClock(trip.bqlClock, nowIso);
      trip.statusLogs = [
        ...(trip.statusLogs || []),
        {
          fromStatus: st,
          toStatus: 'KHONG_CHAP_THUAN',
          changedAt: nowIso,
          changedById: actor.id,
          changedByName: actor.fullName,
          reason: `BQL Cảng kết luận KHÔNG CHẤP THUẬN (đóng hồ sơ): ${reasonText}`,
        },
      ];
      const saved = this.saveTrip(trip);

      this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
        this.addNotification({
          recipientUserId: cid,
          title: `Không chấp thuận hồ sơ ${saved.tripNumber}`,
          message: `BQL Cảng kết luận không đủ điều kiện: ${reasonText}. Hồ sơ đã đóng; nếu xuất bến vui lòng tạo hồ sơ mới.`,
          type: 'ALERT',
          channel: 'IN_APP',
          tripId: saved.id,
        });
      });

      this.addAuditLog({
        userId: actor.id,
        userName: actor.fullName,
        userRole: actor.role,
        action: 'BQL_KHÔNG_CHẤP_THUẬN',
        targetId: saved.id,
        targetType: 'TRIP',
        beforeValue: st,
        afterValue: 'KHONG_CHAP_THUAN',
        details: `Đóng hồ sơ ${saved.tripNumber} - Không chấp thuận: ${reasonText}`,
      });
      return { success: true, trip: saved };
    }

    // Đủ điều kiện -> Ra Thông báo chấp thuận (DA_CHAP_THUAN -> CHO_SO_XU_LY), đóng đồng hồ BQL, mở đồng hồ Sở
    const noticeNumber = this.generateNextNoticeNumber();
    const summaryText = `Đã kiểm tra thực tế điều kiện an toàn tại bến (Phụ lục 01) ở ${trip.departurePortName}. Thực tế: ${appendix01.actualPassengerCount} hành khách, ${appendix01.actualCargoTons} tấn hàng.`;
    const notice: ApprovalNoticeData = {
      noticeNumber,
      issuedAt: nowIso,
      approvedAt: nowIso,
      portId: trip.departurePortId,
      portName: trip.departurePortName,
      issuerId: actor.id,
      issuerName: actor.fullName,
      issuedById: actor.id,
      issuedByName: actor.fullName,
      inspectorName: actor.fullName,
      checklistSummary: summaryText,
      conclusionSummary: summaryText,
      summary: summaryText,
      feeVerified: appendix01.feeVerified !== false,
      notes: appendix01.notes,
    };

    trip.approvalNotice = notice;
    trip.bqlClock = this.completeClock(trip.bqlClock, nowIso);
    trip.deptClock = trip.deptClock
      ? this.resumeClock(trip.deptClock, nowIso)
      : { startedAt: nowIso, pausedIntervals: [] };

    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'DA_CHAP_THUAN',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `BQL Cảng cấp Thông báo chấp thuận số ${noticeNumber}.`,
      },
      {
        fromStatus: 'DA_CHAP_THUAN',
        toStatus: 'CHO_SO_XU_LY',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: 'Tự động chuyển hồ sơ sang Phòng ATGT (Sở Xây dựng) xử lý.',
      },
    ];
    trip.status = 'CHO_SO_XU_LY';
    const saved = this.saveTrip(trip);
    this.createIncomingDossierFromPort(saved, actor);

    this.notifyShiftOrPortUsers(
      'OFFICER',
      undefined,
      `Thông báo chấp thuận mới: ${noticeNumber} (${saved.vesselName})`,
      `BQL Cảng đã hoàn tất kiểm tra thực tế tại bến (Phụ lục 01) và đối chiếu phí cho hồ sơ ${saved.tripNumber}. Mời Chuyên viên kiểm tra & trình Office.`,
      'INFO',
      saved.id
    );

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'BQL_CẤP_THÔNG_BÁO_CHẤP_THUẬN',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'CHO_SO_XU_LY',
      details: `Cấp Thông báo chấp thuận ${noticeNumber} cho ${saved.tripNumber}, chuyển Sở Xây dựng.`,
    });

    return { success: true, trip: saved, notice };
  }

  public resubmitFromPortToDept(
    tripId: string,
    actor: UserAccount,
    appendix01: NonNullable<TripRecord['portInspection']>,
    note: string
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor, trip.departurePortId);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (st !== 'TRA_BQL_CANG') {
      return { success: false, error: 'Hồ sơ không ở trạng thái Sở trả BQL Cảng.' };
    }

    const nowIso = new Date().toISOString();
    trip.portInspection = {
      ...appendix01,
      inspectorId: actor.id,
      inspectorName: actor.fullName,
      inspectedAt: nowIso,
      conclusion: 'ELIGIBLE',
      notes: note || appendix01.notes,
    };
    const refreshedSummary = `BQL Cảng đã rà soát, bổ sung kết quả kiểm tra thực tế (Phụ lục 01) tại ${trip.departurePortName}. Thực tế: ${appendix01.actualPassengerCount} hành khách, ${appendix01.actualCargoTons} tấn hàng.`;
    const noticeNumber = trip.approvalNotice?.noticeNumber || this.generateNextNoticeNumber();
    trip.approvalNotice = {
      ...(trip.approvalNotice || {}),
      noticeNumber,
      issuedAt: nowIso,
      approvedAt: nowIso,
      portId: trip.departurePortId,
      portName: trip.departurePortName,
      issuerId: actor.id,
      issuerName: actor.fullName,
      issuedById: actor.id,
      issuedByName: actor.fullName,
      inspectorName: actor.fullName,
      checklistSummary: refreshedSummary,
      conclusionSummary: refreshedSummary,
      summary: refreshedSummary,
      feeVerified: appendix01.feeVerified !== false,
      notes: note || appendix01.notes,
    };
    trip.deptClock = this.resumeClock(trip.deptClock, nowIso);
    trip.status = 'CHO_SO_XU_LY';
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'CHO_SO_XU_LY',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `BQL Cảng bổ sung thông tin (cập nhật Thông báo ${noticeNumber}) và gửi lại Sở Xây dựng: ${note}`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.notifyShiftOrPortUsers(
      'OFFICER',
      undefined,
      `BQL Cảng đã gửi lại hồ sơ ${saved.tripNumber}`,
      `BQL đã bổ sung theo yêu cầu của Sở: ${note}`,
      'INFO',
      saved.id
    );

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'BQL_GỬI_LẠI_SỞ',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'CHO_SO_XU_LY',
      details: `BQL Cảng gửi lại hồ sơ ${saved.tripNumber} lên Sở: ${note}`,
    });

    return { success: true, trip: saved };
  }

  public recordDeptWeatherCheck(
    tripId: string,
    actor: UserAccount,
    data?: {
      isSafe: boolean;
      windForceBeaufort: number;
      waveHeightMeters: number;
      visibilityKm: number;
      forecastNote: string;
    }
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    // Không cho phép chỉnh sửa sau khi đã ghi nhận tự động
    if (trip.weatherCheckRecord) {
      return {
        success: false,
        trip,
        error:
          'Kết quả kiểm tra thời tiết tại thời điểm xét cấp phép đã được ghi nhận tự động và khóa, không cho phép chỉnh sửa.',
      };
    }

    const weather = this.getWeather();
    const vessel = this.getVesselById(trip.vesselId);
    const maxWind = vessel?.maxWindForce ?? 6;
    const maxWave = vessel?.maxWaveHeight ?? 2.0;

    const windForceBeaufort = data ? data.windForceBeaufort : weather.windForceBeaufort;
    const waveHeightMeters = data ? data.waveHeightMeters : weather.waveHeightMeters;
    const visibilityKm = data ? data.visibilityKm : (weather.visibilityKm ?? 10);
    const forecastNote = data
      ? data.forecastNote
      : weather.forecastNext24h ||
        `Thời tiết thời gian thực tuyến Lý Sơn: gió cấp ${weather.windForceBeaufort} (${weather.windDirection || 'Đông Bắc'}), sóng ${weather.waveHeightMeters}m.`;
    const isSafe = data
      ? data.isSafe
      : !weather.isRouteSuspended &&
        windForceBeaufort <= maxWind &&
        waveHeightMeters <= maxWave;

    const nowIso = new Date().toISOString();
    trip.weatherCheckRecord = {
      checkedAt: nowIso,
      checkedById: actor.id,
      checkedByName: actor.fullName,
      area: weather.area || 'Tuyến Đảo Lớn – Đảo Bé (Đặc khu Lý Sơn)',
      isSafe,
      isRouteSuspended: Boolean(weather.isRouteSuspended),
      conclusion: isSafe ? 'AN_TOAN' : 'KHONG_AN_TOAN',
      windForceBeaufort,
      waveHeightMeters,
      visibilityKm,
      forecastNote,
    };

    if (data) {
      weather.windForceBeaufort = data.windForceBeaufort;
      weather.waveHeightMeters = data.waveHeightMeters;
      weather.visibilityKm = data.visibilityKm;
      weather.forecastNext24h = data.forecastNote;
      weather.recordedAt = nowIso;
      weather.recordedBy = actor.fullName;
      this.saveWeather(weather);
    }

    const saved = this.saveTrip(trip);
    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'CHUYÊN_VIÊN_KIỂM_TRA_THỜI_TIẾT',
      targetId: saved.id,
      targetType: 'WEATHER',
      details: `Ghi nhận tự động thời tiết thời gian thực hồ sơ ${saved.tripNumber}: Gió cấp ${windForceBeaufort}, sóng ${waveHeightMeters}m, tầm nhìn ${visibilityKm}km (${isSafe ? 'An toàn' : 'Nguy hiểm'}) — người thực hiện: ${actor.fullName}.`,
    });

    return { success: true, trip: saved };
  }

  public suspendWaitingTripsByWeather(
    actor: UserAccount,
    reason: string,
    resumeEstimatedAt?: string
  ): { success: boolean; affectedCount: number; trips: TripRecord[]; error?: string } {
    if (!['OFFICER', 'ADMIN', 'LEADER'].includes(actor.role)) {
      return { success: false, affectedCount: 0, trips: [], error: 'Chỉ Chuyên viên hoặc Quản trị mới được bật tạm dừng thời tiết.' };
    }
    if (actor.role === 'OFFICER') {
      const shiftCheck = this.validateShiftAndPortForAction(actor);
      if (!shiftCheck.allowed) return { success: false, affectedCount: 0, trips: [], error: shiftCheck.reason };
    }

    const nowIso = new Date().toISOString();
    const weather = this.getWeather();
    weather.isRouteSuspended = true;
    weather.suspensionReason = reason.trim();
    weather.suspendedAt = nowIso;
    weather.suspendedByName = actor.fullName;
    weather.resumeEstimatedAt = resumeEstimatedAt;
    this.saveWeather(weather);

    const routes = this.getRoutes();
    routes.forEach((r) => {
      r.isSuspended = true;
      r.suspensionNotice = reason.trim();
    });
    this.setItem(STORAGE_KEYS.ROUTES, routes);

    const waitingStatuses: TripStatus[] = ['CHO_SO_XU_LY', 'DA_DUYET', 'DANG_TRINH_OFFICE'];
    const allTrips = this.getTrips();
    const affected: TripRecord[] = [];

    const updatedAll = allTrips.map((t) => {
      const st = normalizeStatus(t.status);
      if (waitingStatuses.includes(st)) {
        const next: TripRecord = {
          ...t,
          previousStatusBeforeWeatherPause: st,
          status: 'TAM_DUNG_THOI_TIET',
          deptClock: this.pauseClock(t.deptClock, 'TAM_DUNG_THOI_TIET', nowIso),
          statusLogs: [
            ...(t.statusLogs || []),
            {
              fromStatus: st,
              toStatus: 'TAM_DUNG_THOI_TIET',
              changedAt: nowIso,
              changedById: actor.id,
              changedByName: actor.fullName,
              reason: `Tạm dừng toàn tuyến do thời tiết: ${reason.trim()}`,
            },
          ],
        };
        affected.push(next);
        return next;
      }
      return t;
    });

    this.setItem(STORAGE_KEYS.TRIPS, updatedAll);
    this.addNotification({
      recipientUserId: 'ALL',
      title: 'CẢNH BÁO: TẠM DỪNG TOÀN TUYẾN DO THỜI TIẾT',
      message: `${actor.fullName} đã tạm dừng toàn tuyến (${affected.length} hồ sơ đang chờ được đưa vào tạm dừng thời tiết): ${reason.trim()}`,
      type: 'ALERT',
      channel: 'IN_APP',
    });

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'TẠM_DỪNG_TOÀN_TUYẾN_THỜI_TIẾT',
      targetType: 'WEATHER',
      details: `Tạm dừng ${affected.length} hồ sơ đang chờ Sở do thời tiết: ${reason.trim()}`,
    });

    this.emitUserMutation();
    return { success: true, affectedCount: affected.length, trips: affected };
  }

  public resumeWeatherSuspension(
    actor: UserAccount
  ): { success: boolean; resumedCount: number; trips: TripRecord[]; error?: string } {
    if (!['OFFICER', 'ADMIN', 'LEADER'].includes(actor.role)) {
      return { success: false, resumedCount: 0, trips: [], error: 'Không có quyền mở lại tuyến.' };
    }
    if (actor.role === 'OFFICER') {
      const shiftCheck = this.validateShiftAndPortForAction(actor);
      if (!shiftCheck.allowed) return { success: false, resumedCount: 0, trips: [], error: shiftCheck.reason };
    }

    const nowIso = new Date().toISOString();
    const weather = this.getWeather();
    weather.isRouteSuspended = false;
    weather.suspensionReason = undefined;
    weather.suspendedAt = undefined;
    weather.suspendedByName = undefined;
    weather.resumeEstimatedAt = undefined;
    this.saveWeather(weather);

    const routes = this.getRoutes();
    routes.forEach((r) => {
      r.isSuspended = false;
      r.suspensionNotice = undefined;
    });
    this.setItem(STORAGE_KEYS.ROUTES, routes);

    const allTrips = this.getTrips();
    const resumed: TripRecord[] = [];
    const updatedAll = allTrips.map((t) => {
      const st = normalizeStatus(t.status);
      if (st === 'TAM_DUNG_THOI_TIET') {
        const restoreTo = t.previousStatusBeforeWeatherPause || 'CHO_SO_XU_LY';
        const next: TripRecord = {
          ...t,
          status: restoreTo,
          previousStatusBeforeWeatherPause: undefined,
          deptClock: this.resumeClock(t.deptClock, nowIso),
          statusLogs: [
            ...(t.statusLogs || []),
            {
              fromStatus: 'TAM_DUNG_THOI_TIET',
              toStatus: restoreTo,
              changedAt: nowIso,
              changedById: actor.id,
              changedByName: actor.fullName,
              reason: `Thời tiết an toàn — mở lại tuyến, khôi phục hồ sơ về ${restoreTo}.`,
            },
          ],
        };
        resumed.push(next);
        return next;
      }
      return t;
    });

    this.setItem(STORAGE_KEYS.TRIPS, updatedAll);
    this.addNotification({
      recipientUserId: 'ALL',
      title: 'THÔNG BÁO: TUYẾN ĐẢO LỚN – ĐẢO BÉ HOẠT ĐỘNG TRỞ LẠI',
      message: `${actor.fullName} đã mở lại tuyến, ${resumed.length} hồ sơ được khôi phục xử lý tiếp.`,
      type: 'SUCCESS',
      channel: 'IN_APP',
    });

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'MỞ_LẠI_TUYẾN_THỜI_TIẾT',
      targetType: 'WEATHER',
      details: `Mở lại tuyến và khôi phục ${resumed.length} hồ sơ từ TAM_DUNG_THOI_TIET.`,
    });

    this.emitUserMutation();
    return { success: true, resumedCount: resumed.length, trips: resumed };
  }

  public setRouteSuspension(
    suspend: boolean,
    reason?: string,
    resumedAt?: string,
    actor?: UserAccount
  ): void {
    const actingUser: UserAccount = actor || {
      id: 'USR-04',
      username: 'chuyenvien1',
      fullName: 'Nguyễn Phùng Nguyễn',
      role: 'OFFICER',
      phone: '',
      department: 'Phòng ATGT',
    };
    if (suspend) {
      this.suspendWaitingTripsByWeather(actingUser, reason || 'Biển động vượt ngưỡng an toàn', resumedAt);
    } else {
      this.resumeWeatherSuspension(actingUser);
    }
  }

  public returnTripToCaptainFromDept(
    tripId: string,
    actor: UserAccount,
    reason: string,
    phamVi: ReturnScope = 'bo_sung_chung_tu'
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (!['DA_CHAP_THUAN', 'CHO_SO_XU_LY', 'DA_DUYET', 'OFFICE_TRA_LAI', 'TAM_DUNG_THOI_TIET'].includes(st)) {
      return { success: false, error: 'Trạng thái hồ sơ không hợp lệ để Chuyên viên trả Chủ tàu.' };
    }
    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'Vui lòng nhập lý do trả Chủ tàu chi tiết (tối thiểu 5 ký tự).' };
    }

    const nowIso = new Date().toISOString();
    trip.status = 'TRA_CHU_TAU';
    trip.rejectReason = reason.trim();
    trip.rejectedByRole = actor.role;
    trip.rejectedByName = actor.fullName;
    trip.deptClock = this.pauseClock(trip.deptClock, 'TRA_CHU_TAU', nowIso);
    trip.lastReturnInfo = {
      benTra: 'CHUYEN_VIEN',
      benSai: 'CHU_TAU',
      nhomLoi: 'loi_ho_so',
      phamVi,
      lyDo: reason.trim(),
      thoiDiem: nowIso,
      traBoiId: actor.id,
      traBoiName: actor.fullName,
      nguoiTraId: actor.id,
      nguoiTraTen: actor.fullName,
    };
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'TRA_CHU_TAU',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `Chuyên viên Phòng ATGT xác định sai do Chủ tàu → Trả Chủ tàu (${phamVi}): ${reason.trim()}`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
      this.addNotification({
        recipientUserId: cid,
        title: `Phòng ATGT (Sở Xây dựng) trả hồ sơ ${saved.tripNumber}`,
        message: `Chuyên viên ${actor.fullName} xác định thiếu sót thuộc hồ sơ Chủ tàu: ${reason.trim()}. Sau khi sửa, hồ sơ sẽ gửi thẳng về Chuyên viên Sở.`,
        type: 'ALERT',
        channel: 'IN_APP',
        tripId: saved.id,
      });
    });

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'CHUYÊN_VIÊN_TRẢ_CHỦ_TÀU',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'TRA_CHU_TAU',
      details: `Xác định sai do Chủ tàu → Trả Chủ tàu (${saved.tripNumber}): ${reason.trim()}`,
    });

    return { success: true, trip: saved };
  }

  public returnTripToPortFromDept(
    tripId: string,
    actor: UserAccount,
    reason: string,
    phamVi: ReturnScope = 'bql_sai_kiem_tra_ben'
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (!['DA_CHAP_THUAN', 'CHO_SO_XU_LY', 'DA_DUYET', 'OFFICE_TRA_LAI', 'TAM_DUNG_THOI_TIET'].includes(st)) {
      return { success: false, error: 'Trạng thái hồ sơ không hợp lệ để trả BQL Cảng.' };
    }
    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'Vui lòng nhập lý do trả BQL Cảng chi tiết (tối thiểu 5 ký tự).' };
    }

    const nowIso = new Date().toISOString();
    trip.status = 'TRA_BQL_CANG';
    trip.rejectReason = reason.trim();
    trip.rejectedByRole = actor.role;
    trip.rejectedByName = actor.fullName;
    trip.deptClock = this.pauseClock(trip.deptClock, 'TRA_BQL_CANG', nowIso);
    trip.lastReturnInfo = {
      benTra: 'CHUYEN_VIEN',
      benSai: 'BQL_CANG',
      nhomLoi: 'loi_xu_ly',
      phamVi,
      lyDo: reason.trim(),
      thoiDiem: nowIso,
      traBoiId: actor.id,
      traBoiName: actor.fullName,
      nguoiTraId: actor.id,
      nguoiTraTen: actor.fullName,
    };
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'TRA_BQL_CANG',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `Chuyên viên Phòng ATGT xác định sai do BQL Cảng → Trả lại BQL Cảng (${phamVi}): ${reason.trim()}`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.notifyShiftOrPortUsers(
      'PORT_STAFF',
      saved.departurePortId,
      `Phòng ATGT trả hồ sơ ${saved.tripNumber} về BQL Cảng`,
      `Chuyên viên ${actor.fullName} xác định sai sót thuộc BQL Cảng: ${reason.trim()}`,
      'WARNING',
      saved.id
    );

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'CHUYÊN_VIÊN_TRẢ_BQL_CẢNG',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'TRA_BQL_CANG',
      details: `Xác định sai do BQL Cảng → Trả BQL Cảng (${saved.tripNumber}): ${reason.trim()}`,
    });

    return { success: true, trip: saved };
  }

  public approveDeptDraft(
    tripId: string,
    actor: UserAccount,
    now: Date = new Date()
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor, undefined, now);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (!['CHO_SO_XU_LY', 'OFFICE_TRA_LAI'].includes(st)) {
      return { success: false, error: 'Hồ sơ phải ở trạng thái Chờ Sở xử lý hoặc Office trả lại mới được duyệt dự thảo.' };
    }
    if (!trip.weatherCheckRecord) {
      return { success: false, error: 'Chuyên viên phải ghi nhận kết quả kiểm tra thời tiết trước khi duyệt dự thảo.' };
    }

    const vessel = this.getVesselById(trip.vesselId);
    const weather = this.getWeather();
    const rules = this.getRulesConfig();
    const evalOut = RulesEngine.evaluateAllRules(
      trip,
      vessel,
      trip.crewMembers || [],
      weather,
      this.getTrips(),
      rules,
      this.getDeNghiDungs(),
      { context: 'DEPT_APPROVE', now }
    );
    const results = evalOut.results;
    const r7 = results.find((r) => r.ruleCode === 'R7' && r.status === 'FAILED');
    if (r7) {
      return { success: false, error: r7.message };
    }

    const nowIso = now.toISOString();
    trip.status = 'DA_DUYET';
    trip.deptApprovedById = actor.id;
    trip.deptApprovedByName = actor.fullName;
    trip.deptApprovedAt = nowIso;
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'DA_DUYET',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: 'Chuyên viên kiểm tra chéo & thời tiết đạt — duyệt dự thảo Giấy phép để in/tải trình ký trên Office.',
      },
    ];
    const saved = this.saveTrip(trip);

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'CHUYÊN_VIÊN_DUYỆT_DỰ_THẢO',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'DA_DUYET',
      details: `Duyệt dự thảo hồ sơ ${saved.tripNumber} để trình Office.`,
    });
    return { success: true, trip: saved };
  }

  public markSubmittedToOffice(
    tripId: string,
    actor: UserAccount,
    officeDocRef?: string
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (!['DA_DUYET', 'OFFICE_TRA_LAI'].includes(st)) {
      return { success: false, error: 'Cần duyệt dự thảo trước khi đánh dấu Đã trình trên Office.' };
    }

    const nowIso = new Date().toISOString();
    trip.status = 'DANG_TRINH_OFFICE';
    trip.officeSubmissionRecord = {
      ...(trip.officeSubmissionRecord || { returns: [] }),
      submittedToOfficeAt: nowIso,
      submittedById: actor.id,
      submittedByName: actor.fullName,
      officeDocumentRef: officeDocRef?.trim() || trip.officeSubmissionRecord?.officeDocumentRef,
    };
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'DANG_TRINH_OFFICE',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `Đã trình hồ sơ trên phần mềm quản lý văn bản (Office)${
          officeDocRef ? ` — Mã văn bản: ${officeDocRef}` : ''
        }. Đồng hồ Sở vẫn đang tính giờ.`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'TRÌNH_HỒ_SƠ_OFFICE',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'DANG_TRINH_OFFICE',
      details: `Trình Giấy phép ${saved.tripNumber} lên phần mềm Office.`,
    });
    return { success: true, trip: saved };
  }

  public recordOfficeReturn(
    tripId: string,
    actor: UserAccount,
    params: {
      returnerRole: 'TRUONG_PHONG' | 'LANH_DAO_SO';
      nhomLoi: OfficeErrorGroup;
      reason: string;
    }
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (st !== 'DANG_TRINH_OFFICE') {
      return { success: false, error: 'Chỉ ghi nhận Office trả lại khi hồ sơ đang ở trạng thái Đang trình Office.' };
    }
    if (!params.reason || params.reason.trim().length < 5) {
      return { success: false, error: 'Vui lòng nhập lý do Office trả lại.' };
    }

    const nowIso = new Date().toISOString();
    const curRec = trip.officeSubmissionRecord || { returns: [] };
    curRec.returns = [
      ...(curRec.returns || []),
      {
        returnedAt: nowIso,
        returnerRole: params.returnerRole,
        nhomLoi: params.nhomLoi,
        reason: params.reason.trim(),
        recordedById: actor.id,
        recordedByName: actor.fullName,
      },
    ];
    trip.officeSubmissionRecord = curRec;
    trip.status = 'OFFICE_TRA_LAI';
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'OFFICE_TRA_LAI',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `Office trả lại (${params.returnerRole === 'TRUONG_PHONG' ? 'Trưởng phòng' : 'Lãnh đạo Sở'} — ${
          params.nhomLoi === 'loi_xu_ly' ? 'Lỗi xử lý' : 'Lỗi hồ sơ'
        }): ${params.reason.trim()}`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'GHI_NHẬN_OFFICE_TRẢ_LẠI',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'OFFICE_TRA_LAI',
      details: `Office trả lại (${params.nhomLoi}) cho ${saved.tripNumber}: ${params.reason.trim()}`,
    });
    return { success: true, trip: saved };
  }

  public publishOfficePermit(
    tripId: string,
    actor: UserAccount,
    params: {
      orderNumber: string;
      issuedAt: string;
      pdfUrl: string;
      pdfName: string;
      serverPath?: string;
      signerName?: string;
    },
    now: Date = new Date()
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor, undefined, now);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const st = normalizeStatus(trip.status);
    if (!['DANG_TRINH_OFFICE', 'DA_DUYET'].includes(st)) {
      return { success: false, error: 'Hồ sơ phải ở trạng thái Đang trình Office (hoặc Đã duyệt dự thảo) mới được tải Giấy phép.' };
    }
    if (!params.orderNumber?.trim() || !params.issuedAt?.trim() || !params.pdfUrl?.trim()) {
      return { success: false, error: 'Bắt buộc nhập Số Giấy phép, Ngày giờ phát hành trên Office và tải tệp PDF đã ký/đóng dấu.' };
    }

    const issuedMs = new Date(params.issuedAt).getTime();
    if (isNaN(issuedMs)) {
      return { success: false, error: 'Thời điểm phát hành trên Office không hợp lệ.' };
    }

    const nowIso = now.toISOString();
    const orderNumber = params.orderNumber.trim();
    const verificationCode = trip.verificationCode || `VR-SB-2026-${trip.tripNumber.slice(-4)}`;
    const qrPayloadUrl = `/#/xac-thuc-lenh/${encodeURIComponent(orderNumber)}`;

    trip.orderNumber = orderNumber;
    trip.verificationCode = verificationCode;
    trip.qrPayloadUrl = qrPayloadUrl;
    trip.issuedAt = new Date(issuedMs).toISOString();
    trip.orderValidUntil = new Date(issuedMs + 24 * 60 * 60 * 1000).toISOString();
    trip.issuedPdfUrl = params.pdfUrl;
    trip.issuedPdfName = params.pdfName;
    trip.issuedPdfServerPath = params.serverPath;
    trip.sealedAt = nowIso;
    trip.sealedByName = actor.fullName;
    const signerCfg = this.getPermitSignerConfig();
    trip.approvedByName =
      params.signerName?.trim() ||
      (trip.approvedByName &&
      trip.approvedByName !== 'Phạm Minh Đức' &&
      trip.approvedByName !== 'Lãnh đạo Sở Xây dựng'
        ? trip.approvedByName
        : signerCfg.name);
    trip.approvedByTitle = signerCfg.fullTitle;
    trip.isPermitSuspended = false;
    trip.deptClock = this.completeClock(trip.deptClock, nowIso);
    trip.officeSubmissionRecord = {
      ...(trip.officeSubmissionRecord || { returns: [] }),
      officeApprovedAt: trip.issuedAt,
      uploadedToSystemAt: nowIso,
      uploadedById: actor.id,
      uploadedByName: actor.fullName,
    };
    trip.status = 'DA_CAP_PHEP';
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'DA_CAP_PHEP',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `Chuyên viên tải Giấy phép PDF đã ký số từ Office (Số GP: ${orderNumber}, phát hành ${trip.issuedAt}). Có hiệu lực 24 giờ.`,
      },
    ];

    const saved = this.saveTrip(trip);

    this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
      this.addNotification({
        recipientUserId: cid,
        title: `Đã cấp Giấy phép rời cảng số ${orderNumber}`,
        message: `Tàu ${saved.vesselName} đã có Giấy phép rời cảng (${params.pdfName}). Vui lòng đến bến để Biên phòng kiểm soát cuối cùng trước khi xuất bến.`,
        type: 'SUCCESS',
        channel: 'IN_APP',
        tripId: saved.id,
      });
    });

    this.notifyShiftOrPortUsers(
      'PORT_STAFF',
      saved.departurePortId,
      `Giấy phép mới: ${orderNumber} (${saved.vesselName})`,
      `Sở Xây dựng đã phát hành Giấy phép ${orderNumber} cho tàu ${saved.vesselName}.`,
      'SUCCESS',
      saved.id
    );

    this.notifyShiftOrPortUsers(
      'BP_TRUC',
      saved.departurePortId,
      `Tàu chờ kiểm soát xuất bến: ${saved.vesselName} (${orderNumber})`,
      `Đã có Giấy phép rời cảng số ${orderNumber} tuyến ${saved.routeName}. Mời Biên phòng tại ${saved.departurePortName} thực hiện kiểm soát cuối cùng.`,
      'INFO',
      saved.id
    );

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'TẢI_GIẤY_PHÉP_OFFICE',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'DA_CAP_PHEP',
      details: `Tải Giấy phép ${orderNumber} (${params.pdfName}) lên hệ thống cho hồ sơ ${saved.tripNumber}.`,
    });

    return { success: true, trip: saved };
  }

  public revokePermit(
    tripId: string,
    actor: UserAccount,
    reason: string
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    if (!['OFFICER', 'ADMIN', 'DEPT_HEAD'].includes(actor.role)) {
      return { success: false, error: 'Bạn không có quyền thu hồi Giấy phép.' };
    }
    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'Vui lòng nhập lý do thu hồi Giấy phép.' };
    }

    const st = normalizeStatus(trip.status);
    if (!['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG'].includes(st)) {
      return { success: false, error: 'Chỉ được thu hồi Giấy phép khi đang ở trạng thái Đã cấp phép hoặc Tạm giữ Biên phòng.' };
    }

    const nowIso = new Date().toISOString();
    trip.status = 'THU_HOI';
    trip.isPermitSuspended = false;
    trip.rejectReason = reason.trim();
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: st,
        toStatus: 'THU_HOI',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        reason: `Thu hồi Giấy phép số ${trip.orderNumber || trip.tripNumber}: ${reason.trim()}`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
      this.addNotification({
        recipientUserId: cid,
        title: `THU HỒI GIẤY PHÉP SỐ ${saved.orderNumber || saved.tripNumber}`,
        message: `Giấy phép rời cảng đã bị thu hồi: ${reason.trim()}`,
        type: 'ALERT',
        channel: 'IN_APP',
        tripId: saved.id,
      });
    });

    this.notifyShiftOrPortUsers(
      'BP_TRUC',
      saved.departurePortId,
      `Đã THU HỒI Giấy phép ${saved.orderNumber}`,
      `Giấy phép tàu ${saved.vesselName} đã bị thu hồi. Không cho xuất bến.`,
      'ALERT',
      saved.id
    );

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'THU_HỒI_GIẤY_PHÉP',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'THU_HOI',
      details: `Thu hồi GP ${saved.orderNumber}: ${reason.trim()}`,
    });
    return { success: true, trip: saved };
  }

  public checkAndExpirePermitIf24h(trip: TripRecord, now: Date = new Date()): TripRecord {
    const st = normalizeStatus(trip.status);
    if (!['DA_CAP_PHEP', 'TAM_GIU_BIEN_PHONG'].includes(st)) return trip;
    const refIso = trip.issuedAt || trip.sealedAt;
    if (!refIso && !trip.orderValidUntil) return trip;

    const expiredAtMs = trip.orderValidUntil
      ? new Date(trip.orderValidUntil).getTime()
      : new Date(refIso!).getTime() + 24 * 60 * 60 * 1000;
    if (isNaN(expiredAtMs) || now.getTime() <= expiredAtMs) return trip;

    const nowIso = now.toISOString();
    const updated: TripRecord = {
      ...trip,
      status: 'HET_HIEU_LUC',
      isPermitSuspended: false,
      statusLogs: [
        ...(trip.statusLogs || []),
        {
          fromStatus: st,
          toStatus: 'HET_HIEU_LUC',
          changedAt: nowIso,
          changedById: 'SYSTEM',
          changedByName: 'Hệ thống kiểm tra R8',
          reason: 'Giấy phép rời cảng đã quá 24 giờ kể từ thời điểm cấp phép nhưng tàu chưa xuất bến (R8).',
        },
      ],
    };
    const saved = this.saveTrip(updated);
    this.addAuditLog({
      userId: 'SYSTEM',
      userName: 'Hệ thống R8',
      userRole: 'ADMIN',
      action: 'HẾT_HIỆU_LỰC_24H_R8',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: st,
      afterValue: 'HET_HIEU_LUC',
      details: `Giấy phép ${saved.orderNumber || saved.tripNumber} tự động chuyển HET_HIEU_LUC (R8).`,
    });
    return saved;
  }

  public sweepExpiredPermits(now: Date = new Date()): number {
    let count = 0;
    this.getTrips().forEach((t) => {
      const next = this.checkAndExpirePermitIf24h(t, now);
      if (next.status === 'HET_HIEU_LUC' && t.status !== 'HET_HIEU_LUC') count++;
    });
    return count;
  }

  // =================== BIÊN PHÒNG: KIỂM SOÁT CUỐI CÙNG & CẬP BẾN ===================

  public submitBpDepartureControl(
    tripId: string,
    actor: UserAccount,
    control: Omit<BpDepartureControlRecord, 'checkedAt' | 'checkedById' | 'checkedByName' | 'shiftId'>,
    now: Date = new Date()
  ): { success: boolean; trip?: TripRecord; ruleResults?: RuleCheckResult[]; error?: string } {
    if (!['BP_TRUC', 'BP_CHIHUY', 'ADMIN'].includes(actor.role)) {
      return { success: false, error: 'Chỉ cán bộ hoặc chỉ huy Biên phòng mới được thực hiện kiểm soát xuất bến.' };
    }

    let trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const shiftCheck = this.validateShiftAndPortForAction(actor, trip.departurePortId, now);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    trip = this.checkAndExpirePermitIf24h(trip, now);
    const st = normalizeStatus(trip.status);
    if (st === 'HET_HIEU_LUC') {
      return {
        success: false,
        trip,
        error: '[R8] Giấy phép rời cảng đã quá 24 giờ và hết hiệu lực. Chủ tàu phải nộp hồ sơ xin cấp lại.',
      };
    }
    if (st !== 'DA_CAP_PHEP') {
      return {
        success: false,
        error: 'Biên phòng chỉ kiểm soát xuất bến đối với hồ sơ ĐÃ CÓ GIẤY PHÉP RỜI CẢNG (DA_CAP_PHEP).',
      };
    }

    const nowIso = now.toISOString();
    const vessel = this.getVesselById(trip.vesselId);
    const weather = this.getWeather();
    const rules = this.getRulesConfig();

    const onboardCrewCount = control.checklist.filter(
      (i) => i.personType === 'CREW' && (i.isOnboard || i.boarded)
    ).length;
    const onboardPaxCount = control.checklist.filter(
      (i) => i.personType === 'PASSENGER' && (i.isOnboard || i.boarded)
    ).length;
    const unlistedCount = control.unlistedPeople?.length || 0;
    const onboardCount = onboardCrewCount + onboardPaxCount + unlistedCount;
    const listedCount = control.checklist.length;
    const absentCount = Math.max(0, listedCount - (onboardCrewCount + onboardPaxCount));

    const fullControl: BpDepartureControlRecord = {
      ...control,
      scheduledTotalPeople: control.scheduledTotalPeople ?? listedCount,
      actualTotalPeople: onboardCount,
      actualCrewCount: onboardCrewCount,
      actualPassengerCount: onboardPaxCount,
      absentCount,
      checkedAt: nowIso,
      controlledAt: control.controlledAt || nowIso,
      checkedById: actor.id,
      controllerId: actor.id,
      checkedByName: actor.fullName,
      controllerName: actor.fullName,
      inspectorName: actor.fullName,
      shiftId: shiftCheck.shift?.id,
      shiftName: shiftCheck.shift?.shiftName,
    };

    const evalOut = RulesEngine.evaluateDepartureControlRules(
      trip,
      vessel,
      weather,
      fullControl,
      rules,
      this.getDeNghiDungs(),
      now
    );
    const ruleResults = evalOut.results;

    this.setItem(STORAGE_KEYS.BP_KIEM_SOAT, [
      {
        id: `KS-${Date.now()}`,
        hoSoId: trip.id,
        soNguoiThucTe: onboardCount,
        soNguoiTheoDanhSach: listedCount,
        ketQua:
          onboardCount === listedCount && unlistedCount === 0 && !control.crewChanged
            ? 'khop'
            : 'chenh_lech',
        ghiChu:
          control.anomalyDescription ||
          (control.crewChanged
            ? `Đổi thuyền viên: ${control.crewChangeNote || 'Yêu cầu Chủ tàu điều chỉnh'}`
            : `Kiểm soát cuối cùng bởi ${actor.fullName} (Thực tế ${onboardCount}/${listedCount} người)`),
        nguoiKiemSoat: actor.fullName,
        nguoiKiemSoatId: actor.id,
        thoiDiem: nowIso,
      },
      ...this.getKiemSoatList(),
    ]);

    // 1. Có bất thường (buôn lậu, hàng cấm, truy nã, giấy tờ giả, ANTT) -> TAM_GIU_BIEN_PHONG + QR tự chuyển "Tạm đình chỉ"
    if (control.action === 'TAM_GIU_BIEN_PHONG' || control.hasAnomaly) {
      if (!control.anomalyDescription || control.anomalyDescription.trim().length < 5) {
        return { success: false, error: 'Vui lòng mô tả chi tiết bất thường khi lập Tạm giữ / Đình chỉ xuất bến.' };
      }
      trip.bpDepartureControl = {
        ...fullControl,
        action: 'TAM_GIU_BIEN_PHONG',
        decision: 'TAM_GIU_BIEN_PHONG',
      };
      trip.status = 'TAM_GIU_BIEN_PHONG';
      trip.isPermitSuspended = true;
      trip.previousStatusBeforeBpStop = 'DA_CAP_PHEP';
      trip.statusLogs = [
        ...(trip.statusLogs || []),
        {
          fromStatus: 'DA_CAP_PHEP',
          toStatus: 'TAM_GIU_BIEN_PHONG',
          changedAt: nowIso,
          changedById: actor.id,
          changedByName: actor.fullName,
          milestone: 'BP_DE_NGHI_DUNG',
          reason: `Biên phòng TẠM GIỮ xuất bến — Giấy phép chuyển "Tạm đình chỉ" (${control.soBienBanNgoai || 'Không số biên bản'}): ${control.anomalyDescription.trim()}`,
        },
      ];
      const saved = this.saveTrip(trip);

      const dnRecord: DeNghiDung = {
        id: `DN-${Date.now()}`,
        hoSoId: saved.id,
        loai: 'dinh_chi_lenh',
        maLyDo: control.anomalyCategory || 'an_ninh_trat_tu',
        moTa: `${control.anomalyDescription.trim()}${control.soBienBanNgoai ? ` (Biên bản: ${control.soBienBanNgoai})` : ''}`,
        soBienBanNgoai: control.soBienBanNgoai,
        anh: control.anomalyPhotos || [],
        nguoiDeNghi: actor.fullName,
        nguoiDeNghiId: actor.id,
        thoiDiem: nowIso,
        trangThai: 'dang_hieu_luc',
      };
      this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, [dnRecord, ...this.getDeNghiDungs()]);

      this.addNotification({
        recipientUserId: 'ROLE:OFFICER',
        title: `🚨 BIÊN PHÒNG TẠM GIỮ TÀU: ${saved.vesselName}`,
        message: `${actor.fullName} đã tạm giữ tàu & chuyển QR Giấy phép ${saved.orderNumber} sang "Tạm đình chỉ". Lý do: ${control.anomalyDescription.trim()}. Nếu Biên phòng không gỡ được, Chuyên viên thực hiện Thu hồi Giấy phép.`,
        type: 'ALERT',
        channel: 'IN_APP',
        tripId: saved.id,
      });
      this.addNotification({
        recipientUserId: 'ROLE:DEPT_HEAD',
        title: `🚨 BIÊN PHÒNG TẠM GIỮ TÀU: ${saved.vesselName}`,
        message: `Đình chỉ xuất bến đối với GP ${saved.orderNumber}: ${control.anomalyDescription.trim()}`,
        type: 'ALERT',
        channel: 'IN_APP',
        tripId: saved.id,
      });
      this.notifyShiftOrPortUsers(
        'PORT_STAFF',
        saved.departurePortId,
        `Biên phòng tạm giữ tàu ${saved.vesselName}`,
        `Hồ sơ ${saved.tripNumber} tạm dừng xuất bến (QR: Tạm đình chỉ): ${control.anomalyDescription.trim()}`,
        'ALERT',
        saved.id
      );

      this.addAuditLog({
        userId: actor.id,
        userName: actor.fullName,
        userRole: actor.role,
        action: 'BP_TAM_GIU_XUAT_BEN',
        targetId: saved.id,
        targetType: 'TRIP',
        beforeValue: 'DA_CAP_PHEP',
        afterValue: 'TAM_GIU_BIEN_PHONG',
        details: `Biên phòng tạm giữ tàu ${saved.vesselName}, QR GP ${saved.orderNumber} chuyển Tạm đình chỉ.`,
      });
      return { success: true, trip: saved, ruleResults };
    }

    // 2. Vi phạm R12 (người ngoài danh sách, vượt quân số hoặc đổi thuyền viên) -> Trả Chủ tàu điều chỉnh
    // Luồng sau đó: Chủ tàu điều chỉnh -> BQL Cảng kiểm tra lại (sức chở, áo phao) -> Sở cấp lại GP -> Biên phòng kiểm soát lại
    const r12Violation = ruleResults.find((r) => r.ruleCode === 'R12' && r.status === 'FAILED');
    if (control.action === 'TRA_CHU_TAU_R12' || r12Violation || control.crewChanged) {
      const r12Reason =
        r12Violation?.message ||
        (control.crewChanged
          ? `Phát hiện đổi thuyền viên so với danh sách đã cấp phép${control.crewChangeNote ? `: ${control.crewChangeNote.trim()}` : ''} — yêu cầu Chủ tàu điều chỉnh.`
          : 'Phát hiện người ngoài danh sách / đổi thuyền viên (R12) — yêu cầu Chủ tàu điều chỉnh.');
      trip.bpDepartureControl = {
        ...fullControl,
        action: 'TRA_CHU_TAU_R12',
        decision: 'TRA_HO_SO_R12',
      };
      trip.status = 'TRA_CHU_TAU';
      trip.isPermitSuspended = true;
      if (trip.orderNumber) {
        trip.supersededOrderNumbers = Array.from(
          new Set([...(trip.supersededOrderNumbers || []), trip.orderNumber])
        );
      }
      trip.lastReturnInfo = {
        benTra: 'BIEN_PHONG',
        phamVi: control.crewChanged ? 'THAY_DOI_THUYEN_VIEN_CHO' : 'SUA_DANH_SACH_NGUOI',
        lyDo: r12Reason,
        thoiDiem: nowIso,
        nguoiTraId: actor.id,
        nguoiTraTen: actor.fullName,
        traBoiId: actor.id,
        traBoiName: actor.fullName,
      };
      trip.statusLogs = [
        ...(trip.statusLogs || []),
        {
          fromStatus: 'DA_CAP_PHEP',
          toStatus: 'TRA_CHU_TAU',
          changedAt: nowIso,
          changedById: actor.id,
          changedByName: actor.fullName,
          milestone: 'BP_TRA_R12',
          reason: `[R12] Biên phòng trả Chủ tàu điều chỉnh: ${r12Reason}. Sau khi chỉnh sửa: BQL Cảng kiểm tra lại (sức chở, áo phao) → Sở cấp lại Giấy phép → Biên phòng kiểm soát lại.`,
        },
      ];
      const saved = this.saveTrip(trip);

      this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
        this.addNotification({
          recipientUserId: cid,
          title: `Biên phòng trả hồ sơ điều chỉnh (R12): ${saved.tripNumber}`,
          message: `${r12Reason}. Giấy phép cũ đã bị hủy hiệu lực; sau khi điều chỉnh, Ban Quản lý cảng kiểm tra lại (sức chở, áo phao) → Sở cấp lại Giấy phép → Biên phòng kiểm soát lại.`,
          type: 'ALERT',
          channel: 'IN_APP',
          tripId: saved.id,
        });
      });

      this.addNotification({
        recipientUserId: 'ROLE:OFFICER',
        title: `Cảnh báo R12: GP ${saved.orderNumber} bị hủy do lệch danh sách / đổi thuyền viên`,
        message: `Biên phòng đã trả hồ sơ tàu ${saved.vesselName} về Chủ tàu điều chỉnh để BQL Cảng kiểm tra lại và Sở cấp lại Giấy phép.`,
        type: 'WARNING',
        channel: 'IN_APP',
        tripId: saved.id,
      });

      this.addAuditLog({
        userId: actor.id,
        userName: actor.fullName,
        userRole: actor.role,
        action: 'BP_TRA_CHU_TAU_R12',
        targetId: saved.id,
        targetType: 'TRIP',
        beforeValue: 'DA_CAP_PHEP',
        afterValue: 'TRA_CHU_TAU',
        details: `Trả Chủ tàu điều chỉnh do R12 (${saved.tripNumber}): ${r12Reason}`,
      });
      return { success: true, trip: saved, ruleResults };
    }

    // 3. Kiểm tra điều kiện Giấy phép hợp lệ (quét QR: có GP, đúng tàu, còn hạn 24h) & đã ghi nhận người trên tàu
    const qrCheckFailed =
      !control.qrVerified ||
      !trip.orderNumber ||
      (control.permitQrChecks &&
        (!control.permitQrChecks.hasPermit ||
          !control.permitQrChecks.matchesVessel ||
          !control.permitQrChecks.within24h));

    if (qrCheckFailed) {
      return {
        success: false,
        ruleResults,
        error:
          'Giấy phép chưa được quét QR xác thực hợp lệ (thiếu Giấy phép, sai phương tiện hoặc quá hạn 24 giờ) — Không cho xuất bến. Chủ tàu phải làm lại thủ tục.',
      };
    }

    if (listedCount > 0 && onboardCount <= 0) {
      return {
        success: false,
        ruleResults,
        error:
          'Chưa tích có mặt người lên tàu. Vui lòng điểm danh hoặc quét CCCD để hệ thống ghi nhận số người thực tế phục vụ tìm kiếm cứu nạn.',
      };
    }

    // 4. Đạt cả 3 nội dung (nếu chỉ có người vắng mặt vẫn cho xuất bến & ghi số thực tế phục vụ TKCN)
    const blockers = ruleResults.filter((r) => r.status === 'FAILED' && r.severity === 'BLOCKING');
    if (blockers.length > 0) {
      return {
        success: false,
        ruleResults,
        error: blockers.map((b) => `[${b.ruleCode}] ${b.message}`).join(' | '),
      };
    }

    trip.bpDepartureControl = {
      ...fullControl,
      action: 'CHO_XUAT_BEN',
      decision: 'CHO_XUAT_BEN',
    };
    trip.status = 'DA_XUAT_BEN';
    trip.actualDepartureTime = nowIso;
    trip.isPermitSuspended = false;
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: 'DA_CAP_PHEP',
        toStatus: 'DA_XUAT_BEN',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        milestone: 'BP_CHO_XUAT_BEN',
        reason: `Biên phòng hoàn tất kiểm tra 3 nội dung — CHO XUẤT BẾN lúc ${now.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        })}, ghi nhận thực tế ${onboardCount}/${listedCount} người (${onboardCrewCount} TV, ${onboardPaxCount} HK${
          absentCount > 0 ? `, vắng mặt ${absentCount}` : ''
        }) phục vụ TKCN.`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
      this.addNotification({
        recipientUserId: cid,
        title: `Biên phòng đã cho xuất bến: ${saved.vesselName}`,
        message: `Chúc chuyến đi an toàn tuyến ${saved.routeName}. Ghi nhận thực tế ${onboardCount} người trên tàu (${onboardCrewCount} TV, ${onboardPaxCount} HK).`,
        type: 'SUCCESS',
        channel: 'IN_APP',
        tripId: saved.id,
      });
    });

    this.notifyShiftOrPortUsers(
      'BP_TRUC',
      saved.arrivalPortId,
      `Tàu sắp đến: ${saved.vesselName} đã rời ${saved.departurePortName}`,
      `Giấy phép ${saved.orderNumber}, thực tế ${onboardCount} người trên tàu (${onboardCrewCount} TV, ${onboardPaxCount} HK). Đón và xác nhận cập bến khi tàu vào ${saved.arrivalPortName}.`,
      'INFO',
      saved.id
    );

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'BP_CHO_XUAT_BEN',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: 'DA_CAP_PHEP',
      afterValue: 'DA_XUAT_BEN',
      details: `Biên phòng cho xuất bến tàu ${saved.vesselName} (${saved.orderNumber}), thực tế ${onboardCount}/${listedCount} người (${onboardCrewCount} TV, ${onboardPaxCount} HK).`,
    });

    return { success: true, trip: saved, ruleResults };
  }

  public liftBpHold(
    tripId: string,
    actor: UserAccount,
    ketQuaXacMinh: string,
    now: Date = new Date()
  ): { success: boolean; trip?: TripRecord; error?: string } {
    const activeDn = this.getActiveDeNghiDungForTrip(tripId);
    if (activeDn) {
      const res = this.liftBpStop({ deNghiId: activeDn.id, ketQuaXacMinh, actor });
      if (!res.success) return { success: false, error: res.error };
      return { success: true, trip: res.trip };
    }

    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };
    if (normalizeStatus(trip.status) !== 'TAM_GIU_BIEN_PHONG') {
      return { success: false, error: 'Hồ sơ không đang ở trạng thái Tạm giữ Biên phòng.' };
    }
    if (actor.role !== 'BP_CHIHUY' && actor.role !== 'ADMIN' && trip.bpDepartureControl?.checkedById !== actor.id) {
      return { success: false, error: 'Chỉ người lập tạm giữ hoặc Chỉ huy Đồn mới được gỡ tạm giữ.' };
    }

    const nowIso = now.toISOString();
    trip.isPermitSuspended = false;
    trip.status = 'DA_CAP_PHEP';
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: 'TAM_GIU_BIEN_PHONG',
        toStatus: 'DA_CAP_PHEP',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        milestone: 'BP_GO_DE_NGHI',
        reason: `Gỡ tạm giữ Biên phòng: ${ketQuaXacMinh.trim()}`,
      },
    ];
    let saved = this.saveTrip(trip);
    saved = this.checkAndExpirePermitIf24h(saved, now);

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'BP_GỠ_TẠM_GIỮ',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: 'TAM_GIU_BIEN_PHONG',
      afterValue: saved.status,
      details: `Gỡ tạm giữ tàu ${saved.vesselName}: ${ketQuaXacMinh.trim()}`,
    });

    return { success: true, trip: saved };
  }

  public confirmVesselArrival(
    tripId: string,
    actor: UserAccount,
    note?: string,
    now: Date = new Date()
  ): { success: boolean; trip?: TripRecord; error?: string } {
    if (!['BP_TRUC', 'BP_CHIHUY', 'PORT_STAFF', 'ADMIN'].includes(actor.role)) {
      return { success: false, error: 'Chỉ Biên phòng bến đến hoặc BQL Cảng dự phòng mới được xác nhận cập bến.' };
    }

    const trip = this.getTripById(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const st = normalizeStatus(trip.status);
    if (st !== 'DA_XUAT_BEN') {
      return { success: false, error: 'Chỉ xác nhận cập bến cho tàu đang ở trạng thái Đã xuất bến.' };
    }

    // Kiểm tra đúng bến ĐẾN (nhận tàu) và ca trực
    const shiftCheck = this.validateShiftAndPortForAction(actor, trip.arrivalPortId, now);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const nowIso = now.toISOString();
    trip.status = 'DA_CAP_BEN';
    trip.actualArrivalTime = nowIso;
    trip.arrivingConfirmation = {
      confirmedAt: nowIso,
      confirmedById: actor.id,
      confirmedByName: actor.fullName,
      confirmedByRole: actor.role,
      portId: trip.arrivalPortId as PortId,
      portName: trip.arrivalPortName,
      note: note?.trim(),
    };
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: 'DA_XUAT_BEN',
        toStatus: 'DA_CAP_BEN',
        changedAt: nowIso,
        changedById: actor.id,
        changedByName: actor.fullName,
        milestone: 'BP_KIEM_SOAT',
        reason: `${
          actor.role === 'PORT_STAFF' ? 'BQL Cảng bến đến (dự phòng)' : 'Biên phòng bến đến'
        } xác nhận tàu đã cập ${trip.arrivalPortName} an toàn.`,
      },
    ];
    const saved = this.saveTrip(trip);

    this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
      this.addNotification({
        recipientUserId: cid,
        title: `Xác nhận đã cập bến: ${saved.vesselName}`,
        message: `Chuyến ${saved.tripNumber} đã hoàn thành hành trình tại ${saved.arrivalPortName}.`,
        type: 'SUCCESS',
        channel: 'IN_APP',
        tripId: saved.id,
      });
    });

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: actor.role === 'PORT_STAFF' ? 'BQL_XÁC_NHẬN_CẬP_BẾN_DỰ_PHÒNG' : 'BP_XÁC_NHẬN_CẬP_BẾN',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: 'DA_XUAT_BEN',
      afterValue: 'DA_CAP_BEN',
      details: `${actor.fullName} xác nhận tàu ${saved.vesselName} cập ${saved.arrivalPortName}.`,
    });

    return { success: true, trip: saved };
  }

  public verifyPermitByCode(
    codeOrUrl: string,
    now: Date = new Date()
  ): {
    outcome: QrVerifyOutcomeCode;
    label: string;
    isValid: boolean;
    trip?: TripRecord;
    reasonDetail: string;
  } {
    const clean = decodeURIComponent(codeOrUrl || '')
      .replace(/^.*\/xac-thuc-lenh\//, '')
      .trim();
    if (!clean) {
      return {
        outcome: 'KHONG_TON_TAI',
        label: 'Không tồn tại',
        isValid: false,
        reasonDetail: 'Không có mã Giấy phép hoặc mã tra cứu.',
      };
    }

    const trips = this.getTrips();
    // Kiểm tra xem mã có nằm trong danh sách số Giấy phép cũ đã bị thu hồi/thay thế bởi R12 hay không
    const supersededOwner = trips.find((t) =>
      (t.supersededOrderNumbers || []).some((old) => old.toLowerCase() === clean.toLowerCase())
    );
    if (supersededOwner) {
      return {
        outcome: 'DA_THU_HOI',
        label: 'Đã thu hồi',
        isValid: false,
        trip: supersededOwner,
        reasonDetail: `Giấy phép số ${clean} đã bị thu hồi/hủy hiệu lực do cấp lại hồ sơ (R12).`,
      };
    }

    let found = trips.find(
      (t) =>
        (t.orderNumber && t.orderNumber.toLowerCase() === clean.toLowerCase()) ||
        (t.verificationCode && t.verificationCode.toLowerCase() === clean.toLowerCase()) ||
        t.tripNumber.toLowerCase() === clean.toLowerCase() ||
        t.id.toLowerCase() === clean.toLowerCase()
    );

    if (!found) {
      return {
        outcome: 'KHONG_TON_TAI',
        label: 'Không tồn tại',
        isValid: false,
        reasonDetail: `Không tìm thấy Giấy phép tương ứng với mã "${clean}".`,
      };
    }

    found = this.checkAndExpirePermitIf24h(found, now);
    const st = normalizeStatus(found.status);

    if (st === 'THU_HOI') {
      return {
        outcome: 'DA_THU_HOI',
        label: 'Đã thu hồi',
        isValid: false,
        trip: found,
        reasonDetail: found.rejectReason || 'Giấy phép đã bị Sở Xây dựng thu hồi.',
      };
    }
    if (st === 'TAM_GIU_BIEN_PHONG' || found.isPermitSuspended) {
      return {
        outcome: 'TAM_DINH_CHI',
        label: 'Tạm đình chỉ',
        isValid: false,
        trip: found,
        reasonDetail: 'Giấy phép đang bị Biên phòng tạm giữ / đình chỉ xuất bến.',
      };
    }
    if (st === 'HET_HIEU_LUC') {
      return {
        outcome: 'HET_HIEU_LUC',
        label: 'Hết hiệu lực',
        isValid: false,
        trip: found,
        reasonDetail: 'Giấy phép đã quá thời hạn hiệu lực 24 giờ kể từ lúc phát hành (R8).',
      };
    }
    if (st === 'DA_XUAT_BEN' || st === 'DA_CAP_BEN') {
      return {
        outcome: 'DA_XUAT_BEN',
        label: 'Đã xuất bến',
        isValid: false,
        trip: found,
        reasonDetail:
          st === 'DA_CAP_BEN'
            ? 'Tàu đã xuất bến và đã cập bến an toàn.'
            : 'Giấy phép đã sử dụng cho lượt xuất bến này.',
      };
    }
    if (st === 'DA_CAP_PHEP') {
      return {
        outcome: 'HOP_LE',
        label: 'Hợp lệ',
        isValid: true,
        trip: found,
        reasonDetail: `Giấy phép rời cảng số ${found.orderNumber} đang còn hiệu lực.`,
      };
    }

    return {
      outcome: 'KHONG_TON_TAI',
      label: 'Không tồn tại',
      isValid: false,
      trip: found,
      reasonDetail: 'Hồ sơ này chưa được phát hành Giấy phép rời cảng chính thức.',
    };
  }

  private notifyShiftOrPortUsers(
    role: UserRole,
    portId: string | undefined,
    title: string,
    message: string,
    type: SystemNotification['type'],
    tripId?: string
  ): void {
    const users = this.getAllUsers().filter((u) => {
      if (u.status === 'LOCKED') return false;
      if (role === 'BP_TRUC') {
        if (u.role !== 'BP_TRUC' && u.role !== 'BP_CHIHUY') return false;
      } else if (u.role !== role) {
        return false;
      }
      if (portId && getUserAssignedPortId(u) && getUserAssignedPortId(u) !== portId) {
        return false;
      }
      return true;
    });

    if (users.length > 0) {
      users.forEach((u) => {
        this.addNotification({
          recipientUserId: u.id,
          title,
          message,
          type,
          channel: 'IN_APP',
          tripId,
        });
      });
    } else {
      this.addNotification({
        recipientUserId: role === 'BP_TRUC' ? 'ROLE:BP_ALL' : `ROLE:${role}`,
        title,
        message,
        type,
        channel: 'IN_APP',
        tripId,
      });
    }
  }

  // =================== VESSELS & CREW & PORTS ===================
  public getVessels(): Vessel[] {
    return this.getItem<Vessel[]>(STORAGE_KEYS.VESSELS, []);
  }
  public getVesselById(id: string): Vessel | undefined {
    return this.getVessels().find((v) => v.id === id);
  }
  public saveVessel(vessel: Vessel): void {
    const list = this.getVessels();
    const idx = list.findIndex((v) => v.id === vessel.id);
    if (idx >= 0) list[idx] = vessel;
    else list.push(vessel);
    this.setItem(STORAGE_KEYS.VESSELS, list);
    this.emitUserMutation();
  }
  public deleteVessel(vesselId: string): void {
    this.setItem(STORAGE_KEYS.VESSELS, this.getVessels().filter((v) => v.id !== vesselId));
    const crew = this.getCrew();
    let crewChanged = false;
    const updatedCrew = crew.map((c) => {
      if (c.assignedVesselId === vesselId) {
        crewChanged = true;
        return { ...c, assignedVesselId: undefined };
      }
      return c;
    });
    if (crewChanged) this.setItem(STORAGE_KEYS.CREW, updatedCrew);
    this.emitUserMutation();
  }

  public getCrew(): CrewMember[] {
    return this.getItem<CrewMember[]>(STORAGE_KEYS.CREW, []);
  }
  public getCrewById(id: string): CrewMember | undefined {
    return this.getCrew().find((c) => c.id === id);
  }
  public saveCrew(crew: CrewMember): void {
    const list = this.getCrew();
    const idx = list.findIndex((c) => c.id === crew.id);
    if (idx >= 0) list[idx] = crew;
    else list.push(crew);
    this.setItem(STORAGE_KEYS.CREW, list);
    this.emitUserMutation();
  }
  public deleteCrew(crewId: string): void {
    this.setItem(
      STORAGE_KEYS.CREW,
      this.getCrew().filter((c) => c.id !== crewId)
    );
    this.emitUserMutation();
  }
  public syncCaptainsFromVessels(actor?: UserAccount): { removedCount: number; addedCount: number } {
    const vessels = this.getVessels();
    const currentCrew = this.getCrew();
    const isCaptainEntry = (c: CrewMember) =>
      c.position === 'CAPTAIN' ||
      (c.positionTitle || '').toLowerCase().includes('thuyền trưởng');
    const removedCount = currentCrew.filter(isCaptainEntry).length;
    const nonCaptainCrew = currentCrew.filter((c) => !isCaptainEntry(c));
    const rebuiltCaptains = buildCaptainsFromVessels(vessels);
    this.setItem(STORAGE_KEYS.CREW, [...rebuiltCaptains, ...nonCaptainCrew]);
    try {
      localStorage.setItem(STORAGE_KEYS.CAPTAIN_CATALOG_VERSION, CAPTAIN_CATALOG_VERSION);
    } catch {}
    if (actor) {
      this.addAuditLog({
        userId: actor.id,
        userName: actor.fullName,
        userRole: actor.role,
        action: 'DONG_BO_THUYEN_TRUONG_TU_DS_TAU',
        targetType: 'SYSTEM',
        targetId: 'CREW_CAPTAINS',
        details: `${actor.fullName} đã xóa ${removedCount} thuyền trưởng cũ và cập nhật mới ${rebuiltCaptains.length} thuyền trưởng từ danh sách phương tiện VR-SB.`,
      });
    }
    this.emitUserMutation();
    return { removedCount, addedCount: rebuiltCaptains.length };
  }

  public getPorts(): PortLocation[] {
    return this.getItem<PortLocation[]>(STORAGE_KEYS.PORTS, DEFAULT_PORTS);
  }
  public getRoutes(): MaritimeRoute[] {
    return this.getItem<MaritimeRoute[]>(STORAGE_KEYS.ROUTES, DEFAULT_ROUTES);
  }
  public saveRoute(route: MaritimeRoute): void {
    const list = this.getRoutes();
    const idx = list.findIndex((r) => r.id === route.id);
    if (idx >= 0) list[idx] = route;
    else list.push(route);
    this.setItem(STORAGE_KEYS.ROUTES, list);
    this.emitUserMutation();
  }
  public deleteRoute(routeId: string): void {
    this.setItem(STORAGE_KEYS.ROUTES, this.getRoutes().filter((r) => r.id !== routeId));
    this.emitUserMutation();
  }

  public getWeather(): WeatherCondition {
    return this.getItem<WeatherCondition>(STORAGE_KEYS.WEATHER, DEFAULT_CURRENT_WEATHER);
  }
  public saveWeather(weather: WeatherCondition): void {
    this.setItem(STORAGE_KEYS.WEATHER, weather);
  }

  public getRulesConfig(): SystemRuleConfig[] {
    return this.getItem<SystemRuleConfig[]>(STORAGE_KEYS.RULES, DEFAULT_RULES_CONFIG);
  }
  public saveRulesConfig(configs: SystemRuleConfig[]): void {
    this.setItem(STORAGE_KEYS.RULES, configs);
    this.emitUserMutation();
  }

  // =================== AUDIT LOGS ===================
  public getAuditLogs(): AuditLogEntry[] {
    return this.getItem<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  }

  public addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const logs = this.getAuditLogs();
    const actor = this.getUserById(entry.userId);
    const activeShift = actor ? this.getActiveShiftForUser(actor) : undefined;
    const newEntry: AuditLogEntry = {
      ...entry,
      shiftId: entry.shiftId || activeShift?.id,
      shiftName: entry.shiftName || activeShift?.shiftName,
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newEntry);
    if (logs.length > 500) logs.length = 500;
    this.setItem(STORAGE_KEYS.AUDIT_LOGS, logs);
  }

  // =================== NOTIFICATIONS ===================
  public getCaptainRecipientIdsForTrip(trip: TripRecord): string[] {
    const vessels = this.getVessels();
    const crew = this.getCrew();
    const captainUsers = this.getAllUsers().filter((u) => u.role === 'CAPTAIN');
    const matchedIds = new Set<string>();

    captainUsers.forEach((u) => {
      if (u.id === trip.createdById) {
        matchedIds.add(u.id);
        return;
      }
      const accessible = getUserAccessibleVesselIds(u, vessels, crew);
      if (accessible.includes(trip.vesselId)) {
        matchedIds.add(u.id);
        return;
      }
      if (trip.captainName && u.fullName.toLowerCase().includes(trip.captainName.toLowerCase())) {
        matchedIds.add(u.id);
      }
    });

    if (matchedIds.size === 0 && captainUsers.length > 0) {
      matchedIds.add(captainUsers[0].id);
    }
    return Array.from(matchedIds);
  }

  public getNotifications(userId?: string, userRole?: UserRole): SystemNotification[] {
    const rawList = this.getItem<SystemNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
    const list: SystemNotification[] = rawList.map((n) => {
      const legacy = n as Omit<SystemNotification, 'channel'> & {
        channel: string;
        zaloStatus?: string;
      };
      const normalizedChannel: SystemNotification['channel'] =
        legacy.channel === 'ZALO_OA_SIMULATED' ? 'IN_APP' : n.channel;
      const cleanTitle = (n.title || '').replace(/Zalo[^\w]*|ZALO[^\w]*/gi, '');
      const cleanMsg = (n.message || '').replace(/Zalo[^\w]*/gi, '');
      const { zaloStatus: _unused, ...rest } = legacy;
      void _unused;
      return {
        ...rest,
        channel: normalizedChannel,
        title: cleanTitle,
        message: cleanMsg,
      };
    });

    if (!userId || userId === 'ALL' || userRole === 'ADMIN') return list;
    if (userRole === 'CAPTAIN') {
      return list.filter(
        (n) => n.recipientUserId === userId || n.recipientUserId === 'ALL' || n.recipientUserId === 'CAPTAINS'
      );
    }
    if (userRole === 'BP_TRUC') {
      return list.filter(
        (n) =>
          n.recipientUserId === userId ||
          n.recipientUserId === 'ALL' ||
          n.recipientUserId === 'ROLE:BP_TRUC' ||
          n.recipientUserId === 'ROLE:BP_ALL'
      );
    }
    if (userRole === 'BP_CHIHUY') {
      return list.filter(
        (n) =>
          n.recipientUserId === userId ||
          n.recipientUserId === 'ALL' ||
          n.recipientUserId === 'ROLE:BP_CHIHUY' ||
          n.recipientUserId === 'ROLE:BP_ALL'
      );
    }
    const roleGroupKey = userRole === 'DUTY_OFFICER' ? 'ROLE:LEADER' : userRole ? `ROLE:${userRole}` : '';
    return list.filter(
      (n) =>
        n.recipientUserId === userId ||
        n.recipientUserId === 'ALL' ||
        (roleGroupKey && n.recipientUserId === roleGroupKey)
    );
  }

  public addNotification(noti: Omit<SystemNotification, 'id' | 'createdAt' | 'isRead'>): void {
    const list = this.getItem<SystemNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
    const newNoti: SystemNotification = {
      ...noti,
      id: `NOTI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    list.unshift(newNoti);
    if (list.length > 200) list.length = 200;
    this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
  }

  public markNotificationAsRead(id: string): void {
    const list = this.getItem<SystemNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
    const item = list.find((n) => n.id === id);
    if (item) {
      item.isRead = true;
      this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
    }
  }

  public simulateAnonymizeOldData(): { affectedTripsCount: number; affectedPassengersCount: number } {
    const trips = this.getTrips();
    let affectedTripsCount = 0;
    let affectedPassengersCount = 0;

    trips.forEach((trip) => {
      if (trip.passengers && trip.passengers.length > 0) {
        affectedTripsCount++;
        trip.isAnonymized = true;
        trip.passengers.forEach((p) => {
          affectedPassengersCount++;
          p.fullName = p.fullName.charAt(0) + '***' + p.fullName.slice(-1);
          p.idNumber = '***' + p.idNumber.slice(-3);
          p.phone = '***' + p.phone.slice(-3);
          p.address = '*** (Đã ẩn danh theo chính sách bảo vệ dữ liệu cá nhân)';
        });
      }
    });

    this.setItem(STORAGE_KEYS.TRIPS, trips);
    this.addAuditLog({
      userId: 'SYSTEM',
      userName: 'Tiến trình tự động định kỳ',
      userRole: 'ADMIN',
      action: 'ẨN_DANH_DỮ_LIỆU_CÁ_NHÂN',
      targetType: 'SYSTEM',
      details: `Ẩn danh ${affectedPassengersCount} hành khách trên ${affectedTripsCount} hồ sơ.`,
    });
    return { affectedTripsCount, affectedPassengersCount };
  }

  // =================== SỔ HỒ SƠ ĐẾN ===================
  private deriveIncomingStatusFromTrip(
    trip: TripRecord,
    currentStatus?: IncomingDossierStatus
  ): IncomingDossierStatus {
    const st = normalizeStatus(trip.status);
    if (st === 'DA_CAP_PHEP' || st === 'TAM_GIU_BIEN_PHONG' || st === 'DA_XUAT_BEN' || st === 'DA_CAP_BEN') {
      return 'APPROVED';
    }
    if (
      st === 'TRA_CHU_TAU' ||
      st === 'TRA_BQL_CANG' ||
      st === 'KHONG_CHAP_THUAN' ||
      st === 'THU_HOI' ||
      st === 'DA_RUT' ||
      st === 'HET_HIEU_LUC'
    ) {
      return 'REJECTED';
    }
    if (st === 'DA_CHAP_THUAN') {
      return currentStatus === 'INTAKEN' || currentStatus === 'PROCESSING' ? currentStatus : 'PENDING_INTAKE';
    }
    if (['CHO_SO_XU_LY', 'DA_DUYET', 'DANG_TRINH_OFFICE', 'OFFICE_TRA_LAI', 'TAM_DUNG_THOI_TIET'].includes(st)) {
      return currentStatus === 'INTAKEN' ? 'INTAKEN' : 'PROCESSING';
    }
    return currentStatus || 'PENDING_INTAKE';
  }

  private syncIncomingDossierForTrip(trip: TripRecord): void {
    const rawList = this.getItem<IncomingDossier[]>(STORAGE_KEYS.INCOMING_DOSSIERS, []);
    const idx = rawList.findIndex((d) => d.tripId === trip.id || d.tripNumber === trip.tripNumber);
    if (idx < 0) return;

    const existing = rawList[idx];
    const nextStatus = this.deriveIncomingStatusFromTrip(trip, existing.status);
    const deptClock = this.computeDeptClockMinutes(trip);
    const nextOverdue = nextStatus !== 'APPROVED' && deptClock.isRed;
    const nextDocsCount = trip.uploadedDocuments?.length ?? existing.documentsCount;
    const nextDeadline = this.getAdminConfig().deptProcessingSlaMinutes || 60;

    if (
      existing.status !== nextStatus ||
      existing.isOverdue !== nextOverdue ||
      existing.vesselName !== trip.vesselName ||
      existing.vesselRegNumber !== trip.vesselRegNumber ||
      existing.documentsCount !== nextDocsCount ||
      existing.deadlineMinutes !== nextDeadline
    ) {
      rawList[idx] = {
        ...existing,
        status: nextStatus,
        isOverdue: nextOverdue,
        vesselName: trip.vesselName,
        vesselRegNumber: trip.vesselRegNumber,
        documentsCount: nextDocsCount,
        deadlineMinutes: nextDeadline,
      };
      this.setItem(STORAGE_KEYS.INCOMING_DOSSIERS, rawList);
    }
  }

  public getIncomingDossiers(): IncomingDossier[] {
    const rawList = this.getItem<IncomingDossier[]>(STORAGE_KEYS.INCOMING_DOSSIERS, []);
    const trips = this.getTrips();
    const tripById = new Map<string, TripRecord>();
    const tripByNumber = new Map<string, TripRecord>();
    trips.forEach((t) => {
      tripById.set(t.id, t);
      tripByNumber.set(t.tripNumber, t);
    });

    return rawList
      .filter((d) => tripById.has(d.tripId) || tripByNumber.has(d.tripNumber))
      .map((d) => {
        const legacySource = d.source as string;
        const normalizedSource: IncomingDossierSource =
          legacySource === 'ZALO_OA' ? 'PORT_GATEWAY' : d.source;
        const linked = tripById.get(d.tripId) || tripByNumber.get(d.tripNumber);
        const syncedStatus = linked
          ? this.deriveIncomingStatusFromTrip(linked, d.status)
          : d.status;
        const syncedOverdue =
          syncedStatus !== 'APPROVED' &&
          (linked ? this.computeDeptClockMinutes(linked).isRed : Boolean(d.isOverdue));
        return {
          ...d,
          source: normalizedSource,
          status: syncedStatus,
          isOverdue: syncedOverdue,
          notes: d.notes?.replace(/Zalo[^\w]*/gi, 'Cổng ứng dụng '),
        };
      });
  }

  public getIncomingDossierById(id: string): IncomingDossier | undefined {
    return this.getIncomingDossiers().find((d) => d.id === id);
  }

  public saveIncomingDossier(dossier: IncomingDossier): IncomingDossier {
    const list = this.getIncomingDossiers();
    const index = list.findIndex((d) => d.id === dossier.id);
    if (index >= 0) list[index] = dossier;
    else list.unshift(dossier);
    this.setItem(STORAGE_KEYS.INCOMING_DOSSIERS, list);
    this.emitUserMutation();
    const linkedTrip = this.getTrips().find(
      (t) => t.id === dossier.tripId || t.tripNumber === dossier.tripNumber
    );
    if (linkedTrip) {
      dossierArchiveService.queueTripSync(linkedTrip, dossier, this.getCurrentUser()?.fullName);
    }
    return dossier;
  }

  public generateNextIncomingNumber(): string {
    const config = this.getItem(STORAGE_KEYS.INCOMING_CONFIG, {
      prefixYear: String(new Date().getFullYear()),
      currentSequence: 87,
    });
    config.currentSequence += 1;
    this.setItem(STORAGE_KEYS.INCOMING_CONFIG, config);
    return `${String(config.currentSequence).padStart(3, '0')}/SĐ-SXD`;
  }

  public createIncomingDossierFromPort(trip: TripRecord, inspector: UserAccount): IncomingDossier {
    const now = new Date().toISOString();
    const existingList = this.getIncomingDossiers();
    const existingIdx = existingList.findIndex(
      (d) => d.tripId === trip.id || d.tripNumber === trip.tripNumber
    );

    if (existingIdx >= 0) {
      const updated: IncomingDossier = {
        ...existingList[existingIdx],
        receivedAt: now,
        status: 'INTAKEN',
        source: 'PORT_GATEWAY',
        senderUnit: inspector.department || 'Ban Quản lý Cảng tỉnh Quảng Ngãi',
        senderOfficerName: inspector.fullName,
        senderPhone: inspector.phone || '0914889900',
        currentPhaseIndex: 1,
        assignedOfficerId: 'USR-04',
        assignedOfficerName: 'Nguyễn Phùng Nguyễn',
        notes: `BQL Cảng (${inspector.fullName}) đã cấp Thông báo chấp thuận ${trip.approvalNotice?.noticeNumber || ''}.`,
      };
      this.saveIncomingDossier(updated);
      return updated;
    }

    const newDossier: IncomingDossier = {
      id: `INC-${Date.now()}`,
      incomingNumber: this.generateNextIncomingNumber(),
      receivedAt: now,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      vesselName: trip.vesselName,
      vesselRegNumber: trip.vesselRegNumber,
      source: 'PORT_GATEWAY',
      senderUnit: inspector.department || 'Ban Quản lý Cảng tỉnh Quảng Ngãi',
      senderOfficerName: inspector.fullName,
      senderPhone: inspector.phone || '0914889900',
      dossierType: `Đề nghị cấp Giấy phép rời cảng (${trip.routeName})`,
      status: 'INTAKEN',
      assignedOfficerId: 'USR-04',
      assignedOfficerName: 'Nguyễn Phùng Nguyễn',
      currentPhaseIndex: 1,
      deadlineMinutes: 60,
      documentsCount: 6,
      isOverdue: false,
      notes: `BQL Cảng đã cấp Thông báo chấp thuận ${trip.approvalNotice?.noticeNumber || ''}.`,
    };
    this.saveIncomingDossier(newDossier);
    return newDossier;
  }

  public intakeDossier(
    dossierId: string,
    officerId: string,
    officerName: string,
    notes?: string
  ): { success: boolean; dossier?: IncomingDossier; trip?: TripRecord; error?: string } {
    const dossier = this.getIncomingDossierById(dossierId);
    if (!dossier) return { success: false, error: 'Không tìm thấy hồ sơ đến' };
    const now = new Date().toISOString();
    dossier.status = 'INTAKEN';
    dossier.intakenAt = now;
    dossier.assignedOfficerId = officerId;
    dossier.assignedOfficerName = officerName;
    if (notes) dossier.notes = notes;
    this.saveIncomingDossier(dossier);
    const trip = this.getTripById(dossier.tripId);
    return { success: true, dossier, trip };
  }

  // =================== KPI & AUDIT ===================
  private ensureKpiSeeded(): void {
    const existingEvents = this.getItem<KpiEventRecord[] | null>(STORAGE_KEYS.KPI_EVENTS, null);
    if (!existingEvents) {
      this.setItem(STORAGE_KEYS.KPI_EVENTS, []);
      this.setItem(STORAGE_KEYS.KPI_EXCLUSIONS, []);
      this.setItem(STORAGE_KEYS.KPI_WARNINGS, []);
      this.setItem(STORAGE_KEYS.KPI_AUDIT_LOGS, []);
    }
    const existingCfg = this.getItem<KpiConfig | null>(STORAGE_KEYS.KPI_CONFIG, null);
    if (!existingCfg) {
      this.setItem(STORAGE_KEYS.KPI_CONFIG, DEFAULT_KPI_CONFIG);
    }
  }

  public getKpiEvents(): KpiEventRecord[] {
    this.ensureKpiSeeded();
    return this.getItem<KpiEventRecord[]>(STORAGE_KEYS.KPI_EVENTS, []);
  }

  public addKpiEvent(event: Omit<KpiEventRecord, 'id' | 'thoiDiem'> & { thoiDiem?: string }): void {
    const events = this.getKpiEvents();
    events.push({
      ...event,
      id: `KEV-LIVE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      thoiDiem: event.thoiDiem || new Date().toISOString(),
    });
    this.setItem(STORAGE_KEYS.KPI_EVENTS, events);
  }

  private syncLiveTripToKpiEvents(trip: TripRecord): void {
    try {
      const events = this.getKpiEvents();
      const hasMilestone = (moc: KpiEventRecord['moc'], ketQua?: string) =>
        events.some((e) => e.hoSoId === trip.id && e.moc === moc && (!ketQua || e.ketQua === ketQua));

      const base = {
        hoSoId: trip.id,
        maHoSo: trip.tripNumber,
        phuongTienId: trip.vesselId,
        phuongTienTen: `${trip.vesselName} (${trip.vesselRegNumber})`,
        benId: trip.departurePortId,
        benTen: trip.departurePortName || 'Bến Lý Sơn (Đảo Lớn)',
      };
      const nowIso = new Date().toISOString();
      const st = normalizeStatus(trip.status);
      let changed = false;

      if (st !== 'NHAP' && !hasMilestone('M1')) {
        events.push({
          ...base,
          id: `KEV-LIVE-${Date.now()}-M1`,
          moc: 'M1',
          thoiDiem: trip.bqlClock?.startedAt || trip.submittedAt || nowIso,
          nguoiThucHienId: trip.createdById,
          nguoiThucHien: trip.actualDeclarantName || trip.createdByName,
          vaiTro: trip.createdByRole,
          ketQua: 'NOP_HO_SO',
          donVi: 'Chủ tàu / Thuyền trưởng',
        });
        changed = true;
      }

      if (trip.approvalNotice && !hasMilestone('M2')) {
        events.push({
          ...base,
          id: `KEV-LIVE-${Date.now()}-M2`,
          moc: 'M2',
          thoiDiem: trip.approvalNotice.issuedAt || trip.portInspection?.inspectedAt || nowIso,
          nguoiThucHienId: trip.portInspection?.inspectorId || trip.approvalNotice.issuerId || 'USR-05',
          nguoiThucHien: trip.portInspection?.inspectorName || trip.approvalNotice.issuerName || 'Ban Quản lý Cảng',
          vaiTro: 'PORT_STAFF',
          ketQua: 'HOAN_TAT',
          donVi: 'Ban Quản lý cảng',
          coAnh: (trip.portInspection?.photoUrls?.length || 0) > 0,
          coViTri: true,
          ketLuanDat: true,
        });
        changed = true;
      }

      if (
        ['DA_CAP_PHEP', 'DA_XUAT_BEN', 'DA_CAP_BEN', 'THU_HOI', 'HET_HIEU_LUC'].includes(st) &&
        !hasMilestone('M6')
      ) {
        events.push({
          ...base,
          id: `KEV-LIVE-${Date.now()}-M6`,
          moc: 'M6',
          thoiDiem: trip.officeSubmissionRecord?.uploadedToSystemAt || trip.sealedAt || nowIso,
          nguoiThucHienId: trip.deptApprovedById || 'USR-04',
          nguoiThucHien: trip.sealedByName || trip.deptApprovedByName || 'Nguyễn Phùng Nguyễn',
          vaiTro: 'OFFICER',
          ketQua: 'PHAT_HANH',
          soLenh: trip.orderNumber,
          donVi: 'Phòng An toàn giao thông',
        });
        changed = true;
      }

      if ((st === 'DA_XUAT_BEN' || st === 'DA_CAP_BEN') && !hasMilestone('M8')) {
        events.push({
          ...base,
          id: `KEV-LIVE-${Date.now()}-M8`,
          moc: 'M8',
          thoiDiem: nowIso,
          thoiDiemThucTe: trip.actualArrivalTime || trip.actualDepartureTime || nowIso,
          thoiDiemXacNhan: trip.arrivingConfirmation?.confirmedAt || nowIso,
          nguoiThucHienId: trip.arrivingConfirmation?.confirmedById || trip.bpDepartureControl?.checkedById || 'USR-BP-TRUC-01',
          nguoiThucHien: trip.arrivingConfirmation?.confirmedByName || trip.bpDepartureControl?.checkedByName || 'Biên phòng trực',
          vaiTro: trip.arrivingConfirmation?.confirmedByRole || 'BP_TRUC',
          ketQua: st === 'DA_CAP_BEN' ? 'CAP_BEN' : 'ROI_BEN',
          donVi: trip.arrivingConfirmation?.confirmedByRole === 'PORT_STAFF' ? 'Ban Quản lý cảng' : 'Đồn Biên phòng Lý Sơn',
        });
        changed = true;
      }

      if (changed) {
        this.setItem(STORAGE_KEYS.KPI_EVENTS, events);
      }
    } catch {
      // ignore
    }
  }

  public getKpiExclusions(): KpiTimeExclusion[] {
    this.ensureKpiSeeded();
    return this.getItem<KpiTimeExclusion[]>(STORAGE_KEYS.KPI_EXCLUSIONS, []);
  }

  public submitKpiExclusion(
    payload: Omit<KpiTimeExclusion, 'id' | 'ngayDeNghi' | 'trangThai'>
  ): KpiTimeExclusion {
    const list = this.getKpiExclusions();
    const created: KpiTimeExclusion = {
      ...payload,
      id: `EXCL-${Date.now()}`,
      ngayDeNghi: new Date().toISOString(),
      trangThai: 'cho_duyet',
    };
    list.unshift(created);
    this.setItem(STORAGE_KEYS.KPI_EXCLUSIONS, list);
    this.emitUserMutation();
    return created;
  }

  public reviewKpiExclusion(
    exclusionId: string,
    nextStatus: Exclude<KpiExclusionStatus, 'cho_duyet'>,
    reviewer: UserAccount,
    rejectReason?: string
  ): KpiTimeExclusion | undefined {
    const list = this.getKpiExclusions();
    const idx = list.findIndex((e) => e.id === exclusionId);
    if (idx < 0) return undefined;

    const prev = list[idx];
    const updated: KpiTimeExclusion = {
      ...prev,
      trangThai: nextStatus,
      nguoiDuyetId: reviewer.id,
      nguoiDuyet: reviewer.fullName,
      ngayDuyet: new Date().toISOString(),
      lyDoTuChoi: nextStatus === 'tu_choi' ? rejectReason?.trim() || 'Không đủ căn cứ loại trừ' : undefined,
    };
    list[idx] = updated;
    this.setItem(STORAGE_KEYS.KPI_EXCLUSIONS, list);

    this.appendKpiAuditLog({
      nguoiThucHien: reviewer.fullName,
      vaiTro: reviewer.role,
      loai: nextStatus === 'da_duyet' ? 'DUYET_LOAI_TRU' : 'TU_CHOI_LOAI_TRU',
      moTa: `${reviewer.fullName} ${nextStatus === 'da_duyet' ? 'duyệt' : 'từ chối'} loại trừ ${updated.soPhut} phút (${updated.maHoSo || updated.hoSoId})`,
      giaTriCu: prev.trangThai,
      giaTriMoi: nextStatus,
    });
    this.emitUserMutation();
    return updated;
  }

  public getKpiWarnings(): KpiDocumentWarning[] {
    this.ensureKpiSeeded();
    return this.getItem<KpiDocumentWarning[]>(STORAGE_KEYS.KPI_WARNINGS, []);
  }

  public getKpiConfig(): KpiConfig {
    this.ensureKpiSeeded();
    const saved = this.getItem<KpiConfig>(STORAGE_KEYS.KPI_CONFIG, DEFAULT_KPI_CONFIG);
    return {
      ...DEFAULT_KPI_CONFIG,
      ...saved,
      timeNorms: { ...DEFAULT_KPI_CONFIG.timeNorms, ...(saved.timeNorms || {}) },
      ratingThresholds: { ...DEFAULT_KPI_CONFIG.ratingThresholds, ...(saved.ratingThresholds || {}) },
      indicators:
        saved.indicators && saved.indicators.length > 0 && saved.indicators.some((i) => i.code === 'BQL-T1')
          ? saved.indicators
          : DEFAULT_KPI_CONFIG.indicators,
      excelSummaryColumns:
        saved.excelSummaryColumns && saved.excelSummaryColumns.length > 0
          ? saved.excelSummaryColumns
          : DEFAULT_KPI_CONFIG.excelSummaryColumns,
      excelDetailColumns:
        saved.excelDetailColumns && saved.excelDetailColumns.length > 0
          ? saved.excelDetailColumns
          : DEFAULT_KPI_CONFIG.excelDetailColumns,
    };
  }

  public saveKpiConfig(nextConfig: KpiConfig, actor: UserAccount, oldSummary: string, newSummary: string): void {
    this.setItem(STORAGE_KEYS.KPI_CONFIG, nextConfig);
    this.appendKpiAuditLog({
      nguoiThucHien: actor.fullName,
      vaiTro: actor.role,
      loai: 'SUA_CAU_HINH',
      moTa: `${actor.fullName} cập nhật cấu hình KPI.`,
      giaTriCu: oldSummary,
      giaTriMoi: newSummary,
    });
    this.emitUserMutation();
  }

  public getKpiAuditLogs(): KpiAuditEntry[] {
    this.ensureKpiSeeded();
    return this.getItem<KpiAuditEntry[]>(STORAGE_KEYS.KPI_AUDIT_LOGS, []);
  }

  private appendKpiAuditLog(entry: Omit<KpiAuditEntry, 'id' | 'thoiDiem'>): void {
    const logs = this.getKpiAuditLogs();
    logs.unshift({
      ...entry,
      id: `KAUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      thoiDiem: new Date().toISOString(),
    });
    this.setItem(STORAGE_KEYS.KPI_AUDIT_LOGS, logs);
  }

  public regenerateKpiSampleData(actor: UserAccount): { eventsCount: number; exclusionsCount: number; warningsCount: number } {
    this.setItem(STORAGE_KEYS.KPI_EVENTS, []);
    const trips = this.getTrips();
    trips.forEach((trip) => this.syncLiveTripToKpiEvents(trip));
    const events = this.getKpiEvents();
    this.appendKpiAuditLog({
      nguoiThucHien: actor.fullName,
      vaiTro: actor.role,
      loai: 'TAO_LAI_DU_LIEU',
      moTa: `Đồng bộ lại KPI từ ${trips.length} hồ sơ.`,
      giaTriCu: 'Trước đồng bộ',
      giaTriMoi: `${events.length} sự kiện`,
    });
    this.emitUserMutation();
    return {
      eventsCount: events.length,
      exclusionsCount: this.getKpiExclusions().length,
      warningsCount: this.getKpiWarnings().length,
    };
  }

  // =================== STORAGE DIAGNOSTICS & BACKUP ===================
  public getStorageDiagnostics(): {
    totalBytes: number;
    quotaBytes: number;
    usagePercent: number;
    warning: string | null;
    breakdown: Array<{ key: string; label: string; bytes: number }>;
  } {
    const quotaBytes = 5 * 1024 * 1024;
    const labels: Array<[string, string]> = [
      [STORAGE_KEYS.TRIPS, 'Hồ sơ chuyến & Giấy phép'],
      [STORAGE_KEYS.INCOMING_DOSSIERS, 'Sổ hồ sơ đến'],
      [STORAGE_KEYS.VESSELS, 'Danh mục phương tiện VR-SB'],
      [STORAGE_KEYS.CREW, 'Danh mục thuyền viên'],
      [STORAGE_KEYS.KPI_EVENTS, 'Sự kiện & Nhật ký KPI'],
      [STORAGE_KEYS.AUDIT_LOGS, 'Nhật ký Audit hệ thống'],
      [STORAGE_KEYS.NOTIFICATIONS, 'Thông báo ứng dụng'],
      [STORAGE_KEYS.BP_DE_NGHI_DUNG, 'Tạm giữ / Đình chỉ (Biên phòng)'],
      [STORAGE_KEYS.BP_KIEM_SOAT, 'Kiểm soát xuất bến (Biên phòng)'],
      [STORAGE_KEYS.BP_ACCESS_LOGS, 'Nhật ký xem dữ liệu cá nhân (BP)'],
    ];
    let totalBytes = 0;
    const breakdown: Array<{ key: string; label: string; bytes: number }> = [];
    const tracked = new Set<string>(labels.map(([k]) => k));
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('vrsb_')) continue;
        const val = localStorage.getItem(k) || '';
        const bytes = (k.length + val.length) * 2;
        totalBytes += bytes;
        if (tracked.has(k)) {
          const found = labels.find(([keyName]) => keyName === k);
          breakdown.push({ key: k, label: found ? found[1] : k, bytes });
        }
      }
    } catch {}
    breakdown.sort((a, b) => b.bytes - a.bytes);
    return {
      totalBytes,
      quotaBytes,
      usagePercent: Math.min(100, roundMetric1((totalBytes / quotaBytes) * 100)),
      warning: this.lastStorageWarning,
      breakdown,
    };
  }

  public exportFullBackupJson(): string {
    return JSON.stringify(
      {
        schema: 'VRSB_QUANG_NGAI_BACKUP_V1',
        exportedAt: new Date().toISOString(),
        dataVersion: CURRENT_DATA_VERSION,
        data: {
          trips: this.getTrips(),
          incomingDossiers: this.getIncomingDossiers(),
          vessels: this.getVessels(),
          crew: this.getCrew(),
          ports: this.getPorts(),
          routes: this.getRoutes(),
          weather: this.getWeather(),
          rules: this.getRulesConfig(),
          shifts: this.getDutyShifts(),
          auditLogs: this.getAuditLogs(),
          notifications: this.getNotifications(),
          adminConfig: this.getAdminConfig(),
          kpiEvents: this.getKpiEvents(),
          kpiExclusions: this.getKpiExclusions(),
          kpiWarnings: this.getKpiWarnings(),
          kpiConfig: this.getKpiConfig(),
          kpiAuditLogs: this.getKpiAuditLogs(),
          bpConfig: this.getBpConfig(),
          deNghiDungs: this.getDeNghiDungs(),
          kiemSoatList: this.getKiemSoatList(),
          personalDataAccessLogs: this.getPersonalDataAccessLogs(),
        },
      },
      null,
      2
    );
  }

  public importFullBackupJson(
    rawJson: string,
    actor?: UserAccount
  ): { success: boolean; tripsCount?: number; dossiersCount?: number; error?: string } {
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || parsed.schema !== 'VRSB_QUANG_NGAI_BACKUP_V1' || !parsed.data) {
        return { success: false, error: 'Định dạng tệp sao lưu không hợp lệ.' };
      }
      const d = parsed.data;
      if (!Array.isArray(d.trips) || !Array.isArray(d.vessels) || !Array.isArray(d.crew)) {
        return { success: false, error: 'Tệp sao lưu thiếu dữ liệu cốt lõi.' };
      }
      this.setItem(STORAGE_KEYS.TRIPS, d.trips.map((t: TripRecord) => ({ ...t, status: normalizeStatus(t.status) })));
      if (Array.isArray(d.incomingDossiers)) this.setItem(STORAGE_KEYS.INCOMING_DOSSIERS, d.incomingDossiers);
      this.setItem(STORAGE_KEYS.VESSELS, d.vessels);
      this.setItem(STORAGE_KEYS.CREW, d.crew);
      if (Array.isArray(d.ports)) this.setItem(STORAGE_KEYS.PORTS, d.ports);
      if (Array.isArray(d.routes)) this.setItem(STORAGE_KEYS.ROUTES, d.routes);
      if (d.weather) this.setItem(STORAGE_KEYS.WEATHER, d.weather);
      if (Array.isArray(d.rules)) this.setItem(STORAGE_KEYS.RULES, d.rules);
      if (Array.isArray(d.shifts)) this.setItem(STORAGE_KEYS.SHIFTS, d.shifts);
      if (Array.isArray(d.auditLogs)) this.setItem(STORAGE_KEYS.AUDIT_LOGS, d.auditLogs);
      if (Array.isArray(d.notifications)) this.setItem(STORAGE_KEYS.NOTIFICATIONS, d.notifications);
      if (d.adminConfig) this.setItem(STORAGE_KEYS.ADMIN_CONFIG, d.adminConfig);
      if (Array.isArray(d.kpiEvents)) this.setItem(STORAGE_KEYS.KPI_EVENTS, d.kpiEvents);
      if (Array.isArray(d.kpiExclusions)) this.setItem(STORAGE_KEYS.KPI_EXCLUSIONS, d.kpiExclusions);
      if (Array.isArray(d.kpiWarnings)) this.setItem(STORAGE_KEYS.KPI_WARNINGS, d.kpiWarnings);
      if (d.kpiConfig) this.setItem(STORAGE_KEYS.KPI_CONFIG, d.kpiConfig);
      if (Array.isArray(d.kpiAuditLogs)) this.setItem(STORAGE_KEYS.KPI_AUDIT_LOGS, d.kpiAuditLogs);
      if (d.bpConfig) this.setItem(STORAGE_KEYS.BP_CONFIG, d.bpConfig);
      if (Array.isArray(d.deNghiDungs)) this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, d.deNghiDungs);
      if (Array.isArray(d.kiemSoatList)) this.setItem(STORAGE_KEYS.BP_KIEM_SOAT, d.kiemSoatList);
      if (Array.isArray(d.personalDataAccessLogs)) this.setItem(STORAGE_KEYS.BP_ACCESS_LOGS, d.personalDataAccessLogs);

      this.addAuditLog({
        userId: actor?.id || 'ADMIN',
        userName: actor?.fullName || 'Quản trị viên',
        userRole: actor?.role || 'ADMIN',
        action: 'KHÔI_PHỤC_TỪ_BẢN_SAO_LƯU',
        targetType: 'SYSTEM',
        details: `Khôi phục ${d.trips.length} hồ sơ chuyến từ bản sao lưu.`,
      });
      this.emitUserMutation();
      return {
        success: true,
        tripsCount: d.trips.length,
        dossiersCount: Array.isArray(d.incomingDossiers) ? d.incomingDossiers.length : 0,
      };
    } catch {
      return { success: false, error: 'Không thể đọc tệp JSON sao lưu.' };
    }
  }

  // =================== PHÂN HỆ BIÊN PHÒNG (SAU KHI CÓ GIẤY PHÉP) ===================
  public authenticateBpCredentials(username: string, password: string): { success: boolean; user?: UserAccount; error?: string } {
    const cleanUser = username.trim().toLowerCase();
    const found = this.getAllUsers().find(
      (u) => (u.role === 'BP_TRUC' || u.role === 'BP_CHIHUY') && u.username.toLowerCase() === cleanUser
    );
    if (!found) return { success: false, error: 'Không tìm thấy tài khoản Biên phòng.' };
    if (found.status === 'LOCKED' || found.isActive === false) return { success: false, error: 'Tài khoản này đang bị khóa.' };
    if ((found.password || 'bp123456') !== password) return { success: false, error: 'Mật khẩu không chính xác.' };
    return { success: true, user: found };
  }

  public createBpDemoSession(user: UserAccount): void {
    const clean: UserAccount = { ...user, lastLogin: new Date().toISOString() };
    this.setCurrentUser(clean);
    try {
      sessionStorage.setItem(BP_DEMO_SESSION_KEY, JSON.stringify(clean));
    } catch {}
    this.addAuditLog({
      userId: clean.id,
      userName: clean.fullName,
      userRole: clean.role,
      action: 'ĐĂNG_NHẬP_2FA_BIÊN_PHÒNG',
      targetType: 'SYSTEM',
      details: `${clean.fullName} (${clean.role}) đã xác thực 2 lớp thành công.`,
    });
  }

  public getActiveBpDemoSession(): UserAccount | null {
    try {
      const raw = sessionStorage.getItem(BP_DEMO_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserAccount;
      if (parsed && (parsed.role === 'BP_TRUC' || parsed.role === 'BP_CHIHUY')) {
        return this.getUserById(parsed.id) || parsed;
      }
    } catch {}
    return null;
  }

  public clearBpDemoSession(): void {
    try {
      sessionStorage.removeItem(BP_DEMO_SESSION_KEY);
    } catch {}
  }

  public getBpConfig(): BpSystemConfig {
    return {
      ...DEFAULT_BP_SYSTEM_CONFIG,
      ...this.getItem<Partial<BpSystemConfig>>(STORAGE_KEYS.BP_CONFIG, DEFAULT_BP_SYSTEM_CONFIG),
    };
  }

  public saveBpConfig(config: BpSystemConfig, actor?: UserAccount): void {
    this.setItem(STORAGE_KEYS.BP_CONFIG, config);
    if (actor) {
      this.addAuditLog({
        userId: actor.id,
        userName: actor.fullName,
        userRole: actor.role,
        action: 'CẬP_NHẬT_CẤU_HÌNH_BIÊN_PHÒNG',
        targetType: 'SYSTEM',
        details: `Đơn vị phối hợp: "${config.unitDisplayName}", Quyền gỡ: ${config.quyenGoDeNghi}.`,
      });
    }
    this.emitUserMutation();
  }

  public getDeNghiDungs(): DeNghiDung[] {
    return this.getItem<DeNghiDung[]>(STORAGE_KEYS.BP_DE_NGHI_DUNG, []);
  }
  public getDeNghiDungsForTrip(hoSoId: string): DeNghiDung[] {
    return this.getDeNghiDungs().filter((d) => d.hoSoId === hoSoId);
  }
  public getActiveDeNghiDungForTrip(hoSoId: string): DeNghiDung | undefined {
    return this.getDeNghiDungs().find((d) => d.hoSoId === hoSoId && d.trangThai === 'dang_hieu_luc');
  }

  /**
   * Biên phòng CHỈ được tạm giữ / đình chỉ xuất bến SAU KHI đã có Giấy phép (DA_CAP_PHEP).
   * Không cho phép can thiệp hoặc chặn trước khi cấp phép.
   */
  public proposeBpStop(params: {
    hoSoId: string;
    loai: BpStopType;
    maLyDo: BpStopReasonCode;
    moTa: string;
    anh?: string[];
    actor: UserAccount;
  }): { success: boolean; record?: DeNghiDung; trip?: TripRecord; error?: string } {
    const { hoSoId, maLyDo, moTa, anh = [], actor } = params;
    if (!['BP_TRUC', 'BP_CHIHUY', 'ADMIN'].includes(actor.role)) {
      return { success: false, error: 'Chỉ cán bộ hoặc chỉ huy Biên phòng mới được tạm giữ xuất bến.' };
    }
    if (!moTa || moTa.trim().length < 5) {
      return { success: false, error: 'Mô tả chi tiết bắt buộc có ít nhất 5 ký tự.' };
    }

    const trip = this.getTripById(hoSoId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const st = normalizeStatus(trip.status);
    if (st !== 'DA_CAP_PHEP') {
      return {
        success: false,
        error: 'Theo quy trình kiểm soát cuối cùng, Biên phòng chỉ lập Tạm giữ / Đình chỉ sau khi hồ sơ đã có Giấy phép rời cảng.',
      };
    }

    const shiftCheck = this.validateShiftAndPortForAction(actor, trip.departurePortId);
    if (!shiftCheck.allowed) return { success: false, error: shiftCheck.reason };

    const now = new Date().toISOString();
    trip.previousStatusBeforeBpStop = 'DA_CAP_PHEP';
    trip.status = 'TAM_GIU_BIEN_PHONG';
    trip.isPermitSuspended = true;
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: 'DA_CAP_PHEP',
        toStatus: 'TAM_GIU_BIEN_PHONG',
        changedAt: now,
        changedById: actor.id,
        changedByName: actor.fullName,
        milestone: 'BP_DE_NGHI_DUNG',
        reason: `Biên phòng tạm giữ / đình chỉ xuất bến: ${moTa.trim()}`,
      },
    ];
    this.saveTrip(trip);

    const record: DeNghiDung = {
      id: `DN-${Date.now()}`,
      hoSoId: trip.id,
      loai: 'dinh_chi_lenh',
      maLyDo,
      moTa: moTa.trim(),
      anh,
      nguoiDeNghi: actor.fullName,
      nguoiDeNghiId: actor.id,
      thoiDiem: now,
      trangThai: 'dang_hieu_luc',
    };
    this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, [record, ...this.getDeNghiDungs()]);

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'BP_TAM_GIU_DINH_CHI_LENH',
      targetId: trip.id,
      targetType: 'TRIP',
      beforeValue: 'DA_CAP_PHEP',
      afterValue: 'TAM_GIU_BIEN_PHONG',
      details: `Tạm giữ & đình chỉ GP ${trip.orderNumber}: ${moTa.trim()}`,
    });

    this.emitUserMutation();
    return { success: true, record, trip };
  }

  public canUserLiftBpStop(actor: UserAccount, stopRecord: DeNghiDung): boolean {
    if (actor.role === 'BP_CHIHUY' || actor.role === 'ADMIN') return true;
    if (actor.role === 'BP_TRUC') {
      return (
        (Boolean(stopRecord.nguoiDeNghiId) && stopRecord.nguoiDeNghiId === actor.id) ||
        stopRecord.nguoiDeNghi === actor.fullName
      );
    }
    const cfg = this.getBpConfig();
    if (cfg.quyenGoDeNghi === 'bien_phong_hoac_lanh_dao_so' && actor.role === 'LEADER') {
      return true;
    }
    return false;
  }

  public liftBpStop(params: {
    deNghiId: string;
    ketQuaXacMinh: string;
    actor: UserAccount;
  }): { success: boolean; record?: DeNghiDung; trip?: TripRecord; error?: string } {
    const { deNghiId, ketQuaXacMinh, actor } = params;
    const list = this.getDeNghiDungs();
    const idx = list.findIndex((d) => d.id === deNghiId);
    if (idx < 0) return { success: false, error: 'Không tìm thấy biên bản tạm giữ cần gỡ.' };
    const rec = list[idx];
    if (rec.trangThai === 'da_go') return { success: false, error: 'Biên bản này đã được gỡ trước đó.' };
    if (!this.canUserLiftBpStop(actor, rec)) {
      return { success: false, error: 'Chỉ người lập hoặc Chỉ huy Đồn mới có quyền gỡ tạm giữ.' };
    }
    if (!ketQuaXacMinh || ketQuaXacMinh.trim().length < 5) {
      return { success: false, error: 'Vui lòng nhập kết quả xác minh (≥ 5 ký tự).' };
    }

    const trip = this.getTripById(rec.hoSoId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến liên kết.' };

    const now = new Date().toISOString();
    const updatedRec: DeNghiDung = {
      ...rec,
      trangThai: 'da_go',
      nguoiGo: actor.fullName,
      nguoiGoId: actor.id,
      thoiDiemGo: now,
      ketQuaXacMinh: ketQuaXacMinh.trim(),
    };
    list[idx] = updatedRec;
    this.setItem(STORAGE_KEYS.BP_DE_NGHI_DUNG, list);

    const prevStatus = normalizeStatus(trip.status);
    trip.status = 'DA_CAP_PHEP';
    trip.isPermitSuspended = false;
    trip.previousStatusBeforeBpStop = undefined;
    trip.statusLogs = [
      ...(trip.statusLogs || []),
      {
        fromStatus: prevStatus,
        toStatus: 'DA_CAP_PHEP',
        changedAt: now,
        changedById: actor.id,
        changedByName: actor.fullName,
        milestone: 'BP_GO_DE_NGHI',
        reason: `Gỡ tạm giữ Biên phòng — khôi phục Giấy phép hiệu lực: ${ketQuaXacMinh.trim()}`,
      },
    ];
    let saved = this.saveTrip(trip);
    saved = this.checkAndExpirePermitIf24h(saved);

    this.addNotification({
      recipientUserId: 'ROLE:OFFICER',
      title: `✅ Đã gỡ tạm giữ tàu ${saved.vesselName}`,
      message: `${actor.fullName} đã gỡ tạm giữ GP ${saved.orderNumber}: ${ketQuaXacMinh.trim()}`,
      type: 'SUCCESS',
      channel: 'IN_APP',
      tripId: saved.id,
    });

    this.getCaptainRecipientIdsForTrip(saved).forEach((cid) => {
      this.addNotification({
        recipientUserId: cid,
        title: `Đã gỡ tạm giữ: ${saved.tripNumber}`,
        message: `Giấy phép rời cảng ${saved.orderNumber} đã được khôi phục hiệu lực.`,
        type: 'SUCCESS',
        channel: 'IN_APP',
        tripId: saved.id,
      });
    });

    this.addAuditLog({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: 'BP_GO_DE_NGHI_DUNG',
      targetId: saved.id,
      targetType: 'TRIP',
      beforeValue: prevStatus,
      afterValue: saved.status,
      details: `${actor.fullName} đã gỡ tạm giữ ${rec.id}: ${ketQuaXacMinh.trim()}`,
    });

    this.emitUserMutation();
    return { success: true, record: updatedRec, trip: saved };
  }

  public getKiemSoatList(): KiemSoatTaiBen[] {
    return this.getItem<KiemSoatTaiBen[]>(STORAGE_KEYS.BP_KIEM_SOAT, []);
  }
  public getLatestKiemSoatForTrip(hoSoId: string): KiemSoatTaiBen | undefined {
    return this.getKiemSoatList().find((k) => k.hoSoId === hoSoId);
  }
  public recordPortControlCheck(params: {
    hoSoId: string;
    soNguoiThucTe: number;
    ghiChu: string;
    actor: UserAccount;
  }): { success: boolean; record?: KiemSoatTaiBen; error?: string } {
    const { hoSoId, soNguoiThucTe, ghiChu, actor } = params;
    const trip = this.getTripById(hoSoId);
    if (!trip) return { success: false, error: 'Không tìm thấy hồ sơ chuyến.' };

    const crewCount = trip.crewMembers?.length || 0;
    const paxCount = trip.passengers?.length > 0 ? trip.passengers.length : trip.passengerCount || 0;
    const soNguoiTheoDanhSach = crewCount + paxCount;
    const ketQua: 'khop' | 'chenh_lech' = soNguoiThucTe === soNguoiTheoDanhSach ? 'khop' : 'chenh_lech';
    const now = new Date().toISOString();
    const record: KiemSoatTaiBen = {
      id: `KS-${Date.now()}`,
      hoSoId: trip.id,
      soNguoiThucTe,
      soNguoiTheoDanhSach,
      ketQua,
      ghiChu: ghiChu.trim(),
      nguoiKiemSoat: actor.fullName,
      nguoiKiemSoatId: actor.id,
      thoiDiem: now,
    };
    this.setItem(STORAGE_KEYS.BP_KIEM_SOAT, [record, ...this.getKiemSoatList()]);
    this.emitUserMutation();
    return { success: true, record };
  }

  public getPersonalDataAccessLogs(): NhatKyTruyCapDuLieuCaNhan[] {
    return this.getItem<NhatKyTruyCapDuLieuCaNhan[]>(STORAGE_KEYS.BP_ACCESS_LOGS, []);
  }

  public logPersonalDataAccess(params: {
    hoSoId: string;
    lyDo: string;
    actor: UserAccount;
  }): NhatKyTruyCapDuLieuCaNhan {
    const entry: NhatKyTruyCapDuLieuCaNhan = {
      id: `NK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      nguoiXem: params.actor.fullName,
      nguoiXemId: params.actor.id,
      vaiTro: params.actor.role,
      hoSoId: params.hoSoId,
      lyDo: params.lyDo.trim(),
      thoiDiem: new Date().toISOString(),
    };
    const logs = this.getPersonalDataAccessLogs();
    logs.unshift(entry);
    if (logs.length > 500) logs.length = 500;
    this.setItem(STORAGE_KEYS.BP_ACCESS_LOGS, logs);
    this.addAuditLog({
      userId: params.actor.id,
      userName: params.actor.fullName,
      userRole: params.actor.role,
      action: 'XEM_DU_LIEU_CA_NHAN_DAY_DU',
      targetId: params.hoSoId,
      targetType: 'TRIP',
      details: `Xem đầy đủ thông tin cá nhân hồ sơ ${params.hoSoId}. Lý do: ${params.lyDo.trim()}`,
    });
    return entry;
  }

  // Giữ tương thích cho createDefaultPhases import để không lỗi lint
  public _unusedKeepRef = createDefaultPhases;
}

export const repository = new Repository();
