import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  ScanBarcode,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from '../api';
import type { Student } from '../types';
import { exportToCsv, formatTimeFr, getTodayDateStr } from '../utils/format';
import { StudentAvatar } from './PrintableDocs';

interface OfflineQueueItem {
  id: string;
  cardId: string;
  studentName: string;
  type: 'entree' | 'sortie';
  timestamp: string;
  dateStr: string;
  status: 'present' | 'retard' | 'absence';
  reason: string;
}

const OFFLINE_STORAGE_KEY = 'jegama_offline_pointages';

export const SurveillanceView: React.FC<{
  state: AppState;
  session: SessionUser;
  onRefresh: () => Promise<void>;
}> = ({ state, session, onRefresh }) => {
  const canModify = session.role === 'surveillant' || session.role === 'admin';
  const isReadOnly = session.role === 'direction' || session.role === 'secretariat' || !canModify;

  const [scanInput, setScanInput] = useState('');
  const [manualOverride, setManualOverride] = useState<'auto' | 'entree' | 'sortie'>('auto');
  const [overrideReason, setOverrideReason] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [presenceTab, setPresenceTab] = useState<'presents' | 'sortis' | 'non_pointes'>('presents');
  const [busy, setBusy] = useState(false);

  // Offline degraded mode state (RF-SUR-08)
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineQueue));
    } catch {
      // ignore quota errors
    }
  }, [offlineQueue]);

  // Last scan visual verification card
  const [scanResult, setScanResult] = useState<{
    ok: boolean;
    message: string;
    student?: Student;
    type?: 'entree' | 'sortie';
    timestamp?: string;
    offline?: boolean;
  } | null>(null);

  // Absence/late recording state
  const [absenceStudentId, setAbsenceStudentId] = useState(state.students[0]?.id || '');
  const [absenceType, setAbsenceType] = useState<'retard' | 'absence'>('retard');
  const [absenceReason, setAbsenceReason] = useState('');

  const today = getTodayDateStr();

  // Compute live student statuses for today
  const todayStatus = useMemo(() => {
    const todayLogs = state.attendanceLogs.filter((a) => a.dateStr === today);
    const latestMap = new Map<string, typeof todayLogs[number]>();
    for (const log of todayLogs) {
      const prev = latestMap.get(log.studentId);
      if (!prev || new Date(log.timestamp).getTime() >= new Date(prev.timestamp).getTime()) {
        latestMap.set(log.studentId, log);
      }
    }

    const presents: Student[] = [];
    const sortis: Student[] = [];
    const nonPointes: Student[] = [];

    for (const stu of state.students) {
      if (stu.status === 'archive') continue;
      const latest = latestMap.get(stu.id);
      if (!latest) nonPointes.push(stu);
      else if (latest.type === 'entree' && latest.status !== 'absence') presents.push(stu);
      else if (latest.type === 'sortie') sortis.push(stu);
      else nonPointes.push(stu);
    }

    return { todayLogs, presents, sortis, nonPointes };
  }, [state.students, state.attendanceLogs, today]);

  const filteredJournal = useMemo(() => {
    return [...todayStatus.todayLogs]
      .filter((log) => {
        if (classFilter === 'all') return true;
        const stu = state.students.find((s) => s.id === log.studentId);
        return stu?.classId === classFilter;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [todayStatus.todayLogs, classFilter, state.students]);

  const handleScan = async (cardIdToScan: string) => {
    const cleaned = cardIdToScan.trim().toUpperCase();
    if (!cleaned || isReadOnly) return;

    if (simulatedOffline || !navigator.onLine) {
      // Offline mode lookup from cached state
      const stu = state.students.find((s) => s.cardId.toUpperCase() === cleaned);
      if (!stu) {
        setScanResult({
          ok: false,
          message: `Hors-ligne : Carte inconnue (${cleaned}).`,
        });
        return;
      }
      if (stu.cardStatus !== 'active') {
        setScanResult({
          ok: false,
          student: stu,
          message: `Hors-ligne — Alerte : Carte ${cleaned} marquée "${stu.cardStatus}".`,
        });
        return;
      }
      const now = new Date();
      const existingToday = [
        ...state.attendanceLogs.filter((a) => a.studentId === stu.id && a.dateStr === today),
        ...offlineQueue.filter((q) => q.cardId === stu.cardId && q.dateStr === today),
      ];
      const last = existingToday[existingToday.length - 1];
      const autoType: 'entree' | 'sortie' = last?.type === 'entree' ? 'sortie' : 'entree';
      const finalType = manualOverride === 'auto' ? autoType : manualOverride;

      const queued: OfflineQueueItem = {
        id: `off-${Date.now()}`,
        cardId: stu.cardId,
        studentName: `${stu.lastName} ${stu.firstName}`,
        type: finalType,
        timestamp: now.toISOString(),
        dateStr: today,
        status: 'present',
        reason: overrideReason,
      };
      setOfflineQueue((prev) => [...prev, queued]);
      setScanResult({
        ok: true,
        offline: true,
        student: stu,
        type: finalType,
        timestamp: now.toISOString(),
        message: `Enregistré localement (mode hors-ligne) : ${finalType === 'entree' ? 'ENTRÉE' : 'SORTIE'}`,
      });
      setScanInput('');
      setManualOverride('auto');
      setOverrideReason('');
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest<{
        log: { type: 'entree' | 'sortie'; timestamp: string };
        student: Student;
      }>(
        '/api/pointages/scan',
        {
          method: 'POST',
          body: JSON.stringify({
            cardId: cleaned,
            manualType: manualOverride === 'auto' ? undefined : manualOverride,
            reason: overrideReason,
          }),
        },
        session
      );
      await onRefresh();
      setScanResult({
        ok: true,
        student: res.student,
        type: res.log.type,
        timestamp: res.log.timestamp,
        message:
          res.log.type === 'entree'
            ? 'ENTRÉE enregistrée à la guérite'
            : 'SORTIE enregistrée à la guérite',
      });
      setScanInput('');
      setManualOverride('auto');
      setOverrideReason('');
    } catch (err) {
      const stu = state.students.find(
        (s) => s.cardId.toUpperCase() === cleaned || s.replacedCardIds.includes(cleaned)
      );
      setScanResult({
        ok: false,
        student: stu,
        message: err instanceof Error ? err.message : 'Erreur de lecture carte.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSyncOffline = async () => {
    if (offlineQueue.length === 0) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ syncedCount: number }>(
        '/api/pointages/sync',
        {
          method: 'POST',
          body: JSON.stringify({ queuedLogs: offlineQueue }),
        },
        session
      );
      setOfflineQueue([]);
      await onRefresh();
      setScanResult({
        ok: true,
        message: `${res.syncedCount} pointage(s) hors-ligne synchronisé(s) avec le serveur.`,
      });
    } catch (err) {
      setScanResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Échec de synchronisation.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRecordAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!absenceStudentId || !absenceReason.trim()) return;
    setBusy(true);
    try {
      await apiRequest(
        '/api/pointages/absence',
        {
          method: 'POST',
          body: JSON.stringify({
            studentId: absenceStudentId,
            status: absenceType,
            reason: absenceReason,
            dateStr: today,
          }),
        },
        session
      );
      await onRefresh();
      setAbsenceReason('');
      setScanResult({
        ok: true,
        message: `Motif (${absenceType}) enregistré dans le journal.`,
      });
    } catch (err) {
      setScanResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Erreur d’enregistrement.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportJournal = () => {
    const headers = ['Heure', 'ID Carte', 'Élève', 'Classe', 'Mouvement', 'Statut', 'Motif', 'Agent'];
    const rows = filteredJournal.map((log) => {
      const stu = state.students.find((s) => s.id === log.studentId);
      const cls = state.classes.find((c) => c.id === stu?.classId);
      return [
        formatTimeFr(log.timestamp),
        log.cardId,
        stu ? `${stu.lastName} ${stu.firstName}` : '—',
        cls?.name || '—',
        log.type === 'entree' ? 'Entrée' : 'Sortie',
        log.status,
        log.reason || '—',
        log.recordedBy,
      ];
    });
    exportToCsv(`journal-guerite-${today}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header + Offline mode control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Surveillance & Guérite
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pointage rapide par lecteur code-barres ou ID carte, vérification visuelle et mode dégradé hors-ligne.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSimulatedOffline(!simulatedOffline)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              simulatedOffline
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {simulatedOffline ? (
              <>
                <WifiOff className="w-4 h-4 text-amber-700" />
                Mode hors-ligne actif (cliquez pour rétablir)
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 text-emerald-700" />
                Connexion active · Simuler coupure
              </>
            )}
          </button>

          {offlineQueue.length > 0 && !simulatedOffline && !isReadOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSyncOffline}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Synchroniser ({offlineQueue.length})
            </button>
          )}
        </div>
      </div>

      {/* Scanner & Visual Verification Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <ScanBarcode className="w-5 h-5 text-blue-900" />
              Lecteur de carte scolaire
            </h2>
            {offlineQueue.length > 0 && (
              <span className="text-xs font-mono font-semibold text-amber-800">
                {offlineQueue.length} en attente de synchro
              </span>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScan(scanInput);
            }}
            className="space-y-4"
          >
            <div className="flex gap-2">
              <input
                type="text"
                disabled={isReadOnly}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Scanner ou saisir ID (ex. JS-26-0001)"
                className="flex-1 px-4 py-3 text-base font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={isReadOnly || busy || !scanInput.trim()}
                className="px-5 py-3 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
              >
                Pointer
              </button>
            </div>

            {!isReadOnly && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Sens du passage (RG-03)
                  </label>
                  <select
                    value={manualOverride}
                    onChange={(e) =>
                      setManualOverride(e.target.value as 'auto' | 'entree' | 'sortie')
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="auto">Alternance automatique (Entrée / Sortie)</option>
                    <option value="entree">Forcer Entrée</option>
                    <option value="sortie">Forcer Sortie</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Motif / Observation (optionnel)
                  </label>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="ex. Sortie autorisée infirmerie"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            )}
          </form>

          {!isReadOnly && (
            <div className="pt-4 border-t border-slate-100">
              <div className="text-[11px] font-semibold text-slate-500 mb-2">
                Simulation rapide de lecture guérite :
              </div>
              <div className="flex flex-wrap gap-2">
                {['JS-26-0001', 'JS-26-0002', 'JS-26-0005', 'JS-26-0008', 'JS-26-9999'].map(
                  (sampleId) => (
                    <button
                      key={sampleId}
                      type="button"
                      onClick={() => handleScan(sampleId)}
                      className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md hover:border-blue-900 hover:bg-slate-50"
                    >
                      {sampleId}
                      {sampleId === 'JS-26-0008' && ' (perdue)'}
                      {sampleId === 'JS-26-9999' && ' (inconnue)'}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* Visual Verification Panel (RF-SUR-03, RF-SUR-04) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-center">
          {!scanResult ? (
            <div className="text-center py-8 space-y-2">
              <div className="text-sm font-semibold text-slate-700">
                En attente de lecture à la guérite
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                La photo, le nom complet, la classe et le mouvement (Entrée ou Sortie) apparaissent immédiatement ici pour contrôle visuel.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-lg border flex items-center gap-3 text-sm font-semibold ${
                  scanResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {scanResult.ok ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
                )}
                <span>{scanResult.message}</span>
              </div>

              {scanResult.student && (
                <div className="flex items-center gap-5 pt-2">
                  <StudentAvatar
                    photoUrl={scanResult.student.photoUrl}
                    firstName={scanResult.student.firstName}
                    lastName={scanResult.student.lastName}
                    sizeClass="w-24 h-24"
                  />
                  <div className="space-y-1">
                    <div className="text-xl font-bold text-slate-900">
                      {scanResult.student.lastName} {scanResult.student.firstName}
                    </div>
                    <div className="text-sm text-slate-700">
                      {state.classes.find((c) => c.id === scanResult.student?.classId)?.name ||
                        scanResult.student.cycle}{' '}
                      · Programme {scanResult.student.program}
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      Carte {scanResult.student.cardId} · Statut : {scanResult.student.cardStatus}
                      {scanResult.timestamp && ` · ${formatTimeFr(scanResult.timestamp)}`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Real-time status tabs (RF-SUR-05) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-slate-900">
            Tableau en temps réel ({today})
          </h2>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setPresenceTab('presents')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                presenceTab === 'presents'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600'
              }`}
            >
              Présents dans l’école ({todayStatus.presents.length})
            </button>
            <button
              type="button"
              onClick={() => setPresenceTab('sortis')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                presenceTab === 'sortis' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Déjà sortis ({todayStatus.sortis.length})
            </button>
            <button
              type="button"
              onClick={() => setPresenceTab('non_pointes')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                presenceTab === 'non_pointes'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600'
              }`}
            >
              Pas encore pointés ({todayStatus.nonPointes.length})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(presenceTab === 'presents'
            ? todayStatus.presents
            : presenceTab === 'sortis'
              ? todayStatus.sortis
              : todayStatus.nonPointes
          ).map((stu) => {
            const cls = state.classes.find((c) => c.id === stu.classId);
            return (
              <div
                key={stu.id}
                className="p-3 border border-slate-200 rounded-lg flex items-center gap-3 bg-slate-50/50"
              >
                <StudentAvatar
                  photoUrl={stu.photoUrl}
                  firstName={stu.firstName}
                  lastName={stu.lastName}
                  sizeClass="w-9 h-9"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {stu.lastName} {stu.firstName}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {cls?.name || stu.cycle} · <span className="font-mono">{stu.cardId}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Journal & Absence Motifs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold text-slate-900">
              Journal des passages du jour ({filteredJournal.length})
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                aria-label="Filtrer par classe"
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">Toutes les classes</option>
                {state.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleExportJournal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Exporter CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 text-left">
                  <th className="py-2 font-medium">Heure</th>
                  <th className="py-2 font-medium">Élève & Classe</th>
                  <th className="py-2 font-medium">Mouvement</th>
                  <th className="py-2 font-medium">Motif / Observation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredJournal.map((log) => {
                  const stu = state.students.find((s) => s.id === log.studentId);
                  const cls = state.classes.find((c) => c.id === stu?.classId);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-xs text-slate-700 tabular-nums">
                        {formatTimeFr(log.timestamp)}
                      </td>
                      <td className="py-2.5">
                        <div className="font-medium text-slate-900">
                          {stu ? `${stu.lastName} ${stu.firstName}` : log.cardId}
                        </div>
                        <div className="text-xs text-slate-500">{cls?.name || '—'}</div>
                      </td>
                      <td className="py-2.5 text-xs font-semibold">
                        {log.status === 'absence' ? (
                          <span className="text-red-700">Absence signalée</span>
                        ) : log.type === 'entree' ? (
                          <span className={log.status === 'retard' ? 'text-amber-700' : 'text-emerald-700'}>
                            {log.status === 'retard' ? 'Entrée (Retard)' : 'Entrée'}
                          </span>
                        ) : (
                          <span className="text-slate-700">Sortie</span>
                        )}
                      </td>
                      <td className="py-2.5 text-xs text-slate-600">{log.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900">
            Enregistrer un motif (absence / retard)
          </h2>
          <form onSubmit={handleRecordAbsence} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Élève</label>
              <select
                disabled={isReadOnly}
                value={absenceStudentId}
                onChange={(e) => setAbsenceStudentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              >
                {state.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.lastName} {s.firstName} ({s.cardId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
              <select
                disabled={isReadOnly}
                value={absenceType}
                onChange={(e) => setAbsenceType(e.target.value as 'retard' | 'absence')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              >
                <option value="retard">Retard justifié / constaté</option>
                <option value="absence">Absence signalée</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Motif</label>
              <textarea
                rows={3}
                required
                disabled={isReadOnly}
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                placeholder="ex. Certificat médical remis par les parents"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              />
            </div>
            {!isReadOnly ? (
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                Enregistrer le motif
              </button>
            ) : (
              <p className="text-xs text-slate-400">Consultation uniquement (lecture seule)</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
