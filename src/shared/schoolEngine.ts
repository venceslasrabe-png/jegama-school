import type {
  AcademicYearArchive,
  ArchivedStudentRecord,
  ArchivedTeacherRecord,
  AttendanceLog,
  AuditLog,
  Bulletin,
  CollectionAutomationSettings,
  CollectionReminder,
  CycleHourlyRate,
  DashboardSummary,
  EvaluationPeriod,
  ParentTutor,
  PayslipPaymentMethod,
  ReminderChannel,
  ReminderStatus,
  SchoolDatabase,
  Student,
  StudentFollowUpPlan,
  StudentInstallmentBreakdown,
  StudentRecoveryProfile,
  Teacher,
  TeacherHourLog,
  TeacherPayslip,
  UserRole,
} from '../types';

export interface ActorContext {
  id: string;
  fullName: string;
  role: UserRole;
}

export function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoAtToday(hh: number, mm: number): string {
  const now = new Date();
  now.setHours(hh, mm, 0, 0);
  return now.toISOString();
}

function isoDaysAgo(days: number, hh: number, mm: number): { iso: string; dateStr: string } {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hh, mm, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { iso: d.toISOString(), dateStr: `${y}-${m}-${day}` };
}

export function getCurrentMonthStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabelFr(monthStr: string): string {
  const match = monthStr.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthStr;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const months = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ];
  return `${months[monthIdx] || match[2]} ${year}`;
}

export function createSeedHourlyRates(): CycleHourlyRate[] {
  return [
    {
      id: 'rate-mat-cg',
      cycle: 'Maternelle',
      program: 'Congolais',
      baseHourlyRateFcfa: 3500,
      overtimeHourlyRateFcfa: 4500,
      headTeacherMonthlyBonusFcfa: 20000,
    },
    {
      id: 'rate-pri-cg',
      cycle: 'Primaire',
      program: 'Congolais',
      baseHourlyRateFcfa: 4000,
      overtimeHourlyRateFcfa: 5000,
      headTeacherMonthlyBonusFcfa: 25000,
    },
    {
      id: 'rate-pri-fr',
      cycle: 'Primaire',
      program: 'Français',
      baseHourlyRateFcfa: 5000,
      overtimeHourlyRateFcfa: 6250,
      headTeacherMonthlyBonusFcfa: 30000,
    },
    {
      id: 'rate-col-cg',
      cycle: 'Collège',
      program: 'Congolais',
      baseHourlyRateFcfa: 5500,
      overtimeHourlyRateFcfa: 7000,
      headTeacherMonthlyBonusFcfa: 35000,
    },
    {
      id: 'rate-col-fr',
      cycle: 'Collège',
      program: 'Français',
      baseHourlyRateFcfa: 6500,
      overtimeHourlyRateFcfa: 8000,
      headTeacherMonthlyBonusFcfa: 40000,
    },
    {
      id: 'rate-lyg-cg',
      cycle: 'Lycée Général',
      program: 'Congolais',
      baseHourlyRateFcfa: 7000,
      overtimeHourlyRateFcfa: 8750,
      headTeacherMonthlyBonusFcfa: 40000,
    },
    {
      id: 'rate-lyg-fr',
      cycle: 'Lycée Général',
      program: 'Français',
      baseHourlyRateFcfa: 8000,
      overtimeHourlyRateFcfa: 10000,
      headTeacherMonthlyBonusFcfa: 45000,
    },
    {
      id: 'rate-lyt-cg',
      cycle: 'Lycée Technique',
      program: 'Congolais',
      baseHourlyRateFcfa: 7500,
      overtimeHourlyRateFcfa: 9500,
      headTeacherMonthlyBonusFcfa: 45000,
    },
  ];
}

export function createSeedTeachers(): Teacher[] {
  return [
    {
      id: 'tch-1',
      matricule: 'ENS-26-001',
      firstName: 'Sylvie',
      lastName: 'KOUBEMBA',
      gender: 'F',
      phone: '+242 06 621 14 08',
      email: 's.koubemba@jegama-school.cg',
      address: 'Mpita, Pointe-Noire',
      photoUrl: '',
      specialty: 'Éveil, Langage & Pré-écriture',
      diploma: 'Licence Sciences de l’Éducation',
      cycles: ['Maternelle'],
      programs: ['Congolais'],
      contractType: 'Permanent',
      hourlyRateFcfa: 3500,
      weeklyHoursQuota: 22,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: '2022-09-10',
      bankOrMobileAccount: 'MTN MoMo +242 06 621 14 08',
      status: 'actif',
    },
    {
      id: 'tch-2',
      matricule: 'ENS-26-002',
      firstName: 'Patrick',
      lastName: 'MAMPOUYA',
      gender: 'M',
      phone: '+242 05 512 88 30',
      email: 'p.mampouya@jegama-school.cg',
      address: 'Centre-ville, Pointe-Noire',
      photoUrl: '',
      specialty: 'Français & Mathématiques (CM2)',
      diploma: 'CAPES Enseignement Primaire',
      cycles: ['Primaire'],
      programs: ['Français', 'Congolais'],
      contractType: 'Permanent',
      hourlyRateFcfa: 5000,
      weeklyHoursQuota: 24,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: '2021-09-01',
      bankOrMobileAccount: 'BGFI Bank · CG04 0012 4481',
      status: 'actif',
    },
    {
      id: 'tch-3',
      matricule: 'ENS-26-003',
      firstName: 'Mireille',
      lastName: 'NKOUKA',
      gender: 'F',
      phone: '+242 06 845 33 19',
      email: 'm.nkouka@jegama-school.cg',
      address: 'Tié-Tié, Pointe-Noire',
      photoUrl: '',
      specialty: 'Français & Lettres Modernes',
      diploma: 'Master Lettres Modernes',
      cycles: ['Collège'],
      programs: ['Congolais'],
      contractType: 'Permanent',
      hourlyRateFcfa: 5500,
      weeklyHoursQuota: 18,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: '2023-09-05',
      bankOrMobileAccount: 'Airtel Money +242 05 845 33 19',
      status: 'actif',
    },
    {
      id: 'tch-4',
      matricule: 'ENS-26-004',
      firstName: 'Alain',
      lastName: 'MAKOSSO',
      gender: 'M',
      phone: '+242 06 702 54 61',
      email: 'a.makosso@jegama-school.cg',
      address: 'Côte Sauvage, Pointe-Noire',
      photoUrl: '',
      specialty: 'Mathématiques Spécialité',
      diploma: 'Master Mathématiques Appliquées',
      cycles: ['Lycée Général', 'Lycée Technique'],
      programs: ['Français', 'Congolais'],
      contractType: 'Permanent',
      hourlyRateFcfa: 8000,
      weeklyHoursQuota: 20,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: '2020-09-14',
      bankOrMobileAccount: 'Ecobank · CG08 7731 0092',
      status: 'actif',
    },
    {
      id: 'tch-5',
      matricule: 'ENS-26-005',
      firstName: 'Sandrine',
      lastName: 'BOUANGA',
      gender: 'F',
      phone: '+242 06 519 77 42',
      email: 's.bouanga@jegama-school.cg',
      address: 'Loandjili, Pointe-Noire',
      photoUrl: '',
      specialty: 'Physique-Chimie',
      diploma: 'Master Physique des Matériaux',
      cycles: ['Lycée Général', 'Lycée Technique'],
      programs: ['Français', 'Congolais'],
      contractType: 'Contractuel',
      hourlyRateFcfa: 7500,
      weeklyHoursQuota: 16,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: '2024-09-09',
      bankOrMobileAccount: 'MTN MoMo +242 06 519 77 42',
      status: 'actif',
    },
    {
      id: 'tch-6',
      matricule: 'ENS-26-006',
      firstName: 'Thierry',
      lastName: 'SAMBA',
      gender: 'M',
      phone: '+242 06 901 23 11',
      email: 't.samba@jegama-school.cg',
      address: 'Mpita-Wharf, Pointe-Noire',
      photoUrl: '',
      specialty: 'Électronique Appliquée & Automatismes',
      diploma: 'Ingénieur Génie Électrique',
      cycles: ['Lycée Technique'],
      programs: ['Congolais'],
      contractType: 'Permanent',
      hourlyRateFcfa: 7500,
      weeklyHoursQuota: 18,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: '2021-10-01',
      bankOrMobileAccount: 'BGFI Bank · CG04 9981 2015',
      status: 'actif',
    },
    {
      id: 'tch-7',
      matricule: 'ENS-26-007',
      firstName: 'David',
      lastName: 'OKO',
      gender: 'M',
      phone: '+242 05 614 09 75',
      email: 'd.oko@jegama-school.cg',
      address: 'Tchibamba, Pointe-Noire',
      photoUrl: '',
      specialty: 'Anglais LV1',
      diploma: 'Licence Langues Étrangères Appliquées',
      cycles: ['Collège', 'Lycée Général'],
      programs: ['Congolais', 'Français'],
      contractType: 'Vacataire',
      hourlyRateFcfa: 6500,
      weeklyHoursQuota: 12,
      baseBonusFcfa: 0,
      cnssRatePercent: 0,
      hireDate: '2025-09-15',
      bankOrMobileAccount: 'Airtel Money +242 05 614 09 75',
      status: 'actif',
    },
  ];
}

export function getTeacherCumulativeHours(
  logs: TeacherHourLog[],
  teacherId: string,
  month: string
): number {
  const total = logs
    .filter((l) => l.teacherId === teacherId && l.month === month)
    .reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
  return Math.round(total * 100) / 100;
}

export function createSeedTeacherHourLogs(teachers: Teacher[]): TeacherHourLog[] {
  const month = getCurrentMonthStr();
  const createdAt = isoDaysAgo(2, 12, 0).iso;
  const logs: TeacherHourLog[] = [];
  const sampleDays = ['03', '07', '11', '15'];
  const extraHours = [2, 4, 0, 6, 2, 4, 0];

  teachers.forEach((teacher, idx) => {
    const classLabel = `${teacher.cycles[0] || 'Cours'} · ${teacher.specialty.split('&')[0].trim()}`;
    sampleDays.forEach((day, wIdx) => {
      logs.push({
        id: `hlog-${idx + 1}-w${wIdx + 1}`,
        teacherId: teacher.id,
        month,
        date: `${month}-${day}`,
        hours: teacher.weeklyHoursQuota,
        classOrSubject: classLabel,
        notes: `Semaine ${wIdx + 1} · Cours assurés`,
        recordedBy: 'Mme Nadège Moukoko',
        createdAt,
      });
    });

    const extra = extraHours[idx] || 0;
    if (extra > 0) {
      logs.push({
        id: `hlog-${idx + 1}-extra`,
        teacherId: teacher.id,
        month,
        date: `${month}-18`,
        hours: extra,
        classOrSubject: classLabel,
        notes: 'Séance de renforcement / TP',
        recordedBy: 'Mme Nadège Moukoko',
        createdAt,
      });
    }
  });

  return logs;
}

export function buildTeacherPayslip(params: {
  id: string;
  payslipNumber: string;
  teacher: Teacher;
  month: string;
  academicYear: string;
  regularHours: number;
  overtimeHours?: number;
  hourlyRateFcfa?: number;
  overtimeRateFcfa?: number;
  bonusesFcfa?: number;
  bonusDetails?: string;
  cnssRatePercent?: number;
  advanceOrOtherDeductionFcfa?: number;
  deductionDetails?: string;
  paymentMethod?: PayslipPaymentMethod;
  status?: TeacherPayslip['status'];
  createdBy: string;
  createdAt?: string;
  paidAt?: string | null;
  paidBy?: string | null;
}): TeacherPayslip {
  const regularHours = Math.max(0, Number(params.regularHours) || 0);
  const overtimeHours = Math.max(0, Number(params.overtimeHours) || 0);
  const hourlyRateFcfa = Math.max(0, Number(params.hourlyRateFcfa ?? params.teacher.hourlyRateFcfa) || 0);
  const overtimeRateFcfa = Math.max(
    0,
    Number(params.overtimeRateFcfa ?? hourlyRateFcfa) || 0
  );
  const basePayFcfa = Math.round(regularHours * hourlyRateFcfa);
  const overtimePayFcfa = Math.round(overtimeHours * overtimeRateFcfa);
  const bonusesFcfa = Math.max(0, Number(params.bonusesFcfa ?? 0) || 0);
  const grossPayFcfa = basePayFcfa + overtimePayFcfa + bonusesFcfa;

  const cnssRate = Number(params.cnssRatePercent ?? 0) || 0;
  const cnssDeductionFcfa = Math.round((grossPayFcfa * Math.max(0, cnssRate)) / 100);
  const advanceOrOtherDeductionFcfa = Math.max(
    0,
    Number(params.advanceOrOtherDeductionFcfa) || 0
  );
  const netPayFcfa = Math.max(0, grossPayFcfa - cnssDeductionFcfa - advanceOrOtherDeductionFcfa);

  return {
    id: params.id,
    payslipNumber: params.payslipNumber,
    teacherId: params.teacher.id,
    month: params.month,
    periodLabel: formatMonthLabelFr(params.month),
    academicYear: params.academicYear,
    regularHours,
    overtimeHours,
    hourlyRateFcfa,
    overtimeRateFcfa,
    basePayFcfa,
    overtimePayFcfa,
    bonusesFcfa,
    bonusDetails:
      (params.bonusDetails ?? (bonusesFcfa > 0 ? 'Prime / Indemnité' : '')).trim(),
    grossPayFcfa,
    cnssDeductionFcfa,
    advanceOrOtherDeductionFcfa,
    deductionDetails: (params.deductionDetails || '').trim(),
    netPayFcfa,
    paymentMethod: params.paymentMethod || 'Virement',
    status: params.status || 'valide',
    createdAt: params.createdAt || new Date().toISOString(),
    createdBy: params.createdBy,
    paidAt: params.paidAt ?? null,
    paidBy: params.paidBy ?? null,
  };
}

export function createSeedTeacherPayslips(
  teachers: Teacher[],
  hourLogs: TeacherHourLog[] = []
): TeacherPayslip[] {
  const month = getCurrentMonthStr();
  const createdAt = isoDaysAgo(2, 14, 0).iso;
  const paidAt = isoDaysAgo(1, 10, 30).iso;
  const specs: Array<{ idx: number; status: TeacherPayslip['status']; method: PayslipPaymentMethod }> = [
    { idx: 0, status: 'paye', method: 'Mobile Money' },
    { idx: 1, status: 'paye', method: 'Virement' },
    { idx: 2, status: 'paye', method: 'Mobile Money' },
    { idx: 3, status: 'valide', method: 'Virement' },
    { idx: 4, status: 'valide', method: 'Mobile Money' },
    { idx: 5, status: 'paye', method: 'Virement' },
    { idx: 6, status: 'brouillon', method: 'Espèces' },
  ];

  const list: TeacherPayslip[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const teacher = teachers[s.idx];
    if (!teacher) continue;
    const cumulHours =
      hourLogs.length > 0
        ? getTeacherCumulativeHours(hourLogs, teacher.id, month)
        : teacher.weeklyHoursQuota * 4;
    list.push(
      buildTeacherPayslip({
        id: `pay-tch-${i + 1}`,
        payslipNumber: `PAIE-2026-${String(i + 1).padStart(4, '0')}`,
        teacher,
        month,
        academicYear: '2026-2027',
        regularHours: cumulHours > 0 ? cumulHours : teacher.weeklyHoursQuota * 4,
        overtimeHours: 0,
        bonusesFcfa: 0,
        cnssRatePercent: 0,
        paymentMethod: s.method,
        status: s.status,
        createdBy: 'Mme Nadège Moukoko',
        createdAt,
        paidAt: s.status === 'paye' ? paidAt : null,
        paidBy: s.status === 'paye' ? 'M. Brice Loubaki' : null,
      })
    );
  }
  return list;
}

export function ensureTeacherSeedData(db: SchoolDatabase): SchoolDatabase {
  if (!Array.isArray(db.hourlyRates) || db.hourlyRates.length === 0) {
    db.hourlyRates = createSeedHourlyRates();
  }
  if (!Array.isArray(db.teachers) || db.teachers.length === 0) {
    db.teachers = createSeedTeachers();
  }
  const hadHourLogs = Array.isArray(db.teacherHourLogs);
  if (!hadHourLogs) {
    db.teacherHourLogs = createSeedTeacherHourLogs(db.teachers);
  }
  if (!Array.isArray(db.teacherPayslips)) {
    db.teacherPayslips = createSeedTeacherPayslips(db.teachers, db.teacherHourLogs);
  } else if (!hadHourLogs) {
    // Align initial seed payslips cleanly with cumul * hourlyRate formula on first migration
    db.teacherPayslips = db.teacherPayslips.map((slip) => {
      if (!slip.id.startsWith('pay-tch-')) return slip;
      const t = db.teachers.find((item) => item.id === slip.teacherId);
      if (!t) return slip;
      const cumul = getTeacherCumulativeHours(db.teacherHourLogs, t.id, slip.month);
      const totalHours = cumul > 0 ? cumul : slip.regularHours + slip.overtimeHours;
      return buildTeacherPayslip({
        id: slip.id,
        payslipNumber: slip.payslipNumber,
        teacher: t,
        month: slip.month,
        academicYear: slip.academicYear,
        regularHours: totalHours,
        overtimeHours: 0,
        hourlyRateFcfa: t.hourlyRateFcfa,
        bonusesFcfa: 0,
        cnssRatePercent: 0,
        advanceOrOtherDeductionFcfa: 0,
        paymentMethod: slip.paymentMethod,
        status: slip.status,
        createdBy: slip.createdBy,
        createdAt: slip.createdAt,
        paidAt: slip.paidAt,
        paidBy: slip.paidBy,
      });
    });
  }
  if (!db.counters) {
    db.counters = { cardSeq: 8, receiptSeq: 6, teacherSeq: db.teachers.length, payslipSeq: db.teacherPayslips.length };
  }
  if (typeof db.counters.teacherSeq !== 'number') {
    db.counters.teacherSeq = db.teachers.length;
  }
  if (typeof db.counters.payslipSeq !== 'number') {
    db.counters.payslipSeq = db.teacherPayslips.length;
  }
  return db;
}

export function createSeedPreviousArchives(): AcademicYearArchive[] {
  const archive2025Records: ArchivedStudentRecord[] = [
    {
      cardId: 'JS-25-0001',
      fullName: 'MAKOSSO Chloé',
      gender: 'F',
      cycle: 'Primaire',
      program: 'Français',
      className: 'CM1 A',
      parentName: 'M. Bienvenu Makosso',
      parentPhone: '+242 06 612 45 89',
      totalExpectedFcfa: 480000,
      totalPaidFcfa: 480000,
      balanceRemainingFcfa: 0,
      generalAverage: 16.4,
      rank: 1,
      mention: 'Très bien',
      absencesCount: 0,
      latesCount: 1,
    },
    {
      cardId: 'JS-25-0002',
      fullName: 'TCHICAYA Kévin',
      gender: 'M',
      cycle: 'Lycée Général',
      program: 'Français',
      className: '2nde S',
      parentName: 'Mme Hortense Tchicaya',
      parentPhone: '+242 05 534 19 22',
      totalExpectedFcfa: 750000,
      totalPaidFcfa: 750000,
      balanceRemainingFcfa: 0,
      generalAverage: 14.55,
      rank: 2,
      mention: 'Bien',
      absencesCount: 1,
      latesCount: 2,
    },
    {
      cardId: 'JS-25-0003',
      fullName: 'MAKOSSO Grace',
      gender: 'F',
      cycle: 'Collège',
      program: 'Congolais',
      className: '5ème A',
      parentName: 'M. Bienvenu Makosso',
      parentPhone: '+242 06 612 45 89',
      totalExpectedFcfa: 350000,
      totalPaidFcfa: 350000,
      balanceRemainingFcfa: 0,
      generalAverage: 13.8,
      rank: 4,
      mention: 'Assez bien',
      absencesCount: 0,
      latesCount: 0,
    },
    {
      cardId: 'JS-25-0004',
      fullName: 'LOUBAKI Samuel',
      gender: 'M',
      cycle: 'Lycée Technique',
      program: 'Congolais',
      className: '1ère F2',
      parentName: 'M. Arsène Loubaki',
      parentPhone: '+242 06 811 22 40',
      totalExpectedFcfa: 495000,
      totalPaidFcfa: 495000,
      balanceRemainingFcfa: 0,
      generalAverage: 15.1,
      rank: 1,
      mention: 'Bien',
      absencesCount: 0,
      latesCount: 1,
    },
    {
      cardId: 'JS-25-0005',
      fullName: 'MOUKOKO Prisca',
      gender: 'F',
      cycle: 'Collège',
      program: 'Congolais',
      className: '5ème A',
      parentName: 'M. Patrick Ngoma',
      parentPhone: '+242 06 701 33 15',
      totalExpectedFcfa: 350000,
      totalPaidFcfa: 320000,
      balanceRemainingFcfa: 30000,
      generalAverage: 12.6,
      rank: 8,
      mention: 'Assez bien',
      absencesCount: 2,
      latesCount: 1,
    },
  ];

  const archive2025Teachers: ArchivedTeacherRecord[] = [
    {
      matricule: 'ENS-25-001',
      fullName: 'MOUANDA Jean-Claude',
      specialty: 'Mathématiques',
      contractType: 'Permanent',
      cycles: 'Collège, Lycée Général',
      hourlyRateFcfa: 6500,
      totalHours: 640,
      totalPaidFcfa: 4160000,
    },
    {
      matricule: 'ENS-25-002',
      fullName: 'MALONGA Solange',
      specialty: 'Français & Littérature',
      contractType: 'Permanent',
      cycles: 'Primaire, Collège',
      hourlyRateFcfa: 5500,
      totalHours: 600,
      totalPaidFcfa: 3300000,
    },
    {
      matricule: 'ENS-25-003',
      fullName: 'NGOUABI Serge',
      specialty: 'Sciences Physiques & Électrotechnique',
      contractType: 'Contractuel',
      cycles: 'Lycée Technique, Lycée Général',
      hourlyRateFcfa: 7500,
      totalHours: 580,
      totalPaidFcfa: 4350000,
    },
  ];

  const archive2024Records: ArchivedStudentRecord[] = [
    {
      cardId: 'JS-24-0001',
      fullName: 'MAKOSSO Chloé',
      gender: 'F',
      cycle: 'Primaire',
      program: 'Français',
      className: 'CE2 A',
      parentName: 'M. Bienvenu Makosso',
      parentPhone: '+242 06 612 45 89',
      totalExpectedFcfa: 460000,
      totalPaidFcfa: 460000,
      balanceRemainingFcfa: 0,
      generalAverage: 15.9,
      rank: 1,
      mention: 'Bien',
      absencesCount: 1,
      latesCount: 0,
    },
    {
      cardId: 'JS-24-0002',
      fullName: 'TCHICAYA Kévin',
      gender: 'M',
      cycle: 'Collège',
      program: 'Français',
      className: '3ème A',
      parentName: 'Mme Hortense Tchicaya',
      parentPhone: '+242 05 534 19 22',
      totalExpectedFcfa: 620000,
      totalPaidFcfa: 620000,
      balanceRemainingFcfa: 0,
      generalAverage: 14.1,
      rank: 3,
      mention: 'Bien',
      absencesCount: 0,
      latesCount: 2,
    },
    {
      cardId: 'JS-24-0003',
      fullName: 'LOUBAKI Samuel',
      gender: 'M',
      cycle: 'Lycée Technique',
      program: 'Congolais',
      className: '2nde F2',
      parentName: 'M. Arsène Loubaki',
      parentPhone: '+242 06 811 22 40',
      totalExpectedFcfa: 475000,
      totalPaidFcfa: 475000,
      balanceRemainingFcfa: 0,
      generalAverage: 14.75,
      rank: 2,
      mention: 'Bien',
      absencesCount: 1,
      latesCount: 1,
    },
  ];

  const archive2024Teachers: ArchivedTeacherRecord[] = [
    {
      matricule: 'ENS-24-001',
      fullName: 'MOUANDA Jean-Claude',
      specialty: 'Mathématiques',
      contractType: 'Permanent',
      cycles: 'Collège, Lycée Général',
      hourlyRateFcfa: 6000,
      totalHours: 610,
      totalPaidFcfa: 3660000,
    },
    {
      matricule: 'ENS-24-002',
      fullName: 'MALONGA Solange',
      specialty: 'Français & Littérature',
      contractType: 'Permanent',
      cycles: 'Primaire, Collège',
      hourlyRateFcfa: 5000,
      totalHours: 590,
      totalPaidFcfa: 2950000,
    },
  ];

  return [
    {
      id: 'arch-seed-2025-2026',
      academicYear: '2025-2026',
      archivedAt: '2026-07-10T16:30:00.000Z',
      archivedBy: 'M. Arsène Ngakala',
      source: 'cloture',
      notes: 'Clôture officielle de l’année académique 2025-2026 — dossiers élèves, scolarité et masse salariale.',
      summary: {
        totalStudents: archive2025Records.length,
        totalExpectedFcfa: archive2025Records.reduce((s, r) => s + r.totalExpectedFcfa, 0),
        totalCollectedFcfa: archive2025Records.reduce((s, r) => s + r.totalPaidFcfa, 0),
        bulletinsCount: archive2025Records.length,
        averageScore: 14.49,
        attendanceLogsCount: 8,
        totalTeachers: archive2025Teachers.length,
        totalTeacherHours: archive2025Teachers.reduce((s, t) => s + t.totalHours, 0),
        totalPayrollFcfa: archive2025Teachers.reduce((s, t) => s + t.totalPaidFcfa, 0),
      },
      records: archive2025Records,
      teacherRecords: archive2025Teachers,
    },
    {
      id: 'arch-seed-2024-2025',
      academicYear: '2024-2025',
      archivedAt: '2025-07-12T15:00:00.000Z',
      archivedBy: 'M. Arsène Ngakala',
      source: 'import_excel',
      sourceFileName: 'archive-jegama-2024-2025.xlsx',
      notes: 'Archive historique 2024-2025 importée depuis le registre Excel de l’établissement.',
      summary: {
        totalStudents: archive2024Records.length,
        totalExpectedFcfa: archive2024Records.reduce((s, r) => s + r.totalExpectedFcfa, 0),
        totalCollectedFcfa: archive2024Records.reduce((s, r) => s + r.totalPaidFcfa, 0),
        bulletinsCount: archive2024Records.length,
        averageScore: 14.92,
        attendanceLogsCount: 5,
        totalTeachers: archive2024Teachers.length,
        totalTeacherHours: archive2024Teachers.reduce((s, t) => s + t.totalHours, 0),
        totalPayrollFcfa: archive2024Teachers.reduce((s, t) => s + t.totalPaidFcfa, 0),
      },
      records: archive2024Records,
      teacherRecords: archive2024Teachers,
    },
  ];
}

export function ensureArchiveSeedData(db: SchoolDatabase): SchoolDatabase {
  if (!Array.isArray(db.archivedYears)) {
    db.archivedYears = [];
  }
  if (!db.counters) {
    db.counters = { cardSeq: 8, receiptSeq: 6 };
  }
  if (db.archivedYears.length === 0 && !db.counters.archivesSeeded) {
    db.archivedYears = createSeedPreviousArchives();
    db.counters.archivesSeeded = true;
  } else if (db.archivedYears.length > 0 && !db.counters.archivesSeeded) {
    db.counters.archivesSeeded = true;
  }
  return db;
}

export function ensureGradeWorkflowData(db: SchoolDatabase): SchoolDatabase {
  if (!Array.isArray(db.users)) {
    db.users = [];
  }
  const hasTeacherUser = db.users.some((u) => u.role === 'enseignant');
  if (!hasTeacherUser) {
    db.users.unshift({
      id: 'usr-ens',
      username: 'enseignant',
      fullName: 'M. Alain Makosso',
      role: 'enseignant',
      password: 'jegama2026',
      active: true,
      lastLogin: isoDaysAgo(0, 8, 25).iso,
    });
  }

  if (!Array.isArray(db.grades)) {
    db.grades = [];
  }

  // Normalize legacy grades without validationStatus to 'valide'
  for (const g of db.grades) {
    if (!g.validationStatus) {
      g.validationStatus = 'valide';
      g.submittedAt = g.submittedAt || g.updatedAt;
      g.submittedBy = g.submittedBy || g.updatedBy;
      g.validatedAt = g.validatedAt || g.updatedAt;
      g.validatedBy = g.validatedBy || 'Mme Clarisse Mavoungou';
      g.rejectionReason = null;
    }
  }

  if (!db.counters) {
    db.counters = { cardSeq: 8, receiptSeq: 6 };
  }

  if (!db.counters.gradeWorkflowSeeded) {
    db.counters.gradeWorkflowSeeded = true;
    const hasT2 = db.periods?.some((p) => p.id === 'per-t2');
    const hasAnyPending = db.grades.some((g) => g.validationStatus === 'en_attente');
    if (hasT2 && !hasAnyPending) {
      const submittedAt = isoDaysAgo(0, 9, 15).iso;
      const samples: Array<{
        id: string;
        studentId: string;
        subjectId: string;
        periodId: string;
        values: number[];
        average: number;
        teacherAppreciation: string;
        submittedBy: string;
      }> = [
        {
          id: 'grd-t2-1',
          studentId: 'stu-1',
          subjectId: 'sub-pri-mat',
          periodId: 'per-t2',
          values: [16, 17],
          average: 16.5,
          teacherAppreciation: 'Très bonne progression en géométrie.',
          submittedBy: 'M. Patrick Mampouya',
        },
        {
          id: 'grd-t2-2',
          studentId: 'stu-6',
          subjectId: 'sub-pri-mat',
          periodId: 'per-t2',
          values: [13.5, 14.5],
          average: 14,
          teacherAppreciation: 'Bon travail, en nette hausse.',
          submittedBy: 'M. Patrick Mampouya',
        },
        {
          id: 'grd-t2-3',
          studentId: 'stu-2',
          subjectId: 'sub-lyg-mat',
          periodId: 'per-t2',
          values: [15.5, 16],
          average: 15.75,
          teacherAppreciation: 'Excellente maîtrise de l’analyse.',
          submittedBy: 'M. Alain Makosso',
        },
      ];

      for (const s of samples) {
        const exists = db.grades.some(
          (g) =>
            g.studentId === s.studentId &&
            g.subjectId === s.subjectId &&
            g.periodId === s.periodId
        );
        if (!exists && db.students.some((st) => st.id === s.studentId)) {
          db.grades.push({
            id: s.id,
            studentId: s.studentId,
            subjectId: s.subjectId,
            periodId: s.periodId,
            values: s.values,
            average: s.average,
            teacherAppreciation: s.teacherAppreciation,
            updatedAt: submittedAt,
            updatedBy: s.submittedBy,
            validationStatus: 'en_attente',
            submittedAt,
            submittedBy: s.submittedBy,
            validatedAt: null,
            validatedBy: null,
            rejectionReason: null,
          });
        }
      }
    }
  }

  return db;
}

export function getDefaultCollectionAutomation(): CollectionAutomationSettings {
  return {
    autoNotifyOnOverdue: true,
    primaryChannel: 'whatsapp_et_email',
    followUpDelayDays: 3,
    maxAutoReminders: 3,
    lastAutoRunAt: null,
  };
}

export function createSeedCollectionReminders(): CollectionReminder[] {
  return [
    {
      id: 'rem-seed-1',
      studentId: 'stu-6',
      parentId: 'par-2',
      channel: 'SMS / WhatsApp',
      status: 'relance_1',
      amountDueFcfa: 480000,
      overdueFcfa: 200000,
      promisedDate: null,
      notes: '1er avis de retard envoyé par WhatsApp à Mme Hortense Tchicaya (1ère tranche échue le 15/09/2026).',
      sentAt: isoDaysAgo(5, 10, 30).iso,
      sentBy: 'M. Brice Loubaki',
      recipientContact: '+242 05 534 19 22',
      deliveryState: 'envoye',
      isAutomatic: true,
      sequenceStep: 1,
      nextFollowUpAt: isoDaysAgo(2, 10, 30).iso,
      messageBody:
        'Bonjour Mme Hortense Tchicaya, JEGAMA SCHOOL vous informe que la 1ère tranche de scolarité de Merveille BANZOUZI (JS-26-0006) présente un retard de 200 000 FCFA. Merci de régulariser sous 3 jours.',
    },
    {
      id: 'rem-seed-2',
      studentId: 'stu-8',
      parentId: 'par-4',
      channel: 'Courrier / Convocation',
      status: 'moratoire',
      amountDueFcfa: 750000,
      overdueFcfa: 310000,
      promisedDate: isoDaysAgo(-7, 12, 0).dateStr,
      notes: 'Accord de moratoire signé avec Mme Eugénie Loubaki pour régularisation de l’inscription et 1ère tranche.',
      sentAt: isoDaysAgo(3, 14, 15).iso,
      sentBy: 'Mme Clarisse Mavoungou',
      recipientContact: '+242 06 441 72 15',
      deliveryState: 'envoye',
      isAutomatic: false,
      sequenceStep: 1,
      nextFollowUpAt: null,
    },
  ];
}

export function ensureRecouvrementData(db: SchoolDatabase): SchoolDatabase {
  if (!Array.isArray(db.collectionReminders)) {
    db.collectionReminders = [];
  }
  if (!db.settings.collectionAutomation) {
    db.settings.collectionAutomation = getDefaultCollectionAutomation();
  }
  const seedEmails: Record<string, string> = {
    'par-1': 'bienvenu.makosso@exemple.cg',
    'par-2': 'hortense.tchicaya@exemple.cg',
    'par-3': 'dieudonne.ngoma@exemple.cg',
    'par-4': 'eugenie.loubaki@exemple.cg',
  };
  if (Array.isArray(db.parents)) {
    for (const p of db.parents) {
      if (!p.email && seedEmails[p.id]) {
        p.email = seedEmails[p.id];
      }
    }
  }
  if (!db.counters) {
    db.counters = { cardSeq: 8, receiptSeq: 6 };
  }
  if (!db.counters.collectionRemindersSeeded) {
    db.counters.collectionRemindersSeeded = true;
    if (db.collectionReminders.length === 0 && Array.isArray(db.students) && db.students.some((s) => s.id === 'stu-6')) {
      db.collectionReminders = createSeedCollectionReminders();
    }
  }
  return db;
}

export function createSeedDatabase(): SchoolDatabase {
  const today = getTodayStr();
  const y1 = isoDaysAgo(1, 7, 25);
  const y1Out = isoDaysAgo(1, 13, 5);
  const y2 = isoDaysAgo(2, 7, 38);
  const y2Out = isoDaysAgo(2, 13, 10);
  const seedTeachers = createSeedTeachers();
  const seedHourLogs = createSeedTeacherHourLogs(seedTeachers);
  const seedPayslips = createSeedTeacherPayslips(seedTeachers, seedHourLogs);

  return {
    settings: {
      schoolName: 'JEGAMA SCHOOL',
      address: 'Mpita-Wharf',
      city: 'Pointe-Noire',
      country: 'République du Congo',
      currentAcademicYear: '2026-2027',
      periodMode: 'Trimestres',
      parentRequireSecretCode: false,
      maxParentLoginAttempts: 3,
      mentionThresholds: [
        { label: 'Très bien', minScore: 16 },
        { label: 'Bien', minScore: 14 },
        { label: 'Assez bien', minScore: 12 },
        { label: 'Passable', minScore: 10 },
        { label: 'Insuffisant', minScore: 0 },
      ],
      lastBackupAt: new Date(Date.now() - 86400000).toISOString(),
      collectionAutomation: getDefaultCollectionAutomation(),
    },
    users: [
      {
        id: 'usr-ens',
        username: 'enseignant',
        fullName: 'M. Alain Makosso',
        role: 'enseignant',
        password: 'jegama2026',
        active: true,
        lastLogin: isoDaysAgo(0, 8, 25).iso,
      },
      {
        id: 'usr-sco',
        username: 'scolarite',
        fullName: 'Mme Clarisse Mavoungou',
        role: 'scolarite',
        password: 'jegama2026',
        active: true,
        lastLogin: isoDaysAgo(0, 8, 5).iso,
      },
      {
        id: 'usr-cai',
        username: 'caisse',
        fullName: 'M. Brice Loubaki',
        role: 'caisse',
        password: 'jegama2026',
        active: true,
        lastLogin: isoDaysAgo(0, 8, 12).iso,
      },
      {
        id: 'usr-sec',
        username: 'secretariat',
        fullName: 'Mme Nadège Moukoko',
        role: 'secretariat',
        password: 'jegama2026',
        active: true,
        lastLogin: isoDaysAgo(0, 7, 50).iso,
      },
      {
        id: 'usr-sur',
        username: 'guerite',
        fullName: 'M. Rodrigue Ngoma',
        role: 'surveillant',
        password: 'jegama2026',
        active: true,
        lastLogin: isoDaysAgo(0, 6, 45).iso,
      },
      {
        id: 'usr-dir',
        username: 'direction',
        fullName: 'M. Jean-Baptiste Tchicaya',
        role: 'direction',
        password: 'jegama2026',
        active: true,
        lastLogin: isoDaysAgo(1, 10, 30).iso,
      },
      {
        id: 'usr-adm',
        username: 'admin',
        fullName: 'M. Arsène Banzouzi',
        role: 'admin',
        password: 'jegama2026',
        active: true,
        lastLogin: isoDaysAgo(0, 7, 15).iso,
      },
    ],
    periods: [
      {
        id: 'per-t1',
        label: 'Trimestre 1',
        academicYear: '2026-2027',
        startDate: '2026-09-14',
        endDate: '2026-12-18',
        status: 'verrouille',
        validatedAt: isoDaysAgo(2, 16, 0).iso,
        validatedBy: 'M. Jean-Baptiste Tchicaya',
      },
      {
        id: 'per-t2',
        label: 'Trimestre 2',
        academicYear: '2026-2027',
        startDate: '2027-01-05',
        endDate: '2027-03-27',
        status: 'ouvert',
        validatedAt: null,
        validatedBy: null,
      },
      {
        id: 'per-t3',
        label: 'Trimestre 3',
        academicYear: '2026-2027',
        startDate: '2027-04-12',
        endDate: '2027-06-30',
        status: 'ouvert',
        validatedAt: null,
        validatedBy: null,
      },
    ],
    feeGrid: [
      {
        id: 'fee-mat-cg',
        cycle: 'Maternelle',
        program: 'Congolais',
        registrationFee: 35000,
        annualTuition: 180000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 95000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 60000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 60000, dueDate: '2027-04-15' },
        ],
      },
      {
        id: 'fee-pri-cg',
        cycle: 'Primaire',
        program: 'Congolais',
        registrationFee: 40000,
        annualTuition: 225000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 115000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 75000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 75000, dueDate: '2027-04-15' },
        ],
      },
      {
        id: 'fee-pri-fr',
        cycle: 'Primaire',
        program: 'Français',
        registrationFee: 60000,
        annualTuition: 420000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 200000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 140000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 140000, dueDate: '2027-04-15' },
        ],
      },
      {
        id: 'fee-col-cg',
        cycle: 'Collège',
        program: 'Congolais',
        registrationFee: 45000,
        annualTuition: 270000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 135000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 90000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 90000, dueDate: '2027-04-15' },
        ],
      },
      {
        id: 'fee-col-fr',
        cycle: 'Collège',
        program: 'Français',
        registrationFee: 75000,
        annualTuition: 540000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 255000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 180000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 180000, dueDate: '2027-04-15' },
        ],
      },
      {
        id: 'fee-lyg-cg',
        cycle: 'Lycée Général',
        program: 'Congolais',
        registrationFee: 50000,
        annualTuition: 330000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 160000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 110000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 110000, dueDate: '2027-04-15' },
        ],
      },
      {
        id: 'fee-lyt-cg',
        cycle: 'Lycée Technique',
        program: 'Congolais',
        registrationFee: 55000,
        annualTuition: 360000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 175000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 120000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 120000, dueDate: '2027-04-15' },
        ],
      },
      {
        id: 'fee-lyg-fr',
        cycle: 'Lycée Général',
        program: 'Français',
        registrationFee: 90000,
        annualTuition: 660000,
        installments: [
          { label: 'Inscription + 1ère Tranche', amount: 310000, dueDate: '2026-09-15' },
          { label: '2ème Tranche', amount: 220000, dueDate: '2027-01-10' },
          { label: '3ème Tranche', amount: 220000, dueDate: '2027-04-15' },
        ],
      },
    ],
    classes: [
      {
        id: 'cls-gs',
        name: 'Grande Section',
        cycle: 'Maternelle',
        program: 'Congolais',
        room: 'Pavillon A · Salle 01',
        capacity: 25,
        headTeacher: 'Mme Sylvie Koubemba',
      },
      {
        id: 'cls-cm2',
        name: 'CM2 A',
        cycle: 'Primaire',
        program: 'Français',
        room: 'Bâtiment B · Salle 04',
        capacity: 30,
        headTeacher: 'M. Patrick Mampouya',
      },
      {
        id: 'cls-4eme',
        name: '4ème B',
        cycle: 'Collège',
        program: 'Congolais',
        room: 'Bâtiment C · Salle 11',
        capacity: 35,
        headTeacher: 'Mme Mireille Nkouka',
      },
      {
        id: 'cls-1ere-s',
        name: '1ère S',
        cycle: 'Lycée Général',
        program: 'Français',
        room: 'Bâtiment D · Salle 22',
        capacity: 32,
        headTeacher: 'M. Alain Makosso',
      },
      {
        id: 'cls-tle-f2',
        name: 'Terminale F2',
        cycle: 'Lycée Technique',
        program: 'Congolais',
        room: 'Atelier Électronique · Labo 2',
        capacity: 28,
        headTeacher: 'Ing. Thierry Samba',
      },
    ],
    subjects: [
      { id: 'sub-mat-lang', code: 'LAN', name: 'Langage & Éveil', cycle: 'Maternelle', program: 'Congolais', coefficient: 2, teacherName: 'Mme Sylvie Koubemba' },
      { id: 'sub-mat-graph', code: 'GRA', name: 'Graphisme & Pré-écriture', cycle: 'Maternelle', program: 'Congolais', coefficient: 2, teacherName: 'Mme Sylvie Koubemba' },
      { id: 'sub-mat-log', code: 'LOG', name: 'Logique & Calcul', cycle: 'Maternelle', program: 'Congolais', coefficient: 2, teacherName: 'Mme Sylvie Koubemba' },

      { id: 'sub-pri-fr', code: 'FRA', name: 'Français & Rédaction', cycle: 'Primaire', program: 'Français', coefficient: 4, teacherName: 'M. Patrick Mampouya' },
      { id: 'sub-pri-mat', code: 'MAT', name: 'Mathématiques', cycle: 'Primaire', program: 'Français', coefficient: 4, teacherName: 'M. Patrick Mampouya' },
      { id: 'sub-pri-hg', code: 'HGE', name: 'Histoire-Géographie', cycle: 'Primaire', program: 'Français', coefficient: 2, teacherName: 'Mme Carole Bakala' },
      { id: 'sub-pri-sci', code: 'SVT', name: 'Sciences & Technologie', cycle: 'Primaire', program: 'Français', coefficient: 2, teacherName: 'M. Patrick Mampouya' },

      { id: 'sub-col-mat', code: 'MAT', name: 'Mathématiques', cycle: 'Collège', program: 'Congolais', coefficient: 4, teacherName: 'M. Hervé Kengue' },
      { id: 'sub-col-fr', code: 'FRA', name: 'Français', cycle: 'Collège', program: 'Congolais', coefficient: 4, teacherName: 'Mme Mireille Nkouka' },
      { id: 'sub-col-ang', code: 'ANG', name: 'Anglais', cycle: 'Collège', program: 'Congolais', coefficient: 2, teacherName: 'M. David Oko' },
      { id: 'sub-col-pc', code: 'PHY', name: 'Physique-Chimie', cycle: 'Collège', program: 'Congolais', coefficient: 3, teacherName: 'Mme Chantal Mbemba' },
      { id: 'sub-col-hg', code: 'HGE', name: 'Histoire-Géographie', cycle: 'Collège', program: 'Congolais', coefficient: 2, teacherName: 'M. Serge Ngatsono' },

      { id: 'sub-lyg-mat', code: 'MAT', name: 'Mathématiques Spécialité', cycle: 'Lycée Général', program: 'Français', coefficient: 5, teacherName: 'M. Alain Makosso' },
      { id: 'sub-lyg-pc', code: 'PHC', name: 'Physique-Chimie', cycle: 'Lycée Général', program: 'Français', coefficient: 4, teacherName: 'Mme Sandrine Bouanga' },
      { id: 'sub-lyg-svt', code: 'SVT', name: 'Sciences de la Vie et de la Terre', cycle: 'Lycée Général', program: 'Français', coefficient: 3, teacherName: 'M. Gervais Poaty' },
      { id: 'sub-lyg-fr', code: 'FRA', name: 'Français & Littérature', cycle: 'Lycée Général', program: 'Français', coefficient: 3, teacherName: 'Mme Laure Tchibinda' },
      { id: 'sub-lyg-ang', code: 'ANG', name: 'Anglais LV1', cycle: 'Lycée Général', program: 'Français', coefficient: 2, teacherName: 'M. David Oko' },

      { id: 'sub-lyt-el', code: 'ELN', name: 'Électronique Appliquée', cycle: 'Lycée Technique', program: 'Congolais', coefficient: 6, teacherName: 'Ing. Thierry Samba' },
      { id: 'sub-lyt-mat', code: 'MAT', name: 'Mathématiques Techniques', cycle: 'Lycée Technique', program: 'Congolais', coefficient: 4, teacherName: 'M. Alain Makosso' },
      { id: 'sub-lyt-pc', code: 'PHY', name: 'Physique Industrielle', cycle: 'Lycée Technique', program: 'Congolais', coefficient: 3, teacherName: 'Mme Sandrine Bouanga' },
      { id: 'sub-lyt-fr', code: 'FRA', name: 'Expression & Communication', cycle: 'Lycée Technique', program: 'Congolais', coefficient: 2, teacherName: 'Mme Laure Tchibinda' },
    ],
    parents: [
      {
        id: 'par-1',
        fullName: 'M. Bienvenu Makosso',
        phone: '+242 06 612 45 89',
        email: 'bienvenu.makosso@exemple.cg',
        address: 'Avenue Charles de Gaulle, Mpita, Pointe-Noire',
        accessCode: '2468',
        failedAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'par-2',
        fullName: 'Mme Hortense Tchicaya',
        phone: '+242 05 534 19 22',
        email: 'hortense.tchicaya@exemple.cg',
        address: 'Quartier Côte Sauvage, Pointe-Noire',
        accessCode: '1357',
        failedAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'par-3',
        fullName: 'M. Dieudonné Ngoma',
        phone: '+242 06 890 11 40',
        email: 'dieudonne.ngoma@exemple.cg',
        address: 'Tié-Tié, Rue Mboukou, Pointe-Noire',
        accessCode: '4321',
        failedAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'par-4',
        fullName: 'Mme Eugénie Loubaki',
        phone: '+242 06 441 72 15',
        email: 'eugenie.loubaki@exemple.cg',
        address: 'Mpita-Wharf, Impasse Océan, Pointe-Noire',
        accessCode: '8800',
        failedAttempts: 0,
        lockedUntil: null,
      },
    ],
    students: [
      {
        id: 'stu-1',
        cardId: 'JS-26-0001',
        cardStatus: 'active',
        replacedCardIds: [],
        firstName: 'Chloé',
        lastName: 'MAKOSSO',
        birthDate: '2016-04-12',
        birthPlace: 'Pointe-Noire',
        gender: 'F',
        photoUrl: '/src/assets/images/student_avatar_1_1794906894904.jpg',
        cycle: 'Primaire',
        program: 'Français',
        classId: 'cls-cm2',
        parentId: 'par-1',
        academicYear: '2026-2027',
        status: 'reinscrit',
        createdAt: '2026-09-02T09:15:00.000Z',
      },
      {
        id: 'stu-2',
        cardId: 'JS-26-0002',
        cardStatus: 'active',
        replacedCardIds: [],
        firstName: 'Kévin',
        lastName: 'TCHICAYA',
        birthDate: '2010-08-23',
        birthPlace: 'Brazzaville',
        gender: 'M',
        photoUrl: '/src/assets/images/student_avatar_2_1794906895155.jpg',
        cycle: 'Lycée Général',
        program: 'Français',
        classId: 'cls-1ere-s',
        parentId: 'par-2',
        academicYear: '2026-2027',
        status: 'reinscrit',
        createdAt: '2026-09-03T10:30:00.000Z',
      },
      {
        id: 'stu-3',
        cardId: 'JS-26-0003',
        cardStatus: 'active',
        replacedCardIds: [],
        firstName: 'Grace',
        lastName: 'MAKOSSO',
        birthDate: '2013-02-19',
        birthPlace: 'Pointe-Noire',
        gender: 'F',
        photoUrl: '/src/assets/images/student_avatar_3_1794906894849.jpg',
        cycle: 'Collège',
        program: 'Congolais',
        classId: 'cls-4eme',
        parentId: 'par-1',
        academicYear: '2026-2027',
        status: 'reinscrit',
        createdAt: '2026-09-02T09:20:00.000Z',
      },
      {
        id: 'stu-4',
        cardId: 'JS-26-0004',
        cardStatus: 'active',
        replacedCardIds: [],
        firstName: 'Noah',
        lastName: 'NGOMA',
        birthDate: '2020-11-05',
        birthPlace: 'Pointe-Noire',
        gender: 'M',
        photoUrl: '/src/assets/images/student_avatar_4_1794906895480.jpg',
        cycle: 'Maternelle',
        program: 'Congolais',
        classId: 'cls-gs',
        parentId: 'par-3',
        academicYear: '2026-2027',
        status: 'inscrit',
        createdAt: '2026-09-05T14:00:00.000Z',
      },
      {
        id: 'stu-5',
        cardId: 'JS-26-0005',
        cardStatus: 'active',
        replacedCardIds: [],
        firstName: 'Samuel',
        lastName: 'LOUBAKI',
        birthDate: '2009-01-30',
        birthPlace: 'Dolisie',
        gender: 'M',
        photoUrl: '/src/assets/images/student_avatar_2_1794906895155.jpg',
        cycle: 'Lycée Technique',
        program: 'Congolais',
        classId: 'cls-tle-f2',
        parentId: 'par-4',
        academicYear: '2026-2027',
        status: 'reinscrit',
        createdAt: '2026-09-06T08:45:00.000Z',
      },
      {
        id: 'stu-6',
        cardId: 'JS-26-0006',
        cardStatus: 'active',
        replacedCardIds: [],
        firstName: 'Merveille',
        lastName: 'BANZOUZI',
        birthDate: '2016-07-14',
        birthPlace: 'Pointe-Noire',
        gender: 'F',
        photoUrl: '/src/assets/images/student_avatar_1_1794906894904.jpg',
        cycle: 'Primaire',
        program: 'Français',
        classId: 'cls-cm2',
        parentId: 'par-2',
        academicYear: '2026-2027',
        status: 'inscrit',
        createdAt: '2026-09-08T11:10:00.000Z',
      },
      {
        id: 'stu-7',
        cardId: 'JS-26-0007',
        cardStatus: 'active',
        replacedCardIds: [],
        firstName: 'Prisca',
        lastName: 'MOUKOKO',
        birthDate: '2013-05-28',
        birthPlace: 'Pointe-Noire',
        gender: 'F',
        photoUrl: '/src/assets/images/student_avatar_3_1794906894849.jpg',
        cycle: 'Collège',
        program: 'Congolais',
        classId: 'cls-4eme',
        parentId: 'par-3',
        academicYear: '2026-2027',
        status: 'reinscrit',
        createdAt: '2026-09-09T15:25:00.000Z',
      },
      {
        id: 'stu-8',
        cardId: 'JS-26-0008',
        cardStatus: 'perdue',
        replacedCardIds: [],
        firstName: 'Junior',
        lastName: 'KOUBEMBA',
        birthDate: '2010-12-03',
        birthPlace: 'Pointe-Noire',
        gender: 'M',
        photoUrl: '/src/assets/images/student_avatar_2_1794906895155.jpg',
        cycle: 'Lycée Général',
        program: 'Français',
        classId: 'cls-1ere-s',
        parentId: 'par-4',
        academicYear: '2026-2027',
        status: 'inscrit',
        createdAt: '2026-09-10T09:00:00.000Z',
      },
    ],
    teachers: seedTeachers,
    hourlyRates: createSeedHourlyRates(),
    teacherHourLogs: seedHourLogs,
    teacherPayslips: seedPayslips,
    paymentNotifications: [
      {
        id: 'notif-1',
        studentId: 'stu-6',
        studentName: 'Merveille BANZOUZI',
        cardId: 'JS-26-0006',
        amountExpected: 200000,
        reason: 'Inscription Primaire (Programme Français) · 1ère Tranche',
        status: 'en_attente',
        createdAt: isoDaysAgo(1, 11, 15).iso,
        createdBy: 'Mme Clarisse Mavoungou',
      },
      {
        id: 'notif-2',
        studentId: 'stu-8',
        studentName: 'Junior KOUBEMBA',
        cardId: 'JS-26-0008',
        amountExpected: 310000,
        reason: 'Inscription Lycée Général (Programme Français) · 1ère Tranche',
        status: 'en_attente',
        createdAt: isoDaysAgo(0, 8, 30).iso,
        createdBy: 'Mme Clarisse Mavoungou',
      },
    ],
    payments: [
      {
        id: 'pay-1',
        receiptNumber: 'REC-2026-0001',
        studentId: 'stu-1',
        amountPaid: 480000,
        method: 'Virement',
        trancheLabel: 'Scolarité annuelle complète',
        paidAt: '2026-09-05T10:15:00.000Z',
        cashierName: 'M. Brice Loubaki',
        notes: 'Paiement intégral annuel',
      },
      {
        id: 'pay-2',
        receiptNumber: 'REC-2026-0002',
        studentId: 'stu-2',
        amountPaid: 530000,
        method: 'Espèces',
        trancheLabel: 'Inscription + 1ère et 2ème Tranches',
        paidAt: '2026-09-12T14:20:00.000Z',
        cashierName: 'M. Brice Loubaki',
        notes: 'Reste 3ème tranche à régler en avril',
      },
      {
        id: 'pay-3',
        receiptNumber: 'REC-2026-0003',
        studentId: 'stu-3',
        amountPaid: 315000,
        method: 'Virement',
        trancheLabel: 'Scolarité annuelle complète',
        paidAt: '2026-09-05T10:25:00.000Z',
        cashierName: 'M. Brice Loubaki',
        notes: 'Paiement groupé famille Makosso',
      },
      {
        id: 'pay-4',
        receiptNumber: 'REC-2026-0004',
        studentId: 'stu-4',
        amountPaid: 95000,
        method: 'Espèces',
        trancheLabel: 'Inscription + 1ère Tranche',
        paidAt: '2026-09-14T09:05:00.000Z',
        cashierName: 'M. Brice Loubaki',
        notes: '',
      },
      {
        id: 'pay-5',
        receiptNumber: 'REC-2026-0005',
        studentId: 'stu-5',
        amountPaid: 175000,
        method: 'Chèque',
        trancheLabel: 'Inscription + 1ère Tranche',
        paidAt: '2026-09-15T11:40:00.000Z',
        cashierName: 'M. Brice Loubaki',
        notes: 'Chèque BGFI n° 441209',
      },
      {
        id: 'pay-6',
        receiptNumber: 'REC-2026-0006',
        studentId: 'stu-7',
        amountPaid: 135000,
        method: 'Espèces',
        trancheLabel: 'Inscription + 1ère Tranche',
        paidAt: '2026-09-16T08:50:00.000Z',
        cashierName: 'M. Brice Loubaki',
        notes: '',
      },
    ],
    collectionReminders: createSeedCollectionReminders(),
    attendanceLogs: [
      {
        id: 'att-1',
        studentId: 'stu-1',
        cardId: 'JS-26-0001',
        type: 'entree',
        timestamp: y1.iso,
        dateStr: y1.dateStr,
        status: 'present',
        reason: '',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-2',
        studentId: 'stu-1',
        cardId: 'JS-26-0001',
        type: 'sortie',
        timestamp: y1Out.iso,
        dateStr: y1Out.dateStr,
        status: 'present',
        reason: '',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-3',
        studentId: 'stu-1',
        cardId: 'JS-26-0001',
        type: 'entree',
        timestamp: y2.iso,
        dateStr: y2.dateStr,
        status: 'retard',
        reason: 'Embouteillage rond-point Mpita',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-4',
        studentId: 'stu-1',
        cardId: 'JS-26-0001',
        type: 'sortie',
        timestamp: y2Out.iso,
        dateStr: y2Out.dateStr,
        status: 'present',
        reason: '',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-t1',
        studentId: 'stu-1',
        cardId: 'JS-26-0001',
        type: 'entree',
        timestamp: isoAtToday(7, 22),
        dateStr: today,
        status: 'present',
        reason: '',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-t2',
        studentId: 'stu-2',
        cardId: 'JS-26-0002',
        type: 'entree',
        timestamp: isoAtToday(7, 28),
        dateStr: today,
        status: 'present',
        reason: '',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-t3',
        studentId: 'stu-3',
        cardId: 'JS-26-0003',
        type: 'entree',
        timestamp: isoAtToday(7, 46),
        dateStr: today,
        status: 'retard',
        reason: 'Retard transport scolaire',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-t4',
        studentId: 'stu-4',
        cardId: 'JS-26-0004',
        type: 'entree',
        timestamp: isoAtToday(7, 35),
        dateStr: today,
        status: 'present',
        reason: '',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-t5',
        studentId: 'stu-5',
        cardId: 'JS-26-0005',
        type: 'entree',
        timestamp: isoAtToday(7, 15),
        dateStr: today,
        status: 'present',
        reason: '',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
      {
        id: 'att-t6',
        studentId: 'stu-5',
        cardId: 'JS-26-0005',
        type: 'sortie',
        timestamp: isoAtToday(12, 10),
        dateStr: today,
        status: 'present',
        reason: 'Sortie autorisée (rdv médical)',
        recordedBy: 'M. Rodrigue Ngoma',
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      },
    ],
    grades: [
      { id: 'grd-1', studentId: 'stu-1', subjectId: 'sub-pri-fr', periodId: 'per-t1', values: [16, 17.5], average: 16.75, teacherAppreciation: 'Excellente maîtrise de l’expression écrite.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'M. Patrick Mampouya', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'M. Patrick Mampouya', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-2', studentId: 'stu-1', subjectId: 'sub-pri-mat', periodId: 'per-t1', values: [15.5, 16], average: 15.75, teacherAppreciation: 'Raisonnement rigoureux.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'M. Patrick Mampouya', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'M. Patrick Mampouya', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-3', studentId: 'stu-1', subjectId: 'sub-pri-hg', periodId: 'per-t1', values: [14, 15], average: 14.5, teacherAppreciation: 'Bonne participation orale.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Carole Bakala', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'Mme Carole Bakala', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-4', studentId: 'stu-1', subjectId: 'sub-pri-sci', periodId: 'per-t1', values: [17, 16], average: 16.5, teacherAppreciation: 'Curiosité scientifique remarquable.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'M. Patrick Mampouya', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'M. Patrick Mampouya', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },

      { id: 'grd-5', studentId: 'stu-6', subjectId: 'sub-pri-fr', periodId: 'per-t1', values: [13.5, 14], average: 13.75, teacherAppreciation: 'Travail sérieux, poursuivre les efforts.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'M. Patrick Mampouya', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'M. Patrick Mampouya', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-6', studentId: 'stu-6', subjectId: 'sub-pri-mat', periodId: 'per-t1', values: [12, 13], average: 12.5, teacherAppreciation: 'Progrès réguliers.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'M. Patrick Mampouya', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'M. Patrick Mampouya', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-7', studentId: 'stu-6', subjectId: 'sub-pri-hg', periodId: 'per-t1', values: [14, 14.5], average: 14.25, teacherAppreciation: 'Bon investissement.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Carole Bakala', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'Mme Carole Bakala', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-8', studentId: 'stu-6', subjectId: 'sub-pri-sci', periodId: 'per-t1', values: [13, 14], average: 13.5, teacherAppreciation: 'Ensemble satisfaisant.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'M. Patrick Mampouya', validationStatus: 'valide', submittedAt: '2026-12-10T10:00:00.000Z', submittedBy: 'M. Patrick Mampouya', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },

      { id: 'grd-9', studentId: 'stu-3', subjectId: 'sub-col-mat', periodId: 'per-t1', values: [14, 15], average: 14.5, teacherAppreciation: 'Très bon trimestre en algèbre.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'M. Hervé Kengue', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'M. Hervé Kengue', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-10', studentId: 'stu-3', subjectId: 'sub-col-fr', periodId: 'per-t1', values: [15, 14.5], average: 14.75, teacherAppreciation: 'Style fluide et soigné.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Mireille Nkouka', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'Mme Mireille Nkouka', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-11', studentId: 'stu-3', subjectId: 'sub-col-ang', periodId: 'per-t1', values: [16, 16.5], average: 16.25, teacherAppreciation: 'Excellente aisance à l’oral.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'M. David Oko', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'M. David Oko', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-12', studentId: 'stu-3', subjectId: 'sub-col-pc', periodId: 'per-t1', values: [13.5, 14], average: 13.75, teacherAppreciation: 'Bonne démarche expérimentale.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Chantal Mbemba', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'Mme Chantal Mbemba', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-13', studentId: 'stu-3', subjectId: 'sub-col-hg', periodId: 'per-t1', values: [15, 14], average: 14.5, teacherAppreciation: 'Devoirs bien structurés.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'M. Serge Ngatsono', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'M. Serge Ngatsono', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },

      { id: 'grd-14', studentId: 'stu-7', subjectId: 'sub-col-mat', periodId: 'per-t1', values: [11, 12.5], average: 11.75, teacherAppreciation: 'Peut encore progresser.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'M. Hervé Kengue', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'M. Hervé Kengue', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-15', studentId: 'stu-7', subjectId: 'sub-col-fr', periodId: 'per-t1', values: [12, 13], average: 12.5, teacherAppreciation: 'Des efforts notables.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Mireille Nkouka', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'Mme Mireille Nkouka', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-16', studentId: 'stu-7', subjectId: 'sub-col-ang', periodId: 'per-t1', values: [13, 12], average: 12.5, teacherAppreciation: 'Participation correcte.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'M. David Oko', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'M. David Oko', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-17', studentId: 'stu-7', subjectId: 'sub-col-pc', periodId: 'per-t1', values: [10.5, 11.5], average: 11, teacherAppreciation: 'Revoir les leçons régulièrement.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Chantal Mbemba', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'Mme Chantal Mbemba', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-18', studentId: 'stu-7', subjectId: 'sub-col-hg', periodId: 'per-t1', values: [12.5, 13], average: 12.75, teacherAppreciation: 'Bon comportement.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'M. Serge Ngatsono', validationStatus: 'valide', submittedAt: '2026-12-11T11:00:00.000Z', submittedBy: 'M. Serge Ngatsono', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },

      { id: 'grd-19', studentId: 'stu-2', subjectId: 'sub-lyg-mat', periodId: 'per-t1', values: [15.5, 16.5], average: 16, teacherAppreciation: 'Esprit analytique affirmé.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'M. Alain Makosso', validationStatus: 'valide', submittedAt: '2026-12-12T09:00:00.000Z', submittedBy: 'M. Alain Makosso', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-20', studentId: 'stu-2', subjectId: 'sub-lyg-pc', periodId: 'per-t1', values: [14.5, 15], average: 14.75, teacherAppreciation: 'Solides compétences.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'Mme Sandrine Bouanga', validationStatus: 'valide', submittedAt: '2026-12-12T09:00:00.000Z', submittedBy: 'Mme Sandrine Bouanga', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-21', studentId: 'stu-2', subjectId: 'sub-lyg-svt', periodId: 'per-t1', values: [14, 13.5], average: 13.75, teacherAppreciation: 'Bon niveau général.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'M. Gervais Poaty', validationStatus: 'valide', submittedAt: '2026-12-12T09:00:00.000Z', submittedBy: 'M. Gervais Poaty', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-22', studentId: 'stu-2', subjectId: 'sub-lyg-fr', periodId: 'per-t1', values: [13, 14], average: 13.5, teacherAppreciation: 'Dissertation maîtrisée.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'Mme Laure Tchibinda', validationStatus: 'valide', submittedAt: '2026-12-12T09:00:00.000Z', submittedBy: 'Mme Laure Tchibinda', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-23', studentId: 'stu-2', subjectId: 'sub-lyg-ang', periodId: 'per-t1', values: [15, 15.5], average: 15.25, teacherAppreciation: 'Très bonne expression.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'M. David Oko', validationStatus: 'valide', submittedAt: '2026-12-12T09:00:00.000Z', submittedBy: 'M. David Oko', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },

      { id: 'grd-24', studentId: 'stu-5', subjectId: 'sub-lyt-el', periodId: 'per-t1', values: [16, 17], average: 16.5, teacherAppreciation: 'Excellente maîtrise en laboratoire.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'Ing. Thierry Samba', validationStatus: 'valide', submittedAt: '2026-12-12T10:30:00.000Z', submittedBy: 'Ing. Thierry Samba', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-25', studentId: 'stu-5', subjectId: 'sub-lyt-mat', periodId: 'per-t1', values: [14, 14.5], average: 14.25, teacherAppreciation: 'Sérieux et appliqué.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'M. Alain Makosso', validationStatus: 'valide', submittedAt: '2026-12-12T10:30:00.000Z', submittedBy: 'M. Alain Makosso', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-26', studentId: 'stu-5', subjectId: 'sub-lyt-pc', periodId: 'per-t1', values: [13.5, 14], average: 13.75, teacherAppreciation: 'Bon travail.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'Mme Sandrine Bouanga', validationStatus: 'valide', submittedAt: '2026-12-12T10:30:00.000Z', submittedBy: 'Mme Sandrine Bouanga', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },
      { id: 'grd-27', studentId: 'stu-5', subjectId: 'sub-lyt-fr', periodId: 'per-t1', values: [12.5, 13], average: 12.75, teacherAppreciation: 'Satisfaisant.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'Mme Laure Tchibinda', validationStatus: 'valide', submittedAt: '2026-12-12T10:30:00.000Z', submittedBy: 'Mme Laure Tchibinda', validatedAt: '2026-12-12T14:00:00.000Z', validatedBy: 'Mme Clarisse Mavoungou', rejectionReason: null },

      { id: 'grd-t2-1', studentId: 'stu-1', subjectId: 'sub-pri-mat', periodId: 'per-t2', values: [16, 17], average: 16.5, teacherAppreciation: 'Très bonne progression en géométrie.', updatedAt: isoDaysAgo(0, 9, 15).iso, updatedBy: 'M. Patrick Mampouya', validationStatus: 'en_attente', submittedAt: isoDaysAgo(0, 9, 15).iso, submittedBy: 'M. Patrick Mampouya', validatedAt: null, validatedBy: null, rejectionReason: null },
      { id: 'grd-t2-2', studentId: 'stu-6', subjectId: 'sub-pri-mat', periodId: 'per-t2', values: [13.5, 14.5], average: 14, teacherAppreciation: 'Bon travail, en nette hausse.', updatedAt: isoDaysAgo(0, 9, 15).iso, updatedBy: 'M. Patrick Mampouya', validationStatus: 'en_attente', submittedAt: isoDaysAgo(0, 9, 15).iso, submittedBy: 'M. Patrick Mampouya', validatedAt: null, validatedBy: null, rejectionReason: null },
      { id: 'grd-t2-3', studentId: 'stu-2', subjectId: 'sub-lyg-mat', periodId: 'per-t2', values: [15.5, 16], average: 15.75, teacherAppreciation: 'Excellente maîtrise de l’analyse.', updatedAt: isoDaysAgo(0, 9, 20).iso, updatedBy: 'M. Alain Makosso', validationStatus: 'en_attente', submittedAt: isoDaysAgo(0, 9, 20).iso, submittedBy: 'M. Alain Makosso', validatedAt: null, validatedBy: null, rejectionReason: null },
    ],
    bulletins: [
      {
        id: 'bul-1',
        studentId: 'stu-1',
        periodId: 'per-t1',
        classId: 'cls-cm2',
        generalAverage: 16.0,
        rank: 1,
        totalStudents: 2,
        mention: 'Très bien',
        absencesCount: 0,
        latesCount: 1,
        appreciation: 'Félicitations du conseil de classe. Élève brillante et exemplaire.',
        deliveryStatus: 'remis',
        validatedAt: isoDaysAgo(2, 16, 5).iso,
        printedAt: isoDaysAgo(1, 9, 0).iso,
        deliveredAt: isoDaysAgo(1, 15, 20).iso,
        receivedBy: 'M. Bienvenu Makosso (Père)',
      },
      {
        id: 'bul-2',
        studentId: 'stu-6',
        periodId: 'per-t1',
        classId: 'cls-cm2',
        generalAverage: 13.38,
        rank: 2,
        totalStudents: 2,
        mention: 'Assez bien',
        absencesCount: 0,
        latesCount: 0,
        appreciation: 'Encouragements du conseil. Poursuivre les efforts en mathématiques.',
        deliveryStatus: 'valide',
        validatedAt: isoDaysAgo(2, 16, 5).iso,
        printedAt: null,
        deliveredAt: null,
        receivedBy: null,
      },
      {
        id: 'bul-3',
        studentId: 'stu-3',
        periodId: 'per-t1',
        classId: 'cls-4eme',
        generalAverage: 14.58,
        rank: 1,
        totalStudents: 2,
        mention: 'Bien',
        absencesCount: 0,
        latesCount: 1,
        appreciation: 'Très bon premier trimestre, attitude positive et régulière.',
        deliveryStatus: 'imprime',
        validatedAt: isoDaysAgo(2, 16, 10).iso,
        printedAt: isoDaysAgo(1, 10, 15).iso,
        deliveredAt: null,
        receivedBy: null,
      },
      {
        id: 'bul-4',
        studentId: 'stu-7',
        periodId: 'per-t1',
        classId: 'cls-4eme',
        generalAverage: 12.05,
        rank: 2,
        totalStudents: 2,
        mention: 'Assez bien',
        absencesCount: 1,
        latesCount: 0,
        appreciation: 'Ensemble convenable, gagnerait en régularité en physique.',
        deliveryStatus: 'valide',
        validatedAt: isoDaysAgo(2, 16, 10).iso,
        printedAt: null,
        deliveredAt: null,
        receivedBy: null,
      },
      {
        id: 'bul-5',
        studentId: 'stu-2',
        periodId: 'per-t1',
        classId: 'cls-1ere-s',
        generalAverage: 14.81,
        rank: 1,
        totalStudents: 2,
        mention: 'Bien',
        absencesCount: 0,
        latesCount: 0,
        appreciation: 'Excellent profil scientifique. Tableau d’honneur.',
        deliveryStatus: 'valide',
        validatedAt: isoDaysAgo(2, 16, 15).iso,
        printedAt: null,
        deliveredAt: null,
        receivedBy: null,
      },
      {
        id: 'bul-6',
        studentId: 'stu-5',
        periodId: 'per-t1',
        classId: 'cls-tle-f2',
        generalAverage: 14.85,
        rank: 1,
        totalStudents: 1,
        mention: 'Bien',
        absencesCount: 0,
        latesCount: 0,
        appreciation: 'Très bonnes aptitudes techniques en électronique appliquée.',
        deliveryStatus: 'imprime',
        validatedAt: isoDaysAgo(2, 16, 20).iso,
        printedAt: isoDaysAgo(1, 11, 0).iso,
        deliveredAt: null,
        receivedBy: null,
      },
    ],
    auditLogs: [
      {
        id: 'aud-1',
        timestamp: isoDaysAgo(2, 16, 0).iso,
        userId: 'usr-dir',
        userName: 'M. Jean-Baptiste Tchicaya',
        userRole: 'direction',
        action: 'Verrouillage période',
        entityType: 'Période',
        entityId: 'per-t1',
        details: 'Trimestre 1 (2026-2027) validé et verrouillé pour édition officielle des bulletins.',
      },
      {
        id: 'aud-2',
        timestamp: isoDaysAgo(1, 15, 20).iso,
        userId: 'usr-sec',
        userName: 'Mme Nadège Moukoko',
        userRole: 'secretariat',
        action: 'Remise de bulletin',
        entityType: 'Bulletin',
        entityId: 'bul-1',
        details: 'Bulletin Trimestre 1 de Chloé MAKOSSO (JS-26-0001) remis à M. Bienvenu Makosso (Père).',
      },
    ],
    archivedYears: createSeedPreviousArchives(),
    counters: {
      cardSeq: 8,
      receiptSeq: 6,
      teacherSeq: seedTeachers.length,
      payslipSeq: seedPayslips.length,
      archivesSeeded: true,
      gradeWorkflowSeeded: true,
      collectionRemindersSeeded: true,
    },
  };
}

export function addAuditLog(
  db: SchoolDatabase,
  actor: { id: string; fullName: string; role: UserRole },
  action: string,
  entityType: string,
  entityId: string,
  details: string
): void {
  const entry: AuditLog = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userId: actor.id,
    userName: actor.fullName,
    userRole: actor.role,
    action,
    entityType,
    entityId,
    details,
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
}

export function computeStudentBalance(db: Pick<SchoolDatabase, 'feeGrid' | 'payments'>, student: Student) {
  const fee = db.feeGrid.find(
    (f) => f.cycle === student.cycle && f.program === student.program
  );
  const expected = fee ? fee.registrationFee + fee.annualTuition : 250000;
  const paid = db.payments
    .filter((p) => p.studentId === student.id)
    .reduce((sum, p) => sum + p.amountPaid, 0);
  const remaining = Math.max(0, expected - paid);
  const status = remaining === 0 ? 'solde' : paid > 0 ? 'partiel' : 'impaye';
  return { expected, paid, remaining, status };
}

function diffDaysYmd(earlierYmd: string, laterYmd: string): number {
  const [y1, m1, d1] = earlierYmd.split('-').map(Number);
  const [y2, m2, d2] = laterYmd.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((t2 - t1) / 86400000));
}

export function computeStudentRecoveryProfile(
  db: Pick<SchoolDatabase, 'feeGrid' | 'payments'>,
  student: Student,
  asOfDateStr?: string
): StudentRecoveryProfile {
  const fee = db.feeGrid.find(
    (f) => f.cycle === student.cycle && f.program === student.program
  );
  const expected = fee ? fee.registrationFee + fee.annualTuition : 250000;
  const paid = db.payments
    .filter((p) => p.studentId === student.id)
    .reduce((sum, p) => sum + p.amountPaid, 0);
  const remaining = Math.max(0, expected - paid);
  const status = remaining === 0 ? 'solde' : paid > 0 ? 'partiel' : 'impaye';
  const asOf = asOfDateStr || getTodayStr();

  const rawInstallments =
    fee?.installments && fee.installments.length > 0
      ? fee.installments
      : [{ label: 'Scolarité annuelle', amount: expected, dueDate: `${asOf.slice(0, 4)}-09-15` }];

  let creditPool = paid;
  let overdueFcfa = 0;
  let maxDaysOverdue = 0;
  let nextDueDate: string | null = null;
  let nextDueLabel: string | null = null;
  let nextDueAmount = 0;

  const installmentBreakdown: StudentInstallmentBreakdown[] = rawInstallments.map((inst) => {
    const allocated = Math.min(inst.amount, Math.max(0, creditPool));
    creditPool = Math.max(0, creditPool - allocated);
    const instRemaining = Math.max(0, inst.amount - allocated);
    const settled = instRemaining === 0;
    const isOverdue = !settled && Boolean(inst.dueDate) && inst.dueDate < asOf;
    const daysOverdue = isOverdue ? diffDaysYmd(inst.dueDate, asOf) : 0;

    if (isOverdue) {
      overdueFcfa += instRemaining;
      if (daysOverdue > maxDaysOverdue) maxDaysOverdue = daysOverdue;
    }
    if (!settled && nextDueLabel === null) {
      nextDueDate = inst.dueDate;
      nextDueLabel = inst.label;
      nextDueAmount = instRemaining;
    }

    return {
      label: inst.label,
      dueDate: inst.dueDate,
      amount: inst.amount,
      paidForInstallment: allocated,
      remainingForInstallment: instRemaining,
      settled,
      isOverdue,
      daysOverdue,
    };
  });

  // Cap overdueFcfa at remaining balance in case fee installments sum slightly differs from expected
  if (overdueFcfa > remaining) overdueFcfa = remaining;
  const recoveryRatePercent =
    expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : 100;

  return {
    expected,
    paid,
    remaining,
    overdueFcfa,
    daysOverdue: maxDaysOverdue,
    recoveryRatePercent,
    status,
    nextDueDate,
    nextDueLabel,
    nextDueAmount,
    installmentBreakdown,
  };
}

function fmtAmountFr(amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR')} FCFA`;
}

export function normalizePhoneForWhatsapp(phone?: string): string {
  if (!phone) return '';
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('+')) digits = digits.slice(1);
  return digits;
}

export function buildWhatsappLaunchUrl(phone: string | undefined, message: string): string | null {
  const digits = normalizePhoneForWhatsapp(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildMailtoLaunchUrl(
  email: string | undefined,
  subject: string,
  body: string
): string | null {
  const clean = (email || '').trim();
  if (!clean) return null;
  return `mailto:${encodeURIComponent(clean)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildReminderMessageText(params: {
  student: Student;
  parent?: ParentTutor;
  profile: StudentRecoveryProfile;
  schoolName: string;
  step: number;
  delayDays?: number;
}): string {
  const { student, parent, profile, schoolName, step, delayDays = 3 } = params;
  const parentName = parent?.fullName || 'Parent / Tuteur';
  const studentName = `${student.firstName} ${student.lastName}`;
  const tranche = profile.nextDueLabel || 'tranche de scolarité';
  const overdueStr = fmtAmountFr(profile.overdueFcfa > 0 ? profile.overdueFcfa : profile.remaining);
  const remainingStr = fmtAmountFr(profile.remaining);

  if (step <= 1) {
    return (
      `Bonjour ${parentName}, ${schoolName} vous informe d’un retard de paiement de ${overdueStr} ` +
      `concernant la scolarité de ${studentName} (${student.cardId}, ${tranche}). ` +
      `Solde annuel restant : ${remainingStr}. Merci de procéder au règlement à la Caisse ou de solliciter un moratoire sous ${delayDays} jours.`
    );
  }
  if (step === 2) {
    return (
      `Relance J+${delayDays} · Bonjour ${parentName}, suite à notre premier message resté sans régularisation, ` +
      `le dossier de ${studentName} (${student.cardId}) présente toujours un montant échu de ${overdueStr} ` +
      `(solde restant : ${remainingStr}). Merci de passer à la Caisse de ${schoolName} dans les plus brefs délais.`
    );
  }
  return (
    `Dernier rappel avant mise en demeure · Bonjour ${parentName}, malgré nos précédents avis, ` +
    `le retard de scolarité de ${studentName} (${student.cardId}) s’élève à ${overdueStr} ` +
    `(solde restant : ${remainingStr}). Nous vous prions de régulariser ou de contacter la Scolarité de ${schoolName} immédiatement.`
  );
}

export function evaluateStudentAutoFollowUp(
  db: Pick<SchoolDatabase, 'feeGrid' | 'payments' | 'collectionReminders' | 'settings'>,
  student: Student,
  asOfIso?: string
): StudentFollowUpPlan {
  const nowMs = asOfIso ? new Date(asOfIso).getTime() : Date.now();
  const todayStr = (asOfIso || new Date(nowMs).toISOString()).slice(0, 10);
  const auto = db.settings.collectionAutomation || getDefaultCollectionAutomation();
  const delayDays = Math.max(1, Number(auto.followUpDelayDays) || 3);
  const maxSteps = Math.max(1, Number(auto.maxAutoReminders) || 3);

  const profile = computeStudentRecoveryProfile(db, student, todayStr);
  if (profile.overdueFcfa <= 0 || profile.remaining <= 0) {
    return {
      actionNeeded: 'none',
      nextStep: 0,
      nextStatus: 'resolu',
      daysSinceLastReminder: null,
      nextFollowUpDueAt: null,
      reasonLabel: profile.remaining === 0 ? 'Scolarité soldée' : 'Aucune tranche échue',
    };
  }

  const studentReminders = (db.collectionReminders || [])
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  const latest = studentReminders[0];
  if (!latest || latest.status === 'resolu') {
    return {
      actionNeeded: 'initial_alert',
      nextStep: 1,
      nextStatus: 'relance_1',
      daysSinceLastReminder: null,
      nextFollowUpDueAt: new Date(nowMs).toISOString(),
      reasonLabel: `Retard constaté (${fmtAmountFr(profile.overdueFcfa)}) — 1er avis WhatsApp/Email à envoyer`,
    };
  }

  if (latest.status === 'moratoire') {
    if (latest.promisedDate && latest.promisedDate >= todayStr) {
      return {
        actionNeeded: 'moratoire_paused',
        nextStep: (latest.sequenceStep || 1) + 1,
        nextStatus: 'relance_2',
        daysSinceLastReminder: Math.max(0, Math.floor((nowMs - new Date(latest.sentAt).getTime()) / 86400000)),
        nextFollowUpDueAt: latest.promisedDate,
        reasonLabel: `Moratoire actif jusqu’au ${latest.promisedDate}`,
      };
    }
    const nextStep = (latest.sequenceStep || 1) + 1;
    return {
      actionNeeded: 'followup_j3',
      nextStep,
      nextStatus: nextStep >= 3 ? 'mise_en_demeure' : 'relance_2',
      daysSinceLastReminder: Math.max(0, Math.floor((nowMs - new Date(latest.sentAt).getTime()) / 86400000)),
      nextFollowUpDueAt: new Date(nowMs).toISOString(),
      reasonLabel: 'Moratoire expiré sans règlement — relance immédiate',
    };
  }

  const elapsedMs = nowMs - new Date(latest.sentAt).getTime();
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / 86400000));
  const currentStep = latest.sequenceStep || (latest.status === 'relance_1' ? 1 : latest.status === 'relance_2' ? 2 : 3);
  const dueAtIso = new Date(new Date(latest.sentAt).getTime() + delayDays * 86400000).toISOString();

  if (currentStep >= maxSteps) {
    return {
      actionNeeded: 'none',
      nextStep: currentStep,
      nextStatus: 'mise_en_demeure',
      daysSinceLastReminder: elapsedDays,
      nextFollowUpDueAt: null,
      reasonLabel: `Palier maximum atteint (${maxSteps} relances envoyées)`,
    };
  }

  if (elapsedDays >= delayDays) {
    const nextStep = currentStep + 1;
    return {
      actionNeeded: 'followup_j3',
      nextStep,
      nextStatus: nextStep >= 3 ? 'mise_en_demeure' : 'relance_2',
      daysSinceLastReminder: elapsedDays,
      nextFollowUpDueAt: dueAtIso,
      reasonLabel: `Sans règlement depuis ${elapsedDays} j (≥ ${delayDays} j) — Relance J+${delayDays} à envoyer`,
    };
  }

  return {
    actionNeeded: 'none',
    nextStep: currentStep + 1,
    nextStatus: currentStep + 1 >= 3 ? 'mise_en_demeure' : 'relance_2',
    daysSinceLastReminder: elapsedDays,
    nextFollowUpDueAt: dueAtIso,
    reasonLabel: `Relance J+${delayDays} programmée le ${dueAtIso.slice(0, 10)}`,
  };
}

export function runAutomaticOverdueNotifications(
  db: SchoolDatabase,
  actor: { id: string; fullName: string; role: UserRole },
  options?: { studentIds?: string[]; nowIso?: string }
): {
  dispatchedCount: number;
  reminders: CollectionReminder[];
  whatsappLinks: Array<{ studentId: string; studentName: string; phone: string; url: string }>;
  emailLinks: Array<{ studentId: string; studentName: string; email: string; url: string }>;
} {
  ensureRecouvrementData(db);
  const nowIso = options?.nowIso || new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const auto = db.settings.collectionAutomation || getDefaultCollectionAutomation();
  const delayDays = Math.max(1, Number(auto.followUpDelayDays) || 3);
  const targetSet = options?.studentIds ? new Set(options.studentIds) : null;

  const created: CollectionReminder[] = [];
  const whatsappLinks: Array<{ studentId: string; studentName: string; phone: string; url: string }> = [];
  const emailLinks: Array<{ studentId: string; studentName: string; email: string; url: string }> = [];

  const activeStudents = db.students.filter(
    (s) => s.status !== 'archive' && (!targetSet || targetSet.has(s.id))
  );

  for (const student of activeStudents) {
    const plan = evaluateStudentAutoFollowUp(db, student, nowIso);
    if (plan.actionNeeded !== 'initial_alert' && plan.actionNeeded !== 'followup_j3') {
      continue;
    }

    const parent = db.parents.find((p) => p.id === student.parentId);
    const profile = computeStudentRecoveryProfile(db, student, nowIso.slice(0, 10));
    const messageBody = buildReminderMessageText({
      student,
      parent,
      profile,
      schoolName: db.settings.schoolName,
      step: plan.nextStep,
      delayDays,
    });
    const subject = `${db.settings.schoolName} · ${
      plan.actionNeeded === 'initial_alert' ? 'Avis de retard de scolarité' : `Relance J+${delayDays} scolarité`
    } — ${student.firstName} ${student.lastName}`;
    const nextFollowUpAt = new Date(nowMs + delayDays * 86400000).toISOString();

    const channelsToSend: Array<{ channel: ReminderChannel; contact: string }> = [];
    const phone = (parent?.whatsappPhone || parent?.phone || '').trim();
    const email = (parent?.email || '').trim();

    if ((auto.primaryChannel === 'whatsapp' || auto.primaryChannel === 'whatsapp_et_email') && phone) {
      channelsToSend.push({ channel: 'SMS / WhatsApp', contact: phone });
      const wa = buildWhatsappLaunchUrl(phone, messageBody);
      if (wa) {
        whatsappLinks.push({
          studentId: student.id,
          studentName: `${student.lastName} ${student.firstName}`,
          phone,
          url: wa,
        });
      }
    }
    if ((auto.primaryChannel === 'email' || auto.primaryChannel === 'whatsapp_et_email') && email) {
      channelsToSend.push({ channel: 'Email', contact: email });
      const ml = buildMailtoLaunchUrl(email, subject, messageBody);
      if (ml) {
        emailLinks.push({
          studentId: student.id,
          studentName: `${student.lastName} ${student.firstName}`,
          email,
          url: ml,
        });
      }
    }
    if (channelsToSend.length === 0) {
      channelsToSend.push({
        channel: auto.primaryChannel === 'email' ? 'Email' : 'SMS / WhatsApp',
        contact: phone || email || 'Contact non renseigné',
      });
    }

    for (let i = 0; i < channelsToSend.length; i++) {
      const target = channelsToSend[i];
      const rem: CollectionReminder = {
        id: `rem-auto-${nowMs}-${student.id}-${i}`,
        studentId: student.id,
        parentId: student.parentId,
        channel: target.channel,
        status: plan.nextStatus,
        amountDueFcfa: profile.remaining,
        overdueFcfa: profile.overdueFcfa,
        promisedDate: null,
        notes:
          plan.actionNeeded === 'initial_alert'
            ? `Envoi automatique (retard constaté) via ${target.channel} — Prochaine relance prévue à J+${delayDays}.`
            : `Relance automatique J+${delayDays} envoyée via ${target.channel} après ${plan.daysSinceLastReminder ?? delayDays} j sans paiement.`,
        sentAt: nowIso,
        sentBy: actor.fullName,
        recipientContact: target.contact,
        messageBody,
        deliveryState: 'envoye',
        isAutomatic: true,
        sequenceStep: plan.nextStep,
        nextFollowUpAt,
      };
      db.collectionReminders = db.collectionReminders || [];
      db.collectionReminders.unshift(rem);
      created.push(rem);
    }

    addAuditLog(
      db,
      actor,
      plan.actionNeeded === 'initial_alert'
        ? 'Avis automatique retard (WhatsApp/Email)'
        : `Relance automatique J+${delayDays}`,
      'Recouvrement',
      student.cardId,
      `${student.firstName} ${student.lastName} (${parent?.fullName || 'Parent'}) · Canaux : ${channelsToSend.map((c) => c.channel).join(' + ')} · Échu : ${fmtAmountFr(profile.overdueFcfa)}.`
    );
  }

  auto.lastAutoRunAt = nowIso;
  db.settings.collectionAutomation = auto;

  return {
    dispatchedCount: created.length,
    reminders: created,
    whatsappLinks,
    emailLinks,
  };
}

export function computeMentionFromScore(db: SchoolDatabase, score: number): string {
  const sorted = [...db.settings.mentionThresholds].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (score >= t.minScore) return t.label;
  }
  return 'Insuffisant';
}

export function recalculateClassBulletins(
  db: SchoolDatabase,
  classId: string,
  periodId: string
): Bulletin[] {
  const cls = db.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const classStudents = db.students.filter(
    (s) => s.classId === classId && s.status !== 'archive'
  );
  const classSubjects = db.subjects.filter(
    (sub) => sub.cycle === cls.cycle && sub.program === cls.program
  );

  const studentScores = classStudents.map((stu) => {
    let weightedSum = 0;
    let coeffSum = 0;
    for (const sub of classSubjects) {
      const grade = db.grades.find(
        (g) =>
          g.studentId === stu.id &&
          g.subjectId === sub.id &&
          g.periodId === periodId &&
          (!g.validationStatus || g.validationStatus === 'valide')
      );
      if (grade) {
        weightedSum += grade.average * sub.coefficient;
        coeffSum += sub.coefficient;
      }
    }
    const avg = coeffSum > 0 ? Math.round((weightedSum / coeffSum) * 100) / 100 : 0;

    const studentAtt = db.attendanceLogs.filter((a) => a.studentId === stu.id);
    const latesCount = studentAtt.filter((a) => a.status === 'retard').length;
    const absencesCount = studentAtt.filter((a) => a.status === 'absence').length;

    return { stu, avg, latesCount, absencesCount };
  });

  studentScores.sort((a, b) => b.avg - a.avg);
  const totalStudents = studentScores.length;
  const period = db.periods.find((p) => p.id === periodId);
  const isPeriodLocked = period?.status === 'verrouille';

  const updated: Bulletin[] = [];
  studentScores.forEach((item, index) => {
    const rank = index + 1;
    const mention = computeMentionFromScore(db, item.avg);
    const existingIdx = db.bulletins.findIndex(
      (b) => b.studentId === item.stu.id && b.periodId === periodId
    );
    const autoAppreciation =
      item.avg >= 16
        ? 'Félicitations du conseil de classe. Travail remarquable.'
        : item.avg >= 14
          ? 'Tableau d’honneur. Très bon ensemble.'
          : item.avg >= 12
            ? 'Encouragements du conseil de classe.'
            : item.avg >= 10
              ? 'Résultats convenables, poursuivre les efforts.'
              : 'Efforts soutenus indispensables au prochain trimestre.';

    if (existingIdx >= 0) {
      const existing = db.bulletins[existingIdx];
      const next: Bulletin = {
        ...existing,
        classId,
        generalAverage: item.avg,
        rank,
        totalStudents,
        mention,
        absencesCount: item.absencesCount,
        latesCount: item.latesCount,
        appreciation: existing.appreciation || autoAppreciation,
        deliveryStatus:
          isPeriodLocked && existing.deliveryStatus === 'a_editer'
            ? 'valide'
            : existing.deliveryStatus,
        validatedAt:
          isPeriodLocked && !existing.validatedAt
            ? new Date().toISOString()
            : existing.validatedAt,
      };
      db.bulletins[existingIdx] = next;
      updated.push(next);
    } else {
      const created: Bulletin = {
        id: `bul-${Date.now()}-${item.stu.id}`,
        studentId: item.stu.id,
        periodId,
        classId,
        generalAverage: item.avg,
        rank,
        totalStudents,
        mention,
        absencesCount: item.absencesCount,
        latesCount: item.latesCount,
        appreciation: autoAppreciation,
        deliveryStatus: isPeriodLocked ? 'valide' : 'a_editer',
        validatedAt: isPeriodLocked ? new Date().toISOString() : null,
        printedAt: null,
        deliveredAt: null,
        receivedBy: null,
      };
      db.bulletins.push(created);
      updated.push(created);
    }
  });

  return updated;
}

export function computeDashboardSummary(db: SchoolDatabase): DashboardSummary {
  const activeStudents = db.students.filter((s) => s.status !== 'archive');
  let totalExpectedFcfa = 0;
  let totalCollectedFcfa = 0;
  let unpaidStudentsCount = 0;
  let totalOverdueFcfa = 0;
  let overdueStudentsCount = 0;
  const unpaidStudentIds = new Set<string>();

  for (const stu of activeStudents) {
    const prof = computeStudentRecoveryProfile(db, stu);
    totalExpectedFcfa += prof.expected;
    totalCollectedFcfa += prof.paid;
    if (prof.remaining > 0) {
      unpaidStudentsCount++;
      unpaidStudentIds.add(stu.id);
    }
    if (prof.overdueFcfa > 0) {
      totalOverdueFcfa += prof.overdueFcfa;
      overdueStudentsCount++;
    }
  }

  const reminders = db.collectionReminders || [];
  const latestReminderByStudent = new Map<string, CollectionReminder>();
  for (const r of reminders) {
    const prev = latestReminderByStudent.get(r.studentId);
    if (!prev || new Date(r.sentAt).getTime() >= new Date(prev.sentAt).getTime()) {
      latestReminderByStudent.set(r.studentId, r);
    }
  }
  let activeMoratoiresCount = 0;
  for (const stuId of unpaidStudentIds) {
    if (latestReminderByStudent.get(stuId)?.status === 'moratoire') {
      activeMoratoiresCount++;
    }
  }

  const today = getTodayStr();
  const todayLogs = db.attendanceLogs.filter((a) => a.dateStr === today);
  const latestByStudent = new Map<string, AttendanceLog>();
  for (const log of todayLogs) {
    const prev = latestByStudent.get(log.studentId);
    if (!prev || new Date(log.timestamp).getTime() >= new Date(prev.timestamp).getTime()) {
      latestByStudent.set(log.studentId, log);
    }
  }

  let presentTodayCount = 0;
  let exitedTodayCount = 0;
  for (const stu of activeStudents) {
    const latest = latestByStudent.get(stu.id);
    if (latest) {
      if (latest.type === 'entree') presentTodayCount++;
      else exitedTodayCount++;
    }
  }
  const notScannedTodayCount = Math.max(
    0,
    activeStudents.length - presentTodayCount - exitedTodayCount
  );

  const pendingNotificationsCount = db.paymentNotifications.filter(
    (n) => n.status === 'en_attente'
  ).length;
  const bulletinsToDeliverCount = db.bulletins.filter(
    (b) => b.deliveryStatus !== 'remis'
  ).length;

  const activeTeachers = (db.teachers || []).filter((t) => t.status === 'actif');
  const currentMonth = getCurrentMonthStr();
  const payslips = db.teacherPayslips || [];
  const monthSlips = payslips.filter((p) => p.month === currentMonth);
  const monthlyPayrollFcfa = (monthSlips.length > 0 ? monthSlips : payslips).reduce(
    (sum, p) => sum + p.netPayFcfa,
    0
  );

  let pendingFollowUpsCount = 0;
  for (const stu of activeStudents) {
    const plan = evaluateStudentAutoFollowUp(db, stu);
    if (plan.actionNeeded === 'initial_alert' || plan.actionNeeded === 'followup_j3') {
      pendingFollowUpsCount++;
    }
  }

  return {
    totalStudents: activeStudents.length,
    activeCards: activeStudents.filter((s) => s.cardStatus === 'active').length,
    totalExpectedFcfa,
    totalCollectedFcfa,
    collectionRatePercent:
      totalExpectedFcfa > 0
        ? Math.round((totalCollectedFcfa / totalExpectedFcfa) * 100)
        : 0,
    presentTodayCount,
    exitedTodayCount,
    notScannedTodayCount,
    pendingNotificationsCount,
    unpaidStudentsCount,
    bulletinsToDeliverCount,
    activeTeachersCount: activeTeachers.length,
    monthlyPayrollFcfa,
    pendingGradesCount: (db.grades || []).filter((g) => g.validationStatus === 'en_attente').length,
    totalOverdueFcfa,
    overdueStudentsCount,
    activeMoratoiresCount,
    pendingFollowUpsCount,
  };
}

export function buildAcademicYearArchive(
  db: SchoolDatabase,
  actor: { fullName: string },
  notes?: string
): AcademicYearArchive {
  const yearStudents = db.students.filter((s) => s.status !== 'archive');
  let totalExpectedFcfa = 0;
  let totalCollectedFcfa = 0;
  let avgSum = 0;
  let avgCount = 0;

  const records: ArchivedStudentRecord[] = yearStudents.map((stu) => {
    const cls = db.classes.find((c) => c.id === stu.classId);
    const parent = db.parents.find((p) => p.id === stu.parentId);
    const bal = computeStudentBalance(db, stu);
    totalExpectedFcfa += bal.expected;
    totalCollectedFcfa += bal.paid;

    const stuBulletins = db.bulletins.filter((b) => b.studentId === stu.id);
    const latestBulletin = stuBulletins[stuBulletins.length - 1];
    if (latestBulletin) {
      avgSum += latestBulletin.generalAverage;
      avgCount += 1;
    }

    const stuAtt = db.attendanceLogs.filter((a) => a.studentId === stu.id);
    const absencesCount = stuAtt.filter((a) => a.status === 'absence').length;
    const latesCount = stuAtt.filter((a) => a.status === 'retard').length;

    return {
      cardId: stu.cardId,
      fullName: `${stu.lastName} ${stu.firstName}`,
      gender: stu.gender,
      cycle: stu.cycle,
      program: stu.program,
      className: cls?.name || 'Non affecté',
      parentName: parent?.fullName || '—',
      parentPhone: parent?.phone || '—',
      totalExpectedFcfa: bal.expected,
      totalPaidFcfa: bal.paid,
      balanceRemainingFcfa: bal.remaining,
      generalAverage: latestBulletin ? latestBulletin.generalAverage : null,
      rank: latestBulletin ? latestBulletin.rank : null,
      mention: latestBulletin ? latestBulletin.mention : '—',
      absencesCount,
      latesCount,
    };
  });

  const currentYear = db.settings.currentAcademicYear;
  const teacherRecords: ArchivedTeacherRecord[] = (db.teachers || []).map((teacher) => {
    const teacherSlips = (db.teacherPayslips || []).filter(
      (p) => p.teacherId === teacher.id && p.academicYear === currentYear
    );
    const loggedHours = (db.teacherHourLogs || [])
      .filter((l) => l.teacherId === teacher.id)
      .reduce((sum, l) => sum + (Number(l.hours) || 0), 0);
    const slipHours = teacherSlips.reduce(
      (sum, p) => sum + p.regularHours + p.overtimeHours,
      0
    );
    const totalHours = Math.round((loggedHours > 0 ? loggedHours : slipHours) * 100) / 100;
    const totalPaidFcfa =
      teacherSlips.length > 0
        ? teacherSlips.reduce((sum, p) => sum + p.netPayFcfa, 0)
        : Math.round(totalHours * teacher.hourlyRateFcfa);

    return {
      matricule: teacher.matricule,
      fullName: `${teacher.lastName} ${teacher.firstName}`,
      specialty: teacher.specialty,
      contractType: teacher.contractType,
      cycles: teacher.cycles.join(', '),
      hourlyRateFcfa: teacher.hourlyRateFcfa,
      totalHours,
      totalPaidFcfa,
    };
  });

  const totalTeacherHours =
    Math.round(teacherRecords.reduce((s, t) => s + t.totalHours, 0) * 100) / 100;
  const totalPayrollFcfa = teacherRecords.reduce((s, t) => s + t.totalPaidFcfa, 0);

  return {
    id: `arch-${Date.now()}`,
    academicYear: currentYear,
    archivedAt: new Date().toISOString(),
    archivedBy: actor.fullName,
    source: 'cloture',
    notes: notes?.trim() || 'Clôture automatique lors du passage à une nouvelle année académique.',
    summary: {
      totalStudents: records.length,
      totalExpectedFcfa,
      totalCollectedFcfa,
      bulletinsCount: db.bulletins.length,
      averageScore: avgCount > 0 ? Math.round((avgSum / avgCount) * 100) / 100 : null,
      attendanceLogsCount: db.attendanceLogs.length,
      totalTeachers: teacherRecords.length,
      totalTeacherHours,
      totalPayrollFcfa,
    },
    records,
    teacherRecords,
  };
}

export function createPeriodsForYear(
  academicYear: string,
  periodMode: 'Trimestres' | 'Séquences'
): EvaluationPeriod[] {
  const match = academicYear.match(/(\d{4})\D+(\d{4})/);
  const startYear = match ? Number(match[1]) : new Date().getFullYear();
  const endYear = match ? Number(match[2]) : startYear + 1;
  const stamp = Date.now();

  if (periodMode === 'Séquences') {
    return [
      {
        id: `per-${stamp}-1`,
        label: 'Séquence 1',
        academicYear,
        startDate: `${startYear}-09-14`,
        endDate: `${startYear}-11-15`,
        status: 'ouvert',
        validatedAt: null,
        validatedBy: null,
      },
      {
        id: `per-${stamp}-2`,
        label: 'Séquence 2',
        academicYear,
        startDate: `${startYear}-11-18`,
        endDate: `${endYear}-02-15`,
        status: 'ouvert',
        validatedAt: null,
        validatedBy: null,
      },
      {
        id: `per-${stamp}-3`,
        label: 'Séquence 3',
        academicYear,
        startDate: `${endYear}-02-20`,
        endDate: `${endYear}-06-30`,
        status: 'ouvert',
        validatedAt: null,
        validatedBy: null,
      },
    ];
  }

  return [
    {
      id: `per-${stamp}-1`,
      label: 'Trimestre 1',
      academicYear,
      startDate: `${startYear}-09-14`,
      endDate: `${startYear}-12-18`,
      status: 'ouvert',
      validatedAt: null,
      validatedBy: null,
    },
    {
      id: `per-${stamp}-2`,
      label: 'Trimestre 2',
      academicYear,
      startDate: `${endYear}-01-05`,
      endDate: `${endYear}-03-27`,
      status: 'ouvert',
      validatedAt: null,
      validatedBy: null,
    },
    {
      id: `per-${stamp}-3`,
      label: 'Trimestre 3',
      academicYear,
      startDate: `${endYear}-04-12`,
      endDate: `${endYear}-06-30`,
      status: 'ouvert',
      validatedAt: null,
      validatedBy: null,
    },
  ];
}

export function sanitizeDbForClient(db: SchoolDatabase, actor: ActorContext | null) {
  const safeUsers = db.users.map(({ password: _p, ...rest }) => rest);
  if (!actor) {
    return null;
  }

  if (actor.role === 'parent') {
    const myStudents = db.students.filter((s) => s.parentId === actor.id);
    const myStudentIds = new Set(myStudents.map((s) => s.id));
    const myClassIds = new Set(myStudents.map((s) => s.classId).filter(Boolean));
    return {
      settings: db.settings,
      users: [],
      periods: db.periods,
      feeGrid: db.feeGrid,
      classes: db.classes.filter((c) => myClassIds.has(c.id)),
      subjects: db.subjects,
      parents: db.parents
        .filter((p) => p.id === actor.id)
        .map(({ accessCode: _c, ...rest }) => rest),
      students: myStudents,
      teachers: [],
      hourlyRates: [],
      teacherHourLogs: [],
      teacherPayslips: [],
      paymentNotifications: [],
      payments: db.payments.filter((p) => myStudentIds.has(p.studentId)),
      collectionReminders: [],
      attendanceLogs: db.attendanceLogs.filter((a) => myStudentIds.has(a.studentId)),
      grades: db.grades.filter(
        (g) =>
          myStudentIds.has(g.studentId) &&
          (!g.validationStatus || g.validationStatus === 'valide')
      ),
      bulletins: db.bulletins.filter(
        (b) => myStudentIds.has(b.studentId) && b.deliveryStatus !== 'a_editer'
      ),
      auditLogs: [],
      archivedYears: [],
      summary: computeDashboardSummary(db),
    };
  }

  return {
    settings: db.settings,
    users: safeUsers,
    periods: db.periods,
    feeGrid: db.feeGrid,
    classes: db.classes,
    subjects: db.subjects,
    parents: db.parents,
    students: db.students,
    teachers: db.teachers || [],
    hourlyRates: db.hourlyRates || [],
    teacherHourLogs: db.teacherHourLogs || [],
    teacherPayslips: db.teacherPayslips || [],
    paymentNotifications: db.paymentNotifications,
    payments: db.payments,
    collectionReminders: db.collectionReminders || [],
    attendanceLogs: db.attendanceLogs,
    grades: db.grades,
    bulletins: db.bulletins,
    auditLogs: db.auditLogs,
    archivedYears: db.archivedYears || [],
    summary: computeDashboardSummary(db),
  };
}
