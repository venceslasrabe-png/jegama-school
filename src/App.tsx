import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  CheckSquare,
  CreditCard,
  FileText,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, type AppState, type SessionUser } from './api';
import { AdminView } from './components/AdminView';
import { DashboardView, type NavSection } from './components/DashboardView';
import { LoginView } from './components/LoginView';
import { ParentView } from './components/ParentView';
import { ScolariteView } from './components/ScolariteView';
import { SecretariatView } from './components/SecretariatView';
import { SurveillanceView } from './components/SurveillanceView';
import { TeachersView } from './components/TeachersView';
import type { UserRole } from './types';
import { ROLE_LABELS } from './utils/format';

const SCHOOL_EMBLEM_URL = '/assets/aistudio/t_l_chargement_868aae2b.png';
const SESSION_KEY = 'jegama_session_user';

type MenuKey =
  | 'dashboard'
  | 'eleves'
  | 'caisse'
  | 'classes'
  | 'notes'
  | 'bulletins'
  | 'enseignants'
  | 'surveillance'
  | 'parent'
  | 'admin';

const ROLE_MISSIONS: Record<UserRole, { mission: string; readOnly: boolean }> = {
  direction: {
    mission: 'Supervision globale en lecture seule sur toute la plateforme (Pointe-Noire).',
    readOnly: true,
  },
  admin: {
    mission: 'Administration système, comptes utilisateurs, paramètres et sauvegardes.',
    readOnly: false,
  },
  scolarite: {
    mission: 'Inscriptions, réinscriptions, cartes scolaires et suivi des dossiers élèves.',
    readOnly: false,
  },
  caisse: {
    mission: 'Encaissement des frais en FCFA, émission des reçus et suivi des impayés.',
    readOnly: false,
  },
  secretariat: {
    mission: 'Constitution des classes, saisie des notes, moyennes et livraison des bulletins.',
    readOnly: false,
  },
  surveillant: {
    mission: 'Pointage des entrées et sorties à la guérite, motifs et mode hors-ligne.',
    readOnly: false,
  },
  parent: {
    mission: 'Consultation en lecture seule des présences, notes et bulletins validés.',
    readOnly: true,
  },
};

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SessionUser) : null;
    } catch {
      return null;
    }
  });
  const [initialParentStudentId, setInitialParentStudentId] = useState<string | undefined>();
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchState = useCallback(async (user: SessionUser) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<AppState>('/api/state', {}, user);
      setAppState(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur de chargement.';
      if (msg.includes('Non authentifié') || msg.includes('Authentification requise')) {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setAppState(null);
        return;
      }
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchState(session);
      if (session.role === 'parent') {
        setActiveMenu('parent');
      } else {
        setActiveMenu('dashboard');
      }
    } else {
      setAppState(null);
    }
  }, [session, fetchState]);

  const handleLogin = (user: SessionUser, initialStudentId?: string, remember = true) => {
    const serialized = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(SESSION_KEY, serialized);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, serialized);
      localStorage.removeItem(SESSION_KEY);
    }
    setInitialParentStudentId(initialStudentId);
    setSession(user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setAppState(null);
    setInitialParentStudentId(undefined);
  };

  if (!session) {
    return <LoginView onLogin={handleLogin} />;
  }

  const canViewMenu = (key: MenuKey): boolean => {
    const r = session.role;
    if (r === 'direction' || r === 'admin') return true;
    if (r === 'parent') return key === 'parent';
    if (key === 'dashboard') return true;
    if (key === 'eleves') return r === 'scolarite' || r === 'caisse' || r === 'secretariat';
    if (key === 'caisse') return r === 'scolarite' || r === 'caisse';
    if (key === 'classes' || key === 'notes' || key === 'bulletins') return r === 'secretariat';
    if (key === 'enseignants') return r === 'secretariat' || r === 'caisse';
    if (key === 'surveillance') return r === 'surveillant' || r === 'secretariat';
    return false;
  };

  const menuItems: Array<{
    id: MenuKey;
    label: string;
    icon: (active: boolean) => React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'dashboard',
      label: 'Tableau de bord',
      icon: (active) => (
        <LayoutGrid className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'eleves',
      label: 'Élèves & Inscriptions',
      icon: (active) => (
        <Users className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'classes',
      label: 'Classes & Matières',
      icon: (active) => (
        <BookOpen className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'surveillance',
      label: 'Pointage & Guérite',
      icon: (active) => (
        <CheckSquare className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'notes',
      label: 'Notes & Moyennes',
      icon: (active) => (
        <FileText className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'bulletins',
      label: 'Bulletins & Livraison',
      icon: (active) => (
        <Award className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'caisse',
      label: 'Caisse & Recouvrement',
      icon: (active) => (
        <CreditCard className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
      badge:
        (session.role === 'caisse' || session.role === 'direction' || session.role === 'admin') &&
        appState
          ? appState.summary.pendingNotificationsCount
          : undefined,
    },
    {
      id: 'enseignants',
      label: 'Corps enseignants',
      icon: (active) => (
        <Briefcase className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'parent',
      label: 'Vue parentale',
      icon: (active) => (
        <Users className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
    {
      id: 'admin',
      label: 'Administration & Audit',
      icon: (active) => (
        <Settings className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1933]' : 'text-[#E5A923]'}`} />
      ),
    },
  ];

  const visibleMenuItems = menuItems.filter((item) => canViewMenu(item.id));

  const handleDashboardNavigate = (sec: NavSection) => {
    if (sec === 'scolarite') setActiveMenu(session.role === 'caisse' ? 'caisse' : 'eleves');
    else if (sec === 'secretariat') setActiveMenu('notes');
    else if (sec === 'enseignants') setActiveMenu('enseignants');
    else if (sec === 'surveillance') setActiveMenu('surveillance');
    else if (sec === 'parent') setActiveMenu('parent');
    else if (sec === 'admin') setActiveMenu('admin');
    else setActiveMenu('dashboard');
  };

  const roleMeta = ROLE_MISSIONS[session.role];

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full justify-between bg-[#0B1933] text-white">
      {/* Top Brand Lockup */}
      <div>
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white p-1 flex items-center justify-center shrink-0">
              <img
                src={SCHOOL_EMBLEM_URL}
                alt="Logo JEGAMA SCHOOL"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="font-display text-base font-extrabold tracking-tight text-white truncate">
                JEGAMA SCHOOL
              </div>
              <div className="text-xs font-medium text-[#E5A923] truncate">
                Gestion Scolaire
              </div>
            </div>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Fermer le menu"
              className="p-1.5 text-slate-300 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="px-3.5 py-2 space-y-1">
          {visibleMenuItems.map((item) => {
            const active = activeMenu === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveMenu(item.id);
                  if (isMobile) setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#E5A923] text-[#0B1933] font-semibold'
                    : 'text-slate-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 truncate">
                  {item.icon(active)}
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      active ? 'bg-[#0B1933] text-[#E5A923]' : 'bg-[#E5A923]/20 text-[#E5A923]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Mission Panel */}
      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="px-0.5">
          <div className="text-sm font-semibold text-white truncate">{session.fullName}</div>
          <div className="text-xs text-slate-400 truncate font-mono">
            {session.role === 'parent'
              ? session.username
              : `${session.username}@jegama-school.cg`}
          </div>
        </div>

        <div className="rounded-xl bg-[#102347] border border-white/10 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-wide text-slate-400">
              Profil & Mission
            </span>
            {roleMeta.readOnly && (
              <span className="text-[11px] font-semibold text-[#E5A923] border border-[#E5A923]/40 px-2 py-0.5 rounded">
                Lecture seule
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-white">{ROLE_LABELS[session.role]}</div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{roleMeta.mission}</p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-white border border-white/15 rounded-lg hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4 text-[#E5A923]" />
          Déconnexion
        </button>

        <div className="text-[11px] text-slate-400 text-center">
          Mpita-Wharf, Pointe-Noire · Congo
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Horizontal Deep-Navy & Gold Institutional Top Bar */}
      <header className="no-print bg-[#0B1933] text-white border-b border-white/10 sticky top-0 z-40 shrink-0">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6">
          {/* Top row: Brand, Profile & Logout */}
          <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4 lg:border-b lg:border-white/10">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Ouvrir le menu"
                className="lg:hidden p-2 -ml-1.5 text-slate-200 hover:text-white rounded-lg hover:bg-white/10 shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveMenu(session.role === 'parent' ? 'parent' : 'dashboard')}
                className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-1 flex items-center justify-center shrink-0">
                  <img
                    src={SCHOOL_EMBLEM_URL}
                    alt="Logo JEGAMA SCHOOL"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-sm sm:text-base font-extrabold tracking-tight text-white truncate">
                    JEGAMA SCHOOL
                  </div>
                  <div className="text-[11px] font-medium text-[#E5A923] truncate hidden sm:block">
                    Gestion Scolaire · Mpita-Wharf, Pointe-Noire
                  </div>
                  <div className="text-[11px] font-medium text-[#E5A923] truncate sm:hidden">
                    {ROLE_LABELS[session.role]}
                  </div>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#102347] border border-white/10">
                <div className="text-right">
                  <div className="text-xs font-semibold text-white whitespace-nowrap">
                    {session.fullName}
                  </div>
                  <div className="text-[11px] text-slate-300 whitespace-nowrap">
                    {ROLE_LABELS[session.role]}
                    {roleMeta.readOnly && (
                      <span className="ml-1.5 text-[#E5A923] font-semibold">· Lecture seule</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                aria-label="Déconnexion"
                className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-white border border-white/20 rounded-lg hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 text-[#E5A923]" />
                <span className="hidden xs:inline sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>

          {/* Horizontal Rubriques Strip (Desktop) */}
          <nav
            aria-label="Rubriques principales"
            className="hidden lg:flex items-center gap-1.5 py-2.5 overflow-x-auto"
          >
            {visibleMenuItems.map((item) => {
              const active = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveMenu(item.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#E5A923] text-[#0B1933] font-semibold'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.icon(active)}
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        active ? 'bg-[#0B1933] text-[#E5A923]' : 'bg-[#E5A923]/20 text-[#E5A923]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 overflow-y-auto shadow-2xl">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Direction générale Read-Only Banner (Section 6) */}
      {session.role === 'direction' && (
        <div className="no-print bg-amber-50 border-b border-amber-200 px-3 sm:px-6 py-2">
          <div className="max-w-[1440px] mx-auto flex items-start sm:items-center gap-2 text-xs font-semibold text-amber-900">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Lecture seule — Direction générale : consultation globale de toutes les rubriques autorisée sans droit de modification.
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 px-3 py-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto min-w-0">
          {loadError && (
            <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-800">
              {loadError}
            </div>
          )}

          {!appState && loading ? (
            <div className="space-y-4">
              <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
              <div className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />
                <div className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />
                <div className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />
                <div className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />
              </div>
            </div>
          ) : appState ? (
            <>
              {activeMenu === 'dashboard' && (
                <DashboardView
                  state={appState}
                  role={session.role}
                  onNavigate={handleDashboardNavigate}
                />
              )}
              {(activeMenu === 'eleves' || activeMenu === 'caisse') && (
                <ScolariteView
                  state={appState}
                  session={session}
                  initialTab={activeMenu === 'caisse' ? 'caisse' : 'dossiers'}
                  onRefresh={() => fetchState(session)}
                />
              )}
              {(activeMenu === 'classes' || activeMenu === 'notes' || activeMenu === 'bulletins') && (
                <SecretariatView
                  state={appState}
                  session={session}
                  initialTab={
                    activeMenu === 'classes'
                      ? 'classes'
                      : activeMenu === 'bulletins'
                        ? 'bulletins'
                        : 'notes'
                  }
                  onRefresh={() => fetchState(session)}
                />
              )}
              {activeMenu === 'enseignants' && (
                <TeachersView
                  state={appState}
                  session={session}
                  onRefresh={() => fetchState(session)}
                />
              )}
              {activeMenu === 'surveillance' && (
                <SurveillanceView
                  state={appState}
                  session={session}
                  onRefresh={() => fetchState(session)}
                />
              )}
              {activeMenu === 'parent' && (
                <ParentView
                  state={appState}
                  session={session}
                  initialStudentId={initialParentStudentId}
                />
              )}
              {activeMenu === 'admin' && (
                <AdminView
                  state={appState}
                  session={session}
                  onRefresh={() => fetchState(session)}
                />
              )}
            </>
          ) : null}
      </main>
    </div>
  );
}
