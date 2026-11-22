/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AdminOperationalConfig,
  BpSystemConfig,
  BqlChecklistItemConfig,
  CrewMember,
  InternalPhase,
  MaritimeRoute,
  PortLocation,
  SystemRuleConfig,
  TripStatus,
  UserAccount,
  Vessel,
  WeatherCondition,
} from '../types';

export const DEFAULT_PORTS: PortLocation[] = [
  {
    id: 'PORT-01',
    code: 'LS-DL',
    name: 'Bến cảng Lý Sơn (Đảo Lớn)',
    island: 'Đảo Lớn',
    description: 'Cảng bến thủy nội địa trung tâm đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    isOperating: true,
  },
  {
    id: 'PORT-02',
    code: 'LS-DB',
    name: 'Bến Đảo Bé (An Bình)',
    island: 'Đảo Bé',
    description: 'Bến thủy nội địa xã đảo An Bình, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    isOperating: true,
  },
];

export const DEFAULT_ROUTES: MaritimeRoute[] = [
  {
    id: 'ROUTE-01',
    code: 'LS-AB',
    name: 'Tuyến Đảo Lớn – Đảo Bé (Chiều đi)',
    fromPortId: 'PORT-01',
    toPortId: 'PORT-02',
    distanceNauticalMiles: 3.0,
    normalDurationMinutes: 20,
    frequencyText: '30 phút/chuyến',
    isSuspended: false,
  },
  {
    id: 'ROUTE-02',
    code: 'AB-LS',
    name: 'Tuyến Đảo Bé – Đảo Lớn (Chiều về)',
    fromPortId: 'PORT-02',
    toPortId: 'PORT-01',
    distanceNauticalMiles: 3.0,
    normalDurationMinutes: 20,
    frequencyText: '30 phút/chuyến',
    isSuspended: false,
  },
];

// Danh sách 11 phương tiện VR-SB tuyến Đảo Lớn – Đảo Bé (Đặc khu Lý Sơn)
export const DEFAULT_VESSELS: Vessel[] = [
  {
    id: 'VES-01',
    regNumber: 'QNg-0322',
    callSign: 'QNG 0322',
    name: 'CÙ LAO RÉ 02',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 36,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 500,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-01-25',
    operatingLicenseExpireDate: '2027-01-25',
    techSafetyExpireDate: '2027-01-25',
    civilInsuranceExpireDate: '2027-07-25',
    ownerName: 'Công ty TNHH MTV Du lịch Cù lao ré',
    ownerPhone: '0976579439',
    ownerAddress: 'Thôn Tây An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    captainName: 'Lê Tấn Lý',
    captainPhone: '0906569293',
    notes: '- 0976 579 439 (Giám đốc: Phan Minh Định)\n- 0965 123 642 (Điều hành: Nguyễn Anh Tuấn)',
    isActive: true,
  },
  {
    id: 'VES-02',
    regNumber: 'QNg-0323',
    callSign: 'QNG 0323',
    name: 'CÙ LAO RÉ 05',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 36,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 500,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-01-25',
    operatingLicenseExpireDate: '2027-01-25',
    techSafetyExpireDate: '2027-01-25',
    civilInsuranceExpireDate: '2027-08-14',
    ownerName: 'Công ty TNHH MTV Du lịch Cù lao ré',
    ownerPhone: '0976579439',
    ownerAddress: 'Thôn Tây An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    captainName: 'Nguyễn Anh Tuấn',
    captainPhone: '0965123642',
    notes: '- 0976 579 439 (Giám đốc: Phan Minh Định)\n- 0965 123 642 (Điều hành: Nguyễn Anh Tuấn)',
    isActive: true,
  },
  {
    id: 'VES-03',
    regNumber: 'QNg-0325',
    callSign: 'QNG 0325',
    name: 'CÙ LAO RÉ 07',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 32,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 400,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-01-22',
    operatingLicenseExpireDate: '2027-01-22',
    techSafetyExpireDate: '2027-01-22',
    civilInsuranceExpireDate: '2027-04-01',
    ownerName: 'Công ty TNHH MTV Du lịch Cù lao ré',
    ownerPhone: '0976579439',
    ownerAddress: 'Thôn Tây An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    captainName: 'Võ Văn Bình',
    captainPhone: '0988121226',
    notes: '- 0976 579 439 (Giám đốc: Phan Minh Định)\n- 0965 123 642 (Điều hành: Nguyễn Anh Tuấn)',
    isActive: true,
  },
  {
    id: 'VES-04',
    regNumber: 'QNg-0264',
    callSign: 'QNG 0264',
    name: 'CÙ LAO RÉ 09',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 34,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 400,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2026-02-09',
    operatingLicenseExpireDate: '2026-02-09',
    techSafetyExpireDate: '2026-02-09',
    civilInsuranceExpireDate: '2026-10-12',
    ownerName: 'Công ty TNHH MTV Du lịch Cù lao ré',
    ownerPhone: '0976579439',
    ownerAddress: 'Thôn Tây An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    captainName: 'Lê Đình Phương',
    captainPhone: '0961399788',
    notes: '- 0976 579 439 (Giám đốc: Phan Minh Định)\n- 0965 123 642 (Điều hành: Nguyễn Anh Tuấn)',
    isActive: true,
  },
  {
    id: 'VES-05',
    regNumber: 'QNg-0346',
    callSign: 'QNG 0346',
    name: 'LYSONTOURIST 02',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 38,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 400,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-01-25',
    operatingLicenseExpireDate: '2027-01-25',
    techSafetyExpireDate: '2027-01-25',
    civilInsuranceExpireDate: '2027-03-14',
    ownerName: 'Công ty TNHH DV Lữ hành LySontourist',
    ownerPhone: '0985064479',
    ownerAddress: 'Thôn Đông An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    ownerEmail: 'tiendungls151@gmail.com',
    captainName: 'Bùi Tiến Dũng',
    captainPhone: '0985064479',
    notes: '0985 064 479 (Giám đốc: Bùi Tiến Dũng)',
    isActive: true,
  },
  {
    id: 'VES-06',
    regNumber: 'QNg-0433',
    callSign: 'QNG 0433',
    name: 'AN BÌNH 07',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 38,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 600,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-03-14',
    operatingLicenseExpireDate: '2027-03-14',
    techSafetyExpireDate: '2027-03-14',
    civilInsuranceExpireDate: '2027-06-14',
    ownerName: 'Công ty TNHH DV Lữ hành LySontourist',
    ownerPhone: '0985064479',
    ownerAddress: 'Thôn Đông An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    ownerEmail: 'tiendungls151@gmail.com',
    captainName: 'Võ Minh Thạch',
    captainPhone: '0339002376',
    notes: '0985 064 479 (Giám đốc: Bùi Tiến Dũng) · Cần kiểm tra lại hạn BH dân sự (14/06/2027?)',
    isActive: true,
  },
  {
    id: 'VES-07',
    regNumber: 'QNg-0294',
    callSign: 'QNG 0294',
    name: 'THANH LIÊM 01',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 23,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 200,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-01-25',
    operatingLicenseExpireDate: '2027-01-25',
    techSafetyExpireDate: '2027-01-25',
    civilInsuranceExpireDate: '2026-10-12',
    ownerName: 'Công ty TNHH DV Lữ hành LySontourist',
    ownerPhone: '0985064479',
    ownerAddress: 'Thôn Đông An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    ownerEmail: 'tiendungls151@gmail.com',
    captainName: 'Trần Chí Bình',
    captainPhone: '0336373606',
    notes: '0985 064 479 (Giám đốc: Bùi Tiến Dũng)',
    isActive: true,
  },
  {
    id: 'VES-08',
    regNumber: 'QNg-0305',
    callSign: 'QNG 0305',
    name: 'THANH TRÂN 04',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 32,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 400,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-02-10',
    operatingLicenseExpireDate: '2027-02-10',
    techSafetyExpireDate: '2027-02-10',
    civilInsuranceExpireDate: '2027-03-27',
    ownerName: 'DNTN dịch vụ du lịch Thanh Trân',
    ownerPhone: '0977871129',
    ownerAddress: 'Thôn Tây An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    ownerEmail: 'Dulichthanhtranlyson@gmail.com',
    captainName: 'Ngô Văn Hùng',
    captainPhone: '0983028676',
    notes: 'GĐ: Võ Văn Thanh (0977871129)',
    isActive: true,
  },
  {
    id: 'VES-09',
    regNumber: 'QNg-0285',
    callSign: 'QNG 0285',
    name: 'THANH TRÂN 03',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 25,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 200,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-02-04',
    operatingLicenseExpireDate: '2027-02-04',
    techSafetyExpireDate: '2027-02-04',
    civilInsuranceExpireDate: '2027-03-09',
    ownerName: 'DNTN dịch vụ du lịch Thanh Trân',
    ownerPhone: '0977871129',
    ownerAddress: 'Thôn Tây An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    ownerEmail: 'Dulichthanhtranlyson@gmail.com',
    captainName: 'Nguyễn Văn Hải',
    captainPhone: '0978087493',
    notes: 'GĐ: Võ Văn Thanh (0977871129)',
    isActive: true,
  },
  {
    id: 'VES-10',
    regNumber: 'QNg-0275',
    callSign: 'QNG 0275',
    name: 'THANH TRÂN 02',
    vesselType: 'Tàu khách cao tốc VR-SB',
    maxPassengers: 25,
    maxCargoTons: 0,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 200,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-01-12',
    operatingLicenseExpireDate: '2027-01-12',
    techSafetyExpireDate: '2027-01-12',
    civilInsuranceExpireDate: '2027-03-09',
    ownerName: 'DNTN dịch vụ du lịch Thanh Trân',
    ownerPhone: '0977871129',
    ownerAddress: 'Thôn Tây An Vĩnh, đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    ownerEmail: 'Dulichthanhtranlyson@gmail.com',
    captainName: 'Phan Văn Trung',
    captainPhone: '0367094352',
    notes: 'GĐ: Võ Văn Thanh (0977871129)',
    isActive: true,
  },
  {
    id: 'VES-11',
    regNumber: 'QNg-0237',
    callSign: 'QNG 0237',
    name: 'AN BÌNH 02',
    vesselType: 'Tàu khách kết hợp hàng hóa VR-SB',
    maxPassengers: 10,
    maxCargoTons: 4,
    deadweightTons: 4,
    minCrew: 3,
    maxWindForce: 5,
    maxWaveHeight: 2.0,
    enginePowerCv: 105,
    registryPort: 'Quảng Ngãi',
    registryExpireDate: '2027-01-15',
    operatingLicenseExpireDate: '2027-01-15',
    techSafetyExpireDate: '2027-01-15',
    civilInsuranceExpireDate: '2027-03-10',
    ownerName: 'Võ Minh Thông',
    ownerPhone: '0961627479',
    ownerAddress: 'Đặc khu Lý Sơn, tỉnh Quảng Ngãi',
    captainName: 'Võ Minh Thạch',
    captainPhone: '0339002376',
    notes: 'Trọng tải: 10 người + 4,00 tấn · Chủ tàu: Võ Minh Thông (0961627479)',
    isActive: true,
  },
];

export interface OfficialCaptainEntry {
  vesselId: string;
  vesselName: string;
  regNumber: string;
  captainName: string;
  captainPhone: string;
}

// Danh sách 11 Thuyền trưởng chuẩn theo từng phương tiện VR-SB
export const OFFICIAL_VRSB_CAPTAINS: OfficialCaptainEntry[] = [
  { vesselId: 'VES-01', vesselName: 'CÙ LAO RÉ 02', regNumber: 'QNg-0322', captainName: 'Lê Tấn Lý', captainPhone: '0906569293' },
  { vesselId: 'VES-02', vesselName: 'CÙ LAO RÉ 05', regNumber: 'QNg-0323', captainName: 'Nguyễn Anh Tuấn', captainPhone: '0965123642' },
  { vesselId: 'VES-03', vesselName: 'CÙ LAO RÉ 07', regNumber: 'QNg-0325', captainName: 'Võ Văn Bình', captainPhone: '0988121226' },
  { vesselId: 'VES-04', vesselName: 'CÙ LAO RÉ 09', regNumber: 'QNg-0264', captainName: 'Lê Đình Phương', captainPhone: '0961399788' },
  { vesselId: 'VES-05', vesselName: 'LYSONTOURIST 02', regNumber: 'QNg-0346', captainName: 'Bùi Tiến Dũng', captainPhone: '0985064479' },
  { vesselId: 'VES-06', vesselName: 'AN BÌNH 07', regNumber: 'QNg-0433', captainName: 'Võ Minh Thạch', captainPhone: '0339002376' },
  { vesselId: 'VES-07', vesselName: 'THANH LIÊM 01', regNumber: 'QNg-0294', captainName: 'Trần Chí Bình', captainPhone: '0336373606' },
  { vesselId: 'VES-08', vesselName: 'THANH TRÂN 04', regNumber: 'QNg-0305', captainName: 'Ngô Văn Hùng', captainPhone: '0983028676' },
  { vesselId: 'VES-09', vesselName: 'THANH TRÂN 03', regNumber: 'QNg-0285', captainName: 'Nguyễn Văn Hải', captainPhone: '0978087493' },
  { vesselId: 'VES-10', vesselName: 'THANH TRÂN 02', regNumber: 'QNg-0275', captainName: 'Phan Văn Trung', captainPhone: '0367094352' },
  { vesselId: 'VES-11', vesselName: 'AN BÌNH 02', regNumber: 'QNg-0237', captainName: 'Võ Minh Thạch', captainPhone: '0339002376' },
];

// Xây dựng danh sách Thuyền trưởng chuẩn theo danh sách phương tiện VR-SB
export function buildCaptainsFromVessels(vessels: Vessel[]): CrewMember[] {
  const sourceVessels = vessels.length > 0 ? vessels : DEFAULT_VESSELS;
  const matchedEntries: CrewMember[] = [];
  const usedVesselIds = new Set<string>();

  for (const entry of OFFICIAL_VRSB_CAPTAINS) {
    const matched = sourceVessels.find(
      (v) =>
        v.id === entry.vesselId ||
        v.name.trim().toUpperCase() === entry.vesselName.trim().toUpperCase()
    );
    const vId = matched?.id || entry.vesselId;
    const reg = matched?.regNumber || entry.regNumber;
    const cleanReg = reg.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    usedVesselIds.add(vId);
    matchedEntries.push({
      id: `CREW-CAP-${vId}`,
      fullName: (matched?.captainName || entry.captainName).trim(),
      citizenId: '',
      phone: (matched?.captainPhone || entry.captainPhone).trim(),
      position: 'CAPTAIN',
      positionTitle: 'Thuyền trưởng',
      nationality: 'Việt Nam',
      certNumber: `TT-VRSB-${cleanReg}`,
      certType: 'Giấy chứng nhận KNCM Thuyền trưởng VR-SB',
      certExpireDate: '2028-12-31',
      assignedVesselId: vId,
      status: 'ACTIVE',
    });
  }

  // Bổ sung thêm các tàu mới tạo ngoài 11 tàu chuẩn (nếu có khai báo thuyền trưởng)
  for (const v of sourceVessels) {
    if (usedVesselIds.has(v.id)) continue;
    if (!v.captainName || !v.captainName.trim()) continue;
    const cleanReg = (v.regNumber || v.id).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    matchedEntries.push({
      id: `CREW-CAP-${v.id}`,
      fullName: v.captainName.trim(),
      citizenId: '',
      phone: (v.captainPhone || v.ownerPhone || '').trim(),
      position: 'CAPTAIN',
      positionTitle: 'Thuyền trưởng',
      nationality: 'Việt Nam',
      certNumber: `TT-VRSB-${cleanReg}`,
      certType: 'Giấy chứng nhận KNCM Thuyền trưởng VR-SB',
      certExpireDate: '2028-12-31',
      assignedVesselId: v.id,
      status: 'ACTIVE',
    });
  }

  return matchedEntries;
}

export const DEFAULT_CAPTAINS: CrewMember[] = buildCaptainsFromVessels(DEFAULT_VESSELS);

// ĐÚNG 12 QUY TẮC KIỂM TRA TỰ ĐỘNG R1–R12 THEO ĐẶC TẢ MỤC 6
export const DEFAULT_RULES_CONFIG: SystemRuleConfig[] = [
  {
    code: 'R1',
    name: 'Sức chở hành khách & trọng tải hàng hóa',
    description: 'Chặn khi tổng số người vượt sức chở hoặc khối lượng hàng vượt trọng tải cho phép của tàu.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R2',
    name: 'Hiệu lực giấy tờ tàu & chứng chỉ thuyền viên',
    description: 'Chặn khi giấy chứng nhận đăng kiểm, GP hoạt động, bảo hiểm tàu hoặc chứng chỉ thuyền viên đã hết hạn.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R3',
    name: 'Định biên thuyền viên tối thiểu & chức danh bắt buộc',
    description: 'Chặn khi thiếu số lượng định biên tối thiểu hoặc thiếu chức danh Thuyền trưởng / Máy trưởng.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R4',
    name: 'Không trùng thuyền viên trên chuyến chưa kết thúc',
    description: 'Chặn khi bất kỳ thuyền viên nào trong danh sách đang tham gia một chuyến khác chưa kết thúc.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R5',
    name: 'Cảnh báo chuyến trước của tàu chưa xác nhận cập bến',
    description: 'Cảnh báo nếu phương tiện có chuyến trước đang ở trạng thái Đã xuất bến (chưa cập bến).',
    isEnabled: true,
    isBlocking: false,
  },
  {
    code: 'R6',
    name: 'Cảnh báo giấy tờ tàu / chứng chỉ sắp hết hạn (≤ 30 ngày)',
    description: 'Cảnh báo sớm trước 30 ngày để chủ tàu kịp thời gia hạn đăng kiểm, bảo hiểm, chứng chỉ.',
    isEnabled: true,
    isBlocking: false,
    warningThreshold: 30,
  },
  {
    code: 'R7',
    name: 'Điều kiện thời tiết & trạng thái hoạt động tuyến',
    description: 'Chặn duyệt/cấp phép khi tuyến đang tạm dừng thời tiết hoặc cấp gió/chiều cao sóng vượt ngưỡng tàu.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R8',
    name: 'Thời hạn hiệu lực Giấy phép rời cảng (24 giờ)',
    description: 'Giấy phép rời cảng chỉ có hiệu lực 24 giờ kể từ lúc cấp; quá 24h tự động chuyển Hết hiệu lực và chặn xuất bến.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R9',
    name: 'Thông tin hợp lệ, giờ rời bến ≥ hiện tại + 30p & khớp số khách',
    description: 'Chặn khi thiếu trường bắt buộc, giờ dự kiến < hiện tại + 30 phút, hoặc lệch số khách giữa Bản khai chung và Danh sách.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R10',
    name: 'Biên phòng tạm giữ / đình chỉ xuất bến',
    description: 'Khi Biên phòng phát hiện bất thường và lập tạm giữ sau khi đã có Giấy phép, chặn xuất bến và QR báo Tạm đình chỉ.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R11',
    name: 'Chứng từ / mã giao dịch nộp phí rời cảng',
    description: 'Chặn nộp hồ sơ nếu thiếu cả tệp chứng từ nộp phí (FEE_RECEIPT) lẫn mã giao dịch nộp phí.',
    isEnabled: true,
    isBlocking: true,
  },
  {
    code: 'R12',
    name: 'Kiểm soát người lên tàu khớp danh sách đã cấp phép',
    description: 'Khi Biên phòng kiểm soát cuối cùng phát hiện người lạ, tăng người hoặc đổi thuyền viên ngoài danh sách → chặn xuất bến và trả về Chủ tàu.',
    isEnabled: true,
    isBlocking: true,
  },
];

export const DEFAULT_CURRENT_WEATHER: WeatherCondition = {
  recordedAt: new Date().toISOString(),
  area: 'Vùng biển Lý Sơn – Bình Sơn (Quảng Ngãi)',
  windForceBeaufort: 4,
  windDirection: 'Đông Bắc',
  waveHeightMeters: 1.0,
  seaStatusText: 'Biển bình thường',
  rawForecastText: 'Chưa đồng bộ bản tin khí tượng thủy văn mới nhất. Vui lòng cập nhật dữ liệu thời tiết thực tế.',
  isRouteSuspended: false,
};

export const DEFAULT_BP_SYSTEM_CONFIG: BpSystemConfig = {
  unitDisplayName: 'Đồn Biên phòng Lý Sơn',
  roleLabelTruc: 'Cán bộ trực Biên phòng',
  roleLabelChiHuy: 'Chỉ huy Đồn Biên phòng',
  quyenGoDeNghi: 'chi_bien_phong',
  standardTransitMinutesOutbound: 30,
  standardTransitMinutesInbound: 30,
  overdueGraceMinutes: 15,
};

export const DEFAULT_BQL_CHECKLIST_CONFIG: BqlChecklistItemConfig[] = [
  { id: 'CHK-1', groupCode: 'NHOM_1', groupTitle: 'Nhóm 1: Giấy tờ phương tiện', label: 'Đủ bản chính/bản sao hợp lệ GCN đăng ký, đăng kiểm VR-SB, GP hoạt động, BH TNDS còn hạn', isRequired: true },
  { id: 'CHK-2', groupCode: 'NHOM_2', groupTitle: 'Nhóm 2: Thuyền viên & Định biên', label: 'Đủ định biên tối thiểu, đúng người, đúng chức danh và chứng chỉ chuyên môn còn hiệu lực', isRequired: true },
  { id: 'CHK-3', groupCode: 'NHOM_3', groupTitle: 'Nhóm 3: Hành khách & Sức chở', label: 'Kiểm đếm thực tế tại bến khớp danh sách hành khách, không vượt sức chở quy định', isRequired: true },
  { id: 'CHK-4', groupCode: 'NHOM_4', groupTitle: 'Nhóm 4: Hàng hóa & Chằng buộc', label: 'Khối lượng hàng không vượt trọng tải, không chở hàng nguy hiểm cấm, chằng buộc chắc chắn', isRequired: true },
  { id: 'CHK-5', groupCode: 'NHOM_5', groupTitle: 'Nhóm 5: Trang thiết bị cứu sinh', label: 'Đủ áo phao cá nhân (100% người trên tàu), phao tròn, bè cứu sinh đúng quy chuẩn', isRequired: true },
  { id: 'CHK-6', groupCode: 'NHOM_6', groupTitle: 'Nhóm 6: Phòng cháy chữa cháy & Bảo vệ MT', label: 'Bình chữa cháy, bơm cứu hỏa, thiết bị chứa rác/dầu thải sẵn sàng hoạt động', isRequired: true },
  { id: 'CHK-7', groupCode: 'NHOM_7', groupTitle: 'Nhóm 7: Thông tin liên lạc & Hành hải', label: 'VHF, AIS, radar, đèn hành trình, la bàn hoạt động bình thường', isRequired: true },
  { id: 'CHK-8', groupCode: 'NHOM_8', groupTitle: 'Nhóm 8: Thu phí & Lệ phí cảng bến', label: 'Đã đối chiếu chứng từ hoặc mã giao dịch nộp phí, lệ phí vào/rời cảng, bến hợp lệ', isRequired: true },
];

const DEFAULT_PAYMENT_QR_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
    <rect width="220" height="220" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="20" y="20" width="52" height="52" fill="#07244d" rx="4"/>
    <rect x="28" y="28" width="36" height="36" fill="#ffffff" rx="2"/>
    <rect x="36" y="36" width="20" height="20" fill="#07244d"/>
    <rect x="148" y="20" width="52" height="52" fill="#07244d" rx="4"/>
    <rect x="156" y="28" width="36" height="36" fill="#ffffff" rx="2"/>
    <rect x="164" y="36" width="20" height="20" fill="#07244d"/>
    <rect x="20" y="148" width="52" height="52" fill="#07244d" rx="4"/>
    <rect x="28" y="156" width="36" height="36" fill="#ffffff" rx="2"/>
    <rect x="36" y="164" width="20" height="20" fill="#07244d"/>
    <rect x="86" y="24" width="12" height="12" fill="#07244d"/>
    <rect x="106" y="24" width="12" height="12" fill="#07244d"/>
    <rect x="126" y="36" width="12" height="12" fill="#07244d"/>
    <rect x="86" y="54" width="24" height="12" fill="#07244d"/>
    <rect x="24" y="88" width="16" height="16" fill="#07244d"/>
    <rect x="52" y="88" width="16" height="16" fill="#07244d"/>
    <rect x="86" y="88" width="48" height="44" rx="6" fill="#0d62e8"/>
    <text x="110" y="114" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="#ffffff">BQL CẢNG</text>
    <rect x="148" y="92" width="16" height="16" fill="#07244d"/>
    <rect x="176" y="92" width="20" height="16" fill="#07244d"/>
    <rect x="86" y="148" width="16" height="16" fill="#07244d"/>
    <rect x="116" y="148" width="24" height="16" fill="#07244d"/>
    <rect x="156" y="148" width="36" height="16" fill="#07244d"/>
    <rect x="92" y="176" width="48" height="20" fill="#07244d"/>
    <rect x="156" y="176" width="40" height="20" fill="#07244d"/>
  </svg>`
)}`;

export const DEFAULT_ORDER_SIGNER_NAME = 'Võ Phiên';
export const DEFAULT_ORDER_SIGNER_AUTHORITY = 'KT. GIÁM ĐỐC';
export const DEFAULT_ORDER_SIGNER_TITLE = 'PHÓ GIÁM ĐỐC';
export const DEFAULT_ORDER_SIGN_LOCATION = 'Quảng Ngãi';

export const DEFAULT_ADMIN_OPERATIONAL_CONFIG: AdminOperationalConfig = {
  paymentQrImageUrl: DEFAULT_PAYMENT_QR_SVG,
  paymentQrBankName: 'Vietcombank - Chi nhánh Quảng Ngãi',
  paymentQrAccountNumber: '0271001089999',
  paymentQrAccountHolder: 'Ban Quản lý Cảng tỉnh Quảng Ngãi',
  paymentQrNote: 'Nội dung CK: [Số ĐK tàu] [Mã hồ sơ] NOP PHI ROI CANG',
  permitSignerName: DEFAULT_ORDER_SIGNER_NAME,
  permitSignerAuthority: DEFAULT_ORDER_SIGNER_AUTHORITY,
  permitSignerTitle: DEFAULT_ORDER_SIGNER_TITLE,
  permitSignLocation: DEFAULT_ORDER_SIGN_LOCATION,
  approvalNoticeTemplate:
    'THÔNG BÁO CHẤP THUẬN HỒ SƠ ĐỀ NGHỊ CẤP PHÉP RỜI CẢNG, BẾN\nBan Quản lý cảng xác nhận đã kiểm tra thực tế phương tiện {{tenTau}} ({{soDangKy}}), hồ sơ {{maHoSo}} đủ điều kiện an toàn và đã hoàn thành nghĩa vụ nộp phí, kính chuyển Sở Xây dựng xem xét cấp Giấy phép rời cảng.',
  permitDraftTemplate:
    'GIẤY PHÉP RỜI CẢNG, BẾN THỦY NỘI ĐỊA (CẤP VR-SB)\nCăn cứ hồ sơ đề nghị {{maHoSo}} và Thông báo chấp thuận của Ban Quản lý cảng, Sở Xây dựng tỉnh Quảng Ngãi cấp phép cho phương tiện {{tenTau}} ({{soDangKy}}) hành trình tuyến {{tuyen}} xuất bến lúc {{gioDuKien}}.',
  bqlProcessingSlaMinutes: 60,
  deptProcessingSlaMinutes: 60,
  officeUploadSlaMinutes: 10,
  paginationPageSize: 15,
  bqlChecklistConfig: DEFAULT_BQL_CHECKLIST_CONFIG,
};

// Tài khoản phối hợp Biên phòng (gắn với bến Đảo Lớn / Đảo Bé)
export const DEFAULT_BP_ACCOUNTS: UserAccount[] = [
  {
    id: 'USR-BP-TRUC-01',
    username: 'bp_truc1',
    password: 'bp123456',
    fullName: 'Đại úy Lê Minh Tuấn',
    role: 'BP_TRUC',
    phone: '0914280101',
    department: 'Đồn Biên phòng Lý Sơn • Trạm kiểm soát Đảo Lớn',
    assignedPortId: 'PORT-01',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-BP-TRUC-02',
    username: 'bp_truc2',
    password: 'bp123456',
    fullName: 'Thượng úy Phạm Quốc Bảo',
    role: 'BP_TRUC',
    phone: '0914280102',
    department: 'Đồn Biên phòng Lý Sơn • Trạm kiểm soát Đảo Bé',
    assignedPortId: 'PORT-02',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-BP-CHIHUY-01',
    username: 'bp_chihuy1',
    password: 'bp123456',
    fullName: 'Trung tá Nguyễn Văn Hải',
    role: 'BP_CHIHUY',
    phone: '0914280201',
    department: 'Đồn Biên phòng Lý Sơn • Đồn trưởng (Đảo Lớn)',
    assignedPortId: 'PORT-01',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-BP-CHIHUY-02',
    username: 'bp_chihuy2',
    password: 'bp123456',
    fullName: 'Thiếu tá Trần Đức Anh',
    role: 'BP_CHIHUY',
    phone: '0914280202',
    department: 'Đồn Biên phòng Lý Sơn • Phó Đồn trưởng (Đảo Bé)',
    assignedPortId: 'PORT-02',
    status: 'ACTIVE',
    isActive: true,
  },
];

// Tài khoản vận hành chuẩn theo 7 nhóm (không bao gồm Văn thư trên app vì phát hành trên Office)
export const DEFAULT_OPERATIONAL_ACCOUNTS: UserAccount[] = [
  {
    id: 'USR-01',
    username: 'admin',
    password: '123456',
    fullName: 'Phạm Văn Thọ (Quản trị)',
    role: 'ADMIN',
    email: 'pvantho@gmail.com',
    phone: '0914000001',
    department: 'Quản trị hệ thống • Sở Xây dựng Quảng Ngãi',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-02',
    username: 'lanhdao_so',
    password: '123456',
    fullName: DEFAULT_ORDER_SIGNER_NAME,
    role: 'LEADER',
    phone: '0914000002',
    department: 'Lãnh đạo Sở Xây dựng tỉnh Quảng Ngãi',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-03',
    username: 'truongphong_atgt',
    password: '123456',
    fullName: 'Nguyễn Thị Mỹ Hạnh',
    role: 'DEPT_HEAD',
    phone: '0914000003',
    department: 'Trưởng phòng An toàn giao thông',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-04',
    username: 'chuyenvien_atgt',
    password: '123456',
    fullName: 'Nguyễn Phùng Nguyễn',
    role: 'OFFICER',
    phone: '0914000004',
    department: 'Phòng An toàn giao thông • Sở Xây dựng',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-05',
    username: 'bql_daolon',
    password: '123456',
    fullName: 'Hoàng Văn Thắng',
    role: 'PORT_STAFF',
    phone: '0914000005',
    department: 'Ban Quản lý Cảng • Bến Đảo Lớn',
    assignedPortId: 'PORT-01',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-06',
    username: 'bql_daobe',
    password: '123456',
    fullName: 'Trần Văn Nam',
    role: 'PORT_STAFF',
    phone: '0914000006',
    department: 'Ban Quản lý Cảng • Bến Đảo Bé',
    assignedPortId: 'PORT-02',
    status: 'ACTIVE',
    isActive: true,
  },
  {
    id: 'USR-07',
    username: 'chutau1',
    password: '123456',
    fullName: 'Võ Minh Thạch',
    role: 'CAPTAIN',
    phone: '0339002376',
    department: 'Chủ tàu / Thuyền trưởng An Bình 02',
    assignedVesselIds: ['VES-11'],
    status: 'ACTIVE',
    isActive: true,
  },
  ...DEFAULT_BP_ACCOUNTS,
];

export function createDefaultPhases(status: TripStatus, isOverdue = false): InternalPhase[] {
  const nowIso = new Date().toISOString();
  const isIssuedOrDone = ['DA_CAP_PHEP', 'DA_XUAT_BEN', 'DA_CAP_BEN', 'TAM_GIU_BIEN_PHONG', 'HET_HIEU_LUC', 'THU_HOI'].includes(status);
  const isOffice = status === 'DANG_TRINH_OFFICE';
  const isDraftApproved = status === 'DA_DUYET';
  const isDeptWait = ['DA_CHAP_THUAN', 'CHO_SO_XU_LY', 'TAM_DUNG_THOI_TIET', 'OFFICE_TRA_LAI', 'TRA_BQL_CANG'].includes(status);

  return [
    {
      phaseIndex: 1,
      phaseName: 'Bước 1: BQL Cảng kiểm tra thực tế & cấp Thông báo chấp thuận (SLA 60 phút)',
      slaMinutes: 60,
      assignedRole: 'PORT_STAFF',
      status: isDeptWait || isDraftApproved || isOffice || isIssuedOrDone ? 'COMPLETED' : status === 'CHO_KIEM_TRA' ? 'IN_PROGRESS' : 'PENDING',
      receivedAt: status !== 'NHAP' ? nowIso : undefined,
      completedAt: isDeptWait || isDraftApproved || isOffice || isIssuedOrDone ? nowIso : undefined,
    },
    {
      phaseIndex: 2,
      phaseName: 'Bước 2: Chuyên viên Sở kiểm tra thời tiết, đối chiếu & duyệt dự thảo (SLA 60 phút)',
      slaMinutes: 60,
      assignedRole: 'OFFICER',
      status: isDraftApproved || isOffice || isIssuedOrDone ? 'COMPLETED' : isDeptWait ? (isOverdue ? 'OVERDUE' : 'IN_PROGRESS') : 'PENDING',
      receivedAt: isDeptWait || isDraftApproved || isOffice || isIssuedOrDone ? nowIso : undefined,
      completedAt: isDraftApproved || isOffice || isIssuedOrDone ? nowIso : undefined,
      isOverdue: isDeptWait && isOverdue,
    },
    {
      phaseIndex: 3,
      phaseName: 'Bước 3: Trình ký trên Office & Tải Giấy phép có dấu đỏ lên ứng dụng (SLA 10 phút sau duyệt)',
      slaMinutes: 10,
      assignedRole: 'OFFICER',
      status: isIssuedOrDone ? 'COMPLETED' : isDraftApproved || isOffice ? 'IN_PROGRESS' : 'PENDING',
      receivedAt: isDraftApproved || isOffice || isIssuedOrDone ? nowIso : undefined,
      completedAt: isIssuedOrDone ? nowIso : undefined,
    },
    {
      phaseIndex: 4,
      phaseName: 'Bước 4: Biên phòng kiểm soát cuối cùng tại bến & Cho xuất bến',
      slaMinutes: 30,
      assignedRole: 'BP_TRUC',
      status: ['DA_XUAT_BEN', 'DA_CAP_BEN'].includes(status) ? 'COMPLETED' : status === 'DA_CAP_PHEP' || status === 'TAM_GIU_BIEN_PHONG' ? 'IN_PROGRESS' : 'PENDING',
      receivedAt: isIssuedOrDone ? nowIso : undefined,
      completedAt: ['DA_XUAT_BEN', 'DA_CAP_BEN'].includes(status) ? nowIso : undefined,
    },
    {
      phaseIndex: 5,
      phaseName: 'Bước 5: Xác nhận cập bến an toàn tại bến đến',
      slaMinutes: 30,
      assignedRole: 'BP_TRUC',
      status: status === 'DA_CAP_BEN' ? 'COMPLETED' : status === 'DA_XUAT_BEN' ? 'IN_PROGRESS' : 'PENDING',
      receivedAt: ['DA_XUAT_BEN', 'DA_CAP_BEN'].includes(status) ? nowIso : undefined,
      completedAt: status === 'DA_CAP_BEN' ? nowIso : undefined,
    },
  ];
}
