import {
  addAuditLog,
  buildAcademicYearArchive,
  buildTeacherPayslip,
  computeStudentBalance,
  createPeriodsForYear,
  createSeedDatabase,
  ensureTeacherSeedData,
  getTeacherCumulativeHours,
  recalculateClassBulletins,
  sanitizeDbForClient,
  type ActorContext,
} from './shared/schoolEngine';
import type {
  AcademicYearArchive,
  ArchivedStudentRecord,
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
} from './types';

const IDB_NAME = 'jegama_scool_db';
const IDB_STORE = 'kv';
const IDB_KEY = 'school_db_v1';
const LS_FALLBACK_KEY = 'jegama_scool_local_db_v1';

let memoryCache: SchoolDatabase | null = null;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponible.'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Erreur ouverture IndexedDB.'));
  });
}

async function readFromIdb(): Promise<SchoolDatabase | null> {
  try {
    const db = await openIdb();
    return await new Promise<SchoolDatabase | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as SchoolDatabase) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeToIdb(data: SchoolDatabase): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(data, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB error and rely on localStorage mirror below
  }
}

function hydrateDb(raw: SchoolDatabase | null): SchoolDatabase {
  if (!raw || !Array.isArray(raw.users) || !Array.isArray(raw.students)) {
    return createSeedDatabase();
  }
  if (!Array.isArray(raw.archivedYears)) {
    raw.archivedYears = [];
  }
  ensureTeacherSeedData(raw);
  return raw;
}

export async function loadLocalDatabase(): Promise<SchoolDatabase> {
  if (memoryCache) return memoryCache;

  const fromIdb = await readFromIdb();
  if (fromIdb) {
    memoryCache = hydrateDb(fromIdb);
    return memoryCache;
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      memoryCache = hydrateDb(JSON.parse(raw) as SchoolDatabase);
      await writeToIdb(memoryCache);
      return memoryCache;
    }
  } catch {
    // Ignore parse/storage errors
  }

  memoryCache = createSeedDatabase();
  await saveLocalDatabase(memoryCache);
  return memoryCache;
}

export async function saveLocalDatabase(db: SchoolDatabase): Promise<void> {
  memoryCache = db;
  await writeToIdb(db);
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(db));
  } catch {
    // Ignore QuotaExceededError on localStorage since IndexedDB stores the full payload
  }
}

function getActorFromSession(
  db: SchoolDatabase,
  session?: { id: string; role: UserRole } | null
): ActorContext | null {
  if (!session?.id || !session?.role) return null;
  if (session.role === 'parent') {
    const parent = db.parents.find((p) => p.id === session.id);
    if (!parent) return null;
    return { id: parent.id, fullName: parent.fullName, role: 'parent' };
  }
  const user = db.users.find((u) => u.id === session.id && u.active);
  if (!user) return null;
  return { id: user.id, fullName: user.fullName, role: user.role };
}

function assertRole(
  db: SchoolDatabase,
  session: { id: string; role: UserRole } | null | undefined,
  allowed: UserRole[]
): ActorContext {
  const actor = getActorFromSession(db, session);
  if (!actor) {
    throw new Error('Authentification requise.');
  }
  if (actor.role === 'direction') {
    throw new Error('Action refusée : le profil Direction générale est strictement en lecture seule.');
  }
  if (!allowed.includes(actor.role)) {
    throw new Error(`Droits insuffisants pour le profil ${actor.role}.`);
  }
  return actor;
}

function parseBody<T>(options?: RequestInit): T {
  if (!options?.body) return {} as T;
  if (typeof options.body === 'string') {
    return JSON.parse(options.body) as T;
  }
  return options.body as unknown as T;
}

export async function handleLocalApiRequest<T>(
  url: string,
  options: RequestInit = {},
  session?: { id: string; role: UserRole } | null
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const path = url.split('?')[0];
  const db = await loadLocalDatabase();

  // --- AUTH ---
  if (method === 'GET' && path === '/api/auth/profiles') {
    return {
      staffProfiles: db.users
        .filter((u) => u.active)
        .map(({ password: _p, ...u }) => u),
      schoolName: db.settings.schoolName,
      address: `${db.settings.address}, ${db.settings.city}`,
      academicYear: db.settings.currentAcademicYear,
    } as T;
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const { username, password } = parseBody<{ username?: string; password?: string }>(options);
    const rawIdentifier = (username || '').trim().toLowerCase();
    const normalizedUsername = rawIdentifier.endsWith('@jegama-school.cg')
      ? rawIdentifier.replace('@jegama-school.cg', '')
      : rawIdentifier;
    const user = db.users.find((u) => u.username.toLowerCase() === normalizedUsername);
    if (!user) throw new Error('Identifiant introuvable.');
    if (!user.active) throw new Error('Compte utilisateur désactivé par l’administrateur.');
    if (user.password !== password) throw new Error('Mot de passe incorrect.');
    user.lastLogin = new Date().toISOString();
    await saveLocalDatabase(db);
    const { password: _p, ...safeUser } = user;
    return { user: safeUser } as T;
  }

  if (method === 'POST' && path === '/api/auth/parent-login') {
    const { cardId } = parseBody<{ cardId?: string }>(options);
    const normalizedCard = (cardId || '').trim().toUpperCase();
    const student = db.students.find((s) => s.cardId.toUpperCase() === normalizedCard);
    if (!student) throw new Error('Numéro de carte scolaire introuvable.');
    if (student.cardStatus !== 'active') {
      throw new Error(
        `Cette carte scolaire (${student.cardId}) est marquée comme ${student.cardStatus}. Utilisez le nouvel ID actif ou contactez la Scolarité.`
      );
    }
    const parent = db.parents.find((p) => p.id === student.parentId);
    if (!parent) throw new Error('Dossier parent introuvable.');
    parent.failedAttempts = 0;
    parent.lockedUntil = null;
    await saveLocalDatabase(db);
    return {
      user: {
        id: parent.id,
        username: parent.phone,
        fullName: parent.fullName,
        role: 'parent' as UserRole,
        active: true,
        lastLogin: new Date().toISOString(),
      },
      initialStudentId: student.id,
    } as T;
  }

  // --- STATE ---
  if (method === 'GET' && path === '/api/state') {
    const actor = getActorFromSession(db, session);
    if (!actor) throw new Error('Non authentifié.');
    return sanitizeDbForClient(db, actor) as T;
  }

  // --- PARENTS ---
  if (method === 'POST' && path === '/api/parents') {
    const actor = assertRole(db, session, ['scolarite', 'admin']);
    const { fullName, phone, address, accessCode } = parseBody<Partial<ParentTutor>>(options);
    if (!fullName || !phone) throw new Error('Nom complet et téléphone requis.');
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
    await saveLocalDatabase(db);
    return { parent } as T;
  }

  // --- STUDENTS ---
  if (method === 'POST' && path === '/api/students') {
    const actor = assertRole(db, session, ['scolarite', 'admin']);
    const body = parseBody<
      Partial<Student> & {
        newParent?: { fullName: string; phone: string; address: string; accessCode?: string };
      }
    >(options);

    if (!body.firstName || !body.lastName || !body.cycle || !body.program) {
      throw new Error('Champs obligatoires manquants (prénom, nom, cycle, programme).');
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
    if (!parentId) throw new Error('Un parent ou tuteur doit être associé à l’élève.');

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
    await saveLocalDatabase(db);
    return { student, notification } as T;
  }

  const stuUpdateMatch = path.match(/^\/api\/students\/([^/]+)$/);
  if (method === 'PUT' && stuUpdateMatch) {
    const actor = assertRole(db, session, ['scolarite', 'secretariat', 'admin']);
    const id = stuUpdateMatch[1];
    const idx = db.students.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error('Élève introuvable.');
    const existing = db.students[idx];
    const updates = parseBody<Partial<Student>>(options);
    db.students[idx] = {
      ...existing,
      firstName: updates.firstName !== undefined ? updates.firstName.trim() : existing.firstName,
      lastName:
        updates.lastName !== undefined ? updates.lastName.trim().toUpperCase() : existing.lastName,
      birthDate: updates.birthDate ?? existing.birthDate,
      birthPlace: updates.birthPlace ?? existing.birthPlace,
      gender: updates.gender ?? existing.gender,
      photoUrl:
        updates.photoUrl !== undefined && updates.photoUrl !== ''
          ? updates.photoUrl
          : existing.photoUrl,
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
    await saveLocalDatabase(db);
    return { student: db.students[idx] } as T;
  }

  const reinscrireMatch = path.match(/^\/api\/students\/([^/]+)\/reinscrire$/);
  if (method === 'POST' && reinscrireMatch) {
    const actor = assertRole(db, session, ['scolarite', 'admin']);
    const student = db.students.find((s) => s.id === reinscrireMatch[1]);
    if (!student) throw new Error('Élève introuvable.');
    const { nextCycle, nextClassId, nextAcademicYear } = parseBody<{
      nextCycle?: Student['cycle'];
      nextClassId?: string | null;
      nextAcademicYear?: string;
    }>(options);
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
    await saveLocalDatabase(db);
    return { student, notification } as T;
  }

  const replaceCardMatch = path.match(/^\/api\/students\/([^/]+)\/replace-card$/);
  if (method === 'POST' && replaceCardMatch) {
    const actor = assertRole(db, session, ['scolarite', 'secretariat', 'admin']);
    const student = db.students.find((s) => s.id === replaceCardMatch[1]);
    if (!student) throw new Error('Élève introuvable.');
    const { reason } = parseBody<{ reason?: string }>(options);
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
    await saveLocalDatabase(db);
    return { student, oldCardId, newCardId } as T;
  }

  const cardStatusMatch = path.match(/^\/api\/students\/([^/]+)\/card-status$/);
  if (method === 'POST' && cardStatusMatch) {
    const actor = assertRole(db, session, ['scolarite', 'surveillant', 'admin']);
    const student = db.students.find((s) => s.id === cardStatusMatch[1]);
    if (!student) throw new Error('Élève introuvable.');
    const { cardStatus } = parseBody<{ cardStatus: Student['cardStatus'] }>(options);
    student.cardStatus = cardStatus;
    addAuditLog(
      db,
      actor,
      'Statut carte scolaire',
      'Carte',
      student.cardId,
      `Statut de la carte ${student.cardId} passé à "${cardStatus}".`
    );
    await saveLocalDatabase(db);
    return { student } as T;
  }

  const feeGridMatch = path.match(/^\/api\/fee-grid\/([^/]+)$/);
  if (method === 'PUT' && feeGridMatch) {
    const actor = assertRole(db, session, ['scolarite', 'admin']);
    const idx = db.feeGrid.findIndex((f) => f.id === feeGridMatch[1]);
    if (idx < 0) throw new Error('Grille tarifaire introuvable.');
    const body = parseBody<Partial<FeeGridItem>>(options);
    db.feeGrid[idx] = { ...db.feeGrid[idx], ...body };
    addAuditLog(
      db,
      actor,
      'Modification grille tarifaire',
      'Tarifs',
      db.feeGrid[idx].id,
      `${db.feeGrid[idx].cycle} (${db.feeGrid[idx].program}) mis à jour.`
    );
    await saveLocalDatabase(db);
    return { feeGridItem: db.feeGrid[idx] } as T;
  }

  // --- CAISSE ---
  if (method === 'POST' && path === '/api/payments') {
    const actor = assertRole(db, session, ['caisse', 'scolarite', 'admin']);
    const { studentId, amountPaid, method: payMethod, trancheLabel, notes, notificationId } =
      parseBody<{
        studentId: string;
        amountPaid: number;
        method: Payment['method'];
        trancheLabel: string;
        notes?: string;
        notificationId?: string;
      }>(options);
    const student = db.students.find((s) => s.id === studentId);
    if (!student) throw new Error('Élève introuvable.');
    if (!amountPaid || amountPaid <= 0) {
      throw new Error('Le montant encaissé doit être supérieur à 0 FCFA.');
    }

    db.counters.receiptSeq += 1;
    const receiptNumber = `REC-2026-${String(db.counters.receiptSeq).padStart(4, '0')}`;
    const payment: Payment = {
      id: `pay-${Date.now()}`,
      receiptNumber,
      studentId: student.id,
      amountPaid: Number(amountPaid),
      method: payMethod || 'Espèces',
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
    await saveLocalDatabase(db);
    return { payment, balance: bal } as T;
  }

  // --- SECRETARIAT ---
  if (method === 'POST' && path === '/api/classes') {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const body = parseBody<Partial<SchoolClass>>(options);
    if (!body.name || !body.cycle || !body.program) {
      throw new Error('Nom, cycle et programme requis.');
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
    addAuditLog(
      db,
      actor,
      'Création classe',
      'Classe',
      cls.id,
      `${cls.name} (${cls.cycle} · ${cls.program})`
    );
    await saveLocalDatabase(db);
    return { schoolClass: cls } as T;
  }

  if (method === 'POST' && path === '/api/subjects') {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const body = parseBody<Partial<Subject>>(options);
    if (!body.name || !body.cycle || !body.program || !body.coefficient) {
      throw new Error('Matière, cycle, programme et coefficient requis.');
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
    await saveLocalDatabase(db);
    return { subject } as T;
  }

  const togglePeriodMatch = path.match(/^\/api\/periods\/([^/]+)\/toggle-lock$/);
  if (method === 'POST' && togglePeriodMatch) {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const period = db.periods.find((p) => p.id === togglePeriodMatch[1]);
    if (!period) throw new Error('Période introuvable.');
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
    await saveLocalDatabase(db);
    return { period } as T;
  }

  if (method === 'POST' && path === '/api/grades') {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const { studentId, subjectId, periodId, values, teacherAppreciation, overrideReason } =
      parseBody<{
        studentId: string;
        subjectId: string;
        periodId: string;
        values: number[];
        teacherAppreciation?: string;
        overrideReason?: string;
      }>(options);
    const period = db.periods.find((p) => p.id === periodId);
    if (!period) throw new Error('Période introuvable.');
    const cleanValues = (values || []).map(Number).filter((v) => !Number.isNaN(v));
    if (cleanValues.length === 0) throw new Error('Au moins une note valide est requise.');
    for (const v of cleanValues) {
      if (v < 0 || v > 20) {
        throw new Error(`Note hors barème (${v}). Les notes doivent être comprises entre 0 et 20.`);
      }
    }
    if (period.status === 'verrouille' && !overrideReason?.trim()) {
      throw new Error(
        'Période verrouillée : un motif de correction est obligatoire pour la traçabilité (RG-08).'
      );
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
    await saveLocalDatabase(db);
    return { grade: record } as T;
  }

  if (method === 'POST' && path === '/api/grades/batch') {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const { periodId, entries, overrideReason } = parseBody<{
      periodId: string;
      overrideReason?: string;
      entries: Array<{
        studentId: string;
        subjectId: string;
        values: number[];
        teacherAppreciation?: string;
        overrideReason?: string;
      }>;
    }>(options);
    const period = db.periods.find((p) => p.id === periodId);
    if (!period) throw new Error('Période introuvable.');
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('Aucune note valide à enregistrer.');
    }

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
          throw new Error(
            `Note hors barème (${v}). Toutes les notes doivent être comprises entre 0 et 20.`
          );
        }
      }
      const reason = (item.overrideReason || overrideReason || '').trim();
      if (period.status === 'verrouille' && !reason) {
        throw new Error(
          'Période verrouillée : un motif de correction est obligatoire pour l’enregistrement groupé (RG-08).'
        );
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
      throw new Error('Saisissez au moins une note valide entre 0 et 20.');
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
      if (stu?.classId) impactedClassIds.add(stu.classId);

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
    await saveLocalDatabase(db);
    return { savedCount: savedGrades.length, grades: savedGrades } as T;
  }

  const deleteGradeMatch = path.match(/^\/api\/grades\/([^/]+)$/);
  if (method === 'DELETE' && deleteGradeMatch) {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const idx = db.grades.findIndex((g) => g.id === deleteGradeMatch[1]);
    if (idx < 0) throw new Error('Note introuvable.');
    const existing = db.grades[idx];
    const period = db.periods.find((p) => p.id === existing.periodId);
    const { overrideReason } = parseBody<{ overrideReason?: string }>(options);
    const reason = (overrideReason || '').trim();
    if (period?.status === 'verrouille' && !reason) {
      throw new Error('Période verrouillée : un motif est obligatoire pour supprimer une note (RG-08).');
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
    await saveLocalDatabase(db);
    return { deletedId: existing.id } as T;
  }

  if (method === 'POST' && path === '/api/bulletins/recalculate') {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const { classId, periodId } = parseBody<{ classId: string; periodId: string }>(options);
    const bulletins = recalculateClassBulletins(db, classId, periodId);
    addAuditLog(
      db,
      actor,
      'Calcul des bulletins',
      'Classe',
      classId,
      `Recalcul des moyennes, rangs et mentions pour la période ${periodId} (${bulletins.length} bulletins).`
    );
    await saveLocalDatabase(db);
    return { bulletins } as T;
  }

  const deliveryMatch = path.match(/^\/api\/bulletins\/([^/]+)\/delivery$/);
  if (method === 'POST' && deliveryMatch) {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const bulletin = db.bulletins.find((b) => b.id === deliveryMatch[1]);
    if (!bulletin) throw new Error('Bulletin introuvable.');
    const { deliveryStatus, receivedBy, appreciation } = parseBody<{
      deliveryStatus: 'a_editer' | 'valide' | 'imprime' | 'remis';
      receivedBy?: string;
      appreciation?: string;
    }>(options);
    const period = db.periods.find((p) => p.id === bulletin.periodId);
    if (deliveryStatus === 'remis' && period?.status !== 'verrouille') {
      throw new Error(
        'RG-06 : Un bulletin ne peut être remis qu’après validation et verrouillage de la période.'
      );
    }
    if (deliveryStatus === 'remis' && !receivedBy?.trim()) {
      throw new Error('Veuillez saisir le nom du parent ou tuteur ayant reçu le bulletin.');
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
    await saveLocalDatabase(db);
    return { bulletin } as T;
  }

  // --- SURVEILLANCE ---
  if (method === 'POST' && path === '/api/pointages/scan') {
    const actor = assertRole(db, session, ['surveillant', 'secretariat', 'admin']);
    const { cardId, manualType, status, reason } = parseBody<{
      cardId: string;
      manualType?: 'entree' | 'sortie';
      status?: 'present' | 'retard' | 'absence';
      reason?: string;
    }>(options);
    const normalized = (cardId || '').trim().toUpperCase();
    const student = db.students.find(
      (s) => s.cardId.toUpperCase() === normalized || s.replacedCardIds.includes(normalized)
    );
    if (!student) {
      throw new Error(`Carte inconnue (${normalized}). Aucun élève enregistré avec cet identifiant.`);
    }
    if (student.cardStatus !== 'active' || student.replacedCardIds.includes(normalized)) {
      throw new Error(
        `Alerte sécurité : la carte ${normalized} de ${student.firstName} ${student.lastName} est ${student.replacedCardIds.includes(normalized) ? 'remplacée/obsolète' : student.cardStatus}.`
      );
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayStudentLogs = db.attendanceLogs.filter(
      (a) => a.studentId === student.id && a.dateStr === dateStr
    );
    const lastLog = todayStudentLogs[todayStudentLogs.length - 1];
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
    await saveLocalDatabase(db);
    return { log: entry, student } as T;
  }

  if (method === 'POST' && path === '/api/pointages/absence') {
    const actor = assertRole(db, session, ['surveillant', 'secretariat', 'admin']);
    const { studentId, status, reason, dateStr } = parseBody<{
      studentId: string;
      status: 'absence' | 'retard';
      reason: string;
      dateStr?: string;
    }>(options);
    const student = db.students.find((s) => s.id === studentId);
    if (!student) throw new Error('Élève introuvable.');
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
    await saveLocalDatabase(db);
    return { log: entry } as T;
  }

  if (method === 'POST' && path === '/api/pointages/sync') {
    const actor = assertRole(db, session, ['surveillant', 'admin']);
    const { queuedLogs } = parseBody<{
      queuedLogs: Array<{
        cardId: string;
        type: 'entree' | 'sortie';
        timestamp: string;
        dateStr: string;
        status: 'present' | 'retard' | 'absence';
        reason: string;
      }>;
    }>(options);
    if (!Array.isArray(queuedLogs) || queuedLogs.length === 0) {
      throw new Error('Aucun pointage hors-ligne à synchroniser.');
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
    await saveLocalDatabase(db);
    return { syncedCount } as T;
  }

  // --- ADMIN ---
  if (method === 'PUT' && path === '/api/admin/settings') {
    const actor = assertRole(db, session, ['admin']);
    const body = parseBody<Partial<SchoolDatabase['settings']>>(options);
    db.settings = { ...db.settings, ...body };
    addAuditLog(
      db,
      actor,
      'Modification paramètres système',
      'Système',
      'settings',
      'Paramètres généraux, seuils de mentions ou règles d’accès mis à jour.'
    );
    await saveLocalDatabase(db);
    return { settings: db.settings } as T;
  }

  if (method === 'POST' && path === '/api/admin/users') {
    const actor = assertRole(db, session, ['admin']);
    const { username, fullName, role, password } = parseBody<Partial<UserAccount>>(options);
    if (!username || !fullName || !role || !password) {
      throw new Error('Tous les champs sont obligatoires.');
    }
    if (db.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
      throw new Error('Cet identifiant existe déjà.');
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
    addAuditLog(
      db,
      actor,
      'Création compte utilisateur',
      'Utilisateur',
      newUser.username,
      `${newUser.fullName} (${newUser.role})`
    );
    await saveLocalDatabase(db);
    const { password: _p, ...safeUser } = newUser;
    return { user: safeUser } as T;
  }

  const toggleUserMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/toggle$/);
  if (method === 'POST' && toggleUserMatch) {
    const actor = assertRole(db, session, ['admin']);
    const target = db.users.find((u) => u.id === toggleUserMatch[1]);
    if (!target) throw new Error('Utilisateur introuvable.');
    if (target.id === actor.id) {
      throw new Error('Impossible de désactiver votre propre compte administrateur.');
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
    await saveLocalDatabase(db);
    const { password: _p, ...safeUser } = target;
    return { user: safeUser } as T;
  }

  if (method === 'GET' && path === '/api/admin/backup') {
    const actor = assertRole(db, session, ['admin']);
    db.settings.lastBackupAt = new Date().toISOString();
    addAuditLog(db, actor, 'Sauvegarde manuelle', 'Système', 'backup', 'Export complet de la base Jegama Scool.');
    await saveLocalDatabase(db);
    return db as T;
  }

  if (method === 'POST' && path === '/api/admin/restore') {
    const actor = assertRole(db, session, ['admin']);
    const payload = parseBody<SchoolDatabase>(options);
    if (!payload || !Array.isArray(payload.users) || !Array.isArray(payload.students) || !payload.settings) {
      throw new Error('Fichier de sauvegarde JSON invalide.');
    }
    const restored = hydrateDb(payload);
    addAuditLog(
      db,
      actor,
      'Restauration sauvegarde JSON',
      'Système',
      'restore',
      `Base restaurée (${restored.students.length} élève(s), ${restored.archivedYears.length} archive(s)).`
    );
    await saveLocalDatabase(restored);
    return { ok: true } as T;
  }

  if (method === 'POST' && path === '/api/admin/academic-years/create') {
    const actor = assertRole(db, session, ['admin']);
    const { newAcademicYear, archiveNotes, periodMode } = parseBody<{
      newAcademicYear?: string;
      archiveNotes?: string;
      periodMode?: 'Trimestres' | 'Séquences';
    }>(options);
    const nextYear = (newAcademicYear || '').trim();
    if (!nextYear) {
      throw new Error('Veuillez indiquer le libellé de la nouvelle année académique (ex. 2027-2028).');
    }
    if (nextYear === db.settings.currentAcademicYear) {
      throw new Error(`L’année ${nextYear} est déjà l’année académique en cours.`);
    }
    const previousYear = db.settings.currentAcademicYear;
    const archive = buildAcademicYearArchive(db, actor, archiveNotes);
    db.archivedYears = db.archivedYears || [];
    db.archivedYears.unshift(archive);
    const nextMode = periodMode || db.settings.periodMode;
    db.settings.currentAcademicYear = nextYear;
    db.settings.periodMode = nextMode;
    db.periods = createPeriodsForYear(nextYear, nextMode);
    db.students = db.students.map((stu) =>
      stu.status !== 'archive' ? { ...stu, status: 'archive', classId: null } : stu
    );
    db.grades = [];
    db.bulletins = [];
    db.payments = [];
    db.paymentNotifications = [];
    db.attendanceLogs = [];
    addAuditLog(
      db,
      actor,
      'Clôture & Nouvelle année académique',
      'Année académique',
      nextYear,
      `Année ${previousYear} archivée (${archive.summary.totalStudents} élève(s)). Ouverture de l’année académique ${nextYear}.`
    );
    await saveLocalDatabase(db);
    return { archive, settings: db.settings } as T;
  }

  if (method === 'POST' && path === '/api/admin/archives/import-excel') {
    const actor = assertRole(db, session, ['admin']);
    const { academicYear, sourceFileName, notes, records } = parseBody<{
      academicYear?: string;
      sourceFileName?: string;
      notes?: string;
      records?: ArchivedStudentRecord[];
    }>(options);
    const cleanYear = (academicYear || '').trim();
    if (!cleanYear) {
      throw new Error('Veuillez indiquer l’année académique correspondante (ex. 2025-2026).');
    }
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('Aucune ligne d’élève valide trouvée dans le fichier Excel.');
    }

    const sanitizedRecords: ArchivedStudentRecord[] = records.map((r, index) => {
      const expected = Number(r.totalExpectedFcfa) || 0;
      const paid = Number(r.totalPaidFcfa) || 0;
      const remaining =
        r.balanceRemainingFcfa !== undefined && r.balanceRemainingFcfa !== null
          ? Number(r.balanceRemainingFcfa) || 0
          : Math.max(0, expected - paid);
      const avg =
        r.generalAverage !== null &&
        r.generalAverage !== undefined &&
        !Number.isNaN(Number(r.generalAverage))
          ? Math.round(Number(r.generalAverage) * 100) / 100
          : null;
      return {
        cardId: (r.cardId || `ARC-${cleanYear.slice(2, 4)}-${String(index + 1).padStart(4, '0')}`).trim(),
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

    const totalExpectedFcfa = sanitizedRecords.reduce((s, r) => s + r.totalExpectedFcfa, 0);
    const totalCollectedFcfa = sanitizedRecords.reduce((s, r) => s + r.totalPaidFcfa, 0);
    const avgRows = sanitizedRecords.filter((r) => r.generalAverage !== null);
    const averageScore =
      avgRows.length > 0
        ? Math.round((avgRows.reduce((s, r) => s + (r.generalAverage || 0), 0) / avgRows.length) * 100) / 100
        : null;

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
      },
      records: sanitizedRecords,
    };

    db.archivedYears = db.archivedYears || [];
    db.archivedYears.unshift(archive);
    addAuditLog(
      db,
      actor,
      'Importation archive Excel',
      'Archive',
      cleanYear,
      `Archive ${cleanYear} importée depuis "${archive.sourceFileName}" (${sanitizedRecords.length} élève(s)).`
    );
    await saveLocalDatabase(db);
    return { archive } as T;
  }

  const deleteArchiveMatch = path.match(/^\/api\/admin\/archives\/([^/]+)$/);
  if (method === 'DELETE' && deleteArchiveMatch) {
    const actor = assertRole(db, session, ['admin']);
    db.archivedYears = db.archivedYears || [];
    const target = db.archivedYears.find((a) => a.id === deleteArchiveMatch[1]);
    if (!target) throw new Error('Archive introuvable.');
    db.archivedYears = db.archivedYears.filter((a) => a.id !== deleteArchiveMatch[1]);
    addAuditLog(
      db,
      actor,
      'Suppression archive',
      'Archive',
      target.academicYear,
      `Archive ${target.academicYear} (${target.source}) supprimée.`
    );
    await saveLocalDatabase(db);
    return { ok: true } as T;
  }

  // --- CORPS ENSEIGNANTS ---
  if (method === 'POST' && path === '/api/teachers') {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const body = parseBody<Partial<Teacher>>(options);
    if (!body.firstName?.trim() || !body.lastName?.trim() || !body.specialty?.trim()) {
      throw new Error('Prénom, nom et spécialité sont obligatoires.');
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
    await saveLocalDatabase(db);
    return { teacher } as T;
  }

  const teacherMatch = path.match(/^\/api\/teachers\/([^/]+)$/);
  if (method === 'PUT' && teacherMatch) {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const idx = db.teachers.findIndex((t) => t.id === teacherMatch[1]);
    if (idx < 0) throw new Error('Enseignant introuvable.');
    const existing = db.teachers[idx];
    const updates = parseBody<Partial<Teacher>>(options);
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
    await saveLocalDatabase(db);
    return { teacher: db.teachers[idx] } as T;
  }

  if (method === 'DELETE' && teacherMatch) {
    const actor = assertRole(db, session, ['secretariat', 'admin']);
    const target = db.teachers.find((t) => t.id === teacherMatch[1]);
    if (!target) throw new Error('Enseignant introuvable.');
    db.teachers = db.teachers.filter((t) => t.id !== teacherMatch[1]);
    addAuditLog(
      db,
      actor,
      'Suppression fiche enseignant',
      'Corps enseignants',
      target.matricule,
      `${target.firstName} ${target.lastName} supprimé du répertoire actif.`
    );
    await saveLocalDatabase(db);
    return { ok: true } as T;
  }

  const hourlyRateMatch = path.match(/^\/api\/hourly-rates\/([^/]+)$/);
  if (method === 'PUT' && hourlyRateMatch) {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const idx = db.hourlyRates.findIndex((r) => r.id === hourlyRateMatch[1]);
    if (idx < 0) throw new Error('Barème horaire introuvable.');
    const {
      baseHourlyRateFcfa,
      overtimeHourlyRateFcfa,
      headTeacherMonthlyBonusFcfa,
      applyToMatchingTeachers,
    } = parseBody<Partial<CycleHourlyRate> & { applyToMatchingTeachers?: boolean }>(options);
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
    await saveLocalDatabase(db);
    return { hourlyRate: updated, syncedTeachersCount } as T;
  }

  if (method === 'POST' && path === '/api/teacher-hours') {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const { teacherId, date, month, hours, classOrSubject, notes } = parseBody<{
      teacherId?: string;
      date?: string;
      month?: string;
      hours?: number;
      classOrSubject?: string;
      notes?: string;
    }>(options);

    const teacher = db.teachers.find((t) => t.id === teacherId);
    if (!teacher) throw new Error('Enseignant introuvable.');
    const cleanHours = Number(hours);
    if (Number.isNaN(cleanHours) || cleanHours <= 0 || cleanHours > 250) {
      throw new Error('Veuillez saisir un nombre d’heures valide (> 0).');
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
    await saveLocalDatabase(db);
    return { hourLog: log, cumulativeHours } as T;
  }

  const hourDeleteMatch = path.match(/^\/api\/teacher-hours\/([^/]+)$/);
  if (method === 'DELETE' && hourDeleteMatch) {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    db.teacherHourLogs = db.teacherHourLogs || [];
    const target = db.teacherHourLogs.find((l) => l.id === hourDeleteMatch[1]);
    if (!target) throw new Error('Relevé d’heures introuvable.');
    db.teacherHourLogs = db.teacherHourLogs.filter((l) => l.id !== hourDeleteMatch[1]);
    const teacher = db.teachers.find((t) => t.id === target.teacherId);
    addAuditLog(
      db,
      actor,
      'Suppression relevé d’heures',
      'Cumul heures',
      teacher?.matricule || target.teacherId,
      `Retrait de ${target.hours} h du ${target.date} (${target.month}).`
    );
    await saveLocalDatabase(db);
    return { ok: true } as T;
  }

  if (method === 'POST' && path === '/api/payslips') {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const body = parseBody<{
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
    }>(options);

    const teacher = db.teachers.find((t) => t.id === body.teacherId);
    if (!teacher) throw new Error('Enseignant introuvable.');
    if (!body.month) throw new Error('Le mois de paie est requis.');

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
    await saveLocalDatabase(db);
    return { payslip } as T;
  }

  if (method === 'POST' && path === '/api/payslips/batch') {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const { month } = parseBody<{ month?: string }>(options);
    if (!month) throw new Error('Veuillez sélectionner un mois de paie.');
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
        paymentMethod:
          teacher.bankOrMobileAccount.toLowerCase().includes('momo') ||
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
      throw new Error('Tous les enseignants actifs ont déjà un bulletin généré pour ce mois.');
    }
    addAuditLog(
      db,
      actor,
      'Génération lot paie mensuelle',
      'Paie',
      month,
      `${created.length} bulletin(s) de paye généré(s) en brouillon pour ${month}.`
    );
    await saveLocalDatabase(db);
    return { createdCount: created.length, payslips: created } as T;
  }

  const payslipStatusMatch = path.match(/^\/api\/payslips\/([^/]+)\/status$/);
  if (method === 'POST' && payslipStatusMatch) {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const slip = db.teacherPayslips.find((p) => p.id === payslipStatusMatch[1]);
    if (!slip) throw new Error('Bulletin de paye introuvable.');
    const { status, paymentMethod } = parseBody<{
      status: PayslipStatus;
      paymentMethod?: PayslipPaymentMethod;
    }>(options);
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
    await saveLocalDatabase(db);
    return { payslip: slip } as T;
  }

  const payslipDeleteMatch = path.match(/^\/api\/payslips\/([^/]+)$/);
  if (method === 'DELETE' && payslipDeleteMatch) {
    const actor = assertRole(db, session, ['secretariat', 'caisse', 'admin']);
    const slip = db.teacherPayslips.find((p) => p.id === payslipDeleteMatch[1]);
    if (!slip) throw new Error('Bulletin de paye introuvable.');
    if (slip.status === 'paye') {
      throw new Error('Impossible de supprimer un bulletin de paye déjà payé.');
    }
    db.teacherPayslips = db.teacherPayslips.filter((p) => p.id !== payslipDeleteMatch[1]);
    addAuditLog(
      db,
      actor,
      'Suppression bulletin de paye',
      'Paie',
      slip.payslipNumber,
      `Bulletin ${slip.payslipNumber} (${slip.periodLabel}) supprimé.`
    );
    await saveLocalDatabase(db);
    return { ok: true } as T;
  }

  if (method === 'POST' && path === '/api/admin/reset-demo') {
    assertRole(db, session, ['admin']);
    const seed = createSeedDatabase();
    await saveLocalDatabase(seed);
    return { ok: true } as T;
  }

  throw new Error(`Endpoint inconnu (${method} ${path}).`);
}
