import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { SubstitutionSlot } from '../../../services/substitutionService';
import { PlanningSlotStatus } from '../../../utils/manualPlanningSlots';
import { planningColors, statusVisual } from './planningTheme';

export default function PlanningSlotCard({
  slot,
  periodLabel,
  timeLabel,
  status,
  disabledReason,
  highlighted,
  basis,
  onSelect,
}: {
  slot: SubstitutionSlot;
  periodLabel: string;
  timeLabel: string;
  status: PlanningSlotStatus;
  disabledReason: string | null;
  highlighted: boolean;
  basis: string;
  onSelect: (slot: SubstitutionSlot) => void;
}) {
  const { isDark } = useTheme();
  const c = useMemo(() => planningColors(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(c), [c]);
  const visual = statusVisual(status, c);
  const selectable = !disabledReason;
  const coverName = slot.substitute_teacher_name || '';
  const classSection = [slot.class_name, slot.section_name].filter(Boolean).join(' · ');
  const statusText = slot.unavailability_label && status === 'needs_cover'
    ? `${visual.label}. ${slot.unavailability_label}`
    : visual.label;
  const actionLabel = selectable
    ? `Assign one-day cover for ${classSection}, ${slot.subject_name}, ${periodLabel}`
    : `${statusText}. ${classSection}, ${slot.subject_name}, ${periodLabel}. ${disabledReason}`;

  return (
    <Pressable
      onPress={() => {
        if (selectable) onSelect(slot);
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !selectable, selected: highlighted }}
      accessibilityLabel={highlighted ? `Cover just assigned. ${actionLabel}` : actionLabel}
      testID={`planning-slot-${slot.slot_id}`}
      style={(state) => {
        const focused = Boolean((state as { focused?: boolean }).focused);
        const hovered = Boolean((state as { hovered?: boolean }).hovered);
        return [
          styles.card,
          { flexBasis: basis as never, borderColor: highlighted ? c.teal : status === 'unavailable' ? c.border : c.border },
          status === 'unavailable' && styles.unavailable,
          highlighted && styles.highlighted,
          selectable && hovered && styles.hovered,
          focused && styles.focused,
        ];
      }}
    >
      <View style={[styles.accent, { backgroundColor: visual.accent }]} />
      <View style={styles.top}>
        <View style={styles.periodBlock}>
          <Text style={styles.periodLabel}>{periodLabel}</Text>
          {timeLabel ? <Text style={styles.timeLabel}>{timeLabel}</Text> : null}
        </View>
        <View style={[styles.badge, { backgroundColor: visual.soft }]}>
          <Ionicons name={visual.icon} size={14} color={visual.color} />
          <Text style={[styles.badgeText, { color: visual.color }]}>{visual.label}</Text>
        </View>
      </View>

      <Text style={styles.classTitle}>
        Class {slot.class_name}
        <Text style={styles.sectionTitle}>  ·  Section {slot.section_name}</Text>
      </Text>
      <Text style={styles.subject} numberOfLines={2}>{slot.subject_name}</Text>

      <Field label="Regular teacher" value={slot.regular_teacher_name || 'Not assigned'} styles={styles} />
      {slot.room_no ? <Field label="Room" value={slot.room_no} styles={styles} /> : null}
      <Field
        label={slot.is_auto_suggested ? 'Suggested cover' : 'Cover teacher'}
        value={coverName || 'No cover assigned'}
        emphasize={Boolean(coverName)}
        styles={styles}
      />
      {slot.unavailability_label && status === 'needs_cover' ? (
        <Text style={styles.contextNote}>{slot.unavailability_label}</Text>
      ) : null}
      {highlighted ? (
        <View style={styles.updatedPill}>
          <Ionicons name="checkmark-circle" size={14} color={c.teal} />
          <Text style={styles.updatedText}>Cover assigned</Text>
        </View>
      ) : null}

      {selectable ? (
        <View style={styles.assignButton}>
          <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
          <Text style={styles.assignText}>Assign one-day cover</Text>
        </View>
      ) : (
        <View style={styles.reasonRow}>
          <Ionicons name="information-circle-outline" size={15} color={c.muted} />
          <Text style={styles.reasonText}>{disabledReason}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Field({
  label,
  value,
  emphasize,
  styles,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, emphasize && styles.fieldValueEmphasis]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof planningColors>) {
  return StyleSheet.create({
    card: {
      flexGrow: 1,
      minWidth: 0,
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      padding: 16,
      paddingLeft: 18,
      overflow: 'hidden',
      shadowColor: c.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    unavailable: { borderStyle: 'dashed' },
    highlighted: { borderWidth: 2, backgroundColor: c.tealSoft },
    hovered: { backgroundColor: c.cardAlt },
    focused: Platform.OS === 'web'
      ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: c.focus, outlineOffset: 2 } as object)
      : { borderColor: c.focus },
    accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    periodBlock: { flex: 1, minWidth: 0 },
    periodLabel: { color: c.text, fontSize: 13, fontWeight: '800' },
    timeLabel: { color: c.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
      maxWidth: '58%',
    },
    badgeText: { fontSize: 11, fontWeight: '800' },
    classTitle: { color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 14 },
    sectionTitle: { color: c.subtext, fontSize: 15, fontWeight: '700' },
    subject: { color: c.text, fontSize: 15, fontWeight: '700', marginTop: 4, marginBottom: 12, lineHeight: 21 },
    field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
    fieldLabel: { color: c.muted, fontSize: 12, fontWeight: '700' },
    fieldValue: { color: c.text, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
    fieldValueEmphasis: { color: c.teal },
    contextNote: { color: c.amber, fontSize: 12, fontWeight: '700', marginTop: 4 },
    updatedPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    updatedText: { color: c.teal, fontSize: 12, fontWeight: '800' },
    assignButton: {
      marginTop: 12,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: c.indigo,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    assignText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    reasonRow: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    reasonText: { color: c.subtext, fontSize: 12, lineHeight: 17, fontWeight: '600', flex: 1 },
  });
}
