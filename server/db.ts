import fs from 'fs';
import path from 'path';
import type {
  AcademicYearArchive,
  ArchivedStudentRecord,
  AttendanceLog,
  AuditLog,
  Bulletin,
  DashboardSummary,
  EvaluationPeriod,
  SchoolDatabase,
  Student,
  UserRole,
} from '../src/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'school-db.json');

function getTodayStr(): string {
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

export function createSeedDatabase(): SchoolDatabase {
  const today = getTodayStr();
  const y1 = isoDaysAgo(1, 7, 25);
  const y1Out = isoDaysAgo(1, 13, 5);
  const y2 = isoDaysAgo(2, 7, 38);
  const y2Out = isoDaysAgo(2, 13, 10);

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
    },
    users: [
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
      // Grande Section (Maternelle Congolais)
      { id: 'sub-mat-lang', code: 'LAN', name: 'Langage & Éveil', cycle: 'Maternelle', program: 'Congolais', coefficient: 2, teacherName: 'Mme Sylvie Koubemba' },
      { id: 'sub-mat-graph', code: 'GRA', name: 'Graphisme & Pré-écriture', cycle: 'Maternelle', program: 'Congolais', coefficient: 2, teacherName: 'Mme Sylvie Koubemba' },
      { id: 'sub-mat-log', code: 'LOG', name: 'Logique & Calcul', cycle: 'Maternelle', program: 'Congolais', coefficient: 2, teacherName: 'Mme Sylvie Koubemba' },

      // CM2 A (Primaire Français)
      { id: 'sub-pri-fr', code: 'FRA', name: 'Français & Rédaction', cycle: 'Primaire', program: 'Français', coefficient: 4, teacherName: 'M. Patrick Mampouya' },
      { id: 'sub-pri-mat', code: 'MAT', name: 'Mathématiques', cycle: 'Primaire', program: 'Français', coefficient: 4, teacherName: 'M. Patrick Mampouya' },
      { id: 'sub-pri-hg', code: 'HGE', name: 'Histoire-Géographie', cycle: 'Primaire', program: 'Français', coefficient: 2, teacherName: 'Mme Carole Bakala' },
      { id: 'sub-pri-sci', code: 'SVT', name: 'Sciences & Technologie', cycle: 'Primaire', program: 'Français', coefficient: 2, teacherName: 'M. Patrick Mampouya' },

      // 4ème B (Collège Congolais)
      { id: 'sub-col-mat', code: 'MAT', name: 'Mathématiques', cycle: 'Collège', program: 'Congolais', coefficient: 4, teacherName: 'M. Hervé Kengue' },
      { id: 'sub-col-fr', code: 'FRA', name: 'Français', cycle: 'Collège', program: 'Congolais', coefficient: 4, teacherName: 'Mme Mireille Nkouka' },
      { id: 'sub-col-ang', code: 'ANG', name: 'Anglais', cycle: 'Collège', program: 'Congolais', coefficient: 2, teacherName: 'M. David Oko' },
      { id: 'sub-col-pc', code: 'PHY', name: 'Physique-Chimie', cycle: 'Collège', program: 'Congolais', coefficient: 3, teacherName: 'Mme Chantal Mbemba' },
      { id: 'sub-col-hg', code: 'HGE', name: 'Histoire-Géographie', cycle: 'Collège', program: 'Congolais', coefficient: 2, teacherName: 'M. Serge Ngatsono' },

      // 1ère S (Lycée Général Français)
      { id: 'sub-lyg-mat', code: 'MAT', name: 'Mathématiques Spécialité', cycle: 'Lycée Général', program: 'Français', coefficient: 5, teacherName: 'M. Alain Makosso' },
      { id: 'sub-lyg-pc', code: 'PHC', name: 'Physique-Chimie', cycle: 'Lycée Général', program: 'Français', coefficient: 4, teacherName: 'Mme Sandrine Bouanga' },
      { id: 'sub-lyg-svt', code: 'SVT', name: 'Sciences de la Vie et de la Terre', cycle: 'Lycée Général', program: 'Français', coefficient: 3, teacherName: 'M. Gervais Poaty' },
      { id: 'sub-lyg-fr', code: 'FRA', name: 'Français & Littérature', cycle: 'Lycée Général', program: 'Français', coefficient: 3, teacherName: 'Mme Laure Tchibinda' },
      { id: 'sub-lyg-ang', code: 'ANG', name: 'Anglais LV1', cycle: 'Lycée Général', program: 'Français', coefficient: 2, teacherName: 'M. David Oko' },

      // Terminale F2 (Lycée Technique Congolais)
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
        address: 'Avenue Charles de Gaulle, Mpita, Pointe-Noire',
        accessCode: '2468',
        failedAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'par-2',
        fullName: 'Mme Hortense Tchicaya',
        phone: '+242 05 534 19 22',
        address: 'Quartier Côte Sauvage, Pointe-Noire',
        accessCode: '1357',
        failedAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'par-3',
        fullName: 'M. Dieudonné Ngoma',
        phone: '+242 06 890 11 40',
        address: 'Tié-Tié, Rue Mboukou, Pointe-Noire',
        accessCode: '4321',
        failedAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'par-4',
        fullName: 'Mme Eugénie Loubaki',
        phone: '+242 06 441 72 15',
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
      // Today's gate scans
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
      // stu-1 (Chloé MAKOSSO - CM2 A) Trimestre 1
      { id: 'grd-1', studentId: 'stu-1', subjectId: 'sub-pri-fr', periodId: 'per-t1', values: [16, 17.5], average: 16.75, teacherAppreciation: 'Excellente maîtrise de l’expression écrite.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-2', studentId: 'stu-1', subjectId: 'sub-pri-mat', periodId: 'per-t1', values: [15.5, 16], average: 15.75, teacherAppreciation: 'Raisonnement rigoureux.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-3', studentId: 'stu-1', subjectId: 'sub-pri-hg', periodId: 'per-t1', values: [14, 15], average: 14.5, teacherAppreciation: 'Bonne participation orale.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-4', studentId: 'stu-1', subjectId: 'sub-pri-sci', periodId: 'per-t1', values: [17, 16], average: 16.5, teacherAppreciation: 'Curiosité scientifique remarquable.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },

      // stu-6 (Merveille BANZOUZI - CM2 A) Trimestre 1
      { id: 'grd-5', studentId: 'stu-6', subjectId: 'sub-pri-fr', periodId: 'per-t1', values: [13.5, 14], average: 13.75, teacherAppreciation: 'Travail sérieux, poursuivre les efforts.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-6', studentId: 'stu-6', subjectId: 'sub-pri-mat', periodId: 'per-t1', values: [12, 13], average: 12.5, teacherAppreciation: 'Progrès réguliers.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-7', studentId: 'stu-6', subjectId: 'sub-pri-hg', periodId: 'per-t1', values: [14, 14.5], average: 14.25, teacherAppreciation: 'Bon investissement.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-8', studentId: 'stu-6', subjectId: 'sub-pri-sci', periodId: 'per-t1', values: [13, 14], average: 13.5, teacherAppreciation: 'Ensemble satisfaisant.', updatedAt: '2026-12-10T10:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },

      // stu-3 (Grace MAKOSSO - 4ème B) Trimestre 1
      { id: 'grd-9', studentId: 'stu-3', subjectId: 'sub-col-mat', periodId: 'per-t1', values: [14, 15], average: 14.5, teacherAppreciation: 'Très bon trimestre en algèbre.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-10', studentId: 'stu-3', subjectId: 'sub-col-fr', periodId: 'per-t1', values: [15, 14.5], average: 14.75, teacherAppreciation: 'Style fluide et soigné.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-11', studentId: 'stu-3', subjectId: 'sub-col-ang', periodId: 'per-t1', values: [16, 16.5], average: 16.25, teacherAppreciation: 'Excellente aisance à l’oral.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-12', studentId: 'stu-3', subjectId: 'sub-col-pc', periodId: 'per-t1', values: [13.5, 14], average: 13.75, teacherAppreciation: 'Bonne démarche expérimentale.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-13', studentId: 'stu-3', subjectId: 'sub-col-hg', periodId: 'per-t1', values: [15, 14], average: 14.5, teacherAppreciation: 'Devoirs bien structurés.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },

      // stu-7 (Prisca MOUKOKO - 4ème B) Trimestre 1
      { id: 'grd-14', studentId: 'stu-7', subjectId: 'sub-col-mat', periodId: 'per-t1', values: [11, 12.5], average: 11.75, teacherAppreciation: 'Peut encore progresser.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-15', studentId: 'stu-7', subjectId: 'sub-col-fr', periodId: 'per-t1', values: [12, 13], average: 12.5, teacherAppreciation: 'Des efforts notables.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-16', studentId: 'stu-7', subjectId: 'sub-col-ang', periodId: 'per-t1', values: [13, 12], average: 12.5, teacherAppreciation: 'Participation correcte.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-17', studentId: 'stu-7', subjectId: 'sub-col-pc', periodId: 'per-t1', values: [10.5, 11.5], average: 11, teacherAppreciation: 'Revoir les leçons régulièrement.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-18', studentId: 'stu-7', subjectId: 'sub-col-hg', periodId: 'per-t1', values: [12.5, 13], average: 12.75, teacherAppreciation: 'Bon comportement.', updatedAt: '2026-12-11T11:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },

      // stu-2 (Kévin TCHICAYA - 1ère S) Trimestre 1
      { id: 'grd-19', studentId: 'stu-2', subjectId: 'sub-lyg-mat', periodId: 'per-t1', values: [15.5, 16.5], average: 16, teacherAppreciation: 'Esprit analytique affirmé.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-20', studentId: 'stu-2', subjectId: 'sub-lyg-pc', periodId: 'per-t1', values: [14.5, 15], average: 14.75, teacherAppreciation: 'Solides compétences.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-21', studentId: 'stu-2', subjectId: 'sub-lyg-svt', periodId: 'per-t1', values: [14, 13.5], average: 13.75, teacherAppreciation: 'Bon niveau général.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-22', studentId: 'stu-2', subjectId: 'sub-lyg-fr', periodId: 'per-t1', values: [13, 14], average: 13.5, teacherAppreciation: 'Dissertation maîtrisée.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-23', studentId: 'stu-2', subjectId: 'sub-lyg-ang', periodId: 'per-t1', values: [15, 15.5], average: 15.25, teacherAppreciation: 'Très bonne expression.', updatedAt: '2026-12-12T09:00:00.000Z', updatedBy: 'Mme Nadège Moukoko' },

      // stu-5 (Samuel LOUBAKI - Terminale F2) Trimestre 1
      { id: 'grd-24', studentId: 'stu-5', subjectId: 'sub-lyt-el', periodId: 'per-t1', values: [16, 17], average: 16.5, teacherAppreciation: 'Excellente maîtrise en laboratoire.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-25', studentId: 'stu-5', subjectId: 'sub-lyt-mat', periodId: 'per-t1', values: [14, 14.5], average: 14.25, teacherAppreciation: 'Sérieux et appliqué.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-26', studentId: 'stu-5', subjectId: 'sub-lyt-pc', periodId: 'per-t1', values: [13.5, 14], average: 13.75, teacherAppreciation: 'Bon travail.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
      { id: 'grd-27', studentId: 'stu-5', subjectId: 'sub-lyt-fr', periodId: 'per-t1', values: [12.5, 13], average: 12.75, teacherAppreciation: 'Satisfaisant.', updatedAt: '2026-12-12T10:30:00.000Z', updatedBy: 'Mme Nadège Moukoko' },
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
    archivedYears: [],
    counters: {
      cardSeq: 8,
      receiptSeq: 6,
    },
  };
}

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

export function computeStudentBalance(db: SchoolDatabase, student: Student) {
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
        (g) => g.studentId === stu.id && g.subjectId === sub.id && g.periodId === periodId
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

  for (const stu of activeStudents) {
    const bal = computeStudentBalance(db, stu);
    totalExpectedFcfa += bal.expected;
    totalCollectedFcfa += bal.paid;
    if (bal.remaining > 0) unpaidStudentsCount++;
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

  return {
    id: `arch-${Date.now()}`,
    academicYear: db.settings.currentAcademicYear,
    archivedAt: new Date().toISOString(),
    archivedBy: actor.fullName,
    source: 'cloture',
    notes: notes?.trim() || `Clôture automatique lors du passage à une nouvelle année académique.`,
    summary: {
      totalStudents: records.length,
      totalExpectedFcfa,
      totalCollectedFcfa,
      bulletinsCount: db.bulletins.length,
      averageScore: avgCount > 0 ? Math.round((avgSum / avgCount) * 100) / 100 : null,
      attendanceLogsCount: db.attendanceLogs.length,
    },
    records,
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
