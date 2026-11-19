import * as XLSX from 'xlsx';
import type {
  AcademicYearArchive,
  ArchivedStudentRecord,
  ArchivedTeacherRecord,
} from '../types';

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseNumberCell(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isNaN(val) ? null : val;
  const cleaned = String(val)
    .replace(/fcfa/gi, '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function getField(row: Record<string, unknown>, candidates: string[]): unknown {
  const entries = Object.entries(row);
  for (const cand of candidates) {
    const found = entries.find(([k]) => normalizeHeader(k) === cand);
    if (found && found[1] !== undefined && found[1] !== '') return found[1];
  }
  for (const cand of candidates) {
    const found = entries.find(([k]) => normalizeHeader(k).includes(cand));
    if (found && found[1] !== undefined && found[1] !== '') return found[1];
  }
  return undefined;
}

export async function parseArchiveExcelFile(file: File): Promise<{
  detectedYear: string | null;
  records: ArchivedStudentRecord[];
  teacherRecords: ArchivedTeacherRecord[];
  sheetsRead: string[];
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames.length) {
    throw new Error('Le classeur Excel ne contient aucune feuille.');
  }

  let detectedYear: string | null = null;
  const fileYearMatch = file.name.match(/(20\d{2})\D?(20\d{2})/);
  if (fileYearMatch) {
    detectedYear = `${fileYearMatch[1]}-${fileYearMatch[2]}`;
  }

  const records: ArchivedStudentRecord[] = [];
  const teacherRecords: ArchivedTeacherRecord[] = [];
  const sheetsRead: string[] = [];

  const genericSheetNames = new Set([
    'feuil1',
    'feuil2',
    'feuil3',
    'sheet1',
    'sheet2',
    'sheet3',
    'eleves',
    'dossierseleves',
    'dossiers',
    'archive',
    'archives',
    'students',
    'données',
    'donnees',
  ]);

  for (const sheetName of workbook.SheetNames) {
    const normSheet = normalizeHeader(sheetName);
    if (
      normSheet === 'synthese' ||
      normSheet === 'sommaire' ||
      normSheet === 'resume' ||
      normSheet === 'summary'
    ) {
      // Still try to extract academic year from summary sheet if not found in filename
      if (!detectedYear) {
        const sumSheet = workbook.Sheets[sheetName];
        const sumRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sumSheet, { defval: '' });
        for (const r of sumRows) {
          for (const v of Object.values(r)) {
            const m = String(v).match(/(20\d{2})\D?(20\d{2})/);
            if (m) {
              detectedYear = `${m[1]}-${m[2]}`;
              break;
            }
          }
          if (detectedYear) break;
        }
      }
      continue;
    }

    if (!detectedYear) {
      const sheetYearMatch = sheetName.match(/(20\d{2})\D?(20\d{2})/);
      if (sheetYearMatch) {
        detectedYear = `${sheetYearMatch[1]}-${sheetYearMatch[2]}`;
      }
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (!rawRows.length) continue;

    // Inspect column headers on this sheet to decide if it's teacher/payroll or student data
    const sampleKeys = Object.keys(rawRows[0] || {}).map((k) => normalizeHeader(k));
    const isTeacherByName =
      normSheet.includes('enseignant') ||
      normSheet.includes('prof') ||
      normSheet.includes('paie') ||
      normSheet.includes('teacher') ||
      normSheet.includes('personnel');
    const hasTeacherCols = sampleKeys.some(
      (k) =>
        k.includes('enseignant') ||
        k.includes('professeur') ||
        k.includes('tauxhoraire') ||
        k.includes('salaire') ||
        k.includes('cumulheure')
    );
    const hasStudentCols = sampleKeys.some(
      (k) =>
        k.includes('idcarte') ||
        k.includes('eleve') ||
        k.includes('moyenne') ||
        k.includes('fraisattendus') ||
        k.includes('parent') ||
        k.includes('tuteur')
    );

    const treatAsTeacher = (isTeacherByName || hasTeacherCols) && !hasStudentCols;

    if (treatAsTeacher) {
      let countBefore = teacherRecords.length;
      rawRows.forEach((row, idx) => {
        const rawFullName = getField(row, [
          'enseignant',
          'nomcomplet',
          'nometprenom',
          'professeur',
          'fullname',
        ]);
        const rawLastName = getField(row, ['nom', 'nomdefamille', 'lastname']);
        const rawFirstName = getField(row, ['prenom', 'prenoms', 'firstname']);
        const fullName = String(
          rawFullName || `${rawLastName || ''} ${rawFirstName || ''}`.trim()
        ).trim();
        if (!fullName) return;

        const matricule = String(
          getField(row, ['matricule', 'identifiant', 'id']) ||
            `ENS-ARC-${String(teacherRecords.length + idx + 1).padStart(3, '0')}`
        ).trim();
        const specialty = String(
          getField(row, ['specialite', 'matiere', 'discipline', 'matieres']) || '—'
        ).trim();
        const contractType = String(
          getField(row, ['contrat', 'typecontrat', 'statut']) || 'Permanent'
        ).trim();
        const cycles = String(
          getField(row, ['cycles', 'cycle', 'niveau']) || '—'
        ).trim();
        const hourlyRateFcfa =
          parseNumberCell(getField(row, ['tauxhorairefcfa', 'tauxhoraire', 'taux'])) ?? 0;
        const totalHours =
          parseNumberCell(getField(row, ['cumulheures', 'heures', 'totalheures', 'hours'])) ?? 0;
        const paidRaw = parseNumberCell(
          getField(row, [
            'salaireversefcfa',
            'salaireverse',
            'salairenet',
            'salaire',
            'totalpaye',
            'montant',
          ])
        );
        const totalPaidFcfa =
          paidRaw !== null ? paidRaw : Math.round(hourlyRateFcfa * totalHours);

        teacherRecords.push({
          matricule,
          fullName,
          specialty,
          contractType,
          cycles,
          hourlyRateFcfa,
          totalHours,
          totalPaidFcfa,
        });
      });
      if (teacherRecords.length > countBefore) {
        sheetsRead.push(`${sheetName} (enseignants)`);
      }
    } else {
      let countBefore = records.length;
      const fallbackClass = genericSheetNames.has(normSheet) ? '—' : sheetName;
      rawRows.forEach((row) => {
        const rawFullName = getField(row, [
          'nomcomplet',
          'eleve',
          'nometprenom',
          'fullname',
          'student',
        ]);
        const rawLastName = getField(row, ['nom', 'nomdefamille', 'lastname']);
        const rawFirstName = getField(row, ['prenom', 'prenoms', 'firstname']);
        const fullName = String(
          rawFullName || `${rawLastName || ''} ${rawFirstName || ''}`.trim()
        ).trim();

        if (!fullName) return;

        const cardId = String(
          getField(row, ['idcarte', 'carte', 'cardid', 'matricule', 'identifiant', 'id']) ||
            `ARC-${String(records.length + 1).padStart(4, '0')}`
        ).trim();
        const gender = String(getField(row, ['sexe', 'genre', 'gender']) || '—').trim();
        const cycle = String(getField(row, ['cycle', 'niveau']) || '—').trim();
        const program = String(getField(row, ['programme', 'program']) || 'Congolais').trim();
        const className = String(
          getField(row, ['classe', 'class', 'classname']) || fallbackClass
        ).trim();
        const parentName = String(
          getField(row, ['parent', 'tuteur', 'parenttuteur', 'parentname']) || '—'
        ).trim();
        const parentPhone = String(
          getField(row, ['telephone', 'tel', 'phone', 'contact']) || '—'
        ).trim();

        const expected =
          parseNumberCell(
            getField(row, [
              'fraisattendusfcfa',
              'fraisattendus',
              'attendufcfa',
              'attendu',
              'totalexpected',
              'scolarite',
              'frais',
            ])
          ) ?? 0;
        const paid =
          parseNumberCell(
            getField(row, [
              'montantpayefcfa',
              'montantpaye',
              'payefcfa',
              'paye',
              'verse',
              'encaisse',
              'totalpaid',
            ])
          ) ?? 0;
        const balanceRaw = parseNumberCell(
          getField(row, ['solderestantfcfa', 'solderestant', 'solde', 'restantdu', 'reste'])
        );
        const balanceRemainingFcfa = balanceRaw !== null ? balanceRaw : Math.max(0, expected - paid);

        const generalAverage = parseNumberCell(
          getField(row, ['moyennegenerale20', 'moyennegenerale', 'moyenne', 'moy', 'average', 'note'])
        );
        const rank = parseNumberCell(getField(row, ['rang', 'classement', 'rank']));
        const mention = String(getField(row, ['mention', 'appreciation']) || '—').trim();
        const absencesCount =
          parseNumberCell(getField(row, ['absences', 'absence', 'absencescount'])) ?? 0;
        const latesCount = parseNumberCell(getField(row, ['retards', 'retard', 'latescount'])) ?? 0;

        records.push({
          cardId,
          fullName,
          gender,
          cycle,
          program,
          className,
          parentName,
          parentPhone,
          totalExpectedFcfa: expected,
          totalPaidFcfa: paid,
          balanceRemainingFcfa: balanceRemainingFcfa,
          generalAverage,
          rank,
          mention,
          absencesCount,
          latesCount,
        });
      });
      if (records.length > countBefore) {
        sheetsRead.push(`${sheetName} (élèves)`);
      }
    }
  }

  if (!records.length && !teacherRecords.length) {
    throw new Error(
      'Aucune ligne exploitable trouvée dans le classeur Excel. Vérifiez que votre fichier contient une colonne « Nom complet » (ou « Nom » / « Prénom » / « Enseignant »).'
    );
  }

  return { detectedYear, records, teacherRecords, sheetsRead };
}

export function downloadArchiveExcelTemplate(): void {
  const sampleRows = [
    {
      'ID Carte': 'JS-25-0001',
      'Nom complet': 'MAKOSSO Chloé',
      Sexe: 'F',
      Cycle: 'Primaire',
      Programme: 'Français',
      Classe: 'CM1 A',
      'Parent / Tuteur': 'M. Bienvenu Makosso',
      Téléphone: '+242 06 612 45 89',
      'Frais attendus (FCFA)': 480000,
      'Montant payé (FCFA)': 480000,
      'Solde restant (FCFA)': 0,
      'Moyenne générale (/20)': 16.25,
      Rang: 1,
      Mention: 'Très bien',
      Absences: 0,
      Retards: 1,
    },
    {
      'ID Carte': 'JS-25-0002',
      'Nom complet': 'TCHICAYA Kévin',
      Sexe: 'M',
      Cycle: 'Lycée Général',
      Programme: 'Français',
      Classe: '2nde S',
      'Parent / Tuteur': 'Mme Hortense Tchicaya',
      Téléphone: '+242 05 534 19 22',
      'Frais attendus (FCFA)': 750000,
      'Montant payé (FCFA)': 750000,
      'Solde restant (FCFA)': 0,
      'Moyenne générale (/20)': 14.4,
      Rang: 3,
      Mention: 'Bien',
      Absences: 1,
      Retards: 2,
    },
  ];

  const teacherSampleRows = [
    {
      Matricule: 'ENS-25-001',
      Enseignant: 'MOUANDA Jean-Claude',
      Spécialité: 'Mathématiques',
      Contrat: 'Permanent',
      Cycles: 'Collège, Lycée Général',
      'Taux horaire (FCFA)': 6500,
      'Cumul heures': 640,
      'Salaire versé (FCFA)': 4160000,
    },
    {
      Matricule: 'ENS-25-002',
      Enseignant: 'MALONGA Solange',
      Spécialité: 'Français & Littérature',
      Contrat: 'Permanent',
      Cycles: 'Primaire, Collège',
      'Taux horaire (FCFA)': 5500,
      'Cumul heures': 600,
      'Salaire versé (FCFA)': 3300000,
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wsTeachers = XLSX.utils.json_to_sheet(teacherSampleRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Dossiers élèves');
  XLSX.utils.book_append_sheet(wb, wsTeachers, 'Corps enseignants');
  XLSX.writeFile(wb, 'modele-archive-jegama-school.xlsx');
}

export function exportArchiveToExcel(archive: AcademicYearArchive): void {
  const originLabel =
    archive.source === 'cloture'
      ? 'Clôture de fin d’année'
      : archive.source === 'manuel'
        ? 'Archivage manuel'
        : 'Importation Excel';

  const summaryRows = [
    { Indicateur: 'Année académique', Valeur: archive.academicYear },
    { Indicateur: 'Origine', Valeur: originLabel },
    { Indicateur: 'Date d’archivage', Valeur: new Date(archive.archivedAt).toLocaleString('fr-FR') },
    { Indicateur: 'Archivé par', Valeur: archive.archivedBy },
    { Indicateur: 'Nombre total d’élèves', Valeur: archive.summary.totalStudents },
    { Indicateur: 'Total frais attendus (FCFA)', Valeur: archive.summary.totalExpectedFcfa },
    { Indicateur: 'Total encaissé (FCFA)', Valeur: archive.summary.totalCollectedFcfa },
    {
      Indicateur: 'Moyenne générale établissement (/20)',
      Valeur: archive.summary.averageScore !== null ? archive.summary.averageScore : '—',
    },
    {
      Indicateur: 'Effectif corps enseignants',
      Valeur: archive.summary.totalTeachers ?? archive.teacherRecords?.length ?? 0,
    },
    {
      Indicateur: 'Cumul heures enseignées',
      Valeur: archive.summary.totalTeacherHours ?? 0,
    },
    {
      Indicateur: 'Masse salariale versée (FCFA)',
      Valeur: archive.summary.totalPayrollFcfa ?? 0,
    },
    { Indicateur: 'Observations', Valeur: archive.notes || '—' },
  ];

  const studentRows = archive.records.map((r) => ({
    'ID Carte': r.cardId,
    'Nom complet': r.fullName,
    Sexe: r.gender,
    Cycle: r.cycle,
    Programme: r.program,
    Classe: r.className,
    'Parent / Tuteur': r.parentName,
    Téléphone: r.parentPhone,
    'Frais attendus (FCFA)': r.totalExpectedFcfa,
    'Montant payé (FCFA)': r.totalPaidFcfa,
    'Solde restant (FCFA)': r.balanceRemainingFcfa,
    'Moyenne générale (/20)': r.generalAverage !== null ? r.generalAverage : '',
    Rang: r.rank !== null ? r.rank : '',
    Mention: r.mention,
    Absences: r.absencesCount,
    Retards: r.latesCount,
  }));

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsStudents = XLSX.utils.json_to_sheet(studentRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Synthèse');
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Dossiers élèves');

  if (archive.teacherRecords && archive.teacherRecords.length > 0) {
    const teacherRows = archive.teacherRecords.map((t) => ({
      Matricule: t.matricule,
      Enseignant: t.fullName,
      Spécialité: t.specialty,
      Contrat: t.contractType,
      Cycles: t.cycles,
      'Taux horaire (FCFA)': t.hourlyRateFcfa,
      'Cumul heures': t.totalHours,
      'Salaire versé (FCFA)': t.totalPaidFcfa,
    }));
    const wsTeachers = XLSX.utils.json_to_sheet(teacherRows);
    XLSX.utils.book_append_sheet(wb, wsTeachers, 'Corps enseignants');
  }

  XLSX.writeFile(wb, `archive-jegama-${archive.academicYear}.xlsx`);
}

export interface ImportedGradeRow {
  cardId: string;
  studentName: string;
  values: number[];
  teacherAppreciation: string;
}

export function downloadGradesExcelTemplate(params: {
  className: string;
  subjectName: string;
  periodLabel: string;
  rows: Array<{
    cardId: string;
    fullName: string;
    values: number[];
    teacherAppreciation: string;
  }>;
}): void {
  const maxNotes = Math.max(
    3,
    ...params.rows.map((r) => r.values.length)
  );

  const sheetRows = params.rows.map((r) => {
    const base: Record<string, string | number> = {
      'ID Carte': r.cardId,
      'Nom complet': r.fullName,
    };
    for (let i = 0; i < maxNotes; i++) {
      base[`Note ${i + 1}`] = r.values[i] !== undefined ? r.values[i] : '';
    }
    base['Appréciation'] = r.teacherAppreciation || '';
    return base;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Notes');
  const safeName = `${params.className}-${params.subjectName}-${params.periodLabel}`
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .toLowerCase();
  XLSX.writeFile(wb, `notes-${safeName}.xlsx`);
}

export async function parseGradesExcelFile(file: File): Promise<ImportedGradeRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames.length) {
    throw new Error('Le classeur Excel ne contient aucune feuille.');
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rawRows.length) {
    throw new Error('La feuille Excel est vide.');
  }

  const parsed: ImportedGradeRow[] = [];
  for (const row of rawRows) {
    const cardId = String(
      getField(row, ['idcarte', 'carte', 'cardid', 'matricule', 'identifiant']) || ''
    )
      .trim()
      .toUpperCase();
    const studentName = String(
      getField(row, ['nomcomplet', 'eleve', 'nometprenom', 'fullname']) || ''
    ).trim();

    if (!cardId && !studentName) continue;

    // Collect Note 1..Note 10 or Eval 1..Eval 10 columns in order
    const values: number[] = [];
    const entries = Object.entries(row);
    const noteCols = entries
      .filter(([key]) => {
        const n = normalizeHeader(key);
        return /^(note|eval|evaluation|devoir|compo)\d*$/.test(n);
      })
      .sort(([a], [b]) => {
        const na = Number(a.replace(/\D/g, '')) || 0;
        const nb = Number(b.replace(/\D/g, '')) || 0;
        return na - nb;
      });

    if (noteCols.length > 0) {
      for (const [, val] of noteCols) {
        const num = parseNumberCell(val);
        if (num !== null) values.push(num);
      }
    } else {
      const multiRaw = getField(row, ['notes', 'valeurs']);
      if (multiRaw !== undefined && multiRaw !== '') {
        const parts = String(multiRaw)
          .split(/[;/|]+/)
          .map((s) => parseNumberCell(s))
          .filter((n): n is number => n !== null);
        values.push(...parts);
      }
    }

    const teacherAppreciation = String(
      getField(row, ['appreciation', 'observation', 'commentaire', 'remarque']) || ''
    ).trim();

    if (values.length > 0) {
      parsed.push({ cardId, studentName, values, teacherAppreciation });
    }
  }

  if (parsed.length === 0) {
    throw new Error(
      'Aucune note valide trouvée. Vérifiez les colonnes « ID Carte » et « Note 1 », « Note 2 », etc.'
    );
  }

  return parsed;
}

