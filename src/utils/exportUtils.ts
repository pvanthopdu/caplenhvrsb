import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { TripRecord, Vessel } from '../types';
import { repository } from '../services/repository';
import { getStatusInfo, formatDate, formatTime } from './formatters';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Xuất danh sách chuyến đi ra tệp Excel (.xlsx) bằng thư viện SheetJS
 */
export function exportTripsToExcel(trips: TripRecord[], fileName = 'Danh_sach_cap_lenh_VRSB.xlsx'): void {
  const defaultSignerName = repository.getPermitSignerConfig().name;
  const exportData = trips.map((t, idx) => ({
    STT: idx + 1,
    'Mã hồ sơ': t.tripNumber,
    'Số hiệu lệnh': t.orderNumber || 'Chưa cấp',
    'Tên phương tiện': t.vesselName,
    'Số đăng ký': t.vesselRegNumber,
    'Tuyến hành trình': t.routeName,
    'Bến rời': t.departurePortName,
    'Bến đến': t.arrivalPortName,
    'Ngày lập': formatDate(t.createdDate),
    'Giờ dự kiến rời': formatTime(t.scheduledDepartureTime),
    'Giờ rời thực tế': formatTime(t.actualDepartureTime),
    'Số hành khách': t.passengerCount,
    'Hàng hóa (tấn)': t.cargoTons,
    'Thuyền trưởng': t.captainName,
    'Trạng thái': getStatusInfo(t.status).label,
    'Người duyệt lệnh':
      t.approvedByName === 'Phạm Minh Đức' || t.approvedByName === 'Lãnh đạo Sở Xây dựng'
        ? defaultSignerName
        : t.approvedByName || (t.orderNumber ? defaultSignerName : ''),
    'Quá hạn xử lý': t.isOverallOverdue ? 'CÓ (Quá hạn)' : 'Không',
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Lệnh Vào Rời Bến');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Xuất danh sách hành khách ra Excel để kiểm soát
 */
export function exportPassengersToExcel(trip: TripRecord): void {
  const dc = trip.bpDepartureControl;
  const exportData = dc
    ? [
        ...dc.checklist.map((item, idx) => ({
          STT: idx + 1,
          'Phân loại': item.personType === 'CREW' ? 'Thuyền viên' : 'Hành khách',
          'Họ và tên': item.fullName,
          'Năm sinh / Chức danh': item.positionTitle || item.birthYear || '',
          'Số CCCD / Chứng chỉ': item.idNumber || '',
          'Trạng thái thực tế':
            (item.isOnboard ?? item.boarded) ? 'Có mặt trên tàu (đã kiểm soát BP)' : 'Vắng mặt / Không lên tàu',
          'Quét QR CCCD': item.scanMethod === 'QR_CCCD' ? 'Đã quét' : 'Rà thủ công',
        })),
        ...(dc.unlistedPeople || []).map((u, idx) => ({
          STT: dc.checklist.length + idx + 1,
          'Phân loại': 'NGOÀI DANH SÁCH (R12)',
          'Họ và tên': u.fullName,
          'Năm sinh / Chức danh': u.birthYear || '',
          'Số CCCD / Chứng chỉ': u.idNumber || '',
          'Trạng thái thực tế': u.note || 'Phát hiện thêm tại bến',
          'Quét QR CCCD': 'Bổ sung',
        })),
      ]
    : trip.passengers.map((p, idx) => ({
        STT: idx + 1,
        'Phân loại': 'Hành khách',
        'Họ và tên': p.fullName,
        'Năm sinh / Chức danh': p.birthYear,
        'Giới tính': p.gender === 'NAM' ? 'Nam' : p.gender === 'NU' ? 'Nữ' : 'Khác',
        'Số CCCD / Hộ chiếu': p.idNumber,
        'Số điện thoại': p.phone,
        'Quốc tịch': p.nationality || 'Việt Nam',
        'Địa chỉ cư trú': p.address,
        'Đã lên tàu': p.isBoarded ? 'Đã lên tàu' : 'Chưa',
      }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách người trên tàu');
  XLSX.writeFile(workbook, `Danh_sach_tren_tau_${trip.vesselName}_${trip.tripNumber}.xlsx`);
}

/**
 * Hỗ trợ in ấn mẫu lệnh A4 trực tiếp qua trình duyệt với thiết lập chuẩn
 */
export function triggerPrintOrder(): void {
  window.print();
}

/**
 * Xuất tệp văn bản Microsoft Word (.doc) theo mẫu GIẤY PHÉP RỜI CẢNG / PORT CLEARANCE
 * Dùng cho dự thảo trình ký trên Office (để trống phần ký tay và không có dấu đỏ)
 */
export function buildOrderWordDocument(
  trip: TripRecord,
  vessel?: Vessel
): { fileName: string; blob: Blob } {
  const now = new Date();
  const signRefDate = trip.issuedAt ? new Date(trip.issuedAt) : trip.approvedAt ? new Date(trip.approvedAt) : now;
  const signDay = String(signRefDate.getDate()).padStart(2, '0');
  const signMonth = String(signRefDate.getMonth() + 1).padStart(2, '0');
  const signYear = signRefDate.getFullYear();

  const depDate = trip.scheduledDepartureTime ? new Date(trip.scheduledDepartureTime) : now;
  const depHour = String(depDate.getHours()).padStart(2, '0');
  const depMinute = String(depDate.getMinutes()).padStart(2, '0');
  const depDay = String(depDate.getDate()).padStart(2, '0');
  const depMonth = String(depDate.getMonth() + 1).padStart(2, '0');
  const depYear = depDate.getFullYear();

  const validDate = trip.orderValidUntil
    ? new Date(trip.orderValidUntil)
    : new Date(depDate.getTime() + 24 * 3600 * 1000);
  const valHour = String(validDate.getHours()).padStart(2, '0');
  const valMinute = String(validDate.getMinutes()).padStart(2, '0');
  const valDay = String(validDate.getDate()).padStart(2, '0');
  const valMonth = String(validDate.getMonth() + 1).padStart(2, '0');
  const valYear = validDate.getFullYear();

  const permitNo = trip.orderNumber || '(Chờ cấp số trên phần mềm Office)';

  const crewCountStr = String(trip.crewMembers?.length ?? 0).padStart(2, '0');
  const passengerCountVal = trip.passengerCount ?? trip.passengers?.length ?? 0;
  const cargoVal = Number(trip.cargoTons || 0);
  const cargoStr =
    cargoVal === 0
      ? '00 tấn'
      : `${Number.isInteger(cargoVal) ? String(cargoVal).padStart(2, '0') : cargoVal} tấn`;
  const transitCargoText =
    trip.hasTransitCargo && trip.cargoDescription
      ? ` <strong>${trip.cargoDescription}</strong>`
      : '..........................................................';
  const callSignStr = trip.callSign || vessel?.callSign || '.....';
  const grossTonnageStr = trip.grossTonnage
    ? `${trip.grossTonnage}`
    : vessel?.grossTonnage
    ? `${vessel.grossTonnage}`
    : '';
  const signerCfg = repository.getPermitSignerConfig();
  const signerName =
    !trip.approvedByName ||
    trip.approvedByName === 'Phạm Minh Đức' ||
    trip.approvedByName === 'Lãnh đạo Sở Xây dựng'
      ? signerCfg.name
      : trip.approvedByName;
  const signerAuthorityHtml = signerCfg.authority
    ? `<p class="signer-role" style="margin-top: 2pt;">${escapeHtml(signerCfg.authority)}</p>
        <p class="signer-role">${escapeHtml(signerCfg.title)}</p>`
    : `<p class="signer-role" style="margin-top: 2pt;">${escapeHtml(signerCfg.title)}</p>`;

  const wordHtml = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>GIẤY PHÉP RỜI CẢNG - ${permitNo}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page Section1 {
  size: 595.35pt 841.995pt;
  margin: 14mm 14mm 14mm 14mm;
  mso-header-margin: 20pt;
  mso-footer-margin: 20pt;
  mso-paper-source: 0;
}
div.Section1 { page: Section1; }
body {
  font-family: 'Times New Roman', serif;
  font-size: 12pt;
  line-height: 1.25;
  color: #000000;
  background-color: #ffffff;
}
.outer-frame {
  border: 2pt solid #000000;
  padding: 16pt 18pt 20pt 18pt;
}
p {
  margin-top: 0;
  margin-bottom: 2pt;
}
table {
  border-collapse: collapse;
  width: 100%;
}
.header-table td {
  vertical-align: top;
  padding: 0 2pt;
}
.org-top {
  font-size: 11.5pt;
  font-weight: normal;
  text-transform: uppercase;
  text-align: center;
}
.org-main {
  font-size: 12pt;
  font-weight: bold;
  text-transform: uppercase;
  text-align: center;
}
.nation-top {
  font-size: 11.5pt;
  font-weight: bold;
  text-transform: uppercase;
  text-align: center;
}
.nation-motto {
  font-size: 12pt;
  font-weight: bold;
  text-align: center;
  text-decoration: underline;
}
.doc-title-vi {
  font-size: 13.5pt;
  font-weight: bold;
  text-transform: uppercase;
  text-align: center;
  margin-top: 22pt;
  margin-bottom: 1pt;
}
.doc-title-en {
  font-size: 13pt;
  font-weight: bold;
  text-transform: uppercase;
  text-align: center;
  margin-bottom: 14pt;
}
.field-table td {
  vertical-align: top;
  padding: 1.5pt 0;
  font-size: 12pt;
  line-height: 1.22;
}
.en-sub {
  font-size: 11.5pt;
  font-weight: normal;
}
.footer-table {
  margin-top: 10pt;
}
.footer-table td {
  vertical-align: top;
}
.footnote {
  font-size: 11pt;
  line-height: 1.25;
  padding-top: 28pt;
}
.signer-date {
  font-size: 12pt;
  font-style: italic;
  text-align: center;
}
.signer-role {
  font-size: 12pt;
  font-weight: bold;
  text-transform: uppercase;
  text-align: center;
}
.signature-blank {
  height: 85px;
}
.signer-name {
  font-size: 12pt;
  font-weight: bold;
  text-align: center;
}
</style>
</head>
<body>
<div class="Section1">
<div class="outer-frame">
  <table class="header-table">
    <tr>
      <td style="width: 39%; text-align: center;">
        <p class="org-top">UBND TỈNH QUẢNG NGÃI</p>
        <p class="org-main">SỞ XÂY DỰNG</p>
      </td>
      <td style="width: 61%; text-align: center;">
        <p class="nation-top">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
        <p class="nation-motto">Độc lập - Tự do - Hạnh phúc</p>
      </td>
    </tr>
  </table>

  <p class="doc-title-vi">GIẤY PHÉP RỜI CẢNG</p>
  <p class="doc-title-en">PORT CLEARANCE</p>

  <table class="field-table">
    <tr>
      <td style="width: 40%;">
        Tên tàu: <strong>${(trip.vesselName || '').toUpperCase()}</strong><br/>
        <span class="en-sub">Name of ship</span>
      </td>
      <td style="width: 35%;">
        Quốc tịch tàu: <strong>Việt Nam</strong><br/>
        <span class="en-sub">Flag State of ship</span>
      </td>
      <td style="width: 25%;">
        Hô hiệu ${callSignStr}<br/>
        <span class="en-sub">Call sign</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        Số đăng ký hành chính: (*) <strong>${trip.vesselRegNumber}</strong><br/>
        <span class="en-sub">Official number</span>
      </td>
    </tr>
    <tr>
      <td style="width: 62%;" colspan="2">
        Dung tích toàn phần:${grossTonnageStr ? ` <strong>${grossTonnageStr}</strong>` : ''}<br/>
        <span class="en-sub">Gross tonnage</span>
      </td>
      <td style="width: 38%;">
        Tên thuyền trưởng: <strong>${trip.captainName}</strong><br/>
        <span class="en-sub">Name of master</span>
      </td>
    </tr>
    <tr>
      <td style="width: 62%;" colspan="2">
        Số lượng thuyền viên: <strong>${crewCountStr}</strong><br/>
        <span class="en-sub">Number of crews</span>
      </td>
      <td style="width: 38%;">
        Số lượng hành khách: <strong>${passengerCountVal}</strong><br/>
        <span class="en-sub">Number of passenger</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        Hàng hóa trên tàu: <strong>${cargoStr}</strong><br/>
        <span class="en-sub">Cargo</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        Hàng hóa quá cảnh:${transitCargoText}<br/>
        <span class="en-sub">Transit cargo</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        Thời gian rời cảng: <strong>${trip.departurePortName}, lúc ${depHour} giờ ${depMinute}, ngày ${depDay} tháng ${depMonth} năm ${depYear}</strong><br/>
        <span class="en-sub">Time of departure &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        Cảng đến: <strong>${trip.arrivalPortName}</strong><br/>
        <span class="en-sub">Next port of call</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        Giấy phép rời cảng này có hiệu lực đến <strong>${valHour} giờ ${valMinute}, ngày ${valDay} tháng ${valMMonth(valMonth)} năm ${valYear}</strong><br/>
        <span class="en-sub">This port clearance is valid until</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        Giấy phép số: <strong>${permitNo}</strong><br/>
        <span class="en-sub">N<sup>o</sup></span>
      </td>
    </tr>
  </table>

  <table class="footer-table">
    <tr>
      <td style="width: 44%;" class="footnote">
        (*) Mục này chỉ khai đối với phương tiện thủy nội địa.<br/>
        Only for inland waterway ships.
      </td>
      <td style="width: 56%; text-align: center;">
        <p class="signer-date">${escapeHtml(signerCfg.location)}, ngày ${signDay} tháng ${signMonth} năm ${signYear}</p>
        <p class="signer-date">Date.....mm.....yy</p>
        ${signerAuthorityHtml}
        <div class="signature-blank"></div>
        <p class="signer-name">${escapeHtml(signerName)}</p>
      </td>
    </tr>
  </table>
</div>
</div>
</body>
</html>
  `.trim();

  const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword;charset=utf-8' });
  return {
    fileName: `Giay_Phep_Roi_Cang_${permitNo.replace(/[\/\\]/g, '_')}.doc`,
    blob,
  };
}

export function downloadOrderWord(trip: TripRecord, vessel?: Vessel): void {
  const { fileName, blob } = buildOrderWordDocument(trip, vessel);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function valMMonth(m: string): string {
  return m;
}

const UNSUPPORTED_COLOR_FN_RE = /(?:oklch|oklab|color-mix|\blch|\blab|\bcolor)\s*\(/i;

function convertColorExprToRgba(
  expr: string,
  ctx: CanvasRenderingContext2D,
  cache: Map<string, string>
): string {
  const key = expr.trim();
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = data[0];
    const g = data[1];
    const b = data[2];
    const a = data[3];
    const converted =
      a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
    cache.set(key, converted);
    return converted;
  } catch {
    return 'rgb(0, 0, 0)';
  }
}

/**
 * Thay thế toàn bộ hàm màu CSS Color 4 (oklch, oklab, lch, lab, color-mix, color)
 * sang rgb()/rgba() để html2canvas phân tích an toàn với Tailwind CSS v4.
 */
function sanitizeUnsupportedColorFunctions(
  input: string,
  ctx: CanvasRenderingContext2D,
  cache: Map<string, string>
): string {
  if (!input || !UNSUPPORTED_COLOR_FN_RE.test(input)) return input;

  const fnNames = ['color-mix', 'oklch', 'oklab', 'lch', 'lab', 'color'];
  let out = '';
  let i = 0;

  while (i < input.length) {
    let matchedFn: string | null = null;
    const prevChar = i > 0 ? input[i - 1] : '';
    const isWordBoundary = !prevChar || !/[a-zA-Z0-9_-]/.test(prevChar);

    if (isWordBoundary) {
      const rest = input.slice(i).toLowerCase();
      for (const fn of fnNames) {
        if (rest.startsWith(`${fn}(`)) {
          matchedFn = fn;
          break;
        }
      }
    }

    if (!matchedFn) {
      out += input[i];
      i += 1;
      continue;
    }

    const startIdx = i;
    let depth = 0;
    let j = i + matchedFn.length;
    while (j < input.length) {
      if (input[j] === '(') depth += 1;
      else if (input[j] === ')') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
      j += 1;
    }

    const expr = input.slice(startIdx, j);
    if (/\bvar\s*\(/i.test(expr)) {
      // Giữ nguyên khi còn var(...) trong stylesheet thô; sẽ được giải ở bước computedStyle
      out += expr;
    } else {
      out += convertColorExprToRgba(expr, ctx, cache);
    }
    i = j;
  }

  // Loại bỏ cú pháp nội suy không gian màu trong gradient (vd: "linear-gradient(to right in oklab, ...)")
  out = out.replace(
    /\s+in\s+(?:oklch|oklab|srgb|srgb-linear|lab|lch|hsl|hwb)(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?/gi,
    ''
  );

  return out;
}

const COLOR_STYLE_PROPS: Array<{ css: string; camel: keyof CSSStyleDeclaration }> = [
  { css: 'color', camel: 'color' },
  { css: 'background-color', camel: 'backgroundColor' },
  { css: 'border-top-color', camel: 'borderTopColor' },
  { css: 'border-right-color', camel: 'borderRightColor' },
  { css: 'border-bottom-color', camel: 'borderBottomColor' },
  { css: 'border-left-color', camel: 'borderLeftColor' },
  { css: 'outline-color', camel: 'outlineColor' },
  { css: 'text-decoration-color', camel: 'textDecorationColor' },
  { css: 'box-shadow', camel: 'boxShadow' },
  { css: 'text-shadow', camel: 'textShadow' },
  { css: 'background-image', camel: 'backgroundImage' },
  { css: 'caret-color', camel: 'caretColor' },
  { css: 'fill', camel: 'fill' as keyof CSSStyleDeclaration },
  { css: 'stroke', camel: 'stroke' as keyof CSSStyleDeclaration },
];

function sanitizeClonedDocumentColors(clonedDoc: Document, rootElement: HTMLElement | null): void {
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  const ctx = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const cache = new Map<string, string>();
  const clonedWin = clonedDoc.defaultView || window;

  // 1. Thu thập và ghi đè toàn bộ biến màu CSS :root (Tailwind v4 --color-*) sang rgb()/rgba()
  const rootVarOverrides: string[] = [];
  const rootComputed = window.getComputedStyle(document.documentElement);
  const seenVars = new Set<string>();

  const collectCustomProps = (rules: CSSRuleList | undefined) => {
    if (!rules) return;
    for (let r = 0; r < rules.length; r += 1) {
      const rule = rules[r];
      if ('style' in rule && (rule as CSSStyleRule).style) {
        const style = (rule as CSSStyleRule).style;
        for (let p = 0; p < style.length; p += 1) {
          const propName = style[p];
          if (propName && propName.startsWith('--') && !seenVars.has(propName)) {
            seenVars.add(propName);
            const resolved = rootComputed.getPropertyValue(propName).trim();
            if (resolved && UNSUPPORTED_COLOR_FN_RE.test(resolved)) {
              const safeVal = sanitizeUnsupportedColorFunctions(resolved, ctx, cache);
              rootVarOverrides.push(`  ${propName}: ${safeVal} !important;`);
            }
          }
        }
      }
      if ('cssRules' in rule) {
        try {
          collectCustomProps((rule as CSSGroupingRule).cssRules);
        } catch {
          // ignore cross-origin nested rules
        }
      }
    }
  };

  for (let s = 0; s < document.styleSheets.length; s += 1) {
    try {
      collectCustomProps(document.styleSheets[s].cssRules);
    } catch {
      // ignore cross-origin stylesheets
    }
  }

  // 2. Làm sạch các thẻ <style> nội tuyến trong tài liệu clone
  clonedDoc.querySelectorAll('style').forEach((styleEl) => {
    const cssText = styleEl.textContent || '';
    if (UNSUPPORTED_COLOR_FN_RE.test(cssText) || /\bin\s+(?:oklch|oklab)\b/i.test(cssText)) {
      styleEl.textContent = sanitizeUnsupportedColorFunctions(cssText, ctx, cache);
    }
  });

  if (rootVarOverrides.length > 0 && clonedDoc.head) {
    const overrideStyle = clonedDoc.createElement('style');
    overrideStyle.textContent = `:root, :host {\n${rootVarOverrides.join('\n')}\n}`;
    clonedDoc.head.appendChild(overrideStyle);
  }

  // 3. Quét computedStyle của html, body, chuỗi cha và toàn bộ cây phần tử mục tiêu
  const elementsToSanitize = new Set<HTMLElement>();
  if (clonedDoc.documentElement) elementsToSanitize.add(clonedDoc.documentElement);
  if (clonedDoc.body) elementsToSanitize.add(clonedDoc.body);

  if (rootElement) {
    let cur: HTMLElement | null = rootElement;
    while (cur) {
      elementsToSanitize.add(cur);
      cur = cur.parentElement;
    }
    rootElement.querySelectorAll<HTMLElement>('*').forEach((el) => {
      elementsToSanitize.add(el);
    });
  }

  elementsToSanitize.forEach((el) => {
    let cs: CSSStyleDeclaration;
    try {
      cs = clonedWin.getComputedStyle(el);
    } catch {
      return;
    }
    for (const prop of COLOR_STYLE_PROPS) {
      const val = String(cs[prop.camel] || '');
      if (val && (UNSUPPORTED_COLOR_FN_RE.test(val) || /\bin\s+(?:oklch|oklab)\b/i.test(val))) {
        const safe = sanitizeUnsupportedColorFunctions(val, ctx, cache);
        el.style.setProperty(prop.css, safe, 'important');
      }
    }
  });
}

/**
 * Render phần tử DOM ra Canvas an toàn với Tailwind CSS v4 (tự chuyển đổi oklch/oklab sang rgb/rgba)
 */
export async function renderElementToCanvas(
  element: HTMLElement,
  options?: {
    scale?: number;
    windowWidth?: number;
    onCloneElement?: (clonedDoc: Document, clonedEl: HTMLElement | null) => void;
  }
): Promise<HTMLCanvasElement> {
  const markerAttr = 'data-pdf-capture-target';
  const markerVal = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  element.setAttribute(markerAttr, markerVal);

  try {
    return await html2canvas(element, {
      scale: options?.scale ?? 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: options?.windowWidth,
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.querySelector<HTMLElement>(`[${markerAttr}="${markerVal}"]`);
        sanitizeClonedDocumentColors(clonedDoc, clonedEl);
        options?.onCloneElement?.(clonedDoc, clonedEl);
      },
    });
  } finally {
    element.removeAttribute(markerAttr);
  }
}

/**
 * Tạo đối tượng jsPDF khổ A4 từ phần tử DOM #printable-order-a4 để dùng cho tải về máy hoặc lưu lên Server
 */
export async function generateOrderPdfDocument(elementId: string): Promise<jsPDF | null> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Không tìm thấy phần tử DOM với ID: #${elementId}`);
    return null;
  }

  try {
    const canvas = await renderElementToCanvas(element, {
      scale: 2,
      windowWidth: 1024,
      onCloneElement: (_clonedDoc, clonedEl) => {
        if (clonedEl) {
          clonedEl.style.width = '794px';
          clonedEl.style.maxWidth = '794px';
          clonedEl.style.minHeight = '1123px';
          clonedEl.style.boxShadow = 'none';
          clonedEl.style.border = 'none';
          clonedEl.style.margin = '0';
        }
      },
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const rawHeight = (canvas.height * pageWidth) / canvas.width;
    const finalWidth = rawHeight > pageHeight ? (canvas.width * pageHeight) / canvas.height : pageWidth;
    const finalHeight = rawHeight > pageHeight ? pageHeight : rawHeight;
    const offsetX = (pageWidth - finalWidth) / 2;

    pdf.addImage(imgData, 'PNG', offsetX, 0, finalWidth, finalHeight);
    return pdf;
  } catch (err) {
    console.error('Lỗi khi tạo tài liệu PDF:', err);
    return null;
  }
}

export async function generateOrderPdfDataUrl(elementId: string): Promise<string | null> {
  const pdf = await generateOrderPdfDocument(elementId);
  if (!pdf) return null;
  return pdf.output('datauristring');
}

/**
 * Xuất tệp PDF trực tiếp xuất máy (.pdf) chuẩn khổ A4
 * Bắt hình ảnh phần tử DOM A4 và tạo tệp PDF đúng khổ 210 x 297 mm
 */
export async function downloadOrderPdf(elementId: string, fileName: string): Promise<boolean> {
  const pdf = await generateOrderPdfDocument(elementId);
  if (!pdf) return false;
  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
  return true;
}

/**
 * Tạo tệp PDF Giấy phép rời cảng khổ A4 (hỗ trợ đầy đủ tiếng Việt qua Canvas)
 * để tự động lưu trữ vào Server khi hồ sơ được duyệt hoặc phát hành giấy phép.
 */
export function buildPermitArchivePdfBlob(
  trip: TripRecord,
  vessel?: Vessel
): { fileName: string; blob: Blob } {
  const signerCfg = repository.getPermitSignerConfig();
  const signerName =
    !trip.approvedByName ||
    trip.approvedByName === 'Phạm Minh Đức' ||
    trip.approvedByName === 'Lãnh đạo Sở Xây dựng'
      ? signerCfg.name
      : trip.approvedByName;
  const permitNo = trip.orderNumber || `DU_THAO_${trip.tripNumber}`;
  const safePermitNo = permitNo.replace(/[\/\\\s]+/g, '_');
  const fileName = trip.orderNumber
    ? `Giay_Phep_Roi_Cang_${safePermitNo}.pdf`
    : `Du_Thao_Giay_Phep_${trip.tripNumber}.pdf`;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Khung viền trang chuẩn giấy phép
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.strokeRect(56, 56, canvas.width - 112, canvas.height - 112);

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.font = 'normal 22px "Times New Roman", serif';
      ctx.fillText('ỦY BAN NHÂN DÂN TỈNH QUẢNG NGÃI', 330, 125);
      ctx.font = 'bold 24px "Times New Roman", serif';
      ctx.fillText('SỞ XÂY DỰNG', 330, 160);
      ctx.font = 'normal 21px "Times New Roman", serif';
      ctx.fillText(`Số: ${trip.orderNumber || '(Dự thảo trình Office)'}`, 330, 200);

      ctx.font = 'bold 22px "Times New Roman", serif';
      ctx.fillText('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 890, 125);
      ctx.font = 'bold 23px "Times New Roman", serif';
      ctx.fillText('Độc lập - Tự do - Hạnh phúc', 890, 160);
      ctx.fillRect(745, 170, 290, 2);

      const issuedRef = trip.issuedAt ? new Date(trip.issuedAt) : new Date();
      const dd = String(issuedRef.getDate()).padStart(2, '0');
      const mm = String(issuedRef.getMonth() + 1).padStart(2, '0');
      const yyyy = issuedRef.getFullYear();
      ctx.font = 'italic 21px "Times New Roman", serif';
      ctx.fillText(`Quảng Ngãi, ngày ${dd} tháng ${mm} năm ${yyyy}`, 890, 208);

      ctx.font = 'bold 34px "Times New Roman", serif';
      ctx.fillText('GIẤY PHÉP RỜI CẢNG, BẾN THỦY NỘI ĐỊA', canvas.width / 2, 300);
      ctx.font = 'bold 24px "Times New Roman", serif';
      ctx.fillText('(PORT CLEARANCE — TUYẾN VR-SB ĐẢO LỚN – ĐẢO BÉ)', canvas.width / 2, 340);

      // Nội dung chính
      ctx.textAlign = 'left';
      const rows: Array<[string, string]> = [
        ['Mã hồ sơ chuyến:', trip.tripNumber],
        ['Tên phương tiện / Số đăng ký:', `${trip.vesselName} (${trip.vesselRegNumber})`],
        ['Loại phương tiện / Hô hiệu:', `${vessel?.vesselType || 'Tàu khách VR-SB'} · ${trip.callSign || vessel?.callSign || '---'}`],
        ['Thuyền trưởng:', trip.captainName || '---'],
        ['Tuyến hành trình:', trip.routeName || `${trip.departurePortName} → ${trip.arrivalPortName}`],
        ['Bến rời → Bến đến:', `${trip.departurePortName} → ${trip.arrivalPortName}`],
        ['Thời gian rời bến dự kiến:', `${formatTime(trip.scheduledDepartureTime)} ngày ${formatDate(trip.scheduledDepartureTime)}`],
        ['Số thuyền viên / Hành khách:', `${trip.crewMembers?.length || 0} thuyền viên · ${trip.passengerCount || 0} hành khách`],
        ['Khối lượng hàng hóa:', `${Number(trip.cargoTons || 0).toFixed(1)} tấn`],
        ['Hiệu lực Giấy phép (24 giờ):', trip.orderValidUntil ? `${formatTime(trip.orderValidUntil)} ngày ${formatDate(trip.orderValidUntil)}` : 'Theo quy định 24 giờ kể từ lúc phát hành'],
        ['Mã xác thực QR:', trip.verificationCode || trip.orderNumber || trip.tripNumber],
        [
          'Kiểm tra thời tiết (R7):',
          trip.weatherCheckRecord
            ? `Gió cấp ${trip.weatherCheckRecord.windForceBeaufort}, sóng ${Number(trip.weatherCheckRecord.waveHeightMeters).toFixed(1)}m (${trip.weatherCheckRecord.isSafe ? 'Đạt an toàn' : 'Không đạt'}) — ${trip.weatherCheckRecord.checkedByName}`
            : 'Đã ghi nhận theo thời gian thực',
        ],
      ];

      let y = 420;
      for (const [label, value] of rows) {
        ctx.font = 'bold 23px "Times New Roman", serif';
        ctx.fillText(label, 105, y);
        ctx.font = 'normal 23px "Times New Roman", serif';
        ctx.fillText(String(value).slice(0, 68), 475, y);
        y += 58;
      }

      // Khối chữ ký
      ctx.textAlign = 'center';
      ctx.font = 'bold 23px "Times New Roman", serif';
      if (signerCfg.authority) {
        ctx.fillText(signerCfg.authority, 890, 1260);
        ctx.fillText(signerCfg.title, 890, 1295);
      } else {
        ctx.fillText(signerCfg.title, 890, 1275);
      }
      ctx.font = 'italic 20px "Times New Roman", serif';
      ctx.fillText('(Bản lưu trữ điện tử tự động trên Server theo quy định 5 năm)', 890, 1335);
      ctx.font = 'bold 26px "Times New Roman", serif';
      ctx.fillText(signerName, 890, 1465);

      // Chân trang lưu trữ
      ctx.textAlign = 'left';
      ctx.font = 'italic 18px "Times New Roman", serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(
        `Lưu trữ tự động trên Server: CAPLENHVAORA/${trip.tripNumber}/lenh-cap-phep/${fileName}`,
        105,
        1625
      );
      ctx.fillText(
        'Thời hạn lưu trữ: 05 năm theo quy định chứng từ hàng hải · Ẩn danh dữ liệu cá nhân sau 12 tháng (NĐ 356/2025/NĐ-CP).',
        105,
        1658
      );

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }
  }

  return {
    fileName,
    blob: pdf.output('blob'),
  };
}

