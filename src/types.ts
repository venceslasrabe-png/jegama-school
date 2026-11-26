export type UserRole =
  | 'enseignant'
  | 'scolarite'
  | 'caisse'
  | 'secretariat'
  | 'surveillant'
  | 'parent'
  | 'direction'
  | 'admin';

export type SchoolCycle =
  | 'Maternelle'
  | 'Primaire'
  | 'Collège'
  | 'Lycée Général'
  | 'Lycée Technique';

export type SchoolProgram = 'Congolais' | 'Français';

export type CardStatus = 'active' | 'perdue' | 'desactivee';

export type StudentStatus = 'inscrit' | 'reinscrit' | 'archive';

export type PaymentStatus = 'solde' | 'partiel' | 'impaye';

export type NotificationStatus = 'en_attente' | 'encaisse';

export type PeriodStatus = 'ouvert' | 'verrouille';

export type BulletinDeliveryStatus = 'a_editer' | 'valide' | 'imprime' | 'remis';

export type AttendanceType = 'entree' | 'sortie';

export type AttendanceStatus = 'present' | 'retard' | 'absence';

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  password?: string;
  active: boolean;
  lastLogin: string | null;
}

export interface MentionThreshold {
  label: string;
  minScore: number;
}

export interface CollectionAutomationSettings {
  autoNotifyOnOverdue: boolean;
  primaryChannel: 'whatsapp_et_email' | 'whatsapp' | 'email';
  followUpDelayDays: number;
  maxAutoReminders: number;
  lastAutoRunAt?: string | null;
}

export interface SchoolSettings {
  schoolName: string;
  address: string;
  city: string;
  country: string;
  currentAcademicYear: string;
  periodMode: 'Trimestres' | 'Séquences';
  parentRequireSecretCode: boolean;
  maxParentLoginAttempts: number;
  mentionThresholds: MentionThreshold[];
  lastBackupAt: string | null;
  collectionAutomation?: CollectionAutomationSettings;
}

export interface EvaluationPeriod {
  id: string;
  label: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  validatedAt: string | null;
  validatedBy: string | null;
}

export interface FeeInstallment {
  label: string;
  amount: number;
  dueDate: string;
}

export interface FeeGridItem {
  id: string;
  cycle: SchoolCycle;
  program: SchoolProgram;
  registrationFee: number;
  annualTuition: number;
  installments: FeeInstallment[];
}

export interface SchoolClass {
  id: string;
  name: string;
  cycle: SchoolCycle;
  program: SchoolProgram;
  room: string;
  capacity: number;
  headTeacher: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  cycle: SchoolCycle;
  program: SchoolProgram;
  coefficient: number;
  teacherName: string;
}

export interface ParentTutor {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  whatsappPhone?: string;
  address: string;
  accessCode: string;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface Student {
  id: string;
  cardId: string;
  cardStatus: CardStatus;
  replacedCardIds: string[];
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  gender: 'M' | 'F';
  photoUrl: string;
  cycle: SchoolCycle;
  program: SchoolProgram;
  classId: string | null;
  parentId: string;
  academicYear: string;
  status: StudentStatus;
  createdAt: string;
}

export interface PaymentNotification {
  id: string;
  studentId: string;
  studentName: string;
  cardId: string;
  amountExpected: number;
  reason: string;
  status: NotificationStatus;
  createdAt: string;
  createdBy: string;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  studentId: string;
  amountPaid: number;
  method: 'Espèces' | 'Virement' | 'Chèque';
  trancheLabel: string;
  paidAt: string;
  cashierName: string;
  notes: string;
}

export interface AttendanceLog {
  id: string;
  studentId: string;
  cardId: string;
  type: AttendanceType;
  timestamp: string;
  dateStr: string;
  status: AttendanceStatus;
  reason: string;
  recordedBy: string;
  correctedBy: string | null;
  correctedAt: string | null;
  offlineSynced: boolean;
}

export type GradeValidationStatus = 'en_attente' | 'valide' | 'rejete';

export interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  periodId: string;
  values: number[];
  average: number;
  teacherAppreciation: string;
  updatedAt: string;
  updatedBy: string;
  validationStatus?: GradeValidationStatus;
  submittedAt?: string | null;
  submittedBy?: string | null;
  validatedAt?: string | null;
  validatedBy?: string | null;
  rejectionReason?: string | null;
}

export interface Bulletin {
  id: string;
  studentId: string;
  periodId: string;
  classId: string;
  generalAverage: number;
  rank: number;
  totalStudents: number;
  mention: string;
  absencesCount: number;
  latesCount: number;
  appreciation: string;
  deliveryStatus: BulletinDeliveryStatus;
  validatedAt: string | null;
  printedAt: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
}

export interface ArchivedStudentRecord {
  cardId: string;
  fullName: string;
  gender: string;
  cycle: string;
  program: string;
  className: string;
  parentName: string;
  parentPhone: string;
  totalExpectedFcfa: number;
  totalPaidFcfa: number;
  balanceRemainingFcfa: number;
  generalAverage: number | null;
  rank: number | null;
  mention: string;
  absencesCount: number;
  latesCount: number;
}

export interface ArchivedTeacherRecord {
  matricule: string;
  fullName: string;
  specialty: string;
  contractType: string;
  cycles: string;
  hourlyRateFcfa: number;
  totalHours: number;
  totalPaidFcfa: number;
}

export interface AcademicYearArchive {
  id: string;
  academicYear: string;
  archivedAt: string;
  archivedBy: string;
  source: 'cloture' | 'import_excel' | 'manuel';
  sourceFileName?: string;
  notes?: string;
  summary: {
    totalStudents: number;
    totalExpectedFcfa: number;
    totalCollectedFcfa: number;
    bulletinsCount: number;
    averageScore: number | null;
    attendanceLogsCount: number;
    totalTeachers?: number;
    totalTeacherHours?: number;
    totalPayrollFcfa?: number;
  };
  records: ArchivedStudentRecord[];
  teacherRecords?: ArchivedTeacherRecord[];
}

export type TeacherContractType = 'Permanent' | 'Vacataire' | 'Contractuel';

export type TeacherStatus = 'actif' | 'conge' | 'inactif';

export type PayslipPaymentMethod = 'Espèces' | 'Virement' | 'Mobile Money' | 'Chèque';

export type PayslipStatus = 'brouillon' | 'valide' | 'paye';

export interface Teacher {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  address: string;
  photoUrl: string;
  specialty: string;
  diploma: string;
  cycles: SchoolCycle[];
  programs: SchoolProgram[];
  contractType: TeacherContractType;
  hourlyRateFcfa: number;
  weeklyHoursQuota: number;
  baseBonusFcfa: number;
  cnssRatePercent: number;
  hireDate: string;
  bankOrMobileAccount: string;
  status: TeacherStatus;
}

export interface CycleHourlyRate {
  id: string;
  cycle: SchoolCycle;
  program: SchoolProgram;
  baseHourlyRateFcfa: number;
  overtimeHourlyRateFcfa: number;
  headTeacherMonthlyBonusFcfa: number;
}

export interface TeacherPayslip {
  id: string;
  payslipNumber: string;
  teacherId: string;
  month: string;
  periodLabel: string;
  academicYear: string;
  regularHours: number;
  overtimeHours: number;
  hourlyRateFcfa: number;
  overtimeRateFcfa: number;
  basePayFcfa: number;
  overtimePayFcfa: number;
  bonusesFcfa: number;
  bonusDetails: string;
  grossPayFcfa: number;
  cnssDeductionFcfa: number;
  advanceOrOtherDeductionFcfa: number;
  deductionDetails: string;
  netPayFcfa: number;
  paymentMethod: PayslipPaymentMethod;
  status: PayslipStatus;
  createdAt: string;
  createdBy: string;
  paidAt: string | null;
  paidBy: string | null;
}

export interface TeacherHourLog {
  id: string;
  teacherId: string;
  month: string;
  date: string;
  hours: number;
  classOrSubject: string;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

export type ReminderChannel =
  | 'Appel téléphonique'
  | 'SMS / WhatsApp'
  | 'Courrier / Convocation'
  | 'Email';

export type ReminderStatus =
  | 'relance_1'
  | 'relance_2'
  | 'mise_en_demeure'
  | 'moratoire'
  | 'resolu';

export interface CollectionReminder {
  id: string;
  studentId: string;
  parentId: string;
  channel: ReminderChannel;
  status: ReminderStatus;
  amountDueFcfa: number;
  overdueFcfa: number;
  promisedDate: string | null;
  notes: string;
  sentAt: string;
  sentBy: string;
  recipientContact?: string;
  messageBody?: string;
  deliveryState?: 'envoye' | 'planifie' | 'echec';
  isAutomatic?: boolean;
  sequenceStep?: number;
  nextFollowUpAt?: string | null;
}

export interface StudentFollowUpPlan {
  actionNeeded: 'none' | 'initial_alert' | 'followup_j3' | 'moratoire_paused';
  nextStep: number;
  nextStatus: ReminderStatus;
  daysSinceLastReminder: number | null;
  nextFollowUpDueAt: string | null;
  reasonLabel: string;
}

export interface StudentInstallmentBreakdown {
  label: string;
  dueDate: string;
  amount: number;
  paidForInstallment: number;
  remainingForInstallment: number;
  settled: boolean;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface StudentRecoveryProfile {
  expected: number;
  paid: number;
  remaining: number;
  overdueFcfa: number;
  daysOverdue: number;
  recoveryRatePercent: number;
  status: PaymentStatus;
  nextDueDate: string | null;
  nextDueLabel: string | null;
  nextDueAmount: number;
  installmentBreakdown: StudentInstallmentBreakdown[];
}

export type ReenrollmentDecision =
  | 'passage'
  | 'redoublement'
  | 'changement_cycle'
  | 'transfert_programme';

export interface ReenrollmentRecord {
  id: string;
  studentId: string;
  cardId: string;
  fromAcademicYear: string;
  toAcademicYear: string;
  fromCycle: SchoolCycle;
  toCycle: SchoolCycle;
  fromProgram: SchoolProgram;
  toProgram: SchoolProgram;
  fromClassId: string | null;
  toClassId: string | null;
  decision: ReenrollmentDecision;
  previousBalanceFcfa: number;
  reinscriptionFeeFcfa: number;
  parentPhone: string;
  parentEmail?: string;
  notes?: string;
  reinscritAt: string;
  reinscritBy: string;
}

export interface SchoolDatabase {
  settings: SchoolSettings;
  users: UserAccount[];
  periods: EvaluationPeriod[];
  feeGrid: FeeGridItem[];
  classes: SchoolClass[];
  subjects: Subject[];
  parents: ParentTutor[];
  students: Student[];
  teachers: Teacher[];
  hourlyRates: CycleHourlyRate[];
  teacherHourLogs: TeacherHourLog[];
  teacherPayslips: TeacherPayslip[];
  paymentNotifications: PaymentNotification[];
  payments: Payment[];
  collectionReminders?: CollectionReminder[];
  reenrollments?: ReenrollmentRecord[];
  attendanceLogs: AttendanceLog[];
  grades: Grade[];
  bulletins: Bulletin[];
  auditLogs: AuditLog[];
  archivedYears: AcademicYearArchive[];
  counters: {
    cardSeq: number;
    receiptSeq: number;
    teacherSeq?: number;
    payslipSeq?: number;
    archivesSeeded?: boolean;
    gradeWorkflowSeeded?: boolean;
    collectionRemindersSeeded?: boolean;
    reinscriptionsSeeded?: boolean;
  };
}

export interface DashboardSummary {
  totalStudents: number;
  activeCards: number;
  totalExpectedFcfa: number;
  totalCollectedFcfa: number;
  collectionRatePercent: number;
  presentTodayCount: number;
  exitedTodayCount: number;
  notScannedTodayCount: number;
  pendingNotificationsCount: number;
  unpaidStudentsCount: number;
  bulletinsToDeliverCount: number;
  activeTeachersCount: number;
  monthlyPayrollFcfa: number;
  pendingGradesCount?: number;
  totalOverdueFcfa?: number;
  overdueStudentsCount?: number;
  activeMoratoiresCount?: number;
  pendingFollowUpsCount?: number;
  studentsToReinscrireCount?: number;
  reinscritCount?: number;
}
