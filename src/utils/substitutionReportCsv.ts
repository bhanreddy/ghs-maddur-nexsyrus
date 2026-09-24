import { Platform } from 'react-native';
import { SubstitutionBoard, SubstitutionSlot } from '../services/substitutionService';
import { buildPeriodDisplayMap, getSlotDisplayInfo } from './substitutionPeriodNumbering';

function escapeCsv(value?: string | number | null): string {
  const str = String(value ?? '').trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function timeLabel(value?: string): string {
  if (!value) return '';
  const [hourRaw, minute = '00'] = value.split(':');
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value.slice(0, 5);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function buildSubstitutionReportCsv(board: SubstitutionBoard): string {
  const periodMap = buildPeriodDisplayMap(board.periods);
  const assigned = board.slots.filter((slot) => Boolean(slot.substitution_id && slot.substitute_teacher_name));

  // Chronological sort
  const sorted = [...assigned].sort((a, b) =>
    a.period_number - b.period_number ||
    String(a.start_time || '').localeCompare(String(b.start_time || '')) ||
    `${a.class_name}-${a.section_name}`.localeCompare(`${b.class_name}-${b.section_name}`, undefined, { numeric: true })
  );

  const headers = [
    '#',
    'Date',
    'Period',
    'Time',
    'Class',
    'Room',
    'Absent Teacher',
    'Substitute Teacher',
    'Reason',
  ];

  const rows = sorted.map((slot, index) => {
    const periodInfo = getSlotDisplayInfo(slot, periodMap);
    const periodDisplay = periodInfo.isBreak
      ? periodInfo.displayLabel
      : periodInfo.shortLabel;
    const timeDisplay = `${timeLabel(slot.start_time)} - ${timeLabel(slot.end_time)}`;
    const classDisplay = `${slot.class_name}-${slot.section_name}`;

    return [
      escapeCsv(index + 1),
      escapeCsv(board.date),
      escapeCsv(periodDisplay),
      escapeCsv(timeDisplay),
      escapeCsv(classDisplay),
      escapeCsv(slot.room_no || ''),
      escapeCsv(slot.regular_teacher_name || 'Not assigned'),
      escapeCsv(slot.substitute_teacher_name || ''),
      escapeCsv(slot.reason || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export async function downloadSubstitutionReportCsv(board: SubstitutionBoard): Promise<string> {
  const csv = buildSubstitutionReportCsv(board);
  const fileName = `substitutions-${board.date.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    return fileName;
  }

  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, `\ufeff${csv}`, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      dialogTitle: `Download ${fileName}`,
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  }
  return fileName;
}
