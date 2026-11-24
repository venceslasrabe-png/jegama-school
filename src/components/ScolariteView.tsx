import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Camera,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldOff,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from '../api';
import {
  buildReminderMessageText,
  computeStudentRecoveryProfile,
  evaluateStudentAutoFollowUp,
  getDefaultCollectionAutomation,
} from '../shared/schoolEngine';
import type {
  CollectionAutomationSettings,
  CollectionReminder,
  FeeGridItem,
  ParentTutor,
  Payment,
  ReminderChannel,
  ReminderStatus,
  SchoolCycle,
  SchoolProgram,
  Student,
  StudentFollowUpPlan,
  StudentRecoveryProfile,
} from '../types';
import {
  CYCLES,
  exportToCsv,
  formatDateFr,
  formatDateTimeFr,
  formatFcfa,
  processProfilePhotoFile,
  PROGRAMS,
} from '../utils/format';
import {
  ReceiptModal,
  ReminderNoticeModal,
  StudentAvatar,
  StudentCardModal,
} from './PrintableDocs';

type ScolariteTab = 'dossiers' | 'caisse' | 'recouvrement' | 'parents' | 'tarifs';

const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  relance_1: '1ère relance',
  relance_2: '2ème relance',
  mise_en_demeure: 'Mise en demeure',
  moratoire: 'Moratoire accordé',
  resolu: 'Régularisé',
};

const REMINDER_CHANNELS: ReminderChannel[] = [
  'Appel téléphonique',
  'SMS / WhatsApp',
  'Courrier / Convocation',
  'Email',
];

const AUTO_CHANNEL_LABELS: Record<CollectionAutomationSettings['primaryChannel'], string> = {
  whatsapp_et_email: 'WhatsApp + E-mail',
  whatsapp: 'WhatsApp uniquement',
  email: 'E-mail uniquement',
};

export const ScolariteView: React.FC<{
  state: AppState;
  session: SessionUser;
  initialTab?: ScolariteTab;
  onOpenNotesValidation?: () => void;
  onRefresh: () => Promise<void>;
}> = ({ state, session, initialTab, onOpenNotesValidation, onRefresh }) => {
  const isCaisse = session.role === 'caisse';
  const canModifyScolarite = session.role === 'scolarite' || session.role === 'admin';
  const canCollectCaisse = session.role === 'caisse' || session.role === 'scolarite' || session.role === 'admin';
  const isReadOnly = session.role === 'direction' || session.role === 'secretariat';

  const [activeTab, setActiveTab] = useState<ScolariteTab>(
    initialTab || (isCaisse ? 'caisse' : 'dossiers')
  );

  React.useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [search, setSearch] = useState('');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modals
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [reinscrireStudent, setReinscrireStudent] = useState<Student | null>(null);
  const [cardStudent, setCardStudent] = useState<Student | null>(null);
  const [collectTarget, setCollectTarget] = useState<{
    student: Student;
    suggestedAmount: number;
    trancheLabel: string;
    notificationId?: string;
  } | null>(null);
  const [receiptModal, setReceiptModal] = useState<{ payment: Payment; student: Student } | null>(
    null
  );
  const [showParentModal, setShowParentModal] = useState(false);
  const [editingParent, setEditingParent] = useState<ParentTutor | null>(null);
  const [editingFee, setEditingFee] = useState<FeeGridItem | null>(null);

  // Recouvrement filters & modals
  const [recoveryFilter, setRecoveryFilter] = useState<
    'unpaid' | 'overdue' | 'moratoire' | 'solde' | 'all'
  >('unpaid');
  const [reminderTarget, setReminderTarget] = useState<{
    student: Student;
    profile: StudentRecoveryProfile;
  } | null>(null);
  const [reminderForm, setReminderForm] = useState<{
    channel: ReminderChannel;
    status: ReminderStatus;
    promisedDate: string;
    notes: string;
  }>({
    channel: 'Appel téléphonique',
    status: 'relance_1',
    promisedDate: '',
    notes: '',
  });
  const [noticeModal, setNoticeModal] = useState<{
    student: Student;
    profile: StudentRecoveryProfile;
    latestReminder?: CollectionReminder;
  } | null>(null);

  // WhatsApp / Email automation & quick-send state
  const currentAutoSettings = useMemo(
    () => state.settings.collectionAutomation || getDefaultCollectionAutomation(),
    [state.settings.collectionAutomation]
  );
  const [autoConfigOpen, setAutoConfigOpen] = useState(false);
  const [autoForm, setAutoForm] = useState<CollectionAutomationSettings>(currentAutoSettings);
  React.useEffect(() => {
    setAutoForm(currentAutoSettings);
  }, [currentAutoSettings]);

  const [lastDispatchResult, setLastDispatchResult] = useState<{
    title: string;
    dispatchedCount: number;
    whatsappLinks: Array<{ studentId: string; studentName: string; phone: string; url: string }>;
    emailLinks: Array<{ studentId: string; studentName: string; email: string; url: string }>;
  } | null>(null);

  const [messageTarget, setMessageTarget] = useState<{
    student: Student;
    parent?: ParentTutor;
    profile: StudentRecoveryProfile;
    plan: StudentFollowUpPlan;
  } | null>(null);
  const [messageForm, setMessageForm] = useState<{
    channel: 'whatsapp_et_email' | 'whatsapp' | 'email';
    customMessage: string;
    status: ReminderStatus;
    sentWhatsappUrl: string | null;
    sentMailtoUrl: string | null;
  }>({
    channel: 'whatsapp_et_email',
    customMessage: '',
    status: 'relance_1',
    sentWhatsappUrl: null,
    sentMailtoUrl: null,
  });

  // Enroll form state
  const [enrollForm, setEnrollForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '2015-05-10',
    birthPlace: 'Pointe-Noire',
    gender: 'F' as 'M' | 'F',
    photoUrl: '',
    cycle: 'Primaire' as SchoolCycle,
    program: 'Congolais' as SchoolProgram,
    classId: '',
    parentMode: 'existing' as 'existing' | 'new',
    parentId: state.parents[0]?.id || '',
    newParentName: '',
    newParentPhone: '',
    newParentEmail: '',
    newParentAddress: '',
    newParentCode: '',
  });
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Payment form state
  const [payForm, setPayForm] = useState({
    amountPaid: 0,
    method: 'Espèces' as Payment['method'],
    trancheLabel: '1ère Tranche',
    notes: '',
  });

  // Parent form state
  const [parentForm, setParentForm] = useState({
    fullName: '',
    phone: '+242 06 ',
    email: '',
    address: 'Pointe-Noire',
    accessCode: '',
  });

  const getStudentBalance = (student: Student) => {
    const fee = state.feeGrid.find(
      (f) => f.cycle === student.cycle && f.program === student.program
    );
    const expected = fee ? fee.registrationFee + fee.annualTuition : 250000;
    const paid = state.payments
      .filter((p) => p.studentId === student.id)
      .reduce((sum, p) => sum + p.amountPaid, 0);
    const remaining = Math.max(0, expected - paid);
    const status = remaining === 0 ? 'solde' : paid > 0 ? 'partiel' : 'impaye';
    return { expected, paid, remaining, status };
  };

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.students.filter((stu) => {
      const bal = getStudentBalance(stu);
      if (cycleFilter !== 'all' && stu.cycle !== cycleFilter) return false;
      if (paymentFilter !== 'all' && bal.status !== paymentFilter) return false;
      if (!q) return true;
      return (
        stu.firstName.toLowerCase().includes(q) ||
        stu.lastName.toLowerCase().includes(q) ||
        stu.cardId.toLowerCase().includes(q)
      );
    });
  }, [state.students, state.payments, state.feeGrid, search, cycleFilter, paymentFilter]);

  const unpaidStudents = useMemo(() => {
    return state.students
      .map((s) => ({ student: s, balance: getStudentBalance(s) }))
      .filter((item) => item.balance.remaining > 0);
  }, [state.students, state.payments, state.feeGrid]);

  const latestReminderByStudent = useMemo(() => {
    const map = new Map<string, CollectionReminder>();
    for (const r of state.collectionReminders || []) {
      const prev = map.get(r.studentId);
      if (!prev || new Date(r.sentAt).getTime() >= new Date(prev.sentAt).getTime()) {
        map.set(r.studentId, r);
      }
    }
    return map;
  }, [state.collectionReminders]);

  const recoveryRows = useMemo(() => {
    const active = state.students.filter((s) => s.status !== 'archive');
    return active
      .map((student) => {
        const profile = computeStudentRecoveryProfile(
          { feeGrid: state.feeGrid, payments: state.payments },
          student
        );
        const followUpPlan = evaluateStudentAutoFollowUp(
          {
            feeGrid: state.feeGrid,
            payments: state.payments,
            collectionReminders: state.collectionReminders,
            settings: state.settings,
          },
          student
        );
        const parent = state.parents.find((p) => p.id === student.parentId);
        const schoolClass = state.classes.find((c) => c.id === student.classId);
        const latestReminder = latestReminderByStudent.get(student.id);
        return { student, profile, followUpPlan, parent, schoolClass, latestReminder };
      })
      .sort((a, b) => {
        if (b.profile.overdueFcfa !== a.profile.overdueFcfa) {
          return b.profile.overdueFcfa - a.profile.overdueFcfa;
        }
        return b.profile.remaining - a.profile.remaining;
      });
  }, [
    state.students,
    state.feeGrid,
    state.payments,
    state.collectionReminders,
    state.settings,
    state.parents,
    state.classes,
    latestReminderByStudent,
  ]);

  const recoveryStats = useMemo(() => {
    let totalExpected = 0;
    let totalCollected = 0;
    let totalRemaining = 0;
    let totalOverdue = 0;
    let overdueCount = 0;
    let activeMoratoiresCount = 0;
    let initialAlertDueCount = 0;
    let j3FollowUpDueCount = 0;

    for (const row of recoveryRows) {
      totalExpected += row.profile.expected;
      totalCollected += row.profile.paid;
      totalRemaining += row.profile.remaining;
      if (row.profile.overdueFcfa > 0) {
        totalOverdue += row.profile.overdueFcfa;
        overdueCount += 1;
      }
      if (row.profile.remaining > 0 && row.latestReminder?.status === 'moratoire') {
        activeMoratoiresCount += 1;
      }
      if (row.followUpPlan.actionNeeded === 'initial_alert') {
        initialAlertDueCount += 1;
      } else if (row.followUpPlan.actionNeeded === 'followup_j3') {
        j3FollowUpDueCount += 1;
      }
    }

    const collectionRate =
      totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    return {
      totalExpected,
      totalCollected,
      totalRemaining,
      totalOverdue,
      overdueCount,
      activeMoratoiresCount,
      initialAlertDueCount,
      j3FollowUpDueCount,
      pendingAutoTotal: initialAlertDueCount + j3FollowUpDueCount,
      collectionRate,
      totalReminders: (state.collectionReminders || []).length,
    };
  }, [recoveryRows, state.collectionReminders]);

  const filteredRecoveryRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recoveryRows.filter(({ student, profile, parent, latestReminder }) => {
      if (cycleFilter !== 'all' && student.cycle !== cycleFilter) return false;
      if (recoveryFilter === 'unpaid' && profile.remaining <= 0) return false;
      if (recoveryFilter === 'overdue' && profile.overdueFcfa <= 0) return false;
      if (
        recoveryFilter === 'moratoire' &&
        !(profile.remaining > 0 && latestReminder?.status === 'moratoire')
      ) {
        return false;
      }
      if (recoveryFilter === 'solde' && profile.remaining > 0) return false;

      if (!q) return true;
      return (
        student.firstName.toLowerCase().includes(q) ||
        student.lastName.toLowerCase().includes(q) ||
        student.cardId.toLowerCase().includes(q) ||
        (parent?.fullName || '').toLowerCase().includes(q)
      );
    });
  }, [recoveryRows, search, cycleFilter, recoveryFilter]);

  const cycleRecoveryBreakdown = useMemo(() => {
    return CYCLES.map((cycle) => {
      const items = recoveryRows.filter((r) => r.student.cycle === cycle);
      const expected = items.reduce((s, r) => s + r.profile.expected, 0);
      const paid = items.reduce((s, r) => s + r.profile.paid, 0);
      const remaining = items.reduce((s, r) => s + r.profile.remaining, 0);
      const overdue = items.reduce((s, r) => s + r.profile.overdueFcfa, 0);
      const rate = expected > 0 ? Math.round((paid / expected) * 100) : 0;
      return { cycle, count: items.length, expected, paid, remaining, overdue, rate };
    }).filter((item) => item.count > 0);
  }, [recoveryRows]);

  const pendingNotifications = state.paymentNotifications.filter(
    (n) => n.status === 'en_attente'
  );
  const pendingGradesCount =
    state.summary.pendingGradesCount ??
    state.grades.filter((g) => g.validationStatus === 'en_attente').length;

  const handleEnrollPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    try {
      const compressed = await processProfilePhotoFile(file);
      setEnrollForm((prev) => ({ ...prev, photoUrl: compressed }));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Erreur de chargement de la photo.');
    }
  };

  const handleEditPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editingStudent) return;
    setPhotoError(null);
    try {
      const compressed = await processProfilePhotoFile(file);
      setEditingStudent((prev) => (prev ? { ...prev, photoUrl: compressed } : null));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Erreur de chargement de la photo.');
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const payload =
        enrollForm.parentMode === 'existing'
          ? {
              firstName: enrollForm.firstName,
              lastName: enrollForm.lastName,
              birthDate: enrollForm.birthDate,
              birthPlace: enrollForm.birthPlace,
              gender: enrollForm.gender,
              photoUrl: enrollForm.photoUrl || undefined,
              cycle: enrollForm.cycle,
              program: enrollForm.program,
              classId: enrollForm.classId || null,
              parentId: enrollForm.parentId,
            }
          : {
              firstName: enrollForm.firstName,
              lastName: enrollForm.lastName,
              birthDate: enrollForm.birthDate,
              birthPlace: enrollForm.birthPlace,
              gender: enrollForm.gender,
              photoUrl: enrollForm.photoUrl || undefined,
              cycle: enrollForm.cycle,
              program: enrollForm.program,
              classId: enrollForm.classId || null,
              newParent: {
                fullName: enrollForm.newParentName,
                phone: enrollForm.newParentPhone,
                email: enrollForm.newParentEmail,
                address: enrollForm.newParentAddress,
                accessCode: enrollForm.newParentCode,
              },
            };

      const res = await apiRequest<{ student: Student }>(
        '/api/students',
        { method: 'POST', body: JSON.stringify(payload) },
        session
      );
      await onRefresh();
      setShowEnrollModal(false);
      setPhotoError(null);
      setEnrollForm({
        ...enrollForm,
        firstName: '',
        lastName: '',
        photoUrl: '',
        newParentName: '',
        newParentPhone: '',
        newParentEmail: '',
        newParentAddress: '',
        newParentCode: '',
      });
      setFeedback({
        type: 'ok',
        text: `Élève inscrit avec succès. Carte attribuée : ${res.student.cardId}. Notification envoyée à la Caisse.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’inscription.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setBusy(true);
    try {
      await apiRequest(
        `/api/students/${editingStudent.id}`,
        { method: 'PUT', body: JSON.stringify(editingStudent) },
        session
      );
      await onRefresh();
      setEditingStudent(null);
      setFeedback({ type: 'ok', text: 'Dossier élève mis à jour.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de mise à jour.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReinscrire = async (student: Student, nextCycle: SchoolCycle, nextClassId: string) => {
    setBusy(true);
    try {
      await apiRequest(
        `/api/students/${student.id}/reinscrire`,
        {
          method: 'POST',
          body: JSON.stringify({
            nextCycle,
            nextClassId: nextClassId || null,
            nextAcademicYear: state.settings.currentAcademicYear,
          }),
        },
        session
      );
      await onRefresh();
      setReinscrireStudent(null);
      setFeedback({
        type: 'ok',
        text: `${student.firstName} ${student.lastName} réinscrit(e) sans ressaisie. Notification envoyée à la Caisse.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la réinscription.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReplaceCard = async (student: Student) => {
    setBusy(true);
    try {
      const res = await apiRequest<{ student: Student; oldCardId: string; newCardId: string }>(
        `/api/students/${student.id}/replace-card`,
        { method: 'POST', body: JSON.stringify({ reason: 'Carte déclarée perdue' }) },
        session
      );
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Ancienne carte ${res.oldCardId} désactivée. Nouvelle carte attribuée : ${res.newCardId} (historique conservé).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors du remplacement de carte.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectTarget) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ payment: Payment }>(
        '/api/payments',
        {
          method: 'POST',
          body: JSON.stringify({
            studentId: collectTarget.student.id,
            amountPaid: Number(payForm.amountPaid),
            method: payForm.method,
            trancheLabel: payForm.trancheLabel,
            notes: payForm.notes,
            notificationId: collectTarget.notificationId,
          }),
        },
        session
      );
      await onRefresh();
      const stu = collectTarget.student;
      setCollectTarget(null);
      setReceiptModal({ payment: res.payment, student: stu });
      setFeedback({
        type: 'ok',
        text: `Encaissement validé. Reçu ${res.payment.receiptNumber} émis.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’encaissement.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest(
        '/api/parents',
        { method: 'POST', body: JSON.stringify(parentForm) },
        session
      );
      await onRefresh();
      setShowParentModal(false);
      setParentForm({
        fullName: '',
        phone: '+242 06 ',
        email: '',
        address: 'Pointe-Noire',
        accessCode: '',
      });
      setFeedback({ type: 'ok', text: 'Parent / tuteur enregistré.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur d’enregistrement.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateParent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParent) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/parents/${editingParent.id}`,
        { method: 'PUT', body: JSON.stringify(editingParent) },
        session
      );
      await onRefresh();
      setEditingParent(null);
      setFeedback({ type: 'ok', text: 'Coordonnées parent mises à jour.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de mise à jour.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFee) return;
    setBusy(true);
    try {
      await apiRequest(
        `/api/fee-grid/${editingFee.id}`,
        { method: 'PUT', body: JSON.stringify(editingFee) },
        session
      );
      await onRefresh();
      setEditingFee(null);
      setFeedback({ type: 'ok', text: 'Grille tarifaire mise à jour.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de mise à jour tarifaire.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportUnpaidCsv = () => {
    const headers = ['ID Carte', 'Élève', 'Cycle', 'Programme', 'Parent', 'Téléphone', 'Attendu (FCFA)', 'Payé (FCFA)', 'Restant dû (FCFA)'];
    const rows = unpaidStudents.map(({ student, balance }) => {
      const parent = state.parents.find((p) => p.id === student.parentId);
      return [
        student.cardId,
        `${student.lastName} ${student.firstName}`,
        student.cycle,
        student.program,
        parent?.fullName || '—',
        parent?.phone || '—',
        balance.expected,
        balance.paid,
        balance.remaining,
      ];
    });
    exportToCsv(`impayes-jegama-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const handleExportRecoveryCsv = () => {
    const headers = [
      'Carte',
      'Élève',
      'Cycle',
      'Classe',
      'Parent',
      'Téléphone',
      'Attendu (FCFA)',
      'Payé (FCFA)',
      'Échu en retard (FCFA)',
      'Jours retard',
      'Reste à payer (FCFA)',
      'Prochaine échéance',
      'Dernière relance',
      'Date moratoire',
    ];
    const rows = filteredRecoveryRows.map(({ student, profile, parent, schoolClass, latestReminder }) => [
      student.cardId,
      `${student.lastName} ${student.firstName}`,
      student.cycle,
      schoolClass?.name || '—',
      parent?.fullName || '—',
      parent?.phone || '—',
      profile.expected,
      profile.paid,
      profile.overdueFcfa,
      profile.daysOverdue,
      profile.remaining,
      profile.nextDueDate || 'Soldé',
      latestReminder ? REMINDER_STATUS_LABELS[latestReminder.status] : 'Aucune',
      latestReminder?.promisedDate || '—',
    ]);
    exportToCsv(`recouvrement-jegama-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const openReminderModal = (student: Student, profile: StudentRecoveryProfile) => {
    const latest = latestReminderByStudent.get(student.id);
    const nextStatus: ReminderStatus =
      latest?.status === 'relance_1'
        ? 'relance_2'
        : latest?.status === 'relance_2'
          ? 'mise_en_demeure'
          : 'relance_1';
    const defaultPromise = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setReminderForm({
      channel: 'Appel téléphonique',
      status: nextStatus,
      promisedDate: defaultPromise,
      notes:
        profile.overdueFcfa > 0
          ? `Relance pour solde échu de ${formatFcfa(profile.overdueFcfa)} (${profile.nextDueLabel || 'tranche échue'}).`
          : `Rappel d’échéance à venir (${profile.nextDueLabel || 'scolarité'}).`,
    });
    setReminderTarget({ student, profile });
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTarget) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest<{ reminder: CollectionReminder }>(
        '/api/recouvrement/reminders',
        {
          method: 'POST',
          body: JSON.stringify({
            studentId: reminderTarget.student.id,
            channel: reminderForm.channel,
            status: reminderForm.status,
            promisedDate: reminderForm.status === 'moratoire' ? reminderForm.promisedDate : null,
            notes: reminderForm.notes,
          }),
        },
        session
      );
      await onRefresh();
      const targetName = `${reminderTarget.student.firstName} ${reminderTarget.student.lastName}`;
      const statusLabel = REMINDER_STATUS_LABELS[reminderForm.status];
      setReminderTarget(null);
      setFeedback({
        type: 'ok',
        text: `${statusLabel} enregistrée pour ${targetName}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’enregistrement de la relance.',
      });
    } finally {
      setBusy(false);
    }
  };

  const openMessageModal = (
    student: Student,
    profile: StudentRecoveryProfile,
    parent: ParentTutor | undefined,
    plan: StudentFollowUpPlan
  ) => {
    const delayDays = Math.max(1, Number(currentAutoSettings.followUpDelayDays) || 3);
    const step = plan.nextStep > 0 ? plan.nextStep : 1;
    const defaultStatus: ReminderStatus =
      plan.nextStatus === 'resolu' ? 'relance_1' : plan.nextStatus;
    const defaultMsg = buildReminderMessageText({
      student,
      parent,
      profile,
      schoolName: state.settings.schoolName,
      step,
      delayDays,
    });
    const hasEmail = Boolean((parent?.email || '').trim());
    const hasPhone = Boolean((parent?.whatsappPhone || parent?.phone || '').trim());
    const initialChannel: 'whatsapp_et_email' | 'whatsapp' | 'email' =
      hasPhone && hasEmail
        ? currentAutoSettings.primaryChannel
        : hasEmail
          ? 'email'
          : 'whatsapp';

    setMessageForm({
      channel: initialChannel,
      customMessage: defaultMsg,
      status: defaultStatus,
      sentWhatsappUrl: null,
      sentMailtoUrl: null,
    });
    setMessageTarget({ student, parent, profile, plan });
  };

  const handleSendMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageTarget) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        reminders: CollectionReminder[];
        whatsappUrl: string | null;
        mailtoUrl: string | null;
      }>(
        '/api/recouvrement/send-message',
        {
          method: 'POST',
          body: JSON.stringify({
            studentId: messageTarget.student.id,
            channel: messageForm.channel,
            customMessage: messageForm.customMessage,
            status: messageForm.status,
          }),
        },
        session
      );
      await onRefresh();
      setMessageForm((prev) => ({
        ...prev,
        sentWhatsappUrl: res.whatsappUrl,
        sentMailtoUrl: res.mailtoUrl,
      }));
      const targetName = `${messageTarget.student.firstName} ${messageTarget.student.lastName}`;
      setLastDispatchResult({
        title: `Envoi enregistré pour ${targetName}`,
        dispatchedCount: res.reminders.length,
        whatsappLinks: res.whatsappUrl
          ? [
              {
                studentId: messageTarget.student.id,
                studentName: targetName,
                phone: messageTarget.parent?.whatsappPhone || messageTarget.parent?.phone || '',
                url: res.whatsappUrl,
              },
            ]
          : [],
        emailLinks: res.mailtoUrl
          ? [
              {
                studentId: messageTarget.student.id,
                studentName: targetName,
                email: messageTarget.parent?.email || '',
                url: res.mailtoUrl,
              },
            ]
          : [],
      });
      setFeedback({
        type: 'ok',
        text: `${res.reminders.length} notification(s) enregistrée(s) pour ${targetName}. Utilisez les liens directs ci-dessous pour ouvrir WhatsApp / E-mail.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’envoi du message.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRunAutoFollowUp = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        dispatchedCount: number;
        reminders: CollectionReminder[];
        whatsappLinks: Array<{ studentId: string; studentName: string; phone: string; url: string }>;
        emailLinks: Array<{ studentId: string; studentName: string; email: string; url: string }>;
      }>(
        '/api/recouvrement/run-auto',
        { method: 'POST', body: JSON.stringify({}) },
        session
      );
      await onRefresh();
      if (res.dispatchedCount === 0) {
        setLastDispatchResult(null);
        setFeedback({
          type: 'ok',
          text: `Aucun nouvel avis ou relance J+${currentAutoSettings.followUpDelayDays} à expédier pour le moment.`,
        });
      } else {
        setLastDispatchResult({
          title: `Traitement automatique J+0 / J+${currentAutoSettings.followUpDelayDays}`,
          dispatchedCount: res.dispatchedCount,
          whatsappLinks: res.whatsappLinks,
          emailLinks: res.emailLinks,
        });
        setFeedback({
          type: 'ok',
          text: `${res.dispatchedCount} notification(s) WhatsApp / E-mail enregistrée(s) et programmée(s).`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’exécution automatique.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAutomationSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        '/api/recouvrement/automation-settings',
        { method: 'PUT', body: JSON.stringify(autoForm) },
        session
      );
      await onRefresh();
      setAutoConfigOpen(false);
      setFeedback({
        type: 'ok',
        text: `Règle de relance mise à jour (relance automatique à J+${autoForm.followUpDelayDays}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de sauvegarde des paramètres.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Sub-tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Scolarité, Caisse & Recouvrement
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Inscriptions, encaissements FCFA, suivi des échéances et relances de recouvrement.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start w-full sm:w-auto overflow-x-auto max-w-full">
          {(
            [
              { id: 'dossiers', label: 'Dossiers & Inscriptions' },
              {
                id: 'caisse',
                label:
                  pendingNotifications.length > 0
                    ? `Caisse (${pendingNotifications.length})`
                    : 'Caisse & Reçus',
              },
              {
                id: 'recouvrement',
                label:
                  recoveryStats.overdueCount > 0
                    ? `Recouvrement (${recoveryStats.overdueCount})`
                    : 'Recouvrement',
              },
              { id: 'parents', label: 'Parents & Tuteurs' },
              { id: 'tarifs', label: 'Grille tarifaire' },
            ] as Array<{ id: ScolariteTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {canModifyScolarite && pendingGradesCount > 0 && onOpenNotesValidation && (
        <div className="p-3.5 sm:p-4 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-950">
            <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="font-mono tabular-nums">{pendingGradesCount}</strong> fiche(s) de
              notes enregistrée(s) par les enseignants sont en attente de validation par la
              Scolarité.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenNotesValidation}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Ouvrir la file de validation
          </button>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-4 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* TAB 1: DOSSIERS & INSCRIPTIONS */}
      {activeTab === 'dossiers' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
              <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom ou ID carte..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <select
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                aria-label="Filtrer par cycle"
                className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">Tous les cycles</option>
                {CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                aria-label="Filtrer par statut de paiement"
                className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">Tous statuts scolarité</option>
                <option value="solde">Soldé</option>
                <option value="partiel">Partiel</option>
                <option value="impaye">Impayé</option>
              </select>
            </div>

            {canModifyScolarite && !isReadOnly && (
              <button
                type="button"
                onClick={() => setShowEnrollModal(true)}
                className="w-full lg:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                Nouvelle inscription
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Student Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aucun dossier élève ne correspond aux critères sélectionnés.
                </div>
              ) : (
                filteredStudents.map((stu) => {
                  const cls = state.classes.find((c) => c.id === stu.classId);
                  const parent = state.parents.find((p) => p.id === stu.parentId);
                  const bal = getStudentBalance(stu);

                  return (
                    <div key={stu.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <StudentAvatar
                            photoUrl={stu.photoUrl}
                            firstName={stu.firstName}
                            lastName={stu.lastName}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {stu.lastName} {stu.firstName}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              {stu.cardId} · {cls ? cls.name : 'Non affecté'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {stu.cycle} · {stu.program}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {bal.status === 'solde' && (
                            <span className="text-xs font-semibold text-emerald-700">Soldé</span>
                          )}
                          {bal.status === 'partiel' && (
                            <span className="text-xs font-semibold text-amber-700">Partiel</span>
                          )}
                          {bal.status === 'impaye' && (
                            <span className="text-xs font-semibold text-red-700">Impayé</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <div className="text-slate-600 truncate">
                          Parent : <span className="font-medium text-slate-800">{parent?.fullName || '—'}</span>
                        </div>
                        <div className="font-mono tabular-nums text-slate-900 font-semibold">
                          {formatFcfa(bal.paid)} / {formatFcfa(bal.expected)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCardStudent(stu)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                        >
                          Carte
                        </button>
                        {canCollectCaisse && !isReadOnly && bal.remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayForm({
                                amountPaid: Math.min(bal.remaining, 100000),
                                method: 'Espèces',
                                trancheLabel: 'Versement scolarité',
                                notes: '',
                              });
                              setCollectTarget({
                                student: stu,
                                suggestedAmount: bal.remaining,
                                trancheLabel: 'Versement scolarité',
                              });
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
                          >
                            Encaisser
                          </button>
                        )}
                        {canModifyScolarite && !isReadOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingStudent(stu)}
                              title="Modifier le dossier"
                              className="p-2 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setReinscrireStudent(stu)}
                              title="Réinscrire sans ressaisie"
                              className="p-2 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleReplaceCard(stu)}
                              title="Déclarer carte perdue et réémettre un nouvel ID (RG-01)"
                              className="p-2 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-50"
                            >
                              <ShieldOff className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Élève & ID Carte</th>
                    <th className="py-3 px-4 font-semibold">Cycle · Classe</th>
                    <th className="py-3 px-4 font-semibold">Parent / Tuteur</th>
                    <th className="py-3 px-4 font-semibold text-right">Payé / Attendu</th>
                    <th className="py-3 px-4 font-semibold">Statut</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                        Aucun dossier élève ne correspond aux critères sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((stu) => {
                      const cls = state.classes.find((c) => c.id === stu.classId);
                      const parent = state.parents.find((p) => p.id === stu.parentId);
                      const bal = getStudentBalance(stu);

                      return (
                        <tr key={stu.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <StudentAvatar
                                photoUrl={stu.photoUrl}
                                firstName={stu.firstName}
                                lastName={stu.lastName}
                              />
                              <div>
                                <div className="font-semibold text-slate-900">
                                  {stu.lastName} {stu.firstName}
                                </div>
                                <div className="text-xs text-slate-500 font-mono">
                                  {stu.cardId}
                                  {stu.cardStatus !== 'active' && (
                                    <span className="text-red-700 font-sans font-semibold ml-1.5">
                                      · Carte {stu.cardStatus}
                                    </span>
                                  )}
                                  {stu.status === 'archive' && (
                                    <span className="text-amber-700 font-sans font-semibold ml-1.5">
                                      · À réinscrire ({stu.academicYear})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">
                              {cls ? cls.name : 'Non affecté'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {stu.cycle} · {stu.program}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-800">{parent?.fullName || '—'}</div>
                            <div className="text-xs text-slate-500 font-mono">
                              {parent?.phone || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <div className="font-semibold text-slate-900">
                              {formatFcfa(bal.paid)}
                            </div>
                            <div className="text-xs text-slate-500">
                              sur {formatFcfa(bal.expected)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {bal.status === 'solde' && (
                              <span className="text-xs font-semibold text-emerald-700">
                                Soldé
                              </span>
                            )}
                            {bal.status === 'partiel' && (
                              <span className="text-xs font-semibold text-amber-700">
                                Partiel (reste {formatFcfa(bal.remaining)})
                              </span>
                            )}
                            {bal.status === 'impaye' && (
                              <span className="text-xs font-semibold text-red-700">
                                Impayé ({formatFcfa(bal.remaining)})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setCardStudent(stu)}
                                title="Voir / imprimer la carte scolaire"
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
                              >
                                Carte
                              </button>
                              {canCollectCaisse && !isReadOnly && bal.remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayForm({
                                      amountPaid: Math.min(bal.remaining, 100000),
                                      method: 'Espèces',
                                      trancheLabel: 'Versement scolarité',
                                      notes: '',
                                    });
                                    setCollectTarget({
                                      student: stu,
                                      suggestedAmount: bal.remaining,
                                      trancheLabel: 'Versement scolarité',
                                    });
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 whitespace-nowrap"
                                >
                                  Encaisser
                                </button>
                              )}
                              {canModifyScolarite && !isReadOnly && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setEditingStudent(stu)}
                                    title="Modifier le dossier"
                                    className="p-1.5 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReinscrireStudent(stu)}
                                    title="Réinscrire sans ressaisie"
                                    className="p-1.5 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleReplaceCard(stu)}
                                    title="Déclarer carte perdue et réémettre un nouvel ID (RG-01)"
                                    className="p-1.5 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-50"
                                  >
                                    <ShieldOff className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CAISSE & ENCAISSEMENTS */}
      {activeTab === 'caisse' && (
        <div className="space-y-6">
          {/* Pending notifications */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-4">
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Notifications de paiement en attente ({pendingNotifications.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Déclenchées automatiquement à chaque inscription (RG-02)
              </span>
            </div>

            {pendingNotifications.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                Toutes les notifications d’inscription ont été encaissées.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingNotifications.map((notif) => {
                  const stu = state.students.find((s) => s.id === notif.studentId);
                  return (
                    <div
                      key={notif.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {stu && (
                          <StudentAvatar
                            photoUrl={stu.photoUrl}
                            firstName={stu.firstName}
                            lastName={stu.lastName}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm">
                            {notif.studentName}{' '}
                            <span className="font-mono text-xs text-slate-500">
                              · {notif.cardId}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">{notif.reason}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Émis par {notif.createdBy} le {formatDateTimeFr(notif.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                        <div className="text-left sm:text-right">
                          <div className="text-[11px] text-slate-400">Montant attendu</div>
                          <div className="font-mono font-bold text-amber-800 text-sm tabular-nums">
                            {formatFcfa(notif.amountExpected)}
                          </div>
                        </div>
                        {canCollectCaisse && !isReadOnly && stu && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayForm({
                                amountPaid: notif.amountExpected,
                                method: 'Espèces',
                                trancheLabel: notif.reason,
                                notes: '',
                              });
                              setCollectTarget({
                                student: stu,
                                suggestedAmount: notif.amountExpected,
                                trancheLabel: notif.reason,
                                notificationId: notif.id,
                              });
                            }}
                            className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                          >
                            Encaisser & Émettre reçu
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Receipt History & Unpaid List */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-900 shrink-0" />
                  Historique des reçus ({state.payments.length})
                </h2>
              </div>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-sm min-w-[540px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 text-left">
                      <th className="py-2 font-medium">N° Reçu</th>
                      <th className="py-2 font-medium">Élève</th>
                      <th className="py-2 font-medium">Mode</th>
                      <th className="py-2 font-medium text-right">Montant</th>
                      <th className="py-2 font-medium text-right">Reçu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.payments.map((pay) => {
                      const stu = state.students.find((s) => s.id === pay.studentId);
                      return (
                        <tr key={pay.id} className="hover:bg-slate-50">
                          <td className="py-2.5 font-mono text-xs font-semibold text-blue-950">
                            {pay.receiptNumber}
                            <div className="text-[11px] font-sans font-normal text-slate-400">
                              {formatDateFr(pay.paidAt)}
                            </div>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              {stu && (
                                <StudentAvatar
                                  photoUrl={stu.photoUrl}
                                  firstName={stu.firstName}
                                  lastName={stu.lastName}
                                  sizeClass="w-8 h-8"
                                />
                              )}
                              <div>
                                <div className="font-medium text-slate-900">
                                  {stu ? `${stu.lastName} ${stu.firstName}` : '—'}
                                </div>
                                <div className="text-xs text-slate-500 truncate max-w-[180px]">
                                  {pay.trancheLabel}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-xs text-slate-600">{pay.method}</td>
                          <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatFcfa(pay.amountPaid)}
                          </td>
                          <td className="py-2.5 text-right">
                            {stu && (
                              <button
                                type="button"
                                onClick={() => setReceiptModal({ payment: pay, student: stu })}
                                className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-100"
                              >
                                Imprimer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Dossiers avec solde dû ({unpaidStudents.length})
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('recouvrement')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                  >
                    Suivi recouvrement
                  </button>
                  <button
                    type="button"
                    onClick={handleExportUnpaidCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {unpaidStudents.map(({ student, balance }) => {
                  const parent = state.parents.find((p) => p.id === student.parentId);
                  return (
                    <div key={student.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {student.lastName} {student.firstName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {parent?.fullName} · {parent?.phone}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-bold text-red-700 tabular-nums">
                          {formatFcfa(balance.remaining)}
                        </div>
                        {canCollectCaisse && !isReadOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayForm({
                                amountPaid: balance.remaining,
                                method: 'Espèces',
                                trancheLabel: 'Régularisation solde',
                                notes: '',
                              });
                              setCollectTarget({
                                student,
                                suggestedAmount: balance.remaining,
                                trancheLabel: 'Régularisation solde',
                              });
                            }}
                            className="text-[11px] font-semibold text-blue-900 hover:underline mt-0.5"
                          >
                            Encaisser
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: RECOUVREMENT & RELANCES */}
      {activeTab === 'recouvrement' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">Total restant à recouvrer</div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-slate-900 tabular-nums">
                {formatFcfa(recoveryStats.totalRemaining)}
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                Sur {formatFcfa(recoveryStats.totalExpected)} attendus
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">Montant échu en retard</div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-red-700 tabular-nums">
                {formatFcfa(recoveryStats.totalOverdue)}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {recoveryStats.overdueCount} dossier(s) à échéance dépassée
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">Taux de recouvrement</div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-emerald-700 tabular-nums">
                {recoveryStats.collectionRate}%
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                {formatFcfa(recoveryStats.totalCollected)} encaissés
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">Relances & Moratoires</div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-blue-900 tabular-nums">
                {recoveryStats.totalReminders}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {recoveryStats.activeMoratoiresCount} moratoire(s) · {recoveryStats.pendingAutoTotal} à relancer
              </div>
            </div>
          </div>

          {/* WhatsApp / E-mail & Relance automatique J+3 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-900 shrink-0" />
                  Notifications WhatsApp / E-mail & Relance automatique J+
                  {currentAutoSettings.followUpDelayDays}
                </h2>
                <p className="text-xs text-slate-600">
                  Envoi auto dès retard ({currentAutoSettings.autoNotifyOnOverdue ? 'Activé' : 'En pause'})
                  {' · '}Canal : <span className="font-semibold text-slate-800">{AUTO_CHANNEL_LABELS[currentAutoSettings.primaryChannel]}</span>
                  {' · '}Relance sans paiement à <span className="font-mono font-semibold text-slate-800">J+{currentAutoSettings.followUpDelayDays}</span>
                  {' · '}Max <span className="font-mono">{currentAutoSettings.maxAutoReminders}</span> rappels
                  {currentAutoSettings.lastAutoRunAt && (
                    <span className="text-slate-400">
                      {' · '}Dernier envoi : {formatDateTimeFr(currentAutoSettings.lastAutoRunAt)}
                    </span>
                  )}
                </p>
                <p className="text-xs font-medium">
                  {recoveryStats.pendingAutoTotal > 0 ? (
                    <span className="text-amber-800">
                      <span className="font-mono font-bold tabular-nums">{recoveryStats.initialAlertDueCount}</span> 1er(s) avis
                      {' + '}
                      <span className="font-mono font-bold tabular-nums">{recoveryStats.j3FollowUpDueCount}</span> relance(s) J+
                      {currentAutoSettings.followUpDelayDays} prêt(s) à expédier.
                    </span>
                  ) : (
                    <span className="text-emerald-700">
                      Tous les dossiers en retard ont déjà reçu leur avis ou sont sous moratoire actif.
                    </span>
                  )}
                </p>
              </div>

              {canCollectCaisse && !isReadOnly && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRunAutoFollowUp}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] rounded-lg whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5 text-[#E5A923]" />
                    Lancer les envois & relances (J+{currentAutoSettings.followUpDelayDays})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoConfigOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Configurer J+{currentAutoSettings.followUpDelayDays}
                  </button>
                </div>
              )}
            </div>

            {autoConfigOpen && canCollectCaisse && !isReadOnly && (
              <form
                onSubmit={handleSaveAutomationSettings}
                className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
              >
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 sm:col-span-2 lg:col-span-1 py-2">
                  <input
                    type="checkbox"
                    checked={autoForm.autoNotifyOnOverdue}
                    onChange={(e) =>
                      setAutoForm({ ...autoForm, autoNotifyOnOverdue: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-900"
                  />
                  Envoi automatique actif
                </label>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Canal prioritaire
                  </label>
                  <select
                    value={autoForm.primaryChannel}
                    onChange={(e) =>
                      setAutoForm({
                        ...autoForm,
                        primaryChannel: e.target.value as CollectionAutomationSettings['primaryChannel'],
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="whatsapp_et_email">WhatsApp + E-mail</option>
                    <option value="whatsapp">WhatsApp uniquement</option>
                    <option value="email">E-mail uniquement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Délai relance (jours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={autoForm.followUpDelayDays}
                    onChange={(e) =>
                      setAutoForm({
                        ...autoForm,
                        followUpDelayDays: Math.max(1, Number(e.target.value) || 3),
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Max relances auto
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={autoForm.maxAutoReminders}
                    onChange={(e) =>
                      setAutoForm({
                        ...autoForm,
                        maxAutoReminders: Math.max(1, Number(e.target.value) || 3),
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoConfigOpen(false)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Fermer
                  </button>
                </div>
              </form>
            )}

            {lastDispatchResult && (
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900">
                    {lastDispatchResult.title} ·{' '}
                    <span className="font-mono text-emerald-700">
                      {lastDispatchResult.dispatchedCount} message(s) journalisé(s)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLastDispatchResult(null)}
                    className="text-slate-500 hover:text-slate-800 underline"
                  >
                    Masquer les liens
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lastDispatchResult.whatsappLinks.map((link, idx) => (
                    <a
                      key={`wa-${link.studentId}-${idx}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Ouvrir WhatsApp · {link.studentName}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                  {lastDispatchResult.emailLinks.map((link, idx) => (
                    <a
                      key={`ml-${link.studentId}-${idx}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Ouvrir E-mail · {link.studentName}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cycle Recovery Progress Overview */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                Situation du recouvrement par cycle
              </h2>
              <span className="text-xs text-slate-500">
                Calculé sur l’échéancier des tranches ({state.settings.currentAcademicYear})
              </span>
            </div>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-xs sm:text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 text-left">
                    <th className="py-2 pr-3 font-medium">Cycle</th>
                    <th className="py-2 px-3 font-medium text-right">Élèves</th>
                    <th className="py-2 px-3 font-medium text-right">Encaissé</th>
                    <th className="py-2 px-3 font-medium text-right">Échu en retard</th>
                    <th className="py-2 px-3 font-medium text-right">Reste à recouvrer</th>
                    <th className="py-2 pl-3 font-medium text-right">Avancement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cycleRecoveryBreakdown.map((row) => (
                    <tr key={row.cycle} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">{row.cycle}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {row.count}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {formatFcfa(row.paid)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-red-700">
                        {formatFcfa(row.overdue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatFcfa(row.remaining)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <div className="w-20 h-2 bg-slate-200 rounded overflow-hidden">
                            <div
                              className="h-full bg-[#0B1933]"
                              style={{ width: `${row.rate}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums w-9 text-right">
                            {row.rate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
              <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher élève, carte ou parent..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <select
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">Tous les cycles</option>
                {CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={recoveryFilter}
                onChange={(e) =>
                  setRecoveryFilter(
                    e.target.value as 'unpaid' | 'overdue' | 'moratoire' | 'solde' | 'all'
                  )
                }
                className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="unpaid">Dossiers avec solde dû</option>
                <option value="overdue">Échus en retard uniquement</option>
                <option value="moratoire">Sous moratoire actif</option>
                <option value="solde">Dossiers soldés</option>
                <option value="all">Tous les dossiers</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportRecoveryCsv}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Exporter recouvrement CSV
            </button>
          </div>

          {/* Recovery Student Table / Mobile Cards */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredRecoveryRows.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Aucun dossier ne correspond à ces critères de recouvrement.
                </div>
              ) : (
                filteredRecoveryRows.map(({ student, profile, followUpPlan, parent, schoolClass, latestReminder }) => (
                  <div key={student.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <StudentAvatar
                          photoUrl={student.photoUrl}
                          firstName={student.firstName}
                          lastName={student.lastName}
                          sizeClass="w-10 h-10"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm truncate">
                            {student.lastName} {student.firstName}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">
                            {student.cardId} · {schoolClass?.name || student.cycle}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono text-xs font-bold tabular-nums ${
                            profile.overdueFcfa > 0
                              ? 'text-red-700'
                              : profile.remaining > 0
                                ? 'text-slate-900'
                                : 'text-emerald-700'
                          }`}
                        >
                          {profile.remaining === 0 ? 'Soldé' : formatFcfa(profile.remaining)}
                        </div>
                        {profile.overdueFcfa > 0 && (
                          <div className="text-[11px] font-semibold text-red-700 font-mono tabular-nums">
                            Échu {formatFcfa(profile.overdueFcfa)} (+{profile.daysOverdue}j)
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-0.5">
                      <div>
                        <span className="font-medium text-slate-800">{parent?.fullName || '—'}</span>
                        {parent?.phone && <span className="font-mono"> · {parent.phone}</span>}
                      </div>
                      {parent?.email && (
                        <div className="text-[11px] text-slate-500 font-mono">{parent.email}</div>
                      )}
                    </div>

                    <div className="text-xs space-y-1 bg-slate-50 rounded-lg p-2.5">
                      {profile.installmentBreakdown.map((inst) => (
                        <div key={inst.label} className="flex items-center justify-between gap-2">
                          <span className="text-slate-600 truncate">{inst.label}</span>
                          <span
                            className={`font-mono tabular-nums font-medium shrink-0 ${
                              inst.settled
                                ? 'text-emerald-700'
                                : inst.isOverdue
                                  ? 'text-red-700'
                                  : 'text-slate-700'
                            }`}
                          >
                            {inst.settled
                              ? 'Soldée'
                              : `${formatFcfa(inst.remainingForInstallment)}${inst.isOverdue ? ' (échue)' : ''}`}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="text-xs space-y-0.5">
                      {latestReminder && (
                        <div className="text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-semibold text-blue-900">
                            {REMINDER_STATUS_LABELS[latestReminder.status]}
                          </span>
                          <span>· {latestReminder.channel}</span>
                          <span>· {formatDateFr(latestReminder.sentAt)}</span>
                          {latestReminder.promisedDate && (
                            <span className="font-mono text-amber-800 font-semibold">
                              · Échéance {formatDateFr(latestReminder.promisedDate)}
                            </span>
                          )}
                        </div>
                      )}
                      {profile.overdueFcfa > 0 && (
                        <div
                          className={`text-[11px] font-medium ${
                            followUpPlan.actionNeeded === 'followup_j3' ||
                            followUpPlan.actionNeeded === 'initial_alert'
                              ? 'text-amber-800'
                              : 'text-slate-500'
                          }`}
                        >
                          {followUpPlan.reasonLabel}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {canCollectCaisse && !isReadOnly && profile.remaining > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const suggested =
                                profile.overdueFcfa > 0
                                  ? profile.overdueFcfa
                                  : profile.nextDueAmount || profile.remaining;
                              const label = profile.nextDueLabel || 'Régularisation scolarité';
                              setPayForm({
                                amountPaid: suggested,
                                method: 'Espèces',
                                trancheLabel: label,
                                notes: '',
                              });
                              setCollectTarget({
                                student,
                                suggestedAmount: suggested,
                                trancheLabel: label,
                              });
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
                          >
                            Encaisser
                          </button>
                          <button
                            type="button"
                            onClick={() => openMessageModal(student, profile, parent, followUpPlan)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                          >
                            <Send className="w-3 h-3" />
                            WhatsApp / Mail
                          </button>
                          <button
                            type="button"
                            onClick={() => openReminderModal(student, profile)}
                            className="px-3 py-1.5 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg"
                          >
                            Relancer / Moratoire
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setNoticeModal({ student, profile, latestReminder })
                        }
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        Avis PDF
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Élève & Classe</th>
                    <th className="py-3 px-4 font-semibold">Parent / Tuteur</th>
                    <th className="py-3 px-4 font-semibold">Échéancier des tranches</th>
                    <th className="py-3 px-4 font-semibold text-right">Échu / Reste dû</th>
                    <th className="py-3 px-4 font-semibold">Suivi relance</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecoveryRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-xs text-slate-500">
                        Aucun dossier ne correspond à ces critères de recouvrement.
                      </td>
                    </tr>
                  ) : (
                    filteredRecoveryRows.map(
                      ({ student, profile, followUpPlan, parent, schoolClass, latestReminder }) => (
                        <tr key={student.id} className="hover:bg-slate-50 align-top">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <StudentAvatar
                                photoUrl={student.photoUrl}
                                firstName={student.firstName}
                                lastName={student.lastName}
                                sizeClass="w-9 h-9"
                              />
                              <div>
                                <div className="font-semibold text-slate-900">
                                  {student.lastName} {student.firstName}
                                </div>
                                <div className="text-xs text-slate-500 font-mono">
                                  {student.cardId} · {schoolClass?.name || student.cycle}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900 text-xs">
                              {parent?.fullName || '—'}
                            </div>
                            <div className="font-mono text-xs text-slate-500 mt-0.5">
                              {parent?.phone || '—'}
                            </div>
                            {parent?.email && (
                              <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                                {parent.email}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1 text-xs">
                              {profile.installmentBreakdown.map((inst, idx) => (
                                <div key={inst.label} className="flex items-center gap-2">
                                  {inst.settled ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  ) : inst.isOverdue ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                                  ) : (
                                    <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <span className="text-slate-700">
                                    T{idx + 1} ({formatDateFr(inst.dueDate)}) :
                                  </span>
                                  <span
                                    className={`font-mono tabular-nums font-semibold ${
                                      inst.settled
                                        ? 'text-emerald-700'
                                        : inst.isOverdue
                                          ? 'text-red-700'
                                          : 'text-slate-800'
                                    }`}
                                  >
                                    {inst.settled
                                      ? 'Soldée'
                                      : `${formatFcfa(inst.remainingForInstallment)}${
                                          inst.isOverdue ? ` (+${inst.daysOverdue}j)` : ''
                                        }`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {profile.overdueFcfa > 0 ? (
                              <div className="font-mono text-xs font-bold text-red-700 tabular-nums">
                                Échu : {formatFcfa(profile.overdueFcfa)}
                              </div>
                            ) : (
                              <div className="font-mono text-xs font-medium text-emerald-700">
                                Aucun retard
                              </div>
                            )}
                            <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums mt-0.5">
                              Reste : {formatFcfa(profile.remaining)}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">
                              {profile.recoveryRatePercent}% réglé
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="space-y-0.5">
                              {latestReminder ? (
                                <>
                                  <div
                                    className={`font-semibold ${
                                      latestReminder.status === 'moratoire'
                                        ? 'text-amber-800'
                                        : latestReminder.status === 'mise_en_demeure'
                                          ? 'text-red-700'
                                          : 'text-blue-900'
                                    }`}
                                  >
                                    {REMINDER_STATUS_LABELS[latestReminder.status]}
                                    {latestReminder.isAutomatic && (
                                      <span className="ml-1.5 text-[10px] font-mono text-slate-500">
                                        (Auto)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-slate-600">
                                    {latestReminder.channel} · {formatDateFr(latestReminder.sentAt)}
                                  </div>
                                  {latestReminder.promisedDate && (
                                    <div className="font-mono text-[11px] font-semibold text-amber-800 tabular-nums">
                                      Promis le {formatDateFr(latestReminder.promisedDate)}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-400">Aucune relance</span>
                              )}
                              {profile.overdueFcfa > 0 && (
                                <div
                                  className={`text-[11px] font-medium pt-0.5 ${
                                    followUpPlan.actionNeeded === 'followup_j3' ||
                                    followUpPlan.actionNeeded === 'initial_alert'
                                      ? 'text-amber-800'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {followUpPlan.reasonLabel}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              {canCollectCaisse && !isReadOnly && profile.remaining > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const suggested =
                                        profile.overdueFcfa > 0
                                          ? profile.overdueFcfa
                                          : profile.nextDueAmount || profile.remaining;
                                      const label =
                                        profile.nextDueLabel || 'Régularisation scolarité';
                                      setPayForm({
                                        amountPaid: suggested,
                                        method: 'Espèces',
                                        trancheLabel: label,
                                        notes: '',
                                      });
                                      setCollectTarget({
                                        student,
                                        suggestedAmount: suggested,
                                        trancheLabel: label,
                                      });
                                    }}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded"
                                  >
                                    Encaisser
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openMessageModal(student, profile, parent, followUpPlan)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded"
                                  >
                                    <Send className="w-3 h-3" />
                                    WhatsApp / Mail
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openReminderModal(student, profile)}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded"
                                  >
                                    Relancer
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setNoticeModal({ student, profile, latestReminder })
                                }
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-100"
                              >
                                Avis PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Journal des relances & moratoires */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-900 shrink-0" />
                Journal des relances & moratoires ({(state.collectionReminders || []).length})
              </h2>
              <span className="text-xs text-slate-500">Historique des démarches de recouvrement</span>
            </div>

            {(state.collectionReminders || []).length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                Aucune relance ou accord de moratoire enregistré pour l’instant.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(state.collectionReminders || []).map((rem) => {
                  const stu = state.students.find((s) => s.id === rem.studentId);
                  const par = state.parents.find((p) => p.id === rem.parentId);
                  return (
                    <div
                      key={rem.id}
                      className="px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-semibold text-slate-900">
                            {stu ? `${stu.lastName} ${stu.firstName} (${stu.cardId})` : rem.studentId}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span
                            className={`font-semibold ${
                              rem.status === 'moratoire'
                                ? 'text-amber-800'
                                : rem.status === 'mise_en_demeure'
                                  ? 'text-red-700'
                                  : 'text-blue-900'
                            }`}
                          >
                            {REMINDER_STATUS_LABELS[rem.status]}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <PhoneCall className="w-3 h-3" />
                            {rem.channel}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-[11px] font-semibold text-slate-600">
                            {rem.isAutomatic ? 'Auto' : 'Manuel'}
                          </span>
                        </div>
                        <p className="text-slate-700">{rem.notes}</p>
                        {rem.messageBody && rem.messageBody !== rem.notes && (
                          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
                            « {rem.messageBody} »
                          </p>
                        )}
                        <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                          <span>Parent : {par?.fullName || '—'}</span>
                          {rem.recipientContact && (
                            <span className="font-mono text-slate-600">
                              · Destinataire : {rem.recipientContact}
                            </span>
                          )}
                          <span>· Par {rem.sentBy}</span>
                          {rem.nextFollowUpAt && (
                            <span className="font-mono font-semibold text-blue-900">
                              · Relance J+3 : {formatDateFr(rem.nextFollowUpAt)}
                            </span>
                          )}
                          {rem.promisedDate && (
                            <span className="font-mono font-semibold text-amber-800">
                              · Échéance promise : {formatDateFr(rem.promisedDate)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="sm:text-right shrink-0 space-y-0.5">
                        <div className="font-mono font-semibold text-slate-900 tabular-nums">
                          Solde : {formatFcfa(rem.amountDueFcfa)}
                        </div>
                        {rem.overdueFcfa > 0 && (
                          <div className="font-mono text-[11px] text-red-700 tabular-nums">
                            Échu : {formatFcfa(rem.overdueFcfa)}
                          </div>
                        )}
                        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {formatDateTimeFr(rem.sentAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PARENTS & TUTEURS */}
      {activeTab === 'parents' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-900 shrink-0" />
              Répertoire des parents & tuteurs ({state.parents.length})
            </h2>
            {canModifyScolarite && !isReadOnly && (
              <button
                type="button"
                onClick={() => setShowParentModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Nouveau parent
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {state.parents.map((p) => {
                const children = state.students.filter((s) => s.parentId === p.id);
                return (
                  <div key={p.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900 text-sm">{p.fullName}</div>
                      <div className="font-mono text-xs font-semibold text-blue-950">
                        {p.accessCode || '—'}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-700">{p.phone}</div>
                    {p.email && <div className="text-xs font-mono text-slate-500">{p.email}</div>}
                    <div className="text-xs text-slate-500">{p.address}</div>
                    <div className="text-xs text-slate-600 pt-1">
                      {children.length === 0
                        ? 'Aucun enfant lié'
                        : children.map((c) => `${c.firstName} ${c.lastName} (${c.cardId})`).join(' · ')}
                    </div>
                    {canCollectCaisse && !isReadOnly && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingParent(p)}
                          className="text-xs font-semibold text-blue-900 hover:underline"
                        >
                          Modifier WhatsApp / E-mail
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Nom complet</th>
                    <th className="py-3 px-4 font-semibold">Téléphone, E-mail & Adresse</th>
                    <th className="py-3 px-4 font-semibold">Enfants rattachés</th>
                    <th className="py-3 px-4 font-semibold text-right">Code / Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.parents.map((p) => {
                    const children = state.students.filter((s) => s.parentId === p.id);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-semibold text-slate-900">{p.fullName}</td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs text-slate-800">{p.phone}</div>
                          {p.email && (
                            <div className="font-mono text-xs text-blue-900 mt-0.5">{p.email}</div>
                          )}
                          <div className="text-xs text-slate-500">{p.address}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {children.length === 0
                            ? 'Aucun enfant lié'
                            : children.map((c) => `${c.firstName} ${c.lastName} (${c.cardId})`).join(' · ')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-3">
                            <span className="font-mono font-semibold text-blue-950">
                              {p.accessCode || '—'}
                            </span>
                            {canCollectCaisse && !isReadOnly && (
                              <button
                                type="button"
                                onClick={() => setEditingParent(p)}
                                title="Modifier WhatsApp / E-mail"
                                className="p-1.5 text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
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
      )}

      {/* TAB 4: GRILLE TARIFAIRE */}
      {activeTab === 'tarifs' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-900 shrink-0" />
                Grille tarifaire annuelle (FCFA)
              </h2>
              <p className="text-xs text-slate-500">
                Frais d’inscription, scolarité annuelle et échéancier par cycle et programme.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                  <th className="py-3 px-4 font-semibold">Cycle</th>
                  <th className="py-3 px-4 font-semibold">Programme</th>
                  <th className="py-3 px-4 font-semibold text-right">Inscription</th>
                  <th className="py-3 px-4 font-semibold text-right">Scolarité annuelle</th>
                  <th className="py-3 px-4 font-semibold text-right">Total annuel</th>
                  <th className="py-3 px-4 font-semibold">Tranches</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.feeGrid.map((fee) => (
                  <tr key={fee.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">{fee.cycle}</td>
                    <td className="py-3 px-4 text-slate-700">{fee.program}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatFcfa(fee.registrationFee)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatFcfa(fee.annualTuition)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-blue-950">
                      {formatFcfa(fee.registrationFee + fee.annualTuition)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 font-mono">
                      {fee.installments.map((t) => formatFcfa(t.amount)).join(' / ')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canModifyScolarite && !isReadOnly ? (
                        <button
                          type="button"
                          onClick={() => setEditingFee(fee)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-100"
                        >
                          Modifier
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Lecture seule</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ENROLL STUDENT */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleEnrollSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-5 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Nouvelle inscription élève
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowEnrollModal(false);
                  setPhotoError(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Annuler
              </button>
            </div>

            {/* Photo de profil élève */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-20 h-24 rounded-lg border border-slate-300 bg-white overflow-hidden flex items-center justify-center shrink-0">
                {enrollForm.photoUrl ? (
                  <img
                    src={enrollForm.photoUrl}
                    alt="Aperçu photo élève"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-[10px] leading-tight">Photo</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Photo de profil de l’élève
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Cette photo figurera automatiquement sur la carte scolaire, les reçus de caisse et les bulletins.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-[#E5A923]" />
                    {enrollForm.photoUrl ? 'Changer la photo' : 'Importer une photo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEnrollPhotoChange}
                      className="sr-only"
                    />
                  </label>
                  {enrollForm.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setEnrollForm({ ...enrollForm, photoUrl: '' })}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 bg-white hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Retirer
                    </button>
                  )}
                </div>
                {photoError && <p className="text-xs text-red-700 font-medium">{photoError}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nom de famille</label>
                <input
                  type="text"
                  required
                  value={enrollForm.lastName}
                  onChange={(e) => setEnrollForm({ ...enrollForm, lastName: e.target.value })}
                  placeholder="ex. MOUKALA"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom(s)</label>
                <input
                  type="text"
                  required
                  value={enrollForm.firstName}
                  onChange={(e) => setEnrollForm({ ...enrollForm, firstName: e.target.value })}
                  placeholder="ex. Nathan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date de naissance</label>
                <input
                  type="date"
                  required
                  value={enrollForm.birthDate}
                  onChange={(e) => setEnrollForm({ ...enrollForm, birthDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lieu de naissance</label>
                <input
                  type="text"
                  required
                  value={enrollForm.birthPlace}
                  onChange={(e) => setEnrollForm({ ...enrollForm, birthPlace: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sexe</label>
                <select
                  value={enrollForm.gender}
                  onChange={(e) => setEnrollForm({ ...enrollForm, gender: e.target.value as 'M' | 'F' })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="F">Féminin</option>
                  <option value="M">Masculin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cycle</label>
                <select
                  value={enrollForm.cycle}
                  onChange={(e) => setEnrollForm({ ...enrollForm, cycle: e.target.value as SchoolCycle })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Programme</label>
                <select
                  value={enrollForm.program}
                  onChange={(e) => setEnrollForm({ ...enrollForm, program: e.target.value as SchoolProgram })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PROGRAMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Classe visée</label>
                <select
                  value={enrollForm.classId}
                  onChange={(e) => setEnrollForm({ ...enrollForm, classId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Affectation ultérieure par Secrétariat</option>
                  {state.classes
                    .filter((c) => c.cycle === enrollForm.cycle && c.program === enrollForm.program)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">Parent / Tuteur légal</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEnrollForm({ ...enrollForm, parentMode: 'existing' })}
                    className={`px-2.5 py-1 text-xs rounded ${
                      enrollForm.parentMode === 'existing'
                        ? 'bg-blue-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Parent existant
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnrollForm({ ...enrollForm, parentMode: 'new' })}
                    className={`px-2.5 py-1 text-xs rounded ${
                      enrollForm.parentMode === 'new'
                        ? 'bg-blue-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Nouveau parent
                  </button>
                </div>
              </div>

              {enrollForm.parentMode === 'existing' ? (
                <select
                  value={enrollForm.parentId}
                  onChange={(e) => setEnrollForm({ ...enrollForm, parentId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {state.parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.phone})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Nom du parent / tuteur"
                    value={enrollForm.newParentName}
                    onChange={(e) => setEnrollForm({ ...enrollForm, newParentName: e.target.value })}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Téléphone / WhatsApp (+242...)"
                    value={enrollForm.newParentPhone}
                    onChange={(e) => setEnrollForm({ ...enrollForm, newParentPhone: e.target.value })}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="email"
                    placeholder="E-mail parent (pour relances)"
                    value={enrollForm.newParentEmail}
                    onChange={(e) => setEnrollForm({ ...enrollForm, newParentEmail: e.target.value })}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Adresse à Pointe-Noire"
                    value={enrollForm.newParentAddress}
                    onChange={(e) => setEnrollForm({ ...enrollForm, newParentAddress: e.target.value })}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Code secret parent (4 chiffres)"
                    value={enrollForm.newParentCode}
                    onChange={(e) => setEnrollForm({ ...enrollForm, newParentCode: e.target.value })}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono sm:col-span-2"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowEnrollModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                {busy ? 'Enregistrement...' : 'Valider l’inscription & Générer la carte'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDIT STUDENT */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleEditStudentSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Modifier le dossier · {editingStudent.cardId}
            </h3>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <StudentAvatar
                photoUrl={editingStudent.photoUrl}
                firstName={editingStudent.firstName}
                lastName={editingStudent.lastName}
                sizeClass="w-16 h-20"
              />
              <div className="flex-1 space-y-1.5">
                <div className="text-xs font-semibold text-slate-800">Photo de profil</div>
                <p className="text-[11px] text-slate-500">
                  Affichée sur la carte scolaire, les reçus et les bulletins.
                </p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] rounded-lg cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-[#E5A923]" />
                  Changer la photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditPhotoChange}
                    className="sr-only"
                  />
                </label>
                {photoError && <p className="text-xs text-red-700 font-medium">{photoError}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nom</label>
                <input
                  type="text"
                  required
                  value={editingStudent.lastName}
                  onChange={(e) => setEditingStudent({ ...editingStudent, lastName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom</label>
                <input
                  type="text"
                  required
                  value={editingStudent.firstName}
                  onChange={(e) => setEditingStudent({ ...editingStudent, firstName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cycle</label>
                <select
                  value={editingStudent.cycle}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, cycle: e.target.value as SchoolCycle })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Programme</label>
                <select
                  value={editingStudent.program}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, program: e.target.value as SchoolProgram })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PROGRAMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
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

      {/* MODAL: REINSCRIPTION */}
      {reinscrireStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 sm:p-6 space-y-4 my-auto">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Réinscription rapide (sans ressaisie)
            </h3>
            <p className="text-sm text-slate-600">
              Confirmer la réinscription de{' '}
              <span className="font-semibold text-slate-900">
                {reinscrireStudent.firstName} {reinscrireStudent.lastName}
              </span>{' '}
              ({reinscrireStudent.cardId}) pour l’année {state.settings.currentAcademicYear} ? Une notification sera envoyée à la Caisse.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReinscrireStudent(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  handleReinscrire(
                    reinscrireStudent,
                    reinscrireStudent.cycle,
                    reinscrireStudent.classId || ''
                  )
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
              >
                Confirmer la réinscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COLLECT PAYMENT */}
      {collectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCollectSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Encaissement Caisse
            </h3>
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-900">
                {collectTarget.student.lastName} {collectTarget.student.firstName} ({collectTarget.student.cardId})
              </div>
              <div className="mt-0.5">
                Montant suggéré : <span className="font-mono font-semibold">{formatFcfa(collectTarget.suggestedAmount)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Montant encaissé (FCFA)
                </label>
                <input
                  type="number"
                  min={1000}
                  required
                  value={payForm.amountPaid}
                  onChange={(e) => setPayForm({ ...payForm, amountPaid: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mode de règlement
                </label>
                <select
                  value={payForm.method}
                  onChange={(e) =>
                    setPayForm({ ...payForm, method: e.target.value as Payment['method'] })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Espèces">Espèces</option>
                  <option value="Virement">Virement bancaire</option>
                  <option value="Chèque">Chèque</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Libellé / Tranche
                </label>
                <input
                  type="text"
                  required
                  value={payForm.trancheLabel}
                  onChange={(e) => setPayForm({ ...payForm, trancheLabel: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observations (facultatif)
                </label>
                <input
                  type="text"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCollectTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
              >
                {busy ? 'Validation...' : 'Valider & Émettre le reçu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD PARENT */}
      {showParentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleAddParent}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Nouveau parent / tuteur
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Nom et prénom complets"
                value={parentForm.fullName}
                onChange={(e) => setParentForm({ ...parentForm, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                placeholder="Téléphone / WhatsApp (+242 ...)"
                value={parentForm.phone}
                onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="email"
                placeholder="Adresse e-mail (ex. parent@exemple.cg)"
                value={parentForm.email}
                onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Adresse"
                value={parentForm.address}
                onChange={(e) => setParentForm({ ...parentForm, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Code secret parent (4 chiffres)"
                value={parentForm.accessCode}
                onChange={(e) => setParentForm({ ...parentForm, accessCode: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowParentModal(false)}
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

      {/* MODAL: EDIT PARENT CONTACT */}
      {editingParent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleUpdateParent}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Coordonnées WhatsApp & E-mail
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  required
                  value={editingParent.fullName}
                  onChange={(e) =>
                    setEditingParent({ ...editingParent, fullName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Téléphone / WhatsApp
                </label>
                <input
                  type="text"
                  required
                  value={editingParent.phone}
                  onChange={(e) =>
                    setEditingParent({
                      ...editingParent,
                      phone: e.target.value,
                      whatsappPhone: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adresse e-mail
                </label>
                <input
                  type="email"
                  value={editingParent.email || ''}
                  onChange={(e) => setEditingParent({ ...editingParent, email: e.target.value })}
                  placeholder="ex. parent@exemple.cg"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse</label>
                <input
                  type="text"
                  value={editingParent.address}
                  onChange={(e) =>
                    setEditingParent({ ...editingParent, address: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingParent(null)}
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

      {/* MODAL: EDIT FEE */}
      {editingFee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveFee}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Tarif · {editingFee.cycle} ({editingFee.program})
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Frais d’inscription (FCFA)
                </label>
                <input
                  type="number"
                  required
                  value={editingFee.registrationFee}
                  onChange={(e) =>
                    setEditingFee({ ...editingFee, registrationFee: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scolarité annuelle (FCFA)
                </label>
                <input
                  type="number"
                  required
                  value={editingFee.annualTuition}
                  onChange={(e) =>
                    setEditingFee({ ...editingFee, annualTuition: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingFee(null)}
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

      {/* PRINTABLE MODALS */}
      {cardStudent && (
        <StudentCardModal
          student={cardStudent}
          schoolClass={state.classes.find((c) => c.id === cardStudent.classId)}
          parent={state.parents.find((p) => p.id === cardStudent.parentId)}
          settings={state.settings}
          onClose={() => setCardStudent(null)}
        />
      )}

      {receiptModal && (
        <ReceiptModal
          payment={receiptModal.payment}
          student={receiptModal.student}
          parent={state.parents.find((p) => p.id === receiptModal.student.parentId)}
          balanceRemaining={getStudentBalance(receiptModal.student).remaining}
          settings={state.settings}
          onClose={() => setReceiptModal(null)}
        />
      )}

      {/* MODAL: LOG COLLECTION REMINDER / MORATOIRE */}
      {reminderTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateReminder}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Relance & Moratoire
            </h3>
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="font-semibold text-slate-900">
                {reminderTarget.student.lastName} {reminderTarget.student.firstName} ({reminderTarget.student.cardId})
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  Échu en retard :{' '}
                  <strong className="font-mono text-red-700 tabular-nums">
                    {formatFcfa(reminderTarget.profile.overdueFcfa)}
                  </strong>
                </span>
                <span>
                  Reste total :{' '}
                  <strong className="font-mono text-slate-900 tabular-nums">
                    {formatFcfa(reminderTarget.profile.remaining)}
                  </strong>
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Canal utilisé
                </label>
                <select
                  value={reminderForm.channel}
                  onChange={(e) =>
                    setReminderForm({
                      ...reminderForm,
                      channel: e.target.value as ReminderChannel,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {REMINDER_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Niveau de relance / Décision
                </label>
                <select
                  value={reminderForm.status}
                  onChange={(e) =>
                    setReminderForm({
                      ...reminderForm,
                      status: e.target.value as ReminderStatus,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="relance_1">1ère relance</option>
                  <option value="relance_2">2ème relance</option>
                  <option value="mise_en_demeure">Mise en demeure</option>
                  <option value="moratoire">Accord de moratoire</option>
                  <option value="resolu">Dossier régularisé</option>
                </select>
              </div>

              {reminderForm.status === 'moratoire' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date limite promise de règlement
                  </label>
                  <input
                    type="date"
                    required
                    value={reminderForm.promisedDate}
                    onChange={(e) =>
                      setReminderForm({ ...reminderForm, promisedDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Compte rendu de l’échange / Observations
                </label>
                <textarea
                  rows={3}
                  required
                  value={reminderForm.notes}
                  onChange={(e) => setReminderForm({ ...reminderForm, notes: e.target.value })}
                  placeholder="Ex. Contact téléphonique avec le parent, promesse de versement..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReminderTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                {busy ? 'Enregistrement...' : 'Enregistrer la démarche'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: WHATSAPP / EMAIL QUICK-SEND & J+3 */}
      {messageTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSendMessageSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Notifier le parent (WhatsApp / E-mail)
                </h3>
                <p className="text-xs text-slate-500">
                  Une relance automatique est programmée sous{' '}
                  <span className="font-mono font-semibold text-slate-800">
                    {currentAutoSettings.followUpDelayDays} jours
                  </span>{' '}
                  si le paiement n’est pas régularisé.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMessageTarget(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Fermer
              </button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="flex flex-wrap justify-between gap-2 font-semibold text-slate-900">
                <span>
                  {messageTarget.student.lastName} {messageTarget.student.firstName} (
                  {messageTarget.student.cardId})
                </span>
                <span className="font-mono text-red-700 tabular-nums">
                  Échu : {formatFcfa(messageTarget.profile.overdueFcfa)}
                </span>
              </div>
              <div>
                Parent : <strong className="text-slate-800">{messageTarget.parent?.fullName || '—'}</strong>
                {' · '}WhatsApp :{' '}
                <span className="font-mono text-slate-800">
                  {messageTarget.parent?.whatsappPhone || messageTarget.parent?.phone || 'Non renseigné'}
                </span>
              </div>
              <div>
                E-mail :{' '}
                <span className="font-mono text-slate-800">
                  {messageTarget.parent?.email || 'Non renseigné'}
                </span>
              </div>
              <div className="text-[11px] font-medium text-blue-900 pt-0.5">
                Étape calculée :{' '}
                {messageTarget.plan.nextStep >= 2
                  ? `Relance J+${currentAutoSettings.followUpDelayDays} (étape ${messageTarget.plan.nextStep})`
                  : '1er avis de retard (J0)'}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Canaux d’envoi
                </label>
                <select
                  value={messageForm.channel}
                  onChange={(e) =>
                    setMessageForm({
                      ...messageForm,
                      channel: e.target.value as 'whatsapp_et_email' | 'whatsapp' | 'email',
                    })
                  }
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="whatsapp_et_email">WhatsApp + E-mail</option>
                  <option value="whatsapp">WhatsApp uniquement</option>
                  <option value="email">E-mail uniquement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Niveau d’alerte
                </label>
                <select
                  value={messageForm.status}
                  onChange={(e) =>
                    setMessageForm({
                      ...messageForm,
                      status: e.target.value as ReminderStatus,
                    })
                  }
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="relance_1">1er avis de retard (J0)</option>
                  <option value="relance_2">Relance J+{currentAutoSettings.followUpDelayDays}</option>
                  <option value="mise_en_demeure">Dernier rappel / Mise en demeure</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Texte du message WhatsApp / E-mail
              </label>
              <textarea
                rows={4}
                required
                value={messageForm.customMessage}
                onChange={(e) =>
                  setMessageForm({ ...messageForm, customMessage: e.target.value })
                }
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {(messageForm.sentWhatsappUrl || messageForm.sentMailtoUrl) && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="text-xs font-semibold text-emerald-900">
                  Envoi journalisé ! Cliquez ci-dessous pour transmettre le message :
                </div>
                <div className="flex flex-wrap gap-2">
                  {messageForm.sentWhatsappUrl && (
                    <a
                      href={messageForm.sentWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Envoyer sur WhatsApp
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {messageForm.sentMailtoUrl && (
                    <a
                      href={messageForm.sentMailtoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Envoyer par E-mail
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setMessageTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                <Send className="w-3.5 h-3.5" />
                {busy ? 'Enregistrement...' : 'Enregistrer & Générer les liens'}
              </button>
            </div>
          </form>
        </div>
      )}

      {noticeModal && (
        <ReminderNoticeModal
          student={noticeModal.student}
          schoolClass={state.classes.find((c) => c.id === noticeModal.student.classId)}
          parent={state.parents.find((p) => p.id === noticeModal.student.parentId)}
          profile={noticeModal.profile}
          latestReminder={noticeModal.latestReminder}
          settings={state.settings}
          onClose={() => setNoticeModal(null)}
        />
      )}
    </div>
  );
};
