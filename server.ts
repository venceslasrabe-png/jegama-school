import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  addAuditLog,
  buildAcademicYearArchive,
  buildTeacherPayslip,
  computeDashboardSummary,
  computeStudentBalance,
  createPeriodsForYear,
  createSeedDatabase,
  ensureArchiveSeedData,
  ensureTeacherSeedData,
  getTeacherCumulativeHours,
  loadDatabase,
  recalculateClassBulletins,
  saveDatabase,
} from './server/db';
import type {
  AcademicYearArchive,
  ArchivedStudentRecord,
  ArchivedTeacherRecord,
  AttendanceLog,
  CycleHourlyRate,
  FeeGridItem,
  Grade,
  ParentTutor,
  Payment,
  PaymentNotification,
  PayslipPaymentMethod,
  PayslipStatus,
  SchoolClass,
  SchoolDatabase,
  Student,
  Subject,
  Teacher,
  TeacherHourLog,
  UserAccount,
  UserRole,
} from './src/types';

interface ActorContext {
  id: string;
  fullName: string;
  role: UserRole;
}

function getActor(req: Request, db: SchoolDatabase): ActorContext | null {
  const userId = req.header('x-user-id');
  const roleHeader = req.header('x-user-role') as UserRole | undefined;
  if (!userId || !roleHeader) return null;

  if (roleHeader === 'parent') {
    const parent = db.parents.find((p) => p.id === userId);
    if (!parent) return null;
    return { id: parent.id, fullName: parent.fullName, role: 'parent' };
  }

  const user = db.users.find((u) => u.id === userId && u.active);
  if (!user) return null;
  return { id: user.id, fullName: user.fullName, role: user.role };
}

function requireRole(allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const db = loadDatabase();
    const actor = getActor(req, db);
    if (!actor) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    if (actor.role === 'direction') {
      res.status(403).json({
        error: 'Action refusée : le profil Direction générale est strictement en lecture seule.',
      });
      return;
    }
    if (!allowed.includes(actor.role)) {
      res.status(403).json({
        error: `Droits insuffisants pour le profil ${actor.role}.`,
      });
      return;
    }
    (req as Request & { actor?: ActorContext }).actor = actor;
    next();
  };
}

function sanitizeDbForClient(db: SchoolDatabase, actor: ActorContext | null) {
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
      attendanceLogs: db.attendanceLogs.filter((a) => myStudentIds.has(a.studentId)),
      grades: db.grades.filter((g) => myStudentIds.has(g.studentId)),
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
    attendanceLogs: db.attendanceLogs,
    grades: db.grades,
    bulletins: db.bulletins,
    auditLogs: db.auditLogs,
    archivedYears: db.archivedYears || [],
    summary: computeDashboardSummary(db),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Ensure initial DB exists
  loadDatabase();

  // --- AUTHENTICATION ---
  app.get('/api/auth/profiles', (_req, res) => {
    const db = loadDatabase();
    res.json({
      staffProfiles: db.users
        .filter((u) => u.active)
        .map(({ password: _p, ...u }) => u),
      schoolName: db.settings.schoolName,
      address: `${db.settings.address}, ${db.settings.city}`,
      academicYear: db.settings.currentAcademicYear,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const db = loadDatabase();
    const rawIdentifier = (username || '').trim().toLowerCase();
    const normalizedUsername = rawIdentifier.endsWith('@jegama-school.cg')
      ? rawIdentifier.replace('@jegama-school.cg', '')
      : rawIdentifier;
    const user = db.users.find(
      (u) => u.username.toLowerCase() === normalizedUsername
    );
    if (!user) {
      res.status(401).json({ error: 'Identifiant introuvable.' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ error: 'Compte utilisateur désactivé par l’administrateur.' });
      return;
    }
    if (user.password !== password) {
      res.status(401).json({ error: 'Mot de passe incorrect.' });
      return;
    }
    user.lastLogin = new Date().toISOString();
    saveDatabase(db);
    const { password: _p, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  app.post('/api/auth/parent-login', (req, res) => {
    const { cardId } = req.body as { cardId?: string };
    const db = loadDatabase();
    const normalizedCard = (cardId || '').trim().toUpperCase();
    const student = db.students.find((s) => s.cardId.toUpperCase() === normalizedCard);
    if (!student) {
      res.status(404).json({ error: 'Numéro de carte scolaire introuvable.' });
      return;
    }
    if (student.cardStatus !== 'active') {
      res.status(403).json({
        error: `Cette carte scolaire (${student.cardId}) est marquée comme ${student.cardStatus}. Utilisez le nouvel ID actif ou contactez la Scolarité.`,
      });
      return;
    }
    const parent = db.parents.find((p) => p.id === student.parentId);
    if (!parent) {
      res.status(404).json({ error: 'Dossier parent introuvable.' });
      return;
    }

    parent.failedAttempts = 0;
    parent.lockedUntil = null;
    saveDatabase(db);

    res.json({
      user: {
        id: parent.id,
        username: parent.phone,
        fullName: parent.fullName,
        role: 'parent' as UserRole,
        active: true,
        lastLogin: new Date().toISOString(),
      },
      initialStudentId: student.id,
    });
  });

  // --- FULL STATE FETCH ---
  app.get('/api/state', (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db);
    if (!actor) {
      res.status(401).json({ error: 'Non authentifié.' });
      return;
    }
    res.json(sanitizeDbForClient(db, actor));
  });

  // --- SCOLARITE: PARENTS & STUDENTS ---
  app.post('/api/parents', requireRole(['scolarite', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { fullName, phone, address, accessCode } = req.body as Partial<ParentTutor>;
    if (!fullName || !phone) {
      res.status(400).json({ error: 'Nom complet et téléphone requis.' });
      return;
    }
    const parent: ParentTutor = {
      id: `par-${Date.now()}`,
      fullName: fullName.trim(),
      phone: phone.trim(),
      address: (address || '').trim(),
      accessCode: (accessCode || String(Math.floor(1000 + Math.random() * 9000))).trim(),
      failedAttempts: 0,
      lockedUntil: null,
    };
    db.parents.push(parent);
    addAuditLog(db, actor, 'Création parent/tuteur', 'Parent', parent.id, parent.fullName);
    saveDatabase(db);
    res.status(201).json({ parent });
  });

  app.post('/api/students', requireRole(['scolarite', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const body = req.body as Partial<Student> & {
      newParent?: { fullName: string; phone: string; address: string; accessCode?: string };
    };

    if (!body.firstName || !body.lastName || !body.cycle || !body.program) {
      res.status(400).json({ error: 'Champs obligatoires manquants (prénom, nom, cycle, programme).' });
      return;
    }

    let parentId = body.parentId;
    if (!parentId && body.newParent?.fullName) {
      const newParent: ParentTutor = {
        id: `par-${Date.now()}`,
        fullName: body.newParent.fullName.trim(),
        phone: (body.newParent.phone || '').trim(),
        address: (body.newParent.address || '').trim(),
        accessCode: (
          body.newParent.accessCode || String(Math.floor(1000 + Math.random() * 9000))
        ).trim(),
        failedAttempts: 0,
        lockedUntil: null,
      };
      db.parents.push(newParent);
      parentId = newParent.id;
    }

    if (!parentId) {
      res.status(400).json({ error: 'Un parent ou tuteur doit être associé à l’élève.' });
      return;
    }

    // RG-01: Unique never-reused card ID
    db.counters.cardSeq += 1;
    const cardId = `JS-26-${String(db.counters.cardSeq).padStart(4, '0')}`;

    const defaultAvatars = [
      '/src/assets/images/student_avatar_1_1794906894904.jpg',
      '/src/assets/images/student_avatar_2_1794906895155.jpg',
      '/src/assets/images/student_avatar_3_1794906894849.jpg',
      '/src/assets/images/student_avatar_4_1794906895480.jpg',
    ];
    const autoPhoto =
      body.photoUrl || defaultAvatars[db.counters.cardSeq % defaultAvatars.length];

    const student: Student = {
      id: `stu-${Date.now()}`,
      cardId,
      cardStatus: 'active',
      replacedCardIds: [],
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim().toUpperCase(),
      birthDate: body.birthDate || '2014-01-01',
      birthPlace: (body.birthPlace || 'Pointe-Noire').trim(),
      gender: body.gender === 'F' ? 'F' : 'M',
      photoUrl: autoPhoto,
      cycle: body.cycle,
      program: body.program,
      classId: body.classId || null,
      parentId,
      academicYear: db.settings.currentAcademicYear,
      status: 'inscrit',
      createdAt: new Date().toISOString(),
    };

    db.students.push(student);

    // RG-02 & RF-SCO-06: Automatic Caisse payment notification
    const fee = db.feeGrid.find(
      (f) => f.cycle === student.cycle && f.program === student.program
    );
    const expectedFirstTranche =
      fee?.installments?.[0]?.amount ?? (fee ? fee.registrationFee : 100000);

    const notification: PaymentNotification = {
      id: `notif-${Date.now()}`,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      cardId: student.cardId,
      amountExpected: expectedFirstTranche,
      reason: `Inscription ${student.cycle} (Programme ${student.program}) · 1ère Tranche`,
      status: 'en_attente',
      createdAt: new Date().toISOString(),
      createdBy: actor.fullName,
    };
    db.paymentNotifications.unshift(notification);

    addAuditLog(
      db,
      actor,
      'Inscription élève',
      'Élève',
      student.cardId,
      `Inscription de ${student.firstName} ${student.lastName} (${student.cycle} · ${student.program}). Notification envoyée à la Caisse.`
    );
    saveDatabase(db);
    res.status(201).json({ student, notification });
  });

  app.put('/api/students/:id', requireRole(['scolarite', 'secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const idx = db.students.findIndex((s) => s.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Élève introuvable.' });
      return;
    }
    const existing = db.students[idx];
    const updates = req.body as Partial<Student>;
    db.students[idx] = {
      ...existing,
      firstName: updates.firstName !== undefined ? updates.firstName.trim() : existing.firstName,
      lastName: updates.lastName !== undefined ? updates.lastName.trim().toUpperCase() : existing.lastName,
      birthDate: updates.birthDate ?? existing.birthDate,
      birthPlace: updates.birthPlace ?? existing.birthPlace,
      gender: updates.gender ?? existing.gender,
      photoUrl: updates.photoUrl !== undefined && updates.photoUrl !== '' ? updates.photoUrl : existing.photoUrl,
      cycle: updates.cycle ?? existing.cycle,
      program: updates.program ?? existing.program,
      classId: updates.classId !== undefined ? updates.classId : existing.classId,
      parentId: updates.parentId ?? existing.parentId,
      status: updates.status ?? existing.status,
    };
    addAuditLog(
      db,
      actor,
      'Modification dossier élève',
      'Élève',
      existing.cardId,
      `Mise à jour du dossier de ${db.students[idx].firstName} ${db.students[idx].lastName}.`
    );
    saveDatabase(db);
    res.json({ student: db.students[idx] });
  });

  // RF-SCO-03: Re-enrollment without re-entering data
  app.post('/api/students/:id/reinscrire', requireRole(['scolarite', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const student = db.students.find((s) => s.id === req.params.id);
    if (!student) {
      res.status(404).json({ error: 'Élève introuvable.' });
      return;
    }
    const { nextCycle, nextClassId, nextAcademicYear } = req.body as {
      nextCycle?: Student['cycle'];
      nextClassId?: string | null;
      nextAcademicYear?: string;
    };

    if (nextCycle) student.cycle = nextCycle;
    if (nextClassId !== undefined) student.classId = nextClassId;
    student.academicYear = nextAcademicYear || db.settings.currentAcademicYear;
    student.status = 'reinscrit';

    const fee = db.feeGrid.find(
      (f) => f.cycle === student.cycle && f.program === student.program
    );
    const amountExpected = fee?.installments?.[0]?.amount ?? 120000;

    const notification: PaymentNotification = {
      id: `notif-${Date.now()}`,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      cardId: student.cardId,
      amountExpected,
      reason: `Réinscription ${student.academicYear} · ${student.cycle} (${student.program})`,
      status: 'en_attente',
      createdAt: new Date().toISOString(),
      createdBy: actor.fullName,
    };
    db.paymentNotifications.unshift(notification);

    addAuditLog(
      db,
      actor,
      'Réinscription élève',
      'Élève',
      student.cardId,
      `Réinscription ${student.academicYear} sans ressaisie pour ${student.firstName} ${student.lastName}.`
    );
    saveDatabase(db);
    res.json({ student, notification });
  });

  // RG-01: Deactivate lost card and issue replacement ID while keeping history
  app.post('/api/students/:id/replace-card', requireRole(['scolarite', 'secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const student = db.students.find((s) => s.id === req.params.id);
    if (!student) {
      res.status(404).json({ error: 'Élève introuvable.' });
      return;
    }
    const { reason } = req.body as { reason?: string };
    const oldCardId = student.cardId;
    student.replacedCardIds.push(oldCardId);
    db.counters.cardSeq += 1;
    const newCardId = `JS-26-${String(db.counters.cardSeq).padStart(4, '0')}`;
    student.cardId = newCardId;
    student.cardStatus = 'active';

    addAuditLog(
      db,
      actor,
      'Remplacement carte scolaire',
      'Carte',
      newCardId,
      `Ancienne carte ${oldCardId} désactivée (${reason || 'perte'}). Nouvelle carte ${newCardId} attribuée à ${student.firstName} ${student.lastName}.`
    );
    saveDatabase(db);
    res.json({ student, oldCardId, newCardId });
  });

  app.post('/api/students/:id/card-status', requireRole(['scolarite', 'surveillant', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const student = db.students.find((s) => s.id === req.params.id);
    if (!student) {
      res.status(404).json({ error: 'Élève introuvable.' });
      return;
    }
    const { cardStatus } = req.body as { cardStatus: Student['cardStatus'] };
    student.cardStatus = cardStatus;
    addAuditLog(
      db,
      actor,
      'Statut carte scolaire',
      'Carte',
      student.cardId,
      `Statut de la carte ${student.cardId} passé à "${cardStatus}".`
    );
    saveDatabase(db);
    res.json({ student });
  });

  // Fee Grid configuration
  app.put('/api/fee-grid/:id', requireRole(['scolarite', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const idx = db.feeGrid.findIndex((f) => f.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Grille tarifaire introuvable.' });
      return;
    }
    const body = req.body as Partial<FeeGridItem>;
    db.feeGrid[idx] = { ...db.feeGrid[idx], ...body };
    addAuditLog(
      db,
      actor,
      'Modification grille tarifaire',
      'Tarifs',
      db.feeGrid[idx].id,
      `${db.feeGrid[idx].cycle} (${db.feeGrid[idx].program}) mis à jour.`
    );
    saveDatabase(db);
    res.json({ feeGridItem: db.feeGrid[idx] });
  });

  // --- CAISSE: PAYMENTS & RECEIPTS ---
  app.post('/api/payments', requireRole(['caisse', 'scolarite', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { studentId, amountPaid, method, trancheLabel, notes, notificationId } = req.body as {
      studentId: string;
      amountPaid: number;
      method: Payment['method'];
      trancheLabel: string;
      notes?: string;
      notificationId?: string;
    };
    const student = db.students.find((s) => s.id === studentId);
    if (!student) {
      res.status(404).json({ error: 'Élève introuvable.' });
      return;
    }
    if (!amountPaid || amountPaid <= 0) {
      res.status(400).json({ error: 'Le montant encaissé doit être supérieur à 0 FCFA.' });
      return;
    }

    db.counters.receiptSeq += 1;
    const receiptNumber = `REC-2026-${String(db.counters.receiptSeq).padStart(4, '0')}`;
    const payment: Payment = {
      id: `pay-${Date.now()}`,
      receiptNumber,
      studentId: student.id,
      amountPaid: Number(amountPaid),
      method: method || 'Espèces',
      trancheLabel: trancheLabel || 'Versement scolarité',
      paidAt: new Date().toISOString(),
      cashierName: actor.fullName,
      notes: (notes || '').trim(),
    };
    db.payments.unshift(payment);

    if (notificationId) {
      const notif = db.paymentNotifications.find((n) => n.id === notificationId);
      if (notif) notif.status = 'encaisse';
    } else {
      const pendingNotif = db.paymentNotifications.find(
        (n) => n.studentId === student.id && n.status === 'en_attente'
      );
      if (pendingNotif) pendingNotif.status = 'encaisse';
    }

    const bal = computeStudentBalance(db, student);
    addAuditLog(
      db,
      actor,
      'Encaissement scolarité',
      'Reçu',
      receiptNumber,
      `${amountPaid} FCFA encaissés pour ${student.firstName} ${student.lastName} (${student.cardId}). Solde restant : ${bal.remaining} FCFA.`
    );
    saveDatabase(db);
    res.status(201).json({ payment, balance: bal });
  });

  // --- SECRETARIAT ACADEMIQUE: CLASSES, SUBJECTS, PERIODS, GRADES, BULLETINS ---
  app.post('/api/classes', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const body = req.body as Partial<SchoolClass>;
    if (!body.name || !body.cycle || !body.program) {
      res.status(400).json({ error: 'Nom, cycle et programme requis.' });
      return;
    }
    const cls: SchoolClass = {
      id: `cls-${Date.now()}`,
      name: body.name.trim(),
      cycle: body.cycle,
      program: body.program,
      room: (body.room || 'Salle à affecter').trim(),
      capacity: Number(body.capacity) || 30,
      headTeacher: (body.headTeacher || 'À désigner').trim(),
    };
    db.classes.push(cls);
    addAuditLog(db, actor, 'Création classe', 'Classe', cls.id, `${cls.name} (${cls.cycle} · ${cls.program})`);
    saveDatabase(db);
    res.status(201).json({ schoolClass: cls });
  });

  app.post('/api/subjects', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const body = req.body as Partial<Subject>;
    if (!body.name || !body.cycle || !body.program || !body.coefficient) {
      res.status(400).json({ error: 'Matière, cycle, programme et coefficient requis.' });
      return;
    }
    const subject: Subject = {
      id: `sub-${Date.now()}`,
      code: (body.code || body.name.slice(0, 3)).toUpperCase(),
      name: body.name.trim(),
      cycle: body.cycle,
      program: body.program,
      coefficient: Number(body.coefficient),
      teacherName: (body.teacherName || 'À désigner').trim(),
    };
    db.subjects.push(subject);
    addAuditLog(
      db,
      actor,
      'Ajout matière',
      'Matière',
      subject.code,
      `${subject.name} (Coeff ${subject.coefficient}) · ${subject.cycle}`
    );
    saveDatabase(db);
    res.status(201).json({ subject });
  });

  app.post('/api/periods/:id/toggle-lock', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const period = db.periods.find((p) => p.id === req.params.id);
    if (!period) {
      res.status(404).json({ error: 'Période introuvable.' });
      return;
    }
    period.status = period.status === 'ouvert' ? 'verrouille' : 'ouvert';
    if (period.status === 'verrouille') {
      period.validatedAt = new Date().toISOString();
      period.validatedBy = actor.fullName;
      for (const cls of db.classes) {
        recalculateClassBulletins(db, cls.id, period.id);
      }
    }
    addAuditLog(
      db,
      actor,
      period.status === 'verrouille' ? 'Verrouillage période' : 'Déverrouillage période',
      'Période',
      period.id,
      `${period.label} passé au statut "${period.status}".`
    );
    saveDatabase(db);
    res.json({ period });
  });

  app.post('/api/grades', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { studentId, subjectId, periodId, values, teacherAppreciation, overrideReason } = req.body as {
      studentId: string;
      subjectId: string;
      periodId: string;
      values: number[];
      teacherAppreciation?: string;
      overrideReason?: string;
    };

    const period = db.periods.find((p) => p.id === periodId);
    if (!period) {
      res.status(404).json({ error: 'Période introuvable.' });
      return;
    }

    const cleanValues = (values || []).map(Number).filter((v) => !Number.isNaN(v));
    if (cleanValues.length === 0) {
      res.status(400).json({ error: 'Au moins une note valide est requise.' });
      return;
    }
    for (const v of cleanValues) {
      if (v < 0 || v > 20) {
        res.status(400).json({ error: `Note hors barème (${v}). Les notes doivent être comprises entre 0 et 20.` });
        return;
      }
    }

    // RG-08: Post-lock correction must have reason and is traced in audit log
    if (period.status === 'verrouille' && !overrideReason?.trim()) {
      res.status(400).json({
        error: 'Période verrouillée : un motif de correction est obligatoire pour la traçabilité (RG-08).',
      });
      return;
    }

    const avg =
      Math.round((cleanValues.reduce((a, b) => a + b, 0) / cleanValues.length) * 100) / 100;
    const existingIdx = db.grades.findIndex(
      (g) => g.studentId === studentId && g.subjectId === subjectId && g.periodId === periodId
    );
    const oldAvg = existingIdx >= 0 ? db.grades[existingIdx].average : null;

    const record: Grade = {
      id: existingIdx >= 0 ? db.grades[existingIdx].id : `grd-${Date.now()}`,
      studentId,
      subjectId,
      periodId,
      values: cleanValues,
      average: avg,
      teacherAppreciation: (teacherAppreciation || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.fullName,
    };

    if (existingIdx >= 0) db.grades[existingIdx] = record;
    else db.grades.push(record);

    const student = db.students.find((s) => s.id === studentId);
    const subject = db.subjects.find((sub) => sub.id === subjectId);
    if (student?.classId) {
      recalculateClassBulletins(db, student.classId, periodId);
    }

    if (period.status === 'verrouille') {
      addAuditLog(
        db,
        actor,
        'Correction note après verrouillage',
        'Note',
        record.id,
        `${student?.firstName} ${student?.lastName} · ${subject?.name} (${period.label}) : ${oldAvg ?? '—'} -> ${avg}/20. Motif : ${overrideReason}`
      );
    }

    saveDatabase(db);
    res.json({ grade: record });
  });

  app.post('/api/grades/batch', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { periodId, entries, overrideReason } = req.body as {
      periodId: string;
      overrideReason?: string;
      entries: Array<{
        studentId: string;
        subjectId: string;
        values: number[];
        teacherAppreciation?: string;
        overrideReason?: string;
      }>;
    };

    const period = db.periods.find((p) => p.id === periodId);
    if (!period) {
      res.status(404).json({ error: 'Période introuvable.' });
      return;
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: 'Aucune note valide à enregistrer.' });
      return;
    }

    // Validate all entries before mutating
    const validatedEntries: Array<{
      studentId: string;
      subjectId: string;
      cleanValues: number[];
      teacherAppreciation: string;
      reason: string;
    }> = [];

    for (const item of entries) {
      const cleanValues = (item.values || []).map(Number).filter((v) => !Number.isNaN(v));
      if (cleanValues.length === 0) continue;

      for (const v of cleanValues) {
        if (v < 0 || v > 20) {
          res.status(400).json({
            error: `Note hors barème (${v}). Toutes les notes doivent être comprises entre 0 et 20.`,
          });
          return;
        }
      }

      const reason = (item.overrideReason || overrideReason || '').trim();
      if (period.status === 'verrouille' && !reason) {
        res.status(400).json({
          error: 'Période verrouillée : un motif de correction est obligatoire pour l’enregistrement groupé (RG-08).',
        });
        return;
      }

      validatedEntries.push({
        studentId: item.studentId,
        subjectId: item.subjectId,
        cleanValues,
        teacherAppreciation: (item.teacherAppreciation || '').trim(),
        reason,
      });
    }

    if (validatedEntries.length === 0) {
      res.status(400).json({ error: 'Saisissez au moins une note valide entre 0 et 20.' });
      return;
    }

    const savedGrades: Grade[] = [];
    const impactedClassIds = new Set<string>();
    const now = new Date().toISOString();

    for (let i = 0; i < validatedEntries.length; i++) {
      const entry = validatedEntries[i];
      const avg =
        Math.round(
          (entry.cleanValues.reduce((a, b) => a + b, 0) / entry.cleanValues.length) * 100
        ) / 100;

      const existingIdx = db.grades.findIndex(
        (g) =>
          g.studentId === entry.studentId &&
          g.subjectId === entry.subjectId &&
          g.periodId === periodId
      );
      const oldAvg = existingIdx >= 0 ? db.grades[existingIdx].average : null;

      const record: Grade = {
        id: existingIdx >= 0 ? db.grades[existingIdx].id : `grd-${Date.now()}-${i}`,
        studentId: entry.studentId,
        subjectId: entry.subjectId,
        periodId,
        values: entry.cleanValues,
        average: avg,
        teacherAppreciation: entry.teacherAppreciation,
        updatedAt: now,
        updatedBy: actor.fullName,
      };

      if (existingIdx >= 0) db.grades[existingIdx] = record;
      else db.grades.push(record);
      savedGrades.push(record);

      const stu = db.students.find((s) => s.id === entry.studentId);
      if (stu?.classId) {
        impactedClassIds.add(stu.classId);
      }

      if (period.status === 'verrouille') {
        const sub = db.subjects.find((s) => s.id === entry.subjectId);
        addAuditLog(
          db,
          actor,
          'Correction note après verrouillage',
          'Note',
          record.id,
          `${stu?.firstName} ${stu?.lastName} · ${sub?.name} (${period.label}) : ${oldAvg ?? '—'} -> ${avg}/20. Motif : ${entry.reason}`
        );
      }
    }

    for (const classId of impactedClassIds) {
      recalculateClassBulletins(db, classId, periodId);
    }

    addAuditLog(
      db,
      actor,
      'Enregistrement groupé de notes',
      'Note',
      periodId,
      `${savedGrades.length} fiche(s) de notes enregistrée(s) pour la période ${period.label}.`
    );

    saveDatabase(db);
    res.json({ savedCount: savedGrades.length, grades: savedGrades });
  });

  app.delete('/api/grades/:id', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const idx = db.grades.findIndex((g) => g.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Note introuvable.' });
      return;
    }

    const existing = db.grades[idx];
    const period = db.periods.find((p) => p.id === existing.periodId);
    const reason = String((req.body as { overrideReason?: string })?.overrideReason || '').trim();
    if (period?.status === 'verrouille' && !reason) {
      res.status(400).json({
        error: 'Période verrouillée : un motif est obligatoire pour supprimer une note (RG-08).',
      });
      return;
    }

    const stu = db.students.find((s) => s.id === existing.studentId);
    const sub = db.subjects.find((s) => s.id === existing.subjectId);
    db.grades.splice(idx, 1);

    if (stu?.classId) {
      recalculateClassBulletins(db, stu.classId, existing.periodId);
    }

    addAuditLog(
      db,
      actor,
      'Suppression de note',
      'Note',
      existing.id,
      `Note supprimée pour ${stu?.firstName || ''} ${stu?.lastName || ''} · ${sub?.name || ''} (${period?.label || existing.periodId})${reason ? `. Motif : ${reason}` : ''}`
    );

    saveDatabase(db);
    res.json({ deletedId: existing.id });
  });

  app.post('/api/bulletins/recalculate', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { classId, periodId } = req.body as { classId: string; periodId: string };
    const bulletins = recalculateClassBulletins(db, classId, periodId);
    addAuditLog(
      db,
      actor,
      'Calcul des bulletins',
      'Classe',
      classId,
      `Recalcul des moyennes, rangs et mentions pour la période ${periodId} (${bulletins.length} bulletins).`
    );
    saveDatabase(db);
    res.json({ bulletins });
  });

  app.post('/api/bulletins/:id/delivery', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const bulletin = db.bulletins.find((b) => b.id === req.params.id);
    if (!bulletin) {
      res.status(404).json({ error: 'Bulletin introuvable.' });
      return;
    }
    const { deliveryStatus, receivedBy, appreciation } = req.body as {
      deliveryStatus: 'a_editer' | 'valide' | 'imprime' | 'remis';
      receivedBy?: string;
      appreciation?: string;
    };

    const period = db.periods.find((p) => p.id === bulletin.periodId);
    // RG-06: Cannot mark as delivered unless period is validated/locked
    if (deliveryStatus === 'remis' && period?.status !== 'verrouille') {
      res.status(400).json({
        error: 'RG-06 : Un bulletin ne peut être remis qu’après validation et verrouillage de la période.',
      });
      return;
    }
    if (deliveryStatus === 'remis' && !receivedBy?.trim()) {
      res.status(400).json({
        error: 'Veuillez saisir le nom du parent ou tuteur ayant reçu le bulletin.',
      });
      return;
    }

    bulletin.deliveryStatus = deliveryStatus;
    if (appreciation !== undefined) bulletin.appreciation = appreciation.trim();
    const now = new Date().toISOString();
    if (deliveryStatus === 'valide' && !bulletin.validatedAt) bulletin.validatedAt = now;
    if (deliveryStatus === 'imprime') bulletin.printedAt = now;
    if (deliveryStatus === 'remis') {
      bulletin.deliveredAt = now;
      bulletin.receivedBy = receivedBy!.trim();
    }

    const stu = db.students.find((s) => s.id === bulletin.studentId);
    addAuditLog(
      db,
      actor,
      `Statut bulletin : ${deliveryStatus}`,
      'Bulletin',
      bulletin.id,
      `Bulletin de ${stu?.firstName} ${stu?.lastName} marqué "${deliveryStatus}"${receivedBy ? ` (Remis à ${receivedBy})` : ''}.`
    );
    saveDatabase(db);
    res.json({ bulletin });
  });

  // --- SURVEILLANCE & GUERITE: POINTAGE + OFFLINE SYNC ---
  app.post('/api/pointages/scan', requireRole(['surveillant', 'secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { cardId, manualType, status, reason } = req.body as {
      cardId: string;
      manualType?: 'entree' | 'sortie';
      status?: 'present' | 'retard' | 'absence';
      reason?: string;
    };

    const normalized = (cardId || '').trim().toUpperCase();
    const student = db.students.find(
      (s) => s.cardId.toUpperCase() === normalized || s.replacedCardIds.includes(normalized)
    );
    if (!student) {
      res.status(404).json({
        code: 'CARTE_INCONNUE',
        error: `Carte inconnue (${normalized}). Aucun élève enregistré avec cet identifiant.`,
      });
      return;
    }
    if (student.cardStatus !== 'active' || student.replacedCardIds.includes(normalized)) {
      res.status(403).json({
        code: 'CARTE_INVALIDE',
        student,
        error: `Alerte sécurité : la carte ${normalized} de ${student.firstName} ${student.lastName} est ${student.replacedCardIds.includes(normalized) ? 'remplacée/obsolète' : student.cardStatus}.`,
      });
      return;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayStudentLogs = db.attendanceLogs.filter(
      (a) => a.studentId === student.id && a.dateStr === dateStr
    );
    const lastLog = todayStudentLogs[todayStudentLogs.length - 1];
    // RG-03: Automatic alternation entry -> exit
    const autoType: 'entree' | 'sortie' =
      lastLog && lastLog.type === 'entree' ? 'sortie' : 'entree';
    const finalType = manualType || autoType;

    const isLateDefault =
      finalType === 'entree' &&
      todayStudentLogs.length === 0 &&
      (now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() > 45));

    const entry: AttendanceLog = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      studentId: student.id,
      cardId: student.cardId,
      type: finalType,
      timestamp: now.toISOString(),
      dateStr,
      status: status || (isLateDefault ? 'retard' : 'present'),
      reason: (reason || '').trim(),
      recordedBy: actor.fullName,
      correctedBy: manualType && manualType !== autoType ? actor.fullName : null,
      correctedAt: manualType && manualType !== autoType ? now.toISOString() : null,
      offlineSynced: true,
    };

    db.attendanceLogs.push(entry);
    if (manualType && manualType !== autoType) {
      addAuditLog(
        db,
        actor,
        'Correction manuelle pointage',
        'Pointage',
        entry.id,
        `Sens forcé à "${finalType}" pour ${student.firstName} ${student.lastName}. Motif : ${reason || 'non précisé'}`
      );
    }
    saveDatabase(db);
    res.status(201).json({ log: entry, student });
  });

  app.post('/api/pointages/absence', requireRole(['surveillant', 'secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { studentId, status, reason, dateStr } = req.body as {
      studentId: string;
      status: 'absence' | 'retard';
      reason: string;
      dateStr?: string;
    };
    const student = db.students.find((s) => s.id === studentId);
    if (!student) {
      res.status(404).json({ error: 'Élève introuvable.' });
      return;
    }
    const now = new Date();
    const targetDate =
      dateStr ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const entry: AttendanceLog = {
      id: `att-${Date.now()}`,
      studentId: student.id,
      cardId: student.cardId,
      type: 'entree',
      timestamp: now.toISOString(),
      dateStr: targetDate,
      status,
      reason: (reason || '').trim(),
      recordedBy: actor.fullName,
      correctedBy: null,
      correctedAt: null,
      offlineSynced: true,
    };
    db.attendanceLogs.push(entry);
    addAuditLog(
      db,
      actor,
      `Signalement ${status}`,
      'Pointage',
      entry.id,
      `${student.firstName} ${student.lastName} (${targetDate}) : ${reason}`
    );
    saveDatabase(db);
    res.status(201).json({ log: entry });
  });

  app.post('/api/pointages/sync', requireRole(['surveillant', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { queuedLogs } = req.body as {
      queuedLogs: Array<{
        cardId: string;
        type: 'entree' | 'sortie';
        timestamp: string;
        dateStr: string;
        status: 'present' | 'retard' | 'absence';
        reason: string;
      }>;
    };

    if (!Array.isArray(queuedLogs) || queuedLogs.length === 0) {
      res.status(400).json({ error: 'Aucun pointage hors-ligne à synchroniser.' });
      return;
    }

    let syncedCount = 0;
    for (const q of queuedLogs) {
      const stu = db.students.find(
        (s) => s.cardId.toUpperCase() === q.cardId.trim().toUpperCase()
      );
      if (!stu || stu.cardStatus !== 'active') continue;
      db.attendanceLogs.push({
        id: `att-sync-${Date.now()}-${syncedCount}`,
        studentId: stu.id,
        cardId: stu.cardId,
        type: q.type,
        timestamp: q.timestamp,
        dateStr: q.dateStr,
        status: q.status || 'present',
        reason: q.reason || '',
        recordedBy: `${actor.fullName} (Mode hors-ligne)`,
        correctedBy: null,
        correctedAt: null,
        offlineSynced: true,
      });
      syncedCount += 1;
    }

    addAuditLog(
      db,
      actor,
      'Synchronisation hors-ligne guérite',
      'Pointage',
      'BATCH',
      `${syncedCount} pointage(s) enregistré(s) en mode dégradé synchronisé(s).`
    );
    saveDatabase(db);
    res.json({ syncedCount });
  });

  // --- ADMIN: SETTINGS, USERS, BACKUP & RESTORE ---
  app.put('/api/admin/settings', requireRole(['admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    db.settings = { ...db.settings, ...req.body };
    addAuditLog(
      db,
      actor,
      'Modification paramètres système',
      'Système',
      'settings',
      'Paramètres généraux, seuils de mentions ou règles d’accès mis à jour.'
    );
    saveDatabase(db);
    res.json({ settings: db.settings });
  });

  app.post('/api/admin/users', requireRole(['admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { username, fullName, role, password } = req.body as Partial<UserAccount>;
    if (!username || !fullName || !role || !password) {
      res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
      return;
    }
    if (db.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
      res.status(409).json({ error: 'Cet identifiant existe déjà.' });
      return;
    }
    const newUser: UserAccount = {
      id: `usr-${Date.now()}`,
      username: username.trim().toLowerCase(),
      fullName: fullName.trim(),
      role,
      password,
      active: true,
      lastLogin: null,
    };
    db.users.push(newUser);
    addAuditLog(db, actor, 'Création compte utilisateur', 'Utilisateur', newUser.username, `${newUser.fullName} (${newUser.role})`);
    saveDatabase(db);
    const { password: _p, ...safeUser } = newUser;
    res.status(201).json({ user: safeUser });
  });

  app.post('/api/admin/users/:id/toggle', requireRole(['admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }
    if (target.id === actor.id) {
      res.status(400).json({ error: 'Impossible de désactiver votre propre compte administrateur.' });
      return;
    }
    target.active = !target.active;
    addAuditLog(
      db,
      actor,
      target.active ? 'Réactivation compte' : 'Désactivation compte',
      'Utilisateur',
      target.username,
      `${target.fullName} (${target.role})`
    );
    saveDatabase(db);
    const { password: _p, ...safeUser } = target;
    res.json({ user: safeUser });
  });

  app.get('/api/admin/backup', requireRole(['admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    db.settings.lastBackupAt = new Date().toISOString();
    addAuditLog(db, actor, 'Sauvegarde manuelle', 'Système', 'backup', 'Export complet de la base Jegama Scool.');
    saveDatabase(db);
    res.setHeader('Content-Disposition', `attachment; filename="jegama-scool-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(db);
  });

  app.post('/api/admin/restore', requireRole(['admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const payload = req.body as SchoolDatabase;
    if (!payload || !Array.isArray(payload.users) || !Array.isArray(payload.students) || !payload.settings) {
      res.status(400).json({ error: 'Fichier de sauvegarde JSON invalide.' });
      return;
    }
    if (!Array.isArray(payload.archivedYears)) {
      payload.archivedYears = [];
    }
    ensureTeacherSeedData(payload);
    ensureArchiveSeedData(payload);
    addAuditLog(
      payload,
      actor,
      'Restauration sauvegarde JSON',
      'Système',
      'restore',
      `Base restaurée (${payload.students.length} élève(s), ${payload.archivedYears.length} archive(s)).`
    );
    saveDatabase(payload);
    res.json({ ok: true });
  });

  app.post('/api/admin/academic-years/create', requireRole(['admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { newAcademicYear, archiveNotes, periodMode, resetTeacherLogs } = req.body as {
      newAcademicYear?: string;
      archiveNotes?: string;
      periodMode?: 'Trimestres' | 'Séquences';
      resetTeacherLogs?: boolean;
    };

    const nextYear = (newAcademicYear || '').trim();
    if (!nextYear) {
      res.status(400).json({ error: 'Veuillez indiquer le libellé de la nouvelle année académique (ex. 2027-2028).' });
      return;
    }
    if (nextYear === db.settings.currentAcademicYear) {
      res.status(400).json({ error: `L’année ${nextYear} est déjà l’année académique en cours.` });
      return;
    }

    const previousYear = db.settings.currentAcademicYear;
    const archive = buildAcademicYearArchive(db, actor, archiveNotes);
    db.archivedYears = db.archivedYears || [];
    db.archivedYears.unshift(archive);
    db.counters = db.counters || { cardSeq: 8, receiptSeq: 6 };
    db.counters.archivesSeeded = true;

    const nextMode = periodMode || db.settings.periodMode;
    db.settings.currentAcademicYear = nextYear;
    db.settings.periodMode = nextMode;
    db.periods = createPeriodsForYear(nextYear, nextMode);

    // Archive active students for rapid re-enrollment (RF-SCO-03) while keeping Card IDs & parent links
    db.students = db.students.map((stu) =>
      stu.status !== 'archive'
        ? { ...stu, status: 'archive', classId: null }
        : stu
    );

    // Reset current-year transactional data
    db.grades = [];
    db.bulletins = [];
    db.payments = [];
    db.paymentNotifications = [];
    db.attendanceLogs = [];
    if (resetTeacherLogs) {
      db.teacherHourLogs = [];
      db.teacherPayslips = [];
    }

    addAuditLog(
      db,
      actor,
      'Clôture & Nouvelle année académique',
      'Année académique',
      nextYear,
      `Année ${previousYear} archivée (${archive.summary.totalStudents} élève(s)). Ouverture de l’année académique ${nextYear}.`
    );
    saveDatabase(db);
    res.status(201).json({ archive, settings: db.settings });
  });

  app.post(
    '/api/admin/archives/import-excel',
    requireRole(['admin', 'secretariat', 'caisse', 'scolarite']),
    (req, res) => {
      const db = loadDatabase();
      const actor = getActor(req, db)!;
      const { academicYear, sourceFileName, notes, records, teacherRecords, mergeIntoArchiveId } =
        req.body as {
          academicYear?: string;
          sourceFileName?: string;
          notes?: string;
          records?: ArchivedStudentRecord[];
          teacherRecords?: ArchivedTeacherRecord[];
          mergeIntoArchiveId?: string;
        };

      const cleanYear = (academicYear || '').trim();
      if (!cleanYear && !mergeIntoArchiveId) {
        res.status(400).json({ error: 'Veuillez indiquer l’année académique correspondante (ex. 2025-2026).' });
        return;
      }
      const hasStudents = Array.isArray(records) && records.length > 0;
      const hasTeachers = Array.isArray(teacherRecords) && teacherRecords.length > 0;
      if (!hasStudents && !hasTeachers) {
        res.status(400).json({ error: 'Aucune ligne élève ou enseignant valide trouvée dans le fichier Excel.' });
        return;
      }

      const targetYearForIds = cleanYear || '2025-2026';

      const sanitizedRecords: ArchivedStudentRecord[] = (records || []).map((r, index) => {
        const expected = Number(r.totalExpectedFcfa) || 0;
        const paid = Number(r.totalPaidFcfa) || 0;
        const remaining =
          r.balanceRemainingFcfa !== undefined && r.balanceRemainingFcfa !== null
            ? Number(r.balanceRemainingFcfa) || 0
            : Math.max(0, expected - paid);
        const avg =
          r.generalAverage !== null && r.generalAverage !== undefined && !Number.isNaN(Number(r.generalAverage))
            ? Math.round(Number(r.generalAverage) * 100) / 100
            : null;
        return {
          cardId: (r.cardId || `ARC-${targetYearForIds.slice(2, 4)}-${String(index + 1).padStart(4, '0')}`).trim(),
          fullName: (r.fullName || `Élève ${index + 1}`).trim(),
          gender: (r.gender || '—').trim(),
          cycle: (r.cycle || '—').trim(),
          program: (r.program || 'Congolais').trim(),
          className: (r.className || '—').trim(),
          parentName: (r.parentName || '—').trim(),
          parentPhone: (r.parentPhone || '—').trim(),
          totalExpectedFcfa: expected,
          totalPaidFcfa: paid,
          balanceRemainingFcfa: remaining,
          generalAverage: avg,
          rank: r.rank !== null && r.rank !== undefined && !Number.isNaN(Number(r.rank)) ? Number(r.rank) : null,
          mention: (r.mention || '—').trim(),
          absencesCount: Number(r.absencesCount) || 0,
          latesCount: Number(r.latesCount) || 0,
        };
      });

      const sanitizedTeachers: ArchivedTeacherRecord[] = (teacherRecords || []).map((t, index) => {
        const hourlyRateFcfa = Number(t.hourlyRateFcfa) || 0;
        const totalHours = Number(t.totalHours) || 0;
        const totalPaidFcfa =
          t.totalPaidFcfa !== undefined && t.totalPaidFcfa !== null
            ? Number(t.totalPaidFcfa) || 0
            : Math.round(hourlyRateFcfa * totalHours);
        return {
          matricule: (t.matricule || `ENS-ARC-${String(index + 1).padStart(3, '0')}`).trim(),
          fullName: (t.fullName || `Enseignant ${index + 1}`).trim(),
          specialty: (t.specialty || '—').trim(),
          contractType: (t.contractType || 'Permanent').trim(),
          cycles: (t.cycles || '—').trim(),
          hourlyRateFcfa,
          totalHours,
          totalPaidFcfa,
        };
      });

      db.archivedYears = db.archivedYears || [];
      db.counters = db.counters || { cardSeq: 8, receiptSeq: 6 };
      db.counters.archivesSeeded = true;

      const existingArchive = mergeIntoArchiveId
        ? db.archivedYears.find((a) => a.id === mergeIntoArchiveId)
        : undefined;

      if (mergeIntoArchiveId && !existingArchive) {
        res.status(404).json({ error: 'Archive cible introuvable pour la fusion Excel.' });
        return;
      }

      if (existingArchive) {
        const mergedRecords = [...existingArchive.records];
        for (const incoming of sanitizedRecords) {
          const idx = mergedRecords.findIndex(
            (r) =>
              r.cardId.toLowerCase() === incoming.cardId.toLowerCase() ||
              (r.fullName.toLowerCase() === incoming.fullName.toLowerCase() &&
                r.className.toLowerCase() === incoming.className.toLowerCase())
          );
          if (idx >= 0) mergedRecords[idx] = incoming;
          else mergedRecords.push(incoming);
        }

        const mergedTeachers = [...(existingArchive.teacherRecords || [])];
        for (const incomingT of sanitizedTeachers) {
          const idx = mergedTeachers.findIndex(
            (t) =>
              t.matricule.toLowerCase() === incomingT.matricule.toLowerCase() ||
              t.fullName.toLowerCase() === incomingT.fullName.toLowerCase()
          );
          if (idx >= 0) mergedTeachers[idx] = incomingT;
          else mergedTeachers.push(incomingT);
        }

        const totalExpectedFcfa = mergedRecords.reduce((s, r) => s + r.totalExpectedFcfa, 0);
        const totalCollectedFcfa = mergedRecords.reduce((s, r) => s + r.totalPaidFcfa, 0);
        const avgRows = mergedRecords.filter((r) => r.generalAverage !== null);
        const averageScore =
          avgRows.length > 0
            ? Math.round((avgRows.reduce((s, r) => s + (r.generalAverage || 0), 0) / avgRows.length) * 100) / 100
            : null;
        const totalTeacherHours =
          Math.round(mergedTeachers.reduce((s, t) => s + t.totalHours, 0) * 100) / 100;
        const totalPayrollFcfa = mergedTeachers.reduce((s, t) => s + t.totalPaidFcfa, 0);

        existingArchive.records = mergedRecords;
        existingArchive.teacherRecords = mergedTeachers;
        existingArchive.archivedAt = new Date().toISOString();
        existingArchive.archivedBy = actor.fullName;
        if (notes?.trim()) {
          existingArchive.notes = existingArchive.notes
            ? `${existingArchive.notes} · ${notes.trim()}`
            : notes.trim();
        }
        existingArchive.summary = {
          totalStudents: mergedRecords.length,
          totalExpectedFcfa,
          totalCollectedFcfa,
          bulletinsCount: avgRows.length,
          averageScore,
          attendanceLogsCount: mergedRecords.reduce((s, r) => s + r.absencesCount + r.latesCount, 0),
          totalTeachers: mergedTeachers.length,
          totalTeacherHours,
          totalPayrollFcfa,
        };

        addAuditLog(
          db,
          actor,
          'Complément archive Excel',
          'Archive',
          existingArchive.academicYear,
          `Archive ${existingArchive.academicYear} complétée depuis "${sourceFileName || 'import.xlsx'}" (+${sanitizedRecords.length} élève(s), +${sanitizedTeachers.length} enseignant(s)).`
        );
        saveDatabase(db);
        res.status(200).json({ archive: existingArchive });
        return;
      }

      const totalExpectedFcfa = sanitizedRecords.reduce((s, r) => s + r.totalExpectedFcfa, 0);
      const totalCollectedFcfa = sanitizedRecords.reduce((s, r) => s + r.totalPaidFcfa, 0);
      const avgRows = sanitizedRecords.filter((r) => r.generalAverage !== null);
      const averageScore =
        avgRows.length > 0
          ? Math.round((avgRows.reduce((s, r) => s + (r.generalAverage || 0), 0) / avgRows.length) * 100) / 100
          : null;
      const totalTeacherHours =
        Math.round(sanitizedTeachers.reduce((s, t) => s + t.totalHours, 0) * 100) / 100;
      const totalPayrollFcfa = sanitizedTeachers.reduce((s, t) => s + t.totalPaidFcfa, 0);

      const archive: AcademicYearArchive = {
        id: `arch-xls-${Date.now()}`,
        academicYear: cleanYear,
        archivedAt: new Date().toISOString(),
        archivedBy: actor.fullName,
        source: 'import_excel',
        sourceFileName: sourceFileName || 'import.xlsx',
        notes: notes?.trim() || 'Archive importée depuis un fichier Excel.',
        summary: {
          totalStudents: sanitizedRecords.length,
          totalExpectedFcfa,
          totalCollectedFcfa,
          bulletinsCount: avgRows.length,
          averageScore,
          attendanceLogsCount: sanitizedRecords.reduce((s, r) => s + r.absencesCount + r.latesCount, 0),
          totalTeachers: sanitizedTeachers.length,
          totalTeacherHours,
          totalPayrollFcfa,
        },
        records: sanitizedRecords,
        teacherRecords: sanitizedTeachers,
      };

      db.archivedYears.unshift(archive);

      addAuditLog(
        db,
        actor,
        'Importation archive Excel',
        'Archive',
        cleanYear,
        `Archive ${cleanYear} importée depuis "${archive.sourceFileName}" (${sanitizedRecords.length} élève(s), ${sanitizedTeachers.length} enseignant(s)).`
      );
      saveDatabase(db);
      res.status(201).json({ archive });
    }
  );

  app.post(
    '/api/admin/archives/manual',
    requireRole(['admin', 'secretariat', 'caisse', 'scolarite']),
    (req, res) => {
      const db = loadDatabase();
      const actor = getActor(req, db)!;
      const {
        academicYear,
        notes,
        records,
        teacherRecords,
        summaryOverrides,
      } = req.body as {
        academicYear?: string;
        notes?: string;
        records?: ArchivedStudentRecord[];
        teacherRecords?: ArchivedTeacherRecord[];
        summaryOverrides?: {
          totalStudents?: number;
          totalExpectedFcfa?: number;
          totalCollectedFcfa?: number;
          averageScore?: number | null;
          totalTeachers?: number;
          totalPayrollFcfa?: number;
        };
      };

      const cleanYear = (academicYear || '').trim();
      if (!cleanYear) {
        res.status(400).json({ error: 'Veuillez indiquer l’année académique à archiver (ex. 2023-2024).' });
        return;
      }

      const sanitizedRecords: ArchivedStudentRecord[] = (records || [])
        .filter((r) => (r.fullName || '').trim().length > 0)
        .map((r, index) => {
          const expected = Number(r.totalExpectedFcfa) || 0;
          const paid = Number(r.totalPaidFcfa) || 0;
          const remaining =
            r.balanceRemainingFcfa !== undefined && r.balanceRemainingFcfa !== null
              ? Number(r.balanceRemainingFcfa) || 0
              : Math.max(0, expected - paid);
          const avg =
            r.generalAverage !== null && r.generalAverage !== undefined && !Number.isNaN(Number(r.generalAverage))
              ? Math.round(Number(r.generalAverage) * 100) / 100
              : null;
          return {
            cardId: (r.cardId || `ARC-${cleanYear.slice(2, 4)}-${String(index + 1).padStart(4, '0')}`).trim(),
            fullName: r.fullName.trim(),
            gender: (r.gender || '—').trim(),
            cycle: (r.cycle || '—').trim(),
            program: (r.program || 'Congolais').trim(),
            className: (r.className || '—').trim(),
            parentName: (r.parentName || '—').trim(),
            parentPhone: (r.parentPhone || '—').trim(),
            totalExpectedFcfa: expected,
            totalPaidFcfa: paid,
            balanceRemainingFcfa: remaining,
            generalAverage: avg,
            rank: r.rank !== null && r.rank !== undefined && !Number.isNaN(Number(r.rank)) ? Number(r.rank) : null,
            mention: (r.mention || '—').trim(),
            absencesCount: Number(r.absencesCount) || 0,
            latesCount: Number(r.latesCount) || 0,
          };
        });

      const sanitizedTeachers: ArchivedTeacherRecord[] = (teacherRecords || [])
        .filter((t) => (t.fullName || '').trim().length > 0)
        .map((t, index) => {
          const hourlyRateFcfa = Number(t.hourlyRateFcfa) || 0;
          const totalHours = Number(t.totalHours) || 0;
          const totalPaidFcfa =
            t.totalPaidFcfa !== undefined && t.totalPaidFcfa !== null
              ? Number(t.totalPaidFcfa) || 0
              : Math.round(hourlyRateFcfa * totalHours);
          return {
            matricule: (t.matricule || `ENS-ARC-${String(index + 1).padStart(3, '0')}`).trim(),
            fullName: t.fullName.trim(),
            specialty: (t.specialty || '—').trim(),
            contractType: (t.contractType || 'Permanent').trim(),
            cycles: (t.cycles || '—').trim(),
            hourlyRateFcfa,
            totalHours,
            totalPaidFcfa,
          };
        });

      const avgRows = sanitizedRecords.filter((r) => r.generalAverage !== null);
      const computedAvg =
        avgRows.length > 0
          ? Math.round((avgRows.reduce((s, r) => s + (r.generalAverage || 0), 0) / avgRows.length) * 100) / 100
          : null;

      const totalStudents =
        sanitizedRecords.length > 0
          ? sanitizedRecords.length
          : Math.max(0, Number(summaryOverrides?.totalStudents) || 0);
      const totalExpectedFcfa =
        sanitizedRecords.length > 0
          ? sanitizedRecords.reduce((s, r) => s + r.totalExpectedFcfa, 0)
          : Math.max(0, Number(summaryOverrides?.totalExpectedFcfa) || 0);
      const totalCollectedFcfa =
        sanitizedRecords.length > 0
          ? sanitizedRecords.reduce((s, r) => s + r.totalPaidFcfa, 0)
          : Math.max(0, Number(summaryOverrides?.totalCollectedFcfa) || 0);
      const averageScore =
        computedAvg !== null
          ? computedAvg
          : summaryOverrides?.averageScore !== null &&
              summaryOverrides?.averageScore !== undefined &&
              !Number.isNaN(Number(summaryOverrides.averageScore))
            ? Math.round(Number(summaryOverrides.averageScore) * 100) / 100
            : null;
      const totalTeachers =
        sanitizedTeachers.length > 0
          ? sanitizedTeachers.length
          : Math.max(0, Number(summaryOverrides?.totalTeachers) || 0);
      const totalTeacherHours =
        Math.round(sanitizedTeachers.reduce((s, t) => s + t.totalHours, 0) * 100) / 100;
      const totalPayrollFcfa =
        sanitizedTeachers.length > 0
          ? sanitizedTeachers.reduce((s, t) => s + t.totalPaidFcfa, 0)
          : Math.max(0, Number(summaryOverrides?.totalPayrollFcfa) || 0);

      if (
        totalStudents === 0 &&
        totalCollectedFcfa === 0 &&
        totalTeachers === 0 &&
        totalPayrollFcfa === 0 &&
        !(notes || '').trim()
      ) {
        res.status(400).json({
          error: 'Veuillez saisir au moins un dossier élève, enseignant ou un bilan chiffré pour archiver cette année.',
        });
        return;
      }

      const archive: AcademicYearArchive = {
        id: `arch-man-${Date.now()}`,
        academicYear: cleanYear,
        archivedAt: new Date().toISOString(),
        archivedBy: actor.fullName,
        source: 'manuel',
        notes: notes?.trim() || 'Archive d’année antérieure enregistrée manuellement.',
        summary: {
          totalStudents,
          totalExpectedFcfa,
          totalCollectedFcfa,
          bulletinsCount: avgRows.length || totalStudents,
          averageScore,
          attendanceLogsCount: sanitizedRecords.reduce((s, r) => s + r.absencesCount + r.latesCount, 0),
          totalTeachers,
          totalTeacherHours,
          totalPayrollFcfa,
        },
        records: sanitizedRecords,
        teacherRecords: sanitizedTeachers,
      };

      db.archivedYears = db.archivedYears || [];
      db.archivedYears.unshift(archive);
      db.counters = db.counters || { cardSeq: 8, receiptSeq: 6 };
      db.counters.archivesSeeded = true;

      addAuditLog(
        db,
        actor,
        'Archivage manuel année antérieure',
        'Archive',
        cleanYear,
        `Archive ${cleanYear} enregistrée (${totalStudents} élève(s), ${totalTeachers} enseignant(s)).`
      );
      saveDatabase(db);
      res.status(201).json({ archive });
    }
  );

  app.delete('/api/admin/archives/:id', requireRole(['admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    db.archivedYears = db.archivedYears || [];
    const target = db.archivedYears.find((a) => a.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Archive introuvable.' });
      return;
    }
    db.archivedYears = db.archivedYears.filter((a) => a.id !== req.params.id);
    addAuditLog(
      db,
      actor,
      'Suppression archive',
      'Archive',
      target.academicYear,
      `Archive ${target.academicYear} (${target.source}) supprimée.`
    );
    saveDatabase(db);
    res.json({ ok: true });
  });

  // --- CORPS ENSEIGNANTS: DONNEES, TAUX HORAIRES & BULLETINS DE PAYE ---
  app.post('/api/teachers', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const body = req.body as Partial<Teacher>;
    if (!body.firstName?.trim() || !body.lastName?.trim() || !body.specialty?.trim()) {
      res.status(400).json({ error: 'Prénom, nom et spécialité sont obligatoires.' });
      return;
    }
    db.counters.teacherSeq = (db.counters.teacherSeq || db.teachers.length) + 1;
    const matricule = `ENS-26-${String(db.counters.teacherSeq).padStart(3, '0')}`;
    const teacher: Teacher = {
      id: `tch-${Date.now()}`,
      matricule,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim().toUpperCase(),
      gender: body.gender === 'F' ? 'F' : 'M',
      phone: (body.phone || '').trim(),
      email: (body.email || '').trim(),
      address: (body.address || 'Pointe-Noire').trim(),
      photoUrl: body.photoUrl || '',
      specialty: body.specialty.trim(),
      diploma: (body.diploma || 'Licence / Master').trim(),
      cycles: Array.isArray(body.cycles) && body.cycles.length > 0 ? body.cycles : ['Collège'],
      programs: Array.isArray(body.programs) && body.programs.length > 0 ? body.programs : ['Congolais'],
      contractType: body.contractType || 'Permanent',
      hourlyRateFcfa: Math.max(0, Number(body.hourlyRateFcfa) || 5500),
      weeklyHoursQuota: Math.max(0, Number(body.weeklyHoursQuota) || 18),
      baseBonusFcfa: Math.max(0, Number(body.baseBonusFcfa) || 0),
      cnssRatePercent: Math.max(0, Number(body.cnssRatePercent ?? 0) || 0),
      hireDate: body.hireDate || new Date().toISOString().slice(0, 10),
      bankOrMobileAccount: (body.bankOrMobileAccount || 'Caisse établissement').trim(),
      status: body.status || 'actif',
    };
    db.teachers.unshift(teacher);
    addAuditLog(
      db,
      actor,
      'Ajout enseignant',
      'Corps enseignants',
      teacher.matricule,
      `${teacher.firstName} ${teacher.lastName} · ${teacher.specialty} (${teacher.hourlyRateFcfa} FCFA/h)`
    );
    saveDatabase(db);
    res.status(201).json({ teacher });
  });

  app.put('/api/teachers/:id', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const idx = db.teachers.findIndex((t) => t.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Enseignant introuvable.' });
      return;
    }
    const existing = db.teachers[idx];
    const updates = req.body as Partial<Teacher>;
    db.teachers[idx] = {
      ...existing,
      firstName: updates.firstName !== undefined ? updates.firstName.trim() : existing.firstName,
      lastName: updates.lastName !== undefined ? updates.lastName.trim().toUpperCase() : existing.lastName,
      gender: updates.gender ?? existing.gender,
      phone: updates.phone !== undefined ? updates.phone.trim() : existing.phone,
      email: updates.email !== undefined ? updates.email.trim() : existing.email,
      address: updates.address !== undefined ? updates.address.trim() : existing.address,
      photoUrl: updates.photoUrl !== undefined ? updates.photoUrl : existing.photoUrl,
      specialty: updates.specialty !== undefined ? updates.specialty.trim() : existing.specialty,
      diploma: updates.diploma !== undefined ? updates.diploma.trim() : existing.diploma,
      cycles: Array.isArray(updates.cycles) && updates.cycles.length > 0 ? updates.cycles : existing.cycles,
      programs: Array.isArray(updates.programs) && updates.programs.length > 0 ? updates.programs : existing.programs,
      contractType: updates.contractType ?? existing.contractType,
      hourlyRateFcfa: updates.hourlyRateFcfa !== undefined ? Math.max(0, Number(updates.hourlyRateFcfa)) : existing.hourlyRateFcfa,
      weeklyHoursQuota: updates.weeklyHoursQuota !== undefined ? Math.max(0, Number(updates.weeklyHoursQuota)) : existing.weeklyHoursQuota,
      baseBonusFcfa: updates.baseBonusFcfa !== undefined ? Math.max(0, Number(updates.baseBonusFcfa)) : existing.baseBonusFcfa,
      cnssRatePercent: updates.cnssRatePercent !== undefined ? Math.max(0, Number(updates.cnssRatePercent)) : existing.cnssRatePercent,
      hireDate: updates.hireDate ?? existing.hireDate,
      bankOrMobileAccount: updates.bankOrMobileAccount !== undefined ? updates.bankOrMobileAccount.trim() : existing.bankOrMobileAccount,
      status: updates.status ?? existing.status,
    };
    addAuditLog(
      db,
      actor,
      'Mise à jour fiche enseignant',
      'Corps enseignants',
      existing.matricule,
      `${db.teachers[idx].firstName} ${db.teachers[idx].lastName} · Taux ${db.teachers[idx].hourlyRateFcfa} FCFA/h`
    );
    saveDatabase(db);
    res.json({ teacher: db.teachers[idx] });
  });

  app.delete('/api/teachers/:id', requireRole(['secretariat', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const target = db.teachers.find((t) => t.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Enseignant introuvable.' });
      return;
    }
    db.teachers = db.teachers.filter((t) => t.id !== req.params.id);
    addAuditLog(
      db,
      actor,
      'Suppression fiche enseignant',
      'Corps enseignants',
      target.matricule,
      `${target.firstName} ${target.lastName} supprimé du répertoire actif.`
    );
    saveDatabase(db);
    res.json({ ok: true });
  });

  app.put('/api/hourly-rates/:id', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const idx = db.hourlyRates.findIndex((r) => r.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Barème horaire introuvable.' });
      return;
    }
    const { baseHourlyRateFcfa, overtimeHourlyRateFcfa, headTeacherMonthlyBonusFcfa, applyToMatchingTeachers } =
      req.body as Partial<CycleHourlyRate> & { applyToMatchingTeachers?: boolean };

    const updated: CycleHourlyRate = {
      ...db.hourlyRates[idx],
      baseHourlyRateFcfa:
        baseHourlyRateFcfa !== undefined
          ? Math.max(0, Number(baseHourlyRateFcfa))
          : db.hourlyRates[idx].baseHourlyRateFcfa,
      overtimeHourlyRateFcfa:
        overtimeHourlyRateFcfa !== undefined
          ? Math.max(0, Number(overtimeHourlyRateFcfa))
          : db.hourlyRates[idx].overtimeHourlyRateFcfa,
      headTeacherMonthlyBonusFcfa:
        headTeacherMonthlyBonusFcfa !== undefined
          ? Math.max(0, Number(headTeacherMonthlyBonusFcfa))
          : db.hourlyRates[idx].headTeacherMonthlyBonusFcfa,
    };
    db.hourlyRates[idx] = updated;

    let syncedTeachersCount = 0;
    if (applyToMatchingTeachers) {
      db.teachers = db.teachers.map((t) => {
        if (t.cycles.includes(updated.cycle) && t.programs.includes(updated.program)) {
          syncedTeachersCount += 1;
          return { ...t, hourlyRateFcfa: updated.baseHourlyRateFcfa };
        }
        return t;
      });
    }

    addAuditLog(
      db,
      actor,
      'Mise à jour barème horaire',
      'Taux horaires',
      updated.id,
      `${updated.cycle} (${updated.program}) : ${updated.baseHourlyRateFcfa} FCFA/h (suppl. ${updated.overtimeHourlyRateFcfa} FCFA/h)${syncedTeachersCount > 0 ? ` · appliqué à ${syncedTeachersCount} enseignant(s)` : ''}.`
    );
    saveDatabase(db);
    res.json({ hourlyRate: updated, syncedTeachersCount });
  });

  app.post('/api/teacher-hours', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { teacherId, date, month, hours, classOrSubject, notes } = req.body as {
      teacherId?: string;
      date?: string;
      month?: string;
      hours?: number;
      classOrSubject?: string;
      notes?: string;
    };

    const teacher = db.teachers.find((t) => t.id === teacherId);
    if (!teacher) {
      res.status(404).json({ error: 'Enseignant introuvable.' });
      return;
    }
    const cleanHours = Number(hours);
    if (Number.isNaN(cleanHours) || cleanHours <= 0 || cleanHours > 250) {
      res.status(400).json({ error: 'Veuillez saisir un nombre d’heures valide (> 0).' });
      return;
    }

    const cleanDate = (date || new Date().toISOString().slice(0, 10)).trim();
    const cleanMonth = (month || cleanDate.slice(0, 7)).trim();
    const log: TeacherHourLog = {
      id: `hlog-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      teacherId: teacher.id,
      month: cleanMonth,
      date: cleanDate,
      hours: Math.round(cleanHours * 100) / 100,
      classOrSubject: (classOrSubject || teacher.specialty).trim(),
      notes: (notes || '').trim(),
      recordedBy: actor.fullName,
      createdAt: new Date().toISOString(),
    };

    db.teacherHourLogs = db.teacherHourLogs || [];
    db.teacherHourLogs.unshift(log);
    const cumulativeHours = getTeacherCumulativeHours(db.teacherHourLogs, teacher.id, cleanMonth);

    addAuditLog(
      db,
      actor,
      'Enregistrement heures enseignant',
      'Cumul heures',
      teacher.matricule,
      `${teacher.firstName} ${teacher.lastName} · +${log.hours} h (${cleanMonth}) · Cumul : ${cumulativeHours} h × ${teacher.hourlyRateFcfa} FCFA = ${Math.round(cumulativeHours * teacher.hourlyRateFcfa)} FCFA`
    );
    saveDatabase(db);
    res.status(201).json({ hourLog: log, cumulativeHours });
  });

  app.delete('/api/teacher-hours/:id', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    db.teacherHourLogs = db.teacherHourLogs || [];
    const target = db.teacherHourLogs.find((l) => l.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Relevé d’heures introuvable.' });
      return;
    }
    db.teacherHourLogs = db.teacherHourLogs.filter((l) => l.id !== req.params.id);
    const teacher = db.teachers.find((t) => t.id === target.teacherId);
    addAuditLog(
      db,
      actor,
      'Suppression relevé d’heures',
      'Cumul heures',
      teacher?.matricule || target.teacherId,
      `Retrait de ${target.hours} h du ${target.date} (${target.month}).`
    );
    saveDatabase(db);
    res.json({ ok: true });
  });

  app.post('/api/payslips', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const body = req.body as {
      teacherId: string;
      month: string;
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
      status?: PayslipStatus;
    };

    const teacher = db.teachers.find((t) => t.id === body.teacherId);
    if (!teacher) {
      res.status(404).json({ error: 'Enseignant introuvable.' });
      return;
    }
    if (!body.month) {
      res.status(400).json({ error: 'Le mois de paie est requis.' });
      return;
    }

    db.counters.payslipSeq = (db.counters.payslipSeq || db.teacherPayslips.length) + 1;
    const payslipNumber = `PAIE-2026-${String(db.counters.payslipSeq).padStart(4, '0')}`;
    const desiredStatus: PayslipStatus = body.status || 'valide';
    const now = new Date().toISOString();

    const payslip = buildTeacherPayslip({
      id: `pay-tch-${Date.now()}`,
      payslipNumber,
      teacher,
      month: body.month,
      academicYear: db.settings.currentAcademicYear,
      regularHours: body.regularHours,
      overtimeHours: body.overtimeHours,
      hourlyRateFcfa: body.hourlyRateFcfa,
      overtimeRateFcfa: body.overtimeRateFcfa,
      bonusesFcfa: body.bonusesFcfa,
      bonusDetails: body.bonusDetails,
      cnssRatePercent: body.cnssRatePercent,
      advanceOrOtherDeductionFcfa: body.advanceOrOtherDeductionFcfa,
      deductionDetails: body.deductionDetails,
      paymentMethod: body.paymentMethod || 'Virement',
      status: desiredStatus,
      createdBy: actor.fullName,
      createdAt: now,
      paidAt: desiredStatus === 'paye' ? now : null,
      paidBy: desiredStatus === 'paye' ? actor.fullName : null,
    });

    db.teacherPayslips.unshift(payslip);
    addAuditLog(
      db,
      actor,
      'Édition bulletin de paye',
      'Paie',
      payslipNumber,
      `${teacher.firstName} ${teacher.lastName} (${payslip.periodLabel}) · ${payslip.regularHours} h × ${payslip.hourlyRateFcfa} FCFA = ${payslip.netPayFcfa} FCFA`
    );
    saveDatabase(db);
    res.status(201).json({ payslip });
  });

  app.post('/api/payslips/batch', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const { month } = req.body as { month?: string };
    if (!month) {
      res.status(400).json({ error: 'Veuillez sélectionner un mois de paie.' });
      return;
    }

    const activeTeachers = db.teachers.filter((t) => t.status === 'actif');
    const existingTeacherIds = new Set(
      db.teacherPayslips.filter((p) => p.month === month).map((p) => p.teacherId)
    );
    const created: ReturnType<typeof buildTeacherPayslip>[] = [];

    for (const teacher of activeTeachers) {
      if (existingTeacherIds.has(teacher.id)) continue;
      const loggedCumul = getTeacherCumulativeHours(db.teacherHourLogs || [], teacher.id, month);
      const totalHours = loggedCumul > 0 ? loggedCumul : teacher.weeklyHoursQuota * 4;
      db.counters.payslipSeq = (db.counters.payslipSeq || db.teacherPayslips.length) + 1;
      const payslipNumber = `PAIE-2026-${String(db.counters.payslipSeq).padStart(4, '0')}`;
      const slip = buildTeacherPayslip({
        id: `pay-tch-${Date.now()}-${teacher.id}`,
        payslipNumber,
        teacher,
        month,
        academicYear: db.settings.currentAcademicYear,
        regularHours: totalHours,
        overtimeHours: 0,
        bonusesFcfa: teacher.baseBonusFcfa || 0,
        cnssRatePercent: teacher.cnssRatePercent || 0,
        paymentMethod: teacher.bankOrMobileAccount.toLowerCase().includes('momo') ||
          teacher.bankOrMobileAccount.toLowerCase().includes('airtel')
          ? 'Mobile Money'
          : 'Virement',
        status: 'brouillon',
        createdBy: actor.fullName,
      });
      db.teacherPayslips.unshift(slip);
      created.push(slip);
    }

    if (created.length === 0) {
      res.status(400).json({ error: 'Tous les enseignants actifs ont déjà un bulletin généré pour ce mois.' });
      return;
    }

    addAuditLog(
      db,
      actor,
      'Génération lot paie mensuelle',
      'Paie',
      month,
      `${created.length} bulletin(s) de paye généré(s) en brouillon pour ${month}.`
    );
    saveDatabase(db);
    res.status(201).json({ createdCount: created.length, payslips: created });
  });

  app.post('/api/payslips/:id/status', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const slip = db.teacherPayslips.find((p) => p.id === req.params.id);
    if (!slip) {
      res.status(404).json({ error: 'Bulletin de paye introuvable.' });
      return;
    }
    const { status, paymentMethod } = req.body as {
      status: PayslipStatus;
      paymentMethod?: PayslipPaymentMethod;
    };
    slip.status = status;
    if (paymentMethod) slip.paymentMethod = paymentMethod;
    if (status === 'paye') {
      slip.paidAt = new Date().toISOString();
      slip.paidBy = actor.fullName;
    }
    const teacher = db.teachers.find((t) => t.id === slip.teacherId);
    addAuditLog(
      db,
      actor,
      `Statut bulletin de paye : ${status}`,
      'Paie',
      slip.payslipNumber,
      `${teacher ? `${teacher.firstName} ${teacher.lastName}` : slip.teacherId} (${slip.periodLabel}) · ${slip.netPayFcfa} FCFA`
    );
    saveDatabase(db);
    res.json({ payslip: slip });
  });

  app.delete('/api/payslips/:id', requireRole(['secretariat', 'caisse', 'admin']), (req, res) => {
    const db = loadDatabase();
    const actor = getActor(req, db)!;
    const slip = db.teacherPayslips.find((p) => p.id === req.params.id);
    if (!slip) {
      res.status(404).json({ error: 'Bulletin de paye introuvable.' });
      return;
    }
    if (slip.status === 'paye') {
      res.status(400).json({ error: 'Impossible de supprimer un bulletin de paye déjà payé.' });
      return;
    }
    db.teacherPayslips = db.teacherPayslips.filter((p) => p.id !== req.params.id);
    addAuditLog(
      db,
      actor,
      'Suppression bulletin de paye',
      'Paie',
      slip.payslipNumber,
      `Bulletin ${slip.payslipNumber} (${slip.periodLabel}) supprimé.`
    );
    saveDatabase(db);
    res.json({ ok: true });
  });

  app.post('/api/admin/reset-demo', requireRole(['admin']), (req, res) => {
    const seed = createSeedDatabase();
    saveDatabase(seed);
    res.json({ ok: true });
  });

  // --- VITE / STATIC ---
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build dist/index.html introuvable.');
      }
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Jegama Scool serveur actif sur http://0.0.0.0:${port}`);
  });
}

startServer();
