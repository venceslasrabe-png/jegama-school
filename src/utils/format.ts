import type { MentionThreshold, SchoolCycle, SchoolProgram, UserRole } from '../types';

export function formatFcfa(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} FCFA`;
}

export function formatDateFr(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeMention(score: number, thresholds: MentionThreshold[]): string {
  const sorted = [...thresholds].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (score >= t.minScore) return t.label;
  }
  return 'Insuffisant';
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  scolarite: 'Scolarité',
  caisse: 'Caisse (Scolarité)',
  secretariat: 'Secrétariat académique',
  surveillant: 'Surveillance & Guérite',
  parent: 'Parent / Tuteur',
  direction: 'Direction générale',
  admin: 'Administrateur',
};

export const CYCLES: SchoolCycle[] = [
  'Maternelle',
  'Primaire',
  'Collège',
  'Lycée Général',
  'Lycée Technique',
];

export const PROGRAMS: SchoolProgram[] = ['Congolais', 'Français'];

export function generateBarcodeBars(code: string): number[] {
  const bars: number[] = [2, 1, 2, 1];
  for (let i = 0; i < code.length; i++) {
    const ch = code.charCodeAt(i);
    bars.push((ch % 3) + 1, ((ch >> 2) % 2) + 1, ((ch >> 4) % 3) + 1, 1);
  }
  bars.push(2, 1, 2);
  return bars;
}

export function processProfilePhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Veuillez sélectionner un fichier image valide (JPG, PNG ou WebP).'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('La photo sélectionnée dépasse 10 Mo. Choisissez une image plus légère.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image sélectionné.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Format d’image non pris en charge par le navigateur.'));
      img.onload = () => {
        const maxSide = 420;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
