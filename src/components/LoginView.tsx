import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail } from 'lucide-react';
import { apiRequest, type SessionUser } from '../api';

const SCHOOL_EMBLEM_URL = '/assets/aistudio/t_l_chargement_868aae2b.png';

export const LoginView: React.FC<{
  onLogin: (user: SessionUser, initialStudentId?: string, remember?: boolean) => void;
}> = ({ onLogin }) => {
  const [mode, setMode] = useState<'staff' | 'parent'>('staff');
  const [username, setUsername] = useState('direction@jegama-school.cg');
  const [password, setPassword] = useState('jegama2026');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [forgotNotice, setForgotNotice] = useState(false);

  const [cardId, setCardId] = useState('JS-26-0001');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotNotice(false);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onLogin(res.user, undefined, rememberDevice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de connexion.');
    } finally {
      setLoading(false);
    }
  };

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotNotice(false);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: SessionUser; initialStudentId: string }>(
        '/api/auth/parent-login',
        {
          method: 'POST',
          body: JSON.stringify({ cardId }),
        }
      );
      onLogin(res.user, res.initialStudentId, rememberDevice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accès parent refusé.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-white">
      {/* Left Institutional Navy Panel with Gold Divider */}
      <section className="lg:col-span-5 bg-[#0B1933] text-white border-b-2 lg:border-b-0 lg:border-r-2 border-[#E5A923] px-5 py-5 sm:px-8 sm:py-8 flex flex-col justify-between lg:min-h-screen">
        {/* Top bar inside navy panel */}
        <div className="flex items-center justify-between text-xs font-mono tracking-wider">
          <span className="font-bold text-[#E5A923]">JEGAMA SCHOOL</span>
          <span className="text-slate-200">2026-2027</span>
        </div>

        {/* Center institutional crest & title */}
        <div className="my-5 sm:my-8 lg:my-10 flex flex-row lg:flex-col items-center text-left lg:text-center gap-4 sm:gap-5 max-w-md lg:max-w-sm mx-auto w-full">
          <div className="w-20 h-20 sm:w-28 sm:h-28 lg:w-44 lg:h-44 rounded-2xl bg-white border-2 border-[#E5A923] p-2 sm:p-3 lg:p-4 flex items-center justify-center shadow-lg shrink-0">
            <img
              src={SCHOOL_EMBLEM_URL}
              alt="Logo JEGAMA SCHOOL"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="space-y-1 sm:space-y-2 min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold tracking-wider text-[#E5A923] uppercase">
              République du Congo · Programmes Congolais & Français
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              JEGAMA SCHOOL
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              De la Maternelle au Lycée Général et Technique · Mpita-Wharf
            </p>
          </div>
        </div>

        {/* Bottom footer inside navy panel */}
        <div className="pt-3 sm:pt-4 border-t border-white/10 hidden sm:flex items-center justify-between text-xs">
          <span className="text-slate-300">Pointe-Noire · Congo</span>
          <span className="font-semibold text-[#E5A923]">Portail Officiel</span>
        </div>
      </section>

      {/* Right White Sign-in Panel */}
      <section className="lg:col-span-7 bg-white px-4 sm:px-10 lg:px-12 py-7 sm:py-10 flex items-center justify-center">
        <div className="w-full max-w-md space-y-5 sm:space-y-6">
          {/* Heading & Mode Switch */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1933]">
                Connexion
              </h2>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg max-w-full">
                <button
                  type="button"
                  onClick={() => {
                    setMode('staff');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    mode === 'staff'
                      ? 'bg-white text-[#0B1933] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Personnel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('parent');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    mode === 'parent'
                      ? 'bg-white text-[#0B1933] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Espace Parent
                </button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              {mode === 'staff'
                ? 'Saisissez votre adresse mail (ou identifiant) et votre mot de passe pour accéder à la plateforme.'
                : 'Saisissez uniquement l’ID de la carte scolaire de votre enfant pour consulter son suivi.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-800"
            >
              {error}
            </div>
          )}

          {forgotNotice && (
            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
              Veuillez contacter l’administrateur ou le secrétariat de JEGAMA SCHOOL pour réinitialiser votre mot de passe (mot de passe démo : <span className="font-mono font-semibold">jegama2026</span>).
            </div>
          )}

          {mode === 'staff' ? (
            <div className="space-y-6">
              <form onSubmit={handleStaffSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="staff-username"
                    className="block text-xs font-semibold text-slate-800 mb-1.5"
                  >
                    Adresse mail <span className="text-slate-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="staff-username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="direction@jegama-school.cg"
                      className="w-full pl-10 pr-4 py-3 text-sm bg-[#EEF4FC] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B1933] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="staff-password"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Mot de passe <span className="text-slate-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setForgotNotice(!forgotNotice)}
                      className="text-xs font-semibold text-[#0B1933] hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-11 py-3 text-sm bg-[#EEF4FC] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B1933] focus:bg-white transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Masquer' : 'Afficher'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-[#0B1933]"
                  />
                  <span>Rester connecté sur cet appareil</span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89d1c] disabled:opacity-60 rounded-xl transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  {loading ? 'Connexion en cours...' : 'Se connecter'}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleParentSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="parent-card-id"
                  className="block text-xs font-semibold text-slate-800 mb-1.5"
                >
                  ID Carte scolaire de l’élève <span className="text-slate-500">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="parent-card-id"
                    type="text"
                    required
                    value={cardId}
                    onChange={(e) => setCardId(e.target.value)}
                    placeholder="JS-26-0001"
                    className="w-full pl-10 pr-4 py-3 text-sm font-mono uppercase bg-[#EEF4FC] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B1933] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89d1c] disabled:opacity-60 rounded-xl transition-colors"
              >
                <LogIn className="w-4 h-4" />
                {loading ? 'Vérification...' : 'Consulter le dossier enfant'}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setCardId('JS-26-0001')}
                  className="text-xs font-medium text-[#0B1933] hover:underline"
                >
                  Exemple : JS-26-0001
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};
