import React, { useMemo, useState } from 'react';
import {
  Archive,
  CalendarPlus,
  Download,
  Eye,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Sliders,
  Trash2,
  Upload,
  UserCog,
  X,
} from 'lucide-react';
import { apiRequest, downloadBackupJson, type AppState, type SessionUser } from '../api';
import type { AcademicYearArchive, ArchivedStudentRecord, UserRole } from '../types';
import { downloadArchiveExcelTemplate, exportArchiveToExcel, parseArchiveExcelFile } from '../utils/excel';
import { formatDateTimeFr, formatFcfa, ROLE_LABELS } from '../utils/format';

function suggestNextAcademicYear(current: string): string {
  const m = current.match(/(\d{4})\D+(\d{4})/);
  if (m) {
    return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`;
  }
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

export const AdminView: React.FC<{
  state: AppState;
  session: SessionUser;
  onRefresh: () => Promise<void>;
}> = ({ state, session, onRefresh }) => {
  const isReadOnly = session.role === 'direction';
  const [activeTab, setActiveTab] = useState<'params' | 'archives' | 'users' | 'audit'>('params');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [settingsDraft, setSettingsDraft] = useState(state.settings);
  React.useEffect(() => {
    setSettingsDraft(state.settings);
  }, [state.settings]);

  const [newUser, setNewUser] = useState({
    username: '',
    fullName: '',
    role: 'scolarite' as UserRole,
    password: '',
  });

  // New Academic Year & Archival modal state
  const [showNewYearModal, setShowNewYearModal] = useState(false);
  const [newYearForm, setNewYearForm] = useState({
    newAcademicYear: suggestNextAcademicYear(state.settings.currentAcademicYear),
    periodMode: state.settings.periodMode,
    archiveNotes: '',
  });

  // Excel Archive Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importDraft, setImportDraft] = useState<{
    academicYear: string;
    sourceFileName: string;
    notes: string;
    records: ArchivedStudentRecord[];
  } | null>(null);
  const [importParsing, setImportParsing] = useState(false);

  // Viewing an archived year
  const [viewingArchive, setViewingArchive] = useState<AcademicYearArchive | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        '/api/admin/settings',
        { method: 'PUT', body: JSON.stringify(settingsDraft) },
        session
      );
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Paramètres de l’établissement mis à jour.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(
        '/api/admin/users',
        { method: 'POST', body: JSON.stringify(newUser) },
        session
      );
      await onRefresh();
      setNewUser({ username: '', fullName: '', role: 'scolarite', password: '' });
      setFeedback({ type: 'ok', text: 'Compte utilisateur créé.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUser = async (userId: string) => {
    setBusy(true);
    try {
      await apiRequest(`/api/admin/users/${userId}/toggle`, { method: 'POST' }, session);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Statut du compte mis à jour.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const data = await downloadBackupJson(session);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jegama-scool-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Sauvegarde complète téléchargée.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await apiRequest('/api/admin/restore', { method: 'POST', body: JSON.stringify(parsed) }, session);
      await onRefresh();
      setFeedback({ type: 'ok', text: `Sauvegarde « ${file.name} » restaurée avec succès.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Fichier de sauvegarde JSON invalide.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResetDemo = async () => {
    setBusy(true);
    try {
      await apiRequest('/api/admin/reset-demo', { method: 'POST' }, session);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Base de démonstration réinitialisée.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  };

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
      });
      setActiveTab('archives');
      setFeedback({
        type: 'ok',
        text: `Année ${res.archive.academicYear} archivée (${res.archive.summary.totalStudents} élève(s)). La nouvelle année académique ${newYearForm.newAcademicYear} est maintenant active.`,
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur lors de la clôture.' });
    } finally {
      setBusy(false);
    }
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportParsing(true);
    setFeedback(null);
    try {
      const parsed = await parseArchiveExcelFile(file);
      setImportDraft({
        academicYear: parsed.detectedYear || '2025-2026',
        sourceFileName: file.name,
        notes: `Importation Excel (${file.name})`,
        records: parsed.records,
      });
      setShowImportModal(true);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Impossible de lire ce fichier Excel.',
      });
    } finally {
      setImportParsing(false);
    }
  };

  const handleConfirmExcelImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importDraft) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ archive: AcademicYearArchive }>(
        '/api/admin/archives/import-excel',
        {
          method: 'POST',
          body: JSON.stringify(importDraft),
        },
        session
      );
      await onRefresh();
      setShowImportModal(false);
      setImportDraft(null);
      setActiveTab('archives');
      setFeedback({
        type: 'ok',
        text: `Archive Excel ${res.archive.academicYear} importée avec succès (${res.archive.summary.totalStudents} élève(s)).`,
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur d’importation.' });
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
      setFeedback({ type: 'ok', text: 'Archive supprimée.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur de suppression.' });
    } finally {
      setBusy(false);
    }
  };

  const filteredArchiveRecords = useMemo(() => {
    if (!viewingArchive) return [];
    const q = archiveSearch.trim().toLowerCase();
    if (!q) return viewingArchive.records;
    return viewingArchive.records.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.cardId.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q) ||
        r.cycle.toLowerCase().includes(q)
    );
  }, [viewingArchive, archiveSearch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Administration & Journal d’audit
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Années académiques, archives Excel, paramètres généraux, comptes et sauvegardes.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start w-full sm:w-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('params')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'params'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Paramètres & Sauvegardes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archives')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'archives'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            Années & Archives ({state.archivedYears.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCog className="w-3.5 h-3.5" />
            Comptes ({state.users.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Journal d’audit ({state.auditLogs.length})
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
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

      {/* TAB 1: SETTINGS & BACKUP */}
      {activeTab === 'params' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4"
          >
            <h2 className="font-display text-base font-bold text-slate-900">
              Configuration de l’établissement & Sécurité
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Année scolaire active
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={settingsDraft.currentAcademicYear}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, currentAcademicYear: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Découpage des périodes
                </label>
                <select
                  disabled={isReadOnly}
                  value={settingsDraft.periodMode}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      periodMode: e.target.value as 'Trimestres' | 'Séquences',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                >
                  <option value="Trimestres">Trimestres</option>
                  <option value="Séquences">Séquences</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sécurité accès parent (RF-PAR)
                </label>
                <select
                  disabled={isReadOnly}
                  value={settingsDraft.parentRequireSecretCode ? 'yes' : 'no'}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      parentRequireSecretCode: e.target.value === 'yes',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                >
                  <option value="yes">ID Carte + Code secret obligatoire</option>
                  <option value="no">ID Carte uniquement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tentatives parent avant verrouillage
                </label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  disabled={isReadOnly}
                  value={settingsDraft.maxParentLoginAttempts}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      maxParentLoginAttempts: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Barème des mentions (RG-05)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {settingsDraft.mentionThresholds.map((m, idx) => (
                  <div key={m.label} className="p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                    <div className="text-xs font-semibold text-slate-800">{m.label}</div>
                    <input
                      type="number"
                      step="0.5"
                      disabled={isReadOnly}
                      value={m.minScore}
                      onChange={(e) => {
                        const copy = [...settingsDraft.mentionThresholds];
                        copy[idx] = { ...copy[idx], minScore: Number(e.target.value) };
                        setSettingsDraft({ ...settingsDraft, mentionThresholds: copy });
                      }}
                      className="mt-1 w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
                    />
                  </div>
                ))}
              </div>
            </div>

            {!isReadOnly && (
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
                >
                  Enregistrer les paramètres
                </button>
              </div>
            )}
          </form>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 h-fit">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Clôture annuelle & Sauvegardes
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Dernière sauvegarde enregistrée :{' '}
                <span className="font-mono text-slate-700">
                  {formatDateTimeFr(state.settings.lastBackupAt)}
                </span>
              </p>
            </div>

            {!isReadOnly ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setNewYearForm({
                      newAcademicYear: suggestNextAcademicYear(state.settings.currentAcademicYear),
                      periodMode: state.settings.periodMode,
                      archiveNotes: '',
                    });
                    setShowNewYearModal(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg transition-colors"
                >
                  <CalendarPlus className="w-4 h-4" />
                  Créer une nouvelle année académique
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
                >
                  <Download className="w-4 h-4" />
                  Télécharger la sauvegarde complète (JSON)
                </button>

                <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-blue-900 border border-blue-200 bg-blue-50/70 hover:bg-blue-100 rounded-lg cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Restaurer une sauvegarde (JSON)
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleRestoreBackup}
                    disabled={busy}
                    className="sr-only"
                  />
                </label>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResetDemo}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg"
                >
                  <RotateCcw className="w-4 h-4" />
                  Réinitialiser les données de démonstration
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Actions réservées au profil Administrateur.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ACADEMIC YEARS & EXCEL ARCHIVES */}
      {activeTab === 'archives' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Active year rollover card */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Année académique en cours
                  </span>
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Active
                  </span>
                </div>
                <div className="font-display text-2xl font-extrabold text-[#0B1933] mt-1 font-mono">
                  {state.settings.currentAcademicYear}
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Lorsque l’année académique est terminée, la création d’une nouvelle année archive automatiquement les résultats, encaissements et assiduités de{' '}
                  <span className="font-semibold">{state.settings.currentAcademicYear}</span>, puis réinitialise les périodes pour le nouvel exercice tout en conservant les fiches élèves pour réinscription rapide.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                  <div>
                    <div className="text-slate-500">Élèves inscrits</div>
                    <div className="font-mono font-bold text-slate-900 text-sm">
                      {state.summary.totalStudents}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Encaissé</div>
                    <div className="font-mono font-bold text-slate-900 text-sm">
                      {formatFcfa(state.summary.totalCollectedFcfa)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Bulletins édités</div>
                    <div className="font-mono font-bold text-slate-900 text-sm">
                      {state.bulletins.length}
                    </div>
                  </div>
                </div>
              </div>

              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setNewYearForm({
                      newAcademicYear: suggestNextAcademicYear(state.settings.currentAcademicYear),
                      periodMode: state.settings.periodMode,
                      archiveNotes: '',
                    });
                    setShowNewYearModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] rounded-lg transition-colors"
                >
                  <CalendarPlus className="w-4 h-4 shrink-0" />
                  Créer une nouvelle année académique
                </button>
              )}
            </div>

            {/* Excel Import for past years */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-slate-900">
                  <FileSpreadsheet className="w-5 h-5 text-[#0B1933]" />
                  <h2 className="font-display text-base font-bold">
                    Archiver les années précédentes par fichier Excel
                  </h2>
                </div>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Importez un classeur Excel (<span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span> ou <span className="font-mono">.csv</span>) contenant les données des années antérieures (élèves, classes, paiements FCFA, moyennes, mentions, absences). Chaque fichier importé est archivé et consultable à tout moment.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {!isReadOnly && (
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-[#E5A923]" />
                    {importParsing ? 'Lecture du fichier...' : 'Importer une archive Excel'}
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelFileSelected}
                      disabled={importParsing || busy}
                      className="sr-only"
                    />
                  </label>
                )}

                <button
                  type="button"
                  onClick={downloadArchiveExcelTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Télécharger le modèle Excel (.xlsx)
                </button>
              </div>
            </div>
          </div>

          {/* Archived Years List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Archives des années académiques ({state.archivedYears.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Historique consolidé des clôtures annuelles et des imports Excel.
                </p>
              </div>
            </div>

            {state.archivedYears.length === 0 ? (
              <div className="p-6 sm:p-10 text-center text-sm text-slate-500">
                Aucune année académique archivée pour le moment. Vous pouvez importer un fichier Excel d’une année précédente ou clôturer l’année en cours via « Créer une nouvelle année académique ».
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                      <th className="py-3 px-4 font-semibold">Année académique</th>
                      <th className="py-3 px-4 font-semibold">Origine & Archivage</th>
                      <th className="py-3 px-4 font-semibold text-right">Élèves</th>
                      <th className="py-3 px-4 font-semibold text-right">Encaissé (FCFA)</th>
                      <th className="py-3 px-4 font-semibold text-right">Moy. étab.</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.archivedYears.map((arch) => (
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
                            className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              arch.source === 'cloture'
                                ? 'bg-blue-50 text-blue-900 border-blue-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                            }`}
                          >
                            {arch.source === 'cloture' ? 'Clôture annuelle' : 'Import Excel'}
                          </span>
                          <div className="text-xs text-slate-500 mt-1">
                            Le {formatDateTimeFr(arch.archivedAt)} par {arch.archivedBy}
                            {arch.sourceFileName && ` · ${arch.sourceFileName}`}
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
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setArchiveSearch('');
                                setViewingArchive(arch);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Consulter
                            </button>
                            <button
                              type="button"
                              onClick={() => exportArchiveToExcel(arch)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-100"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Excel
                            </button>
                            {!isReadOnly && (
                              confirmDeleteId === arch.id ? (
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
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: USERS */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {state.users.map((u) => (
                <div key={u.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm truncate">{u.fullName}</div>
                    <div className="text-xs font-mono text-slate-500">
                      {u.username} · {ROLE_LABELS[u.role]}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Dernière connexion : {formatDateTimeFr(u.lastLogin)}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {!isReadOnly ? (
                      <button
                        type="button"
                        disabled={busy || u.id === session.id}
                        onClick={() => handleToggleUser(u.id)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded border ${
                          u.active
                            ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                            : 'border-red-200 text-red-700 bg-red-50'
                        }`}
                      >
                        {u.active ? 'Actif' : 'Désactivé'}
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-slate-600">
                        {u.active ? 'Actif' : 'Désactivé'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                    <th className="py-3 px-4 font-semibold">Agent & Identifiant</th>
                    <th className="py-3 px-4 font-semibold">Profil</th>
                    <th className="py-3 px-4 font-semibold">Dernière connexion</th>
                    <th className="py-3 px-4 font-semibold text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{u.fullName}</div>
                        <div className="text-xs font-mono text-slate-500">{u.username}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">{ROLE_LABELS[u.role]}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {formatDateTimeFr(u.lastLogin)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!isReadOnly ? (
                          <button
                            type="button"
                            disabled={busy || u.id === session.id}
                            onClick={() => handleToggleUser(u.id)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded border ${
                              u.active
                                ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                                : 'border-red-200 text-red-700 bg-red-50'
                            }`}
                          >
                            {u.active ? 'Actif' : 'Désactivé'}
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-slate-600">
                            {u.active ? 'Actif' : 'Désactivé'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!isReadOnly && (
            <form
              onSubmit={handleCreateUser}
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3 h-fit"
            >
              <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-900" />
                Nouveau compte agent
              </h3>
              <input
                type="text"
                required
                placeholder="Nom complet"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                placeholder="Identifiant (ex. caisse2)"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="scolarite">Scolarité</option>
                <option value="caisse">Caisse</option>
                <option value="secretariat">Secrétariat académique</option>
                <option value="surveillant">Surveillance & Guérite</option>
                <option value="direction">Direction générale</option>
                <option value="admin">Administrateur</option>
              </select>
              <input
                type="password"
                required
                placeholder="Mot de passe initial"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                Créer le compte
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                  <th className="py-3 px-4 font-semibold">Date & Heure</th>
                  <th className="py-3 px-4 font-semibold">Auteur</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTimeFr(log.timestamp)}
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <div className="font-semibold text-slate-900">{log.userName}</div>
                      <div className="text-slate-500">{ROLE_LABELS[log.userRole]}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-semibold text-blue-950 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW ACADEMIC YEAR (WITH AUTOMATIC ARCHIVAL) */}
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
                Les dossiers financiers, notes, bulletins et présences de{' '}
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
                {busy ? 'Archivage en cours...' : `Archiver ${state.settings.currentAcademicYear} & Ouvrir ${newYearForm.newAcademicYear}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: IMPORT EXCEL ARCHIVE */}
      {showImportModal && importDraft && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmExcelImport}
            className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Confirmer l’importation d’archive Excel
                </h3>
                <p className="text-xs text-slate-500">
                  Fichier : <span className="font-mono">{importDraft.sourceFileName}</span> ·{' '}
                  {importDraft.records.length} élève(s) détecté(s)
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Année académique archivée *
                </label>
                <input
                  type="text"
                  required
                  value={importDraft.academicYear}
                  onChange={(e) =>
                    setImportDraft({ ...importDraft, academicYear: e.target.value })
                  }
                  placeholder="ex. 2025-2026"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
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

            <div className="border border-slate-200 rounded-lg overflow-auto max-h-64">
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
                      <td className="py-2 px-3 text-right font-mono">{formatFcfa(r.totalPaidFcfa)}</td>
                      <td className="py-2 px-3 text-right font-mono">
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

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
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
                {busy ? 'Importation...' : `Archiver ${importDraft.records.length} élève(s)`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: VIEW ARCHIVED YEAR DETAILS */}
      {viewingArchive && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Archive année académique · {viewingArchive.academicYear}
                </h3>
                <p className="text-xs text-slate-500">
                  {viewingArchive.summary.totalStudents} élève(s) · Encaissé :{' '}
                  {formatFcfa(viewingArchive.summary.totalCollectedFcfa)} · Archivée le{' '}
                  {formatDateTimeFr(viewingArchive.archivedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportArchiveToExcel(viewingArchive)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B1933] hover:bg-[#13294e] rounded-lg"
                >
                  <Download className="w-3.5 h-3.5 text-[#E5A923]" />
                  Exporter Excel
                </button>
                <button
                  type="button"
                  onClick={() => setViewingArchive(null)}
                  aria-label="Fermer"
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="Rechercher élève, ID carte ou classe..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left sticky top-0">
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
                        Aucun élève trouvé dans cette archive.
                      </td>
                    </tr>
                  ) : (
                    filteredArchiveRecords.map((r, i) => (
                      <tr key={`${r.cardId}-${i}`} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-slate-700">{r.cardId}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{r.fullName}</td>
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
                          {r.generalAverage !== null ? `${r.generalAverage.toFixed(2)}/20` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{r.mention}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {r.absencesCount} / {r.latesCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
