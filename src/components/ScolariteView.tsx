import React, { useMemo, useState } from 'react';
import {
  Bell,
  Camera,
  CreditCard,
  Download,
  Edit3,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldOff,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from '../api';
import type { FeeGridItem, Payment, SchoolCycle, SchoolProgram, Student } from '../types';
import {
  CYCLES,
  exportToCsv,
  formatDateFr,
  formatDateTimeFr,
  formatFcfa,
  processProfilePhotoFile,
  PROGRAMS,
} from '../utils/format';
import { ReceiptModal, StudentAvatar, StudentCardModal } from './PrintableDocs';

type ScolariteTab = 'dossiers' | 'caisse' | 'parents' | 'tarifs';

export const ScolariteView: React.FC<{
  state: AppState;
  session: SessionUser;
  initialTab?: ScolariteTab;
  onRefresh: () => Promise<void>;
}> = ({ state, session, initialTab, onRefresh }) => {
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
  const [editingFee, setEditingFee] = useState<FeeGridItem | null>(null);

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

  const pendingNotifications = state.paymentNotifications.filter(
    (n) => n.status === 'en_attente'
  );

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
      setParentForm({ fullName: '', phone: '+242 06 ', address: 'Pointe-Noire', accessCode: '' });
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

  return (
    <div className="space-y-6">
      {/* Header + Sub-tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Scolarité & Caisse
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Inscriptions, cartes scolaires uniques, encaissements FCFA et relances d’impayés.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start overflow-x-auto max-w-full">
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
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom ou ID carte (JS-26-...)..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <select
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                aria-label="Filtrer par cycle"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
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
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
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
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                Nouvelle inscription
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
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
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-amber-600" />
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
                      <div className="flex items-center gap-3">
                        {stu && (
                          <StudentAvatar
                            photoUrl={stu.photoUrl}
                            firstName={stu.firstName}
                            lastName={stu.lastName}
                          />
                        )}
                        <div>
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
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
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
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-900" />
                  Historique des reçus ({state.payments.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Dossiers avec solde dû ({unpaidStudents.length})
                </h2>
                <button
                  type="button"
                  onClick={handleExportUnpaidCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter CSV
                </button>
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

      {/* TAB 3: PARENTS & TUTEURS */}
      {activeTab === 'parents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-900" />
              Répertoire des parents & tuteurs ({state.parents.length})
            </h2>
            {canModifyScolarite && !isReadOnly && (
              <button
                type="button"
                onClick={() => setShowParentModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Nouveau parent
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 text-left">
                  <th className="py-3 px-4 font-semibold">Nom complet</th>
                  <th className="py-3 px-4 font-semibold">Téléphone & Adresse</th>
                  <th className="py-3 px-4 font-semibold">Enfants rattachés</th>
                  <th className="py-3 px-4 font-semibold text-right">Code d’accès parent</th>
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
                        <div className="text-xs text-slate-500">{p.address}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {children.length === 0
                          ? 'Aucun enfant lié'
                          : children.map((c) => `${c.firstName} ${c.lastName} (${c.cardId})`).join(' · ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-blue-950">
                        {p.accessCode || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: GRILLE TARIFAIRE */}
      {activeTab === 'tarifs' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-900" />
                Grille tarifaire annuelle (FCFA)
              </h2>
              <p className="text-xs text-slate-500">
                Frais d’inscription, scolarité annuelle et échéancier par cycle et programme.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleEnrollSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-5 my-auto"
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
              <div className="flex items-center justify-between">
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
                    placeholder="Téléphone (+242...)"
                    value={enrollForm.newParentPhone}
                    onChange={(e) => setEnrollForm({ ...enrollForm, newParentPhone: e.target.value })}
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
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleEditStudentSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Modifier le dossier · {editingStudent.cardId}
            </h3>

            <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
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

            <div className="grid grid-cols-2 gap-3">
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCollectSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddParent}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
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
                placeholder="Téléphone (+242 ...)"
                value={parentForm.phone}
                onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })}
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

      {/* MODAL: EDIT FEE */}
      {editingFee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveFee}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
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
    </div>
  );
};
