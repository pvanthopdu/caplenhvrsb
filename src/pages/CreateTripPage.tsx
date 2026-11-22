/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UserAccount,
  Vessel,
  CrewMember,
  Passenger,
  TripRecord,
  RuleEvaluationResult,
  UploadedDocument,
  normalizeStatus,
} from '../types';
import { repository } from '../services/repository';
import { fileStorageService } from '../services/fileStorageService';
import { dossierArchiveService } from '../services/dossierArchiveService';
import {
  evaluateAllCrewCertificates,
  buildReusableCrewDocuments as buildReusableCrewDocEntries,
  syncTripCrewAndCertificatesToSystem,
  getTodayIsoDate,
} from '../services/crewCertSyncService';
import { RulesEngine } from '../services/rulesEngine';
import { GeminiService } from '../services/geminiService';
import { OfficialFormsModal } from '../components/OfficialFormsModal';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import {
  formatDate,
  formatTime,
  formatDateTime,
  numberToVietnameseWords,
  maskIdNumber,
  maskPhone,
  getRejectedOriginLabel,
  getReturnScopeLabel,
} from '../utils/formatters';
import * as XLSX from 'xlsx';

function buildScenarioSamplePassengers(count: number): Passenger[] {
  const sampleNames = [
    'Nguyễn Văn Minh',
    'Trần Thị Thu Hà',
    'Lê Quốc Khánh',
    'Phạm Thị Lan Anh',
    'Hoàng Đức Long',
    'Võ Thị Kim Chi',
    'Đặng Minh Tuấn',
    'Bùi Thị Ngọc Mai',
    'Đỗ Quang Huy',
    'Huỳnh Thị Thảo Vy',
    'Ngô Văn Thành',
    'Dương Thị Hồng Nhung',
    'Phan Anh Khoa',
    'Trịnh Thị Bảo Trâm',
  ];
  return Array.from({ length: count }, (_, idx) => ({
    id: `PAX-TEST-${Date.now()}-${idx + 1}`,
    fullName: sampleNames[idx % sampleNames.length],
    birthYear: 1982 + (idx % 20),
    gender: idx % 2 === 0 ? 'NAM' : 'NU',
    phone: `0914${String(100000 + idx * 137).slice(0, 6)}`,
    idNumber: `0510${String(80000000 + idx * 12345).slice(0, 8)}`,
    isForeigner: false,
    address: 'Đặc khu Lý Sơn, Quảng Ngãi',
  }));
}
import {
  FileText,
  Ship,
  Users,
  UserCheck,
  Package,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  Send,
  Sparkles,
  MessageSquare,
  Upload,
  Download,
  Plus,
  Trash2,
  Copy,
  ChevronRight,
  ChevronLeft,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  Info,
  LifeBuoy,
  RotateCcw,
  Paperclip,
  Camera,
  Check,
  Receipt,
  FileCheck,
  ShieldAlert,
  Loader2,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { getUserAccessibleVesselIds } from '../utils/userPermissions';

interface CreateTripPageProps {
  currentUser: UserAccount;
  onNavigate: (page: string, tripId?: string) => void;
  tripToEditId?: string;
}

export const CreateTripPage: React.FC<CreateTripPageProps> = ({
  currentUser,
  onNavigate,
  tripToEditId,
}) => {
  const [vessels, setVessels] = useState<Vessel[]>(() => repository.getVessels());
  const [crewCatalog, setCrewCatalog] = useState<CrewMember[]>(() => repository.getCrew());
  const [existingTrips, setExistingTrips] = useState<TripRecord[]>(() => repository.getTrips());
  const [routes, setRoutes] = useState(() => repository.getRoutes());
  const ports = repository.getPorts();
  const weather = repository.getWeather();
  const rulesConfig = repository.getRulesConfig();
  const adminConfig = repository.getAdminConfig();
  const todayIso = getTodayIsoDate();

  useEffect(() => {
    const unsubscribe = repository.subscribe(() => {
      setVessels(repository.getVessels());
      setCrewCatalog(repository.getCrew());
      setExistingTrips(repository.getTrips());
      setRoutes(repository.getRoutes());
    });
    return unsubscribe;
  }, []);

  // Kiểm tra nếu đang sửa hồ sơ bị trả lại hoặc bản nháp
  const existingTrip = tripToEditId ? repository.getTripById(tripToEditId) : undefined;
  const canonicalExistingStatus = existingTrip ? normalizeStatus(existingTrip.status) : undefined;
  const isRejected = canonicalExistingStatus === 'TRA_CHU_TAU';
  const canWithdrawExisting = Boolean(
    existingTrip &&
      canonicalExistingStatus &&
      ['NHAP', 'CHO_KIEM_TRA', 'TRA_CHU_TAU', 'TRA_BQL_CANG', 'CHO_SO_XU_LY', 'TAM_DUNG_THOI_TIET'].includes(
        canonicalExistingStatus
      )
  );

  // Xác định danh sách tàu thuộc quyền phụ trách của thuyền trưởng / chủ tàu
  const accessibleVesselIds = useMemo(() => {
    return getUserAccessibleVesselIds(currentUser, vessels, crewCatalog);
  }, [currentUser, vessels, crewCatalog]);

  const selectableVessels = useMemo(() => {
    const activePool = vessels.filter(
      (v) => v.isActive !== false || v.id === existingTrip?.vesselId
    );
    if (currentUser.role === 'CAPTAIN') {
      return activePool.filter((v) => accessibleVesselIds.includes(v.id));
    }
    return activePool;
  }, [currentUser.role, vessels, accessibleVesselIds, existingTrip?.vesselId]);

  // Tiến trình 6 bước (Theo yêu cầu: Bước 1: Thông tin chung, Bước 5: Giấy tờ đính kèm, Bước 6: Nộp hồ sơ)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [toastBanner, setToastBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [pendingCopyTrip, setPendingCopyTrip] = useState<TripRecord | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawReason, setWithdrawReason] = useState<string>('');

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToastBanner({ type, message });
    setTimeout(() => {
      setToastBanner((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // ==========================================
  // BƯỚC 1: THÔNG TIN CHUNG (BẢN KHAI CHUNG)
  // ==========================================
  const [movementType, setMovementType] = useState<'DEPARTURE' | 'ARRIVAL'>(
    existingTrip?.movementType || 'DEPARTURE'
  );
  const [selectedVesselId, setSelectedVesselId] = useState<string>(() => {
    if (existingTrip?.vesselId) return existingTrip.vesselId;
    if (currentUser.role === 'CAPTAIN' && selectableVessels.length > 0) {
      return selectableVessels[0].id;
    }
    return selectableVessels[0]?.id || vessels[0]?.id || 'VES-01';
  });

  useEffect(() => {
    if (
      selectableVessels.length > 0 &&
      !selectableVessels.some((v) => v.id === selectedVesselId)
    ) {
      setSelectedVesselId(selectableVessels[0].id);
    }
  }, [selectableVessels, selectedVesselId]);
  const [imoNumber, setImoNumber] = useState<string>(existingTrip?.imoNumber || '');
  const [showImoInput, setShowImoInput] = useState<boolean>(!!existingTrip?.imoNumber);
  const [tripSeqOfDay, setTripSeqOfDay] = useState<number>(existingTrip?.tripSeqOfDay || 1);
  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    existingTrip?.routeId || routes[0]?.id || 'ROUTE-01'
  );
  const [departurePortId, setDeparturePortId] = useState<string>(
    existingTrip?.departurePortId || ports[0]?.id || 'PORT-01'
  );
  const [arrivalPortId, setArrivalPortId] = useState<string>(
    existingTrip?.arrivalPortId || ports[1]?.id || 'PORT-02'
  );

  // Ngày & Giờ phút rời bến (Bộ chọn chuẩn, không nhập tự do)
  // Ràng buộc: Không được nhỏ hơn thời gian hiện tại + 30 phút (Mặc định chọn Hiện tại + 45 phút)
  const initialDep = useMemo(() => {
    if (existingTrip?.scheduledDepartureTime) {
      return {
        date: existingTrip.scheduledDepartureTime.slice(0, 10),
        hour: existingTrip.scheduledDepartureTime.slice(11, 13),
        minute: existingTrip.scheduledDepartureTime.slice(14, 16),
      };
    }
    const target = new Date(Date.now() + 45 * 60 * 1000);
    const m = Math.ceil(target.getMinutes() / 5) * 5;
    if (m >= 60) {
      target.setHours(target.getHours() + 1);
      target.setMinutes(m - 60);
    } else {
      target.setMinutes(m);
    }
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    const hour = String(target.getHours()).padStart(2, '0');
    const minute = String(target.getMinutes()).padStart(2, '0');
    return {
      date: `${year}-${month}-${day}`,
      hour,
      minute,
    };
  }, [existingTrip]);

  const [departureDate, setDepartureDate] = useState<string>(initialDep.date);
  const [departureHour, setDepartureHour] = useState<string>(initialDep.hour);
  const [departureMinute, setDepartureMinute] = useState<string>(initialDep.minute);

  // Kiểm tra ràng buộc: Thời gian rời bến không được nhỏ hơn thời gian hiện tại + 30 phút
  const departureValidation = useMemo(() => {
    const chosenTimestamp = new Date(`${departureDate}T${departureHour}:${departureMinute}`).getTime();
    const minAllowedTimestamp = Date.now() + 30 * 60 * 1000;
    const isTooSoon = isNaN(chosenTimestamp) || chosenTimestamp < minAllowedTimestamp;

    const minTimeObj = new Date(minAllowedTimestamp);
    const minHours = String(minTimeObj.getHours()).padStart(2, '0');
    const minMinutes = String(minTimeObj.getMinutes()).padStart(2, '0');
    const minDay = String(minTimeObj.getDate()).padStart(2, '0');
    const minMonth = String(minTimeObj.getMonth() + 1).padStart(2, '0');
    const minYear = minTimeObj.getFullYear();
    const minTimeString = `${minHours}:${minMinutes} ngày ${minDay}/${minMonth}/${minYear}`;

    return {
      isTooSoon,
      minTimeString,
    };
  }, [departureDate, departureHour, departureMinute]);

  const handleSetQuickValidTime = () => {
    const target = new Date(Date.now() + 45 * 60 * 1000);
    const m = Math.ceil(target.getMinutes() / 5) * 5;
    if (m >= 60) {
      target.setHours(target.getHours() + 1);
      target.setMinutes(m - 60);
    } else {
      target.setMinutes(m);
    }
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    const hour = String(target.getHours()).padStart(2, '0');
    const minute = String(target.getMinutes()).padStart(2, '0');

    setDepartureDate(`${year}-${month}-${day}`);
    setDepartureHour(hour);
    setDepartureMinute(minute);
  };

  // Người khai / Nhân viên khai thay
  const isPortStaff = currentUser.role === 'PORT_STAFF';
  const [declaredByStaff, setDeclaredByStaff] = useState<boolean>(
    existingTrip?.isDeclaredByPortStaff ?? isPortStaff
  );
  const [declarantName, setDeclarantName] = useState<string>(
    existingTrip?.actualDeclarantName || currentUser.fullName
  );
  const [declarantPhone, setDeclarantPhone] = useState<string>(
    existingTrip?.declarantPhone || currentUser.phone || '0988123456'
  );
  const [staffReason, setStaffReason] = useState<string>(
    existingTrip?.staffDeclarationReason || 'Thuyền trưởng đang neo đậu trực ca, ủy quyền BQL cảng hỗ trợ kê khai'
  );
  const [berthLocation, setBerthLocation] = useState<string>(
    existingTrip?.berthLocation || 'Cầu cập Đảo Lớn (Bến Đình)'
  );

  // Thông số mớn nước (tự điền từ tàu, cho sửa)
  const [draftForward, setDraftForward] = useState<number>(existingTrip?.draftForward ?? 0.6);
  const [draftAft, setDraftAft] = useState<number>(existingTrip?.draftAft ?? 0.9);

  // ==========================================
  // BƯỚC 2: THUYỀN VIÊN (DANH SÁCH THUYỀN VIÊN)
  // ==========================================
  // Xác định thông tin chứng chỉ chuyên môn của thuyền trưởng tương ứng với tài khoản đang đăng nhập
  const userCaptainCrew = useMemo(() => {
    // 1. Tìm theo tên trùng với currentUser.fullName
    const byName = crewCatalog.find(
      (c) => c.position === 'CAPTAIN' && c.fullName.toLowerCase().trim() === currentUser.fullName.toLowerCase().trim()
    );
    if (byName) return byName;

    // 2. Tìm theo tàu phụ trách của thuyền trưởng
    if (currentUser.role === 'CAPTAIN' && accessibleVesselIds.length > 0) {
      const byVessel = crewCatalog.find(
        (c) => c.position === 'CAPTAIN' && c.assignedVesselId && accessibleVesselIds.includes(c.assignedVesselId)
      );
      if (byVessel) return byVessel;
    }

    // 3. Fallback thuyền trưởng đầu tiên trong danh mục
    return crewCatalog.find((c) => c.position === 'CAPTAIN') || crewCatalog[0];
  }, [crewCatalog, currentUser, accessibleVesselIds]);

  const [selectedCaptainId, setSelectedCaptainId] = useState<string>(() => {
    if (existingTrip?.captainId) return existingTrip.captainId;
    if (currentUser.role === 'CAPTAIN' && userCaptainCrew) {
      return userCaptainCrew.id;
    }
    const byVessel = crewCatalog.find(
      (c) => c.position === 'CAPTAIN' && c.assignedVesselId === selectedVesselId
    );
    return byVessel?.id || crewCatalog.find((c) => c.position === 'CAPTAIN')?.id || '';
  });

  const [crewMembers, setCrewMembers] = useState<
    {
      crewId: string;
      fullName: string;
      positionTitle: string;
      certNumber: string;
      certExpireDate: string;
      nationality: string;
      birthDate: string;
      birthPlace: string;
      passportNumber: string;
      isTemporary?: boolean;
    }[]
  >(() => {
    if (existingTrip?.crewMembers && existingTrip.crewMembers.length > 0) {
      return existingTrip.crewMembers.map((c, idx) => {
        if (idx === 0 && currentUser.role === 'CAPTAIN') {
          return {
            crewId: userCaptainCrew?.id || c.crewId,
            fullName: currentUser.fullName,
            positionTitle: 'Thuyền trưởng',
            certNumber: userCaptainCrew?.certNumber || c.certNumber || 'TT-VRSB-00821',
            certExpireDate: userCaptainCrew?.certExpireDate || c.certExpireDate || '2028-06-30',
            nationality: c.nationality || 'Việt Nam',
            birthDate: c.birthDate || '1980',
            birthPlace: c.birthPlace || 'Lý Sơn, Quảng Ngãi',
            passportNumber: userCaptainCrew?.citizenId || c.passportNumber || '',
            isTemporary: c.isTemporary,
          };
        }
        return {
          crewId: c.crewId,
          fullName: c.fullName,
          positionTitle: c.positionTitle,
          certNumber: c.certNumber,
          certExpireDate: c.certExpireDate,
          nationality: c.nationality || 'Việt Nam',
          birthDate: c.birthDate || '1982',
          birthPlace: c.birthPlace || 'Quảng Ngãi',
          passportNumber: c.passportNumber || '',
          isTemporary: c.isTemporary,
        };
      });
    }
    // Mặc định nạp từ danh mục thuyền viên (nếu có) theo đúng chức danh và tàu đang chọn
    const vesselCapt = crewCatalog.find(
      (c) => c.position === 'CAPTAIN' && c.assignedVesselId === selectedVesselId
    );
    const capt =
      currentUser.role === 'CAPTAIN' && userCaptainCrew
        ? userCaptainCrew
        : vesselCapt || crewCatalog.find((c) => c.position === 'CAPTAIN');
    const eng = crewCatalog.find(
      (c) => c.position === 'CHIEF_ENGINEER' && (!c.assignedVesselId || c.assignedVesselId === selectedVesselId)
    );
    const deck = crewCatalog.find(
      (c) => c.position === 'DECKHAND' && (!c.assignedVesselId || c.assignedVesselId === selectedVesselId)
    );

    const initialCrew: {
      crewId: string;
      fullName: string;
      positionTitle: string;
      certNumber: string;
      certExpireDate: string;
      nationality: string;
      birthDate: string;
      birthPlace: string;
      passportNumber: string;
      isTemporary?: boolean;
    }[] = [];

    if (capt) {
      initialCrew.push({
        crewId: capt.id,
        fullName: currentUser.role === 'CAPTAIN' ? currentUser.fullName : capt.fullName,
        positionTitle: 'Thuyền trưởng',
        certNumber: capt.certNumber,
        certExpireDate: capt.certExpireDate,
        nationality: 'Việt Nam',
        birthDate: capt.birthDate || '1980',
        birthPlace: capt.birthPlace || 'Lý Sơn, Quảng Ngãi',
        passportNumber: capt.citizenId,
      });
    } else if (currentUser.role === 'CAPTAIN') {
      initialCrew.push({
        crewId: `CAPTAIN-${currentUser.id}`,
        fullName: currentUser.fullName,
        positionTitle: 'Thuyền trưởng',
        certNumber: '',
        certExpireDate: '',
        nationality: 'Việt Nam',
        birthDate: '',
        birthPlace: 'Lý Sơn, Quảng Ngãi',
        passportNumber: '',
        isTemporary: true,
      });
    }
    if (eng) {
      initialCrew.push({
        crewId: eng.id,
        fullName: eng.fullName,
        positionTitle: 'Máy trưởng',
        certNumber: eng.certNumber,
        certExpireDate: eng.certExpireDate,
        nationality: 'Việt Nam',
        birthDate: eng.birthDate || '1985',
        birthPlace: eng.birthPlace || 'Lý Sơn, Quảng Ngãi',
        passportNumber: eng.citizenId,
      });
    }
    if (deck) {
      initialCrew.push({
        crewId: deck.id,
        fullName: deck.fullName,
        positionTitle: 'Thủy thủ',
        certNumber: deck.certNumber,
        certExpireDate: deck.certExpireDate,
        nationality: 'Việt Nam',
        birthDate: deck.birthDate || '1990',
        birthPlace: deck.birthPlace || 'Quảng Ngãi',
        passportNumber: deck.citizenId,
      });
    }
    return initialCrew;
  });

  // ==========================================
  // BƯỚC 3: HÀNH KHÁCH (DANH SÁCH HÀNH KHÁCH)
  // ==========================================
  const [passengers, setPassengers] = useState<Passenger[]>(() => {
    if (existingTrip?.passengers && existingTrip.passengers.length > 0) {
      return existingTrip.passengers;
    }
    return [];
  });
  const [showFullIdInList, setShowFullIdInList] = useState<boolean>(false);

  // Form thêm khách lẻ
  const [newPaxName, setNewPaxName] = useState<string>('');
  const [newPaxBirthYear, setNewPaxBirthYear] = useState<number>(1990);
  const [newPaxGender, setNewPaxGender] = useState<'NAM' | 'NU' | 'KHAC'>('NAM');
  const [newPaxPhone, setNewPaxPhone] = useState<string>('');
  const [newPaxIdNumber, setNewPaxIdNumber] = useState<string>('');
  const [newPaxIsForeigner, setNewPaxIsForeigner] = useState<boolean>(false);
  const [newPaxAddress, setNewPaxAddress] = useState<string>('Thôn Tây, Lý Sơn, Quảng Ngãi');
  const [newPaxNotes, setNewPaxNotes] = useState<string>('');
  const [showAddPaxForm, setShowAddPaxForm] = useState<boolean>(false);
  const [paxFormError, setPaxFormError] = useState<string>('');
  const [sessionAddedPax, setSessionAddedPax] = useState<Passenger[]>([]);
  const newPaxNameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // BƯỚC 4: HÀNG HÓA VÀ GHI CHÚ
  // ==========================================
  const [cargoTons, setCargoTons] = useState<number>(existingTrip?.cargoTons ?? 0.5);
  const [cargoDescription, setCargoDescription] = useState<string>(
    existingTrip?.cargoDescription || 'Nhu yếu phẩm, rau củ quả tươi, hành tỏi Lý Sơn'
  );
  const [hasTransitCargo, setHasTransitCargo] = useState<boolean>(existingTrip?.hasTransitCargo || false);
  const [transitCargoDescription, setTransitCargoDescription] = useState<string>(
    existingTrip?.transitCargoDescription || ''
  );
  const [actualLifeJackets, setActualLifeJackets] = useState<number>(
    existingTrip?.actualLifeJacketsReported ?? 15
  );

  // ==========================================
  // BƯỚC 5: TẢI LÊN GIẤY TỜ ĐÍNH KÈM (CÓ TÁI SỬ DỤNG GIẤY TỜ DÀI HẠN)
  // ==========================================
  // Hàm sinh danh mục các giấy tờ dài hạn tái sử dụng được (Đăng ký tàu, An toàn KT/BVMT, và Chứng chỉ chuyên môn của các thuyền viên ĐÃ NỘP TRƯỚC ĐÓ & CÒN HẠN)
  const buildReusableDocuments = (
    vesselId?: string,
    captainId?: string,
    targetCrewList = crewMembers,
    currentDocs: UploadedDocument[] = []
  ): UploadedDocument[] => {
    const curVessel = vessels.find((v) => v.id === (vesselId || selectedVesselId)) || vessels[0];
    const safeExpire = curVessel?.registryExpireDate ? formatDate(curVessel.registryExpireDate) : '15/08/2027';

    const crewListToEval =
      targetCrewList && targetCrewList.length > 0
        ? targetCrewList
        : (() => {
            const curCapt = crewCatalog.find((c) => c.id === (captainId || selectedCaptainId)) || crewCatalog[0];
            return curCapt
              ? [
                  {
                    crewId: curCapt.id,
                    fullName: curCapt.fullName,
                    positionTitle: curCapt.positionTitle,
                    certNumber: curCapt.certNumber,
                    certExpireDate: curCapt.certExpireDate,
                  },
                ]
              : [];
          })();

    const crewChecks = evaluateAllCrewCertificates(
      crewListToEval,
      crewCatalog,
      existingTrips,
      currentDocs,
      existingTrip?.id,
      todayIso
    );
    const reusableCrewDocs = buildReusableCrewDocEntries(crewChecks);

    return [
      {
        id: `DOC-REG-${curVessel.id}`,
        category: 'REGISTRATION_CERT',
        categoryName: 'Giấy đăng ký phương tiện thủy nội địa',
        fileName: `GCN_Dang_Ky_Tau_${curVessel.name.replace(/\s+/g, '_')}_${curVessel.regNumber}.pdf`,
        fileType: 'PDF',
        fileSize: '1.8 MB',
        uploadedAt: 'Hồ sơ lưu trữ điện tử',
        isRequired: true,
        isReusable: true,
        reusableSource: 'VESSEL',
        validUntil: 'Hiệu lực lâu dài',
        note: `Số hiệu: ĐK-QN/${curVessel.regNumber.replace('QNg-', '')}-VR-SB • Cảng đăng ký: Quảng Ngãi • Chủ phương tiện: ${curVessel.ownerName}`,
      },
      {
        id: `DOC-SAFE-${curVessel.id}`,
        category: 'TECH_SAFETY_CERT',
        categoryName: 'Giấy CN an toàn kỹ thuật và BVMT',
        fileName: `GCN_AnToanKyThuat_BVMT_${curVessel.name.replace(/\s+/g, '_')}_VR-SB.pdf`,
        fileType: 'PDF',
        fileSize: '2.4 MB',
        uploadedAt: 'Hồ sơ lưu trữ điện tử',
        isRequired: true,
        isReusable: true,
        reusableSource: 'VESSEL',
        validUntil: safeExpire,
        note: `Đăng kiểm VR-SB cấp cho ${curVessel.name} (${curVessel.regNumber}), có hiệu lực đến ngày ${safeExpire}`,
      },
      ...reusableCrewDocs,
    ];
  };

  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>(() => {
    if (existingTrip?.uploadedDocuments && existingTrip.uploadedDocuments.length > 0) {
      return existingTrip.uploadedDocuments;
    }
    const initVessel = vessels[0];
    const initCrewChecks = evaluateAllCrewCertificates(
      crewMembers,
      crewCatalog,
      existingTrips,
      [],
      undefined,
      todayIso
    );
    const initCrewDocs = buildReusableCrewDocEntries(initCrewChecks);
    return [
      {
        id: `DOC-REG-${initVessel.id}`,
        category: 'REGISTRATION_CERT',
        categoryName: 'Giấy đăng ký phương tiện thủy nội địa',
        fileName: `GCN_Dang_Ky_Tau_${initVessel.name.replace(/\s+/g, '_')}_${initVessel.regNumber}.pdf`,
        fileType: 'PDF',
        fileSize: '1.8 MB',
        uploadedAt: 'Hồ sơ lưu trữ điện tử',
        isRequired: true,
        isReusable: true,
        reusableSource: 'VESSEL',
        validUntil: 'Hiệu lực lâu dài',
        note: `Số hiệu: ĐK-QN/${initVessel.regNumber.replace('QNg-', '')}-VR-SB • Cảng đăng ký: Quảng Ngãi • Chủ phương tiện: ${initVessel.ownerName}`,
      },
      {
        id: `DOC-SAFE-${initVessel.id}`,
        category: 'TECH_SAFETY_CERT',
        categoryName: 'Giấy CN an toàn kỹ thuật và BVMT',
        fileName: `GCN_AnToanKyThuat_BVMT_${initVessel.name.replace(/\s+/g, '_')}_VR-SB.pdf`,
        fileType: 'PDF',
        fileSize: '2.4 MB',
        uploadedAt: 'Hồ sơ lưu trữ điện tử',
        isRequired: true,
        isReusable: true,
        reusableSource: 'VESSEL',
        validUntil: formatDate(initVessel.registryExpireDate),
        note: `Đăng kiểm VR-SB cấp cho ${initVessel.name} (${initVessel.regNumber}), có hiệu lực đến ngày ${formatDate(initVessel.registryExpireDate)}`,
      },
      ...initCrewDocs,
      {
        id: 'DOC-FEE-01',
        category: 'FEE_RECEIPT',
        categoryName: 'Giấy tờ / Biên lai nộp phí, lệ phí cảng vụ',
        fileName: 'BienLai_PhiBen_LySon_Chuyen01_2026.pdf',
        fileType: 'PDF',
        fileSize: '620 KB',
        uploadedAt: `${new Date().toLocaleDateString('vi-VN')} 08:15`,
        isRequired: true,
        isReusable: false,
        note: 'Biên lai điện tử số BL-2026-0982 nộp phí bến thủy',
      },
    ];
  });

  // State hỗ trợ form tải tệp ở Bước 5 & mã giao dịch lệ phí (R11)
  const [feeTransactionCode, setFeeTransactionCode] = useState<string>(existingTrip?.feeTransactionCode || '');
  const [selectedDocCategory, setSelectedDocCategory] = useState<UploadedDocument['category']>('FEE_RECEIPT');
  const [selectedCertCrewId, setSelectedCertCrewId] = useState<string>('');
  const [docNoteInput, setDocNoteInput] = useState<string>('');
  const [previewDocModal, setPreviewDocModal] = useState<UploadedDocument | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const step5CrewUploadInputRef = useRef<HTMLInputElement>(null);
  const step5UploadTargetCrewIdRef = useRef<string | null>(null);
  const [uploadingCrewCertId, setUploadingCrewCertId] = useState<string | null>(null);
  const quickUploadCategoryRef = useRef<UploadedDocument['category'] | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<UploadedDocument['category'] | null>(null);

  // ==========================================
  // BƯỚC 6: NỘP HỒ SƠ (THẨM ĐỊNH 12 QUY TẮC & NỘP)
  // ==========================================
  const [acceptedWarningConsent, setAcceptedWarningConsent] = useState<boolean>(false);
  const [step6RuleFilter, setStep6RuleFilter] = useState<'ALL' | 'FAILED' | 'WARNING' | 'PASSED'>('ALL');
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'GENERAL' | 'CREW' | 'PASSENGER'>('GENERAL');

  // Chat hướng dẫn AI state
  const [showAiChatDrawer, setShowAiChatDrawer] = useState<boolean>(false);
  const [aiChatInput, setAiChatInput] = useState<string>('');
  const [aiChatMessages, setAiChatMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: 'Xin chào Thuyền trưởng! Tôi là Trợ lý AI hỗ trợ kê khai hồ sơ cấp lệnh VR-SB (6 bước). Anh/chị cần hướng dẫn điền mục nào, tải giấy tờ hoặc muốn kiểm tra hồ sơ, xin hãy nhắn tại đây!',
    },
  ]);
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);

  // Lấy tàu được chọn
  const selectedVessel = useMemo(() => {
    return vessels.find((v) => v.id === selectedVesselId) || vessels[0];
  }, [vessels, selectedVesselId]);

  // Đánh giá toàn hệ thống trạng thái chứng chỉ của từng thuyền viên trong chuyến
  const crewCertChecks = useMemo(() => {
    return evaluateAllCrewCertificates(
      crewMembers,
      crewCatalog,
      existingTrips,
      uploadedDocuments,
      existingTrip?.id,
      todayIso
    );
  }, [crewMembers, crewCatalog, existingTrips, uploadedDocuments, existingTrip?.id, todayIso]);

  const missingOrExpiredCrewCerts = useMemo(() => {
    return crewCertChecks.filter((c) => c.requiresStep5Upload);
  }, [crewCertChecks]);

  // Cập nhật thông số mớn nước & tự động đồng bộ thuyền trưởng theo tàu khi đổi tàu trên hồ sơ mới
  useEffect(() => {
    if (selectedVessel) {
      if (!existingTrip || existingTrip.vesselId !== selectedVesselId) {
        setDraftForward(selectedVessel.draftForward || 0.6);
        setDraftAft(selectedVessel.draftAft || 0.9);
      }
      if (!existingTrip) {
        setActualLifeJackets(passengers.length + crewMembers.length + 3);
        const vesselCaptain = crewCatalog.find(
          (c) => c.position === 'CAPTAIN' && c.assignedVesselId === selectedVessel.id
        );
        if (vesselCaptain) {
          setSelectedCaptainId(vesselCaptain.id);
          setCrewMembers((prev) => {
            const captainRow = {
              crewId: vesselCaptain.id,
              fullName: vesselCaptain.fullName,
              positionTitle: 'Thuyền trưởng',
              certNumber: vesselCaptain.certNumber,
              certExpireDate: vesselCaptain.certExpireDate,
              nationality: vesselCaptain.nationality || 'Việt Nam',
              birthDate: vesselCaptain.birthDate || '',
              birthPlace: vesselCaptain.birthPlace || 'Lý Sơn, Quảng Ngãi',
              passportNumber: vesselCaptain.citizenId || '',
            };
            const idx = prev.findIndex((m) => m.positionTitle.toLowerCase().includes('thuyền trưởng'));
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...captainRow };
              return next;
            }
            return [captainRow, ...prev];
          });
        }
      }
    }
  }, [selectedVesselId]);

  useEffect(() => {
    if (!selectedVessel) return;
    setUploadedDocuments((prevDocs) => {
      const reusable = buildReusableDocuments(selectedVessel.id, selectedCaptainId, crewMembers, prevDocs);
      // Giữ lại toàn bộ tệp nộp theo chuyến + tệp CREW_CERTIFICATE mới tải trực tiếp tại Bước 5 (id không bắt đầu bằng DOC-CREW-)
      const preserved = prevDocs.filter(
        (d) =>
          (d.category !== 'REGISTRATION_CERT' && d.category !== 'TECH_SAFETY_CERT' && d.category !== 'CREW_CERTIFICATE') ||
          (d.category === 'CREW_CERTIFICATE' && !d.id.startsWith('DOC-CREW-'))
      );
      return [...reusable, ...preserved];
    });
  }, [selectedVesselId, selectedCaptainId, crewMembers, crewCatalog]);

  // Thời gian rời bến ghép từ Ngày + Giờ + Phút
  const fullDepartureTime = useMemo(() => {
    return `${departureDate}T${departureHour}:${departureMinute}`;
  }, [departureDate, departureHour, departureMinute]);

  // Hồ sơ đối tượng hiện tại
  const currentDraftTrip = useMemo<Partial<TripRecord>>(() => {
    const route = routes.find((r) => r.id === selectedRouteId) || routes[0];
    const depPort = ports.find((p) => p.id === departurePortId) || ports[0];
    const arrPort = ports.find((p) => p.id === arrivalPortId) || ports[1];
    const capt =
      currentUser.role === 'CAPTAIN' && userCaptainCrew
        ? userCaptainCrew
        : crewCatalog.find((c) => c.id === selectedCaptainId) || crewCatalog[0];

    return {
      ...(existingTrip || {}),
      id: existingTrip?.id || `TRIP-${Date.now().toString().slice(-6)}`,
      tripNumber: existingTrip?.tripNumber || `HS-2026-${String(existingTrips.length + 1).padStart(4, '0')}`,
      vesselId: selectedVessel?.id,
      vesselName: selectedVessel?.name,
      vesselRegNumber: selectedVessel?.regNumber,
      vesselType: selectedVessel?.vesselType,
      callSign: selectedVessel?.callSign || selectedVessel?.regNumber,
      imoNumber: imoNumber || undefined,
      movementType: movementType,
      tripSeqOfDay: tripSeqOfDay,
      routeId: route?.id,
      routeName: route?.name,
      departurePortId: depPort?.id,
      departurePortName: depPort?.name,
      arrivalPortId: arrPort?.id,
      arrivalPortName: arrPort?.name,
      scheduledDepartureTime: fullDepartureTime,
      createdDate: departureDate,
      captainId: capt.id,
      captainName: currentUser.role === 'CAPTAIN' ? currentUser.fullName : capt.fullName,
      captainCertNo: capt.certNumber,
      captainCertExpireDate: capt.certExpireDate,
      crewMembers: crewMembers,
      passengerCount: passengers.length,
      passengers: passengers,
      cargoTons: cargoTons,
      cargoDescription: cargoDescription,
      hasTransitCargo: hasTransitCargo,
      transitCargoDescription: transitCargoDescription,
      berthLocation: berthLocation,
      draftForward: draftForward,
      draftAft: draftAft,
      deadweightTons: selectedVessel?.deadweightTons || selectedVessel?.maxCargoTons,
      lengthOverall: selectedVessel?.lengthOverall,
      beamMax: selectedVessel?.beamMax,
      airDraft: selectedVessel?.airDraft,
      grossTonnage: selectedVessel?.grossTonnage,
      netTonnage: selectedVessel?.netTonnage,
      actualLifeJacketsReported: actualLifeJackets,
      isDeclaredByPortStaff: declaredByStaff,
      actualDeclarantName: declaredByStaff ? declarantName : currentUser.fullName,
      declarantPhone: declarantPhone,
      staffDeclarationReason: declaredByStaff ? staffReason : undefined,
      uploadedDocuments: uploadedDocuments,
      feeTransactionCode: feeTransactionCode.trim() || undefined,
      confirmedAt: new Date().toISOString(),
      confirmationDevice: navigator.userAgent.includes('Mobile')
        ? 'Điện thoại di động (Mobile Browser)'
        : 'Máy tính cá nhân (Desktop Browser)',
    };
  }, [
    existingTrip,
    existingTrips,
    selectedVessel,
    movementType,
    tripSeqOfDay,
    selectedRouteId,
    departurePortId,
    arrivalPortId,
    fullDepartureTime,
    departureDate,
    selectedCaptainId,
    crewMembers,
    passengers,
    cargoTons,
    cargoDescription,
    hasTransitCargo,
    transitCargoDescription,
    berthLocation,
    draftForward,
    draftAft,
    actualLifeJackets,
    declaredByStaff,
    declarantName,
    declarantPhone,
    staffReason,
    imoNumber,
    uploadedDocuments,
    feeTransactionCode,
    routes,
    ports,
    crewCatalog,
    currentUser,
  ]);

  const activeBpStops = useMemo(
    () => repository.getDeNghiDungs().filter((d) => d.trangThai === 'dang_hieu_luc'),
    [existingTrip?.id, existingTrips.length]
  );

  // Theo quy trình mới (Mục 4.3), Biên phòng chỉ kiểm soát sau khi ĐÃ CẤP PHÉP (DA_CAP_PHEP), không chặn trước cấp phép.
  const isBpBlocked = false;

  // Đánh giá 12 quy tắc an toàn tự động (R1–R12)
  const evaluation = useMemo(() => {
    return RulesEngine.evaluateAllRules(
      currentDraftTrip,
      selectedVessel,
      crewMembers,
      weather,
      existingTrips,
      rulesConfig,
      activeBpStops,
      { context: 'SUBMIT' }
    );
  }, [currentDraftTrip, selectedVessel, crewMembers, weather, existingTrips, rulesConfig, activeBpStops]);

  // Danh sách kết quả kiểm tra Bước 6: chỉ hiển thị các kiểm tra liên quan đến
  // tàu (phương tiện), thuyền viên, hàng hóa và giấy tờ liên quan đến thuyền
  const step6InspectionSummary = useMemo(() => {
    type Step6GroupKey = 'TAU' | 'THUYEN_VIEN' | 'HANG_HOA' | 'GIAY_TO_TAU';
    interface Step6CheckItem {
      code: string;
      groupKey: Step6GroupKey;
      groupTitle: string;
      title: string;
      status: 'PASSED' | 'WARNING' | 'FAILED';
      severity: 'BLOCKING' | 'WARNING' | 'INFO';
      message: string;
      details?: string;
      targetStep: number;
      targetLabel: string;
    }

    const items: Step6CheckItem[] = [];
    const findRule = (code: string) =>
      evaluation.results.find((r) => String(r.ruleCode).toUpperCase() === code);

    const paxCount = passengers.length;
    const crewCount = crewMembers.length;
    const totalPeople = paxCount + crewCount;
    const maxPax = selectedVessel?.maxPassengers ?? 0;
    const minCrew = selectedVessel?.minCrew ?? 2;
    const maxCargo = selectedVessel?.maxCargoTons ?? 0;

    // I. KIỂM TRA TÀU (PHƯƠNG TIỆN)
    const r1 = findRule('R1');
    const overPax = Boolean(selectedVessel && (paxCount > maxPax || totalPeople > maxPax + minCrew));
    if (!selectedVessel) {
      items.push({
        code: 'R1',
        groupKey: 'TAU',
        groupTitle: 'I. Kiểm tra phương tiện (Tàu)',
        title: 'Sức chở hành khách & định mức phương tiện',
        status: 'FAILED',
        severity: 'BLOCKING',
        message: 'Chưa xác định phương tiện VR-SB thực hiện chuyến đi.',
        targetStep: 1,
        targetLabel: 'Bước 1',
      });
    } else if (overPax) {
      items.push({
        code: 'R1',
        groupKey: 'TAU',
        groupTitle: 'I. Kiểm tra phương tiện (Tàu)',
        title: 'Sức chở hành khách & định mức phương tiện',
        status: 'FAILED',
        severity: 'BLOCKING',
        message: `Vượt sức chở tàu ${selectedVessel.name}: ${paxCount} hành khách (tổng ${totalPeople} người) vượt định mức tối đa ${maxPax} khách.`,
        details: 'Nghiêm cấm chở quá số người cho phép theo giấy chứng nhận an toàn kỹ thuật.',
        targetStep: 3,
        targetLabel: 'Bước 3',
      });
    } else {
      items.push({
        code: 'R1',
        groupKey: 'TAU',
        groupTitle: 'I. Kiểm tra phương tiện (Tàu)',
        title: 'Sức chở hành khách & định mức phương tiện',
        status: 'PASSED',
        severity: 'INFO',
        message: `Hợp lệ: ${paxCount}/${maxPax} hành khách (tổng ${totalPeople} người trên tàu ${selectedVessel.name}).`,
        details: r1 && r1.status === 'PASSED' ? r1.details : undefined,
        targetStep: 3,
        targetLabel: 'Bước 3',
      });
    }

    const lifeJacketsShort = actualLifeJackets < totalPeople;
    items.push({
      code: 'TB-TAU',
      groupKey: 'TAU',
      groupTitle: 'I. Kiểm tra phương tiện (Tàu)',
      title: 'Trang bị áo phao cứu sinh trên tàu',
      status: lifeJacketsShort ? 'FAILED' : 'PASSED',
      severity: lifeJacketsShort ? 'BLOCKING' : 'INFO',
      message: lifeJacketsShort
        ? `Thiếu áo phao cứu sinh: Hiện khai báo ${actualLifeJackets} cái, cần tối thiểu ${totalPeople} cái cho ${totalPeople} người trên tàu.`
        : `Đủ trang bị cứu sinh: ${actualLifeJackets} áo phao (yêu cầu tối thiểu ${totalPeople} cái cho ${paxCount} khách + ${crewCount} thuyền viên).`,
      targetStep: 4,
      targetLabel: 'Bước 4',
    });

    const r5 = findRule('R5');
    if (r5) {
      items.push({
        code: 'R5',
        groupKey: 'TAU',
        groupTitle: 'I. Kiểm tra phương tiện (Tàu)',
        title: r5.ruleName,
        status: r5.status,
        severity: r5.severity,
        message: r5.message,
        details: r5.details,
        targetStep: 1,
        targetLabel: 'Bước 1',
      });
    }

    // II. KIỂM TRA THUYỀN VIÊN
    const r3 = findRule('R3');
    if (r3) {
      items.push({
        code: 'R3',
        groupKey: 'THUYEN_VIEN',
        groupTitle: 'II. Kiểm tra thuyền viên',
        title: r3.ruleName,
        status: r3.status,
        severity: r3.severity,
        message: r3.message,
        details: r3.details,
        targetStep: 2,
        targetLabel: 'Bước 2',
      });
    }

    const r4 = findRule('R4');
    if (r4) {
      let r4Message = r4.message;
      if (r4.status === 'FAILED') {
        const tripMap = new Map<string, string>();
        const regex = /đang tham gia chuyến\s+([^\s(;.,]+)(?:\s*\(([^)]+)\))?/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(r4.message)) !== null) {
          const tripCode = match[1]?.trim();
          const vesselLabel = match[2]?.trim() || '';
          if (tripCode && !tripMap.has(tripCode)) {
            tripMap.set(tripCode, vesselLabel);
          }
        }
        const uniqueTrips = Array.from(tripMap.entries());
        if (uniqueTrips.length === 1) {
          const [code, vesselLabel] = uniqueTrips[0];
          r4Message = vesselLabel ? `Trùng chuyến: ${code} (${vesselLabel})` : `Trùng chuyến: ${code}`;
        } else if (uniqueTrips.length > 1) {
          const shownCodes = uniqueTrips.slice(0, 3).map(([code]) => code);
          const extraCount = uniqueTrips.length - shownCodes.length;
          r4Message =
            extraCount > 0
              ? `Trùng chuyến: ${shownCodes.join(', ')} (+${extraCount} chuyến khác)`
              : `Trùng chuyến: ${shownCodes.join(', ')}`;
        }
      }
      items.push({
        code: 'R4',
        groupKey: 'THUYEN_VIEN',
        groupTitle: 'II. Kiểm tra thuyền viên',
        title: 'Thuyền viên trên chuyến chưa kết thúc',
        status: r4.status,
        severity: r4.severity,
        message: r4Message,
        details: undefined,
        targetStep: 2,
        targetLabel: 'Bước 2',
      });
    }

    if (missingOrExpiredCrewCerts.length > 0) {
      const detailList = missingOrExpiredCrewCerts
        .map((c) => `${c.fullName || c.positionTitle} (${c.reasonText})`)
        .join('; ');
      items.push({
        code: 'GT-TV',
        groupKey: 'THUYEN_VIEN',
        groupTitle: 'II. Kiểm tra thuyền viên',
        title: 'Tệp chứng chỉ chuyên môn thuyền viên trực ca',
        status: 'FAILED',
        severity: 'BLOCKING',
        message: `Còn ${missingOrExpiredCrewCerts.length}/${crewCount} thuyền viên chưa có tệp chứng chỉ hợp lệ hoặc chứng chỉ đã hết hạn.`,
        details: detailList,
        targetStep: 5,
        targetLabel: 'Bước 5',
      });
    } else {
      items.push({
        code: 'GT-TV',
        groupKey: 'THUYEN_VIEN',
        groupTitle: 'II. Kiểm tra thuyền viên',
        title: 'Tệp chứng chỉ chuyên môn thuyền viên trực ca',
        status: 'PASSED',
        severity: 'INFO',
        message: `Đầy đủ chứng chỉ chuyên môn hợp lệ cho toàn bộ ${crewCount} thuyền viên trực ca.`,
        targetStep: 5,
        targetLabel: 'Bước 5',
      });
    }

    // III. KIỂM TRA HÀNG HÓA
    const numericCargo = Number(cargoTons || 0);
    const overCargo = Boolean(selectedVessel && numericCargo > maxCargo);
    const missingCargoDesc = numericCargo > 0 && !cargoDescription.trim();
    if (overCargo) {
      items.push({
        code: 'HH-01',
        groupKey: 'HANG_HOA',
        groupTitle: 'III. Kiểm tra hàng hóa',
        title: 'Trọng tải & kê khai hàng hóa xếp trên tàu',
        status: 'FAILED',
        severity: 'BLOCKING',
        message: `Vượt trọng tải hàng hóa cho phép: Đang khai ${numericCargo} tấn, vượt mức tối đa ${maxCargo} tấn của tàu ${selectedVessel?.name || ''}.`,
        details: 'Cần giảm khối lượng hàng hóa về đúng giới hạn trọng tải an toàn tại Bước 4.',
        targetStep: 4,
        targetLabel: 'Bước 4',
      });
    } else if (missingCargoDesc) {
      items.push({
        code: 'HH-01',
        groupKey: 'HANG_HOA',
        groupTitle: 'III. Kiểm tra hàng hóa',
        title: 'Trọng tải & kê khai hàng hóa xếp trên tàu',
        status: 'WARNING',
        severity: 'WARNING',
        message: `Khối lượng hàng hóa ${numericCargo}/${maxCargo} tấn đạt định mức nhưng chưa nhập mô tả loại hàng hóa.`,
        details: 'Khuyến nghị ghi rõ loại hàng hóa xếp trên tàu tại Bước 4 để thuận tiện đối chiếu.',
        targetStep: 4,
        targetLabel: 'Bước 4',
      });
    } else {
      items.push({
        code: 'HH-01',
        groupKey: 'HANG_HOA',
        groupTitle: 'III. Kiểm tra hàng hóa',
        title: 'Trọng tải & kê khai hàng hóa xếp trên tàu',
        status: 'PASSED',
        severity: 'INFO',
        message:
          numericCargo > 0
            ? `Hợp lệ: ${numericCargo}/${maxCargo} tấn hàng hóa (${cargoDescription.trim()}).`
            : `Hợp lệ: Không chở hàng hóa (0/${maxCargo} tấn).`,
        targetStep: 4,
        targetLabel: 'Bước 4',
      });
    }

    // IV. KIỂM TRA GIẤY TỜ LIÊN QUAN ĐẾN THUYỀN
    const r2 = findRule('R2');
    if (r2) {
      items.push({
        code: 'R2',
        groupKey: 'GIAY_TO_TAU',
        groupTitle: 'IV. Kiểm tra giấy tờ liên quan đến thuyền',
        title: r2.ruleName,
        status: r2.status,
        severity: r2.severity,
        message: r2.message,
        details: r2.details,
        targetStep: 5,
        targetLabel: 'Bước 5',
      });
    }

    const r6 = findRule('R6');
    if (r6) {
      items.push({
        code: 'R6',
        groupKey: 'GIAY_TO_TAU',
        groupTitle: 'IV. Kiểm tra giấy tờ liên quan đến thuyền',
        title: r6.ruleName,
        status: r6.status,
        severity: r6.severity,
        message: r6.message,
        details: r6.details,
        targetStep: 5,
        targetLabel: 'Bước 5',
      });
    }

    const regDoc = uploadedDocuments.find((d) => d.category === 'REGISTRATION_CERT');
    const safetyDoc = uploadedDocuments.find((d) => d.category === 'TECH_SAFETY_CERT');
    const insuranceDoc = uploadedDocuments.find((d) => d.category === 'CIVIL_INSURANCE');
    const missingVesselDocNames: string[] = [];
    if (!regDoc) missingVesselDocNames.push('GCN Đăng ký phương tiện');
    if (!safetyDoc) missingVesselDocNames.push('GCN ATKT & BVMT (Đăng kiểm)');
    if (!insuranceDoc) missingVesselDocNames.push('Bảo hiểm TNDS');

    if (!regDoc || !safetyDoc) {
      items.push({
        code: 'GT-TAU',
        groupKey: 'GIAY_TO_TAU',
        groupTitle: 'IV. Kiểm tra giấy tờ liên quan đến thuyền',
        title: 'Hồ sơ giấy tờ phương tiện đính kèm',
        status: 'FAILED',
        severity: 'BLOCKING',
        message: `Chưa đính kèm đủ giấy tờ tàu bắt buộc: ${missingVesselDocNames.join(', ')}.`,
        details: 'Cần bổ sung hoặc đồng bộ giấy tờ tàu tại Bước 5 trước khi gửi hồ sơ.',
        targetStep: 5,
        targetLabel: 'Bước 5',
      });
    } else if (!insuranceDoc) {
      items.push({
        code: 'GT-TAU',
        groupKey: 'GIAY_TO_TAU',
        groupTitle: 'IV. Kiểm tra giấy tờ liên quan đến thuyền',
        title: 'Hồ sơ giấy tờ phương tiện đính kèm',
        status: 'WARNING',
        severity: 'WARNING',
        message: 'Đã đính kèm GCN Đăng ký và GCN ATKT & BVMT; chưa đính kèm tệp Bảo hiểm TNDS.',
        details: 'Khuyến nghị bổ sung bản chụp/PDF Bảo hiểm TNDS của tàu tại Bước 5.',
        targetStep: 5,
        targetLabel: 'Bước 5',
      });
    } else {
      items.push({
        code: 'GT-TAU',
        groupKey: 'GIAY_TO_TAU',
        groupTitle: 'IV. Kiểm tra giấy tờ liên quan đến thuyền',
        title: 'Hồ sơ giấy tờ phương tiện đính kèm',
        status: 'PASSED',
        severity: 'INFO',
        message: 'Đã đính kèm đầy đủ GCN Đăng ký phương tiện, GCN ATKT & BVMT (Đăng kiểm) và Bảo hiểm TNDS.',
        targetStep: 5,
        targetLabel: 'Bước 5',
      });
    }

    const passedCount = items.filter((i) => i.status === 'PASSED').length;
    const warningCount = items.filter((i) => i.status === 'WARNING').length;
    const blockingCount = items.filter((i) => i.status === 'FAILED').length;

    return {
      items,
      totalCount: items.length,
      passedCount,
      warningCount,
      blockingCount,
      hasBlockingFailure: blockingCount > 0,
      hasWarning: warningCount > 0,
    };
  }, [
    evaluation.results,
    selectedVessel,
    passengers.length,
    crewMembers.length,
    actualLifeJackets,
    cargoTons,
    cargoDescription,
    uploadedDocuments,
    missingOrExpiredCrewCerts,
  ]);

  // ==========================================
  // THAO TÁC HÀNH KHÁCH
  // ==========================================
  const openAddPassengerModal = () => {
    setPaxFormError('');
    setSessionAddedPax([]);
    setShowAddPaxForm(true);
    setTimeout(() => {
      newPaxNameInputRef.current?.focus();
    }, 50);
  };

  const closeAddPassengerModal = () => {
    setShowAddPaxForm(false);
    setPaxFormError('');
    setSessionAddedPax([]);
  };

  useEffect(() => {
    if (!showAddPaxForm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAddPassengerModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddPaxForm]);

  const handleAddPassenger = (keepOpen: boolean = false) => {
    if (!newPaxName.trim()) {
      setPaxFormError('Vui lòng nhập họ và tên hành khách.');
      newPaxNameInputRef.current?.focus();
      return;
    }
    const parsedYear = Number(newPaxBirthYear);
    if (!Number.isFinite(parsedYear) || parsedYear < 1900 || parsedYear > 2026) {
      setPaxFormError('Năm sinh không hợp lệ (từ 1900 đến 2026).');
      return;
    }
    const newPax: Passenger = {
      id: `PAX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      fullName: newPaxName.trim(),
      birthYear: parsedYear,
      gender: newPaxGender,
      phone: newPaxPhone.trim() || '0988000111',
      idNumber: newPaxIdNumber.trim() || `0510${Math.floor(10000000 + Math.random() * 90000000)}`,
      isForeigner: newPaxIsForeigner,
      nationality: newPaxIsForeigner ? 'Nước ngoài' : 'Việt Nam',
      address: newPaxAddress.trim() || 'Lý Sơn, Quảng Ngãi',
      notes: newPaxNotes.trim(),
    };

    setPassengers((prev) => [...prev, newPax]);
    setNewPaxName('');
    setNewPaxPhone('');
    setNewPaxIdNumber('');
    setNewPaxNotes('');
    setPaxFormError('');

    if (keepOpen) {
      setSessionAddedPax((prev) => [newPax, ...prev]);
      setTimeout(() => {
        newPaxNameInputRef.current?.focus();
      }, 40);
    } else {
      closeAddPassengerModal();
      showToast('success', `Đã thêm hành khách ${newPax.fullName} vào danh sách.`);
    }
  };

  const handleRemovePassenger = (id: string) => {
    setPassengers((prev) => prev.filter((p) => p.id !== id));
    setSessionAddedPax((prev) => prev.filter((p) => p.id !== id));
  };

  const handleInsertFrequentPassengers = () => {
    const frequent = repository.getFrequentPassengers();
    if (frequent.length === 0) {
      showToast('info', 'Chưa có hành khách quen nào được lưu trên máy.');
      return;
    }
    const maxCapacity = selectedVessel?.maxPassengers || 10;
    const needed = Math.max(0, maxCapacity - passengers.length);
    if (needed === 0) {
      showToast('info', `Đã đủ ${passengers.length} hành khách (đạt sức chở ${maxCapacity} người).`);
      return;
    }
    const toAdd = frequent.slice(0, needed);
    setPassengers([...passengers, ...toAdd]);
    showToast('success', `Đã chèn thêm ${toAdd.length} hành khách quen vào danh sách!`);
  };

  const handleDownloadExcelTemplate = () => {
    const sampleRows = [
      {
        'Họ và tên': 'Nguyễn Văn An',
        'Năm sinh': 1985,
        'Giới tính (Nam/Nữ)': 'Nam',
        'Quốc tịch': 'Việt Nam',
        'Địa chỉ': 'Thôn Tây, Lý Sơn',
        'Số điện thoại': '0988123456',
        'Số CCCD / Hộ chiếu': '051085001234',
        'Ghi chú': 'Khách du lịch',
      },
      {
        'Họ và tên': 'Trần Thị Bích',
        'Năm sinh': 1992,
        'Giới tính (Nam/Nữ)': 'Nữ',
        'Quốc tịch': 'Việt Nam',
        'Địa chỉ': 'TP Quảng Ngãi',
        'Số điện thoại': '0912345678',
        'Số CCCD / Hộ chiếu': '051092005678',
        'Ghi chú': '',
      },
      {
        'Họ và tên': 'John Smith',
        'Năm sinh': 1988,
        'Giới tính (Nam/Nữ)': 'Nam',
        'Quốc tịch': 'Anh',
        'Địa chỉ': 'Khách sạn Central Lý Sơn',
        'Số điện thoại': '0905999888',
        'Số CCCD / Hộ chiếu': 'P987654321',
        'Ghi chú': 'Khách nước ngoài',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DS_Hanh_Khach_Mau');
    XLSX.writeFile(workbook, 'Mau_Danh_Sach_Hanh_Khach_VRSB.xlsx');
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        if (data.length === 0) {
          showToast('error', 'Tệp Excel không có dòng dữ liệu nào.');
          return;
        }

        const imported: Passenger[] = data.map((row, idx) => {
          const name = row['Họ và tên'] || row['Họ tên'] || row['Ho va ten'] || `Hành khách ${idx + 1}`;
          const year = parseInt(row['Năm sinh'] || row['Nam sinh'] || '1990', 10);
          const genderRaw = String(row['Giới tính (Nam/Nữ)'] || row['Giới tính'] || 'Nam').toLowerCase();
          const gender: 'NAM' | 'NU' | 'KHAC' = genderRaw.includes('nữ') || genderRaw === 'nu' ? 'NU' : 'NAM';
          const nat = row['Quốc tịch'] || 'Việt Nam';
          const isForeign = nat.toLowerCase() !== 'việt nam' && nat.toLowerCase() !== 'viet nam';
          const phone = String(row['Số điện thoại'] || row['SĐT'] || '0988111222');
          const idNum = String(row['Số CCCD / Hộ chiếu'] || row['CCCD'] || `0510${Math.floor(10000000 + Math.random() * 90000000)}`);
          const addr = row['Địa chỉ'] || 'Lý Sơn, Quảng Ngãi';

          return {
            id: `PAX-EXCEL-${Date.now()}-${idx}`,
            fullName: name,
            birthYear: isNaN(year) ? 1990 : year,
            gender: gender,
            phone: phone,
            idNumber: idNum,
            isForeigner: isForeign,
            nationality: nat,
            address: addr,
            notes: row['Ghi chú'] || '',
          };
        });

        setPassengers(imported);
        showToast('success', `Đã nhập thành công ${imported.length} hành khách từ tệp Excel!`);
      } catch (err) {
        showToast('error', 'Lỗi đọc tệp Excel. Vui lòng tải file mẫu để kiểm tra định dạng cột.');
      }
    };
    reader.readAsBinaryString(file);
    if (e.target) e.target.value = '';
  };

  // ==========================================
  // THAO TÁC GIẤY TỜ ĐÍNH KÈM (BƯỚC 5)
  // ==========================================
  const categoryNamesMap: Record<UploadedDocument['category'], string> = {
    REGISTRATION_CERT: 'Giấy chứng nhận đăng ký phương tiện',
    TECH_SAFETY_CERT: 'Giấy CN an toàn kỹ thuật và BVMT',
    CREW_CERTIFICATE: 'Chứng chỉ chuyên môn thuyền viên',
    FEE_RECEIPT: 'Giấy tờ / Biên lai nộp phí, lệ phí cảng vụ',
    CIVIL_INSURANCE: 'Giấy chứng nhận bảo hiểm trách nhiệm dân sự',
    OTHER: 'Giấy tờ, biên bản khác',
  };

  const uploadCrewCertificateForMember = async (crewId: string, file: File) => {
    const saved = await fileStorageService.saveUploadedFile(file, `crew_step5_${crewId}`);
    const tripCrew = crewMembers.find((cm) => cm.crewId === crewId);
    const catalogCrew =
      repository.getCrewById(crewId) || crewCatalog.find((c) => c.id === crewId);

    const effectiveExpire =
      tripCrew?.certExpireDate && tripCrew.certExpireDate >= todayIso
        ? tripCrew.certExpireDate
        : catalogCrew?.certExpireDate && catalogCrew.certExpireDate >= todayIso
        ? catalogCrew.certExpireDate
        : tripCrew?.certExpireDate || catalogCrew?.certExpireDate || '';

    const noteText =
      docNoteInput.trim() ||
      `Chứng chỉ ${tripCrew?.positionTitle || catalogCrew?.positionTitle || 'thuyền viên'}: ${
        tripCrew?.fullName || catalogCrew?.fullName || ''
      } (${tripCrew?.certNumber || catalogCrew?.certNumber || ''})`;

    const docId = `DOC-${Date.now()}`;
    const draftTripNumber =
      currentDraftTrip.tripNumber || `HS-2026-${String(existingTrips.length + 1).padStart(4, '0')}`;
    let serverMeta: { serverUrl?: string; serverPath?: string; serverStoredName?: string } = {};
    try {
      const srv = await dossierArchiveService.uploadBlobToDossier(draftTripNumber, 'giay-to', file, {
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        category: 'CREW_CERTIFICATE',
        categoryName: `Chứng chỉ ${tripCrew?.positionTitle || 'thuyền viên'}`,
        docId,
        note: noteText,
        uploadedByName: currentUser.fullName,
      });
      serverMeta = {
        serverUrl: srv.downloadUrl,
        serverPath: srv.relativePath,
        serverStoredName: srv.storedFileName,
      };
    } catch {
      // Giữ lưu cục bộ IndexedDB nếu chưa kết nối phiên máy chủ
    }

    const newDoc: UploadedDocument = {
      id: docId,
      category: 'CREW_CERTIFICATE',
      categoryName: `Chứng chỉ ${tripCrew?.positionTitle || 'thuyền viên'}`,
      fileName: saved.fileName,
      fileType: saved.fileType,
      fileSize: saved.fileSize,
      uploadedAt: saved.uploadedAt,
      previewUrl: saved.previewUrl,
      storageKey: saved.storageKey,
      ...serverMeta,
      mimeType: saved.mimeType,
      crewId,
      isRequired: true,
      isReusable: true,
      reusableSource: 'CREW',
      validUntil: effectiveExpire ? formatDate(effectiveExpire) : undefined,
      note: noteText,
    };

    setUploadedDocuments((prev) => [
      ...prev.filter((d) => !(d.category === 'CREW_CERTIFICATE' && d.crewId === crewId)),
      newDoc,
    ]);

    // Đồng bộ ngay vào danh sách thuyền viên trong chuyến và Danh mục Thuyền viên hệ thống
    setCrewMembers((prev) =>
      prev.map((cm) =>
        cm.crewId === crewId
          ? {
              ...cm,
              isTemporary: false,
            }
          : cm
      )
    );

    if (tripCrew || catalogCrew) {
      const updatedCrewList = crewMembers.map((cm) =>
        cm.crewId === crewId ? { ...cm, isTemporary: false } : cm
      );
      syncTripCrewAndCertificatesToSystem(
        updatedCrewList,
        selectedVesselId,
        [...uploadedDocuments.filter((d) => !(d.category === 'CREW_CERTIFICATE' && d.crewId === crewId)), newDoc],
        currentUser
      );
    }

    setPreviewDocModal(newDoc);
  };

  const resolveCrewCertDoc = (
    cm: { crewId: string; fullName: string; positionTitle: string; certNumber: string; certExpireDate: string },
    certCheck?: (typeof crewCertChecks)[number]
  ): UploadedDocument | undefined => {
    if (certCheck?.currentStep5Doc) return certCheck.currentStep5Doc;
    const fromUploaded = uploadedDocuments.find(
      (d) =>
        d.category === 'CREW_CERTIFICATE' &&
        (d.crewId === cm.crewId ||
          (certCheck?.matchedCatalogCrew?.id && d.crewId === certCheck.matchedCatalogCrew.id))
    );
    if (fromUploaded) return fromUploaded;
    const att = certCheck?.reusableAttachment || certCheck?.matchedCatalogCrew?.certDocument;
    if (!att) return undefined;
    return {
      id: `DOC-CREW-${certCheck?.matchedCatalogCrew?.id || cm.crewId}`,
      category: 'CREW_CERTIFICATE',
      categoryName: `Chứng chỉ ${cm.positionTitle || 'thuyền viên'}`,
      fileName: att.fileName,
      fileType: att.fileType,
      fileSize: att.fileSize,
      uploadedAt: att.uploadedAt,
      previewUrl: att.previewUrl,
      storageKey: att.storageKey,
      serverUrl: att.serverUrl,
      serverPath: att.serverPath,
      mimeType: att.mimeType,
      crewId: certCheck?.matchedCatalogCrew?.id || cm.crewId,
      isRequired: true,
      isReusable: true,
      reusableSource: 'CREW',
      validUntil: cm.certExpireDate ? formatDate(cm.certExpireDate) : undefined,
      note:
        att.note ||
        `${cm.positionTitle}: ${cm.fullName} • Số bằng ${cm.certNumber}`,
    };
  };

  const triggerCrewCertUpload = (crewId: string) => {
    step5UploadTargetCrewIdRef.current = crewId;
    step5CrewUploadInputRef.current?.click();
  };

  const handleStep5CrewFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetCrewId = step5UploadTargetCrewIdRef.current;
    e.target.value = '';
    if (!file || !targetCrewId) return;
    setUploadingCrewCertId(targetCrewId);
    try {
      await uploadCrewCertificateForMember(targetCrewId, file);
      const targetMember = crewMembers.find((c) => c.crewId === targetCrewId);
      showToast(
        'success',
        `Đã tải giấy chứng nhận "${file.name}" cho ${targetMember?.fullName || 'thuyền viên'} và lưu hệ thống để tự động đọc lại cho các chuyến sau.`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Không thể tải tệp chứng chỉ lên.');
    } finally {
      setUploadingCrewCertId(null);
    }
  };

  const triggerCategoryDocUpload = (
    category: UploadedDocument['category'],
    useCamera = false
  ) => {
    quickUploadCategoryRef.current = category;
    setSelectedDocCategory(category);
    if (useCamera) {
      cameraInputRef.current?.click();
    } else {
      docFileInputRef.current?.click();
    }
  };

  const handleAddUploadedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    const targetCategory = quickUploadCategoryRef.current || selectedDocCategory;
    quickUploadCategoryRef.current = null;
    if (!file) return;

    setUploadingCategory(targetCategory);
    try {
      if (targetCategory === 'CREW_CERTIFICATE') {
        const targetCrewId = selectedCertCrewId || crewMembers[0]?.crewId || selectedCaptainId;
        await uploadCrewCertificateForMember(targetCrewId, file);
        setDocNoteInput('');
        return;
      }

      const saved = await fileStorageService.saveUploadedFile(
        file,
        `trip_${targetCategory.toLowerCase()}`
      );

      const docId = `DOC-${Date.now()}`;
      const draftTripNumber =
        currentDraftTrip.tripNumber || `HS-2026-${String(existingTrips.length + 1).padStart(4, '0')}`;
      let serverMeta: { serverUrl?: string; serverPath?: string; serverStoredName?: string } = {};
      try {
        const srv = await dossierArchiveService.uploadBlobToDossier(draftTripNumber, 'giay-to', file, {
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          category: targetCategory,
          categoryName: categoryNamesMap[targetCategory],
          docId,
          note: docNoteInput.trim() || undefined,
          uploadedByName: currentUser.fullName,
        });
        serverMeta = {
          serverUrl: srv.downloadUrl,
          serverPath: srv.relativePath,
          serverStoredName: srv.storedFileName,
        };
      } catch {
        // Giữ lưu cục bộ IndexedDB nếu chưa kết nối phiên máy chủ
      }

      const newDoc: UploadedDocument = {
        id: docId,
        category: targetCategory,
        categoryName: categoryNamesMap[targetCategory],
        fileName: saved.fileName,
        fileType: saved.fileType,
        fileSize: saved.fileSize,
        uploadedAt: saved.uploadedAt,
        previewUrl: saved.previewUrl,
        storageKey: saved.storageKey,
        ...serverMeta,
        mimeType: saved.mimeType,
        isRequired: ['REGISTRATION_CERT', 'TECH_SAFETY_CERT', 'CREW_CERTIFICATE', 'FEE_RECEIPT'].includes(targetCategory),
        isReusable: targetCategory === 'REGISTRATION_CERT' || targetCategory === 'TECH_SAFETY_CERT' || targetCategory === 'CIVIL_INSURANCE',
        reusableSource: 'MANUAL',
        note: docNoteInput.trim() || undefined,
      };

      setUploadedDocuments((prev) => {
        if (targetCategory === 'REGISTRATION_CERT' || targetCategory === 'TECH_SAFETY_CERT' || targetCategory === 'CIVIL_INSURANCE') {
          return [...prev.filter((d) => d.category !== targetCategory), newDoc];
        }
        return [...prev, newDoc];
      });
      setDocNoteInput('');
      setPreviewDocModal(newDoc);
      showToast('success', `Đã bổ sung "${saved.fileName}" vào mục ${categoryNamesMap[targetCategory]}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Không thể tải tệp lên. Vui lòng chọn tệp PDF hoặc ảnh hợp lệ (<= 15MB).');
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleRemoveUploadedDoc = (id: string) => {
    setUploadedDocuments(uploadedDocuments.filter((d) => d.id !== id));
  };

  // Tự động nạp/dùng lại các giấy tờ dài hạn (Đăng ký phương tiện, An toàn KT/BVMT, Chứng chỉ chuyên môn còn hạn)
  const handleReloadDefaultShipDocs = () => {
    const reusable = buildReusableDocuments(selectedVesselId, selectedCaptainId, crewMembers, uploadedDocuments);
    const preserved = uploadedDocuments.filter(
      (d) =>
        (d.category !== 'REGISTRATION_CERT' && d.category !== 'TECH_SAFETY_CERT' && d.category !== 'CREW_CERTIFICATE') ||
        (d.category === 'CREW_CERTIFICATE' && !d.id.startsWith('DOC-CREW-'))
    );
    // Nếu chưa có biên lai lệ phí chuyến này, tạo biên lai mẫu để hoàn thiện hồ sơ
    if (!preserved.some((d) => d.category === 'FEE_RECEIPT')) {
      preserved.push({
        id: `DOC-FEE-${Date.now()}`,
        category: 'FEE_RECEIPT',
        categoryName: 'Giấy tờ / Biên lai nộp phí, lệ phí cảng vụ',
        fileName: `BienLai_PhiBen_${selectedVessel?.regNumber || 'QNg'}_${new Date().toISOString().slice(0, 10)}.pdf`,
        fileType: 'PDF',
        fileSize: '620 KB',
        uploadedAt: `${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
        isRequired: true,
        isReusable: false,
        note: 'Biên lai điện tử số BL-2026-0982 nộp phí bến thủy',
      });
    }

    setUploadedDocuments([...reusable, ...preserved]);
    const reusedCount = crewCertChecks.filter((c) => c.canReuse).length;
    const reqCount = crewCertChecks.filter((c) => c.requiresStep5Upload).length;
    showToast(
      reqCount > 0 ? 'info' : 'success',
      reqCount > 0
        ? `Đã đồng bộ giấy tờ tàu ${selectedVessel?.name} và tự động dùng lại ${reusedCount} chứng chỉ còn hạn. Lưu ý: Còn ${reqCount} thuyền viên chưa có chứng chỉ hợp lệ cần bổ sung bên dưới.`
        : `Đã đồng bộ và dùng lại thành công toàn bộ giấy tờ tàu ${selectedVessel?.name} và ${reusedCount} chứng chỉ thuyền viên còn hạn!`
    );
  };

  // ==========================================
  // SAO CHÉP & THỬ NGHIỆM KỊCH BẢN
  // ==========================================
  const handleCopyFromPreviousTrip = () => {
    const prev = repository.getLatestTripForVessel(selectedVesselId);
    if (!prev) {
      showToast('info', `Tàu ${selectedVessel?.name} chưa có chuyến đi nào trước đó để sao chép.`);
      return;
    }
    setPendingCopyTrip(prev);
  };

  const handleConfirmCopyFromPreviousTrip = () => {
    const prev = pendingCopyTrip;
    if (!prev) return;
    setPendingCopyTrip(null);

    setCrewMembers(
      prev.crewMembers.map((c, idx) => {
        if (idx === 0 && currentUser.role === 'CAPTAIN') {
          return {
            crewId: userCaptainCrew?.id || c.crewId,
            fullName: currentUser.fullName,
            positionTitle: 'Thuyền trưởng',
            certNumber: userCaptainCrew?.certNumber || c.certNumber,
            certExpireDate: userCaptainCrew?.certExpireDate || c.certExpireDate,
            nationality: c.nationality || 'Việt Nam',
            birthDate: c.birthDate || '1980',
            birthPlace: c.birthPlace || 'Lý Sơn, Quảng Ngãi',
            passportNumber: userCaptainCrew?.citizenId || c.passportNumber || '',
          };
        }
        return {
          crewId: c.crewId,
          fullName: c.fullName,
          positionTitle: c.positionTitle,
          certNumber: c.certNumber,
          certExpireDate: c.certExpireDate,
          nationality: c.nationality || 'Việt Nam',
          birthDate: c.birthDate || '1982',
          birthPlace: c.birthPlace || 'Quảng Ngãi',
          passportNumber: c.passportNumber || '',
        };
      })
    );
    setCargoTons(prev.cargoTons);
    setCargoDescription(prev.cargoDescription || '');
    setTripSeqOfDay((prev.tripSeqOfDay || 1) + 1);
    if (prev.uploadedDocuments) {
      setUploadedDocuments(prev.uploadedDocuments);
    }
    showToast('success', 'Đã sao chép thành công! Thông tin đội ngũ, hàng hóa và giấy tờ đã được nạp sẵn.');
  };

  const handleCopyCrewFromPrevious = () => {
    const prev = repository.getLatestTripForVessel(selectedVesselId);
    if (!prev || !prev.crewMembers || prev.crewMembers.length === 0) {
      showToast('info', 'Chưa có danh sách thuyền viên chuyến trước của tàu này.');
      return;
    }
    setCrewMembers(
      prev.crewMembers.map((c, idx) => {
        if (idx === 0 && currentUser.role === 'CAPTAIN') {
          return {
            crewId: userCaptainCrew?.id || c.crewId,
            fullName: currentUser.fullName,
            positionTitle: 'Thuyền trưởng',
            certNumber: userCaptainCrew?.certNumber || c.certNumber,
            certExpireDate: userCaptainCrew?.certExpireDate || c.certExpireDate,
            nationality: c.nationality || 'Việt Nam',
            birthDate: c.birthDate || '1980',
            birthPlace: c.birthPlace || 'Lý Sơn, Quảng Ngãi',
            passportNumber: userCaptainCrew?.citizenId || c.passportNumber || '',
          };
        }
        return {
          crewId: c.crewId,
          fullName: c.fullName,
          positionTitle: c.positionTitle,
          certNumber: c.certNumber,
          certExpireDate: c.certExpireDate,
          nationality: c.nationality || 'Việt Nam',
          birthDate: c.birthDate || '1982',
          birthPlace: c.birthPlace || 'Quảng Ngãi',
          passportNumber: c.passportNumber || '',
        };
      })
    );
    showToast('success', 'Đã nạp nguyên đội ngũ thuyền viên của chuyến gần nhất!');
  };

  // Nạp 4 kịch bản kiểm thử nhanh
  const loadScenario = (type: 'SCENARIO_EMPTY_CREW' | 'SCENARIO_OVERLOAD' | 'SCENARIO_INVALID_TIME' | 'SCENARIO_VALID') => {
    if (type === 'SCENARIO_VALID') {
      setSelectedVesselId('VES-01');
      const validTarget = new Date(Date.now() + 45 * 60 * 1000);
      const vYear = validTarget.getFullYear();
      const vMonth = String(validTarget.getMonth() + 1).padStart(2, '0');
      const vDay = String(validTarget.getDate()).padStart(2, '0');
      const vHour = String(validTarget.getHours()).padStart(2, '0');
      const vMins = Math.ceil(validTarget.getMinutes() / 5) * 5;
      const vMin = String(vMins >= 60 ? 0 : vMins).padStart(2, '0');

      setDepartureDate(`${vYear}-${vMonth}-${vDay}`);
      setDepartureHour(vHour);
      setDepartureMinute(vMin);
      setPassengers(buildScenarioSamplePassengers(10));
      setCargoTons(0.5);
      setCrewMembers([
        {
          crewId: userCaptainCrew?.id || 'CREW-CAP-VES-01',
          fullName:
            currentUser.role === 'CAPTAIN'
              ? currentUser.fullName
              : selectedVessel?.captainName || userCaptainCrew?.fullName || 'Lê Tấn Lý',
          positionTitle: 'Thuyền trưởng',
          certNumber: userCaptainCrew?.certNumber || 'TT-VRSB-QNG0322',
          certExpireDate: userCaptainCrew?.certExpireDate || '2028-12-31',
          nationality: 'Việt Nam',
          birthDate: '1980',
          birthPlace: 'Lý Sơn',
          passportNumber: userCaptainCrew?.citizenId || '051080001122',
        },
        {
          crewId: 'CREW-02',
          fullName: 'Trần Đình Trọng',
          positionTitle: 'Máy trưởng',
          certNumber: 'MT-VRSB-00512',
          certExpireDate: '2027-09-15',
          nationality: 'Việt Nam',
          birthDate: '1985',
          birthPlace: 'Lý Sơn',
          passportNumber: '051085002233',
        },
        {
          crewId: 'CREW-04',
          fullName: 'Võ Minh Quang',
          positionTitle: 'Thủy thủ',
          certNumber: 'TT-CC-00911',
          certExpireDate: '2027-11-20',
          nationality: 'Việt Nam',
          birthDate: '1992',
          birthPlace: 'Quảng Ngãi',
          passportNumber: '051092003344',
        },
      ]);
      setActualLifeJackets(16);
      setCurrentStep(6);
    } else if (type === 'SCENARIO_EMPTY_CREW') {
      setSelectedVesselId('VES-01');
      setCrewMembers([
        {
          crewId: userCaptainCrew?.id || 'CREW-CAP-VES-01',
          fullName:
            currentUser.role === 'CAPTAIN'
              ? currentUser.fullName
              : selectedVessel?.captainName || userCaptainCrew?.fullName || 'Lê Tấn Lý',
          positionTitle: 'Thuyền trưởng',
          certNumber: userCaptainCrew?.certNumber || 'TT-VRSB-QNG0322',
          certExpireDate: userCaptainCrew?.certExpireDate || '2028-12-31',
          nationality: 'Việt Nam',
          birthDate: '1980',
          birthPlace: 'Lý Sơn',
          passportNumber: userCaptainCrew?.citizenId || '051080001122',
        },
        {
          crewId: 'CREW-02',
          fullName: '', // CỐ Ý ĐỂ TRỐNG TÊN THỢ MÁY
          positionTitle: 'Thợ máy / Máy trưởng',
          certNumber: 'MT-VRSB-00512',
          certExpireDate: '2027-09-15',
          nationality: 'Việt Nam',
          birthDate: '1985',
          birthPlace: 'Lý Sơn',
          passportNumber: '051085002233',
        },
        {
          crewId: 'CREW-04',
          fullName: 'Võ Minh Quang',
          positionTitle: 'Thủy thủ',
          certNumber: 'TT-CC-00911',
          certExpireDate: '2027-11-20',
          nationality: 'Việt Nam',
          birthDate: '1992',
          birthPlace: 'Quảng Ngãi',
          passportNumber: '051092003344',
        },
      ]);
      setCurrentStep(6);
    } else if (type === 'SCENARIO_OVERLOAD') {
      setSelectedVesselId('VES-01');
      setPassengers(buildScenarioSamplePassengers(14));
      setCargoTons(5.0);
      setCurrentStep(6);
    } else if (type === 'SCENARIO_INVALID_TIME') {
      // Giờ rời bến nhỏ hơn hiện tại + 30 phút (ví dụ chỉ cách hiện tại 10 phút)
      const invalidTarget = new Date(Date.now() + 10 * 60 * 1000);
      const invYear = invalidTarget.getFullYear();
      const invMonth = String(invalidTarget.getMonth() + 1).padStart(2, '0');
      const invDay = String(invalidTarget.getDate()).padStart(2, '0');
      const invHour = String(invalidTarget.getHours()).padStart(2, '0');
      const invMin = String(invalidTarget.getMinutes()).padStart(2, '0');

      setDepartureDate(`${invYear}-${invMonth}-${invDay}`);
      setDepartureHour(invHour);
      setDepartureMinute(invMin);
      setCurrentStep(6);
    }
  };

  // Tự động lưu nháp khi đổi bước
  const handleStepChange = (newStep: number) => {
    if (currentStep === 1 && newStep > 1 && departureValidation.isTooSoon) {
      showToast(
        'error',
        `Thời gian dự kiến rời bến (${departureHour}:${departureMinute} ngày ${formatDate(departureDate)}) không được nhỏ hơn hiện tại + 30 phút (tối thiểu từ ${departureValidation.minTimeString}).`
      );
      return;
    }
    handleSaveDraft(false);
    setCurrentStep(newStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Lưu nháp
  const handleSaveDraft = (showToastMsg = true) => {
    const saved = repository.saveDraftTrip(
      {
        ...currentDraftTrip,
        id: existingTrip?.id || currentDraftTrip.id || `TRIP-${Date.now()}`,
        rulesCheckResults: evaluation.results,
        uploadedDocuments,
        feeTransactionCode: feeTransactionCode.trim() || undefined,
      } as TripRecord,
      currentUser
    );
    syncTripCrewAndCertificatesToSystem(crewMembers, selectedVesselId, uploadedDocuments, currentUser);
    const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (showToastMsg && saved) {
      showToast('success', `Đã lưu bản nháp ${saved.tripNumber} thành công (${nowTime}).`);
    }
  };

  // Rút hồ sơ trước khi cấp phép
  const handleConfirmWithdraw = () => {
    if (!existingTrip) return;
    const res = repository.withdrawTripDossier(
      existingTrip.id,
      currentUser,
      withdrawReason.trim() || 'Chủ tàu / Thuyền trưởng chủ động rút hồ sơ'
    );
    setShowWithdrawModal(false);
    if (!res.success) {
      showToast('error', res.error || 'Không thể rút hồ sơ này.');
      return;
    }
    showToast('info', `Đã rút hồ sơ ${existingTrip.tripNumber}.`);
    setTimeout(() => onNavigate('trips'), 550);
  };

  // Nộp hồ sơ chính thức (Bước 6)
  const handleSubmitTrip = () => {
    if (missingOrExpiredCrewCerts.length > 0) {
      const names = missingOrExpiredCrewCerts
        .map((c) => `${c.fullName || c.positionTitle} (${c.isExpired ? 'Hết hạn' : 'Chưa nộp trước đó'})`)
        .join(', ');
      showToast(
        'error',
        `Chưa đủ chứng chỉ chuyên môn hợp lệ cho: ${names}. Vui lòng bổ sung chứng chỉ mới và ngày hết hạn còn hiệu lực ở Bước 5.`
      );
      setCurrentStep(5);
      return;
    }

    if (step6InspectionSummary.hasBlockingFailure) {
      const firstFailed = step6InspectionSummary.items.find((i) => i.status === 'FAILED');
      showToast(
        'error',
        firstFailed
          ? `[${firstFailed.code}] ${firstFailed.message}`
          : 'Hồ sơ có hạng mục kiểm tra chưa đạt. Vui lòng khắc phục trước khi gửi.'
      );
      return;
    }

    if (evaluation.hasBlockingFailure) {
      const firstBlocker = evaluation.results.find(
        (r) => r.status === 'FAILED' && r.severity === 'BLOCKING'
      );
      showToast(
        'error',
        firstBlocker
          ? `[${firstBlocker.ruleCode}] ${firstBlocker.message}`
          : 'Hồ sơ có lỗi vi phạm điều kiện an toàn. Vui lòng khắc phục trước khi gửi.'
      );
      return;
    }

    if (step6InspectionSummary.hasWarning && !acceptedWarningConsent) {
      showToast('error', 'Vui lòng tích vào ô xác nhận các cảnh báo trước khi gửi hồ sơ.');
      return;
    }

    const res = repository.submitTripDossier(
      {
        ...currentDraftTrip,
        id: existingTrip?.id || currentDraftTrip.id || `TRIP-${Date.now()}`,
        uploadedDocuments,
        feeTransactionCode: feeTransactionCode.trim() || undefined,
      } as TripRecord,
      currentUser
    );

    if (!res.success || !res.trip) {
      showToast('error', res.error || 'Không thể nộp hồ sơ. Vui lòng kiểm tra lại.');
      return;
    }

    const submittedTrip = res.trip;
    syncTripCrewAndCertificatesToSystem(crewMembers, selectedVesselId, uploadedDocuments, currentUser);
    void dossierArchiveService
      .syncTripToServer(submittedTrip, {
        actorName: currentUser.fullName,
        syncPendingAttachments: true,
      })
      .catch(() => {});

    const destinationText =
      normalizeStatus(submittedTrip.status) === 'CHO_SO_XU_LY'
        ? 'Hồ sơ đã chuyển thẳng về Chuyên viên Phòng ATGT (Sở Xây dựng) tiếp tục xử lý.'
        : `Hồ sơ đã chuyển về Ban Quản lý Cảng (${submittedTrip.departurePortName}) kiểm tra tại bến.`;
    showToast(
      'success',
      `Nộp hồ sơ ${submittedTrip.tripNumber} thành công! ${destinationText}`
    );
    setTimeout(() => onNavigate('trip-detail', submittedTrip.id), 650);
  };

  // Chat AI
  const handleSendAiChatMessage = async () => {
    if (!aiChatInput.trim()) return;
    const userText = aiChatInput.trim();
    setAiChatInput('');
    setAiChatMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setIsAiReplying(true);

    try {
      const stepNames = [
        '1. Thông tin chung',
        '2. Danh sách thuyền viên',
        '3. Danh sách hành khách',
        '4. Hàng hóa & ghi chú',
        '5. Tải lên giấy tờ đính kèm',
        '6. Nộp hồ sơ',
      ];
      const reply = await GeminiService.getFilingGuidance(userText, {
        stepIndex: currentStep,
        stepName: stepNames[currentStep - 1] || 'Khai hồ sơ',
        rejectionReason: existingTrip?.rejectReason,
      });
      setAiChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setAiChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Xin lỗi thuyền trưởng, hệ thống đang bận. Anh/chị hãy kiểm tra kỹ các trường có dấu sao đỏ nhé!',
        },
      ]);
    } finally {
      setIsAiReplying(false);
    }
  };

  // Nếu là thuyền trưởng, chặn sửa hồ sơ không thuộc tàu mình phụ trách
  if (currentUser.role === 'CAPTAIN' && existingTrip && selectableVessels[0] && existingTrip.vesselId !== selectableVessels[0].id) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm max-w-xl mx-auto my-12 animate-in fade-in">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Không có quyền sửa hồ sơ này</h2>
        <p className="text-slate-600 text-xs mt-2 leading-relaxed">
          Mỗi tài khoản thuyền trưởng/chủ tàu chỉ phụ trách 1 tàu. Bạn không thể chỉnh sửa hồ sơ của phương tiện khác ({existingTrip.vesselName} - {existingTrip.vesselRegNumber}).
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

  return (
    <div className="w-full mx-auto space-y-5 pb-16 font-sans transition-all duration-300">
      {/* TOAST PHẢN HỒI KHÔNG CHẶN TRÌNH DUYỆT */}
      {toastBanner && (
        <div
          className={`fixed top-20 right-4 left-4 sm:left-auto sm:max-w-md z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-start justify-between gap-2.5 text-xs font-bold animate-in fade-in ${
            toastBanner.type === 'error'
              ? 'bg-red-600 text-white border-red-400'
              : toastBanner.type === 'success'
              ? 'bg-emerald-700 text-white border-emerald-400'
              : 'bg-[#07244d] text-white border-[#1d4e9e]'
          }`}
        >
          <span className="leading-relaxed">{toastBanner.message}</span>
          <button
            type="button"
            onClick={() => setToastBanner(null)}
            className="text-white/80 hover:text-white font-bold px-1 shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* CẢNH BÁO HỒ SƠ BỊ TRẢ LẠI (NẾU CÓ) */}
      {isRejected && existingTrip && (
        <div className="p-4 bg-red-600 text-white rounded-2xl shadow-md flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="w-6 h-6 text-white shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-black uppercase tracking-wide">
              HỒ SƠ BỊ TRẢ LẠI TỪ {getRejectedOriginLabel(existingTrip).toUpperCase()}
              {existingTrip.lastReturnInfo?.nguoiTraTen ||
              existingTrip.lastReturnInfo?.traBoiName ||
              existingTrip.rejectedByName
                ? ` — CÁN BỘ: ${
                    existingTrip.lastReturnInfo?.nguoiTraTen ||
                    existingTrip.lastReturnInfo?.traBoiName ||
                    existingTrip.rejectedByName
                  }`
                : ''}
            </h3>
            {existingTrip.lastReturnInfo?.phamVi && (
              <p className="text-[11px] font-bold text-amber-200">
                Phạm vi yêu cầu chỉnh sửa: {getReturnScopeLabel(existingTrip.lastReturnInfo.phamVi)}
              </p>
            )}
            <p className="text-xs text-red-100">
              Lý do trả lại:{' '}
              <strong className="underline text-white text-sm">
                {existingTrip.lastReturnInfo?.lyDo ||
                  existingTrip.rejectReason ||
                  'Phương tiện, thuyền viên hoặc hồ sơ chưa đủ điều kiện xuất bến.'}
              </strong>
            </p>
            <p className="text-[11px] text-red-100">
              {existingTrip.lastReturnInfo?.benTra === 'BIEN_PHONG'
                ? 'Quy tắc R12: Biên phòng trả lại do phát hiện sai lệch người/hành khách tại bến. Khi gửi lại, Giấy phép cũ sẽ bị thu hồi và hồ sơ đi lại qua BQL Cảng → Sở.'
                : existingTrip.lastReturnInfo?.benTra === 'CHUYEN_VIEN'
                ? 'Chuyên viên Phòng ATGT xác định thiếu sót thuộc hồ sơ Chủ tàu. Sau khi chỉnh sửa và nộp lại ở Bước 6, hồ sơ sẽ chuyển thẳng về Chuyên viên Sở tiếp tục xử lý.'
                : 'Ban Quản lý Cảng yêu cầu chỉnh sửa/bổ sung. Sau khi sửa và nộp lại ở Bước 6, hồ sơ sẽ chuyển lại Ban Quản lý Cảng kiểm tra.'}
            </p>
          </div>
        </div>
      )}

      {/* THANH TIẾN ĐỘ 6 BƯỚC (STEPPER 6 BƯỚC) */}
      <div className="bg-white/95 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 text-sm gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-black text-[#07244d] text-base sm:text-lg">
              BƯỚC {currentStep}/6:
            </span>
            <span className="font-extrabold text-[#0d62e8] text-sm sm:text-base hidden sm:inline">
              {currentStep === 1 && 'Thông tin chung (Bản khai chung)'}
              {currentStep === 2 && 'Thuyền viên trực ca (Danh sách thuyền viên)'}
              {currentStep === 3 && 'Danh sách hành khách vận tải'}
              {currentStep === 4 && 'Hàng hóa, mớn nước & ghi chú'}
              {currentStep === 5 && 'Tải lên giấy tờ đính kèm'}
              {currentStep === 6 && 'Danh sách kết quả kiểm tra tàu, thuyền viên, hàng hóa & giấy tờ'}
            </span>
          </div>
          <span className="sm:hidden text-xs font-bold text-[#0d62e8]">
            {currentStep === 1 && 'Thông tin chung'}
            {currentStep === 2 && 'Thuyền viên'}
            {currentStep === 3 && 'Hành khách'}
            {currentStep === 4 && 'Hàng hóa'}
            {currentStep === 5 && 'Giấy tờ'}
            {currentStep === 6 && 'Nộp hồ sơ'}
          </span>
        </div>

        {/* Thanh Stepper 6 bước */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5">
          {[
            { step: 1, label: '1. Thông tin chung', icon: Ship },
            { step: 2, label: '2. Thuyền viên', icon: Users },
            { step: 3, label: '3. Hành khách', icon: UserCheck },
            { step: 4, label: '4. Hàng hóa', icon: Package },
            { step: 5, label: '5. Giấy tờ', icon: Paperclip },
            { step: 6, label: '6. Nộp hồ sơ', icon: ShieldCheck },
          ].map((item) => {
            const Icon = item.icon;
            const isDone = item.step < currentStep;
            const isCurrent = item.step === currentStep;
            return (
              <button
                key={item.step}
                onClick={() => handleStepChange(item.step)}
                className={`py-2.5 sm:py-3 px-1.5 sm:px-2 rounded-2xl text-center flex flex-col items-center justify-center gap-1 transition cursor-pointer select-none ${
                  isCurrent
                    ? 'bg-[#0d62e8] text-white font-black shadow-md ring-2 ring-blue-300'
                    : isDone
                    ? 'bg-[#daf5e7] text-[#0c7a45] hover:bg-emerald-100 font-bold border border-[#a9e4c5]'
                    : 'bg-[#f4f8ff] text-[#07244d] hover:bg-[#edf4fe] font-semibold border border-[#dce8f7]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  <span className="text-xs sm:text-sm font-black">{item.step}</span>
                </div>
                <span className="text-[11px] sm:text-xs truncate max-w-full font-bold">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* KHUNG FORM CÁC BƯỚC & FOOTER CHUYỂN BƯỚC THỐNG NHẤT */}
      {/* ======================================================== */}
      <div className="bg-white/95 rounded-[20px] sm:rounded-[24px] border border-[#dce8f7] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] overflow-hidden">
        {/* NỘI DUNG TỪNG BƯỚC */}
        <div className="p-5 sm:p-7">
          {/* BƯỚC 1: THÔNG TIN CHUNG (DẠNG DANH SÁCH MÀU NỀN CHẴN LẺ) */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <Ship className="w-5 h-5 text-blue-600 shrink-0" />
                    Bước 1: Thông tin chung
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kê khai thông tin chuyến đi, phương tiện VR-SB, tuyến hành trình và thời gian rời bến
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCopyFromPreviousTrip}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold inline-flex items-center gap-1.5 border border-slate-200 cursor-pointer text-xs whitespace-nowrap shrink-0"
                    title="Sao chép toàn bộ thông tin từ chuyến trước của tàu này"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-600" />
                    <span>Lấy chuyến trước</span>
                  </button>

                  {/* Chọn Đến hoặc Rời */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => setMovementType('DEPARTURE')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        movementType === 'DEPARTURE' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rời bến
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovementType('ARRIVAL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        movementType === 'ARRIVAL' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Đến bến
                    </button>
                  </div>
                </div>
              </div>

              {/* Bảng danh sách thông tin chung với màu nền chẵn / lẻ */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs border-collapse">
                    <thead className="bg-[#edf4fe] text-[#07244d] text-[11px] font-extrabold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3 w-12 text-center">STT</th>
                        <th className="py-3 px-3 w-[25%]">Hạng mục kê khai</th>
                        <th className="py-3 px-3">Nội dung khai báo</th>
                        <th className="py-3 px-3 w-[30%]">Thông tin đối chiếu / Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {/* Dòng 1 (lẻ) - Người làm thủ tục */}
                      <tr className="bg-white hover:bg-blue-50/40 transition-colors">
                        <td className="py-3.5 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                          1
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <p className="font-bold text-slate-900">Người làm thủ tục</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Khai trực tiếp hoặc khai thay</p>
                        </td>
                        <td className="py-3.5 px-3 align-top space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-800">
                              <strong className="text-blue-950">{declarantName || currentUser.fullName}</strong>
                              <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                              <span className="font-mono text-slate-700">{declarantPhone || currentUser.phone}</span>
                            </span>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-blue-700 hover:text-blue-900">
                              <input
                                type="checkbox"
                                checked={declaredByStaff}
                                onChange={(e) => setDeclaredByStaff(e.target.checked)}
                                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                              />
                              <span>Ban QL Cảng khai thay</span>
                            </label>
                          </div>

                          {declaredByStaff && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Họ tên cán bộ khai thay:
                                </label>
                                <input
                                  type="text"
                                  value={declarantName}
                                  onChange={(e) => setDeclarantName(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  SĐT cán bộ:
                                </label>
                                <input
                                  type="text"
                                  value={declarantPhone}
                                  onChange={(e) => setDeclarantPhone(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-amber-800 mb-0.5">
                                  Lý do khai thay:
                                </label>
                                <input
                                  type="text"
                                  value={staffReason}
                                  onChange={(e) => setStaffReason(e.target.value)}
                                  placeholder="Thuyền trưởng ủy quyền..."
                                  className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg bg-amber-50 text-slate-800"
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top text-[11px] text-slate-600">
                          {declaredByStaff
                            ? 'Hồ sơ ghi nhận cán bộ Ban Quản lý Cảng thực hiện kê khai thay.'
                            : 'Tự động điền theo tài khoản đang đăng nhập.'}
                        </td>
                      </tr>

                      {/* Dòng 2 (chẵn) - Phương tiện VR-SB */}
                      <tr className="bg-[#f1f6fd] hover:bg-blue-100/50 transition-colors">
                        <td className="py-3.5 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                          2
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <p className="font-bold text-slate-900">Phương tiện VR-SB (*)</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Tàu thực hiện chuyến đi</p>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          {currentUser.role === 'CAPTAIN' ? (
                            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-blue-300 rounded-xl">
                              <div>
                                <p className="text-sm font-black text-slate-900">
                                  {selectedVessel?.name} ({selectedVessel?.regNumber})
                                </p>
                                <p className="text-[11px] text-blue-700 font-semibold">
                                  Tàu phụ trách theo tài khoản thuyền trưởng
                                </p>
                              </div>
                            </div>
                          ) : (
                            <select
                              value={selectedVesselId}
                              onChange={(e) => setSelectedVesselId(e.target.value)}
                              className="w-full px-3 py-2 text-xs sm:text-sm font-extrabold text-slate-900 border border-slate-300 rounded-xl bg-white focus:border-blue-600"
                            >
                              {selectableVessels.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name} ({v.regNumber}) · {v.maxPassengers} khách · {v.maxCargoTons} tấn
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top text-[11px] text-slate-700 space-y-1 tabular-nums">
                          {selectedVessel && (
                            <>
                              <p>
                                Số hiệu / Hô hiệu: <strong className="font-mono text-slate-900">{selectedVessel.regNumber}</strong> ({selectedVessel.callSign || 'QNG 0237'}) · <strong>VIỆT NAM</strong>
                              </p>
                              <p>
                                Sức chở: <strong className="text-blue-900">{selectedVessel.maxPassengers} khách</strong> · Tải trọng: <strong className="text-blue-900">{selectedVessel.maxCargoTons} tấn</strong>
                              </p>
                              <p>
                                Hạn đăng kiểm:{' '}
                                <strong className={selectedVessel.registryExpireDate < todayIso ? 'text-red-600' : 'text-slate-900'}>
                                  {selectedVessel.registryExpireDate}
                                </strong>
                              </p>
                              <p className="text-slate-600">
                                Chủ tàu: <strong className="text-slate-800">{selectedVessel.ownerName}</strong> ({selectedVessel.ownerPhone})
                              </p>
                            </>
                          )}
                        </td>
                      </tr>

                      {/* Dòng 3 (lẻ) - Số chuyến trong ngày */}
                      <tr className="bg-white hover:bg-blue-50/40 transition-colors">
                        <td className="py-3.5 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                          3
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <p className="font-bold text-slate-900">Số chuyến trong ngày (*)</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Thứ tự chuyến xuất/nhập bến</p>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={tripSeqOfDay}
                            onChange={(e) => setTripSeqOfDay(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-36 px-3 py-2 text-xs sm:text-sm font-bold border border-slate-300 rounded-xl bg-white tabular-nums"
                          />
                        </td>
                        <td className="py-3.5 px-3 align-top text-[11px] text-slate-600">
                          Số thứ tự chuyến trong ngày của tàu ({movementType === 'DEPARTURE' ? 'Lượt rời bến' : 'Lượt đến bến'}).
                        </td>
                      </tr>

                      {/* Dòng 4 (chẵn) - Vị trí cầu bến & Số IMO */}
                      <tr className="bg-[#f1f6fd] hover:bg-blue-100/50 transition-colors">
                        <td className="py-3.5 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                          4
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <p className="font-bold text-slate-900">Vị trí tại cảng / Cầu bến</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Cầu cảng neo đậu &amp; số IMO</p>
                        </td>
                        <td className="py-3.5 px-3 align-top space-y-2">
                          <input
                            type="text"
                            value={berthLocation}
                            onChange={(e) => setBerthLocation(e.target.value)}
                            className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl bg-white"
                          />
                          {!showImoInput ? (
                            <button
                              type="button"
                              onClick={() => setShowImoInput(true)}
                              className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                            >
                              + Nhập số IMO (nếu có)
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-600 shrink-0">Số IMO:</span>
                              <input
                                type="text"
                                value={imoNumber}
                                onChange={(e) => setImoNumber(e.target.value)}
                                placeholder="VD: 9876543"
                                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top text-[11px] text-slate-600">
                          Phương tiện nội địa ẩn số IMO mặc định; bấm mở rộng nếu tàu có số IMO.
                        </td>
                      </tr>

                      {/* Dòng 5 (lẻ) - Tuyến hành trình & Cảng đi / đích */}
                      <tr className="bg-white hover:bg-blue-50/40 transition-colors">
                        <td className="py-3.5 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                          5
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <p className="font-bold text-slate-900">Tuyến hành trình (*)</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Cảng rời &amp; cảng đích</p>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <select
                            value={selectedRouteId}
                            onChange={(e) => {
                              setSelectedRouteId(e.target.value);
                              const r = routes.find((item) => item.id === e.target.value);
                              if (r) {
                                setDeparturePortId(r.fromPortId);
                                setArrivalPortId(r.toPortId);
                              }
                            }}
                            className="w-full px-3 py-2 text-xs sm:text-sm font-bold border border-slate-300 rounded-xl bg-white"
                          >
                            {routes.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.distanceNauticalMiles} hải lý ~ {r.normalDurationMinutes} phút)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3.5 px-3 align-top text-[11px] text-slate-700 space-y-1">
                          <p>
                            Cảng đi: <strong className="text-slate-900">{ports.find((p) => p.id === departurePortId)?.name || 'Bến Lý Sơn'}</strong>
                          </p>
                          <p>
                            Cảng đích: <strong className="text-slate-900">{ports.find((p) => p.id === arrivalPortId)?.name || 'Bến Đảo Bé'}</strong>
                          </p>
                        </td>
                      </tr>

                      {/* Dòng 6 (chẵn) - Thời gian dự kiến rời bến */}
                      <tr
                        className={
                          departureValidation.isTooSoon
                            ? 'bg-rose-50/80 hover:bg-rose-50 transition-colors'
                            : 'bg-[#f1f6fd] hover:bg-blue-100/50 transition-colors'
                        }
                      >
                        <td className="py-3.5 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                          6
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <p className="font-bold text-slate-900">Thời gian dự kiến rời bến (*)</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Tối thiểu sau hiện tại 30 phút</p>
                        </td>
                        <td className="py-3.5 px-3 align-top space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-600 font-bold mb-1">Ngày</label>
                              <input
                                type="date"
                                value={departureDate}
                                onChange={(e) => setDepartureDate(e.target.value)}
                                className={`w-full px-2.5 py-2 text-xs font-bold border rounded-xl bg-white tabular-nums ${
                                  departureValidation.isTooSoon
                                    ? 'border-rose-400 focus:ring-rose-500'
                                    : 'border-slate-300 focus:ring-blue-500'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 font-bold mb-1">Giờ (00–23)</label>
                              <select
                                value={departureHour}
                                onChange={(e) => setDepartureHour(e.target.value)}
                                className={`w-full px-2.5 py-2 text-xs font-bold border rounded-xl bg-white tabular-nums ${
                                  departureValidation.isTooSoon
                                    ? 'border-rose-400 focus:ring-rose-500'
                                    : 'border-slate-300 focus:ring-blue-500'
                                }`}
                              >
                                {Array.from({ length: 24 }).map((_, i) => {
                                  const h = String(i).padStart(2, '0');
                                  return <option key={h} value={h}>{h} giờ</option>;
                                })}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 font-bold mb-1">Phút (00–59)</label>
                              <select
                                value={departureMinute}
                                onChange={(e) => setDepartureMinute(e.target.value)}
                                className={`w-full px-2.5 py-2 text-xs font-bold border rounded-xl bg-white tabular-nums ${
                                  departureValidation.isTooSoon
                                    ? 'border-rose-400 focus:ring-rose-500'
                                    : 'border-slate-300 focus:ring-blue-500'
                                }`}
                              >
                                {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => (
                                  <option key={m} value={m}>{m} phút</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {departureValidation.isTooSoon && (
                            <button
                              type="button"
                              onClick={handleSetQuickValidTime}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Đặt giờ hợp lệ nhanh (+45 phút)</span>
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top text-[11px] space-y-1 tabular-nums">
                          {departureValidation.isTooSoon ? (
                            <>
                              <p className="font-extrabold text-rose-700 inline-flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Nhỏ hơn hiện tại + 30 phút</span>
                              </p>
                              <p className="text-rose-800 leading-relaxed">
                                Sớm nhất cho phép từ: <strong className="underline">{departureValidation.minTimeString}</strong>.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-bold text-emerald-700 inline-flex items-center gap-1">
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                <span>Hợp lệ (≥ hiện tại + 30 phút)</span>
                              </p>
                              <p className="text-slate-700">
                                Giờ chọn:{' '}
                                <strong className="text-blue-950">
                                  {departureHour}:{departureMinute} ngày {formatDate(departureDate)}
                                </strong>
                              </p>
                            </>
                          )}
                        </td>
                      </tr>

                      {/* Dòng 7 (lẻ) - Mớn nước & Dung tích */}
                      <tr className="bg-white hover:bg-blue-50/40 transition-colors">
                        <td className="py-3.5 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                          7
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <p className="font-bold text-slate-900">Mớn nước thực tế trước rời bến</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Thông số kỹ thuật tàu</p>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="grid grid-cols-2 gap-3 max-w-md">
                            <div>
                              <label className="block text-[10px] text-slate-600 font-bold mb-1">Mớn nước mũi (m)</label>
                              <input
                                type="number"
                                step="0.05"
                                value={draftForward}
                                onChange={(e) => setDraftForward(parseFloat(e.target.value) || 0.6)}
                                className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 font-bold mb-1">Mớn nước lái (m)</label>
                              <input
                                type="number"
                                step="0.05"
                                value={draftAft}
                                onChange={(e) => setDraftAft(parseFloat(e.target.value) || 0.9)}
                                className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 align-top text-[11px] text-slate-700 space-y-1 tabular-nums">
                          <p>
                            Dung tích toàn phần: <strong className="text-slate-900">{selectedVessel?.grossTonnage || 6} GT</strong>
                          </p>
                          <p>
                            Dung tích có ích: <strong className="text-slate-900">{selectedVessel?.netTonnage || 3} NT</strong>
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

      {/* BƯỚC 2: THUYỀN VIÊN (DANH SÁCH THUYỀN VIÊN) */}
      {currentStep === 2 && (() => {
        const readyCrewCertCount = crewCertChecks.filter((c) => !c.requiresStep5Upload).length;
        const missingCrewCertCount = missingOrExpiredCrewCerts.length;

        return (
        <div className="space-y-5">
          {/* Tiêu đề & Thao tác nhanh */}
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 shrink-0" />
                Bước 2: Danh sách thuyền viên trực ca
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Định biên tối thiểu <strong className="text-slate-800">{selectedVessel?.minCrew || 3} người</strong>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>Chứng chỉ đã lưu còn hiệu lực được tự động đọc lại</span>
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyCrewFromPrevious}
                className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Lấy đội ngũ chuyến trước</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCrewMembers([
                    ...crewMembers,
                    {
                      crewId: `TEMP-${Date.now()}`,
                      fullName: '',
                      positionTitle: 'Thủy thủ',
                      certNumber: 'CC-VR-SB-TẠM',
                      certExpireDate: '2028-01-01',
                      nationality: 'Việt Nam',
                      birthDate: '1995',
                      birthPlace: 'Quảng Ngãi',
                      passportNumber: '',
                      isTemporary: true,
                    },
                  ]);
                }}
                className="px-3 py-1.5 text-xs font-bold bg-[#072b61] hover:bg-[#0c4a9c] text-white rounded-xl inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm thuyền viên</span>
              </button>
            </div>
          </div>

          {/* Thanh chọn / hiển thị Thuyền trưởng chỉ huy trực ca */}
          <div className="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="shrink-0">
              <p className="font-extrabold text-slate-900">
                Thuyền trưởng chỉ huy trực ca (*)
              </p>
              {currentUser.role === 'CAPTAIN' && (
                <p className="text-[11px] text-blue-700 font-semibold mt-0.5">
                  Tài khoản đang thực hiện khai báo
                </p>
              )}
            </div>

            {currentUser.role === 'CAPTAIN' ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-700 tabular-nums">
                <strong className="text-slate-950 text-sm">{currentUser.fullName}</strong>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span>{userCaptainCrew.certType || 'Thuyền trưởng hạng 2 VR-SB'}</span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span>
                  Bằng: <strong className="font-mono text-blue-950">{userCaptainCrew.certNumber}</strong>
                </span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span>
                  Hạn:{' '}
                  <strong className={userCaptainCrew.certExpireDate < todayIso ? 'text-red-600' : 'text-slate-900'}>
                    {userCaptainCrew.certExpireDate}
                  </strong>
                </span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span>SĐT: {currentUser.phone || userCaptainCrew.phone}</span>
              </div>
            ) : (
              <select
                value={selectedCaptainId}
                onChange={(e) => {
                  setSelectedCaptainId(e.target.value);
                  const capt = crewCatalog.find((c) => c.id === e.target.value);
                  if (capt) {
                    setCrewMembers((prev) =>
                      prev.map((item, idx) =>
                        idx === 0
                          ? {
                              ...item,
                              crewId: capt.id,
                              fullName: capt.fullName,
                              certNumber: capt.certNumber,
                              certExpireDate: capt.certExpireDate,
                            }
                          : item
                      )
                    );
                  }
                }}
                className="w-full sm:max-w-xl px-3 py-2 text-xs font-bold border border-blue-300 rounded-xl bg-white focus:border-blue-600"
              >
                {crewCatalog
                  .filter((c) => c.position === 'CAPTAIN')
                  .map((c) => {
                    const assignedVessel = vessels.find((v) => v.id === c.assignedVesselId);
                    const vesselLabel = assignedVessel ? ` [${assignedVessel.name}]` : '';
                    const phoneLabel = c.phone ? ` · SĐT: ${c.phone}` : '';
                    return (
                      <option key={c.id} value={c.id}>
                        {c.fullName}
                        {vesselLabel}
                        {phoneLabel} · Bằng: {c.certNumber} · Hạn: {c.certExpireDate}
                      </option>
                    );
                  })}
              </select>
            )}
          </div>

          {/* Thanh tóm tắt tình trạng chứng chỉ thuyền viên */}
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
            <div className="flex items-center gap-2 text-slate-700">
              <FileCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Đội ngũ trực ca: <strong className="text-slate-900">{crewMembers.length} người</strong>
                <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                Chứng chỉ hợp lệ / tự đọc lại: <strong className="text-emerald-700">{readyCrewCertCount}/{crewMembers.length}</strong>
                {missingCrewCertCount > 0 && (
                  <>
                    <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                    <strong className="text-amber-700">Cần bổ sung: {missingCrewCertCount}</strong>
                  </>
                )}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Hỗ trợ tải ảnh (JPG, PNG, WEBP) hoặc PDF giấy chứng nhận
            </span>
          </div>

          {/* BẢNG DANH SÁCH THUYỀN VIÊN TRỰC CA */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs border-collapse">
                <thead className="bg-[#edf4fe] text-[#07244d] text-[11px] font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-2.5 w-11 text-center">STT</th>
                    <th className="py-3 px-2.5 w-36">Chức danh (*)</th>
                    <th className="py-3 px-2.5 min-w-[220px]">Họ và tên (*) / Chọn từ danh bạ</th>
                    <th className="py-3 px-2.5 w-44">Số GCNKNCM &amp; Hạn bằng</th>
                    <th className="py-3 px-2.5 min-w-[200px]">Giấy chứng nhận (Ảnh / PDF)</th>
                    <th className="py-3 px-2.5 w-44 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {crewMembers.map((cm, idx) => {
                    const certCheck = crewCertChecks[idx];
                    const linkedCertDoc = resolveCrewCertDoc(cm, certCheck);
                    const isUploadingThisCrew = uploadingCrewCertId === cm.crewId;
                    const isFirstCaptainLocked = idx === 0 && currentUser.role === 'CAPTAIN';
                    const isMissingName = !cm.fullName || cm.fullName.trim() === '';
                    const isCertExpired = Boolean(cm.certExpireDate && cm.certExpireDate < todayIso);
                    const needsUpload = !certCheck || certCheck.requiresStep5Upload;

                    return (
                      <tr
                        key={idx}
                        className={
                          isMissingName || isCertExpired
                            ? 'bg-red-50/55 hover:bg-red-50/80 transition-colors'
                            : needsUpload
                            ? 'bg-amber-50/40 hover:bg-amber-50/75 transition-colors'
                            : isFirstCaptainLocked
                            ? 'bg-blue-50/30 hover:bg-blue-50/50 transition-colors'
                            : 'hover:bg-slate-50/70 transition-colors'
                        }
                      >
                        <td className="py-3 px-2.5 text-center font-semibold text-slate-500 tabular-nums align-top">
                          {idx + 1}
                        </td>

                        {/* Chức danh */}
                        <td className="py-2.5 px-2.5 align-top">
                          <input
                            type="text"
                            value={cm.positionTitle}
                            readOnly={isFirstCaptainLocked}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCrewMembers((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, positionTitle: val } : item))
                              );
                            }}
                            className={`w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg ${
                              isFirstCaptainLocked
                                ? 'bg-slate-100 text-slate-800 border-slate-200 cursor-not-allowed'
                                : 'border-slate-300 bg-white'
                            }`}
                          />
                          {cm.isTemporary && (
                            <span className="block text-[10px] font-semibold text-amber-700 mt-1">
                              Thuyền viên mới
                            </span>
                          )}
                        </td>

                        {/* Họ tên & đồng bộ danh bạ */}
                        <td className="py-2.5 px-2.5 align-top space-y-1.5">
                          <input
                            type="text"
                            value={cm.fullName}
                            readOnly={isFirstCaptainLocked}
                            placeholder="Nhập đầy đủ họ và tên..."
                            onChange={(e) => {
                              const val = e.target.value;
                              setCrewMembers((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, fullName: val } : item))
                              );
                            }}
                            className={`w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg ${
                              isFirstCaptainLocked
                                ? 'bg-blue-50/80 border-blue-200 text-blue-950 cursor-not-allowed'
                                : isMissingName
                                ? 'border-red-500 bg-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          />
                          {isMissingName && (
                            <p className="text-[11px] text-red-600 font-bold">
                              Chưa nhập họ tên thuyền viên
                            </p>
                          )}
                          {isFirstCaptainLocked ? (
                            <p className="text-[11px] text-blue-700 font-semibold">
                              Tài khoản đang khai báo
                            </p>
                          ) : (
                            <select
                              value={crewCatalog.some((c) => c.id === cm.crewId) ? cm.crewId : ''}
                              onChange={(e) => {
                                const picked = crewCatalog.find((c) => c.id === e.target.value);
                                if (!picked) return;
                                setCrewMembers((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          crewId: picked.id,
                                          fullName: picked.fullName,
                                          positionTitle: picked.positionTitle,
                                          certNumber: picked.certNumber,
                                          certExpireDate: picked.certExpireDate,
                                          passportNumber: picked.citizenId,
                                          isTemporary: false,
                                        }
                                      : item
                                  )
                                );
                              }}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg bg-slate-50 text-[11px] text-slate-700 font-medium"
                              title="Chọn nhanh từ danh bạ thuyền viên hệ thống"
                            >
                              <option value="">-- Chọn từ danh bạ ({crewCatalog.length} TV) --</option>
                              {crewCatalog.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.fullName} ({c.positionTitle} · {c.certNumber})
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Số GCN & Hạn bằng */}
                        <td className="py-2.5 px-2.5 align-top space-y-1.5">
                          <input
                            type="text"
                            value={cm.certNumber}
                            readOnly={isFirstCaptainLocked}
                            placeholder="Số GCNKNCM"
                            onChange={(e) => {
                              const val = e.target.value;
                              setCrewMembers((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, certNumber: val } : item))
                              );
                            }}
                            className={`w-full px-2.5 py-1.5 text-xs font-mono border rounded-lg ${
                              isFirstCaptainLocked
                                ? 'bg-slate-100 border-slate-200 text-slate-800 cursor-not-allowed font-bold'
                                : 'border-slate-300 bg-white'
                            }`}
                          />
                          <input
                            type="date"
                            value={cm.certExpireDate}
                            readOnly={isFirstCaptainLocked && !certCheck?.isExpired}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCrewMembers((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, certExpireDate: val } : item))
                              );
                            }}
                            className={`w-full px-2 py-1 text-[11px] font-bold border rounded-lg tabular-nums ${
                              isCertExpired
                                ? 'border-red-300 text-red-700 bg-red-50'
                                : 'border-slate-200 text-slate-700 bg-white'
                            }`}
                          />
                        </td>

                        {/* Trạng thái & tệp Giấy chứng nhận */}
                        <td className="py-2.5 px-2.5 align-top space-y-1">
                          {!needsUpload ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>
                                {certCheck?.canReuse ? 'Đã có (Tự đọc lại)' : 'Đã tải tệp hợp lệ'}
                              </span>
                            </span>
                          ) : certCheck?.isExpired || isCertExpired ? (
                            <span className="inline-flex items-center gap-1.5 font-extrabold text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              <span>Hết hạn — Cần tải mới</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-700">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Chưa có — Cần bổ sung</span>
                            </span>
                          )}

                          {linkedCertDoc ? (
                            <p
                              className="text-[11px] text-slate-600 truncate max-w-[220px]"
                              title={linkedCertDoc.fileName}
                            >
                              <span className="font-mono font-bold text-slate-700 mr-1">
                                [{linkedCertDoc.fileType === 'PDF' ? 'PDF' : 'ẢNH'}]
                              </span>
                              {linkedCertDoc.fileName}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-500">
                              Chưa có tệp ảnh/PDF đính kèm
                            </p>
                          )}
                        </td>

                        {/* Thao tác */}
                        <td className="py-2.5 px-2.5 text-right align-top whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            {linkedCertDoc && (
                              <button
                                type="button"
                                onClick={() => setPreviewDocModal(linkedCertDoc)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1 cursor-pointer transition"
                                title="Xem ảnh hoặc file PDF giấy chứng nhận"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isUploadingThisCrew}
                              onClick={() => triggerCrewCertUpload(cm.crewId)}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-60 ${
                                needsUpload
                                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                              }`}
                              title={
                                needsUpload
                                  ? 'Tải lên ảnh chụp hoặc tệp PDF giấy chứng nhận'
                                  : 'Thay thế bằng tệp giấy chứng nhận mới hơn'
                              }
                            >
                              {isUploadingThisCrew ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isUploadingThisCrew
                                  ? 'Đang tải...'
                                  : needsUpload
                                  ? 'Bổ sung'
                                  : 'Thay tệp'}
                              </span>
                            </button>

                            {idx >= 3 && (
                              <button
                                type="button"
                                onClick={() => setCrewMembers(crewMembers.filter((_, i) => i !== idx))}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition"
                                title="Xóa thuyền viên này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        );
      })()}

      {/* BƯỚC 3: HÀNH KHÁCH (DANH SÁCH HÀNH KHÁCH) */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="border-b pb-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                Bước 3: Danh sách hành khách vận tải
              </h2>
              <p className="text-xs text-slate-500">
                Sức chứa tàu: <strong>{selectedVessel?.maxPassengers} khách</strong> • Nhập từng người hoặc nhập từ Excel
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInsertFrequentPassengers}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition cursor-pointer"
              >
                Chèn khách quen
              </button>

              <button
                type="button"
                onClick={openAddPassengerModal}
                className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm hành khách</span>
              </button>
            </div>
          </div>

          {/* Dải thống kê số khách */}
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-blue-950">
                  {passengers.length} hành khách
                </span>
                <span className="text-[11px] font-bold text-slate-600">
                  / Tối đa {selectedVessel?.maxPassengers} khách
                </span>
                {passengers.length > (selectedVessel?.maxPassengers || 10) && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white animate-pulse">
                    QUÁ TẢI ({passengers.length - (selectedVessel?.maxPassengers || 10)} người)
                  </span>
                )}
              </div>
              <p className="text-slate-700 mt-1">
                Bằng chữ: <strong className="capitalize underline">{numberToVietnameseWords(passengers.length)}</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="bg-white px-2.5 py-1 rounded-lg border border-blue-200 text-slate-800 font-semibold">
                Việt Nam: <strong>{passengers.filter((p) => !p.isForeigner).length}</strong>
              </span>
              <span className="bg-white px-2.5 py-1 rounded-lg border border-blue-200 text-purple-800 font-semibold">
                Nước ngoài: <strong>{passengers.filter((p) => p.isForeigner).length}</strong>
              </span>
            </div>
          </div>

          {/* Công cụ Excel */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportExcel}
                accept=".xlsx, .xls, .csv"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
                <span>Nhập từ file Excel</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcelTemplate}
                className="px-2.5 py-1.5 text-xs text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải mẫu Excel</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowFullIdInList(!showFullIdInList)}
              className="text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
            >
              {showFullIdInList ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-blue-600" />}
              <span>{showFullIdInList ? 'Che bớt CCCD' : 'Hiện CCCD'}</span>
            </button>
          </div>

          {/* Bảng hành khách */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b text-[11px]">
                <tr>
                  <th className="p-2.5 text-center w-8">#</th>
                  <th className="p-2.5">Họ và tên</th>
                  <th className="p-2.5 text-center">Năm sinh</th>
                  <th className="p-2.5 text-center">Giới tính</th>
                  <th className="p-2.5">Số điện thoại</th>
                  <th className="p-2.5">Số CCCD / Hộ chiếu</th>
                  <th className="p-2.5">Địa chỉ</th>
                  <th className="p-2.5 text-center w-10">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {passengers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                      Chưa có hành khách nào trong danh sách. Bạn có thể bấm &quot;Thêm hành khách&quot; hoặc nhập nhanh từ tệp Excel.
                    </td>
                  </tr>
                ) : (
                  passengers.map((p, idx) => (
                    <tr
                      key={p.id}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#f1f6fd]/70'} hover:bg-blue-50/70 transition-colors`}
                    >
                      <td className="p-2.5 text-center font-bold text-slate-500 tabular-nums">{idx + 1}</td>
                      <td className="p-2.5 font-bold text-slate-900">
                        <div>
                          {p.fullName}
                          {p.isForeigner && (
                            <span className="ml-1.5 text-[10px] font-semibold text-purple-700">
                              · Ngoại quốc
                            </span>
                          )}
                        </div>
                        {p.notes && (
                          <p className="text-[11px] font-normal text-slate-500 truncate max-w-[200px]">
                            {p.notes}
                          </p>
                        )}
                      </td>
                      <td className="p-2.5 text-center text-slate-700 tabular-nums">
                        {p.birthYear} ({2026 - p.birthYear}t)
                      </td>
                      <td className="p-2.5 text-center text-slate-600">
                        {p.gender === 'NAM' ? 'Nam' : p.gender === 'NU' ? 'Nữ' : 'Khác'}
                      </td>
                      <td className="p-2.5 font-mono tabular-nums text-slate-700">
                        {showFullIdInList ? p.phone : maskPhone(p.phone)}
                      </td>
                      <td className="p-2.5 font-mono tabular-nums font-semibold text-slate-800">
                        {showFullIdInList ? p.idNumber : maskIdNumber(p.idNumber)}
                      </td>
                      <td className="p-2.5 text-slate-600 truncate max-w-[150px]">{p.address}</td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePassenger(p.id)}
                          aria-label={`Xóa hành khách ${p.fullName}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BƯỚC 4: HÀNG HÓA VÀ GHI CHÚ */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div className="border-b pb-3">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              Bước 4: Hàng hóa xếp trên tàu & Ghi chú
            </h2>
            <p className="text-xs text-slate-500">
              Trọng tải hàng cho phép của tàu {selectedVessel?.name}: <strong>{selectedVessel?.maxCargoTons} tấn</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <label className="block font-bold text-slate-800 text-sm">
                Tổng khối lượng hàng hóa (tấn) (*):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={20}
                  value={cargoTons}
                  onChange={(e) => setCargoTons(parseFloat(e.target.value) || 0)}
                  className="w-full p-3 text-2xl font-black text-slate-900 border-2 border-slate-300 rounded-xl bg-white"
                />
                <button
                  type="button"
                  onClick={() => setCargoTons(0)}
                  className="px-3 py-3 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer shrink-0"
                >
                  Không chở hàng
                </button>
              </div>

              {cargoTons > (selectedVessel?.maxCargoTons || 4.25) ? (
                <p className="text-xs font-bold text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Vượt tải trọng! Tàu chỉ được chở tối đa {selectedVessel?.maxCargoTons} tấn.
                </p>
              ) : (
                <p className="text-xs text-emerald-700 font-semibold">
                  ✓ Hàng hóa trong giới hạn tải trọng an toàn ({cargoTons}/{selectedVessel?.maxCargoTons} tấn).
                </p>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <label className="block font-bold text-slate-800 text-sm">
                Mô tả loại hàng hóa xếp trên tàu:
              </label>
              <textarea
                rows={3}
                value={cargoDescription}
                onChange={(e) => setCargoDescription(e.target.value)}
                placeholder="VD: Nhu yếu phẩm tươi sống, rau củ quả, bình nước khoáng..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-white"
              />
            </div>
          </div>

          {/* Hàng quá cảnh */}
          <div className="pt-2 border-t">
            {!hasTransitCargo ? (
              <button
                type="button"
                onClick={() => setHasTransitCargo(true)}
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                + Có hàng quá cảnh (Mở rộng mục 13)
              </button>
            ) : (
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 uppercase">
                    Thông tin hàng quá cảnh:
                  </span>
                  <button
                    type="button"
                    onClick={() => setHasTransitCargo(false)}
                    className="text-xs text-red-600 hover:underline cursor-pointer font-semibold"
                  >
                    Đóng lại (Không có hàng quá cảnh)
                  </button>
                </div>
                <input
                  type="text"
                  value={transitCargoDescription}
                  onChange={(e) => setTransitCargoDescription(e.target.value)}
                  placeholder="Loại hàng, số lượng quá cảnh xếp dỡ tại cảng..."
                  className="w-full p-2 text-xs border border-amber-300 rounded-lg bg-white"
                />
              </div>
            )}
          </div>

          {/* Áo phao cứu sinh */}
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-300 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-emerald-950 flex items-center gap-1.5 text-sm">
                <LifeBuoy className="w-4 h-4 text-emerald-700" />
                Số áo phao có sẵn trên tàu (*):
              </label>
              <span className="text-emerald-800 font-bold">
                Cần tối thiểu: {passengers.length + crewMembers.length} cái (100% người có áo phao)
              </span>
            </div>
            <input
              type="number"
              min={0}
              value={actualLifeJackets}
              onChange={(e) => setActualLifeJackets(parseInt(e.target.value) || 0)}
              className="w-full sm:w-48 p-2.5 text-lg font-black border border-emerald-400 rounded-xl bg-white"
            />
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 5: HỒ SƠ VÀ GIẤY TỜ CHỨNG THỰC ĐÍNH KÈM (DẠNG DANH SÁCH) */}
      {/* ======================================================== */}
      {currentStep === 5 && (() => {
        const regDoc = uploadedDocuments.find((d) => d.category === 'REGISTRATION_CERT');
        const safetyDoc = uploadedDocuments.find((d) => d.category === 'TECH_SAFETY_CERT');
        const insuranceDoc = uploadedDocuments.find((d) => d.category === 'CIVIL_INSURANCE');
        const feeDocs = uploadedDocuments.filter((d) => d.category === 'FEE_RECEIPT');
        const otherDocs = uploadedDocuments.filter((d) => d.category === 'OTHER');

        const isSafetyExpired = Boolean(
          selectedVessel?.registryExpireDate && selectedVessel.registryExpireDate < todayIso
        );
        const isInsuranceExpired = Boolean(
          selectedVessel?.civilInsuranceExpireDate && selectedVessel.civilInsuranceExpireDate < todayIso
        );
        const hasValidFee = feeDocs.length > 0 || feeTransactionCode.trim().length > 0;

        // Tổng số mục bắt buộc & số mục thiếu/hết hạn cần cảnh báo
        const vesselRequiredMissing =
          (!regDoc ? 1 : 0) +
          (!safetyDoc || isSafetyExpired ? 1 : 0) +
          (!insuranceDoc && isInsuranceExpired ? 1 : 0);
        const feeMissing = hasValidFee ? 0 : 1;
        const totalRequiredItems = 3 + crewCertChecks.length + 1;
        const totalMissingCount =
          vesselRequiredMissing +
          (!insuranceDoc && !isInsuranceExpired ? 1 : 0) +
          missingOrExpiredCrewCerts.length +
          feeMissing;
        const totalReadyCount = Math.max(0, totalRequiredItems - totalMissingCount);

        return (
        <div className="space-y-5">
          {/* Tiêu đề & nút đồng bộ */}
          <div className="border-b pb-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-blue-600" />
                Bước 5: Hồ sơ và Giấy tờ chứng thực đính kèm
              </h2>
              <p className="text-xs text-slate-500">
                Phương tiện: <strong className="text-slate-800">{selectedVessel?.name} ({selectedVessel?.regNumber})</strong> • Thuyền trưởng:{' '}
                <strong className="text-slate-800">{crewCatalog.find((c) => c.id === selectedCaptainId)?.fullName || selectedVessel?.captainName || '—'}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={handleReloadDefaultShipDocs}
              className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="Tự động nạp và cập nhật lại các giấy tờ tái sử dụng của tàu và thuyền viên"
            >
              <RotateCcw className="w-4 h-4 text-emerald-600" />
              <span>Đồng bộ giấy tờ dùng lại của tàu</span>
            </button>
          </div>

          {/* Thanh tổng hợp tình trạng hồ sơ giấy tờ */}
          <div
            className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
              totalMissingCount > 0
                ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                : 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {totalMissingCount > 0 ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              )}
              <div>
                <p className="font-extrabold">
                  {totalMissingCount > 0
                    ? `Cảnh báo: Còn ${totalMissingCount} mục giấy tờ chưa đủ hoặc đã hết hạn cần bổ sung`
                    : 'Đầy đủ hồ sơ và giấy tờ chứng thực hợp lệ'}
                </p>
                <p className="text-[11px] opacity-85">
                  Các giấy tờ dài hạn đã lưu trên hệ thống được tự động đọc lại. Bấm nút <strong>Bổ sung</strong> tại từng dòng bị cảnh báo để tải ảnh hoặc file PDF tương ứng.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 font-bold text-[11px]">
              <span className="px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-emerald-800">
                Đủ hợp lệ: {totalReadyCount}/{totalRequiredItems}
              </span>
              {totalMissingCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-600 text-white">
                  Cần bổ sung: {totalMissingCount}
                </span>
              )}
            </div>
          </div>

          {/* Input ẩn cho thao tác chọn tệp và chụp ảnh từ camera */}
          <input
            type="file"
            ref={docFileInputRef}
            onChange={handleAddUploadedFile}
            accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
            className="hidden"
          />
          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleAddUploadedFile}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          {/* ======================================================= */}
          {/* DANH SÁCH THỐNG NHẤT HỒ SƠ & GIẤY TỜ CHỨNG THỰC ĐÍNH KÈM */}
          {/* ======================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs border-collapse">
                <thead className="bg-[#edf4fe] text-[#07244d] uppercase text-[10px] font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">STT</th>
                    <th className="py-3 px-3">Hồ sơ / Giấy tờ chứng thực</th>
                    <th className="py-3 px-3 w-44">Tình trạng</th>
                    <th className="py-3 px-3">Tệp đính kèm / Hiệu lực</th>
                    <th className="py-3 px-3 text-right w-52">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {/* NHÓM I: GIẤY TỜ PHƯƠNG TIỆN VR-SB */}
                  <tr className="bg-slate-50/90">
                    <td colSpan={5} className="py-2 px-3 text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                      I. Giấy tờ phương tiện VR-SB ({selectedVessel?.name} — {selectedVessel?.regNumber})
                    </td>
                  </tr>

                  {/* 1. GCN Đăng ký phương tiện */}
                  <tr className={!regDoc ? 'bg-amber-50/70' : 'hover:bg-slate-50/60'}>
                    <td className="py-3 px-3 text-center font-bold text-slate-500">1</td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-900">Giấy chứng nhận đăng ký phương tiện thủy nội địa</p>
                      <span className="inline-block mt-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        Bắt buộc • Tự động dùng lại
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {regDoc ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Đã có (Hợp lệ)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                          <AlertTriangle className="w-3 h-3" />
                          Thiếu — Cần bổ sung
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {regDoc ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                              {regDoc.fileType}
                            </span>
                            <span className="font-semibold text-slate-900 truncate max-w-[240px]" title={regDoc.fileName}>
                              {regDoc.fileName}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">{regDoc.validUntil || 'Hiệu lực lâu dài'}</p>
                        </div>
                      ) : (
                        <p className="text-[11px] font-semibold text-red-700">
                          Chưa có bản scan/ảnh Giấy đăng ký phương tiện. Vui lòng bấm Bổ sung.
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {regDoc ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewDocModal(regDoc)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Xem</span>
                            </button>
                            <button
                              type="button"
                              disabled={uploadingCategory === 'REGISTRATION_CERT'}
                              onClick={() => triggerCategoryDocUpload('REGISTRATION_CERT')}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              {uploadingCategory === 'REGISTRATION_CERT' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <span>Thay tệp</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveUploadedDoc(regDoc.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              title="Xóa tệp"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={uploadingCategory === 'REGISTRATION_CERT'}
                            onClick={() => triggerCategoryDocUpload('REGISTRATION_CERT')}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60"
                          >
                            {uploadingCategory === 'REGISTRATION_CERT' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>Bổ sung</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* 2. GCN An toàn kỹ thuật & BVMT (Đăng kiểm) */}
                  <tr className={!safetyDoc || isSafetyExpired ? 'bg-red-50/60' : 'hover:bg-slate-50/60'}>
                    <td className="py-3 px-3 text-center font-bold text-slate-500">2</td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-900">Giấy CN an toàn kỹ thuật và BVMT (Đăng kiểm VR-SB)</p>
                      <span className="inline-block mt-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        Bắt buộc • Hạn đăng kiểm: {selectedVessel?.registryExpireDate ? formatDate(selectedVessel.registryExpireDate) : 'Chưa rõ'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {!safetyDoc ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                          <AlertTriangle className="w-3 h-3" />
                          Thiếu — Cần bổ sung
                        </span>
                      ) : isSafetyExpired ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                          <AlertTriangle className="w-3 h-3" />
                          Hết hạn đăng kiểm
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Đã có (Còn hạn)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {safetyDoc ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                              {safetyDoc.fileType}
                            </span>
                            <span className="font-semibold text-slate-900 truncate max-w-[240px]" title={safetyDoc.fileName}>
                              {safetyDoc.fileName}
                            </span>
                          </div>
                          <p className={`text-[11px] ${isSafetyExpired ? 'text-red-700 font-bold' : 'text-slate-500'}`}>
                            {isSafetyExpired
                              ? `Cảnh báo: Hết hạn đăng kiểm ngày ${formatDate(selectedVessel?.registryExpireDate)} — Cần bổ sung bản gia hạn mới.`
                              : `Hiệu lực đến: ${safetyDoc.validUntil || formatDate(selectedVessel?.registryExpireDate)}`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] font-semibold text-red-700">
                          Chưa có Giấy CN an toàn KT &amp; BVMT. Vui lòng bấm Bổ sung.
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {safetyDoc && (
                          <button
                            type="button"
                            onClick={() => setPreviewDocModal(safetyDoc)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem</span>
                          </button>
                        )}
                        {!safetyDoc || isSafetyExpired ? (
                          <button
                            type="button"
                            disabled={uploadingCategory === 'TECH_SAFETY_CERT'}
                            onClick={() => triggerCategoryDocUpload('TECH_SAFETY_CERT')}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60"
                          >
                            {uploadingCategory === 'TECH_SAFETY_CERT' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>Bổ sung</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={uploadingCategory === 'TECH_SAFETY_CERT'}
                              onClick={() => triggerCategoryDocUpload('TECH_SAFETY_CERT')}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              {uploadingCategory === 'TECH_SAFETY_CERT' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <span>Thay tệp</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveUploadedDoc(safetyDoc.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              title="Xóa tệp"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* 3. Bảo hiểm TNDS chủ tàu */}
                  <tr className={!insuranceDoc || isInsuranceExpired ? 'bg-amber-50/70' : 'hover:bg-slate-50/60'}>
                    <td className="py-3 px-3 text-center font-bold text-slate-500">3</td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-900">Giấy chứng nhận bảo hiểm trách nhiệm dân sự chủ tàu</p>
                      <span className="inline-block mt-0.5 text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        Hạn BH TNDS trên sổ tàu: {selectedVessel?.civilInsuranceExpireDate ? formatDate(selectedVessel.civilInsuranceExpireDate) : 'Chưa cập nhật'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {isInsuranceExpired ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                          <AlertTriangle className="w-3 h-3" />
                          Hết hạn BH TNDS
                        </span>
                      ) : insuranceDoc ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Đã đính kèm
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle className="w-3 h-3" />
                          Thiếu bản scan/ảnh
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {insuranceDoc ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                              {insuranceDoc.fileType}
                            </span>
                            <span className="font-semibold text-slate-900 truncate max-w-[240px]" title={insuranceDoc.fileName}>
                              {insuranceDoc.fileName}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {insuranceDoc.fileSize} • {insuranceDoc.uploadedAt}
                          </p>
                        </div>
                      ) : (
                        <p className={`text-[11px] font-semibold ${isInsuranceExpired ? 'text-red-700' : 'text-amber-800'}`}>
                          {isInsuranceExpired
                            ? 'Bảo hiểm TNDS đã hết hạn — Vui lòng bổ sung giấy chứng nhận bảo hiểm mới.'
                            : 'Chưa đính kèm ảnh/PDF Bảo hiểm TNDS. Bấm Bổ sung nếu có yêu cầu kiểm tra.'}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {insuranceDoc ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewDocModal(insuranceDoc)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Xem</span>
                            </button>
                            <button
                              type="button"
                              disabled={uploadingCategory === 'CIVIL_INSURANCE'}
                              onClick={() => triggerCategoryDocUpload('CIVIL_INSURANCE')}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              {uploadingCategory === 'CIVIL_INSURANCE' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <span>Thay tệp</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveUploadedDoc(insuranceDoc.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              title="Xóa tệp"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={uploadingCategory === 'CIVIL_INSURANCE'}
                            onClick={() => triggerCategoryDocUpload('CIVIL_INSURANCE')}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60"
                          >
                            {uploadingCategory === 'CIVIL_INSURANCE' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>Bổ sung</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* NHÓM II: GIẤY CHỨNG NHẬN CHUYÊN MÔN THUYỀN VIÊN */}
                  <tr className="bg-slate-50/90">
                    <td colSpan={5} className="py-2 px-3 text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                      II. Giấy chứng nhận khả năng chuyên môn thuyền viên trực ca ({crewCertChecks.length} người)
                    </td>
                  </tr>

                  {crewCertChecks.map((check, idx) => {
                    const crewIdx = crewMembers.findIndex(
                      (c) => c.crewId === check.crewId && c.certNumber === check.certNumber
                    );
                    const targetIdx = crewIdx >= 0 ? crewIdx : idx;
                    const memberRow = crewMembers[targetIdx];
                    const linkedDoc = memberRow
                      ? resolveCrewCertDoc(memberRow, check)
                      : check.currentStep5Doc;
                    const isUploadingCrew = uploadingCrewCertId === check.crewId;
                    const rowStt = 4 + idx;

                    return (
                      <tr
                        key={`${check.crewId}-${idx}`}
                        className={
                          check.requiresStep5Upload
                            ? check.isExpired
                              ? 'bg-red-50/60'
                              : 'bg-amber-50/70'
                            : 'hover:bg-slate-50/60'
                        }
                      >
                        <td className="py-3 px-3 text-center font-bold text-slate-500">{rowStt}</td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-900">
                            Chứng chỉ {check.positionTitle}:{' '}
                            <span className="text-blue-800">{check.fullName || '(Chưa nhập họ tên)'}</span>
                          </p>
                          <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                            Số bằng: {check.certNumber || '---'} • Hạn: {check.effectiveExpireDate ? formatDate(check.effectiveExpireDate) : 'Chưa có'}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          {check.status === 'REUSE_VALID' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã có — Tự đọc lại
                            </span>
                          ) : check.status === 'UPLOADED_IN_STEP5' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã bổ sung hợp lệ
                            </span>
                          ) : check.status === 'EXPIRED_REQUIRE_UPLOAD' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                              <AlertTriangle className="w-3 h-3" />
                              Hết hạn — Cần bổ sung
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="w-3 h-3" />
                              Thiếu — Cần bổ sung
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {linkedDoc && !check.requiresStep5Upload ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                    linkedDoc.fileType === 'PDF'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {linkedDoc.fileType === 'PDF' ? 'PDF' : 'ẢNH'}
                                </span>
                                <span className="font-semibold text-slate-900 truncate max-w-[230px]" title={linkedDoc.fileName}>
                                  {linkedDoc.fileName}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {check.canReuse ? 'Đọc lại từ hệ thống (không cần tải lại)' : `Đã tải lên • ${linkedDoc.fileSize}`}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className={`text-[11px] font-semibold ${check.isExpired ? 'text-red-700' : 'text-amber-900'}`}>
                                {check.isExpired
                                  ? 'Chứng chỉ đã hết hạn — Cập nhật ngày hết hạn mới & bổ sung ảnh/PDF.'
                                  : 'Chưa có ảnh/file chứng chỉ trên hệ thống — Vui lòng bấm Bổ sung.'}
                              </p>
                              {check.isExpired && memberRow && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="text"
                                    value={memberRow.certNumber || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCrewMembers((prev) =>
                                        prev.map((item, i) => (i === targetIdx ? { ...item, certNumber: val } : item))
                                      );
                                    }}
                                    placeholder="Số bằng mới"
                                    className="px-2 py-1 text-[11px] font-mono border border-slate-300 rounded-lg bg-white w-36"
                                  />
                                  <input
                                    type="date"
                                    value={memberRow.certExpireDate || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCrewMembers((prev) =>
                                        prev.map((item, i) => (i === targetIdx ? { ...item, certExpireDate: val } : item))
                                      );
                                    }}
                                    className={`px-2 py-1 text-[11px] font-bold border rounded-lg bg-white ${
                                      (memberRow.certExpireDate || '') < todayIso
                                        ? 'border-red-400 text-red-700'
                                        : 'border-emerald-400 text-emerald-800'
                                    }`}
                                  />
                                </div>
                              )}
                              {check.currentStep5Doc && (
                                <p className="text-[10px] text-amber-800 font-semibold">
                                  Tệp vừa chọn: {check.currentStep5Doc.fileName} (cần hạn ≥ {formatDate(todayIso)})
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            {linkedDoc && (
                              <button
                                type="button"
                                onClick={() => setPreviewDocModal(linkedDoc)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem</span>
                              </button>
                            )}
                            {check.requiresStep5Upload ? (
                              <button
                                type="button"
                                disabled={isUploadingCrew}
                                onClick={() => triggerCrewCertUpload(check.crewId)}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60"
                              >
                                {isUploadingCrew ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Upload className="w-3.5 h-3.5" />
                                )}
                                <span>{isUploadingCrew ? 'Đang tải...' : 'Bổ sung'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isUploadingCrew}
                                onClick={() => triggerCrewCertUpload(check.crewId)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                {isUploadingCrew ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Upload className="w-3.5 h-3.5" />
                                )}
                                <span>Thay tệp</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* NHÓM III: CHỨNG TỪ NỘP PHÍ, LỆ PHÍ CẢNG BẾN (R11) */}
                  <tr className="bg-slate-50/90">
                    <td colSpan={5} className="py-2 px-3 text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                      III. Chứng từ nộp phí, lệ phí cảng bến chuyến này (Quy tắc R11)
                    </td>
                  </tr>

                  <tr className={!hasValidFee ? 'bg-red-50/60' : 'hover:bg-slate-50/60'}>
                    <td className="py-3 px-3 text-center font-bold text-slate-500">{4 + crewCertChecks.length}</td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-900">Biên lai nộp phí, lệ phí cảng vụ / Chứng từ chuyển khoản</p>
                      <span className="inline-block mt-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        Bắt buộc (R11) • Tải ảnh/PDF biên lai hoặc nhập mã giao dịch
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {hasValidFee ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {feeDocs.length > 0 ? `Đã có (${feeDocs.length} tệp)` : 'Đã có mã GD'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                          <AlertTriangle className="w-3 h-3" />
                          Thiếu — Cần bổ sung
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {feeDocs.length > 0 ? (
                        <div className="space-y-1">
                          {feeDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-white text-slate-700 border border-slate-200 shrink-0">
                                  {doc.fileType}
                                </span>
                                <span className="font-semibold text-slate-900 truncate max-w-[190px]" title={doc.fileName}>
                                  {doc.fileName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDocModal(doc)}
                                  className="text-blue-600 hover:underline font-bold text-[11px] px-1 cursor-pointer"
                                >
                                  Xem
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveUploadedDoc(doc.id)}
                                  className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                                  title="Xóa biên lai"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {feeTransactionCode.trim() && (
                            <p className="text-[11px] text-emerald-700 font-mono font-bold">
                              Mã GD: {feeTransactionCode.trim()}
                            </p>
                          )}
                        </div>
                      ) : feeTransactionCode.trim() ? (
                        <p className="text-[11px] font-mono font-bold text-emerald-800">
                          Mã giao dịch chuyển khoản: {feeTransactionCode.trim()}
                        </p>
                      ) : (
                        <p className="text-[11px] font-semibold text-red-700">
                          Chưa có biên lai nộp phí hoặc mã giao dịch. Bấm Bổ sung hoặc nhập mã giao dịch bên dưới.
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={uploadingCategory === 'FEE_RECEIPT'}
                          onClick={() => triggerCategoryDocUpload('FEE_RECEIPT', false)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                            !hasValidFee
                              ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs'
                              : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {uploadingCategory === 'FEE_RECEIPT' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>{feeDocs.length > 0 ? 'Thêm biên lai' : 'Bổ sung'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={uploadingCategory === 'FEE_RECEIPT'}
                          onClick={() => triggerCategoryDocUpload('FEE_RECEIPT', true)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                          title="Chụp ảnh biên lai bằng camera"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Chụp</span>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* NHÓM IV: GIẤY TỜ BỔ SUNG KHÁC (NẾU CÓ) */}
                  {otherDocs.length > 0 && (
                    <>
                      <tr className="bg-slate-50/90">
                        <td colSpan={5} className="py-2 px-3 text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                          IV. Giấy tờ, biên bản bổ sung khác ({otherDocs.length} tệp)
                        </td>
                      </tr>
                      {otherDocs.map((doc, oIdx) => (
                        <tr key={doc.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3 text-center font-bold text-slate-500">
                            {5 + crewCertChecks.length + oIdx}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-bold text-slate-900">{doc.categoryName}</p>
                            {doc.note && <p className="text-[11px] text-slate-500">{doc.note}</p>}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã đính kèm
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                                {doc.fileType}
                              </span>
                              <span className="font-semibold text-slate-900 truncate max-w-[240px]" title={doc.fileName}>
                                {doc.fileName}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">{doc.fileSize} • {doc.uploadedAt}</p>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewDocModal(doc)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveUploadedDoc(doc.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                title="Xóa tệp"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Thanh bổ sung giấy tờ khác ở cuối bảng */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                <input
                  type="text"
                  value={docNoteInput}
                  onChange={(e) => setDocNoteInput(e.target.value)}
                  placeholder="Ghi chú / số hiệu giấy tờ khác muốn đính kèm thêm (không bắt buộc)..."
                  className="flex-1 min-w-[200px] px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={uploadingCategory === 'OTHER'}
                  onClick={() => triggerCategoryDocUpload('OTHER', false)}
                  className="px-3 py-1.5 bg-[#072b61] hover:bg-[#0c4a9c] text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-60"
                >
                  {uploadingCategory === 'OTHER' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Bổ sung giấy tờ khác (PDF / Ảnh)</span>
                </button>
                <button
                  type="button"
                  disabled={uploadingCategory === 'OTHER'}
                  onClick={() => triggerCategoryDocUpload('OTHER', true)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-60"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Chụp camera</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ======================================================== */}
      {/* BƯỚC 6: DANH SÁCH KẾT QUẢ KIỂM TRA TÀU, THUYỀN VIÊN, HÀNG HÓA & GIẤY TỜ */}
      {/* ======================================================== */}
      {currentStep === 6 && (() => {
        const { totalCount, passedCount, warningCount, blockingCount, items } = step6InspectionSummary;

        const filteredItems =
          step6RuleFilter === 'ALL'
            ? items
            : items.filter((item) => item.status === step6RuleFilter);

        const groupOrder: Array<{
          key: 'TAU' | 'THUYEN_VIEN' | 'HANG_HOA' | 'GIAY_TO_TAU';
          title: string;
        }> = [
          { key: 'TAU', title: 'I. Kiểm tra phương tiện (Tàu)' },
          { key: 'THUYEN_VIEN', title: 'II. Kiểm tra thuyền viên' },
          { key: 'HANG_HOA', title: 'III. Kiểm tra hàng hóa' },
          { key: 'GIAY_TO_TAU', title: 'IV. Kiểm tra giấy tờ liên quan đến thuyền' },
        ];

        let rowSerial = 0;

        return (
        <div className="space-y-5">
          {/* Tiêu đề & Công cụ hỗ trợ */}
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                Bước 6: Danh sách kết quả kiểm tra &amp; Nộp hồ sơ
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Phương tiện: <strong className="text-slate-800">{selectedVessel?.name} ({selectedVessel?.regNumber})</strong> · Kiểm tra tàu, thuyền viên, hàng hóa và giấy tờ liên quan đến thuyền
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAiChatDrawer(true)}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>Chat hướng dẫn</span>
              </button>
            </div>
          </div>

          {/* Thanh tổng hợp kết quả kiểm tra & Bộ lọc trạng thái */}
          <div
            className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
              blockingCount > 0
                ? 'bg-red-50/90 border-red-300 text-red-950'
                : warningCount > 0
                ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                : 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {blockingCount > 0 ? (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              ) : warningCount > 0 ? (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              )}
              <div>
                <p className="font-extrabold">
                  {blockingCount > 0
                    ? `Chưa đủ điều kiện nộp: Còn ${blockingCount} hạng mục không đạt cần khắc phục`
                    : warningCount > 0
                    ? `Đủ điều kiện nộp kèm xác nhận: Có ${warningCount} hạng mục cảnh báo cần lưu ý`
                    : 'Đạt đầy đủ kiểm tra tàu, thuyền viên, hàng hóa & giấy tờ — Đủ điều kiện gửi hồ sơ'}
                </p>
                <p className="text-[11px] opacity-85 tabular-nums mt-0.5">
                  Đạt: <strong>{passedCount}/{totalCount}</strong>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  Cảnh báo: <strong>{warningCount}</strong>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  Không đạt: <strong>{blockingCount}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 bg-white/90 border border-slate-200 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setStep6RuleFilter('ALL')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap tabular-nums ${
                  step6RuleFilter === 'ALL'
                    ? 'bg-[#072b61] text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Tất cả ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setStep6RuleFilter('FAILED')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap tabular-nums ${
                  step6RuleFilter === 'FAILED'
                    ? 'bg-red-600 text-white'
                    : 'text-red-700 hover:bg-red-50'
                }`}
              >
                Không đạt ({blockingCount})
              </button>
              <button
                type="button"
                onClick={() => setStep6RuleFilter('WARNING')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap tabular-nums ${
                  step6RuleFilter === 'WARNING'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                Cảnh báo ({warningCount})
              </button>
              <button
                type="button"
                onClick={() => setStep6RuleFilter('PASSED')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap tabular-nums ${
                  step6RuleFilter === 'PASSED'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Đạt ({passedCount})
              </button>
            </div>
          </div>

          {/* DANH SÁCH KẾT QUẢ KIỂM TRA: TÀU, THUYỀN VIÊN, HÀNG HÓA & GIẤY TỜ LIÊN QUAN ĐẾN THUYỀN */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs border-collapse">
                <thead className="bg-[#edf4fe] text-[#07244d] text-[11px] font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center">STT</th>
                    <th className="py-3 px-3 w-20">Mã</th>
                    <th className="py-3 px-3 w-[27%]">Hạng mục kiểm tra</th>
                    <th className="py-3 px-3 w-36">Kết quả</th>
                    <th className="py-3 px-3">Chi tiết đánh giá</th>
                    <th className="py-3 px-3 w-36 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                        <p className="font-medium">Không có hạng mục kiểm tra nào thuộc trạng thái đang lọc.</p>
                        <button
                          type="button"
                          onClick={() => setStep6RuleFilter('ALL')}
                          className="mt-2 text-blue-700 hover:underline font-bold cursor-pointer"
                        >
                          Hiển thị toàn bộ {totalCount} hạng mục
                        </button>
                      </td>
                    </tr>
                  ) : (
                    groupOrder.map((grp) => {
                      const groupItems = filteredItems.filter((item) => item.groupKey === grp.key);
                      if (groupItems.length === 0) return null;

                      return (
                        <React.Fragment key={grp.key}>
                          <tr className="bg-slate-50/95">
                            <td
                              colSpan={6}
                              className="py-2 px-3 text-[11px] font-extrabold text-[#07244d] tracking-wide"
                            >
                              {grp.title}
                            </td>
                          </tr>
                          {groupItems.map((item) => {
                            rowSerial += 1;
                            const isFailed = item.status === 'FAILED';
                            const isWarning = item.status === 'WARNING';

                            return (
                              <tr
                                key={item.code}
                                className={
                                  isFailed
                                    ? 'bg-red-50/55 hover:bg-red-50/85 transition-colors'
                                    : isWarning
                                    ? 'bg-amber-50/45 hover:bg-amber-50/80 transition-colors'
                                    : 'hover:bg-slate-50/70 transition-colors'
                                }
                              >
                                <td className="py-3 px-3 text-center font-semibold text-slate-500 tabular-nums align-top">
                                  {rowSerial}
                                </td>
                                <td className="py-3 px-3 font-mono font-extrabold text-slate-800 align-top whitespace-nowrap">
                                  {item.code}
                                </td>
                                <td className="py-3 px-3 align-top">
                                  <p className="font-bold text-slate-900 leading-snug">{item.title}</p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {item.severity === 'BLOCKING' ? 'Điều kiện bắt buộc' : 'Theo dõi / Cảnh báo'}
                                  </p>
                                </td>
                                <td className="py-3 px-3 align-top whitespace-nowrap">
                                  {isFailed ? (
                                    <span className="inline-flex items-center gap-1.5 font-extrabold text-red-700">
                                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                      <span>Không đạt</span>
                                    </span>
                                  ) : isWarning ? (
                                    <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-700">
                                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                      <span>Cảnh báo</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                      <span>Đạt</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 align-top">
                                  <p
                                    className={`leading-relaxed ${
                                      isFailed
                                        ? 'text-red-950 font-semibold'
                                        : isWarning
                                        ? 'text-amber-950 font-medium'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {item.message}
                                  </p>
                                  {item.details && (
                                    <p className="text-[11px] text-slate-500 mt-0.5">{item.details}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right align-top whitespace-nowrap">
                                  {isFailed ? (
                                    <button
                                      type="button"
                                      onClick={() => handleStepChange(item.targetStep)}
                                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white inline-flex items-center gap-1 cursor-pointer transition"
                                    >
                                      <span>Sửa {item.targetLabel}</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  ) : isWarning ? (
                                    <button
                                      type="button"
                                      onClick={() => handleStepChange(item.targetStep)}
                                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 inline-flex items-center gap-1 cursor-pointer transition"
                                    >
                                      <span>Xem {item.targetLabel}</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 font-medium">{item.targetLabel}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tóm lược hồ sơ & Xem trước 3 biểu mẫu điện tử */}
          <div className="bg-slate-50/80 rounded-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-slate-900">
                  Tóm lược hồ sơ chuyến đi
                </span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className="text-blue-700 font-bold tabular-nums">
                  {uploadedDocuments.length} tệp đính kèm
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTab('GENERAL');
                    setPreviewModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-blue-700 border border-slate-300 rounded-xl transition cursor-pointer whitespace-nowrap"
                >
                  1. Bản khai chung
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTab('CREW');
                    setPreviewModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-blue-700 border border-slate-300 rounded-xl transition cursor-pointer whitespace-nowrap"
                >
                  2. DS Thuyền viên
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTab('PASSENGER');
                    setPreviewModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-blue-700 border border-slate-300 rounded-xl transition cursor-pointer whitespace-nowrap"
                >
                  3. DS Hành khách
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 p-4 bg-white text-[11px] text-slate-700 tabular-nums">
              <div>
                <span className="text-slate-500">Phương tiện: </span>
                <strong className="text-slate-900">{selectedVessel.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">Hành khách: </span>
                <strong className="text-slate-900">{passengers.length}/{selectedVessel.maxPassengers} người</strong>
              </div>
              <div>
                <span className="text-slate-500">Hàng hóa: </span>
                <strong className="text-slate-900">{cargoTons}/{selectedVessel.maxCargoTons} tấn</strong>
              </div>
              <div>
                <span className="text-slate-500">Thuyền viên: </span>
                <strong className="text-slate-900">{crewMembers.length} người</strong>
              </div>
              <div>
                <span className="text-slate-500">Tuyến: </span>
                <strong className="text-slate-900">{currentDraftTrip.routeName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Giờ rời: </span>
                <strong className="text-slate-900">{departureHour}:{departureMinute} {formatDate(departureDate)}</strong>
              </div>
              <div>
                <span className="text-slate-500">Áo phao: </span>
                <strong className="text-slate-900">{actualLifeJackets} cái</strong>
              </div>
              <div>
                <span className="text-slate-500">Người khai: </span>
                <strong className="text-slate-900">{currentDraftTrip.actualDeclarantName}</strong>
              </div>
            </div>
          </div>

          {/* Cam kết nếu có cảnh báo */}
          {step6InspectionSummary.hasWarning && (
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={acceptedWarningConsent}
                  onChange={(e) => setAcceptedWarningConsent(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 mt-0.5 shrink-0"
                />
                <span>
                  Tôi đã đọc và xác nhận các hạng mục cảnh báo trong danh sách kết quả kiểm tra nêu trên, cam đoan thông tin kê khai và giấy tờ đính kèm là chính xác, chịu trách nhiệm trước pháp luật.
                </span>
              </label>
            </div>
          )}

          {/* Xác nhận người khai và thiết bị */}
          <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs text-slate-600 flex items-center justify-between flex-wrap gap-2 tabular-nums">
            <div>
              <span>Người xác nhận: <strong className="text-slate-800">{currentDraftTrip.actualDeclarantName}</strong></span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>Thời điểm: <strong className="text-slate-800">{new Date().toLocaleTimeString('vi-VN')} ngày {new Date().toLocaleDateString('vi-VN')}</strong></span>
            </div>
            <span className="text-[11px] text-slate-500">
              Thiết bị: {currentDraftTrip.confirmationDevice}
            </span>
          </div>
        </div>
        );
      })()}
        </div>

        {/* FOOTER CỦA FORM CÁC BƯỚC */}
        <footer style={{ backgroundColor: '#dfe1e3' }} className="border-t border-slate-300 p-4 sm:p-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => handleStepChange(currentStep - 1)}
                className="px-5 py-3 text-sm font-bold text-slate-800 bg-white hover:bg-slate-100 active:bg-slate-200 rounded-xl flex items-center gap-2 transition cursor-pointer border border-slate-300 shadow-2xs"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Quay lại Bước {currentStep - 1}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveDraft(true)}
              className="px-5 py-3 text-sm font-bold text-slate-800 bg-white hover:bg-slate-100 active:bg-slate-200 rounded-xl flex items-center gap-2 transition cursor-pointer border border-slate-300 shadow-2xs"
            >
              <Save className="w-5 h-5 text-slate-600" />
              <span>Lưu bản nháp</span>
            </button>

            {canWithdrawExisting && (
              <button
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                className="px-4 py-3 text-sm font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl flex items-center gap-2 transition cursor-pointer border border-rose-300 shadow-2xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>Rút hồ sơ</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < 6 ? (
              <button
                type="button"
                onClick={() => handleStepChange(currentStep + 1)}
                className="px-7 py-3.5 text-sm sm:text-base font-black text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl flex items-center gap-2.5 shadow-md transition cursor-pointer"
              >
                <span>Tiếp tục sang Bước {currentStep + 1}</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={step6InspectionSummary.hasBlockingFailure || isBpBlocked}
                onClick={handleSubmitTrip}
                className="px-8 py-4 text-base font-black text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl flex items-center gap-3 shadow-lg transition cursor-pointer"
              >
                <Send className="w-5 h-5" />
                <span>Xác nhận khai và gửi hồ sơ</span>
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* MODAL XEM TRƯỚC 3 BIỂU MẪU */}
      <OfficialFormsModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        trip={currentDraftTrip}
        vessel={selectedVessel}
        defaultTab={previewTab}
        allowUnmask={true}
      />

      {/* INPUT TẢI ẢNH / PDF GIẤY CHỨNG NHẬN THUYỀN VIÊN (DÙNG CHUNG BƯỚC 2 & BƯỚC 5) */}
      <input
        ref={step5CrewUploadInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
        onChange={handleStep5CrewFileSelected}
        className="hidden"
      />

      {/* MODAL XEM TRƯỚC TỆP TÀI LIỆU ĐÍNH KÈM (BƯỚC 2 & BƯỚC 5) */}
      <DocumentPreviewModal
        isOpen={Boolean(previewDocModal)}
        onClose={() => setPreviewDocModal(null)}
        title={previewDocModal ? previewDocModal.categoryName : ''}
        badgeText={previewDocModal?.isReusable ? 'Hồ sơ lưu trữ dài hạn' : 'Đính kèm chuyến'}
        fileName={previewDocModal?.fileName}
        fileType={previewDocModal?.fileType}
        fileSize={previewDocModal?.fileSize}
        uploadedAt={previewDocModal?.uploadedAt}
        note={previewDocModal?.note}
        previewUrl={previewDocModal?.previewUrl}
        storageKey={previewDocModal?.storageKey}
        serverUrl={previewDocModal?.serverUrl}
        metadata={
          previewDocModal?.validUntil
            ? [{ label: 'Hạn hiệu lực', value: previewDocModal.validUntil }]
            : []
        }
      />

      {/* KHUNG CHAT AI HƯỚNG DẪN KHAI */}
      {showAiChatDrawer && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white shadow-2xl border-l border-[#dce8f7] flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-4 bg-gradient-to-r from-[#065fd4] via-[#0c74e8] to-[#1a8df5] text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#fde68a]" />
              <div>
                <h3 className="text-sm font-bold">Trợ lý Hướng dẫn khai</h3>
                <p className="text-[10px] text-blue-100">Hỗ trợ nghiệp vụ an toàn hàng hải</p>
              </div>
            </div>
            <button
              onClick={() => setShowAiChatDrawer(false)}
              className="text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/15 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 text-xs">
            {aiChatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl ${
                  msg.role === 'assistant'
                    ? 'bg-white border border-slate-200 text-slate-800 shadow-2xs'
                    : 'bg-blue-600 text-white ml-6'
                }`}
              >
                <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
              </div>
            ))}
            {isAiReplying && (
              <div className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 italic">
                Trợ lý AI đang soạn câu trả lời...
              </div>
            )}
          </div>

          <div className="p-3 border-t bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendAiChatMessage()}
                placeholder="Hỏi về cách khai, giấy tờ đính kèm, sửa lỗi..."
                className="flex-1 p-2 text-xs border border-slate-300 rounded-xl"
              />
              <button
                onClick={handleSendAiChatMessage}
                className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 cursor-pointer"
              >
                Gửi
              </button>
            </div>
            <p className="text-[9px] text-slate-400 mt-1 italic text-center">
              Do AI gợi ý – người khai chịu trách nhiệm xác nhận
            </p>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN SAO CHÉP CHUYẾN TRƯỚC */}
      {pendingCopyTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-xs">
            <h3 className="text-sm font-extrabold text-slate-900">
              Sao chép thông tin từ chuyến {pendingCopyTrip.tripNumber}?
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Hệ thống sẽ nạp lại danh sách thuyền viên ({pendingCopyTrip.crewMembers.length} người), hàng hóa ({pendingCopyTrip.cargoTons} tấn) và giấy tờ đính kèm ({pendingCopyTrip.uploadedDocuments?.length || 4} tệp). Bạn chỉ cần cập nhật giờ xuất bến.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingCopyTrip(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmCopyFromPreviousTrip}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer"
              >
                Đồng ý sao chép
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN RÚT HỒ SƠ */}
      {showWithdrawModal && existingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-200 space-y-4 text-xs">
            <h3 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Xác nhận rút hồ sơ {existingTrip.tripNumber}?
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Hồ sơ sẽ chuyển sang trạng thái <strong>Đã rút (DA_RUT)</strong> và dừng xử lý tại Ban Quản lý Cảng / Sở.
            </p>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Lý do rút hồ sơ:</label>
              <input
                type="text"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="VD: Đổi kế hoạch chạy tàu / Hoãn chuyến..."
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdraw}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer"
              >
                Xác nhận rút hồ sơ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÊM HÀNH KHÁCH (BƯỚC 3) */}
      {showAddPaxForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-passenger-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeAddPassengerModal();
            }
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header modal */}
            <div className="px-6 py-4 bg-[#f4f8ff] border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h3
                  id="add-passenger-modal-title"
                  className="text-base font-extrabold text-[#07244d] flex items-center gap-2"
                >
                  <UserCheck className="w-5 h-5 text-blue-600 shrink-0" />
                  <span>Thêm hành khách vào chuyến</span>
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 tabular-nums">
                  <span>Hành khách số #{passengers.length + 1}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Hiện có <strong className="text-slate-900">{passengers.length}</strong> /{' '}
                    <strong className="text-slate-900">{selectedVessel?.maxPassengers || 0}</strong> khách
                  </span>
                  {selectedVessel && passengers.length >= selectedVessel.maxPassengers && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-bold text-red-600">
                        {passengers.length > selectedVessel.maxPassengers
                          ? `Đang vượt ${passengers.length - selectedVessel.maxPassengers} chỗ`
                          : 'Đã đạt giới hạn sức chở tàu'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={closeAddPassengerModal}
                aria-label="Đóng cửa sổ thêm hành khách"
                className="p-2 -mr-1 -mt-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddPassenger(false);
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="px-6 py-5 overflow-y-auto space-y-5 text-xs">
                {paxFormError && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{paxFormError}</span>
                  </div>
                )}

                {/* Nhóm 1: Thông tin định danh */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-bold text-[#07244d]">1. Thông tin định danh</h4>
                    <span className="text-[11px] text-slate-400">Các trường có dấu (*) là bắt buộc</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                    <div className="sm:col-span-8">
                      <label htmlFor="pax-full-name" className="block font-semibold text-slate-700 mb-1.5">
                        Họ và tên <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="pax-full-name"
                        ref={newPaxNameInputRef}
                        type="text"
                        value={newPaxName}
                        onChange={(e) => {
                          setNewPaxName(e.target.value);
                          if (paxFormError) setPaxFormError('');
                        }}
                        placeholder="VD: Nguyễn Văn An"
                        className="w-full px-3.5 py-2.5 text-sm font-bold text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="pax-birth-year" className="font-semibold text-slate-700">
                          Năm sinh <span className="text-rose-600">*</span>
                        </label>
                        {Number.isFinite(newPaxBirthYear) && newPaxBirthYear >= 1900 && newPaxBirthYear <= 2026 && (
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            {2026 - newPaxBirthYear} tuổi
                          </span>
                        )}
                      </div>
                      <input
                        id="pax-birth-year"
                        type="number"
                        min={1900}
                        max={2026}
                        value={newPaxBirthYear}
                        onChange={(e) => {
                          setNewPaxBirthYear(parseInt(e.target.value, 10) || 1990);
                          if (paxFormError) setPaxFormError('');
                        }}
                        className="w-full px-3.5 py-2.5 text-sm font-semibold tabular-nums text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <span className="block font-semibold text-slate-700 mb-1.5">Giới tính</span>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        {(
                          [
                            { value: 'NAM', label: 'Nam' },
                            { value: 'NU', label: 'Nữ' },
                            { value: 'KHAC', label: 'Khác' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setNewPaxGender(opt.value)}
                            className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                              newPaxGender === opt.value
                                ? 'bg-white text-[#07244d] shadow-2xs ring-1 ring-slate-200'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sm:col-span-6">
                      <span className="block font-semibold text-slate-700 mb-1.5">Quốc tịch / Phân loại</span>
                      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setNewPaxIsForeigner(false)}
                          className={`py-2 px-2 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                            !newPaxIsForeigner
                              ? 'bg-white text-[#07244d] shadow-2xs ring-1 ring-slate-200'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Việt Nam
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewPaxIsForeigner(true)}
                          className={`py-2 px-2 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                            newPaxIsForeigner
                              ? 'bg-white text-purple-800 shadow-2xs ring-1 ring-purple-200'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Nước ngoài
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nhóm 2: Giấy tờ & Liên hệ */}
                <div className="space-y-3.5">
                  <div className="border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-bold text-[#07244d]">2. Giấy tờ tùy thân &amp; Liên hệ</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="pax-id-number" className="block font-semibold text-slate-700 mb-1.5">
                        {newPaxIsForeigner ? 'Số Hộ chiếu' : 'Số CCCD / CMND'}
                      </label>
                      <input
                        id="pax-id-number"
                        type="text"
                        value={newPaxIdNumber}
                        onChange={(e) => setNewPaxIdNumber(e.target.value)}
                        placeholder={newPaxIsForeigner ? 'VD: C12345678' : 'VD: 051085001234'}
                        className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                      />
                    </div>

                    <div>
                      <label htmlFor="pax-phone" className="block font-semibold text-slate-700 mb-1.5">
                        Số điện thoại liên hệ
                      </label>
                      <input
                        id="pax-phone"
                        type="tel"
                        value={newPaxPhone}
                        onChange={(e) => setNewPaxPhone(e.target.value)}
                        placeholder="VD: 0988123456"
                        className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Nhóm 3: Địa chỉ & Ghi chú */}
                <div className="space-y-3.5">
                  <div className="border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-bold text-[#07244d]">3. Địa chỉ lưu trú &amp; Ghi chú</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                    <div className="sm:col-span-7">
                      <label htmlFor="pax-address" className="block font-semibold text-slate-700 mb-1.5">
                        Địa chỉ thường trú / Lưu trú
                      </label>
                      <input
                        id="pax-address"
                        type="text"
                        value={newPaxAddress}
                        onChange={(e) => setNewPaxAddress(e.target.value)}
                        placeholder="VD: Thôn Tây, Lý Sơn, Quảng Ngãi"
                        className="w-full px-3.5 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label htmlFor="pax-notes" className="block font-semibold text-slate-700 mb-1.5">
                        Ghi chú (tùy chọn)
                      </label>
                      <input
                        id="pax-notes"
                        type="text"
                        value={newPaxNotes}
                        onChange={(e) => setNewPaxNotes(e.target.value)}
                        placeholder="VD: Khách du lịch, đi cùng trẻ em..."
                        className="w-full px-3.5 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Theo dõi nhanh các hành khách vừa thêm trong phiên nhập hiện tại */}
                {sessionAddedPax.length > 0 && (
                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Đã thêm trong phiên này ({sessionAddedPax.length})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Tiếp tục nhập người tiếp theo hoặc bấm Đóng khi hoàn tất
                      </span>
                    </div>
                    <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {sessionAddedPax.map((added, i) => (
                        <div
                          key={added.id}
                          className={`px-3 py-1.5 flex items-center justify-between gap-2 text-xs ${
                            i % 2 === 0 ? 'bg-white' : 'bg-[#f1f6fd]/60'
                          }`}
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-bold text-slate-900">{added.fullName}</span>
                            <span className="text-slate-500 ml-2 tabular-nums">
                              · {added.birthYear} · {added.gender === 'NAM' ? 'Nam' : added.gender === 'NU' ? 'Nữ' : 'Khác'} · {added.idNumber}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePassenger(added.id)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded cursor-pointer shrink-0"
                            title="Bỏ hành khách này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer modal */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="text-xs text-slate-600 tabular-nums">
                  {selectedVessel ? (
                    passengers.length < selectedVessel.maxPassengers ? (
                      <span>
                        Còn trống{' '}
                        <strong className="text-emerald-700">
                          {selectedVessel.maxPassengers - passengers.length} chỗ
                        </strong>{' '}
                        trên tàu {selectedVessel.name}
                      </span>
                    ) : (
                      <span className="font-semibold text-amber-700">
                        Đã đủ/vượt sức chở tàu ({passengers.length}/{selectedVessel.maxPassengers} khách)
                      </span>
                    )
                  ) : (
                    <span>Chưa chọn phương tiện</span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeAddPassengerModal}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPassenger(true)}
                    className="px-4 py-2.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Lưu &amp; thêm tiếp</span>
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Lưu hành khách</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
