import React from 'react';
import { Download, Printer, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { downloadCardPagesAsPdf, downloadElementAsPdf } from '../utils/pdf';
import type {
  Bulletin,
  EvaluationPeriod,
  Grade,
  ParentTutor,
  Payment,
  SchoolClass,
  SchoolSettings,
  Student,
  Subject,
  Teacher,
  TeacherPayslip,
} from '../types';
import { formatDateFr, formatDateTimeFr, formatFcfa, generateBarcodeBars } from '../utils/format';

const SCHOOL_EMBLEM_URL = '/assets/aistudio/t_l_chargement_868aae2b.png';

export const StudentAvatar: React.FC<{
  photoUrl?: string;
  firstName: string;
  lastName: string;
  sizeClass?: string;
}> = ({ photoUrl, firstName, lastName, sizeClass = 'w-10 h-10' }) => {
  const [failed, setFailed] = React.useState(false);
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  React.useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  if (!photoUrl || failed) {
    return (
      <div
        className={`${sizeClass} rounded-md bg-slate-200 text-slate-700 font-semibold flex items-center justify-center shrink-0 border border-slate-300 text-xs`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={`${firstName} ${lastName}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-md object-cover shrink-0 border border-slate-200 bg-slate-100`}
    />
  );
};

export const StudentCardModal: React.FC<{
  student: Student;
  schoolClass?: SchoolClass;
  parent?: ParentTutor;
  settings: SchoolSettings;
  onClose: () => void;
}> = ({ student, schoolClass, parent, settings, onClose }) => {
  const bars = generateBarcodeBars(student.cardId);
  const rectoRef = React.useRef<HTMLDivElement>(null);
  const versoRef = React.useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const handleDownload = async () => {
    if (!rectoRef.current || !versoRef.current || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadCardPagesAsPdf(
        [rectoRef.current, versoRef.current],
        `Carte-PVC-${student.cardId}.pdf`
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur lors du téléchargement.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-lg overflow-hidden print-container my-auto">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
              Carte scolaire officielle (Recto / Verso) · {student.cardId}
            </h3>
            <p className="text-xs text-slate-500">
              Format PVC portrait avec photo, QR code certifié et code-barres guérite
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Téléchargement...' : 'Télécharger'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="no-print px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 shrink-0">
            {downloadError}
          </div>
        )}

        <div className="p-3 sm:p-8 bg-slate-100 print:bg-white print:p-0 overflow-auto flex-1">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-8 print:block print:space-y-8 min-w-fit mx-auto">
            {/* RECTO */}
            <div className="w-[360px] shrink-0 space-y-2 print:mx-auto print:break-after-page">
              <div className="no-print text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">
                Recto
              </div>
              <div
                ref={rectoRef}
                className="w-[360px] h-[584px] bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm print:shadow-none flex flex-col justify-between"
              >
                {/* Header */}
                <div className="px-4 pt-4 pb-2.5 flex items-center gap-3 bg-white shrink-0">
                  <img
                    src={SCHOOL_EMBLEM_URL}
                    alt="Logo JEGAMA SCHOOL"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-lg object-contain border border-slate-200 p-0.5 shrink-0 bg-white"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold tracking-wide text-[#0B1933] leading-tight">
                      {settings.schoolName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {settings.city} · {settings.country}
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 px-4 pb-3 flex flex-col justify-between min-h-0">
                  {/* Gold Title Banner */}
                  <div className="bg-[#E5A923] text-[#0B1933] text-center font-extrabold text-sm tracking-wide py-2 rounded-lg uppercase shrink-0">
                    CARTE D’ÉLÈVE
                  </div>

                  {/* Photo + Key Badges */}
                  <div className="grid grid-cols-12 gap-3.5 items-stretch">
                    <div className="col-span-5">
                      <StudentAvatar
                        photoUrl={student.photoUrl}
                        firstName={student.firstName}
                        lastName={student.lastName}
                        sizeClass="w-full h-40 rounded-lg"
                      />
                    </div>
                    <div className="col-span-7 flex flex-col justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          Année académique
                        </div>
                        <div className="bg-[#0B1933] text-white font-mono font-bold text-xs py-1.5 px-3 rounded-lg text-center">
                          {student.academicYear}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Cycle & Classe
                        </div>
                        <div className="text-xs font-bold text-[#0B1933] mt-0.5 truncate">
                          {student.cycle} · {schoolClass ? schoolClass.name : 'À affecter'}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          ID Carte élève
                        </div>
                        <div className="bg-[#0B1933] text-white font-mono font-bold text-xs py-1.5 px-3 rounded-lg text-center tracking-wider">
                          {student.cardId}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Student Identity Card */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Nom(s) et Prénom(s) :
                    </div>
                    <div className="text-sm font-extrabold text-[#0B1933] leading-snug uppercase truncate">
                      {student.lastName} {student.firstName}
                    </div>
                    <div className="pt-1 text-xs space-y-0.5">
                      <div className="flex gap-1.5">
                        <span className="text-slate-500 uppercase text-[10px] font-semibold w-24 shrink-0">
                          Programme :
                        </span>
                        <span className="font-bold text-[#0B1933]">{student.program}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <span className="text-slate-500 uppercase text-[10px] font-semibold w-24 shrink-0">
                          Né(e) le :
                        </span>
                        <span className="font-semibold text-slate-800 truncate">
                          {formatDateFr(student.birthDate)} ({student.birthPlace})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Certified ID + QR Code */}
                  <div className="grid grid-cols-12 gap-3 items-stretch">
                    <div className="col-span-7 bg-[#f0f7ff] border border-[#bfdbfe] rounded-xl p-3 flex flex-col justify-between">
                      <div className="text-[11px] font-extrabold text-[#0B1933] uppercase">
                        ID ÉLÈVE CERTIFIÉ
                      </div>
                      <div className="text-[10px] text-slate-600 leading-snug my-1">
                        Contrôle guérite & présences
                        <br />
                        Propriété officielle JEGAMA
                      </div>
                      <div className="font-mono text-[11px] font-bold text-[#0B1933]">
                        {student.cardId}
                      </div>
                    </div>
                    <div className="col-span-5 bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-center">
                      <QRCodeSVG
                        value={student.cardId}
                        size={74}
                        fgColor="#0B1933"
                        bgColor="#ffffff"
                        level="M"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Strip */}
                <div className="border-t-4 border-[#E5A923] bg-[#0B1933] text-white text-center py-2.5 text-[11px] font-bold tracking-wider uppercase shrink-0">
                  RÉPUBLIQUE DU CONGO · JEGAMA SCHOOL
                </div>
              </div>
            </div>

            {/* VERSO */}
            <div className="w-[360px] shrink-0 space-y-2 print:mx-auto">
              <div className="no-print text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">
                Verso
              </div>
              <div
                ref={versoRef}
                className="w-[360px] h-[584px] bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm print:shadow-none flex flex-col justify-between"
              >
                {/* Dark Navy Header */}
                <div className="bg-[#0B1933] text-white px-4 py-3.5 flex items-center gap-3 shrink-0">
                  <div className="w-11 h-11 rounded-lg bg-white p-0.5 flex items-center justify-center shrink-0">
                    <img
                      src={SCHOOL_EMBLEM_URL}
                      alt="Logo JEGAMA SCHOOL"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold tracking-wide text-white leading-tight">
                      {settings.schoolName}
                    </div>
                    <div className="text-[10px] font-bold tracking-wide text-[#E5A923] uppercase mt-0.5 truncate">
                      AUTHENTIFICATION & CONTACTS ÉLÈVE
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 px-4 py-3 flex flex-col justify-between min-h-0">
                  {/* Parent & Emergency Contact */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Parent / Tuteur légal :
                      </div>
                      <div className="text-xs font-extrabold text-[#0B1933] mt-0.5 truncate">
                        {parent?.fullName || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Téléphone d’urgence :
                      </div>
                      <div className="text-xs font-mono font-extrabold text-[#0B1933] mt-0.5">
                        {parent?.phone || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Adresse :
                      </div>
                      <div className="text-[11px] font-medium text-slate-700 mt-0.5 truncate">
                        {parent?.address || `${settings.address}, ${settings.city}`}
                      </div>
                    </div>
                  </div>

                  {/* Academic Assignment Box */}
                  <div className="p-3 rounded-xl bg-[#f0f7ff] border border-[#bfdbfe] space-y-1.5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Cycle & Programme :
                      </div>
                      <div className="text-xs font-extrabold text-[#0B1933] mt-0.5 truncate">
                        {student.cycle} · Programme {student.program}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Classe & Salle :
                      </div>
                      <div className="text-xs font-extrabold text-[#0B1933] mt-0.5 truncate">
                        {schoolClass ? `${schoolClass.name} · ${schoolClass.room}` : 'Affectation en cours'}
                      </div>
                    </div>
                  </div>

                  {/* Birth & Status lines */}
                  <div className="text-[11px] text-slate-600 space-y-0.5">
                    <div className="truncate">
                      Né(e) le : {formatDateFr(student.birthDate)} à {student.birthPlace}
                    </div>
                    <div className="truncate">
                      Statut :{' '}
                      <span className="font-semibold text-[#0B1933]">
                        {student.cardStatus === 'active'
                          ? 'Carte active · Valide à la guérite'
                          : `Carte ${student.cardStatus}`}
                      </span>
                    </div>
                  </div>

                  {/* Regulatory Notice */}
                  <div className="p-2.5 rounded-xl bg-slate-100 text-center space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-700">
                      AVIS RÉGLEMENTAIRE & SÉCURITÉ
                    </div>
                    <p className="text-[10px] text-slate-600 leading-snug">
                      Carte strictement personnelle. Obligatoire à la guérite et aux évaluations.
                      <br />
                      En cas de perte, rapporter à la Scolarité : {settings.address}, {settings.city}.
                    </p>
                  </div>

                  {/* Signature & Certified Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500">Direction de la Scolarité</div>
                      <div className="text-xs font-extrabold text-[#0B1933] mt-0.5">
                        {settings.schoolName}
                      </div>
                    </div>
                    <div className="bg-[#E5A923] text-[#0B1933] text-[10px] font-extrabold px-3.5 py-2 rounded-lg tracking-wide uppercase">
                      JEGAMA-CERTIFIÉ
                    </div>
                  </div>
                </div>

                {/* Dark Footer Barcode Strip */}
                <div className="border-t-4 border-[#E5A923] bg-[#0B1933] text-white py-2.5 px-4 flex items-center justify-center gap-3 shrink-0">
                  <div className="flex items-center gap-1 opacity-80">
                    {bars.slice(0, 7).map((w, idx) => (
                      <span
                        key={`bl-${idx}`}
                        className="inline-block bg-white h-4"
                        style={{ width: `${Math.max(1, w)}px` }}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-xs font-bold tracking-widest text-white">
                    {student.cardId}
                  </span>
                  <div className="flex items-center gap-1 opacity-80">
                    {bars.slice(-7).map((w, idx) => (
                      <span
                        key={`br-${idx}`}
                        className="inline-block bg-white h-4"
                        style={{ width: `${Math.max(1, w)}px` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {student.cardStatus !== 'active' && (
            <div className="mt-4 text-xs text-red-700 font-medium text-center">
              Attention : le statut actuel de cette carte est « {student.cardStatus} ». Elle est refusée à la guérite.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ReceiptModal: React.FC<{
  payment: Payment;
  student: Student;
  parent?: ParentTutor;
  balanceRemaining: number;
  settings: SchoolSettings;
  onClose: () => void;
}> = ({ payment, student, parent, balanceRemaining, settings, onClose }) => {
  const docRef = React.useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const handleDownload = async () => {
    if (!docRef.current || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadElementAsPdf(
        docRef.current,
        `Recu-${payment.receiptNumber}-${student.cardId}.pdf`,
        { maxWidthMm: 175 }
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur lors du téléchargement.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[94vh] flex flex-col shadow-lg overflow-hidden print-container my-auto">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
              Reçu de paiement {payment.receiptNumber}
            </h3>
            <p className="text-xs text-slate-500">Justificatif officiel de caisse</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Téléchargement...' : 'Télécharger'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="no-print px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 shrink-0">
            {downloadError}
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          <div ref={docRef} className="p-4 sm:p-8 space-y-5 sm:space-y-6 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4 sm:pb-5">
              <div className="flex items-center gap-3">
                <img
                  src={SCHOOL_EMBLEM_URL}
                  alt="Logo JEGAMA SCHOOL"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded object-contain border border-slate-200 p-1 shrink-0"
                />
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">{settings.schoolName}</h2>
                  <p className="text-xs text-slate-500">
                    {settings.address}, {settings.city} · {settings.country}
                  </p>
                  <p className="text-xs text-slate-500">Service Scolarité & Caisse</p>
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-xs text-slate-500">Reçu N°</div>
                <div className="text-base font-mono font-bold text-blue-950">
                  {payment.receiptNumber}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatDateTimeFr(payment.paidAt)}
                </div>
              </div>
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200 items-center">
            <div className="flex items-center gap-3.5">
              <StudentAvatar
                photoUrl={student.photoUrl}
                firstName={student.firstName}
                lastName={student.lastName}
                sizeClass="w-16 h-20"
              />
              <div className="min-w-0">
                <div className="text-xs text-slate-500">Élève</div>
                <div className="font-semibold text-slate-900">
                  {student.lastName} {student.firstName}
                </div>
                <div className="text-xs font-mono text-slate-600 mt-0.5">
                  Carte {student.cardId} · {student.cycle} ({student.program})
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Payeur / Parent</div>
              <div className="font-semibold text-slate-900">{parent?.fullName || '—'}</div>
              <div className="text-xs text-slate-600 mt-0.5">{parent?.phone || '—'}</div>
            </div>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Désignation</th>
                <th className="py-2 font-medium">Mode</th>
                <th className="py-2 font-medium text-right">Montant encaissé</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-3 text-slate-900 font-medium">{payment.trancheLabel}</td>
                <td className="py-3 text-slate-600">{payment.method}</td>
                <td className="py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                  {formatFcfa(payment.amountPaid)}
                </td>
              </tr>
            </tbody>
          </table>

          {payment.notes && (
            <div className="text-xs text-slate-600">
              <span className="font-semibold">Observations :</span> {payment.notes}
            </div>
          )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-slate-200 text-sm">
              <div>
                <span className="text-slate-500">Solde restant à payer : </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatFcfa(balanceRemaining)}
                </span>
              </div>
              <div className="sm:text-right">
                <div className="text-xs text-slate-500">Caissier</div>
                <div className="font-medium text-slate-800">{payment.cashierName}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BulletinModal: React.FC<{
  bulletin: Bulletin;
  student: Student;
  schoolClass?: SchoolClass;
  period?: EvaluationPeriod;
  subjects: Subject[];
  grades: Grade[];
  settings: SchoolSettings;
  onClose: () => void;
}> = ({ bulletin, student, schoolClass, period, subjects, grades, settings, onClose }) => {
  const classSubjects = subjects.filter(
    (sub) => sub.cycle === student.cycle && sub.program === student.program
  );

  const totalCoeff = classSubjects.reduce((acc, s) => {
    const g = grades.find(
      (gr) => gr.studentId === student.id && gr.subjectId === s.id && gr.periodId === bulletin.periodId
    );
    return g ? acc + s.coefficient : acc;
  }, 0);

  const totalWeighted = classSubjects.reduce((acc, s) => {
    const g = grades.find(
      (gr) => gr.studentId === student.id && gr.subjectId === s.id && gr.periodId === bulletin.periodId
    );
    return g ? acc + g.average * s.coefficient : acc;
  }, 0);

  const docRef = React.useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const handleDownload = async () => {
    if (!docRef.current || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const periodSlug = (period?.label || 'Periode').replace(/\s+/g, '-');
      await downloadElementAsPdf(
        docRef.current,
        `Bulletin-${student.cardId}-${periodSlug}.pdf`,
        { maxWidthMm: 186 }
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur lors du téléchargement.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-lg overflow-hidden print-container my-auto">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
              Bulletin Scolaire · {student.lastName} {student.firstName}
            </h3>
            <p className="text-xs text-slate-500">
              {period?.label || 'Période'} · Programme {student.program}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Téléchargement...' : 'Télécharger PDF'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="no-print px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 shrink-0">
            {downloadError}
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          <div ref={docRef} className="p-4 sm:p-8 space-y-5 sm:space-y-6 bg-white">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-blue-950 pb-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <img
                  src={SCHOOL_EMBLEM_URL}
                  alt="Logo JEGAMA SCHOOL"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded object-contain border border-slate-200 p-1 shrink-0"
                />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-blue-950">{settings.schoolName}</h1>
                  <p className="text-xs text-slate-600">
                    {settings.address}, {settings.city} · {settings.country}
                  </p>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">
                    Programme {student.program} · Enseignement {student.cycle}
                  </p>
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-sm font-bold text-slate-900">BULLETIN DE NOTES</div>
                <div className="text-xs font-semibold text-blue-900">
                  {period?.label || 'Période'} · {settings.currentAcademicYear}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Statut : {bulletin.deliveryStatus.replace('_', ' ')}
                </div>
              </div>
            </div>

          {/* Student summary */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
            <StudentAvatar
              photoUrl={student.photoUrl}
              firstName={student.firstName}
              lastName={student.lastName}
              sizeClass="w-20 h-24"
            />
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <div>
                <div className="text-xs text-slate-500">Élève</div>
                <div className="font-bold text-slate-900">
                  {student.lastName} {student.firstName}
                </div>
                <div className="text-xs font-mono text-slate-600">ID Carte : {student.cardId}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Classe & Professeur principal</div>
                <div className="font-semibold text-slate-900">
                  {schoolClass?.name || student.cycle}
                </div>
                <div className="text-xs text-slate-600">{schoolClass?.headTeacher || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Assiduité sur la période</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {bulletin.absencesCount} absence(s) · {bulletin.latesCount} retard(s)
                </div>
                <div className="text-xs text-slate-600">
                  Né(e) le {formatDateFr(student.birthDate)}
                </div>
              </div>
            </div>
          </div>

          {/* Grades table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs text-slate-700">
                  <th className="py-2.5 px-3 text-left font-semibold">Matière & Enseignant</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Coeff.</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Notes (/20)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Moy. /20</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Total pondéré</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Appréciation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classSubjects.map((sub) => {
                  const grade = grades.find(
                    (g) =>
                      g.studentId === student.id &&
                      g.subjectId === sub.id &&
                      g.periodId === bulletin.periodId
                  );
                  const weighted = grade ? (grade.average * sub.coefficient).toFixed(2) : '—';
                  return (
                    <tr key={sub.id}>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{sub.name}</div>
                        <div className="text-xs text-slate-500">{sub.teacherName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {sub.coefficient}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-600 tabular-nums">
                        {grade ? grade.values.join(' · ') : 'Non saisie'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {grade ? grade.average.toFixed(2) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                        {weighted}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        {grade?.teacherAppreciation || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-slate-900">
                  <td className="py-3 px-3">Totaux généraux</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{totalCoeff}</td>
                  <td className="py-3 px-3" />
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-blue-950">
                    {bulletin.generalAverage.toFixed(2)} / 20
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {totalWeighted.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-600">
                    Rang : {bulletin.rank}e / {bulletin.totalStudents}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary footer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-slate-200 rounded-lg p-4 bg-white">
            <div>
              <div className="text-xs text-slate-500">Moyenne générale pondérée</div>
              <div className="text-2xl font-mono font-bold text-blue-950 tabular-nums">
                {bulletin.generalAverage.toFixed(2)} / 20
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Classement & Mention</div>
              <div className="text-base font-bold text-slate-900 tabular-nums">
                {bulletin.rank}e sur {bulletin.totalStudents} · {bulletin.mention}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Décision / Appréciation générale</div>
              <div className="text-xs text-slate-700 mt-0.5">{bulletin.appreciation}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-500 pt-2">
            <div>
              Édité par le Secrétariat académique · {settings.schoolName}, {settings.city}
            </div>
            <div>
              {bulletin.deliveredAt
                ? `Remis le ${formatDateTimeFr(bulletin.deliveredAt)} à ${bulletin.receivedBy}`
                : bulletin.validatedAt
                  ? `Validé le ${formatDateFr(bulletin.validatedAt)}`
                  : 'Document provisoire avant validation'}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PayslipModal: React.FC<{
  payslip: TeacherPayslip;
  teacher: Teacher;
  settings: SchoolSettings;
  onClose: () => void;
}> = ({ payslip, teacher, settings, onClose }) => {
  const docRef = React.useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const totalDeductions = payslip.cnssDeductionFcfa + payslip.advanceOrOtherDeductionFcfa;
  const statusLabel =
    payslip.status === 'paye'
      ? 'Payé'
      : payslip.status === 'valide'
        ? 'Validé pour paiement'
        : 'Brouillon';

  const handleDownload = async () => {
    if (!docRef.current || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadElementAsPdf(
        docRef.current,
        `Bulletin-Paye-${payslip.payslipNumber}-${teacher.matricule}.pdf`,
        { maxWidthMm: 186 }
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur lors du téléchargement.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[94vh] flex flex-col shadow-lg overflow-hidden print-container my-auto">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
              Bulletin de paye · {payslip.payslipNumber}
            </h3>
            <p className="text-xs text-slate-500">
              {teacher.lastName} {teacher.firstName} · {payslip.periodLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-[#0B1933] bg-[#E5A923] hover:bg-[#d89b18] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Téléchargement...' : 'Télécharger PDF'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="no-print px-4 sm:px-6 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 shrink-0">
            {downloadError}
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          <div ref={docRef} className="p-4 sm:p-8 space-y-5 sm:space-y-6 bg-white">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-[#0B1933] pb-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <img
                  src={SCHOOL_EMBLEM_URL}
                  alt="Logo JEGAMA SCHOOL"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded object-contain border border-slate-200 p-1 shrink-0"
                />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-[#0B1933]">
                    {settings.schoolName}
                  </h1>
                  <p className="text-xs text-slate-600">
                    {settings.address}, {settings.city} · {settings.country}
                  </p>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">
                    Direction Administrative & Comptabilité · Paie Enseignants
                  </p>
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-sm font-bold text-[#0B1933]">BULLETIN DE PAYE</div>
                <div className="text-xs font-mono font-bold text-blue-900 mt-0.5">
                  N° {payslip.payslipNumber}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Période : <span className="font-semibold text-slate-900">{payslip.periodLabel}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Année académique {payslip.academicYear} · Statut : {statusLabel}
                </div>
              </div>
            </div>

            {/* Employer / Teacher identification */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
              <StudentAvatar
                photoUrl={teacher.photoUrl}
                firstName={teacher.firstName}
                lastName={teacher.lastName}
                sizeClass="w-16 h-20"
              />
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                <div>
                  <div className="text-xs text-slate-500">Enseignant</div>
                  <div className="font-bold text-slate-900">
                    {teacher.lastName} {teacher.firstName}
                  </div>
                  <div className="text-xs font-mono text-slate-600">
                    Matricule : {teacher.matricule}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Fonction & Spécialité</div>
                  <div className="font-semibold text-slate-900">{teacher.specialty}</div>
                  <div className="text-xs text-slate-600">
                    Contrat {teacher.contractType} · {teacher.cycles.join(', ')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Règlement</div>
                  <div className="font-semibold text-slate-900">{payslip.paymentMethod}</div>
                  <div className="text-xs text-slate-600 truncate">
                    {teacher.bankOrMobileAccount || teacher.phone}
                  </div>
                </div>
              </div>
            </div>

            {/* Earnings & Deductions Breakdown */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs text-slate-700">
                    <th className="py-2.5 px-3 text-left font-semibold">Rubrique de paie</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Cumul heures</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Taux horaire</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Gains (+)</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Retenues (-)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">
                        Salaire horaire (Cumul des heures × Taux horaire)
                      </div>
                      <div className="text-xs text-slate-500">
                        {payslip.regularHours} h × {formatFcfa(payslip.hourlyRateFcfa)}/h
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-slate-800">
                      {payslip.regularHours} h
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatFcfa(payslip.hourlyRateFcfa)}/h
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatFcfa(payslip.basePayFcfa)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                  </tr>

                  {payslip.overtimeHours > 0 && (
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        Heures complémentaires
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {payslip.overtimeHours} h
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatFcfa(payslip.overtimeRateFcfa)}/h
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatFcfa(payslip.overtimePayFcfa)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                    </tr>
                  )}

                  {payslip.bonusesFcfa > 0 && (
                    <tr>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">Primes & Indemnités</div>
                        {payslip.bonusDetails && (
                          <div className="text-xs text-slate-500">{payslip.bonusDetails}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">Forfait</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">—</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatFcfa(payslip.bonusesFcfa)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                    </tr>
                  )}

                  <tr className="bg-slate-50/80 font-semibold">
                    <td className="py-2.5 px-3 text-slate-900" colSpan={3}>
                      Total Salaire Brut
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-blue-950 tabular-nums">
                      {formatFcfa(payslip.grossPayFcfa)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                  </tr>

                  {payslip.cnssDeductionFcfa > 0 && (
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        Cotisation sociale / CNSS
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {formatFcfa(payslip.grossPayFcfa)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {payslip.grossPayFcfa > 0
                          ? `${((payslip.cnssDeductionFcfa / payslip.grossPayFcfa) * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-red-700 tabular-nums">
                        {formatFcfa(payslip.cnssDeductionFcfa)}
                      </td>
                    </tr>
                  )}

                  {payslip.advanceOrOtherDeductionFcfa > 0 && (
                    <tr>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">Avances & Autres retenues</div>
                        {payslip.deductionDetails && (
                          <div className="text-xs text-slate-500">{payslip.deductionDetails}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">—</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">—</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-red-700 tabular-nums">
                        {formatFcfa(payslip.advanceOrOtherDeductionFcfa)}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-slate-900">
                    <td className="py-2.5 px-3" colSpan={3}>
                      Totaux Gains & Retenues
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                      {formatFcfa(payslip.grossPayFcfa)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-700">
                      {formatFcfa(totalDeductions)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Net a payer box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-[#0B1933] text-white rounded-xl p-5">
              <div>
                <div className="text-xs font-semibold text-[#E5A923] uppercase tracking-wider">
                  Salaire Net à payer
                </div>
                <div className="text-xs font-mono text-slate-200 mt-1 tabular-nums">
                  {payslip.regularHours} h × {formatFcfa(payslip.hourlyRateFcfa)}/h = {formatFcfa(payslip.basePayFcfa)}
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Mode de paiement : {payslip.paymentMethod}
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white tabular-nums">
                  {formatFcfa(payslip.netPayFcfa)}
                </div>
              </div>
            </div>

            {/* Signatures & Audit Footer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 text-xs text-slate-600">
              <div className="border border-slate-200 rounded-lg p-3.5 min-h-[76px] flex flex-col justify-between">
                <div className="font-semibold text-slate-800">Signature de l’enseignant</div>
                <div className="text-[11px] text-slate-400">
                  Pour acquit · {teacher.lastName} {teacher.firstName}
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3.5 min-h-[76px] flex flex-col justify-between">
                <div className="font-semibold text-slate-800">
                  Direction & Comptabilité · {settings.schoolName}
                </div>
                <div className="text-[11px] text-slate-500">
                  {payslip.paidAt
                    ? `Payé le ${formatDateTimeFr(payslip.paidAt)} par ${payslip.paidBy}`
                    : `Établi le ${formatDateFr(payslip.createdAt)} par ${payslip.createdBy}`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
