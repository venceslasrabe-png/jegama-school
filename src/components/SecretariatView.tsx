import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calculator,
  CheckCircle2,
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
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from '../api';
import type { Bulletin, MentionThreshold, SchoolCycle, SchoolProgram, Student } from '../types';
import { downloadGradesExcelTemplate, parseGradesExcelFile } from '../utils/excel';
import { CYCLES, formatDateFr, formatDateTimeFr, PROGRAMS } from '../utils/format';
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
  const canModify = session.role === 'secretariat' || session.role === 'admin';
  const isReadOnly = session.role === 'direction' || !canModify;

  const [activeTab, setActiveTab] = useState<SecretariatTab>(initialTab || 'notes');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

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
      setFeedback({ type: 'ok', text: 'Note enregistrée, moyenne et classement recalculés.' });
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
        text: `${res.savedCount} fiche(s) de notes enregistrée(s) et bulletins mis à jour.`,
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

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/api/classes', { method: 'POST', body: JSON.stringify(classForm) }, session);
      await onRefresh();
      setShowClassModal(false);
      setClassForm({ ...classForm, name: '', room: '', headTeacher: '' });
      setFeedback({ type: 'ok', text: 'Classe créée avec succès.' });
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Secrétariat académique
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Constitution des classes, matières, coefficients, saisie des notes (/20) et livraison des bulletins.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start overflow-x-auto max-w-full">
          {(
            [
              { id: 'notes', label: 'Notes & Moyennes' },
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
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fermer
          </button>
        </div>
      )}

      {/* Shared Period / Class selector for Notes & Bulletins */}
      {(activeTab === 'notes' || activeTab === 'bulletins') && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Période d’évaluation
                </label>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {state.periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.status === 'verrouille' ? 'Verrouillé' : 'Ouvert'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Classe
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {state.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.cycle} ({c.program})
                    </option>
                  ))}
                </select>
              </div>

              {activeTab === 'notes' && entryMode === 'classe' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Matière
                  </label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
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
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Élève
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
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
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setEntryMode('classe')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
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

              {!isReadOnly && (
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
                    Enregistrer toutes les notes
                  </button>
                </div>
              )}
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
              {!isReadOnly && (
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
              {!isReadOnly && selectedClass && (
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
            <div className="overflow-x-auto">
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
                                  {draft.dirty
                                    ? ' · Modifié'
                                    : existing
                                      ? ' · Enregistré'
                                      : ''}
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
                                  disabled={isReadOnly}
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
                              disabled={isReadOnly}
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
                                disabled={isReadOnly}
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
                            {!isReadOnly ? (
                              <div className="inline-flex items-center gap-1.5">
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
                                {existing && (
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
          ) : (
            <div className="overflow-x-auto">
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
                              {draft.dirty
                                ? ' · Modifié'
                                : existing
                                  ? ' · Enregistré'
                                  : ''}
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
                                  disabled={isReadOnly}
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
                              disabled={isReadOnly}
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
                                disabled={isReadOnly}
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
                            {!isReadOnly ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy || hasInvalid || validNumbers.length === 0}
                                  onClick={() => handleSaveGrade(selectedStudentId, sub.id)}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-45 rounded-md whitespace-nowrap"
                                >
                                  Enregistrer
                                </button>
                                {existing && (
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
          )}
        </div>
      )}

      {/* TAB 2: BULLETINS & LIVRAISON */}
      {activeTab === 'bulletins' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-900" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Bulletins · {selectedClass?.name} ({selectedPeriod?.label})
              </h2>
            </div>
            <div className="text-xs text-slate-500">
              {classBulletins.length} bulletin(s) généré(s)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Classes ({state.classes.length})
                </h2>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowClassModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg"
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
                  return (
                    <div key={cls.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{cls.name}</div>
                        <div className="text-xs text-slate-500">
                          {cls.cycle} · {cls.program} · {cls.room} · PP : {cls.headTeacher}
                        </div>
                      </div>
                      <div className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {count} / {cls.capacity}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-900" />
                  Matières & Coefficients ({state.subjects.length})
                </h2>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowSubjectModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter matière
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 pr-1">
                {state.subjects.map((sub) => (
                  <div key={sub.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
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
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-display text-base font-bold text-slate-900 mb-4">
              Affectation des élèves aux classes & Réimpression de cartes
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
          <div className="px-6 py-4 border-b border-slate-200">
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
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateClass}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
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
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={classForm.cycle}
                  onChange={(e) => setClassForm({ ...classForm, cycle: e.target.value as SchoolCycle })}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={classForm.program}
                  onChange={(e) => setClassForm({ ...classForm, program: e.target.value as SchoolProgram })}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSubject}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">Nouvelle matière</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
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
                  className="col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-3 gap-3">
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
                  className="col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
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
