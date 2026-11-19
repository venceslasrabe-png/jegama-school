import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileText,
  Layers,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from '../api';
import type {
  CycleHourlyRate,
  PayslipPaymentMethod,
  PayslipStatus,
  SchoolCycle,
  SchoolProgram,
  Teacher,
  TeacherContractType,
  TeacherPayslip,
  TeacherStatus,
} from '../types';
import {
  CYCLES,
  exportToCsv,
  formatDateFr,
  formatFcfa,
  processProfilePhotoFile,
  PROGRAMS,
} from '../utils/format';
import { PayslipModal, StudentAvatar } from './PrintableDocs';

type TeachersTab = 'donnees' | 'heures' | 'taux' | 'paye';

const CONTRACT_TYPES: TeacherContractType[] = ['Permanent', 'Vacataire', 'Contractuel'];
const PAYMENT_METHODS: PayslipPaymentMethod[] = ['Virement', 'Mobile Money', 'Espèces', 'Chèque'];

function getCurrentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const TeachersView: React.FC<{
  state: AppState;
  session: SessionUser;
  onRefresh: () => Promise<void>;
}> = ({ state, session, onRefresh }) => {
  const isReadOnly = session.role === 'direction';
  const canDeleteTeacher = session.role === 'admin' || session.role === 'secretariat';

  const [activeTab, setActiveTab] = useState<TeachersTab>('donnees');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Filters: Teachers directory
  const [searchTerm, setSearchTerm] = useState('');
  const [cycleFilter, setCycleFilter] = useState<string>('ALL');
  const [contractFilter, setContractFilter] = useState<string>('ALL');

  // Filters: Payroll & Cumulative Hours
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const firstSlip = state.teacherPayslips[0];
    return firstSlip?.month || getCurrentMonthValue();
  });
  const [payslipStatusFilter, setPayslipStatusFilter] = useState<'ALL' | PayslipStatus>('ALL');
  const [payslipSearch, setPayslipSearch] = useState('');
  const [hourTeacherFilter, setHourTeacherFilter] = useState<string>('ALL');

  // Teacher Modal (Create / Edit)
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [teacherForm, setTeacherForm] = useState<{
    firstName: string;
    lastName: string;
    gender: 'M' | 'F';
    phone: string;
    email: string;
    address: string;
    photoUrl: string;
    specialty: string;
    diploma: string;
    cycles: SchoolCycle[];
    programs: SchoolProgram[];
    contractType: TeacherContractType;
    hourlyRateFcfa: number;
    weeklyHoursQuota: number;
    baseBonusFcfa: number;
    cnssRatePercent: number;
    hireDate: string;
    bankOrMobileAccount: string;
    status: TeacherStatus;
  }>({
    firstName: '',
    lastName: '',
    gender: 'M',
    phone: '',
    email: '',
    address: 'Pointe-Noire',
    photoUrl: '',
    specialty: '',
    diploma: '',
    cycles: ['Collège'],
    programs: ['Congolais'],
    contractType: 'Permanent',
    hourlyRateFcfa: 5500,
    weeklyHoursQuota: 18,
    baseBonusFcfa: 0,
    cnssRatePercent: 0,
    hireDate: new Date().toISOString().slice(0, 10),
    bankOrMobileAccount: '',
    status: 'actif',
  });

  // Add Teacher Hours Modal
  const [showHourLogModal, setShowHourLogModal] = useState(false);
  const [hourLogForm, setHourLogForm] = useState<{
    teacherId: string;
    date: string;
    hours: number;
    classOrSubject: string;
    notes: string;
  }>({
    teacherId: state.teachers[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    hours: 2,
    classOrSubject: state.teachers[0]?.specialty || '',
    notes: '',
  });

  // Hourly Rate Edit Modal
  const [editingRate, setEditingRate] = useState<CycleHourlyRate | null>(null);
  const [applyRateToTeachers, setApplyRateToTeachers] = useState(true);

  // Individual Teacher Rate Quick-Edit Modal
  const [rateTargetTeacher, setRateTargetTeacher] = useState<Teacher | null>(null);
  const [quickRateForm, setQuickRateForm] = useState({
    hourlyRateFcfa: 5500,
    weeklyHoursQuota: 18,
    baseBonusFcfa: 0,
    cnssRatePercent: 0,
  });

  const getTeacherMonthCumul = (teacherId: string, month: string): number => {
    const logs = state.teacherHourLogs || [];
    const sum = logs
      .filter((l) => l.teacherId === teacherId && l.month === month)
      .reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
    return Math.round(sum * 100) / 100;
  };

  // Payslip Generator Modal
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [payslipForm, setPayslipForm] = useState<{
    teacherId: string;
    month: string;
    regularHours: number;
    overtimeHours: number;
    hourlyRateFcfa: number;
    overtimeRateFcfa: number;
    bonusesFcfa: number;
    bonusDetails: string;
    cnssRatePercent: number;
    advanceOrOtherDeductionFcfa: number;
    deductionDetails: string;
    paymentMethod: PayslipPaymentMethod;
    status: PayslipStatus;
  }>(() => {
    const first = state.teachers[0];
    const initMonth = state.teacherPayslips[0]?.month || getCurrentMonthValue();
    const firstLogged = first
      ? (state.teacherHourLogs || [])
          .filter((l) => l.teacherId === first.id && l.month === initMonth)
          .reduce((acc, l) => acc + (Number(l.hours) || 0), 0)
      : 0;
    return {
      teacherId: first?.id || '',
      month: initMonth,
      regularHours: firstLogged > 0 ? firstLogged : (first?.weeklyHoursQuota || 18) * 4,
      overtimeHours: 0,
      hourlyRateFcfa: first?.hourlyRateFcfa || 5500,
      overtimeRateFcfa: first?.hourlyRateFcfa || 5500,
      bonusesFcfa: 0,
      bonusDetails: '',
      cnssRatePercent: 0,
      advanceOrOtherDeductionFcfa: 0,
      deductionDetails: '',
      paymentMethod: 'Virement',
      status: 'valide',
    };
  });

  // Printable Payslip Modal
  const [viewingPayslip, setViewingPayslip] = useState<{
    payslip: TeacherPayslip;
    teacher: Teacher;
  } | null>(null);

  const activeTeachers = useMemo(
    () => state.teachers.filter((t) => t.status === 'actif'),
    [state.teachers]
  );

  const avgHourlyRate = useMemo(() => {
    if (activeTeachers.length === 0) return 0;
    const sum = activeTeachers.reduce((acc, t) => acc + t.hourlyRateFcfa, 0);
    return Math.round(sum / activeTeachers.length);
  }, [activeTeachers]);

  const monthHourLogs = useMemo(() => {
    return (state.teacherHourLogs || []).filter((l) => l.month === selectedMonth);
  }, [state.teacherHourLogs, selectedMonth]);

  const totalMonthCumulativeHours = useMemo(() => {
    const sum = monthHourLogs.reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [monthHourLogs]);

  const estimatedPayrollFromHours = useMemo(() => {
    return activeTeachers.reduce((acc, t) => {
      const cumul = monthHourLogs
        .filter((l) => l.teacherId === t.id)
        .reduce((s, l) => s + (Number(l.hours) || 0), 0);
      const hours = cumul > 0 ? cumul : t.weeklyHoursQuota * 4;
      return acc + Math.round(hours * t.hourlyRateFcfa);
    }, 0);
  }, [activeTeachers, monthHourLogs]);

  const monthPayslips = useMemo(() => {
    return state.teacherPayslips.filter((p) => p.month === selectedMonth);
  }, [state.teacherPayslips, selectedMonth]);

  const monthTotalNet = useMemo(
    () => monthPayslips.reduce((acc, p) => acc + p.netPayFcfa, 0),
    [monthPayslips]
  );

  const filteredTeachers = useMemo(() => {
    return state.teachers.filter((t) => {
      if (cycleFilter !== 'ALL' && !t.cycles.includes(cycleFilter as SchoolCycle)) return false;
      if (contractFilter !== 'ALL' && t.contractType !== contractFilter) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      return (
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
        t.matricule.toLowerCase().includes(q) ||
        t.specialty.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q)
      );
    });
  }, [state.teachers, cycleFilter, contractFilter, searchTerm]);

  const filteredPayslips = useMemo(() => {
    return state.teacherPayslips.filter((slip) => {
      if (selectedMonth && slip.month !== selectedMonth) return false;
      if (payslipStatusFilter !== 'ALL' && slip.status !== payslipStatusFilter) return false;
      if (!payslipSearch.trim()) return true;
      const q = payslipSearch.trim().toLowerCase();
      const teacher = state.teachers.find((t) => t.id === slip.teacherId);
      const teacherName = teacher ? `${teacher.lastName} ${teacher.firstName}`.toLowerCase() : '';
      return (
        slip.payslipNumber.toLowerCase().includes(q) ||
        teacherName.includes(q) ||
        (teacher?.matricule.toLowerCase().includes(q) ?? false)
      );
    });
  }, [state.teacherPayslips, state.teachers, selectedMonth, payslipStatusFilter, payslipSearch]);

  const suggestRateForCycleAndProgram = (cycles: SchoolCycle[], programs: SchoolProgram[]): number => {
    const firstCycle = cycles[0];
    const firstProg = programs[0];
    const found =
      state.hourlyRates.find((r) => r.cycle === firstCycle && r.program === firstProg) ||
      state.hourlyRates.find((r) => r.cycle === firstCycle);
    return found ? found.baseHourlyRateFcfa : 5500;
  };

  const openNewTeacherModal = () => {
    setEditingTeacher(null);
    setTeacherForm({
      firstName: '',
      lastName: '',
      gender: 'M',
      phone: '',
      email: '',
      address: 'Pointe-Noire',
      photoUrl: '',
      specialty: '',
      diploma: '',
      cycles: ['Collège'],
      programs: ['Congolais'],
      contractType: 'Permanent',
      hourlyRateFcfa: suggestRateForCycleAndProgram(['Collège'], ['Congolais']),
      weeklyHoursQuota: 18,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: new Date().toISOString().slice(0, 10),
      bankOrMobileAccount: '',
      status: 'actif',
    });
    setShowTeacherModal(true);
  };

  const openEditTeacherModal = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setTeacherForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      gender: teacher.gender,
      phone: teacher.phone,
      email: teacher.email,
      address: teacher.address,
      photoUrl: teacher.photoUrl,
      specialty: teacher.specialty,
      diploma: teacher.diploma,
      cycles: teacher.cycles,
      programs: teacher.programs,
      contractType: teacher.contractType,
      hourlyRateFcfa: teacher.hourlyRateFcfa,
      weeklyHoursQuota: teacher.weeklyHoursQuota,
      baseBonusFcfa: teacher.baseBonusFcfa,
      cnssRatePercent: teacher.cnssRatePercent,
      hireDate: teacher.hireDate,
      bankOrMobileAccount: teacher.bankOrMobileAccount,
      status: teacher.status,
    });
    setShowTeacherModal(true);
  };

  const openHourLogModalForTeacher = (teacher?: Teacher) => {
    const target = teacher || state.teachers[0];
    const defaultDate =
      selectedMonth === getCurrentMonthValue()
        ? new Date().toISOString().slice(0, 10)
        : `${selectedMonth}-15`;
    setHourLogForm({
      teacherId: target?.id || '',
      date: defaultDate,
      hours: 2,
      classOrSubject: target ? `${target.cycles[0] || ''} · ${target.specialty}` : '',
      notes: '',
    });
    setShowHourLogModal(true);
  };

  const openPayslipModalForTeacher = (teacher: Teacher) => {
    const targetMonth = selectedMonth || getCurrentMonthValue();
    const cumulHours = getTeacherMonthCumul(teacher.id, targetMonth);

    setPayslipForm({
      teacherId: teacher.id,
      month: targetMonth,
      regularHours: cumulHours > 0 ? cumulHours : teacher.weeklyHoursQuota * 4,
      overtimeHours: 0,
      hourlyRateFcfa: teacher.hourlyRateFcfa,
      overtimeRateFcfa: teacher.hourlyRateFcfa,
      bonusesFcfa: teacher.baseBonusFcfa || 0,
      bonusDetails: '',
      cnssRatePercent: teacher.cnssRatePercent || 0,
      advanceOrOtherDeductionFcfa: 0,
      deductionDetails: '',
      paymentMethod:
        teacher.bankOrMobileAccount.toLowerCase().includes('momo') ||
        teacher.bankOrMobileAccount.toLowerCase().includes('airtel')
          ? 'Mobile Money'
          : 'Virement',
      status: 'valide',
    });
    setShowPayslipModal(true);
  };

  const handleTeacherSelectInPayslip = (teacherId: string, monthOverride?: string) => {
    const teacher = state.teachers.find((t) => t.id === teacherId);
    if (!teacher) {
      setPayslipForm((prev) => ({ ...prev, teacherId }));
      return;
    }
    const targetMonth = monthOverride || payslipForm.month || selectedMonth || getCurrentMonthValue();
    const cumulHours = getTeacherMonthCumul(teacher.id, targetMonth);

    setPayslipForm((prev) => ({
      ...prev,
      teacherId: teacher.id,
      month: targetMonth,
      regularHours: cumulHours > 0 ? cumulHours : teacher.weeklyHoursQuota * 4,
      overtimeHours: 0,
      hourlyRateFcfa: teacher.hourlyRateFcfa,
      overtimeRateFcfa: teacher.hourlyRateFcfa,
      bonusesFcfa: teacher.baseBonusFcfa || 0,
      cnssRatePercent: teacher.cnssRatePercent || 0,
    }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await processProfilePhotoFile(file);
      setTeacherForm((prev) => ({ ...prev, photoUrl: dataUrl }));
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur chargement photo.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const toggleTeacherCycle = (cycle: SchoolCycle) => {
    setTeacherForm((prev) => {
      const exists = prev.cycles.includes(cycle);
      const next = exists
        ? prev.cycles.filter((c) => c !== cycle)
        : [...prev.cycles, cycle];
      const safeNext = next.length > 0 ? next : [cycle];
      return {
        ...prev,
        cycles: safeNext,
        hourlyRateFcfa: editingTeacher
          ? prev.hourlyRateFcfa
          : suggestRateForCycleAndProgram(safeNext, prev.programs),
      };
    });
  };

  const toggleTeacherProgram = (program: SchoolProgram) => {
    setTeacherForm((prev) => {
      const exists = prev.programs.includes(program);
      const next = exists
        ? prev.programs.filter((p) => p !== program)
        : [...prev.programs, program];
      const safeNext = next.length > 0 ? next : [program];
      return {
        ...prev,
        programs: safeNext,
        hourlyRateFcfa: editingTeacher
          ? prev.hourlyRateFcfa
          : suggestRateForCycleAndProgram(prev.cycles, safeNext),
      };
    });
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      if (editingTeacher) {
        await apiRequest(
          `/api/teachers/${editingTeacher.id}`,
          { method: 'PUT', body: JSON.stringify(teacherForm) },
          session
        );
        setFeedback({
          type: 'ok',
          text: `Fiche de ${teacherForm.firstName} ${teacherForm.lastName} mise à jour.`,
        });
      } else {
        await apiRequest(
          '/api/teachers',
          { method: 'POST', body: JSON.stringify(teacherForm) },
          session
        );
        setFeedback({
          type: 'ok',
          text: `Enseignant ${teacherForm.firstName} ${teacherForm.lastName} ajouté au corps enseignant.`,
        });
      }
      setShowTeacherModal(false);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/teachers/${teacher.id}`, { method: 'DELETE' }, session);
      setFeedback({
        type: 'ok',
        text: `Fiche enseignant ${teacher.lastName} ${teacher.firstName} supprimée.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Suppression impossible.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCycleRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRate) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ hourlyRate: CycleHourlyRate; syncedTeachersCount: number }>(
        `/api/hourly-rates/${editingRate.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            baseHourlyRateFcfa: editingRate.baseHourlyRateFcfa,
            overtimeHourlyRateFcfa: editingRate.overtimeHourlyRateFcfa,
            headTeacherMonthlyBonusFcfa: editingRate.headTeacherMonthlyBonusFcfa,
            applyToMatchingTeachers: applyRateToTeachers,
          }),
        },
        session
      );
      setFeedback({
        type: 'ok',
        text: `Barème ${editingRate.cycle} (${editingRate.program}) mis à jour${res.syncedTeachersCount > 0 ? ` et appliqué à ${res.syncedTeachersCount} enseignant(s)` : ''}.`,
      });
      setEditingRate(null);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur mise à jour barème.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveQuickTeacherRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateTargetTeacher) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/teachers/${rateTargetTeacher.id}`,
        { method: 'PUT', body: JSON.stringify(quickRateForm) },
        session
      );
      setFeedback({
        type: 'ok',
        text: `Taux horaire & conditions de ${rateTargetTeacher.lastName} ${rateTargetTeacher.firstName} mis à jour.`,
      });
      setRateTargetTeacher(null);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur mise à jour taux.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGeneratePayslip = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ payslip: TeacherPayslip }>(
        '/api/payslips',
        { method: 'POST', body: JSON.stringify(payslipForm) },
        session
      );
      setSelectedMonth(payslipForm.month);
      setShowPayslipModal(false);
      await onRefresh();
      const teacher = state.teachers.find((t) => t.id === payslipForm.teacherId);
      setFeedback({
        type: 'ok',
        text: `Bulletin de paye ${res.payslip.payslipNumber} généré (${formatFcfa(res.payslip.netPayFcfa)}).`,
      });
      if (teacher) {
        setViewingPayslip({ payslip: res.payslip, teacher });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur génération bulletin de paye.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleBatchGeneratePayslips = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ createdCount: number }>(
        '/api/payslips/batch',
        { method: 'POST', body: JSON.stringify({ month: selectedMonth }) },
        session
      );
      setFeedback({
        type: 'ok',
        text: `${res.createdCount} bulletin(s) de paye généré(s) pour ${selectedMonth}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la génération groupée.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUpdatePayslipStatus = async (slip: TeacherPayslip, status: PayslipStatus) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/payslips/${slip.id}/status`,
        { method: 'POST', body: JSON.stringify({ status }) },
        session
      );
      setFeedback({
        type: 'ok',
        text: `Bulletin ${slip.payslipNumber} marqué « ${status === 'paye' ? 'Payé' : 'Validé'} ».`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur mise à jour statut.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePayslip = async (slip: TeacherPayslip) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/payslips/${slip.id}`, { method: 'DELETE' }, session);
      setFeedback({
        type: 'ok',
        text: `Bulletin ${slip.payslipNumber} supprimé.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Suppression impossible.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddHourLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const month = hourLogForm.date.slice(0, 7) || selectedMonth;
      const res = await apiRequest<{ cumulativeHours: number }>(
        '/api/teacher-hours',
        { method: 'POST', body: JSON.stringify({ ...hourLogForm, month }) },
        session
      );
      const t = state.teachers.find((item) => item.id === hourLogForm.teacherId);
      setSelectedMonth(month);
      setShowHourLogModal(false);
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `+${hourLogForm.hours} h ajoutées pour ${t ? `${t.lastName} ${t.firstName}` : 'l’enseignant'} · Nouveau cumul (${month}) : ${res.cumulativeHours} h${t ? ` = ${formatFcfa(Math.round(res.cumulativeHours * t.hourlyRateFcfa))}` : ''}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’enregistrement des heures.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteHourLog = async (logId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/teacher-hours/${logId}`, { method: 'DELETE' }, session);
      setFeedback({ type: 'ok', text: 'Relevé d’heures supprimé et cumul recalculé.' });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Suppression impossible.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportPayrollCsv = () => {
    const headers = [
      'N° Bulletin',
      'Mois',
      'Matricule',
      'Enseignant',
      'Contrat',
      'Heures normales',
      'Heures supp.',
      'Taux horaire (FCFA)',
      'Salaire brut (FCFA)',
      'Retenue CNSS (FCFA)',
      'Autres retenues (FCFA)',
      'Net à payer (FCFA)',
      'Mode',
      'Statut',
    ];
    const rows = filteredPayslips.map((slip) => {
      const t = state.teachers.find((item) => item.id === slip.teacherId);
      return [
        slip.payslipNumber,
        slip.periodLabel,
        t?.matricule || '—',
        t ? `${t.lastName} ${t.firstName}` : slip.teacherId,
        t?.contractType || '—',
        slip.regularHours,
        slip.overtimeHours,
        slip.hourlyRateFcfa,
        slip.grossPayFcfa,
        slip.cnssDeductionFcfa,
        slip.advanceOrOtherDeductionFcfa,
        slip.netPayFcfa,
        slip.paymentMethod,
        slip.status,
      ];
    });
    exportToCsv(`paie-enseignants-${selectedMonth || 'complet'}.csv`, headers, rows);
  };

  // Live preview calculations inside Payslip modal
  const previewBasePay = Math.round(payslipForm.regularHours * payslipForm.hourlyRateFcfa);
  const previewOvertimePay = Math.round(payslipForm.overtimeHours * payslipForm.overtimeRateFcfa);
  const previewGross = previewBasePay + previewOvertimePay + Number(payslipForm.bonusesFcfa || 0);
  const previewCnss = Math.round((previewGross * Math.max(0, Number(payslipForm.cnssRatePercent || 0))) / 100);
  const previewNet = Math.max(
    0,
    previewGross - previewCnss - Math.max(0, Number(payslipForm.advanceOrOtherDeductionFcfa || 0))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Corps enseignants & Paie
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gestion des fiches enseignants, grille des taux horaires et édition des bulletins de paye en FCFA.
          </p>
        </div>
        {!isReadOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openNewTeacherModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nouvel enseignant
            </button>
            <button
              type="button"
              onClick={() => openHourLogModalForTeacher()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Clock className="w-4 h-4" />
              Saisir des heures
            </button>
            <button
              type="button"
              onClick={() => {
                if (state.teachers[0]) {
                  openPayslipModalForTeacher(state.teachers[0]);
                } else {
                  setFeedback({
                    type: 'err',
                    text: 'Ajoutez d’abord un enseignant avant d’éditer un bulletin de paye.',
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Wallet className="w-4 h-4" />
              Générer un bulletin de paye
            </button>
          </div>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 bg-white">
          <div className="text-xs font-medium text-slate-500">Enseignants actifs</div>
          <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {activeTeachers.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Sur {state.teachers.length} fiche(s) enregistrée(s)
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white">
          <div className="text-xs font-medium text-slate-500">Taux horaire moyen</div>
          <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-blue-900 tabular-nums">
            {formatFcfa(avgHourlyRate)}/h
          </div>
          <div className="mt-1 text-xs text-slate-500">Barème moyen actif</div>
        </div>

        <div className="p-4 sm:p-5 bg-white">
          <div className="text-xs font-medium text-slate-500">Cumul d’heures ({selectedMonth})</div>
          <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {totalMonthCumulativeHours} h
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {monthHourLogs.length} séance(s) / relevé(s) pointé(s)
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white">
          <div className="text-xs font-medium text-slate-500">Masse salariale ({selectedMonth})</div>
          <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-emerald-700 tabular-nums">
            {formatFcfa(monthTotalNet > 0 ? monthTotalNet : estimatedPayrollFromHours)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Cumul heures × Taux horaire
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg w-full sm:w-fit max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('donnees')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'donnees'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Données enseignants ({state.teachers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('heures')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'heures'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Cumul des heures ({totalMonthCumulativeHours} h)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('taux')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'taux'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Taux horaires & Barèmes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('paye')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'paye'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Bulletins de paye ({state.teacherPayslips.length})
        </button>
      </div>

      {/* TAB 1: DONNEES ENSEIGNANTS */}
      {activeTab === 'donnees' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par nom, matricule, spécialité..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <select
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">Tous les cycles</option>
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">Tous contrats</option>
              {CONTRACT_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {ct}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredTeachers.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-500">
                  Aucun enseignant ne correspond aux critères sélectionnés.
                </p>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={openNewTeacherModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un enseignant
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredTeachers.map((t) => (
                    <div key={t.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <StudentAvatar
                            photoUrl={t.photoUrl}
                            firstName={t.firstName}
                            lastName={t.lastName}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 text-sm truncate">
                              {t.lastName} {t.firstName}
                            </div>
                            <div className="text-xs font-mono text-slate-500">
                              {t.matricule} · {t.contractType}
                            </div>
                            <div className="text-xs text-slate-600 truncate">{t.specialty}</div>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            t.status === 'actif'
                              ? 'text-emerald-700'
                              : t.status === 'conge'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {t.status === 'actif'
                            ? 'Actif'
                            : t.status === 'conge'
                              ? 'En congé'
                              : 'Inactif'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div>
                          Cycles : <span className="font-medium text-slate-800">{t.cycles.join(', ')}</span> ({t.programs.join(' / ')})
                        </div>
                        {(() => {
                          const cumul = getTeacherMonthCumul(t.id, selectedMonth);
                          const effectiveHours = cumul > 0 ? cumul : t.weeklyHoursQuota * 4;
                          const salary = Math.round(effectiveHours * t.hourlyRateFcfa);
                          return (
                            <div className="flex flex-wrap justify-between gap-2 font-mono tabular-nums pt-0.5">
                              <span>
                                {effectiveHours} h × {formatFcfa(t.hourlyRateFcfa)}/h
                              </span>
                              <span className="font-bold text-emerald-700">
                                = {formatFcfa(salary)}
                              </span>
                            </div>
                          );
                        })()}
                        <div className="truncate">
                          Tél. {t.phone || '—'} · {t.bankOrMobileAccount || 'Caisse'}
                        </div>
                      </div>

                      {!isReadOnly && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditTeacherModal(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => openHourLogModalForTeacher(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-100"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            + Heures
                          </button>
                          <button
                            type="button"
                            onClick={() => openPayslipModalForTeacher(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            Bulletin de paye
                          </button>
                          {canDeleteTeacher && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeleteTeacher(t)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                        <th className="py-3 px-4 font-semibold">Enseignant & Matricule</th>
                        <th className="py-3 px-4 font-semibold">Spécialité & Contrat</th>
                        <th className="py-3 px-4 font-semibold text-right">Taux horaire</th>
                        <th className="py-3 px-4 font-semibold text-right">Cumul ({selectedMonth})</th>
                        <th className="py-3 px-4 font-semibold text-right">Salaire (Cumul × Taux)</th>
                        <th className="py-3 px-4 font-semibold">Statut</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTeachers.map((t) => {
                        const cumul = getTeacherMonthCumul(t.id, selectedMonth);
                        const effectiveHours = cumul > 0 ? cumul : t.weeklyHoursQuota * 4;
                        const salary = Math.round(effectiveHours * t.hourlyRateFcfa);
                        return (
                          <tr key={t.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <StudentAvatar
                                  photoUrl={t.photoUrl}
                                  firstName={t.firstName}
                                  lastName={t.lastName}
                                />
                                <div>
                                  <div className="font-semibold text-slate-900">
                                    {t.lastName} {t.firstName}
                                  </div>
                                  <div className="text-xs font-mono text-slate-500">
                                    {t.matricule} · {t.phone || 'Sans tél.'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-800">{t.specialty}</div>
                              <div className="text-xs text-slate-500">
                                {t.cycles.join(' · ')} · {t.contractType}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-blue-950 tabular-nums">
                              {formatFcfa(t.hourlyRateFcfa)}/h
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              <div className="font-semibold text-slate-900">{effectiveHours} h</div>
                              <div className="text-[11px] text-slate-400">
                                {cumul > 0 ? 'Pointé' : 'Quota mensuel'}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                              {formatFcfa(salary)}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-xs font-semibold ${
                                  t.status === 'actif'
                                    ? 'text-emerald-700'
                                    : t.status === 'conge'
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                                }`}
                              >
                                {t.status === 'actif'
                                  ? 'Actif'
                                  : t.status === 'conge'
                                    ? 'En congé'
                                    : 'Inactif'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {!isReadOnly && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openEditTeacherModal(t)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      Fiche
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openHourLogModalForTeacher(t)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-100"
                                    >
                                      <Clock className="w-3.5 h-3.5" />
                                      + Heures
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openPayslipModalForTeacher(t)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                                    >
                                      <Wallet className="w-3.5 h-3.5" />
                                      Payer
                                    </button>
                                    {canDeleteTeacher && (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleDeleteTeacher(t)}
                                        title="Supprimer cette fiche"
                                        className="p-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CUMUL DES HEURES & CALCUL SALAIRE */}
      {activeTab === 'heures' && (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Mois de calcul
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Filtrer par enseignant
                </label>
                <select
                  value={hourTeacherFilter}
                  onChange={(e) => setHourTeacherFilter(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">Tous les enseignants</option>
                  {state.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.lastName} {t.firstName} ({t.matricule})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700">
                Formule : <span className="font-bold text-blue-950">Cumul des heures × Taux horaire = Salaire</span>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => openHourLogModalForTeacher()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter des heures
                </button>
              )}
            </div>
          </div>

          {/* Summary per teacher: Cumul x Taux = Salaire */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Récapitulatif mensuel par enseignant ({selectedMonth})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chaque heure pointée s’ajoute au cumul du mois ; le salaire est calculé directement par Cumul × Taux horaire.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Enseignant</th>
                    <th className="py-3 px-4 font-semibold text-right">Séances saisies</th>
                    <th className="py-3 px-4 font-semibold text-right">Cumul des heures</th>
                    <th className="py-3 px-4 font-semibold text-right">Taux horaire</th>
                    <th className="py-3 px-4 font-semibold text-right">Salaire calculé</th>
                    {!isReadOnly && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.teachers
                    .filter((t) => hourTeacherFilter === 'ALL' || t.id === hourTeacherFilter)
                    .map((t) => {
                      const logsForTeacher = monthHourLogs.filter((l) => l.teacherId === t.id);
                      const cumul = logsForTeacher.reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
                      const roundedCumul = Math.round(cumul * 100) / 100;
                      const salary = Math.round(roundedCumul * t.hourlyRateFcfa);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {t.lastName} {t.firstName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t.matricule} · {t.specialty}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                            {logsForTeacher.length}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {roundedCumul} h
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-blue-950">
                            {formatFcfa(t.hourlyRateFcfa)}/h
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                            {formatFcfa(salary)}
                          </td>
                          {!isReadOnly && (
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openHourLogModalForTeacher(t)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-100"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Heures
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openPayslipModalForTeacher(t)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                                >
                                  <Wallet className="w-3.5 h-3.5" />
                                  Bulletin
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Journal of logged hours */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Journal détaillé des heures effectuées ({selectedMonth})
              </h2>
            </div>

            {monthHourLogs.filter((l) => hourTeacherFilter === 'ALL' || l.teacherId === hourTeacherFilter)
              .length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Aucune heure enregistrée pour ce mois. Cliquez sur « Ajouter des heures » pour démarrer le cumul.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-4 font-semibold">Enseignant</th>
                      <th className="py-2.5 px-4 font-semibold">Classe / Matière</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Heures</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Montant équiv.</th>
                      <th className="py-2.5 px-4 font-semibold">Observation</th>
                      {!isReadOnly && <th className="py-2.5 px-4 font-semibold text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthHourLogs
                      .filter((l) => hourTeacherFilter === 'ALL' || l.teacherId === hourTeacherFilter)
                      .map((log) => {
                        const t = state.teachers.find((item) => item.id === log.teacherId);
                        const equiv = t ? Math.round(log.hours * t.hourlyRateFcfa) : 0;
                        return (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                              {formatDateFr(log.date)}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              {t ? `${t.lastName} ${t.firstName}` : log.teacherId}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-700">{log.classOrSubject}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-950 tabular-nums">
                              +{log.hours} h
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-emerald-700 tabular-nums">
                              {formatFcfa(equiv)}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-500">{log.notes || '—'}</td>
                            {!isReadOnly && (
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDeleteHourLog(log.id)}
                                  title="Retirer cette entrée"
                                  className="p-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TAUX HORAIRES & BAREMES */}
      {activeTab === 'taux' && (
        <div className="space-y-6">
          {/* Official Rate Grid */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-900 shrink-0" />
                  Grille officielle des taux horaires par cycle & programme
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Barème de référence appliqué lors des recrutements ou synchronisable sur tout un cycle.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[660px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Cycle</th>
                    <th className="py-3 px-4 font-semibold">Programme</th>
                    <th className="py-3 px-4 font-semibold text-right">Taux horaire normal</th>
                    <th className="py-3 px-4 font-semibold text-right">Taux heures supp.</th>
                    <th className="py-3 px-4 font-semibold text-right">Prime Prof. Principal / mois</th>
                    {!isReadOnly && <th className="py-3 px-4 font-semibold text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.hourlyRates.map((rate) => (
                    <tr key={rate.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">{rate.cycle}</td>
                      <td className="py-3 px-4 text-slate-600">{rate.program}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-950 tabular-nums">
                        {formatFcfa(rate.baseHourlyRateFcfa)} / h
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-800 tabular-nums">
                        {formatFcfa(rate.overtimeHourlyRateFcfa)} / h
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                        {formatFcfa(rate.headTeacherMonthlyBonusFcfa)}
                      </td>
                      {!isReadOnly && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRate({ ...rate });
                              setApplyRateToTeachers(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Ajuster barème
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual Teacher Hourly Compensation Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-900 shrink-0" />
                  Taux horaires & salaire mensuel par cumul d’heures ({selectedMonth})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Règle de calcul appliquée : Salaire = Cumul des heures effectuées × Taux horaire.
                </p>
              </div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[740px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Enseignant</th>
                    <th className="py-3 px-4 font-semibold">Contrat</th>
                    <th className="py-3 px-4 font-semibold text-right">Taux horaire</th>
                    <th className="py-3 px-4 font-semibold text-right">Cumul heures ({selectedMonth})</th>
                    <th className="py-3 px-4 font-semibold text-right">Salaire (Cumul × Taux)</th>
                    {!isReadOnly && <th className="py-3 px-4 font-semibold text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.teachers.map((t) => {
                    const cumul = getTeacherMonthCumul(t.id, selectedMonth);
                    const effectiveHours = cumul > 0 ? cumul : t.weeklyHoursQuota * 4;
                    const salary = Math.round(effectiveHours * t.hourlyRateFcfa);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {t.lastName} {t.firstName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t.matricule} · {t.specialty}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">{t.contractType}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-950 tabular-nums">
                          {formatFcfa(t.hourlyRateFcfa)}/h
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <span className="font-semibold text-slate-900">{effectiveHours} h</span>
                          <span className="block text-[11px] text-slate-400">
                            {cumul > 0 ? 'Heures pointées' : `Base ${t.weeklyHoursQuota}h/sem`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatFcfa(salary)}
                        </td>
                        {!isReadOnly && (
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setRateTargetTeacher(t);
                                setQuickRateForm({
                                  hourlyRateFcfa: t.hourlyRateFcfa,
                                  weeklyHoursQuota: t.weeklyHoursQuota,
                                  baseBonusFcfa: t.baseBonusFcfa,
                                  cnssRatePercent: t.cnssRatePercent,
                                });
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                            >
                              Modifier taux
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BULLETINS DE PAYE */}
      {activeTab === 'paye' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 flex-1">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
              />
              <select
                value={payslipStatusFilter}
                onChange={(e) =>
                  setPayslipStatusFilter(e.target.value as 'ALL' | PayslipStatus)
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">Tous statuts</option>
                <option value="brouillon">Brouillons</option>
                <option value="valide">Validés</option>
                <option value="paye">Payés</option>
              </select>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={payslipSearch}
                  onChange={(e) => setPayslipSearch(e.target.value)}
                  placeholder="N° bulletin ou nom enseignant..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportPayrollCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    disabled={busy || !selectedMonth}
                    onClick={handleBatchGeneratePayslips}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] disabled:opacity-50 rounded-lg whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Générer la paie du mois
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (state.teachers[0]) {
                        openPayslipModalForTeacher(state.teachers[0]);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Bulletin individuel
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredPayslips.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-500">
                  Aucun bulletin de paye pour la période et les filtres sélectionnés.
                </p>
                {!isReadOnly && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleBatchGeneratePayslips}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
                  >
                    Générer la paie pour {selectedMonth}
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredPayslips.map((slip) => {
                    const teacher = state.teachers.find((t) => t.id === slip.teacherId);
                    return (
                      <div key={slip.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-xs font-bold text-blue-950">
                              {slip.payslipNumber} · {slip.periodLabel}
                            </div>
                            <div className="font-semibold text-slate-900 text-sm">
                              {teacher ? `${teacher.lastName} ${teacher.firstName}` : slip.teacherId}
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              slip.status === 'paye'
                                ? 'text-emerald-700'
                                : slip.status === 'valide'
                                  ? 'text-blue-900'
                                  : 'text-amber-700'
                            }`}
                          >
                            {slip.status === 'paye'
                              ? 'Payé'
                              : slip.status === 'valide'
                                ? 'Validé'
                                : 'Brouillon'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono tabular-nums">
                          <div>
                            <span className="text-slate-500 font-sans">Cumul :</span>{' '}
                            {slip.regularHours + slip.overtimeHours} h
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500 font-sans">Taux :</span>{' '}
                            {formatFcfa(slip.hourlyRateFcfa)}/h
                          </div>
                          <div>
                            <span className="text-slate-500 font-sans">Salaire :</span>{' '}
                            {formatFcfa(slip.basePayFcfa)}
                          </div>
                          <div className="text-right font-bold text-emerald-700">
                            Net : {formatFcfa(slip.netPayFcfa)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {teacher && (
                            <button
                              type="button"
                              onClick={() => setViewingPayslip({ payslip: slip, teacher })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Bulletin PDF
                            </button>
                          )}
                          {!isReadOnly && slip.status === 'brouillon' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleUpdatePayslipStatus(slip, 'valide')}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md"
                            >
                              Valider
                            </button>
                          )}
                          {!isReadOnly && slip.status !== 'paye' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleUpdatePayslipStatus(slip, 'paye')}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-md"
                            >
                              Marquer payé
                            </button>
                          )}
                          {!isReadOnly && slip.status !== 'paye' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeletePayslip(slip)}
                              className="px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-md"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[840px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                        <th className="py-3 px-4 font-semibold">N° Bulletin</th>
                        <th className="py-3 px-4 font-semibold">Enseignant</th>
                        <th className="py-3 px-4 font-semibold text-right">Cumul heures</th>
                        <th className="py-3 px-4 font-semibold text-right">Taux horaire</th>
                        <th className="py-3 px-4 font-semibold text-right">Salaire (Cumul × Taux)</th>
                        <th className="py-3 px-4 font-semibold text-right">Net à payer</th>
                        <th className="py-3 px-4 font-semibold">Statut</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPayslips.map((slip) => {
                        const teacher = state.teachers.find((t) => t.id === slip.teacherId);
                        const totalHours = slip.regularHours + slip.overtimeHours;
                        return (
                          <tr key={slip.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <div className="font-mono font-bold text-blue-950">
                                {slip.payslipNumber}
                              </div>
                              <div className="text-xs text-slate-500">{slip.periodLabel}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">
                                {teacher
                                  ? `${teacher.lastName} ${teacher.firstName}`
                                  : slip.teacherId}
                              </div>
                              <div className="text-xs text-slate-500">
                                {teacher?.matricule} · {slip.paymentMethod}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-800">
                              {totalHours} h
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-blue-950">
                              {formatFcfa(slip.hourlyRateFcfa)}/h
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                              {formatFcfa(slip.basePayFcfa)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                              {formatFcfa(slip.netPayFcfa)}
                            </td>
                            <td className="py-3 px-4">
                              <div
                                className={`text-xs font-semibold ${
                                  slip.status === 'paye'
                                    ? 'text-emerald-700'
                                    : slip.status === 'valide'
                                      ? 'text-blue-900'
                                      : 'text-amber-700'
                                }`}
                              >
                                {slip.status === 'paye'
                                  ? 'Payé'
                                  : slip.status === 'valide'
                                    ? 'Validé'
                                    : 'Brouillon'}
                              </div>
                              {slip.paidAt && (
                                <div className="text-[11px] text-slate-400">
                                  Le {formatDateFr(slip.paidAt)}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {teacher && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingPayslip({ payslip: slip, teacher })}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-100"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Bulletin
                                  </button>
                                )}
                                {!isReadOnly && slip.status === 'brouillon' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleUpdatePayslipStatus(slip, 'valide')}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                                  >
                                    Valider
                                  </button>
                                )}
                                {!isReadOnly && slip.status !== 'paye' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleUpdatePayslipStatus(slip, 'paye')}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                                  >
                                    Payer
                                  </button>
                                )}
                                {!isReadOnly && slip.status !== 'paye' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleDeletePayslip(slip)}
                                    title="Supprimer"
                                    className="p-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
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
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT TEACHER */}
      {showTeacherModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveTeacher}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5 my-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editingTeacher
                  ? `Modifier fiche · ${editingTeacher.matricule}`
                  : 'Nouvel enseignant · Corps enseignant'}
              </h3>
              <button
                type="button"
                onClick={() => setShowTeacherModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Photo & Identity */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <StudentAvatar
                photoUrl={teacherForm.photoUrl}
                firstName={teacherForm.firstName || 'E'}
                lastName={teacherForm.lastName || 'N'}
                sizeClass="w-16 h-20"
              />
              <div className="space-y-1.5 flex-1">
                <div className="text-xs font-semibold text-slate-700">
                  Photo de profil enseignant (optionnelle)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-white border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingPhoto ? 'Chargement...' : 'Importer photo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  {teacherForm.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setTeacherForm((p) => ({ ...p, photoUrl: '' }))}
                      className="text-xs text-red-600 font-medium"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nom</label>
                <input
                  type="text"
                  required
                  value={teacherForm.lastName}
                  onChange={(e) => setTeacherForm({ ...teacherForm, lastName: e.target.value })}
                  placeholder="EX. KENGUE"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom(s)</label>
                <input
                  type="text"
                  required
                  value={teacherForm.firstName}
                  onChange={(e) => setTeacherForm({ ...teacherForm, firstName: e.target.value })}
                  placeholder="Ex. Hervé"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={teacherForm.phone}
                  onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                  placeholder="+242 06 ..."
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={teacherForm.email}
                  onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                  placeholder="nom@jegama-school.cg"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Spécialité / Matière enseignée
                </label>
                <input
                  type="text"
                  required
                  value={teacherForm.specialty}
                  onChange={(e) => setTeacherForm({ ...teacherForm, specialty: e.target.value })}
                  placeholder="Ex. Mathématiques, Physique-Chimie"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Diplôme / Qualification
                </label>
                <input
                  type="text"
                  value={teacherForm.diploma}
                  onChange={(e) => setTeacherForm({ ...teacherForm, diploma: e.target.value })}
                  placeholder="Ex. Master CAPES"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Cycles & Programs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Cycles d’intervention
                </div>
                <div className="flex flex-wrap gap-2">
                  {CYCLES.map((c) => (
                    <label key={c} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={teacherForm.cycles.includes(c)}
                        onChange={() => toggleTeacherCycle(c)}
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Programmes</div>
                <div className="flex flex-wrap gap-3">
                  {PROGRAMS.map((p) => (
                    <label key={p} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={teacherForm.programs.includes(p)}
                        onChange={() => toggleTeacherProgram(p)}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Remuneration & Contract */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Type de contrat
                </label>
                <select
                  value={teacherForm.contractType}
                  onChange={(e) =>
                    setTeacherForm({
                      ...teacherForm,
                      contractType: e.target.value as TeacherContractType,
                      cnssRatePercent: e.target.value === 'Vacataire' ? 0 : teacherForm.cnssRatePercent,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CONTRACT_TYPES.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Taux horaire (FCFA/h)
                </label>
                <input
                  type="number"
                  min={500}
                  step={250}
                  required
                  value={teacherForm.hourlyRateFcfa}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, hourlyRateFcfa: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Volume hebdo (heures)
                </label>
                <input
                  type="number"
                  min={1}
                  max={45}
                  required
                  value={teacherForm.weeklyHoursQuota}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, weeklyHoursQuota: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prime mensuelle fixe (FCFA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={teacherForm.baseBonusFcfa}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, baseBonusFcfa: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Retenue CNSS (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={0.5}
                  value={teacherForm.cnssRatePercent}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, cnssRatePercent: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Statut</label>
                <select
                  value={teacherForm.status}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, status: e.target.value as TeacherStatus })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="actif">Actif</option>
                  <option value="conge">En congé</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Compte bancaire / Mobile Money
                </label>
                <input
                  type="text"
                  value={teacherForm.bankOrMobileAccount}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, bankOrMobileAccount: e.target.value })
                  }
                  placeholder="MTN MoMo / BGFI Bank / Caisse"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date d’embauche
                </label>
                <input
                  type="date"
                  value={teacherForm.hireDate}
                  onChange={(e) => setTeacherForm({ ...teacherForm, hireDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowTeacherModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                {busy ? 'Enregistrement...' : editingTeacher ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDIT CYCLE HOURLY RATE */}
      {editingRate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveCycleRate}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Barème horaire · {editingRate.cycle} ({editingRate.program})
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Taux horaire normal (FCFA/h)
                </label>
                <input
                  type="number"
                  min={500}
                  step={250}
                  required
                  value={editingRate.baseHourlyRateFcfa}
                  onChange={(e) =>
                    setEditingRate({
                      ...editingRate,
                      baseHourlyRateFcfa: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Taux heures supplémentaires (FCFA/h)
                </label>
                <input
                  type="number"
                  min={500}
                  step={250}
                  required
                  value={editingRate.overtimeHourlyRateFcfa}
                  onChange={(e) =>
                    setEditingRate({
                      ...editingRate,
                      overtimeHourlyRateFcfa: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prime mensuelle Professeur Principal (FCFA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  required
                  value={editingRate.headTeacherMonthlyBonusFcfa}
                  onChange={(e) =>
                    setEditingRate({
                      ...editingRate,
                      headTeacherMonthlyBonusFcfa: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyRateToTeachers}
                  onChange={(e) => setApplyRateToTeachers(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Appliquer immédiatement ce nouveau taux horaire normal aux enseignants actifs de ce cycle & programme.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingRate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
              >
                Enregistrer barème
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: QUICK EDIT INDIVIDUAL TEACHER RATE */}
      {rateTargetTeacher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveQuickTeacherRate}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Taux individuel · {rateTargetTeacher.lastName} {rateTargetTeacher.firstName}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Taux horaire (FCFA/h)
                </label>
                <input
                  type="number"
                  min={500}
                  step={250}
                  required
                  value={quickRateForm.hourlyRateFcfa}
                  onChange={(e) =>
                    setQuickRateForm({ ...quickRateForm, hourlyRateFcfa: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Volume horaire hebdomadaire (h)
                </label>
                <input
                  type="number"
                  min={1}
                  max={45}
                  required
                  value={quickRateForm.weeklyHoursQuota}
                  onChange={(e) =>
                    setQuickRateForm({ ...quickRateForm, weeklyHoursQuota: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prime mensuelle fixe (FCFA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={quickRateForm.baseBonusFcfa}
                  onChange={(e) =>
                    setQuickRateForm({ ...quickRateForm, baseBonusFcfa: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cotisation sociale CNSS (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={0.5}
                  value={quickRateForm.cnssRatePercent}
                  onChange={(e) =>
                    setQuickRateForm({ ...quickRateForm, cnssRatePercent: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRateTargetTeacher(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: LOG TEACHER HOURS */}
      {showHourLogModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleAddHourLog}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Enregistrer des heures de cours
              </h3>
              <button
                type="button"
                onClick={() => setShowHourLogModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enseignant
                </label>
                <select
                  required
                  value={hourLogForm.teacherId}
                  onChange={(e) => {
                    const t = state.teachers.find((item) => item.id === e.target.value);
                    setHourLogForm({
                      ...hourLogForm,
                      teacherId: e.target.value,
                      classOrSubject: t ? `${t.cycles[0] || ''} · ${t.specialty}` : '',
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {state.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.lastName} {t.firstName} ({formatFcfa(t.hourlyRateFcfa)}/h)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={hourLogForm.date}
                    onChange={(e) => setHourLogForm({ ...hourLogForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre d’heures effectuées
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    max={250}
                    step={0.5}
                    required
                    value={hourLogForm.hours}
                    onChange={(e) =>
                      setHourLogForm({ ...hourLogForm, hours: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Classe / Matière
                </label>
                <input
                  type="text"
                  value={hourLogForm.classOrSubject}
                  onChange={(e) =>
                    setHourLogForm({ ...hourLogForm, classOrSubject: e.target.value })
                  }
                  placeholder="Ex. Collège · Mathématiques"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observation (optionnelle)
                </label>
                <input
                  type="text"
                  value={hourLogForm.notes}
                  onChange={(e) => setHourLogForm({ ...hourLogForm, notes: e.target.value })}
                  placeholder="Ex. Semaine 3, TP, remplacement..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {(() => {
                const t = state.teachers.find((item) => item.id === hourLogForm.teacherId);
                if (!t) return null;
                const month = hourLogForm.date.slice(0, 7) || selectedMonth;
                const currentCumul = getTeacherMonthCumul(t.id, month);
                const newCumul = Math.round((currentCumul + (Number(hourLogForm.hours) || 0)) * 100) / 100;
                const newSalary = Math.round(newCumul * t.hourlyRateFcfa);
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Cumul actuel ({month}) :</span>
                      <span className="font-mono font-semibold">{currentCumul} h</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-semibold">
                      <span>Nouveau cumul après saisie :</span>
                      <span className="font-mono">{newCumul} h × {formatFcfa(t.hourlyRateFcfa)}/h</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-bold pt-1 border-t border-slate-200">
                      <span>Salaire correspondant :</span>
                      <span className="font-mono">{formatFcfa(newSalary)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowHourLogModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                {busy ? 'Enregistrement...' : 'Ajouter au cumul'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: GENERATE PAYSLIP */}
      {showPayslipModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleGeneratePayslip}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Éditer un bulletin de paye enseignant
                </h3>
                <p className="text-xs text-slate-500">
                  Salaire = Cumul des heures du mois × Taux horaire.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayslipModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enseignant
                </label>
                <select
                  required
                  value={payslipForm.teacherId}
                  onChange={(e) => handleTeacherSelectInPayslip(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {state.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.lastName} {t.firstName} ({t.matricule})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mois de paie
                </label>
                <input
                  type="month"
                  required
                  value={payslipForm.month}
                  onChange={(e) => handleTeacherSelectInPayslip(payslipForm.teacherId, e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Cumul des heures du mois (h)
                  </label>
                  {(() => {
                    const logged = getTeacherMonthCumul(payslipForm.teacherId, payslipForm.month);
                    return logged > 0 ? (
                      <button
                        type="button"
                        onClick={() => setPayslipForm({ ...payslipForm, regularHours: logged })}
                        className="text-[11px] font-mono font-semibold text-blue-900 hover:underline"
                      >
                        Pointé : {logged} h
                      </button>
                    ) : null;
                  })()}
                </div>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  required
                  value={payslipForm.regularHours}
                  onChange={(e) =>
                    setPayslipForm({ ...payslipForm, regularHours: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Taux horaire (FCFA/h)
                </label>
                <input
                  type="number"
                  min={0}
                  step={250}
                  required
                  value={payslipForm.hourlyRateFcfa}
                  onChange={(e) =>
                    setPayslipForm({ ...payslipForm, hourlyRateFcfa: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mode de règlement
                </label>
                <select
                  value={payslipForm.paymentMethod}
                  onChange={(e) =>
                    setPayslipForm({
                      ...payslipForm,
                      paymentMethod: e.target.value as PayslipPaymentMethod,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Statut initial
                </label>
                <select
                  value={payslipForm.status}
                  onChange={(e) =>
                    setPayslipForm({ ...payslipForm, status: e.target.value as PayslipStatus })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="brouillon">Brouillon</option>
                  <option value="valide">Validé pour paiement</option>
                  <option value="paye">Payé immédiatement</option>
                </select>
              </div>
            </div>

            <details className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <summary className="text-xs font-semibold text-slate-700 cursor-pointer">
                Options complémentaires : primes exceptionnelles ou retenues / avances (0 FCFA par défaut)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Primes (FCFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={payslipForm.bonusesFcfa}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, bonusesFcfa: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    CNSS (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    step={0.5}
                    value={payslipForm.cnssRatePercent}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, cnssRatePercent: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Avances / Retenues (FCFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={payslipForm.advanceOrOtherDeductionFcfa}
                    onChange={(e) =>
                      setPayslipForm({
                        ...payslipForm,
                        advanceOrOtherDeductionFcfa: Number(e.target.value),
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            </details>

            {/* Live Calculation Preview */}
            <div className="bg-[#0B1933] text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-[#E5A923] uppercase tracking-wider">
                  Calcul du salaire
                </div>
                <div className="text-xs font-mono text-slate-200 mt-1 tabular-nums">
                  {payslipForm.regularHours} h × {formatFcfa(payslipForm.hourlyRateFcfa)}/h ={' '}
                  {formatFcfa(previewBasePay)}
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-[11px] text-slate-300">Salaire Net à payer</div>
                <div className="text-xl font-mono font-extrabold text-white tabular-nums">
                  {formatFcfa(previewNet)}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowPayslipModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                {busy ? 'Génération...' : 'Émettre le bulletin de paye'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRINTABLE PAYSLIP MODAL */}
      {viewingPayslip && (
        <PayslipModal
          payslip={viewingPayslip.payslip}
          teacher={viewingPayslip.teacher}
          settings={state.settings}
          onClose={() => setViewingPayslip(null)}
        />
      )}
    </div>
  );
};
