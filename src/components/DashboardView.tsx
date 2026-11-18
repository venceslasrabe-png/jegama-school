import React from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CreditCard,
  GraduationCap,
  Lock,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import type { AppState } from '../api';
import type { UserRole } from '../types';
import { formatDateTimeFr, formatFcfa, ROLE_LABELS } from '../utils/format';

export type NavSection =
  | 'dashboard'
  | 'scolarite'
  | 'secretariat'
  | 'surveillance'
  | 'parent'
  | 'admin';

export const DashboardView: React.FC<{
  state: AppState;
  role: UserRole;
  onNavigate: (section: NavSection) => void;
}> = ({ state, role, onNavigate }) => {
  const { summary } = state;

  const canAccess = (section: NavSection): { allowed: boolean; modeLabel: string; required: string } => {
    if (role === 'direction') {
      return { allowed: true, modeLabel: 'Lecture seule', required: '' };
    }
    if (role === 'admin') {
      return { allowed: true, modeLabel: 'Accès complet', required: '' };
    }
    switch (section) {
      case 'scolarite':
        if (role === 'scolarite' || role === 'caisse') {
          return { allowed: true, modeLabel: 'Modifier & encaisser', required: '' };
        }
        if (role === 'secretariat') {
          return { allowed: true, modeLabel: 'Consulter', required: '' };
        }
        return { allowed: false, modeLabel: 'Non autorisé', required: 'Scolarité / Caisse' };
      case 'secretariat':
        if (role === 'secretariat') {
          return { allowed: true, modeLabel: 'Modifier', required: '' };
        }
        return { allowed: false, modeLabel: 'Non autorisé', required: 'Secrétariat académique' };
      case 'surveillance':
        if (role === 'surveillant') {
          return { allowed: true, modeLabel: 'Pointer & modifier', required: '' };
        }
        if (role === 'secretariat') {
          return { allowed: true, modeLabel: 'Consulter', required: '' };
        }
        return { allowed: false, modeLabel: 'Non autorisé', required: 'Surveillant' };
      case 'parent':
        if (role === 'parent') {
          return { allowed: true, modeLabel: 'Lecture seule', required: '' };
        }
        return { allowed: false, modeLabel: 'Non autorisé', required: 'Parent / Direction' };
      default:
        return { allowed: true, modeLabel: 'Consulter', required: '' };
    }
  };

  const modules: Array<{
    id: NavSection;
    title: string;
    subtitle: string;
    metricLabel: string;
    metricValue: string;
    icon: React.ReactNode;
    badgeCount?: number;
  }> = [
    {
      id: 'scolarite',
      title: 'Scolarité & Caisse',
      subtitle: 'Inscriptions, réinscriptions, cartes scolaires, encaissements FCFA et reçus.',
      metricLabel: 'Encaissement annuel',
      metricValue: `${summary.collectionRatePercent}% · ${formatFcfa(summary.totalCollectedFcfa)}`,
      icon: <CreditCard className="w-5 h-5 text-blue-900" />,
      badgeCount:
        role === 'caisse' || role === 'direction' || role === 'admin'
          ? summary.pendingNotificationsCount
          : undefined,
    },
    {
      id: 'secretariat',
      title: 'Secrétariat académique',
      subtitle: 'Classes, matières, coefficients, saisie des notes et livraison des bulletins.',
      metricLabel: 'Bulletins à remettre',
      metricValue: `${summary.bulletinsToDeliverCount} dossier(s)`,
      icon: <BookOpen className="w-5 h-5 text-blue-900" />,
    },
    {
      id: 'surveillance',
      title: 'Surveillance & Guérite',
      subtitle: 'Pointage des entrées et sorties par carte scolaire, motifs et mode hors-ligne.',
      metricLabel: 'Présents aujourd’hui',
      metricValue: `${summary.presentTodayCount} / ${summary.totalStudents} élèves`,
      icon: <UserCheck className="w-5 h-5 text-blue-900" />,
    },
    {
      id: 'parent',
      title: 'Vue parentale',
      subtitle: 'Consultation en lecture seule des présences, notes et bulletins validés.',
      metricLabel: 'Familles rattachées',
      metricValue: `${state.parents.length} compte(s) tuteurs`,
      icon: <Users className="w-5 h-5 text-blue-900" />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header summary */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Tableau de bord · {state.settings.schoolName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {state.settings.address}, {state.settings.city} · Année scolaire{' '}
            <span className="font-mono text-slate-700">{state.settings.currentAcademicYear}</span>
            {' · '}Profil actif : <span className="font-medium text-slate-700">{ROLE_LABELS[role]}</span>
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Élèves inscrits</div>
          <div className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {summary.totalStudents}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.activeCards} cartes actives
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Scolarité encaissée</div>
          <div className="mt-2 text-2xl font-mono font-bold text-emerald-700 tabular-nums">
            {summary.collectionRatePercent}%
          </div>
          <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
            {formatFcfa(summary.totalCollectedFcfa)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Présents aujourd’hui</div>
          <div className="mt-2 text-2xl font-mono font-bold text-blue-900 tabular-nums">
            {summary.presentTodayCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.exitedTodayCount} sorti(s) · {summary.notScannedTodayCount} non pointé(s)
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Paiements en attente</div>
          <div className="mt-2 text-2xl font-mono font-bold text-amber-700 tabular-nums">
            {summary.pendingNotificationsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.unpaidStudentsCount} dossier(s) avec solde
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Bulletins à remettre</div>
          <div className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {summary.bulletinsToDeliverCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Sur {state.bulletins.length} édités
          </div>
        </div>
      </div>

      {/* Clickable Section Cards (4-column horizontal row) */}
      <div>
        <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
          Rubriques de gestion
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {modules.map((mod) => {
            const access = canAccess(mod.id);
            return (
              <button
                key={mod.id}
                type="button"
                disabled={!access.allowed}
                onClick={() => access.allowed && onNavigate(mod.id)}
                className={`text-left p-5 rounded-xl border transition-colors flex flex-col justify-between gap-4 ${
                  access.allowed
                    ? 'bg-white border-slate-200 hover:border-blue-900 cursor-pointer'
                    : 'bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`p-2 rounded-lg border shrink-0 ${
                        access.allowed
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-200/60 border-slate-200 grayscale'
                      }`}
                    >
                      {mod.icon}
                    </div>
                    {access.allowed ? (
                      <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={`font-display text-sm font-bold ${
                          access.allowed ? 'text-slate-900' : 'text-slate-500'
                        }`}
                      >
                        {mod.title}
                      </h3>
                      {mod.badgeCount !== undefined && mod.badgeCount > 0 && (
                        <span className="font-mono text-[11px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          {mod.badgeCount} en attente
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{mod.subtitle}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 truncate">{mod.metricLabel}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums whitespace-nowrap ${
                        access.allowed ? 'text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {mod.metricValue}
                    </span>
                  </div>
                  <div className="font-medium">
                    {access.allowed ? (
                      <span className="text-blue-900">{access.modeLabel}</span>
                    ) : (
                      <span className="text-slate-500">Profil requis : {access.required}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cycle breakdown & recent audit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-900" />
              Répartition par cycle et programme
            </h2>
            <span className="text-xs text-slate-500">{state.classes.length} classes ouvertes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 text-left">
                  <th className="py-2 font-medium">Classe</th>
                  <th className="py-2 font-medium">Cycle</th>
                  <th className="py-2 font-medium">Programme</th>
                  <th className="py-2 font-medium text-right">Effectif / Cap.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.classes.map((cls) => {
                  const count = state.students.filter(
                    (s) => s.classId === cls.id && s.status !== 'archive'
                  ).length;
                  return (
                    <tr key={cls.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-semibold text-slate-900">{cls.name}</td>
                      <td className="py-2.5 text-slate-600">{cls.cycle}</td>
                      <td className="py-2.5 text-slate-600">{cls.program}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-800">
                        {count} / {cls.capacity}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-900" />
              Dernières opérations tracées
            </h2>
            <span className="text-xs text-slate-500">Journal d’audit</span>
          </div>
          {state.auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6">Aucune opération tracée récemment.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {state.auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900">{log.action}</span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatDateTimeFr(log.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{log.details}</p>
                  <div className="text-[11px] text-slate-400">Par {log.userName}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
