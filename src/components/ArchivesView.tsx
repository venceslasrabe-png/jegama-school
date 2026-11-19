import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  Briefcase,
  CalendarPlus,
  Download,
  Eye,
  FilePlus2,
  FileSpreadsheet,
  Printer,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from '../api';
import type {
  AcademicYearArchive,
  ArchivedStudentRecord,
  ArchivedTeacherRecord,
} from '../types';
import {
  downloadArchiveExcelTemplate,
  exportArchiveToExcel,
  parseArchiveExcelFile,
} from '../utils/excel';
import { formatDateTimeFr, formatFcfa } from '../utils/format';
import { downloadElementAsPdf } from '../utils/pdf';

const SCHOOL_EMBLEM_URL = '/assets/aistudio/t_l_chargement_868aae2b.png';

function suggestNextAcademicYear(current: string): string {
  const m = current.match(/(\d{4})\D+(\d{4})/);
  if (m) {
    return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`;
  }
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

function suggestPreviousAcademicYear(existing: AcademicYearArchive[], current: string): string {
  const years = [current, ...existing.map((a) => a.academicYear)]
    .map((y) => {
      const m = y.match(/(\d{4})/);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null);
  const minYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear();
  return `${minYear - 1}-${minYear}`;
}

export const ArchivesView: React.FC<{
  state: AppState;
  session: SessionUser;
  onRefresh: () => Promise<void>;
  embedded?: boolean;
  openNewYearSignal?: number;
}> = ({ state, session, onRefresh, embedded = false, openNewYearSignal = 0 }) => {
  const isReadOnly = session.role === 'direction';
  const canArchiveData =
    !isReadOnly && ['admin', 'secretariat', 'caisse', 'scolarite'].includes(session.role);
  const canCloseYearAndDelete = session.role === 'admin';

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Filters on the archive list
  const [yearSearch, setYearSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'import_excel' | 'cloture'>('all');

  // Create new academic year & archive current
  const [showNewYearModal, setShowNewYearModal] = useState(false);
  const [newYearForm, setNewYearForm] = useState({
    newAcademicYear: suggestNextAcademicYear(state.settings.currentAcademicYear),
    periodMode: state.settings.periodMode,
    archiveNotes: '',
    resetTeacherLogs: false,
  });

  React.useEffect(() => {
    if (openNewYearSignal > 0 && canCloseYearAndDelete) {
      setNewYearForm({
        newAcademicYear: suggestNextAcademicYear(state.settings.currentAcademicYear),
        periodMode: state.settings.periodMode,
        archiveNotes: '',
        resetTeacherLogs: false,
      });
      setShowNewYearModal(true);
    }
  }, [
    openNewYearSignal,
    canCloseYearAndDelete,
    state.settings.currentAcademicYear,
    state.settings.periodMode,
  ]);

  // Excel import modal & drag-and-drop state
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingExcel, setIsDraggingExcel] = useState(false);
  const [pendingMergeArchive, setPendingMergeArchive] = useState<AcademicYearArchive | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importDraft, setImportDraft] = useState<{
    academicYear: string;
    sourceFileName: string;
    notes: string;
    records: ArchivedStudentRecord[];
    teacherRecords: ArchivedTeacherRecord[];
    sheetsRead: string[];
    mergeIntoArchiveId: string;
  } | null>(null);
  const [importParsing, setImportParsing] = useState(false);

  // Archive consultation modal state
  const [viewingArchive, setViewingArchive] = useState<AcademicYearArchive | null>(null);
  const [detailTab, setDetailTab] = useState<'students' | 'teachers'>('students');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Consolidated stats across all archived years
  const archiveStats = useMemo(() => {
    let totalStudents = 0;
    let totalCollectedFcfa = 0;
    let totalPayrollFcfa = 0;
    for (const arch of state.archivedYears) {
      totalStudents += arch.summary.totalStudents || 0;
      totalCollectedFcfa += arch.summary.totalCollectedFcfa || 0;
      totalPayrollFcfa += arch.summary.totalPayrollFcfa || 0;
    }
    return {
      yearsCount: state.archivedYears.length,
      totalStudents,
      totalCollectedFcfa,
      totalPayrollFcfa,
    };
  }, [state.archivedYears]);

  const filteredArchives = useMemo(() => {
    const q = yearSearch.trim().toLowerCase();
    return state.archivedYears.filter((arch) => {
      if (sourceFilter !== 'all' && arch.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        arch.academicYear.toLowerCase().includes(q) ||
        (arch.notes || '').toLowerCase().includes(q) ||
        (arch.sourceFileName || '').toLowerCase().includes(q) ||
        arch.archivedBy.toLowerCase().includes(q)
      );
    });
  }, [state.archivedYears, yearSearch, sourceFilter]);

  const availableCycles = useMemo(() => {
    if (!viewingArchive) return [];
    const set = new Set<string>();
    for (const r of viewingArchive.records) {
      if (r.cycle && r.cycle !== '—') set.add(r.cycle);
    }
    return Array.from(set);
  }, [viewingArchive]);

  const filteredArchiveRecords = useMemo(() => {
    if (!viewingArchive) return [];
    const q = archiveSearch.trim().toLowerCase();
    return viewingArchive.records.filter((r) => {
      if (cycleFilter !== 'all' && r.cycle !== cycleFilter) return false;
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.cardId.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q) ||
        r.cycle.toLowerCase().includes(q) ||
        r.parentName.toLowerCase().includes(q)
      );
    });
  }, [viewingArchive, archiveSearch, cycleFilter]);

  const filteredTeacherRecords = useMemo(() => {
    if (!viewingArchive?.teacherRecords) return [];
    const q = archiveSearch.trim().toLowerCase();
    if (!q) return viewingArchive.teacherRecords;
    return viewingArchive.teacherRecords.filter(
      (t) =>
        t.fullName.toLowerCase().includes(q) ||
        t.matricule.toLowerCase().includes(q) ||
        t.specialty.toLowerCase().includes(q) ||
        t.cycles.toLowerCase().includes(q)
    );
  }, [viewingArchive, archiveSearch]);

  const handleCreateAcademicYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ archive: AcademicYearArchive }>(
        '/api/admin/academic-years/create',
        {
          method: 'POST',
          body: JSON.stringify(newYearForm),
        },
        session
      );
      await onRefresh();
      setShowNewYearModal(false);
      setNewYearForm({
        newAcademicYear: suggestNextAcademicYear(newYearForm.newAcademicYear),
        periodMode: newYearForm.periodMode,
        archiveNotes: '',
        resetTeacherLogs: false,
      });
      setFeedback({
        type: 'ok',
        text: `Année ${res.archive.academicYear} archivée (${res.archive.summary.totalStudents} élève(s)). La nouvelle année académique ${newYearForm.newAcademicYear} est maintenant active.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la clôture.',
      });
    } finally {
      setBusy(false);
    }
  };

  const processExcelFile = async (file: File, targetArchive?: AcademicYearArchive | null) => {
    setImportParsing(true);
    setFeedback(null);
    try {
      const parsed = await parseArchiveExcelFile(file);
      const matchedExisting =
        targetArchive ||
        (parsed.detectedYear
          ? state.archivedYears.find(
              (a) => a.academicYear.toLowerCase() === parsed.detectedYear!.toLowerCase()
            ) || null
          : null);

      setImportDraft({
        academicYear:
          targetArchive?.academicYear ||
          parsed.detectedYear ||
          suggestPreviousAcademicYear(state.archivedYears, state.settings.currentAcademicYear),
        sourceFileName: file.name,
        notes: targetArchive
          ? `Complément Excel (${file.name})`
          : `Importation Excel (${file.name})`,
        records: parsed.records,
        teacherRecords: parsed.teacherRecords,
        sheetsRead: parsed.sheetsRead,
        mergeIntoArchiveId: matchedExisting ? matchedExisting.id : '',
      });
      setShowImportModal(true);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Impossible de lire ce fichier Excel.',
      });
    } finally {
      setImportParsing(false);
      setPendingMergeArchive(null);
    }
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      setPendingMergeArchive(null);
      return;
    }
    await processExcelFile(file, pendingMergeArchive);
  };

  const handleDropExcel = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingExcel(false);
    if (!canArchiveData || importParsing || busy) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processExcelFile(file, null);
  };

  const triggerExcelPick = (targetArchive?: AcademicYearArchive) => {
    if (!canArchiveData || importParsing || busy) return;
    setPendingMergeArchive(targetArchive || null);
    excelInputRef.current?.click();
  };

  const handleConfirmExcelImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importDraft) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = {
        academicYear: importDraft.academicYear,
        sourceFileName: importDraft.sourceFileName,
        notes: importDraft.notes,
        records: importDraft.records,
        teacherRecords: importDraft.teacherRecords,
        ...(importDraft.mergeIntoArchiveId
          ? { mergeIntoArchiveId: importDraft.mergeIntoArchiveId }
          : {}),
      };

      const res = await apiRequest<{ archive: AcademicYearArchive }>(
        '/api/admin/archives/import-excel',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        session
      );
      await onRefresh();
      if (viewingArchive && viewingArchive.id === res.archive.id) {
        setViewingArchive(res.archive);
      }
      const wasMerge = Boolean(importDraft.mergeIntoArchiveId);
      setShowImportModal(false);
      setImportDraft(null);
      setFeedback({
        type: 'ok',
        text: wasMerge
          ? `Archive ${res.archive.academicYear} complétée par Excel (${res.archive.summary.totalStudents} élève(s), ${res.archive.summary.totalTeachers ?? 0} enseignant(s) au total).`
          : `Archive Excel ${res.archive.academicYear} créée (${res.archive.summary.totalStudents} élève(s), ${res.archive.summary.totalTeachers ?? 0} enseignant(s)).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur d’importation.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteArchive = async (archiveId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/archives/${archiveId}`, { method: 'DELETE' }, session);
      await onRefresh();
      setConfirmDeleteId(null);
      if (viewingArchive?.id === archiveId) setViewingArchive(null);
      setFeedback({ type: 'ok', text: 'Archive supprimée.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de suppression.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadArchivePdf = async () => {
    if (!viewingArchive || !reportRef.current || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadElementAsPdf(
        reportRef.current,
        `Archive-JEGAMA-${viewingArchive.academicYear}.pdf`
      );
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la génération du PDF.',
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getOriginLabel = (source: AcademicYearArchive['source']) => {
    if (source === 'cloture') return 'Clôture annuelle';
    if (source === 'manuel') return 'Archive reprise';
    return 'Import Excel';
  };

  const getOriginStyle = (source: AcademicYearArchive['source']) => {
    if (source === 'cloture') return 'bg-blue-50 text-blue-900 border-blue-200';
    if (source === 'manuel') return 'bg-slate-100 text-slate-800 border-slate-300';
    return 'bg-emerald-50 text-emerald-900 border-emerald-200';
  };

  const selectedMergeArchive = useMemo(() => {
    if (!importDraft?.mergeIntoArchiveId) return null;
    return state.archivedYears.find((a) => a.id === importDraft.mergeIntoArchiveId) || null;
  }, [importDraft?.mergeIntoArchiveId, state.archivedYears]);

  return (
    <div className="space-y-6">
      {/* Hidden shared file input for new imports & per-archive Excel completion */}
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelFileSelected}
        disabled={importParsing || busy}
        className="sr-only"
      />

      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
              Archivage des années antérieures
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Archivage par importation de fichiers Excel (<span className="font-mono">.xlsx</span>,{' '}
              <span className="font-mono">.xls</span>, <span className="font-mono">.csv</span>) et
              clôture de fin d’année · Année active :{' '}
              <span className="font-mono font-semibold text-slate-800">
                {state.settings.currentAcademicYear}
              </span>
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Fermer"
            className="text-slate-500 hover:text-slate-900 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Consolidated KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 bg-white">
          <div className="text-xs font-medium text-slate-500">Années archivées</div>
          <div className="mt-1 text-xl sm:text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {archiveStats.yearsCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Active : <span className="font-mono">{state.settings.currentAcademicYear}</span>
          </div>
        </div>
        <div className="p-4 bg-white">
          <div className="text-xs font-medium text-slate-500">Dossiers élèves archivés</div>
          <div className="mt-1 text-xl sm:text-2xl font-mono font-bold text-blue-900 tabular-nums">
            {archiveStats.totalStudents}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Notes, scolarité & assiduité</div>
        </div>
        <div className="p-4 bg-white">
          <div className="text-xs font-medium text-slate-500">Recettes historiques</div>
          <div className="mt-1 text-lg sm:text-xl font-mono font-bold text-emerald-700 tabular-nums truncate">
            {formatFcfa(archiveStats.totalCollectedFcfa)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Scolarité encaissée archivée</div>
        </div>
        <div className="p-4 bg-white">
          <div className="text-xs font-medium text-slate-500">Paie enseignants archivée</div>
          <div className="mt-1 text-lg sm:text-xl font-mono font-bold text-slate-900 tabular-nums truncate">
            {formatFcfa(archiveStats.totalPayrollFcfa)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Cumul des rémunérations passées</div>
        </div>
      </div>

      {/* Primary Workflow: Excel Import Archiving + Annual Rollover */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* 1. Primary Excel Import Dropzone */}
        <div
          onDragOver={(e) => {
            if (!canArchiveData) return;
            e.preventDefault();
            e.stopPropagation();
            if (!isDraggingExcel) setIsDraggingExcel(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingExcel(false);
          }}
          onDrop={handleDropExcel}
          className={`lg:col-span-7 bg-white border rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 transition-colors ${
            isDraggingExcel
              ? 'border-[#E5A923] bg-amber-50/40'
              : 'border-slate-200'
          }`}
        >
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-900">
                <FileSpreadsheet className="w-5 h-5 text-[#0B1933] shrink-0" />
                <h2 className="font-display text-sm sm:text-base font-bold">
                  Archiver une année antérieure par importation Excel
                </h2>
              </div>
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                Multi-feuilles .xlsx / .xls / .csv
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Déposez ou sélectionnez votre classeur Excel des années antérieures. Le système détecte automatiquement toutes les feuilles : listes d’élèves par classe, scolarité versée, moyennes générales et états de paie du corps enseignants.
            </p>

            {canArchiveData && (
              <div
                onClick={() => triggerExcelPick()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerExcelPick();
                  }
                }}
                className={`border border-dashed rounded-lg px-4 py-3.5 text-center cursor-pointer transition-colors ${
                  isDraggingExcel
                    ? 'border-[#0B1933] bg-amber-50'
                    : 'border-slate-300 bg-slate-50/70 hover:border-[#0B1933] hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs">
                  <Upload className="w-4 h-4 text-[#0B1933] shrink-0" />
                  <span className="font-semibold text-slate-800">
                    {importParsing
                      ? 'Analyse du classeur Excel en cours...'
                      : 'Glissez-déposez votre fichier Excel ici ou cliquez pour parcourir'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Permet de créer une nouvelle archive annuelle ou de compléter une année déjà archivée.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canArchiveData ? (
              <button
                type="button"
                disabled={importParsing || busy}
                onClick={() => triggerExcelPick()}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4 text-[#E5A923]" />
                {importParsing ? 'Lecture du fichier...' : 'Importer un fichier Excel'}
              </button>
            ) : (
              <span className="text-xs text-slate-500">
                Profil Direction : consultation et exportation uniquement
              </span>
            )}
            <button
              type="button"
              onClick={downloadArchiveExcelTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger le modèle Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* 2. End-of-year rollover */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-900">
                <Archive className="w-5 h-5 text-[#d89b18] shrink-0" />
                <h2 className="font-display text-sm sm:text-base font-bold">
                  Clôturer l’année {state.settings.currentAcademicYear}
                </h2>
              </div>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Active
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Sauvegarde automatiquement les <span className="font-mono font-semibold">{state.summary.totalStudents}</span> élève(s), encaissements (<span className="font-mono font-semibold">{formatFcfa(state.summary.totalCollectedFcfa)}</span>), bulletins et masse salariale avant d’ouvrir l’exercice suivant.
            </p>
          </div>
          <div>
            {canCloseYearAndDelete ? (
              <button
                type="button"
                onClick={() => {
                  setNewYearForm({
                    newAcademicYear: suggestNextAcademicYear(state.settings.currentAcademicYear),
                    periodMode: state.settings.periodMode,
                    archiveNotes: '',
                    resetTeacherLogs: false,
                  });
                  setShowNewYearModal(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg transition-colors whitespace-nowrap"
              >
                <CalendarPlus className="w-4 h-4 shrink-0" />
                Créer une nouvelle année académique
              </button>
            ) : (
              <span className="text-xs text-slate-400">
                Clôture annuelle réservée à l’administrateur
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Archived Years List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Registre des années académiques archivées ({filteredArchives.length})
            </h2>
            <p className="text-xs text-slate-500">
              Historique consolidé des archives importées par Excel et des clôtures annuelles.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={yearSearch}
                onChange={(e) => setYearSearch(e.target.value)}
                placeholder="Filtrer année ou fichier..."
                className="w-full sm:w-48 pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'Toutes' },
                  { id: 'import_excel', label: 'Imports Excel' },
                  { id: 'cloture', label: 'Clôtures' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    sourceFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredArchives.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucune archive ne correspond à vos critères. Importez un fichier Excel (.xlsx, .xls, .csv) pour archiver les données d’une année antérieure.
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredArchives.map((arch) => (
                <div key={arch.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono font-bold text-base text-slate-900">
                        {arch.academicYear}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Le {formatDateTimeFr(arch.archivedAt)} · {arch.archivedBy}
                        {arch.sourceFileName && ` · ${arch.sourceFileName}`}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${getOriginStyle(
                        arch.source
                      )}`}
                    >
                      {getOriginLabel(arch.source)}
                    </span>
                  </div>

                  {arch.notes && <p className="text-xs text-slate-600">{arch.notes}</p>}

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <div>
                      <div className="text-slate-400">Élèves</div>
                      <div className="font-mono font-bold text-slate-900 tabular-nums">
                        {arch.summary.totalStudents}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Moy. étab.</div>
                      <div className="font-mono font-bold text-blue-950 tabular-nums">
                        {arch.summary.averageScore !== null
                          ? `${arch.summary.averageScore.toFixed(2)} / 20`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Encaissé</div>
                      <div className="font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatFcfa(arch.summary.totalCollectedFcfa)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Paie enseignants</div>
                      <div className="font-mono font-semibold text-slate-900 tabular-nums">
                        {arch.summary.totalPayrollFcfa
                          ? formatFcfa(arch.summary.totalPayrollFcfa)
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveSearch('');
                        setCycleFilter('all');
                        setDetailTab('students');
                        setViewingArchive(arch);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Consulter
                    </button>
                    {canArchiveData && (
                      <button
                        type="button"
                        onClick={() => triggerExcelPick(arch)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-900 border border-emerald-200 bg-emerald-50/70 rounded-md hover:bg-emerald-100"
                      >
                        <FilePlus2 className="w-3.5 h-3.5" />
                        Compléter Excel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => exportArchiveToExcel(arch)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-100"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exporter
                    </button>
                    {canCloseYearAndDelete &&
                      (confirmDeleteId === arch.id ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDeleteArchive(arch.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md"
                        >
                          Confirmer
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(arch.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Supprimer
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Année académique</th>
                    <th className="py-3 px-4 font-semibold">Origine & Fichier</th>
                    <th className="py-3 px-4 font-semibold text-right">Élèves</th>
                    <th className="py-3 px-4 font-semibold text-right">Encaissé (FCFA)</th>
                    <th className="py-3 px-4 font-semibold text-right">Moy. étab.</th>
                    <th className="py-3 px-4 font-semibold text-right">Corps enseignants</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredArchives.map((arch) => (
                    <tr key={arch.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900 text-base">
                          {arch.academicYear}
                        </div>
                        {arch.notes && (
                          <div className="text-xs text-slate-500 max-w-xs truncate">
                            {arch.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${getOriginStyle(
                            arch.source
                          )}`}
                        >
                          {getOriginLabel(arch.source)}
                        </span>
                        <div className="text-xs text-slate-500 mt-1">
                          Le {formatDateTimeFr(arch.archivedAt)} par {arch.archivedBy}
                          {arch.sourceFileName && (
                            <span className="font-mono text-slate-600"> · {arch.sourceFileName}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {arch.summary.totalStudents}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatFcfa(arch.summary.totalCollectedFcfa)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-950 tabular-nums">
                        {arch.summary.averageScore !== null
                          ? `${arch.summary.averageScore.toFixed(2)} / 20`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {arch.summary.totalTeachers || arch.summary.totalPayrollFcfa ? (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {arch.summary.totalTeachers ?? arch.teacherRecords?.length ?? 0} ens.
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {formatFcfa(arch.summary.totalPayrollFcfa || 0)}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setArchiveSearch('');
                              setCycleFilter('all');
                              setDetailTab('students');
                              setViewingArchive(arch);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Consulter
                          </button>
                          {canArchiveData && (
                            <button
                              type="button"
                              onClick={() => triggerExcelPick(arch)}
                              title="Compléter cette archive avec un autre fichier Excel"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-900 border border-emerald-200 bg-emerald-50/70 rounded-md hover:bg-emerald-100"
                            >
                              <FilePlus2 className="w-3.5 h-3.5" />
                              + Excel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => exportArchiveToExcel(arch)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Exporter
                          </button>
                          {canCloseYearAndDelete &&
                            (confirmDeleteId === arch.id ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDeleteArchive(arch.id)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md"
                              >
                                Confirmer
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(arch.id)}
                                title="Supprimer cette archive"
                                className="p-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* MODAL 1: CREATE NEW ACADEMIC YEAR (WITH AUTOMATIC ARCHIVAL) */}
      {showNewYearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateAcademicYear}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Créer une nouvelle année académique
              </h3>
              <button
                type="button"
                onClick={() => setShowNewYearModal(false)}
                aria-label="Fermer"
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold">
                Archivage automatique de {state.settings.currentAcademicYear}
              </div>
              <p>
                Les dossiers financiers, notes, bulletins, présences et états du corps enseignants de{' '}
                <span className="font-mono font-semibold">{state.settings.currentAcademicYear}</span>{' '}
                ({state.summary.totalStudents} élève(s), {formatFcfa(state.summary.totalCollectedFcfa)}) seront sauvegardés dans les archives. Les élèves resteront en base pour réinscription rapide avec leur ID carte.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nouvelle année académique *
                </label>
                <input
                  type="text"
                  required
                  value={newYearForm.newAcademicYear}
                  onChange={(e) =>
                    setNewYearForm({ ...newYearForm, newAcademicYear: e.target.value })
                  }
                  placeholder="ex. 2027-2028"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Découpage des périodes
                </label>
                <select
                  value={newYearForm.periodMode}
                  onChange={(e) =>
                    setNewYearForm({
                      ...newYearForm,
                      periodMode: e.target.value as 'Trimestres' | 'Séquences',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Trimestres">Trimestres (T1, T2, T3)</option>
                  <option value="Séquences">Séquences (S1, S2, S3)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observations de clôture (facultatif)
                </label>
                <input
                  type="text"
                  value={newYearForm.archiveNotes}
                  onChange={(e) =>
                    setNewYearForm({ ...newYearForm, archiveNotes: e.target.value })
                  }
                  placeholder="ex. Clôture officielle fin d’année scolaire"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 pt-1">
                <input
                  type="checkbox"
                  checked={newYearForm.resetTeacherLogs}
                  onChange={(e) =>
                    setNewYearForm({ ...newYearForm, resetTeacherLogs: e.target.checked })
                  }
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  Réinitialiser les pointages d’heures et bulletins de paye enseignants après archivage pour démarrer le nouvel exercice à zéro.
                </span>
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowNewYearModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-bold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg text-center"
              >
                {busy
                  ? 'Archivage en cours...'
                  : `Archiver ${state.settings.currentAcademicYear} & Ouvrir ${newYearForm.newAcademicYear}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: IMPORT / MERGE EXCEL ARCHIVE */}
      {showImportModal && importDraft && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmExcelImport}
            className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {selectedMergeArchive
                    ? `Compléter l’archive ${selectedMergeArchive.academicYear} par Excel`
                    : 'Confirmer l’archivage par importation Excel'}
                </h3>
                <p className="text-xs text-slate-500">
                  Fichier : <span className="font-mono">{importDraft.sourceFileName}</span> ·{' '}
                  <span className="font-mono font-semibold">{importDraft.records.length}</span> élève(s)
                  {importDraft.teacherRecords.length > 0 && (
                    <>
                      {' · '}
                      <span className="font-mono font-semibold">
                        {importDraft.teacherRecords.length}
                      </span>{' '}
                      enseignant(s)
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportDraft(null);
                }}
                aria-label="Fermer"
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {importDraft.sheetsRead.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-slate-600">Feuilles lues :</span>
                {importDraft.sheetsRead.map((sheetLabel, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-slate-700"
                  >
                    {sheetLabel}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Destination de l’importation
                </label>
                <select
                  value={importDraft.mergeIntoArchiveId}
                  onChange={(e) => {
                    const targetId = e.target.value;
                    const target = state.archivedYears.find((a) => a.id === targetId);
                    setImportDraft({
                      ...importDraft,
                      mergeIntoArchiveId: targetId,
                      academicYear: target ? target.academicYear : importDraft.academicYear,
                    });
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Créer une nouvelle archive annuelle</option>
                  {state.archivedYears.map((arch) => (
                    <option key={arch.id} value={arch.id}>
                      Compléter : {arch.academicYear} ({arch.summary.totalStudents} él.)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Année académique archivée *
                </label>
                <input
                  type="text"
                  required
                  readOnly={Boolean(selectedMergeArchive)}
                  value={importDraft.academicYear}
                  onChange={(e) =>
                    setImportDraft({ ...importDraft, academicYear: e.target.value })
                  }
                  placeholder="ex. 2023-2024"
                  className={`w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg ${
                    selectedMergeArchive ? 'bg-slate-100 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observations
                </label>
                <input
                  type="text"
                  value={importDraft.notes}
                  onChange={(e) => setImportDraft({ ...importDraft, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {selectedMergeArchive && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                Les dossiers extraits de ce fichier Excel seront fusionnés dans l’archive{' '}
                <span className="font-mono font-bold">{selectedMergeArchive.academicYear}</span>{' '}
                (actuellement {selectedMergeArchive.summary.totalStudents} élève(s) et{' '}
                {selectedMergeArchive.summary.totalTeachers ??
                  selectedMergeArchive.teacherRecords?.length ??
                  0}{' '}
                enseignant(s)) et les totaux seront recalculés automatiquement.
              </div>
            )}

            {importDraft.records.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-56">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-900" />
                  Aperçu dossiers élèves ({importDraft.records.length})
                </div>
                <table className="w-full text-xs min-w-[540px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                      <th className="py-2 px-3 font-semibold">ID Carte</th>
                      <th className="py-2 px-3 font-semibold">Élève</th>
                      <th className="py-2 px-3 font-semibold">Classe</th>
                      <th className="py-2 px-3 font-semibold text-right">Payé</th>
                      <th className="py-2 px-3 font-semibold text-right">Moyenne</th>
                      <th className="py-2 px-3 font-semibold">Mention</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importDraft.records.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-mono text-slate-600">{r.cardId}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{r.fullName}</td>
                        <td className="py-2 px-3 text-slate-600">{r.className}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatFcfa(r.totalPaidFcfa)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {r.generalAverage !== null ? r.generalAverage.toFixed(2) : '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{r.mention}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importDraft.records.length > 20 && (
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                    Aperçu limité aux 20 premières lignes sur {importDraft.records.length}.
                  </div>
                )}
              </div>
            )}

            {importDraft.teacherRecords.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-48">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-emerald-700" />
                  Aperçu corps enseignants & paie ({importDraft.teacherRecords.length})
                </div>
                <table className="w-full text-xs min-w-[480px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-left">
                      <th className="py-1.5 px-3 font-semibold">Matricule</th>
                      <th className="py-1.5 px-3 font-semibold">Enseignant</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Taux / h</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Heures</th>
                      <th className="py-1.5 px-3 font-semibold text-right">Salaire versé</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importDraft.teacherRecords.slice(0, 15).map((t, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 font-mono text-slate-600">{t.matricule}</td>
                        <td className="py-1.5 px-3 font-medium text-slate-900">{t.fullName}</td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                          {formatFcfa(t.hourlyRateFcfa)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                          {t.totalHours} h
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {formatFcfa(t.totalPaidFcfa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportDraft(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] rounded-lg"
              >
                {busy
                  ? 'Importation en cours...'
                  : selectedMergeArchive
                    ? `Fusionner dans ${selectedMergeArchive.academicYear}`
                    : `Archiver ${importDraft.academicYear} (${importDraft.records.length} él. / ${importDraft.teacherRecords.length} ens.)`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: VIEW ARCHIVED YEAR DETAILS + PDF / EXCEL */}
      {viewingArchive && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden print-container my-auto">
            {/* Toolbar */}
            <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="min-w-0">
                <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                  Archive année académique · {viewingArchive.academicYear}
                </h3>
                <p className="text-xs text-slate-500">
                  {getOriginLabel(viewingArchive.source)} · Archivée le{' '}
                  {formatDateTimeFr(viewingArchive.archivedAt)} par {viewingArchive.archivedBy}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canArchiveData && (
                  <button
                    type="button"
                    onClick={() => triggerExcelPick(viewingArchive)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg whitespace-nowrap"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    Compléter par Excel
                  </button>
                )}
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={handleDownloadArchivePdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] disabled:opacity-60 rounded-lg whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingPdf ? 'PDF...' : 'Télécharger PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer
                </button>
                <button
                  type="button"
                  onClick={() => exportArchiveToExcel(viewingArchive)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] rounded-lg whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#E5A923]" />
                  Exporter Excel
                </button>
                <button
                  type="button"
                  onClick={() => setViewingArchive(null)}
                  aria-label="Fermer"
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Body + Printable PDF area */}
            <div className="overflow-y-auto p-4 sm:p-6 space-y-4 flex-1">
              {/* Filter Bar (screen only) */}
              <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => setDetailTab('students')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      detailTab === 'students'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Dossiers élèves ({viewingArchive.records.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab('teachers')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      detailTab === 'teachers'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Corps enseignants ({viewingArchive.teacherRecords?.length ?? 0})
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {detailTab === 'students' && availableCycles.length > 0 && (
                    <select
                      value={cycleFilter}
                      onChange={(e) => setCycleFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="all">Tous les cycles</option>
                      {availableCycles.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={archiveSearch}
                      onChange={(e) => setArchiveSearch(e.target.value)}
                      placeholder={
                        detailTab === 'students'
                          ? 'Rechercher élève, ID ou classe...'
                          : 'Rechercher enseignant ou matière...'
                      }
                      className="w-full sm:w-56 pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Printable / PDF Report Content */}
              <div ref={reportRef} className="bg-white space-y-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <img
                      src={SCHOOL_EMBLEM_URL}
                      alt="Logo JEGAMA SCHOOL"
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 object-contain rounded border border-slate-200 p-0.5 bg-white"
                    />
                    <div>
                      <div className="text-sm font-extrabold text-[#0B1933]">
                        {state.settings.schoolName} · ARCHIVE OFFICIELLE {viewingArchive.academicYear}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {state.settings.address}, {state.settings.city} ·{' '}
                        {viewingArchive.notes || getOriginLabel(viewingArchive.source)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                  <div>
                    <div className="text-slate-500">Effectif élèves</div>
                    <div className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                      {viewingArchive.summary.totalStudents}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Scolarité encaissée</div>
                    <div className="font-mono font-bold text-emerald-700 text-sm tabular-nums">
                      {formatFcfa(viewingArchive.summary.totalCollectedFcfa)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Moyenne étab.</div>
                    <div className="font-mono font-bold text-blue-950 text-sm tabular-nums">
                      {viewingArchive.summary.averageScore !== null
                        ? `${viewingArchive.summary.averageScore.toFixed(2)} / 20`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Masse salariale paie</div>
                    <div className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                      {viewingArchive.summary.totalPayrollFcfa
                        ? formatFcfa(viewingArchive.summary.totalPayrollFcfa)
                        : '—'}
                    </div>
                  </div>
                </div>

                {detailTab === 'students' ? (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs min-w-[680px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                          <th className="py-2.5 px-3 font-semibold">ID Carte</th>
                          <th className="py-2.5 px-3 font-semibold">Élève</th>
                          <th className="py-2.5 px-3 font-semibold">Cycle & Classe</th>
                          <th className="py-2.5 px-3 font-semibold">Parent</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Payé</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Moyenne</th>
                          <th className="py-2.5 px-3 font-semibold">Mention</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Abs. / Ret.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredArchiveRecords.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-500">
                              {viewingArchive.records.length === 0
                                ? 'Aucun dossier élève importé dans cette archive. Utilisez « Compléter par Excel » pour en importer.'
                                : 'Aucun élève trouvé pour ce filtre.'}
                            </td>
                          </tr>
                        ) : (
                          filteredArchiveRecords.map((r, i) => (
                            <tr key={`${r.cardId}-${i}`} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono text-slate-700">{r.cardId}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {r.fullName}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {r.className} ({r.cycle})
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {r.parentName}
                                {r.parentPhone !== '—' && (
                                  <span className="block font-mono text-[11px] text-slate-400">
                                    {r.parentPhone}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                                {formatFcfa(r.totalPaidFcfa)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-950 tabular-nums">
                                {r.generalAverage !== null
                                  ? `${r.generalAverage.toFixed(2)}/20`
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">{r.mention}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                                {r.absencesCount} / {r.latesCount}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                          <th className="py-2.5 px-3 font-semibold">Matricule</th>
                          <th className="py-2.5 px-3 font-semibold">Enseignant</th>
                          <th className="py-2.5 px-3 font-semibold">Spécialité & Contrat</th>
                          <th className="py-2.5 px-3 font-semibold">Cycles</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Taux horaire</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Cumul heures</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Salaire versé</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTeacherRecords.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-500">
                              Aucun état de paie enseignant enregistré dans cette archive. Utilisez « Compléter par Excel » pour importer une feuille Corps enseignants.
                            </td>
                          </tr>
                        ) : (
                          filteredTeacherRecords.map((t, idx) => (
                            <tr key={`${t.matricule}-${idx}`} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono text-slate-700">
                                {t.matricule}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {t.fullName}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {t.specialty} · {t.contractType}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{t.cycles}</td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                {formatFcfa(t.hourlyRateFcfa)}/h
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-semibold">
                                {t.totalHours} h
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-blue-950">
                                {formatFcfa(t.totalPaidFcfa)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
