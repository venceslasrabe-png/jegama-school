import React, { useState } from 'react';
import {
  Archive,
  CalendarPlus,
  Download,
  Plus,
  RotateCcw,
  Shield,
  Sliders,
  Upload,
  UserCog,
} from 'lucide-react';
import { apiRequest, downloadBackupJson, type AppState, type SessionUser } from '../api';
import type { UserRole } from '../types';
import { formatDateTimeFr, ROLE_LABELS } from '../utils/format';
import { ArchivesView } from './ArchivesView';

export const AdminView: React.FC<{
  state: AppState;
  session: SessionUser;
  onRefresh: () => Promise<void>;
}> = ({ state, session, onRefresh }) => {
  const isReadOnly = session.role === 'direction';
  const [activeTab, setActiveTab] = useState<'params' | 'archives' | 'users' | 'audit'>('params');
  const [openNewYearSignal, setOpenNewYearSignal] = useState(0);
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
                    setActiveTab('archives');
                    setOpenNewYearSignal((n) => n + 1);
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

      {/* TAB 2: ACADEMIC YEARS & ARCHIVES */}
      {activeTab === 'archives' && (
        <ArchivesView
          state={state}
          session={session}
          onRefresh={onRefresh}
          embedded
          openNewYearSignal={openNewYearSignal}
        />
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

    </div>
  );
};
