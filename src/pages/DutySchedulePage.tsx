/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { DutyShift, PortId, ShiftRoleGroup, UserAccount } from '../types';
import { repository } from '../services/repository';
import { CoastalPageHero } from '../components/CoastalPageHero';
import { PaginationBar, usePagination } from '../components/PaginationBar';
import { formatDate } from '../utils/formatters';
import {
  CalendarCheck,
  Clock,
  Users,
  Plus,
  Edit3,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  PlayCircle,
  CheckSquare,
  Download,
  MapPin,
  ShieldCheck,
} from 'lucide-react';

type ShiftStatus = NonNullable<DutyShift['status']>;

const ROLE_GROUP_META: Record<
  ShiftRoleGroup,
  { label: string; shortLabel: string; badgeClass: string; requiresPort: boolean }
> = {
  BQL_CANG: {
    label: 'Ban Quản lý cảng (BQL_CANG)',
    shortLabel: 'BQL Cảng',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    requiresPort: true,
  },
  CHUYEN_VIEN: {
    label: 'Chuyên viên Phòng ATGT - Sở Xây dựng (CHUYEN_VIEN)',
    shortLabel: 'Chuyên viên Sở',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    requiresPort: false,
  },
  BIEN_PHONG: {
    label: 'Trạm kiểm soát Biên phòng (BIEN_PHONG)',
    shortLabel: 'Biên phòng',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    requiresPort: true,
  },
};

const SHIFT_STATUS_META: Record<ShiftStatus, { label: string; badgeClass: string }> = {
  ACTIVE: {
    label: 'Đang trong ca',
    badgeClass: 'bg-[#daf5e7] text-[#0c7a45] border-[#a9e4c5]',
  },
  SCHEDULED: {
    label: 'Đã lên lịch',
    badgeClass: 'bg-[#edf4ff] text-[#0a4ca8] border-[#cde1fb]',
  },
  COMPLETED: {
    label: 'Đã kết thúc',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

const PORT_LABEL: Record<PortId, string> = {
  'PORT-01': 'Bến Đảo Lớn (Lý Sơn)',
  'PORT-02': 'Bến Đảo Bé (An Bình)',
};

export function computeShiftHours(shift: DutyShift): number {
  if (shift.startTime && shift.endTime) {
    const [sh, sm] = shift.startTime.split(':').map(Number);
    const [eh, em] = shift.endTime.split(':').map(Number);
    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
      let diffMin = eh * 60 + em - (sh * 60 + sm);
      if (diffMin <= 0) diffMin += 24 * 60;
      return Math.round((diffMin / 60) * 10) / 10;
    }
  }
  return 6;
}

function getShiftDate(shift: DutyShift): string {
  return shift.date || shift.dutyDate || '';
}

function inferRoleGroup(shift: DutyShift): ShiftRoleGroup {
  if (shift.roleGroup) return shift.roleGroup;
  if (shift.portStaffId) return 'BQL_CANG';
  return 'CHUYEN_VIEN';
}

export const DutySchedulePage: React.FC<{ currentUser: UserAccount }> = ({ currentUser }) => {
  const [shifts, setShifts] = useState<DutyShift[]>(() => repository.getDutyShifts());
  const [users, setUsers] = useState<UserAccount[]>(() => repository.getAllUsers());

  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | ShiftRoleGroup>('ALL');
  const [portFilter, setPortFilter] = useState<'ALL' | PortId>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShiftStatus>('ALL');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<DutyShift | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [shiftToDelete, setShiftToDelete] = useState<DutyShift | null>(null);

  const [formState, setFormState] = useState<{
    date: string;
    roleGroup: ShiftRoleGroup;
    portId: PortId | '';
    shiftName: string;
    startTime: string;
    endTime: string;
    assigneeIds: string[];
    phone: string;
    handoverNote: string;
    status: ShiftStatus;
  }>({
    date: new Date().toISOString().slice(0, 10),
    roleGroup: 'BQL_CANG',
    portId: 'PORT-01',
    shiftName: 'Ca sáng (05:30 - 12:30)',
    startTime: '05:30',
    endTime: '12:30',
    assigneeIds: [],
    phone: '',
    handoverNote: '',
    status: 'ACTIVE',
  });

  useEffect(() => {
    return repository.subscribe(() => {
      setShifts(repository.getDutyShifts());
      setUsers(repository.getAllUsers());
    });
  }, []);

  const canManageShifts = ['ADMIN', 'DEPT_HEAD'].includes(currentUser.role);

  const getCandidatesForGroup = (group: ShiftRoleGroup): UserAccount[] => {
    if (group === 'BQL_CANG') {
      return users.filter((u) => u.role === 'PORT_STAFF');
    }
    if (group === 'BIEN_PHONG') {
      return users.filter((u) => u.role === 'BP_TRUC' || u.role === 'BP_CHIHUY');
    }
    return users.filter((u) => u.role === 'OFFICER' || u.role === 'DUTY_OFFICER');
  };

  const candidates = useMemo(
    () => getCandidatesForGroup(formState.roleGroup),
    [users, formState.roleGroup]
  );

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 5000);
  };

  const filteredShifts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...shifts]
      .filter((s) => {
        const g = inferRoleGroup(s);
        if (groupFilter !== 'ALL' && g !== groupFilter) return false;
        if (portFilter !== 'ALL' && s.portId !== portFilter) return false;
        if (statusFilter !== 'ALL' && (s.status || 'SCHEDULED') !== statusFilter) return false;
        if (!q) return true;
        const names = [
          s.shiftName,
          s.officerName || '',
          ...(s.assigneeNames || []),
          getShiftDate(s),
          s.handoverNote || '',
        ]
          .join(' ')
          .toLowerCase();
        return names.includes(q);
      })
      .sort((a, b) => getShiftDate(b).localeCompare(getShiftDate(a)));
  }, [shifts, groupFilter, portFilter, statusFilter, searchQuery]);

  const pagination = usePagination(
    filteredShifts,
    `${groupFilter}|${portFilter}|${statusFilter}|${searchQuery.trim().toLowerCase()}`
  );

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active = shifts.filter((s) => s.status === 'ACTIVE').length;
    const todayCount = shifts.filter((s) => getShiftDate(s) === today).length;
    const byGroup: Record<ShiftRoleGroup, number> = {
      BQL_CANG: 0,
      CHUYEN_VIEN: 0,
      BIEN_PHONG: 0,
    };
    shifts.forEach((s) => {
      byGroup[inferRoleGroup(s)] += 1;
    });
    return { total: shifts.length, active, todayCount, byGroup };
  }, [shifts]);

  const openAddModal = () => {
    setEditingShift(null);
    setFormError(null);
    const initialGroup: ShiftRoleGroup = 'BQL_CANG';
    const initialCands = getCandidatesForGroup(initialGroup);
    setFormState({
      date: new Date().toISOString().slice(0, 10),
      roleGroup: initialGroup,
      portId: 'PORT-01',
      shiftName: 'Ca sáng (05:30 - 12:30)',
      startTime: '05:30',
      endTime: '12:30',
      assigneeIds: initialCands[0] ? [initialCands[0].id] : [],
      phone: initialCands[0]?.phone || '',
      handoverNote: '',
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const openEditModal = (shift: DutyShift) => {
    setEditingShift(shift);
    setFormError(null);
    const group = inferRoleGroup(shift);
    const existingIds =
      shift.assigneeIds && shift.assigneeIds.length > 0
        ? shift.assigneeIds
        : shift.officerId
        ? [shift.officerId]
        : [];
    setFormState({
      date: getShiftDate(shift) || new Date().toISOString().slice(0, 10),
      roleGroup: group,
      portId: shift.portId || (ROLE_GROUP_META[group].requiresPort ? 'PORT-01' : ''),
      shiftName: shift.shiftName,
      startTime: shift.startTime || '06:00',
      endTime: shift.endTime || '18:00',
      assigneeIds: existingIds,
      phone: shift.phone || '',
      handoverNote: shift.handoverNote || '',
      status: shift.status || 'SCHEDULED',
    });
    setModalOpen(true);
  };

  const toggleAssignee = (uid: string) => {
    setFormState((prev) => {
      const exists = prev.assigneeIds.includes(uid);
      const nextIds = exists
        ? prev.assigneeIds.filter((id) => id !== uid)
        : [...prev.assigneeIds, uid];
      const firstUser = users.find((u) => u.id === nextIds[0]);
      return {
        ...prev,
        assigneeIds: nextIds,
        phone: prev.phone || firstUser?.phone || '',
      };
    });
  };

  const handleSaveShift = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formState.date) {
      setFormError('Vui lòng chọn ngày trực.');
      return;
    }
    if (!formState.shiftName.trim()) {
      setFormError('Vui lòng nhập tên ca trực.');
      return;
    }
    if (ROLE_GROUP_META[formState.roleGroup].requiresPort && !formState.portId) {
      setFormError('Nhóm Ban Quản lý cảng và Biên phòng bắt buộc gắn với Bến (Đảo Lớn hoặc Đảo Bé).');
      return;
    }
    if (formState.assigneeIds.length === 0) {
      setFormError('Vui lòng chọn ít nhất 01 cán bộ phụ trách trong ca trực.');
      return;
    }

    const selectedUsers = formState.assigneeIds
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is UserAccount => Boolean(u));
    const primary = selectedUsers[0];

    const nextShift: DutyShift = {
      id: editingShift?.id || `SHIFT-${Date.now()}`,
      date: formState.date,
      dutyDate: formState.date,
      roleGroup: formState.roleGroup,
      portId: ROLE_GROUP_META[formState.roleGroup].requiresPort
        ? (formState.portId as PortId)
        : undefined,
      shiftType: editingShift?.shiftType || 'MORNING',
      shiftName: formState.shiftName.trim(),
      startTime: formState.startTime,
      endTime: formState.endTime,
      assigneeIds: formState.assigneeIds,
      assigneeNames: selectedUsers.map((u) => u.fullName),
      officerId: primary?.id || formState.assigneeIds[0],
      officerName: primary?.fullName || 'Cán bộ trực',
      portStaffId: formState.roleGroup === 'BQL_CANG' ? primary?.id : undefined,
      portStaffName: formState.roleGroup === 'BQL_CANG' ? primary?.fullName : undefined,
      phone: formState.phone.trim() || primary?.phone || undefined,
      handoverNote: formState.handoverNote.trim() || undefined,
      status: formState.status,
    };

    repository.saveDutyShift(nextShift);
    repository.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: editingShift ? 'CAP_NHAT_CA_TRUC' : 'TAO_CA_TRUC',
      targetId: nextShift.id,
      targetType: 'SHIFT',
      details: `${editingShift ? 'Cập nhật' : 'Tạo'} ca trực ${nextShift.shiftName} (${ROLE_GROUP_META[formState.roleGroup].shortLabel}${nextShift.portId ? ` · ${PORT_LABEL[nextShift.portId]}` : ''}) ngày ${formatDate(formState.date)} cho ${(nextShift.assigneeNames || []).join(', ')}.`,
    });

    setModalOpen(false);
    showToast(
      'success',
      `Đã ${editingShift ? 'cập nhật' : 'tạo mới'} ca trực "${nextShift.shiftName}" ngày ${formatDate(formState.date)}.`
    );
  };

  const handleQuickStatusChange = (shift: DutyShift, nextStatus: ShiftStatus) => {
    repository.saveDutyShift({ ...shift, status: nextStatus });
    repository.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'DOI_TRANG_THAI_CA_TRUC',
      targetId: shift.id,
      targetType: 'SHIFT',
      details: `Chuyển trạng thái ca ${shift.shiftName} sang ${SHIFT_STATUS_META[nextStatus].label}.`,
    });
    showToast('success', `Đã chuyển ca "${shift.shiftName}" sang trạng thái "${SHIFT_STATUS_META[nextStatus].label}".`);
  };

  const handleConfirmDelete = () => {
    if (!shiftToDelete) return;
    const deleted = shiftToDelete;
    repository.deleteDutyShift(deleted.id);
    repository.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'XOA_CA_TRUC',
      targetId: deleted.id,
      targetType: 'SHIFT',
      details: `Xóa ca trực ${deleted.shiftName} ngày ${formatDate(getShiftDate(deleted))}.`,
    });
    setShiftToDelete(null);
    showToast('success', `Đã xóa ca trực "${deleted.shiftName}".`);
  };

  const handleExportCsv = () => {
    const headers = [
      'Mã ca',
      'Ngày trực',
      'Nhóm lực lượng',
      'Bến phụ trách',
      'Tên ca',
      'Giờ bắt đầu',
      'Giờ kết thúc',
      'Cán bộ trong ca',
      'Trạng thái',
      'Ghi chú bàn giao',
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = filteredShifts.map((s) => {
      const g = inferRoleGroup(s);
      return [
        s.id,
        formatDate(getShiftDate(s)),
        ROLE_GROUP_META[g].shortLabel,
        s.portId ? PORT_LABEL[s.portId] : 'Toàn tuyến (Sở)',
        s.shiftName,
        s.startTime || '',
        s.endTime || '',
        (s.assigneeNames && s.assigneeNames.length > 0 ? s.assigneeNames : [s.officerName || '']).join('; '),
        SHIFT_STATUS_META[s.status || 'SCHEDULED'].label,
        s.handoverNote || '',
      ]
        .map(esc)
        .join(',');
    });
    const csv = '\uFEFF' + [headers.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich_ca_truc_vrsb_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', 'Đã xuất lịch ca trực ra tệp CSV.');
  };

  return (
    <div className="w-full mx-auto space-y-6">
      <CoastalPageHero
        title="Quản lý Lịch Ca trực (BQL Cảng · Chuyên viên Sở · Biên phòng)"
        subtitle="Hồ sơ chỉ hiển thị thao tác xử lý cho cán bộ đang trong ca trực và đúng bến phụ trách; người ngoài ca chỉ được xem. Mọi thao tác đều lưu kèm mã ca trực."
        icon={<CalendarCheck className="w-7 h-7" />}
        rightContent={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3.5 py-1.5 bg-[#daf5e7] text-[#0c7a45] rounded-full font-extrabold border border-[#a9e4c5] whitespace-nowrap">
              {stats.active} ca đang trực
            </span>
            <span className="px-3.5 py-1.5 bg-[#edf4ff] text-[#0a4ca8] rounded-full font-extrabold border border-[#cde1fb] whitespace-nowrap">
              {stats.todayCount} ca hôm nay
            </span>
          </div>
        }
      />

      {toast && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 THẺ TỔNG QUAN CA TRỰC */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums text-xs">
        <div className="bg-white/95 p-4 rounded-[20px] border border-[#dce8f7] space-y-1">
          <span className="text-[#526c93] font-bold">Tổng lịch ca trực</span>
          <p className="text-2xl font-black text-[#07244d]">{stats.total} ca</p>
          <p className="text-[11px] text-emerald-700 font-semibold">{stats.active} ca đang mở trực</p>
        </div>
        <div className="bg-white/95 p-4 rounded-[20px] border border-sky-200 space-y-1">
          <span className="text-sky-800 font-bold">Ban Quản lý cảng</span>
          <p className="text-2xl font-black text-sky-900">{stats.byGroup.BQL_CANG} ca</p>
          <p className="text-[11px] text-slate-500">Gắn bến Đảo Lớn / Đảo Bé</p>
        </div>
        <div className="bg-white/95 p-4 rounded-[20px] border border-indigo-200 space-y-1">
          <span className="text-indigo-800 font-bold">Chuyên viên Sở Xây dựng</span>
          <p className="text-2xl font-black text-indigo-900">{stats.byGroup.CHUYEN_VIEN} ca</p>
          <p className="text-[11px] text-slate-500">Thụ lý &amp; trình ký Office</p>
        </div>
        <div className="bg-white/95 p-4 rounded-[20px] border border-emerald-200 space-y-1">
          <span className="text-emerald-800 font-bold">Trạm kiểm soát Biên phòng</span>
          <p className="text-2xl font-black text-emerald-900">{stats.byGroup.BIEN_PHONG} ca</p>
          <p className="text-[11px] text-slate-500">Kiểm soát cuối cùng 2 đầu bến</p>
        </div>
      </div>

      {/* BỘ LỌC & HÀNH ĐỘNG */}
      <div className="bg-white/95 p-4 rounded-[22px] border border-[#dce8f7] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[210px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên ca, cán bộ trực, ngày..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
            />
          </div>

          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as 'ALL' | ShiftRoleGroup)}
            className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-700 cursor-pointer"
          >
            <option value="ALL">Tất cả lực lượng</option>
            <option value="BQL_CANG">Ban Quản lý cảng</option>
            <option value="CHUYEN_VIEN">Chuyên viên Sở</option>
            <option value="BIEN_PHONG">Biên phòng</option>
          </select>

          <select
            value={portFilter}
            onChange={(e) => setPortFilter(e.target.value as 'ALL' | PortId)}
            className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-700 cursor-pointer"
          >
            <option value="ALL">Tất cả bến</option>
            <option value="PORT-01">Bến Đảo Lớn</option>
            <option value="PORT-02">Bến Đảo Bé</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ShiftStatus)}
            className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-700 cursor-pointer"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang trong ca</option>
            <option value="SCHEDULED">Đã lên lịch</option>
            <option value="COMPLETED">Đã kết thúc</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#07244d] border border-slate-300 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Xuất CSV</span>
          </button>

          {canManageShifts && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 bg-[#072b61] hover:bg-[#0c4a9c] text-white rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo ca trực</span>
            </button>
          )}
        </div>
      </div>

      {/* DANH SÁCH CA TRỰC */}
      <div className="bg-white/95 rounded-[24px] border border-[#dce8f7] overflow-hidden text-xs">
        <div className="p-4 sm:px-6 bg-[#edf4fe] border-b border-[#dce8f7] flex justify-between items-center">
          <span className="font-extrabold text-[#07244d] uppercase tracking-wider text-[11px]">
            Danh sách lịch ca trực ({filteredShifts.length} ca)
          </span>
          <span className="text-[11px] text-[#526c93] font-semibold">
            Áp dụng kiểm soát quyền thao tác theo thời gian thực
          </span>
        </div>

        {filteredShifts.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            Không có ca trực nào khớp bộ lọc.
          </div>
        ) : (
          <div className="divide-y divide-[#eef4fc]">
            {pagination.pageItems.map((s) => {
              const g = inferRoleGroup(s);
              const groupMeta = ROLE_GROUP_META[g];
              const statusKey: ShiftStatus = s.status || 'SCHEDULED';
              const statusMeta = SHIFT_STATUS_META[statusKey];
              const names =
                s.assigneeNames && s.assigneeNames.length > 0
                  ? s.assigneeNames
                  : [s.officerName || 'Chưa gán'];

              return (
                <div
                  key={s.id}
                  className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#f5f9ff] transition"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-[#07244d]">{s.shiftName}</span>
                      <span
                        className={`text-[10px] border font-bold px-2.5 py-0.5 rounded-full ${groupMeta.badgeClass}`}
                      >
                        {groupMeta.shortLabel}
                      </span>
                      {s.portId && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-900 border border-amber-200 font-bold px-2.5 py-0.5 rounded-full">
                          <MapPin className="w-3 h-3" />
                          {PORT_LABEL[s.portId]}
                        </span>
                      )}
                      <span
                        className={`text-[10px] border font-extrabold px-2.5 py-0.5 rounded-full ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#526c93] tabular-nums">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(getShiftDate(s))} · {s.startTime || '00:00'} – {s.endTime || '23:59'} (
                        {computeShiftHours(s)}h)
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        Người trực: <strong className="text-[#07244d]">{names.join(', ')}</strong>
                      </span>
                    </div>

                    {s.handoverNote && (
                      <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 inline-block">
                        <strong>Bàn giao ca:</strong> {s.handoverNote}
                      </p>
                    )}
                  </div>

                  {canManageShifts && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {statusKey === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatusChange(s, 'ACTIVE')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>Mở ca trực</span>
                        </button>
                      )}
                      {statusKey === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatusChange(s, 'COMPLETED')}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>Đóng ca</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftToDelete(s)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-700 border border-red-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <PaginationBar
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          onPageChange={pagination.setCurrentPage}
          itemLabel="ca trực"
        />
      </div>

      {/* MODAL TẠO / SỬA CA TRỰC */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl"
          >
            <div className="px-5 py-4 bg-[#072b61] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-300" />
                <h3 className="text-sm font-extrabold">
                  {editingShift ? `Cập nhật ca trực: ${editingShift.shiftName}` : 'Tạo lịch ca trực mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nhóm lực lượng (*)</label>
                  <select
                    value={formState.roleGroup}
                    onChange={(e) => {
                      const nextGroup = e.target.value as ShiftRoleGroup;
                      const nextCands = getCandidatesForGroup(nextGroup);
                      setFormState((prev) => ({
                        ...prev,
                        roleGroup: nextGroup,
                        portId: ROLE_GROUP_META[nextGroup].requiresPort ? prev.portId || 'PORT-01' : '',
                        assigneeIds: nextCands[0] ? [nextCands[0].id] : [],
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                  >
                    <option value="BQL_CANG">Ban Quản lý cảng (BQL_CANG)</option>
                    <option value="CHUYEN_VIEN">Chuyên viên Sở (CHUYEN_VIEN)</option>
                    <option value="BIEN_PHONG">Trạm kiểm soát Biên phòng (BIEN_PHONG)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày trực (*)</label>
                  <input
                    type="date"
                    required
                    value={formState.date}
                    onChange={(e) => setFormState({ ...formState, date: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>

                {ROLE_GROUP_META[formState.roleGroup].requiresPort && (
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      Bến phụ trách (*) — Bắt buộc với BQL Cảng &amp; Biên phòng
                    </label>
                    <select
                      value={formState.portId}
                      onChange={(e) => setFormState({ ...formState, portId: e.target.value as PortId })}
                      className="w-full p-2.5 border border-amber-300 bg-amber-50/40 rounded-xl font-bold text-slate-900"
                    >
                      <option value="PORT-01">Bến Đảo Lớn (Lý Sơn) — PORT-01</option>
                      <option value="PORT-02">Bến Đảo Bé (An Bình) — PORT-02</option>
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Tên ca trực (*)</label>
                  <input
                    type="text"
                    required
                    value={formState.shiftName}
                    onChange={(e) => setFormState({ ...formState, shiftName: e.target.value })}
                    placeholder="VD: Ca sáng Đảo Lớn (05:30 - 12:30)"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ bắt đầu (*)</label>
                  <input
                    type="time"
                    required
                    value={formState.startTime}
                    onChange={(e) => setFormState({ ...formState, startTime: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ kết thúc (*)</label>
                  <input
                    type="time"
                    required
                    value={formState.endTime}
                    onChange={(e) => setFormState({ ...formState, endTime: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Chọn cán bộ trực ca (*) — Đã chọn: {formState.assigneeIds.length}
                  </label>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1.5 bg-slate-50">
                    {candidates.length === 0 ? (
                      <p className="text-slate-500 p-2 text-center">
                        Chưa có tài khoản thuộc nhóm {ROLE_GROUP_META[formState.roleGroup].shortLabel}.
                      </p>
                    ) : (
                      candidates.map((u) => {
                        const checked = formState.assigneeIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition ${
                              checked
                                ? 'bg-blue-50 border-blue-300 text-blue-950'
                                : 'bg-white border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAssignee(u.id)}
                                className="w-4 h-4 rounded text-blue-600"
                              />
                              <span className="font-bold">{u.fullName}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {u.assignedPortId ? PORT_LABEL[u.assignedPortId] : u.department}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Trạng thái ca</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState({ ...formState, status: e.target.value as ShiftStatus })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                  >
                    <option value="ACTIVE">Đang trong ca (ACTIVE)</option>
                    <option value="SCHEDULED">Đã lên lịch (SCHEDULED)</option>
                    <option value="COMPLETED">Đã kết thúc (COMPLETED)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">SĐT liên hệ trực ca</label>
                  <input
                    type="text"
                    value={formState.phone}
                    onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                    placeholder="09xxxxxxxx"
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Ghi chú bàn giao ca</label>
                  <textarea
                    rows={2}
                    value={formState.handoverNote}
                    onChange={(e) => setFormState({ ...formState, handoverNote: e.target.value })}
                    placeholder="Ghi nhận tình trạng bến, thiết bị, hồ sơ bàn giao..."
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#072b61] hover:bg-[#0c4a9c] text-white rounded-xl font-extrabold cursor-pointer"
                >
                  {editingShift ? 'Lưu thay đổi' : 'Tạo ca trực'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÓA CA TRỰC */}
      {shiftToDelete && (
        <div
          onClick={() => setShiftToDelete(null)}
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Xác nhận xóa ca trực</h3>
                <p className="text-slate-600 mt-1">
                  Bạn có chắc muốn xóa <strong>{shiftToDelete.shiftName}</strong> ngày{' '}
                  {formatDate(getShiftDate(shiftToDelete))}?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShiftToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-extrabold cursor-pointer"
              >
                Xóa ca trực
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
