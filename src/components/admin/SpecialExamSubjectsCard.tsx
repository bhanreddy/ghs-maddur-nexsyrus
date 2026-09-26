import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import AppTextInput from '../AppTextInput';
import { ClassService, ClassSection } from '../../services/classService';
import { ExamPaper } from '../../services/examService';
import { alertCompat } from '../../utils/crossPlatformAlert';
import { api } from '../../services/apiClient';
import {
  CLASS_TEACHER_NOT_ASSIGNED,
  MARKS_ENTERED_BY_CLASS_TEACHER,
  SpecialSubjectDraft,
  classTargetKey,
  SpecialSubjectSpec,
  draftsToSpecs,
  emptySpecialSubjectDraft,
  papersToDrafts,
  sectionsMissingClassTeacher,
} from '../../utils/specialExamSubjects';

interface Props {
  academicYearId: string;
  papers: ExamPaper[];
  resultsPublished?: boolean;
  /** When set, Save writes immediately. Create mode reports specs through onSpecsChange. */
  examId?: string;
  onSaved?: () => void;
  onSpecsChange?: (specs: SpecialSubjectSpec[]) => void;
}

export function SpecialExamSubjectsCard({
  academicYearId,
  papers,
  resultsPublished = false,
  examId,
  onSaved,
  onSpecsChange,
}: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [drafts, setDrafts] = useState<SpecialSubjectDraft[]>(() => papersToDrafts(papers));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(papersToDrafts(papers));
  }, [papers]);

  useEffect(() => {
    onSpecsChange?.(draftsToSpecs(drafts, sections));
  }, [drafts, sections, onSpecsChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ClassService.getClassSections(academicYearId)
      .then((rows) => {
        if (active) setSections(rows);
      })
      .catch(() => {
        if (active) setSections([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [academicYearId]);

  const classes = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sections: ClassSection[] }>();
    for (const section of sections) {
      let entry = map.get(section.class_id);
      if (!entry) {
        entry = { id: section.class_id, name: section.class_name, sections: [] };
        map.set(section.class_id, entry);
      }
      entry.sections.push(section);
    }
    return [...map.values()].map((entry) => ({
      ...entry,
      sections: [...entry.sections].sort((a, b) => a.section_name.localeCompare(b.section_name)),
    }));
  }, [sections]);

  const updateDraft = (localId: string, patch: Partial<SpecialSubjectDraft>) => {
    setDrafts((current) => current.map((draft) => (
      draft.localId === localId ? { ...draft, ...patch } : draft
    )));
  };

  const toggleTarget = (draft: SpecialSubjectDraft, value: string) => {
    const selected = new Set(draft.selected);
    if (value.startsWith('class:')) {
      const classId = value.slice(6);
      if (selected.has(value)) {
        selected.delete(value);
      } else {
        selected.add(value);
        for (const section of sections) {
          if (section.class_id === classId) selected.delete(section.id);
        }
      }
    } else {
      const section = sections.find((item) => item.id === value);
      if (section) selected.delete(classTargetKey(section.class_id));
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
    }
    updateDraft(draft.localId, { selected: [...selected] });
  };

  const save = async () => {
    if (!examId) return;
    if (resultsPublished) {
      alertCompat('Results are published', 'Unpublish results before changing special subjects.');
      return;
    }
    try {
      setSaving(true);
      await api.put(`/results/exams/${examId}/special-subjects`, {
        subjects: draftsToSpecs(drafts, sections),
      });
      alertCompat('Saved', 'Special subjects updated.');
      onSaved?.();
    } catch (error: any) {
      alertCompat('Could not save special subjects', error?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>SPECIAL SUBJECTS</Text>
      <Text style={styles.title}>Exam-only subjects</Text>
      <Text style={styles.body}>
        Subjects such as Handwriting do not need a teaching timetable. {MARKS_ENTERED_BY_CLASS_TEACHER}
      </Text>
      <Text style={styles.note}>
        Released staff apps list Special-1 and Special-2 automatically. Other exam names appear when the app loads exams from the server.
      </Text>
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {drafts.map((draft) => {
        const missing = sectionsMissingClassTeacher(draft, sections);
        return (
          <View key={draft.localId} style={styles.subject}>
            <View style={styles.subjectHead}>
              <Text style={styles.subjectLabel}>Subject</Text>
              <TouchableOpacity
                onPress={() => setDrafts((current) => current.filter((item) => item.localId !== draft.localId))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
            <AppTextInput
              value={draft.name}
              onChangeText={(name) => updateDraft(draft.localId, { name })}
              placeholder="e.g. Handwriting"
              style={styles.input}
            />
            <View style={styles.marksRow}>
              <View style={styles.marksField}>
                <Text style={styles.fieldLabel}>Maximum marks</Text>
                <AppTextInput
                  value={draft.maxMarks}
                  onChangeText={(maxMarks) => updateDraft(draft.localId, { maxMarks })}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
              <View style={styles.marksField}>
                <Text style={styles.fieldLabel}>Passing marks</Text>
                <AppTextInput
                  value={draft.passingMarks}
                  onChangeText={(passingMarks) => updateDraft(draft.localId, { passingMarks })}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Classes and sections</Text>
            {classes.map((klass) => (
              <View key={klass.id} style={styles.classBlock}>
                <TouchableOpacity
                  style={[styles.chip, draft.selected.includes(classTargetKey(klass.id)) && styles.chipOn]}
                  onPress={() => toggleTarget(draft, classTargetKey(klass.id))}
                >
                  <Text style={styles.chipText}>All {klass.name}</Text>
                </TouchableOpacity>
                <View style={styles.chipWrap}>
                  {klass.sections.map((section) => (
                    <TouchableOpacity
                      key={section.id}
                      style={[styles.chip, draft.selected.includes(section.id) && styles.chipOn]}
                      onPress={() => toggleTarget(draft, section.id)}
                    >
                      <Text style={styles.chipText}>{section.class_name}-{section.section_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <Text style={styles.responsibility}>{MARKS_ENTERED_BY_CLASS_TEACHER}</Text>
            {missing.map((section) => (
              <Text key={section.id} style={styles.warning}>
                {section.class_name}-{section.section_name}: {CLASS_TEACHER_NOT_ASSIGNED}
              </Text>
            ))}
          </View>
        );
      })}
      <TouchableOpacity
        style={styles.add}
        onPress={() => setDrafts((current) => [...current, emptySpecialSubjectDraft()])}
      >
        <Ionicons name="add" size={16} color={theme.colors.primary} />
        <Text style={styles.addText}>Add special subject</Text>
      </TouchableOpacity>
      {examId ? (
        <TouchableOpacity style={styles.save} onPress={save} disabled={saving || resultsPublished}>
          <Text style={styles.saveText}>
            {saving ? 'Saving…' : resultsPublished ? 'Unpublish results to edit' : 'Save special subjects'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(theme: { colors: Record<string, string> }) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
    },
    eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
    title: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
    body: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
    note: { color: theme.colors.textTertiary, fontSize: 12, lineHeight: 17 },
    subject: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.background,
      gap: 8,
    },
    subjectHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    subjectLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
    fieldLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.colors.text,
      backgroundColor: theme.colors.card,
    },
    marksRow: { flexDirection: 'row', gap: 8 },
    marksField: { flex: 1, gap: 4 },
    classBlock: { gap: 6 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.colors.card,
    },
    chipOn: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}18` },
    chipText: { color: theme.colors.text, fontSize: 12, fontWeight: '600' },
    responsibility: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
    warning: { color: theme.colors.warning, fontSize: 12, fontWeight: '600' },
    add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    addText: { color: theme.colors.primary, fontWeight: '700' },
    save: {
      marginTop: 4,
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    saveText: { color: '#FFFFFF', fontWeight: '700' },
  });
}
