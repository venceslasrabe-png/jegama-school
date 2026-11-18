import fs from 'fs';
import path from 'path';
import type { SchoolDatabase } from '../src/types';
import { createSeedDatabase } from '../src/shared/schoolEngine';

export {
  addAuditLog,
  buildAcademicYearArchive,
  computeDashboardSummary,
  computeMentionFromScore,
  computeStudentBalance,
  createPeriodsForYear,
  createSeedDatabase,
  recalculateClassBulletins,
  sanitizeDbForClient,
} from '../src/shared/schoolEngine';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'school-db.json');

export function loadDatabase(): SchoolDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedDatabase();
    saveDatabase(seed);
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as SchoolDatabase;
    if (!Array.isArray(parsed.archivedYears)) {
      parsed.archivedYears = [];
    }
    return parsed;
  } catch {
    const seed = createSeedDatabase();
    saveDatabase(seed);
    return seed;
  }
}

export function saveDatabase(db: SchoolDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}
