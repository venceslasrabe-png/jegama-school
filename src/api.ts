import { handleLocalApiRequest } from './localDb';
import type {
  AcademicYearArchive,
  AttendanceLog,
  AuditLog,
  Bulletin,
  CycleHourlyRate,
  DashboardSummary,
  EvaluationPeriod,
  FeeGridItem,
  Grade,
  ParentTutor,
  Payment,
  PaymentNotification,
  SchoolClass,
  SchoolDatabase,
  SchoolSettings,
  Student,
  Subject,
  Teacher,
  TeacherHourLog,
  TeacherPayslip,
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
  teachers: Teacher[];
  hourlyRates: CycleHourlyRate[];
  teacherHourLogs: TeacherHourLog[];
  teacherPayslips: TeacherPayslip[];
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

const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
let staticLocalMode = false;

export function isUsingLocalBrowserDatabase(): boolean {
  return staticLocalMode;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  session?: SessionUser | null
): Promise<T> {
  if (staticLocalMode && url.startsWith('/api/')) {
    return handleLocalApiRequest<T>(url, options, session);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (session) {
    headers['x-user-id'] = session.id;
    headers['x-user-role'] = session.role;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  } catch {
    if (url.startsWith('/api/')) {
      staticLocalMode = true;
      return handleLocalApiRequest<T>(url, options, session);
    }
    throw new Error('Connexion au serveur impossible.');
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  // Static hosts (e.g. Netlify) return HTML (404 or SPA index.html) for /api/*
  if (!isJson && url.startsWith('/api/')) {
    staticLocalMode = true;
    return handleLocalApiRequest<T>(url, options, session);
  }

  let data: unknown;
  try {
    data = isJson ? await res.json() : await res.text();
  } catch {
    // Empty or malformed JSON on a 404/405 static response -> fallback to local DB
    if (url.startsWith('/api/')) {
      staticLocalMode = true;
      return handleLocalApiRequest<T>(url, options, session);
    }
    throw new Error(`Réponse serveur invalide (${res.status}).`);
  }

  const hasBackendErrorField =
    typeof data === 'object' && data !== null && 'error' in data;

  // If a proxy/static host returned a 404/405/501 JSON without our backend's { error } schema,
  // no Express API is reachable -> switch seamlessly to persistent browser DB.
  if (
    !res.ok &&
    url.startsWith('/api/') &&
    (res.status === 404 || res.status === 405 || res.status === 501) &&
    !hasBackendErrorField
  ) {
    staticLocalMode = true;
    return handleLocalApiRequest<T>(url, options, session);
  }

  if (!res.ok) {
    const errMsg = hasBackendErrorField
      ? String((data as { error: unknown }).error)
      : `Erreur serveur (${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function downloadBackupJson(session: SessionUser): Promise<SchoolDatabase> {
  return apiRequest<SchoolDatabase>('/api/admin/backup', { method: 'GET' }, session);
}
