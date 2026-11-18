import type {
  AcademicYearArchive,
  AttendanceLog,
  AuditLog,
  Bulletin,
  DashboardSummary,
  EvaluationPeriod,
  FeeGridItem,
  Grade,
  ParentTutor,
  Payment,
  PaymentNotification,
  SchoolClass,
  SchoolSettings,
  Student,
  Subject,
  UserAccount,
  UserRole,
} from './types';

export interface AppState {
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
  summary: DashboardSummary;
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  session?: SessionUser | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (session) {
    headers['x-user-id'] = session.id;
    headers['x-user-role'] = session.role;
  }

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Erreur serveur (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}
