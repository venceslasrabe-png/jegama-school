import React, { useMemo, useState } from 'react';
import { BookOpen, CalendarDays, FileText, Printer } from 'lucide-react';
import type { AppState, SessionUser } from '../api';
import type { Bulletin } from '../types';
import { formatDateFr, formatTimeFr } from '../utils/format';
import { BulletinModal, StudentAvatar } from './PrintableDocs';

export const ParentView: React.FC<{
  state: AppState;
  session: SessionUser;
  initialStudentId?: string;
}> = ({ state, session, initialStudentId }) => {
  const availableStudents = useMemo(() => {
    if (session.role === 'parent') {
      return state.students.filter((s) => s.parentId === session.id);
    }
    // Direction / Admin preview consultation
    return state.students;
  }, [state.students, session]);

  const [selectedStudentId, setSelectedStudentId] = useState(
    initialStudentId || availableStudents[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<'presences' | 'notes' | 'bulletins'>('presences');
  const [selectedPeriodId, setSelectedPeriodId] = useState(state.periods[0]?.id || '');
  const [bulletinModal, setBulletinModal] = useState<Bulletin | null>(null);

  const student =
    availableStudents.find((s) => s.id === selectedStudentId) || availableStudents[0];

  const schoolClass = state.classes.find((c) => c.id === student?.classId);

  const studentAttendance = useMemo(() => {
    if (!student) return [];
    return state.attendanceLogs
      .filter((a) => a.studentId === student.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [state.attendanceLogs, student]);

  // Group attendance by dateStr for daily view + monthly summary (RF-PAR-02)
  const attendanceByDay = useMemo(() => {
    const map = new Map<
      string,
      { dateStr: string; entries: string[]; exits: string[]; lateReason: string; absentReason: string }
    >();
    for (const log of studentAttendance) {
      const existing = map.get(log.dateStr) || {
        dateStr: log.dateStr,
        entries: [],
        exits: [],
        lateReason: '',
        absentReason: '',
      };
      if (log.status === 'absence') {
        existing.absentReason = log.reason || 'Absence';
      } else if (log.type === 'entree') {
        existing.entries.push(formatTimeFr(log.timestamp));
        if (log.status === 'retard') existing.lateReason = log.reason || 'Retard';
      } else {
        existing.exits.push(formatTimeFr(log.timestamp));
      }
      map.set(log.dateStr, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [studentAttendance]);

  const monthlyTotals = useMemo(() => {
    const daysPresent = attendanceByDay.filter((d) => d.entries.length > 0).length;
    const lates = studentAttendance.filter((a) => a.status === 'retard').length;
    const absences = studentAttendance.filter((a) => a.status === 'absence').length;
    return { daysPresent, lates, absences };
  }, [attendanceByDay, studentAttendance]);

  const studentSubjects = useMemo(() => {
    if (!student) return [];
    return state.subjects.filter(
      (sub) => sub.cycle === student.cycle && sub.program === student.program
    );
  }, [state.subjects, student]);

  const studentBulletins = useMemo(() => {
    if (!student) return [];
    return state.bulletins.filter(
      (b) => b.studentId === student.id && b.deliveryStatus !== 'a_editer'
    );
  }, [state.bulletins, student]);

  const activePeriodBulletin = studentBulletins.find((b) => b.periodId === selectedPeriodId);

  if (!student) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        Aucun dossier enfant rattaché à ce compte.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Multi-child Switcher (RF-PAR-05) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <StudentAvatar
            photoUrl={student.photoUrl}
            firstName={student.firstName}
            lastName={student.lastName}
            sizeClass="w-12 h-12 sm:w-14 sm:h-14"
          />
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500 truncate">
              Espace Parent · Consultation en lecture seule
            </div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 truncate">
              {student.lastName} {student.firstName}
            </h1>
            <div className="text-xs text-slate-600 mt-0.5 truncate">
              <span className="font-mono font-semibold text-blue-950">{student.cardId}</span>
              {' · '}
              {schoolClass?.name || student.cycle} · Programme {student.program}
            </div>
          </div>
        </div>

        {availableStudents.length > 1 && (
          <div className="w-full sm:w-auto">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Basculer d’enfant ({availableStudents.length})
            </label>
            <select
              value={student.id}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full sm:w-auto px-3.5 py-2 text-sm font-medium border border-slate-300 rounded-lg bg-white"
            >
              {availableStudents.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.firstName} {child.lastName} ({child.cardId})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-full sm:w-fit max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('presences')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'presences'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Présences & Guérite
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'notes'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Notes & Moyennes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bulletins')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'bulletins'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Bulletins validés ({studentBulletins.length})
        </button>
      </div>

      {/* PRESENCES */}
      {activeTab === 'presences' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 bg-white">
              <div className="text-xs text-slate-500">Jours de présence</div>
              <div className="mt-1 text-xl font-mono font-bold text-emerald-700 tabular-nums">
                {monthlyTotals.daysPresent}
              </div>
            </div>
            <div className="p-4 bg-white">
              <div className="text-xs text-slate-500">Retards constatés</div>
              <div className="mt-1 text-xl font-mono font-bold text-amber-700 tabular-nums">
                {monthlyTotals.lates}
              </div>
            </div>
            <div className="p-4 bg-white">
              <div className="text-xs text-slate-500">Absences signalées</div>
              <div className="mt-1 text-xl font-mono font-bold text-red-700 tabular-nums">
                {monthlyTotals.absences}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {attendanceByDay.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aucun passage enregistré à la guérite pour le moment.
                </div>
              ) : (
                attendanceByDay.map((day) => (
                  <div key={day.dateStr} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {formatDateFr(day.dateStr)}
                      </span>
                      <span className="text-xs">
                        {day.absentReason ? (
                          <span className="font-semibold text-red-700">
                            Absence : {day.absentReason}
                          </span>
                        ) : day.lateReason ? (
                          <span className="font-semibold text-amber-700">
                            Retard : {day.lateReason}
                          </span>
                        ) : (
                          <span className="text-slate-500">Présence normale</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                      <span className="text-emerald-800">
                        Entrée : {day.entries.length > 0 ? day.entries.join(', ') : '—'}
                      </span>
                      <span className="text-slate-600">
                        Sortie : {day.exits.length > 0 ? day.exits.join(', ') : '—'}
                      </span>
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
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Entrée(s)</th>
                    <th className="py-3 px-4 font-semibold">Sortie(s)</th>
                    <th className="py-3 px-4 font-semibold">Observation / Motif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceByDay.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                        Aucun passage enregistré à la guérite pour le moment.
                      </td>
                    </tr>
                  ) : (
                    attendanceByDay.map((day) => (
                      <tr key={day.dateStr}>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {formatDateFr(day.dateStr)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-emerald-800">
                          {day.entries.length > 0 ? day.entries.join(', ') : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">
                          {day.exits.length > 0 ? day.exits.join(', ') : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {day.absentReason ? (
                            <span className="font-semibold text-red-700">
                              Absence : {day.absentReason}
                            </span>
                          ) : day.lateReason ? (
                            <span className="font-semibold text-amber-700">
                              Retard : {day.lateReason}
                            </span>
                          ) : (
                            <span className="text-slate-500">Présence normale</span>
                          )}
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

      {/* NOTES */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-600 shrink-0">Période :</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="flex-1 sm:flex-initial px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-medium"
              >
                {state.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {activePeriodBulletin && (
              <div className="text-left sm:text-right flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs text-slate-500">Moyenne générale :</span>
                <span className="font-mono text-sm font-bold text-blue-950 tabular-nums">
                  {activePeriodBulletin.generalAverage.toFixed(2)} / 20
                </span>
                <span className="text-xs text-slate-600">
                  · Rang {activePeriodBulletin.rank}e/{activePeriodBulletin.totalStudents} ·{' '}
                  {activePeriodBulletin.mention}
                </span>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {studentSubjects.map((sub) => {
                const grade = state.grades.find(
                  (g) =>
                    g.studentId === student.id &&
                    g.subjectId === sub.id &&
                    g.periodId === selectedPeriodId
                );
                return (
                  <div key={sub.id} className="p-4 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-semibold text-slate-900 text-sm">
                        {sub.name}{' '}
                        <span className="text-xs font-mono text-slate-500 font-normal">
                          (Coeff. {sub.coefficient})
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-blue-950 tabular-nums shrink-0">
                        {grade ? `${grade.average.toFixed(2)} / 20` : '—'}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-700">
                      Notes : {grade ? grade.values.join(' · ') : 'En attente'}
                    </div>
                    {grade?.teacherAppreciation && (
                      <div className="text-xs text-slate-600">{grade.teacherAppreciation}</div>
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
                    <th className="py-3 px-4 font-semibold">Matière</th>
                    <th className="py-3 px-4 font-semibold text-right">Coeff.</th>
                    <th className="py-3 px-4 font-semibold">Notes (/20)</th>
                    <th className="py-3 px-4 font-semibold text-right">Moyenne</th>
                    <th className="py-3 px-4 font-semibold">Appréciation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentSubjects.map((sub) => {
                    const grade = state.grades.find(
                      (g) =>
                        g.studentId === student.id &&
                        g.subjectId === sub.id &&
                        g.periodId === selectedPeriodId
                    );
                    return (
                      <tr key={sub.id}>
                        <td className="py-3 px-4 font-medium text-slate-900">{sub.name}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-600">
                          {sub.coefficient}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">
                          {grade ? grade.values.join(' · ') : 'En attente'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-950 tabular-nums whitespace-nowrap">
                          {grade ? `${grade.average.toFixed(2)} / 20` : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {grade?.teacherAppreciation || '—'}
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

      {/* BULLETINS */}
      {activeTab === 'bulletins' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {studentBulletins.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Aucun bulletin validé n’est encore disponible pour cet enfant.
            </div>
          ) : (
            studentBulletins.map((bul) => {
              const period = state.periods.find((p) => p.id === bul.periodId);
              return (
                <div
                  key={bul.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {period?.label || 'Période'} · {state.settings.currentAcademicYear}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Moyenne générale :{' '}
                      <span className="font-mono font-bold text-blue-950">
                        {bul.generalAverage.toFixed(2)} / 20
                      </span>
                      {' · '}Rang {bul.rank}e / {bul.totalStudents} · Mention : {bul.mention}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulletinModal(bul)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap self-start sm:self-center"
                  >
                    <Printer className="w-4 h-4" />
                    Consulter / Télécharger PDF
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {bulletinModal && (
        <BulletinModal
          bulletin={bulletinModal}
          student={student}
          schoolClass={schoolClass}
          period={state.periods.find((p) => p.id === bulletinModal.periodId)}
          subjects={state.subjects}
          grades={state.grades}
          settings={state.settings}
          onClose={() => setBulletinModal(null)}
        />
      )}
    </div>
  );
};
