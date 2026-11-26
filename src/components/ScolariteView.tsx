import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  Camera,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Layers,
  Mail,
  MessageSquare,
  PhoneCall,
  Plus,
  Printer,
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
  computeAdjustedFeeItem,
  computeStudentRecoveryProfile,
  distributeFeeInstallments,
  evaluateStudentAutoFollowUp,
  getDefaultCollectionAutomation,
  getFeeForReinscription,
  suggestNextClassAndCycle,
} from '../shared/schoolEngine';
import type {
  CollectionAutomationSettings,
  CollectionReminder,
  FeeGridItem,
  ParentTutor,
  Payment,
  ReenrollmentDecision,
  ReenrollmentRecord,
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
  ReinscriptionCertificateModal,
  ReminderNoticeModal,
  StudentAvatar,
  StudentCardModal,
} from './PrintableDocs';

type ScolariteTab =
  | 'dossiers'
  | 'reinscriptions'
  | 'caisse'
  | 'recouvrement'
  | 'parents'
  | 'tarifs';

const REENROLLMENT_DECISION_LABELS: Record<ReenrollmentDecision, string> = {
  passage: 'Passage en classe supérieure',
  redoublement: 'Maintien / Redoublement',
  changement_cycle: 'Passage au cycle supérieur',
  transfert_programme: 'Changement de programme',
};

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
  requestedTab?: { tab: ScolariteTab; nonce: number } | null;
  onOpenNotesValidation?: () => void;
  onRefresh: () => Promise<void>;
}> = ({ state, session, initialTab, requestedTab, onOpenNotesValidation, onRefresh }) => {
  const isCaisse = session.role === 'caisse';
  const canModifyScolarite = session.role === 'scolarite' || session.role === 'admin';
  const canCollectCaisse = session.role === 'caisse' || session.role === 'scolarite' || session.role === 'admin';
  const isReadOnly = session.role === 'direction' || session.role === 'secretariat';

  const [activeTab, setActiveTab] = useState<ScolariteTab>(
    requestedTab?.tab || initialTab || (isCaisse ? 'caisse' : 'dossiers')
  );

  React.useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  React.useEffect(() => {
    if (requestedTab?.tab) {
      setActiveTab(requestedTab.tab);
    }
  }, [requestedTab]);
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
  const [feeModalMode, setFeeModalMode] = useState<'edit' | 'create'>('edit');
  const [feeProgramFilter, setFeeProgramFilter] = useState<'all' | SchoolProgram>('all');
  const [feeSearch, setFeeSearch] = useState('');
  const [confirmDeleteFeeId, setConfirmDeleteFeeId] = useState<string | null>(null);
  const [showBulkFeeModal, setShowBulkFeeModal] = useState(false);
  const [bulkFeeMode, setBulkFeeMode] = useState<'adjust' | 'direct'>('adjust');
  const [bulkFeeTargetIds, setBulkFeeTargetIds] = useState<string[]>([]);
  const [bulkAdjustType, setBulkAdjustType] = useState<'percent' | 'fixed'>('percent');
  const [bulkRegDelta, setBulkRegDelta] = useState<number>(0);
  const [bulkTuitionDelta, setBulkTuitionDelta] = useState<number>(5);
  const [bulkRoundTo, setBulkRoundTo] = useState<number>(500);
  const [bulkRebalanceInstallments, setBulkRebalanceInstallments] = useState<boolean>(true);
  const [bulkDueDates, setBulkDueDates] = useState<[string, string, string]>(['', '', '']);
  const [bulkDirectDraft, setBulkDirectDraft] = useState<
    Record<string, { registrationFee: number; annualTuition: number }>
  >({});
  const [reinscriptionCertModal, setReinscriptionCertModal] = useState<ReenrollmentRecord | null>(
    null
  );
  const [lastReenrollmentCert, setLastReenrollmentCert] = useState<ReenrollmentRecord | null>(null);

  // Re-enrollment filters & forms
  const [reinscriptionFilter, setReinscriptionFilter] = useState<
    'all' | 'a_reinscrire' | 'reinscrit' | 'inscrit'
  >('all');
  const [reinscriptionSearch, setReinscriptionSearch] = useState('');
  const [reinscriptionCycleFilter, setReinscriptionCycleFilter] = useState<string>('all');
  const [reinscrireForm, setReinscrireForm] = useState<{
    decision: ReenrollmentDecision;
    nextAcademicYear: string;
    nextCycle: SchoolCycle;
    nextProgram: SchoolProgram;
    nextClassId: string;
    parentPhone: string;
    parentEmail: string;
    parentAddress: string;
    feeAmount: number;
    allowWithUnpaidBalance: boolean;
    notes: string;
  }>({
    decision: 'passage',
    nextAcademicYear: state.settings.currentAcademicYear,
    nextCycle: 'Primaire',
    nextProgram: 'Congolais',
    nextClassId: '',
    parentPhone: '',
    parentEmail: '',
    parentAddress: '',
    feeAmount: 120000,
    allowWithUnpaidBalance: false,
    notes: '',
  });

  const [showBatchReinscrireModal, setShowBatchReinscrireModal] = useState(false);
  const [batchTargetYear, setBatchTargetYear] = useState(state.settings.currentAcademicYear);
  const [batchDecision, setBatchDecision] = useState<'passage' | 'redoublement'>('passage');
  const [batchSourceFilter, setBatchSourceFilter] = useState<'all' | 'a_reinscrire'>('all');
  const [batchSkipUnpaid, setBatchSkipUnpaid] = useState(true);
  const [batchNotes, setBatchNotes] = useState('');
  const [batchSelection, setBatchSelection] = useState<
    Record<
      string,
      {
        selected: boolean;
        nextCycle: SchoolCycle;
        nextProgram: SchoolProgram;
        nextClassId: string;
      }
    >
  >({});

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

  const latestReenrollmentByStudent = useMemo(() => {
    const map = new Map<string, ReenrollmentRecord>();
    for (const rec of state.reenrollments || []) {
      const prev = map.get(rec.studentId);
      if (!prev || new Date(rec.reinscritAt).getTime() >= new Date(prev.reinscritAt).getTime()) {
        map.set(rec.studentId, rec);
      }
    }
    return map;
  }, [state.reenrollments]);

  const reinscriptionStats = useMemo(() => {
    const archivedCount = state.students.filter((s) => s.status === 'archive').length;
    const reinscritCount = state.students.filter((s) => s.status === 'reinscrit').length;
    const inscritCount = state.students.filter((s) => s.status === 'inscrit').length;
    const unpaidCount = state.students.filter((s) => getStudentBalance(s).remaining > 0).length;
    const pendingReinscriptionNotifsCount = state.paymentNotifications.filter(
      (n) => n.status === 'en_attente' && n.reason.toLowerCase().includes('réinscription')
    ).length;
    return {
      archivedCount,
      reinscritCount,
      inscritCount,
      unpaidCount,
      pendingReinscriptionNotifsCount,
    };
  }, [state.students, state.payments, state.feeGrid, state.paymentNotifications]);

  const filteredReinscriptionStudents = useMemo(() => {
    const q = reinscriptionSearch.trim().toLowerCase();
    const statusOrder: Record<Student['status'], number> = {
      archive: 0,
      inscrit: 1,
      reinscrit: 2,
    };
    return state.students
      .filter((stu) => {
        if (reinscriptionFilter === 'a_reinscrire' && stu.status !== 'archive') return false;
        if (reinscriptionFilter === 'reinscrit' && stu.status !== 'reinscrit') return false;
        if (reinscriptionFilter === 'inscrit' && stu.status !== 'inscrit') return false;
        if (reinscriptionCycleFilter !== 'all' && stu.cycle !== reinscriptionCycleFilter) return false;
        if (!q) return true;
        const parent = state.parents.find((p) => p.id === stu.parentId);
        return (
          stu.firstName.toLowerCase().includes(q) ||
          stu.lastName.toLowerCase().includes(q) ||
          stu.cardId.toLowerCase().includes(q) ||
          (parent?.fullName.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [
    state.students,
    state.parents,
    reinscriptionFilter,
    reinscriptionCycleFilter,
    reinscriptionSearch,
  ]);

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

  const openReinscrireModal = (student: Student) => {
    const parent = state.parents.find((p) => p.id === student.parentId);
    const defaultDecision: ReenrollmentDecision = 'passage';
    const suggested = suggestNextClassAndCycle(
      { classes: state.classes },
      student,
      defaultDecision
    );
    const feeAmount = getFeeForReinscription(
      { feeGrid: state.feeGrid },
      suggested.nextCycle,
      suggested.nextProgram
    );
    setReinscrireForm({
      decision: defaultDecision,
      nextAcademicYear: state.settings.currentAcademicYear,
      nextCycle: suggested.nextCycle,
      nextProgram: suggested.nextProgram,
      nextClassId: suggested.nextClassId || '',
      parentPhone: parent?.phone || '',
      parentEmail: parent?.email || '',
      parentAddress: parent?.address || '',
      feeAmount,
      allowWithUnpaidBalance: false,
      notes: '',
    });
    setReinscrireStudent(student);
  };

  const handleReinscrireDecisionChange = (student: Student, decision: ReenrollmentDecision) => {
    const suggested = suggestNextClassAndCycle({ classes: state.classes }, student, decision);
    const feeAmount = getFeeForReinscription(
      { feeGrid: state.feeGrid },
      suggested.nextCycle,
      suggested.nextProgram
    );
    setReinscrireForm((prev) => ({
      ...prev,
      decision,
      nextCycle: suggested.nextCycle,
      nextProgram: suggested.nextProgram,
      nextClassId: suggested.nextClassId || '',
      feeAmount,
    }));
  };

  const handleReinscrireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reinscrireStudent) return;
    setBusy(true);
    setFeedback(null);
    setLastReenrollmentCert(null);
    try {
      const res = await apiRequest<{ student: Student; reenrollment: ReenrollmentRecord }>(
        `/api/students/${reinscrireStudent.id}/reinscrire`,
        {
          method: 'POST',
          body: JSON.stringify({
            nextCycle: reinscrireForm.nextCycle,
            nextProgram: reinscrireForm.nextProgram,
            nextClassId: reinscrireForm.nextClassId || null,
            nextAcademicYear: reinscrireForm.nextAcademicYear,
            decision: reinscrireForm.decision,
            parentPhone: reinscrireForm.parentPhone,
            parentEmail: reinscrireForm.parentEmail,
            parentAddress: reinscrireForm.parentAddress,
            feeAmountOverride: Number(reinscrireForm.feeAmount),
            allowWithUnpaidBalance: reinscrireForm.allowWithUnpaidBalance,
            notes: reinscrireForm.notes,
          }),
        },
        session
      );
      await onRefresh();
      const targetName = `${reinscrireStudent.firstName} ${reinscrireStudent.lastName}`;
      setReinscrireStudent(null);
      setLastReenrollmentCert(res.reenrollment);
      setFeedback({
        type: 'ok',
        text: `${targetName} réinscrit(e) pour ${res.reenrollment.toAcademicYear} (${REENROLLMENT_DECISION_LABELS[res.reenrollment.decision]}). Notification envoyée à la Caisse.`,
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

  const openBatchReinscrireModal = (
    decisionMode: 'passage' | 'redoublement' = 'passage',
    sourceMode: 'all' | 'a_reinscrire' = reinscriptionStats.archivedCount > 0 ? 'a_reinscrire' : 'all'
  ) => {
    const nextMap: Record<
      string,
      {
        selected: boolean;
        nextCycle: SchoolCycle;
        nextProgram: SchoolProgram;
        nextClassId: string;
      }
    > = {};
    for (const stu of state.students) {
      const suggested = suggestNextClassAndCycle({ classes: state.classes }, stu, decisionMode);
      const isEligibleDefault =
        sourceMode === 'a_reinscrire' ? stu.status === 'archive' : stu.status !== 'reinscrit';
      nextMap[stu.id] = {
        selected: isEligibleDefault,
        nextCycle: suggested.nextCycle,
        nextProgram: suggested.nextProgram,
        nextClassId: suggested.nextClassId || '',
      };
    }
    setBatchDecision(decisionMode);
    setBatchSourceFilter(sourceMode);
    setBatchTargetYear(state.settings.currentAcademicYear);
    setBatchSkipUnpaid(true);
    setBatchNotes('');
    setBatchSelection(nextMap);
    setShowBatchReinscrireModal(true);
  };

  const handleBatchReinscrireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedEntries = state.students
      .filter((s) => batchSelection[s.id]?.selected)
      .map((s) => {
        const cfg = batchSelection[s.id];
        return {
          studentId: s.id,
          nextCycle: cfg.nextCycle,
          nextProgram: cfg.nextProgram,
          nextClassId: cfg.nextClassId || null,
          decision: batchDecision,
        };
      });

    if (selectedEntries.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Veuillez sélectionner au moins un élève pour le passage de classe groupé.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    setLastReenrollmentCert(null);
    try {
      const res = await apiRequest<{
        reinscritCount: number;
        skippedUnpaidCount: number;
        reenrollments: ReenrollmentRecord[];
      }>(
        '/api/students/reinscrire-batch',
        {
          method: 'POST',
          body: JSON.stringify({
            entries: selectedEntries,
            nextAcademicYear: batchTargetYear,
            skipUnpaid: batchSkipUnpaid,
            notes: batchNotes || 'Passage de classe en lot',
          }),
        },
        session
      );
      await onRefresh();
      setShowBatchReinscrireModal(false);
      setFeedback({
        type: 'ok',
        text: `Réinscription groupée effectuée : ${res.reinscritCount} élève(s) réinscrit(s) pour ${batchTargetYear}${
          res.skippedUnpaidCount > 0
            ? ` (${res.skippedUnpaidCount} dossier(s) ignoré(s) pour solde antérieur impayé)`
            : ''
        }.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la réinscription en lot.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportReinscriptionsCsv = () => {
    const headers = [
      'Date',
      'ID Carte',
      'Élève',
      'Année antérieure',
      'Année cible',
      'Décision',
      'Cycle antérieur',
      'Cycle cible',
      'Classe cible',
      'Solde antérieur (FCFA)',
      'Frais Caisse (FCFA)',
      'Opérateur',
    ];
    const rows = (state.reenrollments || []).map((rec) => {
      const stu = state.students.find((s) => s.id === rec.studentId);
      const toCls = state.classes.find((c) => c.id === rec.toClassId);
      return [
        formatDateTimeFr(rec.reinscritAt),
        rec.cardId,
        stu ? `${stu.lastName} ${stu.firstName}` : rec.studentId,
        rec.fromAcademicYear,
        rec.toAcademicYear,
        REENROLLMENT_DECISION_LABELS[rec.decision],
        `${rec.fromCycle} (${rec.fromProgram})`,
        `${rec.toCycle} (${rec.toProgram})`,
        toCls?.name || '—',
        rec.previousBalanceFcfa,
        rec.reinscriptionFeeFcfa,
        rec.reinscritBy,
      ];
    });
    exportToCsv(`reinscriptions-jegama-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
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

  const filteredFeeGrid = useMemo(() => {
    const q = feeSearch.trim().toLowerCase();
    return state.feeGrid.filter((fee) => {
      if (feeProgramFilter !== 'all' && fee.program !== feeProgramFilter) return false;
      if (q) {
        const hay = `${fee.cycle} ${fee.program}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.feeGrid, feeProgramFilter, feeSearch]);

  const feeStats = useMemo(() => {
    const count = state.feeGrid.length;
    const totals = state.feeGrid.map((f) => f.registrationFee + f.annualTuition);
    const avg = count > 0 ? Math.round(totals.reduce((s, v) => s + v, 0) / count) : 0;
    const min = count > 0 ? Math.min(...totals) : 0;
    const max = count > 0 ? Math.max(...totals) : 0;
    const sortedDates = state.feeGrid
      .filter((f) => Boolean(f.updatedAt))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return {
      count,
      avg,
      min,
      max,
      lastUpdatedAt: sortedDates[0]?.updatedAt || null,
      lastUpdatedBy: sortedDates[0]?.updatedBy || null,
    };
  }, [state.feeGrid]);

  const bulkPreviewRows = useMemo(() => {
    const selectedSet = new Set(bulkFeeTargetIds);
    return state.feeGrid
      .filter((f) => selectedSet.has(f.id))
      .map((fee) => {
        const next = computeAdjustedFeeItem(fee, {
          adjustType: bulkAdjustType,
          registrationDelta: bulkRegDelta,
          tuitionDelta: bulkTuitionDelta,
          roundTo: bulkRoundTo,
          dueDateOverrides: bulkDueDates,
          rebalanceInstallments: bulkRebalanceInstallments,
        });
        const oldTotal = fee.registrationFee + fee.annualTuition;
        const newTotal = next.registrationFee + next.annualTuition;
        return {
          before: fee,
          after: next,
          oldTotal,
          newTotal,
          delta: newTotal - oldTotal,
        };
      });
  }, [
    state.feeGrid,
    bulkFeeTargetIds,
    bulkAdjustType,
    bulkRegDelta,
    bulkTuitionDelta,
    bulkRoundTo,
    bulkDueDates,
    bulkRebalanceInstallments,
  ]);

  const openEditFeeModal = (fee: FeeGridItem) => {
    setFeeModalMode('edit');
    setEditingFee({
      ...fee,
      installments: fee.installments.map((t) => ({ ...t })),
    });
  };

  const openCreateFeeModal = () => {
    let defaultCycle: SchoolCycle = 'Maternelle';
    let defaultProgram: SchoolProgram = 'Français';
    for (const c of CYCLES) {
      for (const p of PROGRAMS) {
        if (!state.feeGrid.some((f) => f.cycle === c && f.program === p)) {
          defaultCycle = c;
          defaultProgram = p;
          break;
        }
      }
    }
    const baseReg = 50000;
    const baseTuition = 300000;
    setFeeModalMode('create');
    setEditingFee({
      id: 'new',
      cycle: defaultCycle,
      program: defaultProgram,
      registrationFee: baseReg,
      annualTuition: baseTuition,
      installments: distributeFeeInstallments(baseReg, baseTuition),
    });
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFee) return;
    if (editingFee.installments.length === 0) {
      setFeedback({ type: 'err', text: 'Veuillez définir au moins une tranche de paiement.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      if (feeModalMode === 'create') {
        await apiRequest(
          '/api/fee-grid',
          { method: 'POST', body: JSON.stringify(editingFee) },
          session
        );
      } else {
        await apiRequest(
          `/api/fee-grid/${editingFee.id}`,
          { method: 'PUT', body: JSON.stringify(editingFee) },
          session
        );
      }
      await onRefresh();
      setEditingFee(null);
      setFeedback({
        type: 'ok',
        text:
          feeModalMode === 'create'
            ? `Formule tarifaire ${editingFee.cycle} (${editingFee.program}) ajoutée.`
            : `Tarif ${editingFee.cycle} (${editingFee.program}) mis à jour avec son échéancier.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de mise à jour tarifaire.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFee = async (feeId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/fee-grid/${feeId}`, { method: 'DELETE' }, session);
      await onRefresh();
      setConfirmDeleteFeeId(null);
      setFeedback({ type: 'ok', text: 'Formule tarifaire supprimée.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Suppression impossible.',
      });
    } finally {
      setBusy(false);
    }
  };

  const openBulkFeeModal = (mode: 'adjust' | 'direct' = 'adjust') => {
    setBulkFeeMode(mode);
    setBulkFeeTargetIds(state.feeGrid.map((f) => f.id));
    const draft: Record<string, { registrationFee: number; annualTuition: number }> = {};
    state.feeGrid.forEach((f) => {
      draft[f.id] = { registrationFee: f.registrationFee, annualTuition: f.annualTuition };
    });
    setBulkDirectDraft(draft);
    setBulkDueDates(['', '', '']);
    setShowBulkFeeModal(true);
  };

  const handleBulkFeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      if (bulkFeeMode === 'direct') {
        const items = state.feeGrid.map((fee) => {
          const patch = bulkDirectDraft[fee.id] || {
            registrationFee: fee.registrationFee,
            annualTuition: fee.annualTuition,
          };
          return {
            id: fee.id,
            registrationFee: patch.registrationFee,
            annualTuition: patch.annualTuition,
            installments: bulkRebalanceInstallments
              ? distributeFeeInstallments(
                  patch.registrationFee,
                  patch.annualTuition,
                  fee.installments,
                  bulkRoundTo
                )
              : fee.installments,
          };
        });
        const res = await apiRequest<{ updatedCount: number }>(
          '/api/fee-grid/bulk-update',
          { method: 'POST', body: JSON.stringify({ mode: 'direct', items }) },
          session
        );
        await onRefresh();
        setShowBulkFeeModal(false);
        setFeedback({
          type: 'ok',
          text: `${res.updatedCount} formule(s) de la grille tarifaire mise(s) à jour en lot.`,
        });
      } else {
        if (bulkFeeTargetIds.length === 0) {
          setFeedback({ type: 'err', text: 'Sélectionnez au moins une formule tarifaire.' });
          setBusy(false);
          return;
        }
        const res = await apiRequest<{ updatedCount: number }>(
          '/api/fee-grid/bulk-update',
          {
            method: 'POST',
            body: JSON.stringify({
              mode: 'adjust',
              targetIds: bulkFeeTargetIds,
              adjustType: bulkAdjustType,
              registrationDelta: bulkRegDelta,
              tuitionDelta: bulkTuitionDelta,
              roundTo: bulkRoundTo,
              dueDateOverrides: bulkDueDates,
              rebalanceInstallments: bulkRebalanceInstallments,
            }),
          },
          session
        );
        await onRefresh();
        setShowBulkFeeModal(false);
        setFeedback({
          type: 'ok',
          text: `Révision globale appliquée sur ${res.updatedCount} formule(s) tarifaire(s).`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la mise à jour globale.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportFeeGridCsv = () => {
    const headers = [
      'Cycle',
      'Programme',
      'Frais inscription (FCFA)',
      'Scolarité annuelle (FCFA)',
      'Total annuel (FCFA)',
      'Tranche 1',
      'Échéance 1',
      'Tranche 2',
      'Échéance 2',
      'Tranche 3',
      'Échéance 3',
      'Élèves actifs',
      'Dernière modification',
    ];
    const rows = state.feeGrid.map((fee) => {
      const activeCount = state.students.filter(
        (s) => s.status !== 'archive' && s.cycle === fee.cycle && s.program === fee.program
      ).length;
      const t1 = fee.installments[0];
      const t2 = fee.installments[1];
      const t3 = fee.installments[2];
      return [
        fee.cycle,
        fee.program,
        fee.registrationFee,
        fee.annualTuition,
        fee.registrationFee + fee.annualTuition,
        t1?.amount ?? 0,
        t1?.dueDate ?? '',
        t2?.amount ?? 0,
        t2?.dueDate ?? '',
        t3?.amount ?? 0,
        t3?.dueDate ?? '',
        activeCount,
        fee.updatedAt ? formatDateTimeFr(fee.updatedAt) : 'Grille initiale',
      ];
    });
    exportToCsv(`grille-tarifaire-jegama-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
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
                id: 'reinscriptions',
                label:
                  reinscriptionStats.archivedCount > 0
                    ? `Réinscriptions (${reinscriptionStats.archivedCount})`
                    : 'Réinscriptions',
              },
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
          className={`p-3.5 rounded-lg border text-xs font-medium flex flex-wrap items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.text}</span>
          <div className="flex items-center gap-3 shrink-0">
            {feedback.type === 'ok' && lastReenrollmentCert && (
              <button
                type="button"
                onClick={() => setReinscriptionCertModal(lastReenrollmentCert)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-md"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimer attestation PDF
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setLastReenrollmentCert(null);
              }}
              className="text-xs underline shrink-0"
            >
              Fermer
            </button>
          </div>
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
                              onClick={() => openReinscrireModal(stu)}
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
                                    onClick={() => openReinscrireModal(stu)}
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

      {/* TAB: REINSCRIPTIONS & PASSAGES DE CLASSE */}
      {activeTab === 'reinscriptions' && (
        <div className="space-y-6">
          {/* 4-KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">À réinscrire (archivés)</div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-amber-700 tabular-nums">
                {reinscriptionStats.archivedCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Cartes scolaires conservées (RG-01)
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">
                Réinscrits · {state.settings.currentAcademicYear}
              </div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-emerald-700 tabular-nums">
                {reinscriptionStats.reinscritCount}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {(state.reenrollments || []).length} attestation(s) éditée(s)
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">Dossiers avec solde antérieur</div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-red-700 tabular-nums">
                {reinscriptionStats.unpaidCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Contrôle financier avant passage
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-white">
              <div className="text-xs font-medium text-slate-500">
                Frais réinscription en attente Caisse
              </div>
              <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold text-blue-900 tabular-nums">
                {reinscriptionStats.pendingReinscriptionNotifsCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Notifications transmises automatiquement
              </div>
            </div>
          </div>

          {/* Filter & Batch Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 flex-1 min-w-0">
              <div className="relative w-full sm:flex-1 sm:min-w-[210px] sm:max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={reinscriptionSearch}
                  onChange={(e) => setReinscriptionSearch(e.target.value)}
                  placeholder="Nom élève, parent ou ID carte..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <select
                value={reinscriptionFilter}
                onChange={(e) =>
                  setReinscriptionFilter(
                    e.target.value as 'all' | 'a_reinscrire' | 'reinscrit' | 'inscrit'
                  )
                }
                aria-label="Filtrer par statut de réinscription"
                className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">Tous les dossiers ({state.students.length})</option>
                <option value="a_reinscrire">
                  À réinscrire · Archivés ({reinscriptionStats.archivedCount})
                </option>
                <option value="inscrit">
                  Nouveaux inscrits ({reinscriptionStats.inscritCount})
                </option>
                <option value="reinscrit">
                  Déjà réinscrits ({reinscriptionStats.reinscritCount})
                </option>
              </select>

              <select
                value={reinscriptionCycleFilter}
                onChange={(e) => setReinscriptionCycleFilter(e.target.value)}
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
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportReinscriptionsCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Exporter journal CSV
              </button>
              {canModifyScolarite && !isReadOnly && (
                <button
                  type="button"
                  onClick={() => openBatchReinscrireModal('passage')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Layers className="w-4 h-4" />
                  Passage de classe en lot
                </button>
              )}
            </div>
          </div>

          {/* Student List for Re-enrollment */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredReinscriptionStudents.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aucun dossier ne correspond aux filtres sélectionnés.
                </div>
              ) : (
                filteredReinscriptionStudents.map((stu) => {
                  const cls = state.classes.find((c) => c.id === stu.classId);
                  const parent = state.parents.find((p) => p.id === stu.parentId);
                  const bal = getStudentBalance(stu);
                  const latestRec = latestReenrollmentByStudent.get(stu.id);
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
                            <div className="text-xs font-mono text-slate-500">
                              {stu.cardId} · {stu.academicYear}
                            </div>
                            <div className="text-xs text-slate-600">
                              {stu.cycle} · {cls ? cls.name : 'Non affecté'} ({stu.program})
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-semibold shrink-0">
                          {stu.status === 'archive' && (
                            <span className="text-amber-700">À réinscrire</span>
                          )}
                          {stu.status === 'reinscrit' && (
                            <span className="text-emerald-700">Réinscrit</span>
                          )}
                          {stu.status === 'inscrit' && (
                            <span className="text-blue-900">Inscrit</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-600 truncate">
                          Parent : <strong className="text-slate-800">{parent?.fullName || '—'}</strong>
                        </span>
                        <span
                          className={`font-mono font-semibold tabular-nums ${
                            bal.remaining > 0 ? 'text-red-700' : 'text-emerald-700'
                          }`}
                        >
                          Solde : {formatFcfa(bal.remaining)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {canModifyScolarite && !isReadOnly && (
                          <button
                            type="button"
                            onClick={() => openReinscrireModal(stu)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {stu.status === 'archive' ? 'Réinscrire' : 'Passage / Réinscrire'}
                          </button>
                        )}
                        {latestRec && (
                          <button
                            type="button"
                            onClick={() => setReinscriptionCertModal(latestRec)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-md"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Fiche PDF
                          </button>
                        )}
                        {canCollectCaisse && !isReadOnly && bal.remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayForm({
                                amountPaid: Math.min(bal.remaining, 100000),
                                method: 'Espèces',
                                trancheLabel: 'Régularisation avant réinscription',
                                notes: '',
                              });
                              setCollectTarget({
                                student: stu,
                                suggestedAmount: bal.remaining,
                                trancheLabel: 'Régularisation avant réinscription',
                              });
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                          >
                            Encaisser
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Élève & ID Carte (RG-01)</th>
                    <th className="py-3 px-4 font-semibold">Cycle · Classe actuelle</th>
                    <th className="py-3 px-4 font-semibold">Parent / Contacts</th>
                    <th className="py-3 px-4 font-semibold text-right">Solde antérieur</th>
                    <th className="py-3 px-4 font-semibold">Statut dossier</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReinscriptionStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                        Aucun dossier ne correspond aux filtres sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    filteredReinscriptionStudents.map((stu) => {
                      const cls = state.classes.find((c) => c.id === stu.classId);
                      const parent = state.parents.find((p) => p.id === stu.parentId);
                      const bal = getStudentBalance(stu);
                      const latestRec = latestReenrollmentByStudent.get(stu.id);
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
                                <div className="text-xs font-mono text-slate-500">
                                  {stu.cardId} · Année {stu.academicYear}
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
                            <div className="text-xs font-mono text-slate-500">
                              {parent?.phone || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {bal.remaining === 0 ? (
                              <span className="font-semibold text-emerald-700">0 FCFA (Soldé)</span>
                            ) : (
                              <span className="font-semibold text-red-700">
                                {formatFcfa(bal.remaining)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {stu.status === 'archive' && (
                              <span className="font-semibold text-amber-700">
                                À réinscrire (Archivé)
                              </span>
                            )}
                            {stu.status === 'reinscrit' && (
                              <span className="font-semibold text-emerald-700">
                                Réinscrit · {stu.academicYear}
                              </span>
                            )}
                            {stu.status === 'inscrit' && (
                              <span className="font-semibold text-blue-900">
                                Inscrit · {stu.academicYear}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {latestRec && (
                                <button
                                  type="button"
                                  onClick={() => setReinscriptionCertModal(latestRec)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-md whitespace-nowrap"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Fiche PDF
                                </button>
                              )}
                              {canCollectCaisse && !isReadOnly && bal.remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayForm({
                                      amountPaid: Math.min(bal.remaining, 100000),
                                      method: 'Espèces',
                                      trancheLabel: 'Régularisation avant réinscription',
                                      notes: '',
                                    });
                                    setCollectTarget({
                                      student: stu,
                                      suggestedAmount: bal.remaining,
                                      trancheLabel: 'Régularisation avant réinscription',
                                    });
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
                                >
                                  Encaisser
                                </button>
                              )}
                              {canModifyScolarite && !isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => openReinscrireModal(stu)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md whitespace-nowrap"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  {stu.status === 'archive' ? 'Réinscrire' : 'Passage'}
                                </button>
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

          {/* Historique des réinscriptions */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Journal des réinscriptions ({(state.reenrollments || []).length})
                </h2>
                <p className="text-xs text-slate-500">
                  Traçabilité des passages de classe, redoublements et frais notifiés à la Caisse.
                </p>
              </div>
            </div>

            {(state.reenrollments || []).length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Aucune réinscription enregistrée pour le moment.
              </div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-slate-100">
                  {(state.reenrollments || []).map((rec) => {
                    const stu = state.students.find((s) => s.id === rec.studentId);
                    const fromCls = state.classes.find((c) => c.id === rec.fromClassId);
                    const toCls = state.classes.find((c) => c.id === rec.toClassId);
                    return (
                      <div key={rec.id} className="p-4 space-y-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900">
                              {stu ? `${stu.lastName} ${stu.firstName}` : rec.cardId}
                            </div>
                            <div className="font-mono text-slate-500">
                              {rec.cardId} · {formatDateTimeFr(rec.reinscritAt)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReinscriptionCertModal(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#0B1933] bg-[#E5A923] rounded-md shrink-0"
                          >
                            <Printer className="w-3 h-3" />
                            Attestation
                          </button>
                        </div>
                        <div className="text-slate-700">
                          {rec.fromAcademicYear} ({fromCls?.name || rec.fromCycle}) →{' '}
                          <strong className="text-blue-900">
                            {rec.toAcademicYear} ({toCls?.name || rec.toCycle})
                          </strong>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                          <span>{REENROLLMENT_DECISION_LABELS[rec.decision]}</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            Frais : {formatFcfa(rec.reinscriptionFeeFcfa)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                        <th className="py-3 px-4 font-semibold">Date & Opérateur</th>
                        <th className="py-3 px-4 font-semibold">Élève & Carte</th>
                        <th className="py-3 px-4 font-semibold">Transition académique</th>
                        <th className="py-3 px-4 font-semibold">Décision</th>
                        <th className="py-3 px-4 font-semibold text-right">Frais Caisse</th>
                        <th className="py-3 px-4 font-semibold text-right">Document</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(state.reenrollments || []).map((rec) => {
                        const stu = state.students.find((s) => s.id === rec.studentId);
                        const fromCls = state.classes.find((c) => c.id === rec.fromClassId);
                        const toCls = state.classes.find((c) => c.id === rec.toClassId);
                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 text-xs">
                              <div className="font-mono text-slate-700">
                                {formatDateTimeFr(rec.reinscritAt)}
                              </div>
                              <div className="text-slate-500">{rec.reinscritBy}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">
                                {stu ? `${stu.lastName} ${stu.firstName}` : rec.studentId}
                              </div>
                              <div className="text-xs font-mono text-slate-500">{rec.cardId}</div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="flex items-center gap-1.5 text-slate-700">
                                <span>
                                  {rec.fromAcademicYear} · {fromCls?.name || rec.fromCycle}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-semibold text-blue-900">
                                  {rec.toAcademicYear} · {toCls?.name || rec.toCycle}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                {rec.toCycle} · {rec.toProgram}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs font-medium text-slate-800">
                              {REENROLLMENT_DECISION_LABELS[rec.decision]}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                              {formatFcfa(rec.reinscriptionFeeFcfa)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setReinscriptionCertModal(rec)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-md whitespace-nowrap"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Attestation PDF
                              </button>
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
        <div className="space-y-5">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Formules configurées</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
                {feeStats.count}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Cycles × Programmes actifs
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total annuel moyen</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-950">
                {formatFcfa(feeStats.avg)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Inscription + scolarité
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Fourchette tarifaire</div>
              <div className="mt-1 font-mono text-sm sm:text-base font-bold tabular-nums text-slate-900">
                {formatFcfa(feeStats.min)} – {formatFcfa(feeStats.max)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Maternelle à Lycée
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Dernière mise à jour</div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900 truncate">
                {feeStats.lastUpdatedAt ? formatDateTimeFr(feeStats.lastUpdatedAt) : 'Grille de rentrée'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 truncate">
                {feeStats.lastUpdatedBy ? `Par ${feeStats.lastUpdatedBy}` : 'Base établissement'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-900 shrink-0" />
                  Grille tarifaire annuelle (FCFA)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Frais d’inscription, scolarité annuelle, échéancier des tranches et mise à jour globale.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportFeeGridCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter CSV
                </button>
                {canModifyScolarite && !isReadOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => openBulkFeeModal('direct')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-950 border border-blue-200 bg-blue-50/80 hover:bg-blue-100 rounded-lg whitespace-nowrap shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Édition rapide
                    </button>
                    <button
                      type="button"
                      onClick={() => openBulkFeeModal('adjust')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      Mise à jour globale
                    </button>
                    <button
                      type="button"
                      onClick={openCreateFeeModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Nouveau tarif
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
                {(['all', ...PROGRAMS] as const).map((prog) => (
                  <button
                    key={prog}
                    type="button"
                    onClick={() => setFeeProgramFilter(prog)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      feeProgramFilter === prog
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {prog === 'all' ? 'Tous programmes' : `Programme ${prog}`}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={feeSearch}
                  onChange={(e) => setFeeSearch(e.target.value)}
                  placeholder="Filtrer par cycle ou programme…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredFeeGrid.map((fee) => {
                const total = fee.registrationFee + fee.annualTuition;
                const instSum = fee.installments.reduce((s, t) => s + t.amount, 0);
                const gap = total - instSum;
                const activeCount = state.students.filter(
                  (s) => s.status !== 'archive' && s.cycle === fee.cycle && s.program === fee.program
                ).length;
                return (
                  <div key={fee.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">
                          {fee.cycle} · {fee.program}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                          {activeCount} élève(s) actif(s)
                          {fee.updatedAt ? ` · MAJ ${formatDateFr(fee.updatedAt)}` : ''}
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold text-sm tabular-nums text-blue-950">
                        {formatFcfa(total)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                      <div>
                        <span className="text-slate-500 block">Inscription</span>
                        <span className="font-mono font-semibold tabular-nums text-slate-900">
                          {formatFcfa(fee.registrationFee)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Scolarité annuelle</span>
                        <span className="font-mono font-semibold tabular-nums text-slate-900">
                          {formatFcfa(fee.annualTuition)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      {fee.installments.map((inst, idx) => (
                        <div
                          key={`${fee.id}-m-${idx}`}
                          className="flex items-center justify-between text-slate-600"
                        >
                          <span className="truncate pr-2">
                            {inst.label} · <span className="font-mono">{formatDateFr(inst.dueDate)}</span>
                          </span>
                          <span className="font-mono tabular-nums font-medium text-slate-900 shrink-0">
                            {formatFcfa(inst.amount)}
                          </span>
                        </div>
                      ))}
                      {gap !== 0 && (
                        <div className="text-[11px] font-medium text-amber-700">
                          Écart échéancier : {formatFcfa(Math.abs(gap))}
                        </div>
                      )}
                    </div>

                    {canModifyScolarite && !isReadOnly && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {confirmDeleteFeeId === fee.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDeleteFee(fee.id)}
                              disabled={busy}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg"
                            >
                              Confirmer suppression
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFeeId(null)}
                              className="px-2.5 py-1.5 text-xs text-slate-600"
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <>
                            {activeCount === 0 && state.feeGrid.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteFeeId(fee.id)}
                                className="px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                              >
                                Supprimer
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditFeeModal(fee)}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-100"
                            >
                              Modifier tarif & tranches
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Spreadsheet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Cycle & Programme</th>
                    <th className="py-3 px-4 font-semibold text-right">Inscription</th>
                    <th className="py-3 px-4 font-semibold text-right">Scolarité annuelle</th>
                    <th className="py-3 px-4 font-semibold text-right">Total annuel</th>
                    <th className="py-3 px-4 font-semibold">Échéancier des tranches</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFeeGrid.map((fee) => {
                    const total = fee.registrationFee + fee.annualTuition;
                    const instSum = fee.installments.reduce((s, t) => s + t.amount, 0);
                    const gap = total - instSum;
                    const activeCount = state.students.filter(
                      (s) =>
                        s.status !== 'archive' &&
                        s.cycle === fee.cycle &&
                        s.program === fee.program
                    ).length;

                    return (
                      <tr key={fee.id} className="hover:bg-slate-50/90 align-top">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{fee.cycle}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Programme {fee.program} ·{' '}
                            <span className="font-mono tabular-nums">{activeCount} élève(s)</span>
                          </div>
                          {fee.updatedAt && (
                            <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                              MAJ {formatDateFr(fee.updatedAt)}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatFcfa(fee.registrationFee)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatFcfa(fee.annualTuition)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-blue-950 whitespace-nowrap">
                          {formatFcfa(total)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1 text-xs">
                            {fee.installments.map((t, idx) => (
                              <div
                                key={`${fee.id}-${idx}`}
                                className="flex items-center justify-between gap-4 text-slate-600"
                              >
                                <span className="truncate">
                                  {t.label}{' '}
                                  <span className="text-slate-400 font-mono">
                                    ({formatDateFr(t.dueDate)})
                                  </span>
                                </span>
                                <span className="font-mono tabular-nums text-slate-800 shrink-0">
                                  {formatFcfa(t.amount)}
                                </span>
                              </div>
                            ))}
                            {gap !== 0 && (
                              <div className="text-[11px] font-medium text-amber-700 pt-0.5">
                                Écart vs total : {formatFcfa(Math.abs(gap))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {canModifyScolarite && !isReadOnly ? (
                            <div className="inline-flex items-center gap-1.5">
                              {confirmDeleteFeeId === fee.id ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleDeleteFee(fee.id)}
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700"
                                  >
                                    Confirmer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteFeeId(null)}
                                    className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
                                  >
                                    Annuler
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditFeeModal(fee)}
                                    className="px-2.5 py-1 text-xs font-medium text-slate-800 border border-slate-200 rounded hover:bg-slate-100"
                                  >
                                    Modifier
                                  </button>
                                  {activeCount === 0 && state.feeGrid.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteFeeId(fee.id)}
                                      title="Supprimer cette formule inutilisée"
                                      aria-label="Supprimer cette formule"
                                      className="p-1.5 text-slate-500 hover:text-red-700 border border-slate-200 rounded hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Lecture seule</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredFeeGrid.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-xs text-slate-500">
                        Aucune formule tarifaire ne correspond à ce filtre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
      {reinscrireStudent && (() => {
        const currentBal = getStudentBalance(reinscrireStudent);
        const currentCls = state.classes.find((c) => c.id === reinscrireStudent.classId);
        const matchingClasses = state.classes.filter(
          (c) =>
            c.cycle === reinscrireForm.nextCycle && c.program === reinscrireForm.nextProgram
        );
        const fallbackClasses = state.classes.filter((c) => c.cycle === reinscrireForm.nextCycle);
        const targetClassOptions =
          matchingClasses.length > 0
            ? matchingClasses
            : fallbackClasses.length > 0
              ? fallbackClasses
              : state.classes;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <form
              onSubmit={handleReinscrireSubmit}
              className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Réinscription sans ressaisie · {reinscrireStudent.cardId}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    L’identifiant carte unique est conservé (RG-01) et une notification est émise vers la Caisse.
                  </p>
                </div>
              </div>

              {/* Existing student summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <StudentAvatar
                    photoUrl={reinscrireStudent.photoUrl}
                    firstName={reinscrireStudent.firstName}
                    lastName={reinscrireStudent.lastName}
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">
                      {reinscrireStudent.lastName} {reinscrireStudent.firstName}
                    </div>
                    <div className="text-xs text-slate-600">
                      Actuel : {reinscrireStudent.cycle} · {currentCls?.name || 'Non affecté'} (
                      {reinscrireStudent.program}) · {reinscrireStudent.academicYear}
                    </div>
                  </div>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Solde antérieur
                  </div>
                  <div
                    className={`font-mono text-sm font-bold tabular-nums ${
                      currentBal.remaining > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatFcfa(currentBal.remaining)}
                  </div>
                </div>
              </div>

              {currentBal.remaining > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 space-y-2 text-xs text-amber-950">
                  <div className="flex items-start gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      Solde antérieur impayé de {formatFcfa(currentBal.remaining)} détecté sur le dossier financier.
                    </span>
                  </div>
                  <label className="flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reinscrireForm.allowWithUnpaidBalance}
                      onChange={(e) =>
                        setReinscrireForm({
                          ...reinscrireForm,
                          allowWithUnpaidBalance: e.target.checked,
                        })
                      }
                      className="rounded border-amber-400"
                    />
                    Autoriser exceptionnellement la réinscription malgré le solde impayé
                  </label>
                </div>
              )}

              {/* Academic transition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Décision académique
                  </label>
                  <select
                    value={reinscrireForm.decision}
                    onChange={(e) =>
                      handleReinscrireDecisionChange(
                        reinscrireStudent,
                        e.target.value as ReenrollmentDecision
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {(Object.keys(REENROLLMENT_DECISION_LABELS) as ReenrollmentDecision[]).map((d) => (
                      <option key={d} value={d}>
                        {REENROLLMENT_DECISION_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Année académique cible
                  </label>
                  <input
                    type="text"
                    required
                    value={reinscrireForm.nextAcademicYear}
                    onChange={(e) =>
                      setReinscrireForm({ ...reinscrireForm, nextAcademicYear: e.target.value })
                    }
                    placeholder="2026-2027"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nouveau cycle
                  </label>
                  <select
                    value={reinscrireForm.nextCycle}
                    onChange={(e) => {
                      const nextCycle = e.target.value as SchoolCycle;
                      const firstCls =
                        state.classes.find(
                          (c) => c.cycle === nextCycle && c.program === reinscrireForm.nextProgram
                        ) || state.classes.find((c) => c.cycle === nextCycle);
                      const nextFee = getFeeForReinscription(
                        { feeGrid: state.feeGrid },
                        nextCycle,
                        reinscrireForm.nextProgram
                      );
                      setReinscrireForm({
                        ...reinscrireForm,
                        nextCycle,
                        nextClassId: firstCls?.id || '',
                        feeAmount: nextFee,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {CYCLES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Programme
                  </label>
                  <select
                    value={reinscrireForm.nextProgram}
                    onChange={(e) => {
                      const nextProgram = e.target.value as SchoolProgram;
                      const firstCls = state.classes.find(
                        (c) => c.cycle === reinscrireForm.nextCycle && c.program === nextProgram
                      );
                      const nextFee = getFeeForReinscription(
                        { feeGrid: state.feeGrid },
                        reinscrireForm.nextCycle,
                        nextProgram
                      );
                      setReinscrireForm({
                        ...reinscrireForm,
                        nextProgram,
                        nextClassId: firstCls?.id || reinscrireForm.nextClassId,
                        feeAmount: nextFee,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {PROGRAMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Classe d’affectation
                  </label>
                  <select
                    value={reinscrireForm.nextClassId}
                    onChange={(e) =>
                      setReinscrireForm({ ...reinscrireForm, nextClassId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">À affecter ultérieurement</option>
                    {targetClassOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.cycle} · {c.program})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Frais notifiés à la Caisse (FCFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={reinscrireForm.feeAmount}
                    onChange={(e) =>
                      setReinscrireForm({
                        ...reinscrireForm,
                        feeAmount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono font-semibold border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Parent Contact Verification */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">
                  Vérification des contacts Parent / Tuteur
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Téléphone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={reinscrireForm.parentPhone}
                      onChange={(e) =>
                        setReinscrireForm({ ...reinscrireForm, parentPhone: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={reinscrireForm.parentEmail}
                      onChange={(e) =>
                        setReinscrireForm({ ...reinscrireForm, parentEmail: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Adresse
                    </label>
                    <input
                      type="text"
                      value={reinscrireForm.parentAddress}
                      onChange={(e) =>
                        setReinscrireForm({ ...reinscrireForm, parentAddress: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observations (conseil de classe / dossier)
                </label>
                <input
                  type="text"
                  value={reinscrireForm.notes}
                  onChange={(e) => setReinscrireForm({ ...reinscrireForm, notes: e.target.value })}
                  placeholder="Ex. Passage admis par le conseil de classe..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReinscrireStudent(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy || (currentBal.remaining > 0 && !reinscrireForm.allowWithUnpaidBalance)}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg"
                >
                  {busy ? 'Validation...' : 'Valider la réinscription'}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* MODAL: BATCH CLASS PROMOTION / REINSCRIPTION */}
      {showBatchReinscrireModal && (() => {
        const visibleBatchStudents = state.students.filter((s) =>
          batchSourceFilter === 'a_reinscrire' ? s.status === 'archive' : true
        );
        const selectedCount = visibleBatchStudents.filter((s) => batchSelection[s.id]?.selected).length;
        const allChecked =
          visibleBatchStudents.length > 0 && selectedCount === visibleBatchStudents.length;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <form
              onSubmit={handleBatchReinscrireSubmit}
              className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto"
            >
              <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div>
                  <h3 className="font-display text-base sm:text-lg font-bold text-slate-900">
                    Passage de classe & Réinscription en lot
                  </h3>
                  <p className="text-xs text-slate-500">
                    Affectez plusieurs élèves vers leur nouvelle classe en conservant leur carte scolaire (RG-01).
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-blue-900 tabular-nums">
                  {selectedCount} élève(s) sélectionné(s)
                </span>
              </div>

              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Année cible
                    </label>
                    <input
                      type="text"
                      required
                      value={batchTargetYear}
                      onChange={(e) => setBatchTargetYear(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Décision par défaut
                    </label>
                    <select
                      value={batchDecision}
                      onChange={(e) => {
                        const mode = e.target.value as 'passage' | 'redoublement';
                        setBatchDecision(mode);
                        const nextMap = { ...batchSelection };
                        for (const stu of state.students) {
                          const sug = suggestNextClassAndCycle({ classes: state.classes }, stu, mode);
                          nextMap[stu.id] = {
                            selected: nextMap[stu.id]?.selected ?? false,
                            nextCycle: sug.nextCycle,
                            nextProgram: sug.nextProgram,
                            nextClassId: sug.nextClassId || '',
                          };
                        }
                        setBatchSelection(nextMap);
                      }}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="passage">Passage en classe supérieure</option>
                      <option value="redoublement">Maintien / Redoublement</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Périmètre élèves
                    </label>
                    <select
                      value={batchSourceFilter}
                      onChange={(e) =>
                        setBatchSourceFilter(e.target.value as 'all' | 'a_reinscrire')
                      }
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="all">Tous les élèves ({state.students.length})</option>
                      <option value="a_reinscrire">
                        Archivés uniquement ({reinscriptionStats.archivedCount})
                      </option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pb-1.5">
                      <input
                        type="checkbox"
                        checked={batchSkipUnpaid}
                        onChange={(e) => setBatchSkipUnpaid(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Ignorer soldes impayés
                    </label>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                        <th className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const nextMap = { ...batchSelection };
                              for (const stu of visibleBatchStudents) {
                                if (nextMap[stu.id]) {
                                  nextMap[stu.id] = { ...nextMap[stu.id], selected: checked };
                                }
                              }
                              setBatchSelection(nextMap);
                            }}
                            aria-label="Tout sélectionner"
                          />
                        </th>
                        <th className="py-2.5 px-3 font-semibold">Élève & Carte</th>
                        <th className="py-2.5 px-3 font-semibold">Situation actuelle</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Solde antérieur</th>
                        <th className="py-2.5 px-3 font-semibold">Cycle cible</th>
                        <th className="py-2.5 px-3 font-semibold">Classe cible</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleBatchStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500">
                            Aucun élève dans ce périmètre.
                          </td>
                        </tr>
                      ) : (
                        visibleBatchStudents.map((stu) => {
                          const bal = getStudentBalance(stu);
                          const currentCls = state.classes.find((c) => c.id === stu.classId);
                          const cfg = batchSelection[stu.id] || {
                            selected: false,
                            nextCycle: stu.cycle,
                            nextProgram: stu.program,
                            nextClassId: stu.classId || '',
                          };
                          const cycleClasses = state.classes.filter(
                            (c) => c.cycle === cfg.nextCycle
                          );
                          const classChoices =
                            cycleClasses.length > 0 ? cycleClasses : state.classes;

                          return (
                            <tr key={stu.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3">
                                <input
                                  type="checkbox"
                                  checked={cfg.selected}
                                  onChange={(e) =>
                                    setBatchSelection({
                                      ...batchSelection,
                                      [stu.id]: { ...cfg, selected: e.target.checked },
                                    })
                                  }
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-900">
                                  {stu.lastName} {stu.firstName}
                                </div>
                                <div className="font-mono text-slate-500">{stu.cardId}</div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {stu.cycle} · {currentCls?.name || 'Non affecté'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                <span
                                  className={
                                    bal.remaining > 0
                                      ? 'font-semibold text-red-700'
                                      : 'text-emerald-700'
                                  }
                                >
                                  {formatFcfa(bal.remaining)}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <select
                                  value={cfg.nextCycle}
                                  onChange={(e) => {
                                    const nextCycle = e.target.value as SchoolCycle;
                                    const firstCls = state.classes.find(
                                      (c) => c.cycle === nextCycle
                                    );
                                    setBatchSelection({
                                      ...batchSelection,
                                      [stu.id]: {
                                        ...cfg,
                                        nextCycle,
                                        nextClassId: firstCls?.id || '',
                                      },
                                    });
                                  }}
                                  className="px-2 py-1 border border-slate-300 rounded bg-white"
                                >
                                  {CYCLES.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2.5 px-3">
                                <select
                                  value={cfg.nextClassId}
                                  onChange={(e) =>
                                    setBatchSelection({
                                      ...batchSelection,
                                      [stu.id]: { ...cfg, nextClassId: e.target.value },
                                    })
                                  }
                                  className="px-2 py-1 border border-slate-300 rounded bg-white"
                                >
                                  <option value="">À affecter</option>
                                  {classChoices.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({c.program})
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Note du passage groupé
                  </label>
                  <input
                    type="text"
                    value={batchNotes}
                    onChange={(e) => setBatchNotes(e.target.value)}
                    placeholder="Ex. Délibérations conseil de classe fin d’année..."
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="px-4 py-3 sm:px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBatchReinscrireModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy || selectedCount === 0}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg"
                >
                  {busy
                    ? 'Traitement...'
                    : `Réinscrire ${selectedCount} élève(s) sélectionné(s)`}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

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

      {/* MODAL: EDIT OR CREATE FEE */}
      {editingFee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveFee}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5 my-auto"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {feeModalMode === 'create'
                    ? 'Nouvelle formule tarifaire'
                    : `Mettre à jour · ${editingFee.cycle} (${editingFee.program})`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Modifiez les frais d’inscription, la scolarité annuelle et l’échéancier des tranches.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFee(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Fermer
              </button>
            </div>

            {feeModalMode === 'create' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cycle</label>
                  <select
                    value={editingFee.cycle}
                    onChange={(e) =>
                      setEditingFee({ ...editingFee, cycle: e.target.value as SchoolCycle })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {CYCLES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Programme
                  </label>
                  <select
                    value={editingFee.program}
                    onChange={(e) =>
                      setEditingFee({ ...editingFee, program: e.target.value as SchoolProgram })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {PROGRAMS.map((p) => (
                      <option key={p} value={p}>
                        Programme {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Frais d’inscription (FCFA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  required
                  value={editingFee.registrationFee}
                  onChange={(e) =>
                    setEditingFee({ ...editingFee, registrationFee: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scolarité annuelle (FCFA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  required
                  value={editingFee.annualTuition}
                  onChange={(e) =>
                    setEditingFee({ ...editingFee, annualTuition: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-center">
                <span className="text-[11px] font-medium text-slate-500">Total annuel calculé</span>
                <span className="font-mono text-base font-bold tabular-nums text-blue-950">
                  {formatFcfa(editingFee.registrationFee + editingFee.annualTuition)}
                </span>
              </div>
            </div>

            {/* Installments Schedule Editor */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Échéancier des tranches de paiement
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Sert de référence aux encaissements Caisse et au suivi des retards en Recouvrement.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingFee({
                        ...editingFee,
                        installments: distributeFeeInstallments(
                          editingFee.registrationFee,
                          editingFee.annualTuition,
                          editingFee.installments,
                          500
                        ),
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Répartir automatiquement
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingFee({
                        ...editingFee,
                        installments: [
                          ...editingFee.installments,
                          {
                            label: `${editingFee.installments.length + 1}ème Tranche`,
                            amount: 0,
                            dueDate: '2027-05-15',
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter tranche
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {editingFee.installments.map((inst, idx) => (
                  <div
                    key={`edit-inst-${idx}`}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 bg-slate-50/70"
                  >
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] text-slate-500 mb-0.5">Libellé</label>
                      <input
                        type="text"
                        required
                        value={inst.label}
                        onChange={(e) => {
                          const next = [...editingFee.installments];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setEditingFee({ ...editingFee, installments: next });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Montant (FCFA)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        required
                        value={inst.amount}
                        onChange={(e) => {
                          const next = [...editingFee.installments];
                          next[idx] = { ...next[idx], amount: Number(e.target.value) };
                          setEditingFee({ ...editingFee, installments: next });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Date d’échéance
                      </label>
                      <input
                        type="date"
                        required
                        value={inst.dueDate}
                        onChange={(e) => {
                          const next = [...editingFee.installments];
                          next[idx] = { ...next[idx], dueDate: e.target.value };
                          setEditingFee({ ...editingFee, installments: next });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end sm:pt-4">
                      {editingFee.installments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = editingFee.installments.filter((_, i) => i !== idx);
                            setEditingFee({ ...editingFee, installments: next });
                          }}
                          aria-label="Supprimer cette tranche"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {(() => {
                const expectedTotal = editingFee.registrationFee + editingFee.annualTuition;
                const instTotal = editingFee.installments.reduce((s, i) => s + (i.amount || 0), 0);
                const diff = expectedTotal - instTotal;
                return (
                  <div
                    className={`p-3 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
                      diff === 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <span>
                      Somme des tranches :{' '}
                      <strong className="font-mono tabular-nums">{formatFcfa(instTotal)}</strong> sur{' '}
                      <strong className="font-mono tabular-nums">{formatFcfa(expectedTotal)}</strong>
                    </span>
                    {diff === 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Échéancier équilibré
                      </span>
                    ) : (
                      <span className="font-semibold font-mono tabular-nums">
                        Écart : {diff > 0 ? `+${formatFcfa(diff)}` : `-${formatFcfa(Math.abs(diff))}`}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingFee(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                {feeModalMode === 'create' ? 'Créer la formule' : 'Enregistrer les tarifs'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: BULK FEE GRID UPDATE */}
      {showBulkFeeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleBulkFeeSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5 my-auto"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Mise à jour globale de la grille tarifaire
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Révisez l’ensemble des tarifs en pourcentage, en montant fixe ou via édition matricielle directe.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                <button
                  type="button"
                  onClick={() => setBulkFeeMode('adjust')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
                    bulkFeeMode === 'adjust'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Révision % / Montant
                </button>
                <button
                  type="button"
                  onClick={() => setBulkFeeMode('direct')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
                    bulkFeeMode === 'direct'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tableau multi-lignes
                </button>
              </div>
            </div>

            {bulkFeeMode === 'adjust' ? (
              <div className="space-y-4">
                {/* Parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mode d’ajustement
                    </label>
                    <select
                      value={bulkAdjustType}
                      onChange={(e) => setBulkAdjustType(e.target.value as 'percent' | 'fixed')}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="percent">Pourcentage (%)</option>
                      <option value="fixed">Montant fixe (FCFA)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Variation Inscription ({bulkAdjustType === 'percent' ? '%' : 'FCFA'})
                    </label>
                    <input
                      type="number"
                      step={bulkAdjustType === 'percent' ? '0.5' : '500'}
                      value={bulkRegDelta}
                      onChange={(e) => setBulkRegDelta(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Variation Scolarité ({bulkAdjustType === 'percent' ? '%' : 'FCFA'})
                    </label>
                    <input
                      type="number"
                      step={bulkAdjustType === 'percent' ? '0.5' : '500'}
                      value={bulkTuitionDelta}
                      onChange={(e) => setBulkTuitionDelta(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Arrondi FCFA
                    </label>
                    <select
                      value={bulkRoundTo}
                      onChange={(e) => setBulkRoundTo(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value={500}>Multiple de 500 FCFA</option>
                      <option value={1000}>Multiple de 1 000 FCFA</option>
                      <option value={0}>Exact (1 FCFA)</option>
                    </select>
                  </div>
                </div>

                {/* Optional tranche due dates */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Nouvelles dates d’échéance (optionnel — laisser vide pour conserver)
                    </span>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkRebalanceInstallments}
                        onChange={(e) => setBulkRebalanceInstallments(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Recalculer proportionnellement les tranches
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[0, 1, 2].map((idx) => (
                      <div key={`due-${idx}`}>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Échéance Tranche {idx + 1}
                        </label>
                        <input
                          type="date"
                          value={bulkDueDates[idx]}
                          onChange={(e) => {
                            const next: [string, string, string] = [...bulkDueDates] as [
                              string,
                              string,
                              string,
                            ];
                            next[idx] = e.target.value;
                            setBulkDueDates(next);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Target Selector & Preview Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      Aperçu avant / après ({bulkPreviewRows.length} formule(s) sélectionnée(s))
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setBulkFeeTargetIds(
                          bulkFeeTargetIds.length === state.feeGrid.length
                            ? []
                            : state.feeGrid.map((f) => f.id)
                        )
                      }
                      className="text-blue-900 font-semibold hover:underline"
                    >
                      {bulkFeeTargetIds.length === state.feeGrid.length
                        ? 'Tout désélectionner'
                        : 'Tout sélectionner'}
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-64">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                          <th className="py-2 px-3 w-8" />
                          <th className="py-2 px-3 font-semibold">Cycle & Programme</th>
                          <th className="py-2 px-3 font-semibold text-right">Total actuel</th>
                          <th className="py-2 px-3 font-semibold text-right">Nouveau total</th>
                          <th className="py-2 px-3 font-semibold text-right">Écart</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {state.feeGrid.map((fee) => {
                          const checked = bulkFeeTargetIds.includes(fee.id);
                          const preview = bulkPreviewRows.find((r) => r.before.id === fee.id);
                          const oldTotal = fee.registrationFee + fee.annualTuition;
                          return (
                            <tr key={`bulk-prev-${fee.id}`} className="hover:bg-slate-50">
                              <td className="py-2 px-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setBulkFeeTargetIds((prev) =>
                                      prev.includes(fee.id)
                                        ? prev.filter((id) => id !== fee.id)
                                        : [...prev, fee.id]
                                    )
                                  }
                                />
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900">
                                {fee.cycle} · {fee.program}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                                {formatFcfa(oldTotal)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-blue-950">
                                {preview ? formatFcfa(preview.newTotal) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">
                                {preview ? (
                                  <span
                                    className={
                                      preview.delta > 0
                                        ? 'text-emerald-700 font-semibold'
                                        : preview.delta < 0
                                          ? 'text-amber-700 font-semibold'
                                          : 'text-slate-400'
                                    }
                                  >
                                    {preview.delta > 0 ? `+${formatFcfa(preview.delta)}` : formatFcfa(preview.delta)}
                                  </span>
                                ) : (
                                  'Inchangé'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    Modifiez directement les montants ci-dessous puis enregistrez toute la grille en une fois.
                  </span>
                  <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={bulkRebalanceInstallments}
                      onChange={(e) => setBulkRebalanceInstallments(e.target.checked)}
                    />
                    Auto-répartir les tranches
                  </label>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-80">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                        <th className="py-2.5 px-3 font-semibold">Formule</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Inscription (FCFA)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Scolarité annuelle (FCFA)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Total annuel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.feeGrid.map((fee) => {
                        const row = bulkDirectDraft[fee.id] || {
                          registrationFee: fee.registrationFee,
                          annualTuition: fee.annualTuition,
                        };
                        return (
                          <tr key={`direct-${fee.id}`} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {fee.cycle} · {fee.program}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step={500}
                                value={row.registrationFee}
                                onChange={(e) =>
                                  setBulkDirectDraft((prev) => ({
                                    ...prev,
                                    [fee.id]: {
                                      ...row,
                                      registrationFee: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-32 px-2 py-1 text-right font-mono tabular-nums border border-slate-300 rounded"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step={500}
                                value={row.annualTuition}
                                onChange={(e) =>
                                  setBulkDirectDraft((prev) => ({
                                    ...prev,
                                    [fee.id]: {
                                      ...row,
                                      annualTuition: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-36 px-2 py-1 text-right font-mono tabular-nums border border-slate-300 rounded"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-blue-950">
                              {formatFcfa(row.registrationFee + row.annualTuition)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowBulkFeeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                Appliquer la mise à jour globale
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

      {reinscriptionCertModal && (() => {
        const stu = state.students.find((s) => s.id === reinscriptionCertModal.studentId);
        if (!stu) return null;
        return (
          <ReinscriptionCertificateModal
            record={reinscriptionCertModal}
            student={stu}
            fromClass={state.classes.find((c) => c.id === reinscriptionCertModal.fromClassId)}
            toClass={state.classes.find((c) => c.id === reinscriptionCertModal.toClassId)}
            parent={state.parents.find((p) => p.id === stu.parentId)}
            settings={state.settings}
            onClose={() => setReinscriptionCertModal(null)}
          />
        );
      })()}
    </div>
  );
};
