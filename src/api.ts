import { handleLocalApiRequest } from './localDb';
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
  SchoolDatabase,
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

  // Static hosts like Netlify (e.g. jegamaschool1.netlify.app) return HTML (404 page or SPA index.html) for /api/*
  if (!isJson && url.startsWith('/api/')) {
    staticLocalMode = true;
    return handleLocalApiRequest<T>(url, options, session);
  }

  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Erreur serveur (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}

export async function downloadBackupJson(session: SessionUser): Promise<SchoolDatabase> {
  return apiRequest<SchoolDatabase>('/api/admin/backup', { method: 'GET' }, session);
}
