import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calculator,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  XCircle,
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from '../api';
import { resolveFeeGridItem } from '../shared/schoolEngine';
import type {
  Bulletin,
  Grade,
  GradeValidationStatus,
  MentionThreshold,
  SchoolCycle,
  SchoolProgram,
  Student,
} from '../types';
import { downloadGradesExcelTemplate, parseGradesExcelFile } from '../utils/excel';
import { CYCLES, formatDateFr, formatDateTimeFr, formatFcfa, PROGRAMS } from '../utils/format';
import { BulletinModal, StudentAvatar, StudentCardModal } from './PrintableDocs';

type SecretariatTab = 'notes' | 'bulletins' | 'classes' | 'periodes';
type GradeEntryMode = 'classe' | 'eleve';

interface GradeDraft {
  slots: string[];
  appreciation: string;
  overrideReason: string;
  dirty: boolean;
}

function parseNoteSlot(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 'invalid';
  const num = Number(trimmed);
  if (Number.isNaN(num) || num < 0 || num > 20) return 'invalid';
  return Math.round(num * 100) / 100;
}

function getMentionForScore(score: number, thresholds: MentionThreshold[]): string {
  const sorted = [...thresholds].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (score >= t.minScore) return t.label;
  }
  return 'Insuffisant';
}

function getSuggestedAppreciation(avg: number): string {
  if (avg >= 16) return 'Excellent travail, félicitations.';
  if (avg >= 14) return 'Très bon travail, continuez ainsi.';
  if (avg >= 12) return 'Ensemble satisfaisant, peut encore progresser.';
  if (avg >= 10) return 'Résultats moyens, approfondir le travail personnel.';
  return 'Résultats insuffisants, efforts soutenus attendus.';
}

export const SecretariatView: React.FC<{
  state: AppState;
  session: SessionUser;
  initialTab?: SecretariatTab;
  onRefresh: () => Promise<void>;
}> = ({ state, session, initialTab, onRefresh }) => {
  const canRecordGrades =
    session.role === 'enseignant' ||
    session.role === 'secretariat' ||
    session.role === 'admin';
  const canValidateGrades =
    session.role === 'scolarite' || session.role === 'admin';
  const canManageAcademic =
    session.role === 'secretariat' || session.role === 'admin';
  const isReadOnly = session.role === 'direction' || !canManageAcademic;
  const notesReadOnly = !canRecordGrades;
  const showOnlyNotesTab =
    session.role === 'enseignant' || session.role === 'scolarite';

  const [activeTab, setActiveTab] = useState<SecretariatTab>(
    showOnlyNotesTab ? 'notes' : initialTab || 'notes'
  );

  useEffect(() => {
    if (showOnlyNotesTab) {
      setActiveTab('notes');
    } else if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, showOnlyNotesTab]);

  const [selectedPeriodId, setSelectedPeriodId] = useState(
    () => state.periods.find((p) => p.status === 'ouvert')?.id || state.periods[0]?.id || ''
  );
  const [selectedClassId, setSelectedClassId] = useState(
    state.classes[1]?.id || state.classes[0]?.id || ''
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [entryMode, setEntryMode] = useState<GradeEntryMode>('classe');
  const [evalSlotCount, setEvalSlotCount] = useState(2);
  const [batchOverrideReason, setBatchOverrideReason] = useState('');
  const [validationFilter, setValidationFilter] = useState<
    'en_attente' | 'rejete' | 'valide' | 'all'
  >('en_attente');
  const [rejectTarget, setRejectTarget] = useState<{
    gradeIds: string[];
    label: string;
  } | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Local draft grades keyed by `${studentId}::${subjectId}`
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, GradeDraft>>({});

  // Modals
  const [bulletinModal, setBulletinModal] = useState<{
    bulletin: Bulletin;
    student: Student;
  } | null>(null);
  const [cardStudent, setCardStudent] = useState<Student | null>(null);
  const [deliverModal, setDeliverModal] = useState<Bulletin | null>(null);
  const [receivedByInput, setReceivedByInput] = useState('');
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  const [classForm, setClassForm] = useState({
    name: '',
    cycle: 'Collège' as SchoolCycle,
    program: 'Congolais' as SchoolProgram,
    room: '',
    capacity: 32,
    headTeacher: '',
    registrationFee: 45000,
    annualTuition: 270000,
  });
  const [subjectForm, setSubjectForm] = useState({
    code: '',
    name: '',
    cycle: 'Collège' as SchoolCycle,
    program: 'Congolais' as SchoolProgram,
    coefficient: 2,
    teacherName: '',
  });

  const selectedPeriod = state.periods.find((p) => p.id === selectedPeriodId);
  const selectedClass = state.classes.find((c) => c.id === selectedClassId);

  const classSubjects = useMemo(() => {
    if (!selectedClass) return [];
    return state.subjects.filter(
      (s) => s.cycle === selectedClass.cycle && s.program === selectedClass.program
    );
  }, [state.subjects, selectedClass]);

  useEffect(() => {
    if (classSubjects.length > 0 && !classSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(classSubjects[0].id);
    } else if (classSubjects.length === 0) {
      setSelectedSubjectId('');
    }
  }, [classSubjects, selectedSubjectId]);

  const classStudents = useMemo(() => {
    return state.students.filter(
      (s) => s.classId === selectedClassId && s.status !== 'archive'
    );
  }, [state.students, selectedClassId]);

  useEffect(() => {
    if (classStudents.length > 0 && !classStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(classStudents[0].id);
    } else if (classStudents.length === 0) {
      setSelectedStudentId('');
    }
  }, [classStudents, selectedStudentId]);

  // Sync grade drafts & evaluation column count when class/subject/period/student/grades change
  useEffect(() => {
    let maxNotes = 2;
    const next: Record<string, GradeDraft> = {};

    for (const stu of classStudents) {
      for (const sub of classSubjects) {
        const key = `${stu.id}::${sub.id}`;
        const existing = state.grades.find(
          (g) =>
            g.studentId === stu.id &&
            g.subjectId === sub.id &&
            g.periodId === selectedPeriodId
        );
        if (existing && existing.values.length > maxNotes) {
          maxNotes = Math.min(6, existing.values.length);
        }
        next[key] = {
          slots: existing ? existing.values.map((v) => String(v)) : ['', ''],
          appreciation: existing ? existing.teacherAppreciation : '',
          overrideReason: '',
          dirty: false,
        };
      }
    }

    setEvalSlotCount((prev) => Math.max(2, Math.min(6, Math.max(prev, maxNotes))));
    setGradeDrafts(next);
  }, [classStudents, classSubjects, state.grades, selectedPeriodId]);

  const classBulletins = useMemo(() => {
    return state.bulletins
      .filter((b) => b.classId === selectedClassId && b.periodId === selectedPeriodId)
      .sort((a, b) => a.rank - b.rank);
  }, [state.bulletins, selectedClassId, selectedPeriodId]);

  const updateDraftSlot = (
    studentId: string,
    subjectId: string,
    slotIdx: number,
    value: string
  ) => {
    const key = `${studentId}::${subjectId}`;
    setGradeDrafts((prev) => {
      const current = prev[key] || {
        slots: Array.from({ length: evalSlotCount }, () => ''),
        appreciation: '',
        overrideReason: '',
        dirty: false,
      };
      const slots = [...current.slots];
      while (slots.length <= slotIdx) slots.push('');
      slots[slotIdx] = value;
      return {
        ...prev,
        [key]: { ...current, slots, dirty: true },
      };
    });
  };

  const updateDraftField = (
    studentId: string,
    subjectId: string,
    field: 'appreciation' | 'overrideReason',
    value: string
  ) => {
    const key = `${studentId}::${subjectId}`;
    setGradeDrafts((prev) => {
      const current = prev[key] || {
        slots: Array.from({ length: evalSlotCount }, () => ''),
        appreciation: '',
        overrideReason: '',
        dirty: false,
      };
      return {
        ...prev,
        [key]: { ...current, [field]: value, dirty: true },
      };
    });
  };

  const extractRowValues = (draft?: GradeDraft) => {
    const slots = draft?.slots || [];
    const parsed = slots.map(parseNoteSlot);
    const hasInvalid = parsed.some((v) => v === 'invalid');
    const validNumbers = parsed.filter((v): v is number => typeof v === 'number');
    const avg =
      validNumbers.length > 0
        ? Math.round((validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length) * 100) / 100
        : null;
    return { hasInvalid, validNumbers, avg };
  };

  const handleSaveGrade = async (studentId: string, subjectId: string) => {
    const draft = gradeDrafts[`${studentId}::${subjectId}`];
    if (!draft) return;

    const { hasInvalid, validNumbers } = extractRowValues(draft);
    if (hasInvalid || validNumbers.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Saisissez au moins une note valide entre 0 et 20 (ex. 14,5 ou 16).',
      });
      return;
    }

    const reason = (draft.overrideReason || batchOverrideReason).trim();
    if (selectedPeriod?.status === 'verrouille' && !reason) {
      setFeedback({
        type: 'err',
        text: 'Période verrouillée : renseignez le motif de correction (RG-08) avant d’enregistrer.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        '/api/grades',
        {
          method: 'POST',
          body: JSON.stringify({
            studentId,
            subjectId,
            periodId: selectedPeriodId,
            values: validNumbers,
            teacherAppreciation: draft.appreciation,
            overrideReason: reason,
          }),
        },
        session
      );
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: 'Note enregistrée — en attente de validation par la Scolarité.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur d’enregistrement des notes.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAllGrades = async () => {
    if (!selectedPeriodId) return;

    const pairs: Array<{ studentId: string; subjectId: string }> =
      entryMode === 'classe'
        ? selectedSubjectId
          ? classStudents.map((stu) => ({ studentId: stu.id, subjectId: selectedSubjectId }))
          : []
        : selectedStudentId
          ? classSubjects.map((sub) => ({ studentId: selectedStudentId, subjectId: sub.id }))
          : [];

    const entries: Array<{
      studentId: string;
      subjectId: string;
      values: number[];
      teacherAppreciation: string;
      overrideReason?: string;
    }> = [];

    for (const pair of pairs) {
      const draft = gradeDrafts[`${pair.studentId}::${pair.subjectId}`];
      const { hasInvalid, validNumbers } = extractRowValues(draft);
      if (hasInvalid) {
        setFeedback({
          type: 'err',
          text: 'Certaines cases contiennent des notes invalides (doivent être comprises entre 0 et 20).',
        });
        return;
      }
      if (validNumbers.length > 0 && draft) {
        const existing = state.grades.find(
          (g) =>
            g.studentId === pair.studentId &&
            g.subjectId === pair.subjectId &&
            g.periodId === selectedPeriodId
        );
        // Include if modified or if not yet saved
        if (draft.dirty || !existing) {
          entries.push({
            studentId: pair.studentId,
            subjectId: pair.subjectId,
            values: validNumbers,
            teacherAppreciation: draft.appreciation,
            overrideReason: (draft.overrideReason || batchOverrideReason).trim(),
          });
        }
      }
    }

    if (entries.length === 0) {
      // Fallback: save all rows that have at least one valid note even if not dirty
      for (const pair of pairs) {
        const draft = gradeDrafts[`${pair.studentId}::${pair.subjectId}`];
        const { validNumbers } = extractRowValues(draft);
        if (validNumbers.length > 0 && draft) {
          entries.push({
            studentId: pair.studentId,
            subjectId: pair.subjectId,
            values: validNumbers,
            teacherAppreciation: draft.appreciation,
            overrideReason: (draft.overrideReason || batchOverrideReason).trim(),
          });
        }
      }
    }

    if (entries.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Aucune note saisie à enregistrer. Remplissez au moins une note (/20).',
      });
      return;
    }

    if (
      selectedPeriod?.status === 'verrouille' &&
      entries.some((e) => !e.overrideReason)
    ) {
      setFeedback({
        type: 'err',
        text: 'Période verrouillée : veuillez saisir le motif de correction (RG-08) ci-dessus.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ savedCount: number }>(
        '/api/grades/batch',
        {
          method: 'POST',
          body: JSON.stringify({
            periodId: selectedPeriodId,
            overrideReason: batchOverrideReason.trim(),
            entries,
          }),
        },
        session
      );
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `${res.savedCount} fiche(s) enregistrée(s) — en attente de validation par la Scolarité.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’enregistrement groupé.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGrade = async (studentId: string, subjectId: string) => {
    const existing = state.grades.find(
      (g) =>
        g.studentId === studentId &&
        g.subjectId === subjectId &&
        g.periodId === selectedPeriodId
    );
    const key = `${studentId}::${subjectId}`;

    if (!existing) {
      setGradeDrafts((prev) => ({
        ...prev,
        [key]: {
          slots: Array.from({ length: evalSlotCount }, () => ''),
          appreciation: '',
          overrideReason: '',
          dirty: false,
        },
      }));
      return;
    }

    const reason = (gradeDrafts[key]?.overrideReason || batchOverrideReason).trim();
    if (selectedPeriod?.status === 'verrouille' && !reason) {
      setFeedback({
        type: 'err',
        text: 'Période verrouillée : saisissez un motif de correction (RG-08) pour supprimer cette note.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/grades/${existing.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ overrideReason: reason }),
        },
        session
      );
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Note supprimée et bulletins recalculés.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la suppression.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleValidateSingle = async (
    gradeId: string,
    decision: 'valide' | 'rejete',
    reason?: string
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/grades/${gradeId}/validate`,
        {
          method: 'POST',
          body: JSON.stringify({ decision, reason }),
        },
        session
      );
      await onRefresh();
      setRejectTarget(null);
      setRejectReasonInput('');
      setFeedback({
        type: 'ok',
        text:
          decision === 'valide'
            ? 'Note validée par la Scolarité. Les moyennes, rangs et bulletins ont été mis à jour.'
            : 'Note rejetée avec motif. L’enseignant peut maintenant la corriger et la soumettre à nouveau.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la validation.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleValidateBatch = async (
    gradeIds: string[],
    decision: 'valide' | 'rejete',
    reason?: string
  ) => {
    if (gradeIds.length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ updatedCount: number }>(
        '/api/grades/validate-batch',
        {
          method: 'POST',
          body: JSON.stringify({ gradeIds, decision, reason }),
        },
        session
      );
      await onRefresh();
      setRejectTarget(null);
      setRejectReasonInput('');
      setFeedback({
        type: 'ok',
        text:
          decision === 'valide'
            ? `${res.updatedCount} fiche(s) validée(s) par la Scolarité et intégrée(s) aux bulletins.`
            : `${res.updatedCount} fiche(s) rejetée(s) avec motif.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la validation groupée.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitRejectionModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    const reason = rejectReasonInput.trim();
    if (!reason) {
      setFeedback({ type: 'err', text: 'Veuillez saisir un motif de rejet.' });
      return;
    }
    if (rejectTarget.gradeIds.length === 1) {
      await handleValidateSingle(rejectTarget.gradeIds[0], 'rejete', reason);
    } else {
      await handleValidateBatch(rejectTarget.gradeIds, 'rejete', reason);
    }
  };

  const getGradeStatus = (grade?: Grade): GradeValidationStatus => {
    return grade?.validationStatus || 'valide';
  };

  const renderValidationBadge = (grade?: Grade) => {
    if (!grade) return null;
    const status = getGradeStatus(grade);
    if (status === 'en_attente') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold rounded border border-amber-300 bg-amber-50 text-amber-900 whitespace-nowrap">
          <Clock className="w-3 h-3 shrink-0" />
          En attente Scolarité
        </span>
      );
    }
    if (status === 'rejete') {
      return (
        <span
          title={grade.rejectionReason || undefined}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold rounded border border-red-300 bg-red-50 text-red-800 whitespace-nowrap"
        >
          <XCircle className="w-3 h-3 shrink-0" />
          Rejeté Scolarité
        </span>
      );
    }
    return (
      <span
        title={grade.validatedBy ? `Validé par ${grade.validatedBy}` : undefined}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold rounded border border-emerald-300 bg-emerald-50 text-emerald-800 whitespace-nowrap"
      >
        <Check className="w-3 h-3 shrink-0" />
        Validé Scolarité
      </span>
    );
  };

  const pendingGradesAll = useMemo(() => {
    return state.grades
      .filter((g) => g.validationStatus === 'en_attente')
      .sort((a, b) => (b.submittedAt || b.updatedAt).localeCompare(a.submittedAt || a.updatedAt));
  }, [state.grades]);

  const rejectedGradesAll = useMemo(() => {
    return state.grades
      .filter((g) => g.validationStatus === 'rejete')
      .sort((a, b) => (b.validatedAt || b.updatedAt).localeCompare(a.validatedAt || a.updatedAt));
  }, [state.grades]);

  const validatedGradesAll = useMemo(() => {
    return state.grades
      .filter((g) => !g.validationStatus || g.validationStatus === 'valide')
      .sort((a, b) => (b.validatedAt || b.updatedAt).localeCompare(a.validatedAt || a.updatedAt));
  }, [state.grades]);

  const queueGrades = useMemo(() => {
    if (validationFilter === 'en_attente') return pendingGradesAll;
    if (validationFilter === 'rejete') return rejectedGradesAll;
    if (validationFilter === 'valide') return validatedGradesAll;
    return [...state.grades].sort((a, b) =>
      (b.submittedAt || b.updatedAt).localeCompare(a.submittedAt || a.updatedAt)
    );
  }, [validationFilter, pendingGradesAll, rejectedGradesAll, validatedGradesAll, state.grades]);

  const handleAutoFillAppreciations = () => {
    const pairs: Array<{ studentId: string; subjectId: string }> =
      entryMode === 'classe'
        ? selectedSubjectId
          ? classStudents.map((stu) => ({ studentId: stu.id, subjectId: selectedSubjectId }))
          : []
        : selectedStudentId
          ? classSubjects.map((sub) => ({ studentId: selectedStudentId, subjectId: sub.id }))
          : [];

    let updatedCount = 0;
    setGradeDrafts((prev) => {
      const next = { ...prev };
      for (const pair of pairs) {
        const key = `${pair.studentId}::${pair.subjectId}`;
        const draft = next[key];
        if (!draft) continue;
        const { avg } = extractRowValues(draft);
        if (avg !== null && !draft.appreciation.trim()) {
          next[key] = {
            ...draft,
            appreciation: getSuggestedAppreciation(avg),
            dirty: true,
          };
          updatedCount += 1;
        }
      }
      return next;
    });

    if (updatedCount > 0) {
      setFeedback({
        type: 'ok',
        text: `${updatedCount} appréciation(s) pré-remplie(s). Cliquez sur « Enregistrer toutes les notes » pour sauvegarder.`,
      });
    }
  };

  const handleExportGradesExcel = () => {
    if (!selectedClass || !selectedPeriod) return;
    const sub = classSubjects.find((s) => s.id === selectedSubjectId);
    if (!sub) return;

    downloadGradesExcelTemplate({
      className: selectedClass.name,
      subjectName: sub.name,
      periodLabel: selectedPeriod.label,
      rows: classStudents.map((stu) => {
        const draft = gradeDrafts[`${stu.id}::${sub.id}`];
        const { validNumbers } = extractRowValues(draft);
        return {
          cardId: stu.cardId,
          fullName: `${stu.lastName} ${stu.firstName}`,
          values: validNumbers,
          teacherAppreciation: draft?.appreciation || '',
        };
      }),
    });
  };

  const handleImportGradesExcel = async (file: File) => {
    if (!selectedSubjectId) return;
    try {
      const imported = await parseGradesExcelFile(file);
      let maxFound = evalSlotCount;
      let matchedCount = 0;

      setGradeDrafts((prev) => {
        const next = { ...prev };
        for (const row of imported) {
          const stu =
            classStudents.find((s) => s.cardId.toUpperCase() === row.cardId) ||
            classStudents.find(
              (s) =>
                `${s.lastName} ${s.firstName}`.toLowerCase() === row.studentName.toLowerCase() ||
                `${s.firstName} ${s.lastName}`.toLowerCase() === row.studentName.toLowerCase()
            );
          if (!stu) continue;

          const validVals = row.values.filter((v) => v >= 0 && v <= 20);
          if (validVals.length === 0) continue;

          if (validVals.length > maxFound) {
            maxFound = Math.min(6, validVals.length);
          }

          const key = `${stu.id}::${selectedSubjectId}`;
          const prevDraft = next[key];
          next[key] = {
            slots: validVals.slice(0, 6).map((v) => String(v)),
            appreciation: row.teacherAppreciation || prevDraft?.appreciation || '',
            overrideReason: prevDraft?.overrideReason || '',
            dirty: true,
          };
          matchedCount += 1;
        }
        return next;
      });

      if (maxFound > evalSlotCount) {
        setEvalSlotCount(maxFound);
      }

      if (matchedCount === 0) {
        setFeedback({
          type: 'err',
          text: 'Aucun élève de cette classe n’a pu être associé aux ID Cartes du fichier Excel.',
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `${matchedCount} élève(s) chargé(s) depuis Excel. Vérifiez puis cliquez sur « Enregistrer toutes les notes ».`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la lecture du fichier Excel.',
      });
    }
  };

  const handleRecalculateBulletins = async () => {
    if (!selectedClassId || !selectedPeriodId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ bulletins: Bulletin[] }>(
        '/api/bulletins/recalculate',
        {
          method: 'POST',
          body: JSON.stringify({ classId: selectedClassId, periodId: selectedPeriodId }),
        },
        session
      );
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `${res.bulletins.length} bulletin(s) calculé(s) avec classement et mentions.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de calcul des bulletins.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateDelivery = async (
    bulletin: Bulletin,
    nextStatus: Bulletin['deliveryStatus'],
    receivedBy?: string
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/bulletins/${bulletin.id}/delivery`,
        {
          method: 'POST',
          body: JSON.stringify({ deliveryStatus: nextStatus, receivedBy }),
        },
        session
      );
      await onRefresh();
      setDeliverModal(null);
      setReceivedByInput('');
      setFeedback({ type: 'ok', text: `Statut du bulletin mis à jour : ${nextStatus}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Transition non autorisée.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePeriodLock = async (periodId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/periods/${periodId}/toggle-lock`, { method: 'POST' }, session);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Statut de la période mis à jour.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de verrouillage.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAssignStudentClass = async (studentId: string, classId: string) => {
    setBusy(true);
    try {
      await apiRequest(
        `/api/students/${studentId}`,
        { method: 'PUT', body: JSON.stringify({ classId: classId || null }) },
        session
      );
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Affectation de classe mise à jour.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur d’affectation.',
      });
    } finally {
      setBusy(false);
    }
  };

  const openCreateClassModal = () => {
    const baseFee = resolveFeeGridItem(
      { feeGrid: state.feeGrid },
      { cycle: classForm.cycle, program: classForm.program }
    );
    setClassForm((prev) => ({
      ...prev,
      registrationFee: baseFee?.registrationFee ?? 45000,
      annualTuition: baseFee?.annualTuition ?? 270000,
    }));
    setShowClassModal(true);
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/api/classes', { method: 'POST', body: JSON.stringify(classForm) }, session);
      await onRefresh();
      setShowClassModal(false);
      setClassForm((prev) => ({ ...prev, name: '', room: '', headTeacher: '' }));
      setFeedback({ type: 'ok', text: 'Classe et son tarif créés avec succès.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest(
        '/api/subjects',
        { method: 'POST', body: JSON.stringify(subjectForm) },
        session
      );
      await onRefresh();
      setShowSubjectModal(false);
      setSubjectForm({ ...subjectForm, code: '', name: '', teacherName: '' });
      setFeedback({ type: 'ok', text: 'Matière ajoutée.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  };

  const DELIVERY_LABELS: Record<Bulletin['deliveryStatus'], string> = {
    a_editer: 'À éditer',
    valide: 'Validé',
    imprime: 'Imprimé',
    remis: 'Remis',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            {session.role === 'enseignant'
              ? 'Saisie des notes · Espace Enseignant'
              : session.role === 'scolarite'
                ? 'Validation des notes · Scolarité'
                : 'Secrétariat académique'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {session.role === 'enseignant'
              ? 'Enregistrez les notes (/20) et appréciations ; la Scolarité valide chaque enregistrement avant publication.'
              : session.role === 'scolarite'
                ? 'Contrôlez, validez ou rejetez avec motif les notes enregistrées par les enseignants avant calcul des bulletins.'
                : 'Constitution des classes, matières, suivi des notes soumises pour validation Scolarité et livraison des bulletins.'}
          </p>
        </div>

        {!showOnlyNotesTab && (
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start w-full sm:w-auto overflow-x-auto max-w-full">
            {(
              [
                { id: 'notes', label: 'Notes & Validation' },
                { id: 'bulletins', label: 'Bulletins & Livraison' },
                { id: 'classes', label: 'Classes & Matières' },
                { id: 'periodes', label: 'Périodes' },
              ] as Array<{ id: SecretariatTab; label: string }>
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
        )}
      </div>

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
          <button type="button" onClick={() => setFeedback(null)} className="underline shrink-0">
            Fermer
          </button>
        </div>
      )}

      {/* Shared Period / Class selector for Notes & Bulletins */}
      {(activeTab === 'notes' || activeTab === 'bulletins') && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-end gap-3 w-full lg:w-auto">
              <div className="w-full sm:w-auto">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Période d’évaluation
                </label>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {state.periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.status === 'verrouille' ? 'Verrouillé' : 'Ouvert'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-auto">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Classe
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {state.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.cycle} ({c.program})
                    </option>
                  ))}
                </select>
              </div>

              {activeTab === 'notes' && entryMode === 'classe' && (
                <div className="w-full sm:w-auto">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Matière
                  </label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    {classSubjects.length === 0 ? (
                      <option value="">Aucune matière configurée</option>
                    ) : (
                      classSubjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} (Coeff {sub.coefficient})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {activeTab === 'notes' && entryMode === 'eleve' && (
                <div className="w-full sm:w-auto">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Élève
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    {classStudents.length === 0 ? (
                      <option value="">Aucun élève dans cette classe</option>
                    ) : (
                      classStudents.map((stu) => (
                        <option key={stu.id} value={stu.id}>
                          {stu.lastName} {stu.firstName} ({stu.cardId})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>

            {activeTab === 'notes' && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto max-w-full">
                <button
                  type="button"
                  onClick={() => setEntryMode('classe')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    entryMode === 'classe'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Par classe & matière
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('eleve')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    entryMode === 'eleve'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Par élève (toutes matières)
                </button>
              </div>
            )}

            {activeTab === 'bulletins' && !isReadOnly && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRecalculateBulletins}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap"
              >
                <Calculator className="w-4 h-4" />
                Calculer / Mettre à jour les bulletins
              </button>
            )}
          </div>

          {activeTab === 'notes' && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                {entryMode === 'classe' ? (
                  <>
                    <span>{classStudents.length} élève(s)</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {
                        classStudents.filter((stu) =>
                          state.grades.some(
                            (g) =>
                              g.studentId === stu.id &&
                              g.subjectId === selectedSubjectId &&
                              g.periodId === selectedPeriodId
                          )
                        ).length
                      }{' '}
                      / {classStudents.length} note(s) enregistrée(s)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Saisie acceptée avec point ou virgule (ex. 14,5)</span>
                  </>
                ) : (
                  (() => {
                    const currentStu = classStudents.find((s) => s.id === selectedStudentId);
                    if (!currentStu) return <span>Sélectionnez un élève</span>;
                    let wSum = 0;
                    let cSum = 0;
                    for (const sub of classSubjects) {
                      const { avg } = extractRowValues(gradeDrafts[`${currentStu.id}::${sub.id}`]);
                      if (avg !== null) {
                        wSum += avg * sub.coefficient;
                        cSum += sub.coefficient;
                      }
                    }
                    const genAvg = cSum > 0 ? Math.round((wSum / cSum) * 100) / 100 : null;
                    return (
                      <>
                        <span className="font-semibold text-slate-800">
                          {currentStu.lastName} {currentStu.firstName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{classSubjects.length} matière(s)</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Moyenne générale estimée :{' '}
                          <strong className="font-mono text-blue-950">
                            {genAvg !== null ? `${genAvg.toFixed(2)} / 20` : '—'}
                          </strong>
                          {genAvg !== null &&
                            ` (${getMentionForScore(genAvg, state.settings.mentionThresholds)})`}
                        </span>
                      </>
                    );
                  })()
                )}
              </div>

              {canRecordGrades && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={evalSlotCount >= 6}
                    onClick={() => setEvalSlotCount((c) => Math.min(6, c + 1))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Colonne note ({evalSlotCount}/6)
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoFillAppreciations}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-appréciations
                  </button>
                  {entryMode === 'classe' && selectedSubjectId && (
                    <>
                      <button
                        type="button"
                        onClick={handleExportGradesExcel}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Modèle Excel
                      </button>
                      <button
                        type="button"
                        onClick={() => excelInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Importer Excel
                      </button>
                      <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImportGradesExcel(f);
                          e.target.value = '';
                        }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busy || (entryMode === 'classe' && !selectedSubjectId)}
                    onClick={handleSaveAllGrades}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {session.role === 'enseignant'
                      ? 'Soumettre toutes les notes'
                      : 'Enregistrer toutes les notes'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SCOLARITÉ VALIDATION QUEUE PANEL */}
      {activeTab === 'notes' &&
        (canValidateGrades ||
          pendingGradesAll.length > 0 ||
          rejectedGradesAll.length > 0 ||
          validationFilter !== 'en_attente') && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    File de validation Scolarité
                  </h2>
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded border border-amber-300 bg-amber-50 text-amber-900 tabular-nums">
                    {pendingGradesAll.length} en attente
                  </span>
                  {rejectedGradesAll.length > 0 && (
                    <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded border border-red-300 bg-red-50 text-red-800 tabular-nums">
                      {rejectedGradesAll.length} rejetée(s)
                    </span>
                  )}
                  <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded border border-emerald-300 bg-emerald-50 text-emerald-800 tabular-nums">
                    {validatedGradesAll.length} validée(s)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Seules les notes validées par la Scolarité entrent dans le calcul des moyennes, rangs, bulletins et de la vue parentale.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full">
                  {(
                    [
                      { id: 'en_attente', label: `En attente (${pendingGradesAll.length})` },
                      { id: 'rejete', label: `Rejetées (${rejectedGradesAll.length})` },
                      { id: 'valide', label: `Validées (${validatedGradesAll.length})` },
                      { id: 'all', label: `Toutes (${state.grades.length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setValidationFilter(f.id)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                        validationFilter === f.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {canValidateGrades && pendingGradesAll.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      handleValidateBatch(
                        pendingGradesAll.map((g) => g.id),
                        'valide'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Tout valider ({pendingGradesAll.length})
                  </button>
                )}
              </div>
            </div>

            {queueGrades.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                Aucune fiche de notes dans cette catégorie.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {/* Mobile queue cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {queueGrades.map((g) => {
                    const stu = state.students.find((s) => s.id === g.studentId);
                    const cls = state.classes.find((c) => c.id === stu?.classId);
                    const sub = state.subjects.find((s) => s.id === g.subjectId);
                    const per = state.periods.find((p) => p.id === g.periodId);
                    const status = getGradeStatus(g);
                    return (
                      <div key={`qmob-${g.id}`} className="p-3.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {stu ? `${stu.lastName} ${stu.firstName}` : g.studentId}
                            </div>
                            <div className="text-xs text-slate-500">
                              {cls?.name || stu?.cycle || '—'} · {sub?.name || g.subjectId} ·{' '}
                              {per?.label || g.periodId}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-sm text-blue-950 tabular-nums">
                              {g.average.toFixed(2)}/20
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              [{g.values.join(' · ')}]
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {renderValidationBadge(g)}
                            <span className="text-[11px] text-slate-500">
                              Par {g.submittedBy || g.updatedBy}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (per) setSelectedPeriodId(per.id);
                              if (cls) setSelectedClassId(cls.id);
                              if (sub) setSelectedSubjectId(sub.id);
                              setEntryMode('classe');
                            }}
                            className="text-[11px] font-semibold text-blue-900 underline"
                          >
                            Voir en grille
                          </button>
                        </div>

                        {g.rejectionReason && (
                          <div className="p-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-800 flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>Motif du rejet : {g.rejectionReason}</span>
                          </div>
                        )}

                        {canValidateGrades && (
                          <div className="flex items-center justify-end gap-2 pt-1">
                            {status !== 'rejete' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setRejectReasonInput('');
                                  setRejectTarget({
                                    gradeIds: [g.id],
                                    label: `${stu?.lastName || ''} ${stu?.firstName || ''} · ${sub?.name || ''} (${g.average.toFixed(2)}/20)`,
                                  });
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200 rounded-md hover:bg-red-50"
                              >
                                Rejeter
                              </button>
                            )}
                            {status !== 'valide' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleValidateSingle(g.id, 'valide')}
                                className="px-3 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                              >
                                Valider
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop queue table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
                        <th className="py-2.5 px-4 font-semibold">Élève & Classe</th>
                        <th className="py-2.5 px-3 font-semibold">Matière & Période</th>
                        <th className="py-2.5 px-3 font-semibold">Notes (/20)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Moyenne</th>
                        <th className="py-2.5 px-3 font-semibold">Enregistré par</th>
                        <th className="py-2.5 px-3 font-semibold">Statut</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Validation Scolarité</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queueGrades.map((g) => {
                        const stu = state.students.find((s) => s.id === g.studentId);
                        const cls = state.classes.find((c) => c.id === stu?.classId);
                        const sub = state.subjects.find((s) => s.id === g.subjectId);
                        const per = state.periods.find((p) => p.id === g.periodId);
                        const status = getGradeStatus(g);
                        return (
                          <tr key={`qdesk-${g.id}`} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">
                                {stu ? `${stu.lastName} ${stu.firstName}` : g.studentId}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">
                                {stu?.cardId || ''} {cls ? `· ${cls.name}` : ''}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-slate-900">{sub?.name || g.subjectId}</div>
                              <div className="text-[11px] text-slate-500">{per?.label || g.periodId}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700 tabular-nums">
                              {g.values.join(' · ')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-950 tabular-nums whitespace-nowrap">
                              {g.average.toFixed(2)} / 20
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-slate-800">{g.submittedBy || g.updatedBy}</div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {formatDateTimeFr(g.submittedAt || g.updatedAt)}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div>{renderValidationBadge(g)}</div>
                              {g.rejectionReason && (
                                <div className="text-[11px] text-red-700 mt-0.5 max-w-[200px]">
                                  Motif : {g.rejectionReason}
                                </div>
                              )}
                              {g.validatedBy && status === 'valide' && (
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  Par {g.validatedBy}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (per) setSelectedPeriodId(per.id);
                                    if (cls) setSelectedClassId(cls.id);
                                    if (sub) setSelectedSubjectId(sub.id);
                                    setEntryMode('classe');
                                  }}
                                  className="px-2 py-1 text-[11px] font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
                                >
                                  Grille
                                </button>
                                {canValidateGrades && status !== 'valide' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleValidateSingle(g.id, 'valide')}
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded"
                                  >
                                    Valider
                                  </button>
                                )}
                                {canValidateGrades && status !== 'rejete' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setRejectReasonInput('');
                                      setRejectTarget({
                                        gradeIds: [g.id],
                                        label: `${stu?.lastName || ''} ${stu?.firstName || ''} · ${sub?.name || ''} (${g.average.toFixed(2)}/20)`,
                                      });
                                    }}
                                    className="px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50 rounded"
                                  >
                                    Rejeter
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
            )}
          </div>
        )}

      {/* TAB 1: NOTES & MOYENNES */}
      {activeTab === 'notes' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {selectedPeriod?.status === 'verrouille' && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  Période verrouillée : toute modification exige un motif enregistré dans le journal d’audit (RG-08).
                </span>
              </div>
              {canRecordGrades && (
                <input
                  type="text"
                  value={batchOverrideReason}
                  onChange={(e) => setBatchOverrideReason(e.target.value)}
                  placeholder="Motif global de correction (RG-08)..."
                  className="px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg w-72 max-w-full"
                />
              )}
            </div>
          )}

          {classSubjects.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">
                Aucune matière n’est encore configurée pour{' '}
                <strong>
                  {selectedClass?.cycle} ({selectedClass?.program})
                </strong>
                .
              </p>
              {canManageAcademic && selectedClass && (
                <button
                  type="button"
                  onClick={() => {
                    setSubjectForm({
                      code: '',
                      name: '',
                      cycle: selectedClass.cycle,
                      program: selectedClass.program,
                      coefficient: 2,
                      teacherName: selectedClass.headTeacher || '',
                    });
                    setShowSubjectModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter une matière pour {selectedClass.cycle} ({selectedClass.program})
                </button>
              )}
            </div>
          ) : entryMode === 'classe' ? (
            <>
              {/* Mobile Grade Entry Cards (Par classe & matière) */}
              <div className="md:hidden divide-y divide-slate-100">
                {classStudents.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    Aucun élève affecté à cette classe. Affectez des élèves dans l’onglet Classes & Matières.
                  </div>
                ) : (
                  classStudents.map((stu) => {
                    const key = `${stu.id}::${selectedSubjectId}`;
                    const draft = gradeDrafts[key] || {
                      slots: Array.from({ length: evalSlotCount }, () => ''),
                      appreciation: '',
                      overrideReason: '',
                      dirty: false,
                    };
                    const existing = state.grades.find(
                      (g) =>
                        g.studentId === stu.id &&
                        g.subjectId === selectedSubjectId &&
                        g.periodId === selectedPeriodId
                    );
                    const { hasInvalid, validNumbers, avg } = extractRowValues(draft);
                    const mention =
                      avg !== null
                        ? getMentionForScore(avg, state.settings.mentionThresholds)
                        : '—';

                    return (
                      <div
                        key={`mob-${stu.id}`}
                        className={`p-4 space-y-3 ${draft.dirty ? 'bg-amber-50/40' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StudentAvatar
                              photoUrl={stu.photoUrl}
                              firstName={stu.firstName}
                              lastName={stu.lastName}
                              sizeClass="w-8 h-8"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 text-sm truncate">
                                {stu.lastName} {stu.firstName}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                {stu.cardId}
                                {draft.dirty ? ' · Modifié' : ''}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {renderValidationBadge(existing)}
                                {existing?.rejectionReason && (
                                  <span className="text-[11px] text-red-700">
                                    Motif : {existing.rejectionReason}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-sm text-blue-950 tabular-nums">
                              {avg !== null ? `${avg.toFixed(2)}/20` : '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">{mention}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {Array.from({ length: evalSlotCount }).map((_, idx) => {
                            const cellVal = draft.slots[idx] ?? '';
                            const cellStatus = parseNoteSlot(cellVal);
                            return (
                              <div key={`mec-${stu.id}-${idx}`}>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Note {idx + 1}
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={notesReadOnly}
                                  value={cellVal}
                                  onChange={(e) =>
                                    updateDraftSlot(stu.id, selectedSubjectId, idx, e.target.value)
                                  }
                                  placeholder="—"
                                  className={`w-full px-2 py-1.5 text-sm font-mono tabular-nums text-center border rounded-md disabled:bg-slate-100 ${
                                    cellStatus === 'invalid'
                                      ? 'border-red-500 bg-red-50 text-red-700'
                                      : 'border-slate-300'
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <input
                          type="text"
                          disabled={notesReadOnly}
                          value={draft.appreciation}
                          onChange={(e) =>
                            updateDraftField(stu.id, selectedSubjectId, 'appreciation', e.target.value)
                          }
                          placeholder="Appréciation enseignant..."
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md disabled:bg-slate-100"
                        />

                        {selectedPeriod?.status === 'verrouille' && (
                          <input
                            type="text"
                            disabled={notesReadOnly}
                            value={draft.overrideReason}
                            onChange={(e) =>
                              updateDraftField(stu.id, selectedSubjectId, 'overrideReason', e.target.value)
                            }
                            placeholder={batchOverrideReason ? 'Utilise motif global' : 'Motif de correction (RG-08)...'}
                            className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-md disabled:bg-slate-100"
                          />
                        )}

                        {(canRecordGrades || (canValidateGrades && existing)) && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {canValidateGrades && existing && getGradeStatus(existing) !== 'rejete' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  const sub = classSubjects.find((s) => s.id === selectedSubjectId);
                                  setRejectReasonInput('');
                                  setRejectTarget({
                                    gradeIds: [existing.id],
                                    label: `${stu.lastName} ${stu.firstName} · ${sub?.name || ''}`,
                                  });
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-md hover:bg-red-50"
                              >
                                Rejeter
                              </button>
                            )}
                            {canValidateGrades && existing && getGradeStatus(existing) !== 'valide' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleValidateSingle(existing.id, 'valide')}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                              >
                                Valider
                              </button>
                            )}
                            {canRecordGrades &&
                              existing &&
                              !(session.role === 'enseignant' && getGradeStatus(existing) === 'valide') && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDeleteGrade(stu.id, selectedSubjectId)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Supprimer
                                </button>
                              )}
                            {canRecordGrades && (
                              <button
                                type="button"
                                disabled={busy || !selectedSubjectId || hasInvalid || validNumbers.length === 0}
                                onClick={() => handleSaveGrade(stu.id, selectedSubjectId)}
                                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-45 rounded-md"
                              >
                                Enregistrer
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Élève</th>
                    {Array.from({ length: evalSlotCount }).map((_, idx) => (
                      <th key={`eh-${idx}`} className="py-3 px-2 font-semibold text-center w-20">
                        Note {idx + 1}
                      </th>
                    ))}
                    <th className="py-3 px-3 font-semibold text-right">Moyenne</th>
                    <th className="py-3 px-3 font-semibold">Mention</th>
                    <th className="py-3 px-4 font-semibold">Appréciation</th>
                    {selectedPeriod?.status === 'verrouille' && (
                      <th className="py-3 px-3 font-semibold">Motif (RG-08)</th>
                    )}
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={evalSlotCount + (selectedPeriod?.status === 'verrouille' ? 6 : 5)}
                        className="py-10 text-center text-sm text-slate-500"
                      >
                        Aucun élève affecté à cette classe. Affectez des élèves dans l’onglet Classes & Matières.
                      </td>
                    </tr>
                  ) : (
                    classStudents.map((stu) => {
                      const key = `${stu.id}::${selectedSubjectId}`;
                      const draft = gradeDrafts[key] || {
                        slots: Array.from({ length: evalSlotCount }, () => ''),
                        appreciation: '',
                        overrideReason: '',
                        dirty: false,
                      };
                      const existing = state.grades.find(
                        (g) =>
                          g.studentId === stu.id &&
                          g.subjectId === selectedSubjectId &&
                          g.periodId === selectedPeriodId
                      );
                      const { hasInvalid, validNumbers, avg } = extractRowValues(draft);
                      const mention =
                        avg !== null
                          ? getMentionForScore(avg, state.settings.mentionThresholds)
                          : '—';

                      return (
                        <tr
                          key={stu.id}
                          className={draft.dirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}
                        >
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <StudentAvatar
                                photoUrl={stu.photoUrl}
                                firstName={stu.firstName}
                                lastName={stu.lastName}
                                sizeClass="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 truncate">
                                  {stu.lastName} {stu.firstName}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  {stu.cardId}
                                  {draft.dirty ? ' · Modifié' : ''}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {renderValidationBadge(existing)}
                                  {existing?.rejectionReason && (
                                    <span className="text-[11px] text-red-700">
                                      Motif : {existing.rejectionReason}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          {Array.from({ length: evalSlotCount }).map((_, idx) => {
                            const cellVal = draft.slots[idx] ?? '';
                            const cellStatus = parseNoteSlot(cellVal);
                            return (
                              <td key={`ec-${stu.id}-${idx}`} className="py-2.5 px-1.5 text-center">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={notesReadOnly}
                                  value={cellVal}
                                  onChange={(e) =>
                                    updateDraftSlot(stu.id, selectedSubjectId, idx, e.target.value)
                                  }
                                  placeholder="—"
                                  className={`w-16 px-2 py-1.5 text-sm font-mono tabular-nums text-center border rounded-md disabled:bg-slate-100 ${
                                    cellStatus === 'invalid'
                                      ? 'border-red-500 bg-red-50 text-red-700'
                                      : 'border-slate-300'
                                  }`}
                                />
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-950 tabular-nums whitespace-nowrap">
                            {avg !== null ? `${avg.toFixed(2)} / 20` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                            {mention}
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              type="text"
                              disabled={notesReadOnly}
                              value={draft.appreciation}
                              onChange={(e) =>
                                updateDraftField(
                                  stu.id,
                                  selectedSubjectId,
                                  'appreciation',
                                  e.target.value
                                )
                              }
                              placeholder="Observation enseignant..."
                              className="w-full min-w-[160px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-md disabled:bg-slate-100"
                            />
                          </td>
                          {selectedPeriod?.status === 'verrouille' && (
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                disabled={notesReadOnly}
                                value={draft.overrideReason}
                                onChange={(e) =>
                                  updateDraftField(
                                    stu.id,
                                    selectedSubjectId,
                                    'overrideReason',
                                    e.target.value
                                  )
                                }
                                placeholder={batchOverrideReason ? 'Utilise motif global' : 'Motif...'}
                                className="w-36 px-2.5 py-1.5 text-xs border border-amber-300 rounded-md disabled:bg-slate-100"
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-4 text-right">
                            {canRecordGrades || (canValidateGrades && existing) ? (
                              <div className="inline-flex items-center gap-1.5">
                                {canValidateGrades && existing && getGradeStatus(existing) !== 'valide' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleValidateSingle(existing.id, 'valide')}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 rounded-md whitespace-nowrap"
                                  >
                                    Valider
                                  </button>
                                )}
                                {canValidateGrades && existing && getGradeStatus(existing) !== 'rejete' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const sub = classSubjects.find((s) => s.id === selectedSubjectId);
                                      setRejectReasonInput('');
                                      setRejectTarget({
                                        gradeIds: [existing.id],
                                        label: `${stu.lastName} ${stu.firstName} · ${sub?.name || ''}`,
                                      });
                                    }}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-45 rounded-md whitespace-nowrap"
                                  >
                                    Rejeter
                                  </button>
                                )}
                                {canRecordGrades && (
                                  <button
                                    type="button"
                                    disabled={
                                      busy || !selectedSubjectId || hasInvalid || validNumbers.length === 0
                                    }
                                    onClick={() => handleSaveGrade(stu.id, selectedSubjectId)}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-45 rounded-md whitespace-nowrap"
                                  >
                                    Enregistrer
                                  </button>
                                )}
                                {canRecordGrades &&
                                  existing &&
                                  !(session.role === 'enseignant' && getGradeStatus(existing) === 'valide') && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleDeleteGrade(stu.id, selectedSubjectId)}
                                      title="Supprimer cette note"
                                      aria-label="Supprimer cette note"
                                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Lecture seule</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <>
              {/* Mobile Grade Entry Cards (Par élève) */}
              <div className="md:hidden divide-y divide-slate-100">
                {!selectedStudentId ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    Aucun élève affecté à cette classe.
                  </div>
                ) : (
                  classSubjects.map((sub) => {
                    const key = `${selectedStudentId}::${sub.id}`;
                    const draft = gradeDrafts[key] || {
                      slots: Array.from({ length: evalSlotCount }, () => ''),
                      appreciation: '',
                      overrideReason: '',
                      dirty: false,
                    };
                    const existing = state.grades.find(
                      (g) =>
                        g.studentId === selectedStudentId &&
                        g.subjectId === sub.id &&
                        g.periodId === selectedPeriodId
                    );
                    const { hasInvalid, validNumbers, avg } = extractRowValues(draft);

                    return (
                      <div
                        key={`mobs-${sub.id}`}
                        className={`p-4 space-y-3 ${draft.dirty ? 'bg-amber-50/40' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 text-sm">
                              <span className="font-mono text-xs text-slate-500 mr-1.5">
                                [{sub.code}]
                              </span>
                              {sub.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Coeff. {sub.coefficient} · {sub.teacherName}
                              {draft.dirty ? ' · Modifié' : ''}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {renderValidationBadge(existing)}
                              {existing?.rejectionReason && (
                                <span className="text-[11px] text-red-700">
                                  Motif : {existing.rejectionReason}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-sm text-blue-950 tabular-nums shrink-0">
                            {avg !== null ? `${avg.toFixed(2)}/20` : '—'}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {Array.from({ length: evalSlotCount }).map((_, idx) => {
                            const cellVal = draft.slots[idx] ?? '';
                            const cellStatus = parseNoteSlot(cellVal);
                            return (
                              <div key={`msc-${sub.id}-${idx}`}>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Note {idx + 1}
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={notesReadOnly}
                                  value={cellVal}
                                  onChange={(e) =>
                                    updateDraftSlot(selectedStudentId, sub.id, idx, e.target.value)
                                  }
                                  placeholder="—"
                                  className={`w-full px-2 py-1.5 text-sm font-mono tabular-nums text-center border rounded-md disabled:bg-slate-100 ${
                                    cellStatus === 'invalid'
                                      ? 'border-red-500 bg-red-50 text-red-700'
                                      : 'border-slate-300'
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <input
                          type="text"
                          disabled={notesReadOnly}
                          value={draft.appreciation}
                          onChange={(e) =>
                            updateDraftField(selectedStudentId, sub.id, 'appreciation', e.target.value)
                          }
                          placeholder="Appréciation enseignant..."
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md disabled:bg-slate-100"
                        />

                        {selectedPeriod?.status === 'verrouille' && (
                          <input
                            type="text"
                            disabled={notesReadOnly}
                            value={draft.overrideReason}
                            onChange={(e) =>
                              updateDraftField(selectedStudentId, sub.id, 'overrideReason', e.target.value)
                            }
                            placeholder={batchOverrideReason ? 'Utilise motif global' : 'Motif de correction (RG-08)...'}
                            className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-md disabled:bg-slate-100"
                          />
                        )}

                        {(canRecordGrades || (canValidateGrades && existing)) && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {canValidateGrades && existing && getGradeStatus(existing) !== 'rejete' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  const stu = classStudents.find((s) => s.id === selectedStudentId);
                                  setRejectReasonInput('');
                                  setRejectTarget({
                                    gradeIds: [existing.id],
                                    label: `${stu?.lastName || ''} ${stu?.firstName || ''} · ${sub.name}`,
                                  });
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-md hover:bg-red-50"
                              >
                                Rejeter
                              </button>
                            )}
                            {canValidateGrades && existing && getGradeStatus(existing) !== 'valide' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleValidateSingle(existing.id, 'valide')}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                              >
                                Valider
                              </button>
                            )}
                            {canRecordGrades &&
                              existing &&
                              !(session.role === 'enseignant' && getGradeStatus(existing) === 'valide') && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDeleteGrade(selectedStudentId, sub.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Supprimer
                                </button>
                              )}
                            {canRecordGrades && (
                              <button
                                type="button"
                                disabled={busy || hasInvalid || validNumbers.length === 0}
                                onClick={() => handleSaveGrade(selectedStudentId, sub.id)}
                                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-45 rounded-md"
                              >
                                Enregistrer
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Matière & Coeff.</th>
                    {Array.from({ length: evalSlotCount }).map((_, idx) => (
                      <th key={`sh-${idx}`} className="py-3 px-2 font-semibold text-center w-20">
                        Note {idx + 1}
                      </th>
                    ))}
                    <th className="py-3 px-3 font-semibold text-right">Moyenne</th>
                    <th className="py-3 px-4 font-semibold">Appréciation</th>
                    {selectedPeriod?.status === 'verrouille' && (
                      <th className="py-3 px-3 font-semibold">Motif (RG-08)</th>
                    )}
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!selectedStudentId ? (
                    <tr>
                      <td
                        colSpan={evalSlotCount + (selectedPeriod?.status === 'verrouille' ? 5 : 4)}
                        className="py-10 text-center text-sm text-slate-500"
                      >
                        Aucun élève affecté à cette classe.
                      </td>
                    </tr>
                  ) : (
                    classSubjects.map((sub) => {
                      const key = `${selectedStudentId}::${sub.id}`;
                      const draft = gradeDrafts[key] || {
                        slots: Array.from({ length: evalSlotCount }, () => ''),
                        appreciation: '',
                        overrideReason: '',
                        dirty: false,
                      };
                      const existing = state.grades.find(
                        (g) =>
                          g.studentId === selectedStudentId &&
                          g.subjectId === sub.id &&
                          g.periodId === selectedPeriodId
                      );
                      const { hasInvalid, validNumbers, avg } = extractRowValues(draft);

                      return (
                        <tr
                          key={sub.id}
                          className={draft.dirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}
                        >
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">
                              <span className="font-mono text-xs text-slate-500 mr-1.5">
                                [{sub.code}]
                              </span>
                              {sub.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Coeff. {sub.coefficient} · {sub.teacherName}
                              {draft.dirty ? ' · Modifié' : ''}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {renderValidationBadge(existing)}
                              {existing?.rejectionReason && (
                                <span className="text-[11px] text-red-700">
                                  Motif : {existing.rejectionReason}
                                </span>
                              )}
                            </div>
                          </td>
                          {Array.from({ length: evalSlotCount }).map((_, idx) => {
                            const cellVal = draft.slots[idx] ?? '';
                            const cellStatus = parseNoteSlot(cellVal);
                            return (
                              <td key={`sc-${sub.id}-${idx}`} className="py-2.5 px-1.5 text-center">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={notesReadOnly}
                                  value={cellVal}
                                  onChange={(e) =>
                                    updateDraftSlot(selectedStudentId, sub.id, idx, e.target.value)
                                  }
                                  placeholder="—"
                                  className={`w-16 px-2 py-1.5 text-sm font-mono tabular-nums text-center border rounded-md disabled:bg-slate-100 ${
                                    cellStatus === 'invalid'
                                      ? 'border-red-500 bg-red-50 text-red-700'
                                      : 'border-slate-300'
                                  }`}
                                />
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-950 tabular-nums whitespace-nowrap">
                            {avg !== null ? `${avg.toFixed(2)} / 20` : '—'}
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              type="text"
                              disabled={notesReadOnly}
                              value={draft.appreciation}
                              onChange={(e) =>
                                updateDraftField(
                                  selectedStudentId,
                                  sub.id,
                                  'appreciation',
                                  e.target.value
                                )
                              }
                              placeholder="Observation enseignant..."
                              className="w-full min-w-[160px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-md disabled:bg-slate-100"
                            />
                          </td>
                          {selectedPeriod?.status === 'verrouille' && (
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                disabled={notesReadOnly}
                                value={draft.overrideReason}
                                onChange={(e) =>
                                  updateDraftField(
                                    selectedStudentId,
                                    sub.id,
                                    'overrideReason',
                                    e.target.value
                                  )
                                }
                                placeholder={batchOverrideReason ? 'Utilise motif global' : 'Motif...'}
                                className="w-36 px-2.5 py-1.5 text-xs border border-amber-300 rounded-md disabled:bg-slate-100"
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-4 text-right">
                            {canRecordGrades || (canValidateGrades && existing) ? (
                              <div className="inline-flex items-center gap-1.5">
                                {canValidateGrades && existing && getGradeStatus(existing) !== 'valide' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleValidateSingle(existing.id, 'valide')}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 rounded-md whitespace-nowrap"
                                  >
                                    Valider
                                  </button>
                                )}
                                {canValidateGrades && existing && getGradeStatus(existing) !== 'rejete' && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const stu = classStudents.find((s) => s.id === selectedStudentId);
                                      setRejectReasonInput('');
                                      setRejectTarget({
                                        gradeIds: [existing.id],
                                        label: `${stu?.lastName || ''} ${stu?.firstName || ''} · ${sub.name}`,
                                      });
                                    }}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-45 rounded-md whitespace-nowrap"
                                  >
                                    Rejeter
                                  </button>
                                )}
                                {canRecordGrades && (
                                  <button
                                    type="button"
                                    disabled={busy || hasInvalid || validNumbers.length === 0}
                                    onClick={() => handleSaveGrade(selectedStudentId, sub.id)}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-45 rounded-md whitespace-nowrap"
                                  >
                                    Enregistrer
                                  </button>
                                )}
                                {canRecordGrades &&
                                  existing &&
                                  !(session.role === 'enseignant' && getGradeStatus(existing) === 'valide') && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleDeleteGrade(selectedStudentId, sub.id)}
                                      title="Supprimer cette note"
                                      aria-label="Supprimer cette note"
                                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Lecture seule</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: BULLETINS & LIVRAISON */}
      {activeTab === 'bulletins' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-900 shrink-0" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Bulletins · {selectedClass?.name} ({selectedPeriod?.label})
              </h2>
            </div>
            <div className="text-xs text-slate-500">
              {classBulletins.length} bulletin(s) généré(s)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                  <th className="py-3 px-4 font-semibold">Rang</th>
                  <th className="py-3 px-4 font-semibold">Élève</th>
                  <th className="py-3 px-4 font-semibold text-right">Moyenne générale</th>
                  <th className="py-3 px-4 font-semibold">Mention</th>
                  <th className="py-3 px-4 font-semibold">Statut livraison</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classBulletins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                      Aucun bulletin calculé pour cette classe et cette période. Cliquez sur « Calculer / Mettre à jour les bulletins ».
                    </td>
                  </tr>
                ) : (
                  classBulletins.map((bul) => {
                    const stu = state.students.find((s) => s.id === bul.studentId);
                    if (!stu) return null;
                    return (
                      <tr key={bul.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                          {bul.rank}e / {bul.totalStudents}
                        </td>
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
                              <div className="text-xs font-mono text-slate-500">{stu.cardId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-950 tabular-nums">
                          {bul.generalAverage.toFixed(2)} / 20
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">{bul.mention}</td>
                        <td className="py-3 px-4">
                          <div
                            className={`text-xs font-semibold ${
                              bul.deliveryStatus === 'remis'
                                ? 'text-emerald-700'
                                : bul.deliveryStatus === 'valide' || bul.deliveryStatus === 'imprime'
                                  ? 'text-blue-900'
                                  : 'text-amber-700'
                            }`}
                          >
                            {DELIVERY_LABELS[bul.deliveryStatus]}
                          </div>
                          {bul.receivedBy && (
                            <div className="text-[11px] text-slate-500">
                              Remis le {formatDateTimeFr(bul.deliveredAt)} à {bul.receivedBy}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setBulletinModal({ bulletin: bul, student: stu })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Éditer
                            </button>
                            {!isReadOnly && bul.deliveryStatus === 'a_editer' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleUpdateDelivery(bul, 'valide')}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                              >
                                Valider
                              </button>
                            )}
                            {!isReadOnly && bul.deliveryStatus === 'valide' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleUpdateDelivery(bul, 'imprime')}
                                className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200"
                              >
                                Marquer imprimé
                              </button>
                            )}
                            {!isReadOnly &&
                              (bul.deliveryStatus === 'imprime' || bul.deliveryStatus === 'valide') && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const parent = state.parents.find((p) => p.id === stu.parentId);
                                    setReceivedByInput(parent?.fullName || '');
                                    setDeliverModal(bul);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                                >
                                  Remettre
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
      )}

      {/* TAB 3: CLASSES & MATIERES */}
      {activeTab === 'classes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Classes ({state.classes.length})
                </h2>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={openCreateClassModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nouvelle classe
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {state.classes.map((cls) => {
                  const count = state.students.filter(
                    (s) => s.classId === cls.id && s.status !== 'archive'
                  ).length;
                  const clsFee = resolveFeeGridItem(
                    { feeGrid: state.feeGrid },
                    { classId: cls.id, cycle: cls.cycle, program: cls.program }
                  );
                  return (
                    <div key={cls.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-sm">{cls.name}</div>
                        <div className="text-xs text-slate-500">
                          {cls.cycle} · {cls.program} · {cls.room} · PP : {cls.headTeacher}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                          {count} / {cls.capacity}
                        </div>
                        {clsFee && (
                          <div className="font-mono text-[11px] text-blue-950 tabular-nums">
                            {formatFcfa(clsFee.registrationFee + clsFee.annualTuition)} / an
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-900 shrink-0" />
                  Matières & Coefficients ({state.subjects.length})
                </h2>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowSubjectModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter matière
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 pr-1">
                {state.subjects.map((sub) => (
                  <div key={sub.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        <span className="font-mono text-xs text-slate-500 mr-1.5">
                          [{sub.code}]
                        </span>
                        {sub.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {sub.cycle} ({sub.program}) · {sub.teacherName}
                      </div>
                    </div>
                    <div className="font-mono text-xs font-bold text-blue-950 shrink-0">
                      Coeff. {sub.coefficient}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Student Class Assignment & Card Reprint (RF-SEC-01, RF-SEC-09) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <h2 className="font-display text-base font-bold text-slate-900 mb-4">
              Affectation des élèves aux classes & Réimpression de cartes
            </h2>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-sm min-w-[580px]">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 text-left">
                    <th className="py-2 font-medium">Élève</th>
                    <th className="py-2 font-medium">Cycle · Programme</th>
                    <th className="py-2 font-medium">Classe affectée</th>
                    <th className="py-2 font-medium text-right">Carte scolaire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.students.map((stu) => (
                    <tr key={stu.id}>
                      <td className="py-2.5 font-medium text-slate-900">
                        {stu.lastName} {stu.firstName}{' '}
                        <span className="font-mono text-xs text-slate-500">({stu.cardId})</span>
                      </td>
                      <td className="py-2.5 text-xs text-slate-600">
                        {stu.cycle} · {stu.program}
                      </td>
                      <td className="py-2.5">
                        <select
                          disabled={isReadOnly || busy}
                          value={stu.classId || ''}
                          onChange={(e) => handleAssignStudentClass(stu.id, e.target.value)}
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
                        >
                          <option value="">Non affecté</option>
                          {state.classes
                            .filter((c) => c.cycle === stu.cycle && c.program === stu.program)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setCardStudent(stu)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-100"
                        >
                          Réimprimer carte
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PERIODES */}
      {activeTab === 'periodes' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-slate-900">
              Périodes d’évaluation ({state.settings.periodMode})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Le verrouillage valide officiellement les bulletins et active la traçabilité des corrections ultérieures.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {state.periods.map((p) => (
              <div
                key={p.id}
                className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    {p.status === 'verrouille' ? (
                      <Lock className="w-4 h-4 text-amber-700" />
                    ) : (
                      <Unlock className="w-4 h-4 text-emerald-700" />
                    )}
                    <span>
                      {p.label} · {p.academicYear}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Du {formatDateFr(p.startDate)} au {formatDateFr(p.endDate)}
                    {p.validatedAt && ` · Validé le ${formatDateTimeFr(p.validatedAt)} par ${p.validatedBy}`}
                  </div>
                </div>
                <div>
                  {!isReadOnly ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleTogglePeriodLock(p.id)}
                      className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border ${
                        p.status === 'verrouille'
                          ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                          : 'border-blue-900 bg-blue-900 text-white hover:bg-blue-800'
                      }`}
                    >
                      {p.status === 'verrouille' ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          Déverrouiller
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Valider & Verrouiller
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-slate-600">
                      {p.status === 'verrouille' ? 'Verrouillé' : 'Ouvert'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DELIVER BULLETIN MODAL */}
      {deliverModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Confirmation de remise de bulletin
            </h3>
            <p className="text-xs text-slate-600">
              Indiquez le nom de la personne (parent ou tuteur) qui réceptionne le bulletin officiel (RG-06).
            </p>
            <input
              type="text"
              required
              value={receivedByInput}
              onChange={(e) => setReceivedByInput(e.target.value)}
              placeholder="Nom complet du parent / tuteur"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeliverModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleUpdateDelivery(deliverModal, 'remis', receivedByInput)}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg"
              >
                Confirmer la remise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CLASS MODAL */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateClass}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">Nouvelle classe</h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Nom de la classe (ex. 3ème A)"
                value={classForm.name}
                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={classForm.cycle}
                  onChange={(e) => {
                    const cycle = e.target.value as SchoolCycle;
                    const baseFee = resolveFeeGridItem(
                      { feeGrid: state.feeGrid },
                      { cycle, program: classForm.program }
                    );
                    setClassForm({
                      ...classForm,
                      cycle,
                      registrationFee: baseFee?.registrationFee ?? classForm.registrationFee,
                      annualTuition: baseFee?.annualTuition ?? classForm.annualTuition,
                    });
                  }}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={classForm.program}
                  onChange={(e) => {
                    const program = e.target.value as SchoolProgram;
                    const baseFee = resolveFeeGridItem(
                      { feeGrid: state.feeGrid },
                      { cycle: classForm.cycle, program }
                    );
                    setClassForm({
                      ...classForm,
                      program,
                      registrationFee: baseFee?.registrationFee ?? classForm.registrationFee,
                      annualTuition: baseFee?.annualTuition ?? classForm.annualTuition,
                    });
                  }}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PROGRAMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="Salle (ex. Bâtiment C · Salle 14)"
                value={classForm.room}
                onChange={(e) => setClassForm({ ...classForm, room: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Professeur principal"
                value={classForm.headTeacher}
                onChange={(e) => setClassForm({ ...classForm, headTeacher: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Inscription classe (FCFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={classForm.registrationFee}
                    onChange={(e) =>
                      setClassForm({ ...classForm, registrationFee: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Scolarité annuelle (FCFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={classForm.annualTuition}
                    onChange={(e) =>
                      setClassForm({ ...classForm, annualTuition: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
              >
                Créer la classe
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CREATE SUBJECT MODAL */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateSubject}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">Nouvelle matière</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Code (PHI)"
                  value={subjectForm.code}
                  onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                  className="px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="Intitulé (Philosophie)"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  className="sm:col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={subjectForm.cycle}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, cycle: e.target.value as SchoolCycle })
                  }
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={subjectForm.program}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, program: e.target.value as SchoolProgram })
                  }
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PROGRAMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  placeholder="Coeff."
                  value={subjectForm.coefficient}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, coefficient: Number(e.target.value) })
                  }
                  className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Enseignant titulaire"
                  value={subjectForm.teacherName}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, teacherName: e.target.value })
                  }
                  className="sm:col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowSubjectModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg"
              >
                Ajouter la matière
              </button>
            </div>
          </form>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmitRejectionModal}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 my-auto"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Rejeter une fiche de notes
            </h3>
            <p className="text-xs text-slate-600">
              {rejectTarget.label} — Indiquez le motif du rejet afin que l’enseignant puisse corriger et soumettre à nouveau.
            </p>
            <textarea
              required
              rows={3}
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder="Ex. Erreur de report de note ou devoir manquant..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReasonInput('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy || !rejectReasonInput.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg"
              >
                Confirmer le rejet
              </button>
            </div>
          </form>
        </div>
      )}

      {bulletinModal && (
        <BulletinModal
          bulletin={bulletinModal.bulletin}
          student={bulletinModal.student}
          schoolClass={state.classes.find((c) => c.id === bulletinModal.student.classId)}
          period={state.periods.find((p) => p.id === bulletinModal.bulletin.periodId)}
          subjects={state.subjects}
          grades={state.grades}
          settings={state.settings}
          onClose={() => setBulletinModal(null)}
        />
      )}

      {cardStudent && (
        <StudentCardModal
          student={cardStudent}
          schoolClass={state.classes.find((c) => c.id === cardStudent.classId)}
          parent={state.parents.find((p) => p.id === cardStudent.parentId)}
          settings={state.settings}
          onClose={() => setCardStudent(null)}
        />
      )}
    </div>
  );
};
