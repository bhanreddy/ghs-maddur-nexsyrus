import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { StudentService } from '../../services/studentService';
import { APIError } from '../../services/apiClient';

interface Props {
  visible: boolean;
  studentId: string | null;
  studentName: string;
  studentSubtitle?: string;
  onClose: () => void;
  /** Called after a successful permanent delete so the caller can refresh. */
  onDeleted: () => void;
}

const WIPED_ITEMS = [
  'Profile, login account & parent links',
  'All fee records, receipts & transactions',
  'Marks, exam results & attendance history',
  'Transport, hostel & certificate records',
  'Program progress & every other linked record',
];

/**
 * Three-step, hard-to-fire-by-accident confirmation for PERMANENTLY deleting a
 * student and all of their data:
 *   1. Strong caution + what gets wiped
 *   2. Type the student's exact name to unlock
 *   3. Final "last chance" confirm → calls the hard-delete API
 */
export default function HardDeleteStudentModal({
  visible,
  studentId,
  studentName,
  studentSubtitle,
  onClose,
  onDeleted,
}: Props) {
  const { theme, isDark } = useTheme();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a clean state every time the modal (re)opens.
  useEffect(() => {
    if (visible) {
      setStep(1);
      setTyped('');
      setDeleting(false);
      setError(null);
    }
  }, [visible]);

  const nameMatches = typed.trim().toLowerCase() === studentName.trim().toLowerCase();

  const handleConfirm = async () => {
    if (!studentId || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await StudentService.hardDelete(studentId);
      onDeleted();
    } catch (e) {
      setError(e instanceof APIError ? e.message : 'Failed to delete student. Please try again.');
      setDeleting(false);
    }
  };

  const s = getStyles(isDark);
  const danger = '#DC2626';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={deleting ? undefined : onClose}>
      <View style={s.backdrop}>
        <View style={[s.card, { backgroundColor: theme.colors.surface }]}>
          {/* Danger banner */}
          <View style={s.iconWrap}>
            <View style={[s.iconCircle, { backgroundColor: isDark ? 'rgba(220,38,38,0.16)' : '#FEE2E2' }]}>
              <Ionicons name="warning" size={30} color={danger} />
            </View>
          </View>

          <Text style={[s.stepBadge, { color: theme.colors.textMuted }]}>STEP {step} OF 3</Text>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {step === 1 && (
              <>
                <Text style={[s.title, { color: theme.colors.textStrong }]}>Permanently delete this student?</Text>
                <Text style={[s.subject, { color: theme.colors.textStrong }]}>{studentName}</Text>
                {!!studentSubtitle && <Text style={[s.subtitle, { color: theme.colors.textSecondary }]}>{studentSubtitle}</Text>}

                <View style={[s.warnBox, { backgroundColor: isDark ? 'rgba(220,38,38,0.10)' : '#FEF2F2', borderColor: isDark ? 'rgba(220,38,38,0.3)' : '#FECACA' }]}>
                  <Text style={[s.warnHeading, { color: danger }]}>This cannot be undone. It will erase:</Text>
                  {WIPED_ITEMS.map((item) => (
                    <View key={item} style={s.bulletRow}>
                      <Ionicons name="close-circle" size={15} color={danger} style={{ marginTop: 1 }} />
                      <Text style={[s.bulletText, { color: theme.colors.textSecondary }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={[s.title, { color: theme.colors.textStrong }]}>Confirm the student's name</Text>
                <Text style={[s.helper, { color: theme.colors.textSecondary }]}>
                  To make sure this is intentional, type the full name exactly as shown:
                </Text>
                <Text style={[s.nameToType, { color: danger }]}>{studentName}</Text>
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="Type the name here"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    s.input,
                    {
                      color: theme.colors.textPrimary,
                      backgroundColor: theme.colors.background,
                      borderColor: typed.length === 0 ? theme.colors.border : nameMatches ? '#16A34A' : danger,
                    },
                  ]}
                />
                {typed.length > 0 && !nameMatches && (
                  <Text style={[s.mismatch, { color: danger }]}>The name doesn't match yet.</Text>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <Text style={[s.title, { color: theme.colors.textStrong }]}>Last chance</Text>
                <Text style={[s.helper, { color: theme.colors.textSecondary }]}>
                  You're about to permanently delete{' '}
                  <Text style={{ fontWeight: '800', color: theme.colors.textStrong }}>{studentName}</Text>{' '}
                  and every record belonging to them. This is irreversible.
                </Text>
              </>
            )}

            {!!error && <Text style={[s.error, { color: danger }]}>{error}</Text>}
          </ScrollView>

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity
              onPress={onClose}
              disabled={deleting}
              style={[s.btn, s.btnGhost, { borderColor: theme.colors.border, opacity: deleting ? 0.5 : 1 }]}
            >
              <Text style={[s.btnGhostText, { color: theme.colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            {step === 1 && (
              <TouchableOpacity onPress={() => setStep(2)} style={[s.btn, { backgroundColor: danger }]}>
                <Text style={s.btnText}>I understand, continue</Text>
              </TouchableOpacity>
            )}
            {step === 2 && (
              <TouchableOpacity
                onPress={() => setStep(3)}
                disabled={!nameMatches}
                style={[s.btn, { backgroundColor: danger, opacity: nameMatches ? 1 : 0.4 }]}
              >
                <Text style={s.btnText}>Continue</Text>
              </TouchableOpacity>
            )}
            {step === 3 && (
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={deleting}
                style={[s.btn, { backgroundColor: danger, opacity: deleting ? 0.7 : 1 }]}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.btnText}>Delete permanently</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      width: '100%',
      maxWidth: 440,
      borderRadius: 20,
      padding: 22,
      ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 }),
    },
    iconWrap: { alignItems: 'center', marginBottom: 10 },
    iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
    stepBadge: { textAlign: 'center', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
    title: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
    subject: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 8 },
    subtitle: { fontSize: 13, textAlign: 'center', marginTop: 2 },
    helper: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10 },
    warnBox: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 16 },
    warnHeading: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 5 },
    bulletText: { fontSize: 13, flex: 1, lineHeight: 18 },
    nameToType: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 12, marginBottom: 12 },
    input: { borderWidth: 1.5, borderRadius: 12, height: 48, paddingHorizontal: 14, fontSize: 16 },
    mismatch: { fontSize: 12, marginTop: 6, textAlign: 'center' },
    error: { fontSize: 13, marginTop: 12, textAlign: 'center', fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    btn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    btnGhost: { borderWidth: 1, backgroundColor: 'transparent' },
    btnGhostText: { fontSize: 14, fontWeight: '700' },
    btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  });
