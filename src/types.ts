export type UserRole =
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

export interface AcademicYearArchive {
  id: string;
  academicYear: string;
  archivedAt: string;
  archivedBy: string;
  source: 'cloture' | 'import_excel';
  sourceFileName?: string;
  notes?: string;
  summary: {
    totalStudents: number;
    totalExpectedFcfa: number;
    totalCollectedFcfa: number;
    bulletinsCount: number;
    averageScore: number | null;
    attendanceLogsCount: number;
  };
  records: ArchivedStudentRecord[];
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
  paymentNotifications: PaymentNotification[];
  payments: Payment[];
  attendanceLogs: AttendanceLog[];
  grades: Grade[];
  bulletins: Bulletin[];
  auditLogs: AuditLog[];
  archivedYears: AcademicYearArchive[];
  counters: {
    cardSeq: number;
    receiptSeq: number;
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
}
