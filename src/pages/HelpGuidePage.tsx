/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HelpCircle, Smartphone, Phone, Mail, ShieldCheck, Building2, Anchor } from 'lucide-react';
import { CoastalPageHero } from '../components/CoastalPageHero';
import { repository } from '../services/repository';

export const HelpGuidePage: React.FC = () => {
  const [adminContact, setAdminContact] = useState(() => repository.getAdminContactConfig());

  useEffect(() => {
    let active = true;
    repository.syncAdminContactFromServer().then((contact) => {
      if (active) setAdminContact(contact);
    });
    const unsub = repository.subscribe(() => {
      setAdminContact(repository.getAdminContactConfig());
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <div className="w-full mx-auto space-y-6">
      <CoastalPageHero
        title="Hướng dẫn sử dụng & Quy trình cấp phép rời cảng, bến VR-SB"
        subtitle="Tuyến Đảo Lớn – Đảo Bé, đặc khu Lý Sơn · Sở Xây dựng tỉnh Quảng Ngãi (thay thế hoàn toàn việc gửi hồ sơ qua nhóm chat)"
        icon={<HelpCircle className="w-7 h-7" />}
      />

      {/* 4 GIAI ĐOẠN CHUẨN */}
      <div className="bg-white/95 border border-[#dce8f7] p-5 sm:p-6 rounded-[24px] shadow-[0_12px_32px_-12px_rgba(10,60,130,0.12)] space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-2xl">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-blue-950 uppercase">
              QUY TRÌNH XỬ LÝ KHÉP KÍN 4 GIAI ĐOẠN
            </h2>
            <p className="text-xs text-blue-800">
              Mọi thao tác nộp hồ sơ, trả bổ sung, kiểm tra, tải Giấy phép và thông báo (chuông trong ứng dụng + Email/SMS) đều thực hiện tập trung trên hệ thống.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs text-slate-800">
          <div className="p-4 bg-sky-50/60 rounded-xl border border-sky-200 space-y-1.5">
            <div className="flex items-center gap-2 font-extrabold text-sky-950 text-sm">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center shrink-0">1</span>
              <span>CHỦ TÀU / THUYỀN TRƯỞNG NỘP HỒ SƠ</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              Khai Bản khai chung, danh sách thuyền viên &amp; hành khách (tự nạp lại danh sách gần nhất nếu không đổi), quét <strong>mã QR nộp phí</strong> của Sở và đính kèm biên lai hoặc mã giao dịch (quy tắc R11). Có thể <strong>Rút hồ sơ</strong> trước khi Sở cấp Giấy phép.
            </p>
          </div>

          <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-1.5">
            <div className="flex items-center gap-2 font-extrabold text-indigo-950 text-sm">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0">2</span>
              <span>BAN QUẢN LÝ CẢNG KIỂM TRA (ĐỒNG HỒ 1 ≤ 60 PHÚT)</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              Nhân viên BQL Cảng <strong>đúng bến phụ trách</strong> kiểm tra 8 nhóm điều kiện thực tế tại cầu tàu, đối chiếu phí lệ phí và chụp ảnh hiện trường → ra <strong>Thông báo chấp thuận</strong> chuyển Sở, hoặc Trả Chủ tàu bổ sung (tạm dừng đồng hồ BQL), hoặc Không chấp thuận.
            </p>
          </div>

          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 space-y-1.5">
            <div className="flex items-center gap-2 font-extrabold text-amber-950 text-sm">
              <span className="w-6 h-6 rounded-full bg-amber-600 text-white text-xs flex items-center justify-center shrink-0">3</span>
              <span>SỞ XÂY DỰNG &amp; PHẦN MỀM OFFICE (ĐỒNG HỒ 2 ≤ 60P)</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              Chuyên viên trong ca kiểm tra thời tiết (R7), duyệt dự thảo và xuất Word/PDF (<strong>chưa có dấu đỏ</strong>) sang phần mềm quản lý văn bản (Office) để Trưởng phòng trình Lãnh đạo ký số &amp; Văn thư phát hành. Sau khi Office cấp số, Chuyên viên tải bản PDF đã ký lên ứng dụng trong <strong>≤ 10 phút</strong> (hiệu lực 24h – R8).
            </p>
          </div>

          <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-1.5">
            <div className="flex items-center gap-2 font-extrabold text-emerald-950 text-sm">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center shrink-0">4</span>
              <span>BIÊN PHÒNG KIỂM SOÁT CUỐI CÙNG &amp; CẬP BẾN</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              Trạm Biên phòng bến đi quét QR Giấy phép, đối chiếu trực tiếp thuyền viên &amp; hành khách lên tàu → <strong>Cho xuất bến</strong>, hoặc <strong>Trả Chủ tàu bổ sung (R12)</strong> khi có người ngoài danh sách (phải đi lại từ BQL → Sở), hoặc <strong>Tạm giữ bất thường</strong>. Biên phòng bến đến (hoặc BQL dự phòng) xác nhận <strong>Đã cập bến</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* PHÂN VAI TRÒ NHANH */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1.5">
          <p className="font-extrabold text-[#07244d] flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            Trưởng phòng &amp; Lãnh đạo Sở
          </p>
          <p className="text-slate-600 leading-relaxed">
            Ký duyệt văn bản trên phần mềm Office (không ký trên ứng dụng). Trên ứng dụng: xem bảng điều hành, KPI, báo cáo; Trưởng phòng duyệt đề nghị giải trình/loại trừ thời gian trễ hạn KPI.
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1.5">
          <p className="font-extrabold text-[#07244d] flex items-center gap-1.5">
            <Anchor className="w-4 h-4 text-sky-600" />
            Quy tắc Ca trực &amp; KPI
          </p>
          <p className="text-slate-600 leading-relaxed">
            Người dùng đăng nhập thành công được xử lý hồ sơ theo đúng vai trò và bến phụ trách mà không bị giới hạn bởi ca trực; lịch ca trực được quản lý riêng để phân công và lưu vết nhật ký. KPI chấm cho <strong>BQL Cảng</strong> và <strong>Chuyên viên Sở</strong>.
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1.5">
          <p className="font-extrabold text-[#07244d] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Bảo mật dữ liệu (NĐ 356/2025/NĐ-CP)
          </p>
          <p className="text-slate-600 leading-relaxed">
            Trang xác thực QR công khai không lộ thông tin cá nhân hành khách. Cán bộ Biên phòng có quyền xem đầy đủ danh sách khi rà soát trên tàu và mọi lượt mở khóa đều ghi nhật ký kiểm toán.
          </p>
        </div>
      </div>

      {/* 12 QUY TẮC AN TOÀN R1 - R12 */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs">
        <h3 className="font-extrabold text-slate-900 uppercase tracking-wider text-xs">
          12 Quy tắc kiểm soát nghiệp vụ &amp; an toàn tự động (R1 – R12)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
          <p>• <strong>R1:</strong> Giấy chứng nhận đăng kiểm, giấy phép hoạt động tàu còn hiệu lực.</p>
          <p>• <strong>R2:</strong> Chứng chỉ chuyên môn thuyền trưởng, máy trưởng, thủy thủ còn hạn.</p>
          <p>• <strong>R3:</strong> Số hành khách không vượt sức chở thiết kế của tàu.</p>
          <p>• <strong>R4:</strong> Khối lượng hàng hóa không vượt trọng tải cho phép.</p>
          <p>• <strong>R5:</strong> Đủ định biên thuyền viên tối thiểu theo cấp tàu.</p>
          <p>• <strong>R6:</strong> Gió/sóng không vượt ngưỡng chịu đựng thiết kế riêng của tàu.</p>
          <p>• <strong>R7:</strong> Kiểm tra thời tiết tuyến &amp; không trùng lịch thuyền trưởng 2 tàu cùng giờ.</p>
          <p>• <strong>R8:</strong> Thời gian khai hợp lệ &amp; Giấy phép rời cảng có hiệu lực tối đa 24 giờ.</p>
          <p>• <strong>R9:</strong> Trang bị áo phao tối thiểu 100% tổng số người trên tàu.</p>
          <p>• <strong>R10:</strong> Biên phòng tạm giữ bất thường sau cấp phép → khóa xuất bến &amp; QR báo tạm đình chỉ.</p>
          <p>• <strong>R11:</strong> Bắt buộc đính kèm biên lai nộp phí hoặc mã giao dịch thanh toán QR khi nộp.</p>
          <p>• <strong>R12:</strong> Biên phòng phát hiện người ngoài danh sách → trả Chủ tàu bổ sung, đi lại BQL → Sở, hủy hiệu lực GP cũ.</p>
        </div>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-800">
            <Phone className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Thông tin liên hệ Quản trị hệ thống:{' '}
              <strong className="text-slate-900">{adminContact.name}</strong>
              {adminContact.phone && (
                <>
                  {' '}· ĐT:{' '}
                  <a
                    href={`tel:${adminContact.phone.replace(/\s+/g, '')}`}
                    className="font-mono font-bold text-blue-800 hover:underline"
                  >
                    {adminContact.phone}
                  </a>
                </>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pl-6">
            <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Email quản trị:</span>
            {adminContact.emails.map((email) => (
              <a
                key={email}
                href={`mailto:${email}`}
                className="font-mono font-bold text-blue-800 bg-white hover:bg-blue-50 px-2 py-0.5 rounded border border-blue-200 transition break-all"
              >
                {email}
              </a>
            ))}
          </div>
        </div>
        <span className="font-semibold text-slate-800 shrink-0">
          Tuyến Đảo Lớn – Đảo Bé · Đặc khu Lý Sơn
        </span>
      </div>
    </div>
  );
};
