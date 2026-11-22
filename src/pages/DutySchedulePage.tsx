/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  RotateCcw,
  Copy,
  Download,
  MapPin,
  ShieldCheck,
  Info,
} from 'lucide-react';

type ShiftStatus = NonNullable<DutyShift['status']>;
type ShiftType = NonNullable<DutyShift['shiftType']>;

const ROLE_GROUP_META: Record<
  ShiftRoleGroup,
  { label: string; shortLabel: string; accentClass: string; requiresPort: boolean }
> = {
  BQL_CANG: {
    label: 'Ban Quản lý cảng (BQL_CANG)',
    shortLabel: 'BQL Cảng',
    accentClass: 'bg-sky-50 text-sky-800 border-sky-200',
    requiresPort: true,
  },
  CHUYEN_VIEN: {
    label: 'Chuyên viên Phòng ATGT - Sở Xây dựng (CHUYEN_VIEN)',
    shortLabel: 'Chuyên viên Sở',
    accentClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    requiresPort: false,
  },
  BIEN_PHONG: {
    label: 'Trạm kiểm soát Biên phòng (BIEN_PHONG)',
    shortLabel: 'Biên phòng',
    accentClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    requiresPort: true,
  },
};

const SHIFT_STATUS_META: Record<ShiftStatus, { label: string; textClass: string; badgeClass: string }> = {
  ACTIVE: {
    label: 'Đang trong ca',
    textClass: 'text-[#0c7a45]',
    badgeClass: 'bg-[#daf5e7] text-[#0c7a45] border-[#a9e4c5]',
  },
  SCHEDULED: {
    label: 'Đã lên lịch',
    textClass: 'text-[#0a4ca8]',
    badgeClass: 'bg-[#edf4ff] text-[#0a4ca8] border-[#cde1fb]',
  },
  COMPLETED: {
    label: 'Đã kết thúc',
    textClass: 'text-slate-600',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  EARLY_MORNING: 'Ca sáng sớm',
  MORNING: 'Ca sáng',
  AFTERNOON: 'Ca chiều',
  NIGHT: 'Ca đêm / Trực 24/24',
  WEEKEND: 'Trực cuối tuần',
  HOLIDAY: 'Trực ngày lễ / Tết',
};

const SHIFT_PRESETS: {
  label: string;
  shiftName: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
}[] = [
  {
    label: 'Ca sáng (05:30–12:30)',
    shiftName: 'Ca sáng (05:30 - 12:30)',
    shiftType: 'MORNING',
    startTime: '05:30',
    endTime: '12:30',
  },
  {
    label: 'Ca chiều (12:30–18:30)',
    shiftName: 'Ca chiều (12:30 - 18:30)',
    shiftType: 'AFTERNOON',
    startTime: '12:30',
    endTime: '18:30',
  },
  {
    label: 'Ca đêm (18:30–05:30)',
    shiftName: 'Ca đêm (18:30 - 05:30)',
    shiftType: 'NIGHT',
    startTime: '18:30',
    endTime: '05:30',
  },
  {
    label: 'Hành chính (07:30–17:00)',
    shiftName: 'Ca hành chính (07:30 - 17:00)',
    shiftType: 'MORNING',
    startTime: '07:30',
    endTime: '17:00',
  },
  {
    label: 'Trực 24/24 (00:00–23:59)',
    shiftName: 'Ca trực cả ngày (00:00 - 23:59)',
    shiftType: 'NIGHT',
    startTime: '00:00',
    endTime: '23:59',
  },
];

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

function addDaysToIsoDate(dateStr: string, days: number): string {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DutySchedulePage: React.FC<{ currentUser: UserAccount }> = ({ currentUser }) => {
  const [shifts, setShifts] = useState<DutyShift[]>(() => repository.getDutyShifts());
  const [users, setUsers] = useState<UserAccount[]>(() => repository.getAllUsers());

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | ShiftRoleGroup>('ALL');
  const [portFilter, setPortFilter] = useState<'ALL' | PortId>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShiftStatus>('ALL');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<DutyShift | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [showAllUsersInPicker, setShowAllUsersInPicker] = useState(false);

  const [shiftToDelete, setShiftToDelete] = useState<DutyShift | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formState, setFormState] = useState<{
    date: string;
    roleGroup: ShiftRoleGroup;
    portId: PortId | '';
    shiftType: ShiftType;
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
    shiftType: 'MORNING',
    shiftName: 'Ca sáng (05:30 - 12:30)',
    startTime: '05:30',
    endTime: '12:30',
    assigneeIds: [],
    phone: '',
    handoverNote: '',
    status: 'ACTIVE',
  });

  useEffect(() => {
    repository.syncDutyShiftsFromServer().then((synced) => {
      setShifts(synced);
    });
    return repository.subscribe(() => {
      setShifts(repository.getDutyShifts());
      setUsers(repository.getAllUsers());
    });
  }, []);

  // Đóng modal bằng phím Escape
  useEffect(() => {
    if (!modalOpen && !shiftToDelete) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (shiftToDelete && !isDeleting) setShiftToDelete(null);
        else if (modalOpen && !isSaving) setModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen, shiftToDelete, isSaving, isDeleting]);

  const canManageAllShifts = ['ADMIN', 'DEPT_HEAD', 'LEADER'].includes(currentUser.role);
  const canManageShifts = canManageAllShifts || currentUser.role === 'BP_CHIHUY';

  const canManageShiftRow = (shift: DutyShift): boolean => {
    if (canManageAllShifts) return true;
    if (currentUser.role === 'BP_CHIHUY') {
      return inferRoleGroup(shift) === 'BIEN_PHONG';
    }
    return false;
  };

  const activeUsers = useMemo(
    () => users.filter((u) => u.status !== 'LOCKED' && u.isActive !== false),
    [users]
  );

  const getCandidatesForGroup = (group: ShiftRoleGroup): UserAccount[] => {
    if (group === 'BQL_CANG') {
      return activeUsers.filter((u) => u.role === 'PORT_STAFF');
    }
    if (group === 'BIEN_PHONG') {
      return activeUsers.filter((u) => u.role === 'BP_TRUC' || u.role === 'BP_CHIHUY');
    }
    return activeUsers.filter(
      (u) => u.role === 'OFFICER' || u.role === 'DUTY_OFFICER' || u.role === 'CLERK'
    );
  };

  const pickerCandidates = useMemo(() => {
    const base = showAllUsersInPicker
      ? activeUsers.filter((u) => u.role !== 'CAPTAIN')
      : getCandidatesForGroup(formState.roleGroup);
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((u) =>
      `${u.fullName} ${u.email || ''} ${u.username || ''} ${u.department || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [activeUsers, formState.roleGroup, showAllUsersInPicker, assigneeSearch]);

  const overlappingAssignees = useMemo(() => {
    if (!modalOpen || !formState.date || formState.assigneeIds.length === 0) return [];
    const conflicts: string[] = [];
    shifts.forEach((s) => {
      if (editingShift && s.id === editingShift.id) return;
      if (s.status === 'COMPLETED') return;
      if (getShiftDate(s) !== formState.date) return;
      const ids = s.assigneeIds && s.assigneeIds.length > 0 ? s.assigneeIds : s.officerId ? [s.officerId] : [];
      formState.assigneeIds.forEach((uid) => {
        if (ids.includes(uid)) {
          const u = users.find((item) => item.id === uid);
          const label = `${u?.fullName || uid} (đã có ${s.shiftName})`;
          if (!conflicts.includes(label)) conflicts.push(label);
        }
      });
    });
    return conflicts;
  }, [modalOpen, formState.date, formState.assigneeIds, shifts, editingShift, users]);

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
        if (dateFilter && getShiftDate(s) !== dateFilter) return false;
        if (!q) return true;
        const names = [
          s.shiftName,
          s.officerName || '',
          ...(s.assigneeNames || []),
          getShiftDate(s),
          s.handoverNote || '',
          s.phone || '',
        ]
          .join(' ')
          .toLowerCase();
        return names.includes(q);
      })
      .sort((a, b) => {
        const dateCmp = getShiftDate(b).localeCompare(getShiftDate(a));
        if (dateCmp !== 0) return dateCmp;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
  }, [shifts, groupFilter, portFilter, statusFilter, dateFilter, searchQuery]);

  const pagination = usePagination(
    filteredShifts,
    `${groupFilter}|${portFilter}|${statusFilter}|${dateFilter}|${searchQuery.trim().toLowerCase()}`
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
    setAssigneeSearch('');
    setShowAllUsersInPicker(false);
    const initialGroup: ShiftRoleGroup =
      currentUser.role === 'BP_CHIHUY' ? 'BIEN_PHONG' : 'BQL_CANG';
    const initialCands = getCandidatesForGroup(initialGroup);
    setFormState({
      date: dateFilter || new Date().toISOString().slice(0, 10),
      roleGroup: initialGroup,
      portId: ROLE_GROUP_META[initialGroup].requiresPort
        ? (currentUser.assignedPortId as PortId) || 'PORT-01'
        : '',
      shiftType: 'MORNING',
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
    setAssigneeSearch('');
    setShowAllUsersInPicker(false);
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
      shiftType: shift.shiftType || 'MORNING',
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

  const openCloneModal = (shift: DutyShift) => {
    setEditingShift(null);
    setFormError(null);
    setAssigneeSearch('');
    setShowAllUsersInPicker(false);
    const group = inferRoleGroup(shift);
    const existingIds =
      shift.assigneeIds && shift.assigneeIds.length > 0
        ? shift.assigneeIds
        : shift.officerId
        ? [shift.officerId]
        : [];
    setFormState({
      date: addDaysToIsoDate(getShiftDate(shift), 1),
      roleGroup: group,
      portId: shift.portId || (ROLE_GROUP_META[group].requiresPort ? 'PORT-01' : ''),
      shiftType: shift.shiftType || 'MORNING',
      shiftName: shift.shiftName,
      startTime: shift.startTime || '06:00',
      endTime: shift.endTime || '18:00',
      assigneeIds: existingIds,
      phone: shift.phone || '',
      handoverNote: shift.handoverNote || '',
      status: 'SCHEDULED',
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

  const handleSaveShift = async (e: React.FormEvent) => {
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
    if (!formState.startTime || !formState.endTime) {
      setFormError('Vui lòng nhập đầy đủ giờ bắt đầu và giờ kết thúc.');
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
    const resolvedNames = formState.assigneeIds.map((id) => {
      const found = users.find((u) => u.id === id);
      if (found) return found.fullName;
      const oldIdx = editingShift?.assigneeIds?.indexOf(id) ?? -1;
      if (oldIdx >= 0 && editingShift?.assigneeNames?.[oldIdx]) {
        return editingShift.assigneeNames[oldIdx];
      }
      return id;
    });

    const isEdit = Boolean(editingShift);
    const nextShift: DutyShift = {
      id: editingShift?.id || `SHIFT-${Date.now()}`,
      date: formState.date,
      dutyDate: formState.date,
      roleGroup: formState.roleGroup,
      portId: ROLE_GROUP_META[formState.roleGroup].requiresPort
        ? (formState.portId as PortId)
        : undefined,
      shiftType: formState.shiftType,
      shiftName: formState.shiftName.trim(),
      startTime: formState.startTime,
      endTime: formState.endTime,
      assigneeIds: formState.assigneeIds,
      assigneeNames: resolvedNames,
      officerId: primary?.id || formState.assigneeIds[0],
      officerName: primary?.fullName || resolvedNames[0] || 'Cán bộ trực',
      portStaffId: formState.roleGroup === 'BQL_CANG' ? primary?.id || formState.assigneeIds[0] : undefined,
      portStaffName:
        formState.roleGroup === 'BQL_CANG' ? primary?.fullName || resolvedNames[0] : undefined,
      phone: formState.phone.trim() || primary?.phone || undefined,
      handoverNote: formState.handoverNote.trim() || undefined,
      status: formState.status,
    };

    setIsSaving(true);
    try {
      const syncResult = await repository.saveDutyShiftWithSync(nextShift, isEdit);
      repository.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.fullName,
        userRole: currentUser.role,
        action: isEdit ? 'CAP_NHAT_CA_TRUC' : 'TAO_CA_TRUC',
        targetId: nextShift.id,
        targetType: 'SHIFT',
        details: `${isEdit ? 'Cập nhật' : 'Tạo'} ca trực ${nextShift.shiftName} (${ROLE_GROUP_META[formState.roleGroup].shortLabel}${
          nextShift.portId ? ` · ${PORT_LABEL[nextShift.portId]}` : ''
        }) ngày ${formatDate(formState.date)} cho ${resolvedNames.join(', ')}.`,
      });

      setModalOpen(false);
      showToast(
        'success',
        `Đã ${isEdit ? 'cập nhật' : 'thêm mới'} ca trực "${nextShift.shiftName}" ngày ${formatDate(formState.date)}${
          syncResult.syncedToServer ? ' (đã đồng bộ máy chủ)' : ''
        }.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickStatusChange = async (shift: DutyShift, nextStatus: ShiftStatus) => {
    const updated: DutyShift = { ...shift, status: nextStatus };
    const syncResult = await repository.saveDutyShiftWithSync(updated, true);
    repository.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      action: 'DOI_TRANG_THAI_CA_TRUC',
      targetId: shift.id,
      targetType: 'SHIFT',
      details: `Chuyển trạng thái ca ${shift.shiftName} sang ${SHIFT_STATUS_META[nextStatus].label}.`,
    });
    showToast(
      'success',
      `Đã chuyển ca "${shift.shiftName}" sang trạng thái "${SHIFT_STATUS_META[nextStatus].label}"${
        syncResult.syncedToServer ? ' (đã đồng bộ)' : ''
      }.`
    );
  };

  const handleConfirmDelete = async () => {
    if (!shiftToDelete) return;
    const deleted = shiftToDelete;
    setIsDeleting(true);
    try {
      const syncResult = await repository.deleteDutyShiftWithSync(deleted.id);
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
      showToast(
        'success',
        `Đã xóa ca trực "${deleted.shiftName}"${syncResult.syncedToServer ? ' (đã đồng bộ máy chủ)' : ''}.`
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Mã ca',
      'Ngày trực',
      'Nhóm lực lượng',
      'Bến phụ trách',
      'Loại ca',
      'Tên ca',
      'Giờ bắt đầu',
      'Giờ kết thúc',
      'Cán bộ trong ca',
      'SĐT trực ca',
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
        s.shiftType ? SHIFT_TYPE_LABELS[s.shiftType] : 'Ca sáng',
        s.shiftName,
        s.startTime || '',
        s.endTime || '',
        (s.assigneeNames && s.assigneeNames.length > 0 ? s.assigneeNames : [s.officerName || '']).join('; '),
        s.phone || '',
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
        title="Quản lý Ca trực (BQL Cảng · Chuyên viên Sở · Biên phòng)"
        subtitle="Thêm mới, cập nhật và xóa lịch phân công ca trực theo lực lượng và đầu bến. Tài khoản đăng nhập thành công được xử lý hồ sơ trực tiếp theo vai trò/quyền mà không bị chặn theo ca trực."
        icon={<CalendarCheck className="w-7 h-7" />}
        rightContent={
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-white/95 tabular-nums">
            <span>{stats.active} ca đang trực</span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span>{stats.todayCount} ca hôm nay</span>
          </div>
        }
      />

      {toast && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
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
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 CHỈ SỐ TỔNG QUAN CA TRỰC */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-slate-500 font-semibold">Tổng lịch ca trực</span>
          <p className="text-2xl font-black text-[#07244d]">{stats.total} ca</p>
          <p className="text-[11px] text-emerald-700 font-semibold">{stats.active} ca đang mở trực</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-sky-800 font-semibold">Ban Quản lý cảng</span>
          <p className="text-2xl font-black text-sky-900">{stats.byGroup.BQL_CANG} ca</p>
          <p className="text-[11px] text-slate-500">Bến Đảo Lớn &amp; Đảo Bé</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-indigo-800 font-semibold">Chuyên viên Sở Xây dựng</span>
          <p className="text-2xl font-black text-indigo-900">{stats.byGroup.CHUYEN_VIEN} ca</p>
          <p className="text-[11px] text-slate-500">Thụ lý &amp; trình ký Office</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-emerald-800 font-semibold">Trạm kiểm soát Biên phòng</span>
          <p className="text-2xl font-black text-emerald-900">{stats.byGroup.BIEN_PHONG} ca</p>
          <p className="text-[11px] text-slate-500">Kiểm soát 2 đầu bến</p>
        </div>
      </div>

      {/* BỘ LỌC & HÀNH ĐỘNG */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên ca, cán bộ trực, SĐT..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            />
          </div>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              title="Lọc theo ngày trực"
              className="px-2.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Xóa lọc ngày"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as 'ALL' | ShiftRoleGroup)}
            className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
          >
            <option value="ALL">Tất cả lực lượng</option>
            <option value="BQL_CANG">Ban Quản lý cảng</option>
            <option value="CHUYEN_VIEN">Chuyên viên Sở</option>
            <option value="BIEN_PHONG">Biên phòng</option>
          </select>

          <select
            value={portFilter}
            onChange={(e) => setPortFilter(e.target.value as 'ALL' | PortId)}
            className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
          >
            <option value="ALL">Tất cả bến</option>
            <option value="PORT-01">Bến Đảo Lớn</option>
            <option value="PORT-02">Bến Đảo Bé</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ShiftStatus)}
            className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
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
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#07244d] border border-slate-300 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Xuất CSV</span>
          </button>

          {canManageShifts && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 bg-[#072b61] hover:bg-[#0c4a9c] text-white rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm ca trực</span>
            </button>
          )}
        </div>
      </div>

      {/* DANH SÁCH CA TRỰC */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
          <span className="font-extrabold text-[#07244d] text-xs">
            Danh sách lịch ca trực ({filteredShifts.length} ca)
          </span>
          <span className="text-[11px] text-slate-500 font-medium">
            Ghi nhận phân công trực &amp; nhật ký · Không chặn quyền xử lý hồ sơ khi đăng nhập
          </span>
        </div>

        {filteredShifts.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-slate-500 text-xs">
              Không có ca trực nào khớp bộ lọc hiện tại.
            </p>
            {canManageShifts && (
              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2 bg-[#072b61] hover:bg-[#0c4a9c] text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm ca trực mới</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pagination.pageItems.map((s) => {
              const g = inferRoleGroup(s);
              const groupMeta = ROLE_GROUP_META[g];
              const statusKey: ShiftStatus = s.status || 'SCHEDULED';
              const statusMeta = SHIFT_STATUS_META[statusKey];
              const names =
                s.assigneeNames && s.assigneeNames.length > 0
                  ? s.assigneeNames
                  : [s.officerName || 'Chưa gán'];
              const rowEditable = canManageShiftRow(s);

              return (
                <div
                  key={s.id}
                  className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="font-extrabold text-sm text-[#07244d]">{s.shiftName}</span>
                      <span className="text-xs font-semibold text-slate-600">
                        {groupMeta.shortLabel}
                      </span>
                      {s.portId && (
                        <>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="inline-flex items-center gap-1 text-xs text-amber-800 font-semibold">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {PORT_LABEL[s.portId]}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className={`text-xs font-bold ${statusMeta.textClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 tabular-nums">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(getShiftDate(s))} · {s.startTime || '00:00'} – {s.endTime || '23:59'} (
                        {computeShiftHours(s)}h)
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        Người trực: <strong className="text-[#07244d]">{names.join(', ')}</strong>
                      </span>
                      {s.phone && (
                        <span className="font-mono text-slate-500">ĐT: {s.phone}</span>
                      )}
                    </div>

                    {s.handoverNote && (
                      <p className="text-[11px] text-slate-600 pt-0.5">
                        <strong className="text-slate-700">Bàn giao ca:</strong> {s.handoverNote}
                      </p>
                    )}
                  </div>

                  {rowEditable && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {statusKey === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatusChange(s, 'ACTIVE')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>Mở ca</span>
                        </button>
                      )}
                      {statusKey === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatusChange(s, 'COMPLETED')}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>Đóng ca</span>
                        </button>
                      )}
                      {statusKey === 'COMPLETED' && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatusChange(s, 'ACTIVE')}
                          className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Mở lại</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openCloneModal(s)}
                        title="Nhân bản ca trực sang ngày kế tiếp"
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Nhân bản</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Cập nhật</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftToDelete(s)}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 text-red-700 border border-red-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
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

      {/* MODAL THÊM / CẬP NHẬT CA TRỰC (PORTAL) */}
      {modalOpen &&
        createPortal(
          <div
            onClick={() => !isSaving && setModalOpen(false)}
            className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duty-shift-modal-title"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-xl w-full max-h-[90dvh] flex flex-col overflow-hidden border border-slate-200 shadow-2xl"
            >
              <div className="px-5 py-3.5 bg-[#072b61] text-white flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-sky-300 shrink-0" />
                  <h3 id="duty-shift-modal-title" className="text-sm font-extrabold truncate">
                    {editingShift ? `Cập nhật ca trực: ${editingShift.shiftName}` : 'Thêm mới lịch ca trực'}
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer shrink-0"
                  aria-label="Đóng cửa sổ"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveShift} className="flex flex-col flex-1 min-h-0 text-xs">
                <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* Khung giờ mẫu nhanh */}
                  <div className="space-y-1.5">
                    <span className="block font-bold text-slate-700">Chọn nhanh khung giờ mẫu</span>
                    <div className="flex flex-wrap gap-1.5">
                      {SHIFT_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            setFormState((prev) => ({
                              ...prev,
                              shiftName: preset.shiftName,
                              shiftType: preset.shiftType,
                              startTime: preset.startTime,
                              endTime: preset.endTime,
                            }))
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-900 font-semibold text-[11px] transition cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Nhóm lực lượng (*)</label>
                      <select
                        value={formState.roleGroup}
                        disabled={!canManageAllShifts && currentUser.role === 'BP_CHIHUY'}
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
                        className="w-full p-2.5 border border-slate-300 rounded-lg bg-white font-semibold disabled:bg-slate-100"
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
                        className="w-full p-2.5 border border-slate-300 rounded-lg font-semibold"
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
                          className="w-full p-2.5 border border-amber-300 bg-amber-50/40 rounded-lg font-bold text-slate-900"
                        >
                          <option value="PORT-01">Bến Đảo Lớn (Lý Sơn) — PORT-01</option>
                          <option value="PORT-02">Bến Đảo Bé (An Bình) — PORT-02</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tên ca trực (*)</label>
                      <input
                        type="text"
                        required
                        value={formState.shiftName}
                        onChange={(e) => setFormState({ ...formState, shiftName: e.target.value })}
                        placeholder="VD: Ca sáng Đảo Lớn (05:30 - 12:30)"
                        className="w-full p-2.5 border border-slate-300 rounded-lg font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Loại ca trực</label>
                      <select
                        value={formState.shiftType}
                        onChange={(e) => setFormState({ ...formState, shiftType: e.target.value as ShiftType })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
                      >
                        {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[]).map((k) => (
                          <option key={k} value={k}>
                            {SHIFT_TYPE_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Giờ bắt đầu (*)</label>
                      <input
                        type="time"
                        required
                        value={formState.startTime}
                        onChange={(e) => setFormState({ ...formState, startTime: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg font-mono font-bold tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Giờ kết thúc (*)</label>
                      <input
                        type="time"
                        required
                        value={formState.endTime}
                        onChange={(e) => setFormState({ ...formState, endTime: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg font-mono font-bold tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="font-bold text-slate-700">
                          Chọn cán bộ trực ca (*) — Đã chọn: {formState.assigneeIds.length}
                        </label>
                        <div className="flex items-center gap-3 text-[11px]">
                          <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showAllUsersInPicker}
                              onChange={(e) => setShowAllUsersInPicker(e.target.checked)}
                              className="rounded text-blue-600"
                            />
                            <span>Tất cả tài khoản</span>
                          </label>
                          {pickerCandidates.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const allIds = pickerCandidates.map((u) => u.id);
                                const allSelected = allIds.every((id) =>
                                  formState.assigneeIds.includes(id)
                                );
                                setFormState((prev) => ({
                                  ...prev,
                                  assigneeIds: allSelected ? [] : allIds,
                                }));
                              }}
                              className="font-bold text-blue-700 hover:underline cursor-pointer"
                            >
                              {pickerCandidates.every((u) => formState.assigneeIds.includes(u.id))
                                ? 'Bỏ chọn tất cả'
                                : 'Chọn tất cả'}
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        type="text"
                        value={assigneeSearch}
                        onChange={(e) => setAssigneeSearch(e.target.value)}
                        placeholder="Lọc nhanh cán bộ theo họ tên hoặc email..."
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                      />

                      <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1.5 bg-slate-50">
                        {pickerCandidates.length === 0 ? (
                          <p className="text-slate-500 p-2 text-center">
                            Chưa có tài khoản phù hợp. Hãy bật &ldquo;Tất cả tài khoản&rdquo; để chọn mở rộng.
                          </p>
                        ) : (
                          pickerCandidates.map((u) => {
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
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAssignee(u.id)}
                                    className="w-4 h-4 rounded text-blue-600 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <p className="font-bold truncate">{u.fullName}</p>
                                    <p className="text-[10px] text-slate-500 truncate">
                                      {u.email || u.username}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-500 shrink-0">
                                  {u.assignedPortId ? PORT_LABEL[u.assignedPortId] : u.department}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>

                      {overlappingAssignees.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            Lưu ý trùng ngày trực: <strong>{overlappingAssignees.join('; ')}</strong>.
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Trạng thái ca</label>
                      <select
                        value={formState.status}
                        onChange={(e) => setFormState({ ...formState, status: e.target.value as ShiftStatus })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
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
                        className="w-full p-2.5 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-700 mb-1">Ghi chú bàn giao ca</label>
                      <textarea
                        rows={2}
                        value={formState.handoverNote}
                        onChange={(e) => setFormState({ ...formState, handoverNote: e.target.value })}
                        placeholder="Ghi nhận tình trạng bến, thiết bị, hồ sơ bàn giao..."
                        className="w-full p-2.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 bg-[#072b61] hover:bg-[#0c4a9c] disabled:opacity-60 text-white rounded-lg font-extrabold cursor-pointer"
                  >
                    {isSaving
                      ? 'Đang lưu...'
                      : editingShift
                      ? 'Lưu cập nhật'
                      : 'Thêm ca trực'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* MODAL XÁC NHẬN XÓA CA TRỰC (PORTAL) */}
      {shiftToDelete &&
        createPortal(
          <div
            onClick={() => !isDeleting && setShiftToDelete(null)}
            className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Xác nhận xóa ca trực</h3>
                  <p className="text-slate-600 mt-1 leading-relaxed">
                    Bạn có chắc muốn xóa ca trực <strong>{shiftToDelete.shiftName}</strong> ngày{' '}
                    <strong>{formatDate(getShiftDate(shiftToDelete))}</strong>? Thao tác này không ảnh hưởng đến quyền xử lý hồ sơ của cán bộ.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShiftToDelete(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg font-extrabold cursor-pointer"
                >
                  {isDeleting ? 'Đang xóa...' : 'Xóa ca trực'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
