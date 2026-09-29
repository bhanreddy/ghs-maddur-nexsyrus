import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Platform,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import AppTextInput from '@/src/components/AppTextInput';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import AppDatePicker from '@/src/components/AppDatePicker';
import * as Haptics from '@/src/utils/haptics';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import Toast from 'react-native-toast-message';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { useLocalSearchParams } from 'expo-router';
import { DiaryService, DiaryEntry, TeacherService, TeacherClassAssignment } from '../../src/services/commonServices';
import { AcademicPlannerService } from '../../src/services/academicPlannerService';
import { SmartDiaryService, type ClassDiaryEntry, type ClassTeacherSection, type DiaryTemplate, type SmartCurrentClass, type SmartRecentEntry } from '../../src/services/smartDiaryService';
import { enqueueDiary, flushDiaryQueue, startDiaryQueueListener, readPendingClassDiary, writePendingClassDiary } from '../../src/services/diaryOfflineQueue';
import { persistentQueryCache } from '../../src/services/persistentQueryCache';
import { useAuth } from '../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radii, Spacing, Typography, Theme, Surfaces } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  DiaryHistoryTabSwitcher,
  DiaryHistoryDatePickerSheet,
  DiaryHistoryDateSelectorButton,
  priorHistoryYmds,
  DIARY_PHOTO_HISTORY_PRIOR_DAYS,
  toYmd,
  type DiaryHistoryTabId,
} from '../../src/components/diary/DiaryHistoryChrome';
import { classLabel, formatClock, greetingForHour } from '../../src/utils/smartDiary/currentClass';
import {
  composeDiaryContent,
  composeHomeworkLine,
  mergeTemplateCatalog,
  QUICK_TEMPLATE_IDS,
  renderTemplateContent,
  SYSTEM_TEMPLATES,
  uncertainFields,
  type DiaryExtraction,
} from '../../src/utils/smartDiary/compose';
import { isDiaryUuid, newDiaryId } from '../../src/utils/smartDiary/ids';
import { isPhotoFallbackContent, normalizeDiaryAttachments } from '../../src/utils/smartDiary/attachments';

function clay(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  const spread = raised === 'lg' ? 20 : raised === 'sm' ? 10 : 14;
  const dy = raised === 'lg' ? 8 : raised === 'sm' ? 4 : 6;
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(148,163,184,0.28)';
    const light = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.95)';
    return { boxShadow: `0 ${dy}px ${spread}px ${drop}, 0 -1px 0 ${light}` };
  }
  return {
    shadowColor: isDark ? '#000000' : '#94A3B8',
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: isDark ? 0.35 : 0.16,
    shadowRadius: spread,
    elevation: raised === 'lg' ? 5 : raised === 'sm' ? 2 : 3,
  };
}

function clayCard(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  return {
    backgroundColor: isDark ? '#161E2E' : '#F7F8FC',
    borderRadius: raised === 'lg' ? Radii.xxl + 4 : raised === 'sm' ? Radii.xl : Radii.xxl,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1.5,
    borderBottomColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(76,90,120,0.10)',
    overflow: 'hidden' as const,
    ...clay(isDark, raised),
  };
}

type SubjectStyle = {
  color: string;
  soft: string;
  softDark: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  gradient: readonly [string, string];
};

function getSubjectStyle(subject: string = ''): SubjectStyle {
  const s = subject.toLowerCase();
  if (s.includes('math')) return { color: '#2563EB', soft: '#EFF6FF', softDark: 'rgba(37,99,235,0.16)', icon: 'calculate', gradient: ['#1D4ED8', '#3B82F6'] };
  if (s.includes('science') || s.includes('bio') || s.includes('phys') || s.includes('chem')) return { color: '#7C3AED', soft: '#F5F3FF', softDark: 'rgba(124,58,237,0.16)', icon: 'biotech', gradient: ['#6D28D9', '#8B5CF6'] };
  if (s.includes('english')) return { color: '#D97706', soft: '#FFFBEB', softDark: 'rgba(217,119,6,0.16)', icon: 'menu-book', gradient: ['#B45309', '#F59E0B'] };
  if (s.includes('telugu') || s.includes('hindi') || s.includes('sanskrit')) return { color: '#DC2626', soft: '#FEF2F2', softDark: 'rgba(220,38,38,0.16)', icon: 'translate', gradient: ['#B91C1C', '#F87171'] };
  if (s.includes('social') || s.includes('history') || s.includes('civics')) return { color: '#DB2777', soft: '#FDF2F8', softDark: 'rgba(219,39,119,0.16)', icon: 'public', gradient: ['#BE185D', '#F472B6'] };
  return { color: '#4F46E5', soft: '#EEF2FF', softDark: 'rgba(79,70,229,0.16)', icon: 'description', gradient: ['#4338CA', '#6366F1'] };
}

function diaryDisplayTitle(entry: DiaryEntry): string {
  return entry.title_te?.trim() || entry.title || '';
}
function diaryDisplayContent(entry: DiaryEntry): string {
  return entry.content_te?.trim() || entry.content || '';
}
const toDateKey = (d?: string): string => (d ? String(d).slice(0, 10) : '');
function normalizeDiaryEntry(e: DiaryEntry): DiaryEntry {
  return { ...e, entry_date: toDateKey(e.entry_date) };
}

function PressScale({ onPress, children, disabled, style, fill }: { onPress?: () => void; children: React.ReactNode; disabled?: boolean; style?: any; fill?: boolean }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        { display: 'flex' } as any,
        fill ? { flex: 1, minWidth: 0, alignSelf: 'stretch' } : null,
        style,
        disabled && { opacity: 0.4 },
        Platform.OS === 'web' ? { cursor: disabled ? 'default' : 'pointer' } as any : null,
      ]}
      onPressIn={() => { if (!disabled) scale.value = withSpring(0.97, { damping: 18, stiffness: 360 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 16, stiffness: 240 }); }}
    >
      <Animated.View style={[aStyle, fill ? { width: '100%', flex: 1 } : null]}>{children}</Animated.View>
    </Pressable>
  );
}

function ClaySheen({ isDark, radius }: { isDark: boolean; radius?: number }) {
  return (
    <LinearGradient
      colors={isDark ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.78)', 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.55, y: 0.95 }}
      style={[StyleSheet.absoluteFill, radius ? { borderRadius: radius } : null]}
      pointerEvents="none"
    />
  );
}

function teacherFirstName(name?: string | null) {
  const clean = String(name || '').trim();
  if (!clean) return 'Teacher';
  const parts = clean.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

function relativeDayLabel(ymd: string) {
  const today = toYmd(new Date());
  const yesterday = toYmd(new Date(Date.now() - 86400000));
  if (ymd === today) return 'Today';
  if (ymd === yesterday) return 'Yesterday';
  return ymd;
}

export default function StaffDiary() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ academicPlanItemId?: string }>();
  const [linkedPlanItemId, setLinkedPlanItemId] = useState<string | null>(null);
  const { t } = useTranslation();
  const TE = t('staffDiary', { returnObjects: true }) as any;
  const { theme, isDark } = useTheme();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 900;
  const styles = useMemo(() => getStyles(theme, isDark, isWide), [theme, isDark, isWide]);
  const teacherId = user?.userId || '';
  const openedAtRef = useRef(Date.now());

  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);
  const [current, setCurrent] = useState<SmartCurrentClass | null>(null);
  const [recent, setRecent] = useState<SmartRecentEntry[]>([]);
  const [templates, setTemplates] = useState<DiaryTemplate[]>([...SYSTEM_TEMPLATES] as DiaryTemplate[]);
  const [myTemplates, setMyTemplates] = useState<DiaryTemplate[]>([]);
  const [schoolTemplates, setSchoolTemplates] = useState<DiaryTemplate[]>([]);
  const [favourites, setFavourites] = useState<DiaryTemplate[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const todayAnchor = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => toYmd(todayAnchor), [todayAnchor]);
  const priorDates = useMemo(() => priorHistoryYmds(todayAnchor, DIARY_PHOTO_HISTORY_PRIOR_DAYS), [todayAnchor]);
  const [activeTab, setActiveTab] = useState<DiaryHistoryTabId>('today');
  const [historyDate, setHistoryDate] = useState(() => todayYmd);
  const [pickerVisible, setPickerVisible] = useState(false);

  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [photoMode, setPhotoMode] = useState<'idle' | 'review'>('idle');
  const [photoConfirmOpen, setPhotoConfirmOpen] = useState(false);
  const [photoNote, setPhotoNote] = useState('');
  const [extraction, setExtraction] = useState<DiaryExtraction | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording' | 'review'>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [voiceText, setVoiceText] = useState('');

  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [manualDue, setManualDue] = useState(todayYmd);

  useEffect(() => {
    const planItemId = Array.isArray(params.academicPlanItemId) ? params.academicPlanItemId[0] : params.academicPlanItemId;
    if (!planItemId) return;
    setLinkedPlanItemId(planItemId);
    AcademicPlannerService.getDiaryTopic(planItemId)
      .then((details: any) => {
        if (details?.topic_title) {
          setManualTitle(`${details.chapter_title} — ${details.topic_title}`);
          setManualOpen(true);
        }
      })
      .catch(() => {});
  }, [params.academicPlanItemId]);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [sendToOpen, setSendToOpen] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [reuseSource, setReuseSource] = useState<SmartRecentEntry | DiaryEntry | null>(null);
  const [templatePrompt, setTemplatePrompt] = useState<DiaryTemplate | null>(null);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [moreTemplates, setMoreTemplates] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState<SmartRecentEntry | DiaryEntry | null>(null);
  const [classTeacherSections, setClassTeacherSections] = useState<ClassTeacherSection[]>([]);
  const [classDiaryClass, setClassDiaryClass] = useState<ClassTeacherSection | null>(null);
  const [classDiaryPickerOpen, setClassDiaryPickerOpen] = useState(false);
  const [classDiaryReviewOpen, setClassDiaryReviewOpen] = useState(false);
  const [classDiaryFailedOpen, setClassDiaryFailedOpen] = useState(false);
  const [classDiaryEntries, setClassDiaryEntries] = useState<ClassDiaryEntry[]>([]);
  const [classDiaryImage, setClassDiaryImage] = useState<string | null>(null);
  const [classDiaryLocalUri, setClassDiaryLocalUri] = useState<string | null>(null);
  const [classDiarySubmissionId, setClassDiarySubmissionId] = useState<string | null>(null);
  const [classDiarySubjects, setClassDiarySubjects] = useState<{ id: string; name: string }[]>([]);
  const [classDiaryMessage, setClassDiaryMessage] = useState<string | null>(null);
  const [pendingClassReady, setPendingClassReady] = useState(false);
  const [editClassIndex, setEditClassIndex] = useState<number | null>(null);

  const datesWithData = useMemo(() => [...new Set(diaryEntries.map((e) => e.entry_date))], [diaryEntries]);
  const calendarAvailableYmds = useMemo(() => [...new Set([...datesWithData, ...priorDates])], [datesWithData, priorDates]);
  const ss = getSubjectStyle(current?.subject_name);
  const greeting = `${greetingForHour()}, ${teacherFirstName(user?.displayName)}`;
  const canWrite = !isViewingAsAdmin;
  const clockLabel = current?.display_time || formatClock(new Date().getHours() * 60 + new Date().getMinutes());
  const periodLabel = current?.period_number ? `Period ${current.period_number}` : 'Not in a period';

  const cacheContext = useCallback(async (data: { current: SmartCurrentClass | null; recent: SmartRecentEntry[] }) => {
    if (!teacherId) return;
    persistentQueryCache.write(teacherId, 'smart_diary_context', data, Date.now());
  }, [teacherId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teacherId) return;
      const cached = await persistentQueryCache.read<{ current: SmartCurrentClass | null; recent: SmartRecentEntry[] }>(teacherId, 'smart_diary_context');
      if (cached?.data && alive) {
        setCurrent(cached.data.current);
        setRecent(cached.data.recent || []);
        setLoading(false);
      }
      const pending = await readPendingClassDiary(teacherId);
      if (alive && pending?.entries) setPendingClassReady(true);
    })();
    return () => { alive = false; };
  }, [teacherId]);

  useEffect(() => {
    if (!teacherId) return;
    return startDiaryQueueListener(teacherId);
  }, [teacherId]);

  const loadLive = useCallback(async () => {
    try {
      const [context, assignmentData, history, templateData] = await Promise.all([
        SmartDiaryService.getContext().catch(() => null),
        TeacherService.getMyClasses().catch(() => []),
        DiaryService.getAll({ from_date: priorDates[priorDates.length - 1], to_date: todayYmd }).catch(() => []),
        SmartDiaryService.getTemplates().catch(() => null),
      ]);
      const unique = Array.isArray(assignmentData) ? assignmentData : [];
      setAssignments(unique);
      if (context?.current) setCurrent(context.current);
      else if (!current && unique[0]) {
        setCurrent({
          class_section_id: unique[0].class_section_id,
          class_name: unique[0].class_name,
          section_name: unique[0].section_name,
          subject_id: unique[0].subject_id,
          subject_name: unique[0].subject_name,
          display_class: classLabel(unique[0]),
          display_time: formatClock(new Date().getHours() * 60 + new Date().getMinutes()),
          source: 'manual',
        });
      }
      if (context?.recent) setRecent(context.recent);
      if (context?.suggestion) {
        setSuggestion(context.suggestion.label);
        setSuggestionId(context.suggestion.diary_id);
      }
      if (context?.class_teacher_sections) {
        setClassTeacherSections(context.class_teacher_sections);
        if (!classDiaryClass && context.class_teacher_sections[0]) {
          setClassDiaryClass(context.class_teacher_sections[0]);
        }
      }
      setDiaryEntries(Array.isArray(history) ? history.map(normalizeDiaryEntry) : []);
      if (templateData) {
        setTemplates(mergeTemplateCatalog(SYSTEM_TEMPLATES as unknown as DiaryTemplate[], templateData));
        setMyTemplates(templateData.mine || []);
        setSchoolTemplates(templateData.school || []);
        setFavourites(templateData.favourites || []);
      }
      void cacheContext({ current: context?.current || current, recent: context?.recent || [] });
    } catch {
      // Cached UI remains interactive.
    } finally {
      setLoading(false);
    }
  }, [cacheContext, current, priorDates, todayYmd]);

  useEffect(() => { void loadLive(); }, []);

  const toast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    Toast.show({ type, text1: message, visibilityTime: 2600 });
  };

  const requireClass = () => {
    if (current?.class_section_id) return true;
    alertCompat('Choose a class', 'Pick the class this diary is for.');
    setClassPickerOpen(true);
    return false;
  };

  const publishNow = async (input: {
    content: string;
    title?: string;
    extraction?: DiaryExtraction | null;
    attachments?: string[];
    localUris?: string[];
    entrySource: string;
    templateId?: string;
    sourceDiaryId?: string;
    classSectionIds?: string[];
    typing?: boolean;
    extractAsync?: boolean;
    due?: string | null;
  }) => {
    if (!canWrite) {
      alertCompat('Notice', TE.noticeReadOnly);
      return;
    }
    if (!requireClass()) return;
    const classSectionIds = input.classSectionIds?.length ? input.classSectionIds : [current!.class_section_id];
    const submissionIds = classSectionIds.map(() => newDiaryId());
    const payload = {
      class_section_id: classSectionIds[0],
      class_section_ids: classSectionIds,
      subject_id: current?.subject_id,
      subject_name: current?.subject_name,
      class_name: current?.class_name,
      section_name: current?.section_name,
      entry_date: todayYmd,
      title: input.title || `${current?.subject_name || 'Diary'} Homework`,
      content: input.content,
      homework_due_date: input.due || input.extraction?.dueDate || null,
      attachments: input.attachments || [],
      extraction: input.extraction || undefined,
      entry_source: input.entrySource,
      template_id: input.templateId,
      source_diary_id: input.sourceDiaryId,
      submission_id: submissionIds[0],
      submission_ids: submissionIds,
      typing_required: Boolean(input.typing),
      extract_async: Boolean(input.extractAsync),
      time_to_publish_ms: Date.now() - openedAtRef.current,
      input_language: 'auto',
      academic_plan_item_id: linkedPlanItemId || undefined,
    };
    setBusy(true);
    try {
      await enqueueDiary(teacherId, payload, input.localUris || []);
      const netResult = await flushDiaryQueue(teacherId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (netResult.flushed > 0) toast(classSectionIds.length > 1 ? 'Diary posted to selected classes. Parent alerts: 5:30 PM IST.' : 'Diary posted. Parent alerts: 5:30 PM IST.');
      else toast('Saved. Will sync automatically.', 'info');
      resetFlows();
      void loadLive();
    } catch {
      toast('Saved. Will sync automatically.', 'info');
      resetFlows();
    } finally {
      setBusy(false);
    }
  };

  const resetFlows = () => {
    setPhotoUris([]);
    setPhotoMode('idle');
    setPhotoConfirmOpen(false);
    setPhotoNote('');
    setExtraction(null);
    setPreviewContent('');
    setOcrMessage(null);
    setVoiceMode('idle');
    setVoiceText('');
    setManualOpen(false);
    setSendToOpen(false);
    setReuseSource(null);
    setTemplatePrompt(null);
    setSaveTemplateOpen(false);
    setCopyFromOpen(false);
    setViewEntry(null);
  };

  const pickDiaryImages = async (fromLibrary = false): Promise<string[]> => {
    if (fromLibrary || Platform.OS === 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alertCompat('Photos', 'Please allow photo library access to attach a diary page.');
        return [];
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.92,
        allowsMultipleSelection: true,
        selectionLimit: 4,
      });
      if (result.canceled || !result.assets?.length) return [];
      return result.assets.map((asset) => asset.uri);
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alertCompat('Camera', 'Please allow camera access to capture the board or notebook.');
      return [];
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.92 });
    if (result.canceled || !result.assets?.[0]) return [];
    return [result.assets[0].uri];
  };

  const capturePhoto = async (fromLibrary = false) => {
    if (!canWrite || !requireClass()) return;
    try {
      const uris = await pickDiaryImages(fromLibrary);
      if (!uris.length) return;
      setPhotoUris(uris);
      setPhotoNote('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPhotoConfirmOpen(true);
    } catch {
      toast('Could not open the camera. You can still type the diary.', 'error');
    }
  };

  const sendConfirmedPhoto = async () => {
    if (!photoUris.length || busy) return;
    const note = photoNote.trim();
    await publishNow({
      content: note || composeDiaryContent({}, { hasPhoto: true }),
      title: note ? `${current?.subject_name || 'Diary'} photo` : undefined,
      localUris: photoUris,
      entrySource: 'PHOTO',
      extractAsync: false,
    });
  };

  const closePhotoConfirm = () => {
    if (busy) return;
    if (photoMode === 'review') {
      setPhotoConfirmOpen(false);
      return;
    }
    resetFlows();
  };

  const confirmSendOriginalClassDiary = () => {
    alertCompat(
      'Send original photo?',
      'Parents will see this photo. We keep diary photos for 1 month, then delete them.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send photo', onPress: () => void publishClassDiaryNow(true) },
      ],
    );
  };

  const sendExtractedHomework = async () => {
    const content = previewContent || composeDiaryContent(extraction || {}, {});
    if (!String(content || '').trim()) {
      alertCompat('No homework text', 'Edit the extracted text, or send the original photo instead.');
      return;
    }
    await publishNow({
      content,
      title: extraction?.title || `${current?.subject_name || 'Diary'} Homework`,
      extraction,
      attachments: [],
      localUris: [],
      entrySource: 'MANUAL',
      extractAsync: false,
    });
  };

  const extractPhoto = async (uris = photoUris) => {
    if (!uris.length) return;
    setBusy(true);
    try {
      const result = await SmartDiaryService.extractPhotos(uris, {
        class_name: current?.class_name,
        section_name: current?.section_name,
        subject_name: current?.subject_name,
        class_section_id: current?.class_section_id,
        subject_id: current?.subject_id,
        entry_date: todayYmd,
      });
      setExtraction(result.extraction);
      setPreviewContent(result.preview?.content || composeDiaryContent(result.extraction, {}));
      setOcrMessage(result.message || null);
      setPhotoMode('review');
    } catch {
      setOcrMessage('Text extraction is temporarily unavailable. Send the original photo, or type the homework.');
      setPhotoMode('review');
      setPreviewContent('');
    } finally {
      setBusy(false);
    }
  };

  const captureOcr = async (fromLibrary = false) => {
    if (!canWrite || !requireClass()) return;
    try {
      const uris = await pickDiaryImages(fromLibrary);
      if (!uris.length) return;
      setPhotoUris(uris);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await extractPhoto(uris);
    } catch {
      toast('Could not open the camera. You can still type the diary.', 'error');
    }
  };

  const startVoice = async () => {
    if (!canWrite || !requireClass()) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        alertCompat('Microphone', 'Please allow the microphone to speak the diary.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setVoiceMode('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      toast('Voice capture is unavailable on this device. You can type instead.', 'error');
    }
  };

  const stopVoice = async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) { setVoiceMode('idle'); return; }
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) { setVoiceMode('idle'); return; }
      setBusy(true);
      const result = await SmartDiaryService.transcribe(uri, {
        class_name: current?.class_name,
        section_name: current?.section_name,
        subject_name: current?.subject_name,
      });
      setExtraction(result.extraction);
      setVoiceText(result.transcription || result.preview?.content || '');
      setPreviewContent(result.preview?.content || composeDiaryContent(result.extraction));
      setOcrMessage(result.message || null);
      setVoiceMode('review');
    } catch {
      toast("We couldn't catch every word. You can speak again or type.", 'error');
      setVoiceMode('idle');
    } finally {
      setBusy(false);
    }
  };

  const applyTemplate = async (template: DiaryTemplate) => {
    if (!canWrite || !requireClass()) return;
    const variables = template.variables || [];
    if (variables.length > 0) {
      const defaults: Record<string, string> = {};
      variables.forEach((item) => {
        defaults[item.key] = item.default || (item.key === 'subject' ? (current?.subject_name || '') : '');
      });
      setTemplateValues(defaults);
      setTemplatePrompt(template);
      return;
    }
    const content = renderTemplateContent(template.content, { subject: current?.subject_name || '' });
    await publishNow({ content, entrySource: 'TEMPLATE', templateId: isDiaryUuid(template.id) ? template.id : undefined });
  };

  const sendTemplatePrompt = async () => {
    if (!templatePrompt) return;
    const content = renderTemplateContent(templatePrompt.content, templateValues);
    await publishNow({
      content,
      entrySource: 'TEMPLATE',
      templateId: isDiaryUuid(templatePrompt.id) ? templatePrompt.id : undefined,
    });
  };

  const reuseEntry = async (entry: SmartRecentEntry | DiaryEntry, mode: 'reuse' | 'edit' | 'send') => {
    const content = 'content' in entry ? String(entry.content || '') : '';
    setReuseSource(entry);
    if (mode === 'edit') {
      setManualTitle(entry.title || '');
      setManualContent(content);
      setManualOpen(true);
      return;
    }
    if (mode === 'send') {
      setSelectedTargets([]);
      setSendToOpen(true);
      return;
    }
    await publishNow({
      content,
      title: entry.title,
      entrySource: 'REUSED',
      sourceDiaryId: entry.id,
      attachments: 'attachments' in entry ? (entry.attachments as string[] | undefined) : undefined,
    });
  };

  const sendToClasses = async () => {
    if (!reuseSource || selectedTargets.length === 0) return;
    const content = 'content' in reuseSource ? String(reuseSource.content || '') : '';
    await publishNow({
      content,
      title: reuseSource.title,
      entrySource: 'COPIED',
      sourceDiaryId: reuseSource.id,
      classSectionIds: selectedTargets,
    });
  };

  const saveManual = async () => {
    if (!manualContent.trim()) {
      alertCompat('Add details', 'Write the homework or attach a photo instead.');
      return;
    }
    await publishNow({
      title: manualTitle.trim(),
      content: manualContent.trim(),
      due: manualDue,
      entrySource: reuseSource ? 'COPIED' : 'MANUAL',
      sourceDiaryId: reuseSource?.id,
      typing: !reuseSource,
    });
  };

  const saveCustomTemplate = async () => {
    if (!saveTemplateName.trim() || !manualContent.trim()) return;
    try {
      await SmartDiaryService.createTemplate({ name: saveTemplateName.trim(), content: manualContent.trim(), scope: 'TEACHER' });
      toast('Saved as a quick template.');
      setSaveTemplateOpen(false);
      void loadLive();
    } catch {
      toast('Could not save the template right now.', 'error');
    }
  };

  const handleDelete = (entry: DiaryEntry) => {
    alertCompat(TE.confirmDeleteTitle, TE.confirmDeleteMessage, [
      { text: TE.cancelEdit, style: 'cancel' },
      {
        text: TE.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await DiaryService.delete(entry.id);
            toast(TE.successDelete);
            void loadLive();
          } catch (error: any) {
            alertCompat('Error', error.message || TE.errDelete);
          }
        },
      },
    ]);
  };

  const openClassDiary = () => {
    if (!canWrite) return;
    if (classTeacherSections.length === 0) return;
    if (classTeacherSections.length === 1) {
      setClassDiaryClass(classTeacherSections[0]);
      void captureClassDiary(classTeacherSections[0]);
      return;
    }
    setClassDiaryPickerOpen(true);
  };

  const captureClassDiary = async (section: ClassTeacherSection, fromLibrary = false) => {
    if (!canWrite) return;
    try {
      const perm = fromLibrary || Platform.OS === 'web'
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        alertCompat('Photos', 'Please allow camera or gallery access to upload the class diary.');
        return;
      }
      const result = fromLibrary || Platform.OS === 'web'
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.92 })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.92 });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      alertCompat(
        'Upload this class diary?',
        'Parents can receive this photo. We keep diary photos for 1 month, then delete them.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => void processClassDiaryCapture(section, uri) },
        ],
      );
    } catch {
      toast('Could not open the camera. You can still type the diary.', 'error');
    }
  };

  const processClassDiaryCapture = async (section: ClassTeacherSection, uri: string) => {
    const submissionId = newDiaryId();
    setClassDiaryClass(section);
    setClassDiaryLocalUri(uri);
    setClassDiaryImage(uri);
    setClassDiarySubmissionId(submissionId);
    setClassDiaryEntries([]);
    setBusy(true);
    try {
      const extracted = await SmartDiaryService.extractClassDiary(uri, {
        class_section_id: section.class_section_id,
        entry_date: todayYmd,
        submission_id: submissionId,
      });
      setClassDiaryImage(extracted.image_url || uri);
      setClassDiaryEntries(extracted.entries || []);
      setClassDiarySubjects(extracted.subjects || []);
      setClassDiaryMessage(extracted.message || null);
      await writePendingClassDiary(teacherId, extracted);
      if ((extracted.entries || []).length) {
        setClassDiaryReviewOpen(true);
      } else {
        setClassDiaryFailedOpen(true);
      }
    } catch {
      await enqueueDiary(teacherId, {
        kind: 'class_diary',
        class_section_id: section.class_section_id,
        class_name: section.class_name,
        section_name: section.section_name,
        entry_date: todayYmd,
        submission_id: submissionId,
      }, [uri]);
      toast('Saved — waiting to sync.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const openPendingClassDiary = async () => {
    const pending = await readPendingClassDiary(teacherId);
    if (!pending) return;
    setClassDiaryClass({
      class_section_id: pending.class_section_id,
      class_name: pending.class_name,
      section_name: pending.section_name,
    });
    setClassDiaryImage(pending.image_url || null);
    setClassDiaryEntries(pending.entries || []);
    setClassDiarySubjects(pending.subjects || []);
    setClassDiarySubmissionId(pending.submission_id || null);
    setClassDiaryMessage(pending.message || null);
    setPendingClassReady(false);
    if ((pending.entries || []).length) setClassDiaryReviewOpen(true);
    else setClassDiaryFailedOpen(true);
  };

  const publishClassDiaryNow = async (sendOriginal = false) => {
    if (!classDiaryClass || !classDiarySubmissionId) return;
    const selected = classDiaryEntries.filter((item) => item.selected !== false && !item.unknown);
    if (!sendOriginal && selected.length === 0) {
      alertCompat('Select subjects', 'Tick the subjects to publish, or send the original photo.');
      return;
    }
    setBusy(true);
    try {
      await SmartDiaryService.publishClassDiary({
        class_section_id: classDiaryClass.class_section_id,
        entry_date: todayYmd,
        submission_id: classDiarySubmissionId,
        image_url: classDiaryImage,
        entries: selected,
        send_original: sendOriginal,
      });
      await writePendingClassDiary(teacherId, null);
      setPendingClassReady(false);
      setClassDiaryReviewOpen(false);
      setClassDiaryFailedOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast(sendOriginal ? 'Class diary photo posted. Parent alerts: 5:30 PM IST.' : 'Class diary published. Parent alerts: 5:30 PM IST.');
      void loadLive();
    } catch {
      await enqueueDiary(teacherId, {
        kind: 'class_diary',
        class_section_id: classDiaryClass.class_section_id,
        entry_date: todayYmd,
        submission_id: classDiarySubmissionId,
        image_url: classDiaryImage,
        entries: selected,
        send_original: sendOriginal,
      }, classDiaryLocalUri ? [classDiaryLocalUri] : []);
      toast('Saved — waiting to sync.', 'info');
      setClassDiaryReviewOpen(false);
      setClassDiaryFailedOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const pageBg = isDark ? Surfaces.dark.base : '#E9EDF6';
  const quickTemplates = templates.filter((item) => QUICK_TEMPLATE_IDS.includes(item.id as any) || QUICK_TEMPLATE_IDS.some((id) => item.name === SYSTEM_TEMPLATES.find((sys) => sys.id === id)?.name)).slice(0, 7);

  if (loading && !current && assignments.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: pageBg }]}>
        <LogoLoader size={60} color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />
      <StaffHeader title="Smart Diary" showBackButton />
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(40).duration(280)} style={styles.tabWrap}>
          <DiaryHistoryTabSwitcher
            active={activeTab}
            onChange={(tab) => { setActiveTab(tab); Haptics.selectionAsync(); }}
            todayLabel={TE.today}
            historyLabel={TE.history}
          />
        </Animated.View>

        {activeTab === 'today' ? (
          <>
            <Animated.View entering={FadeInDown.delay(70).duration(280)}>
              <Text style={[styles.greeting, { color: theme.colors.textStrong }]}>{greeting}</Text>
              <Text style={[styles.greetingHint, { color: theme.colors.textTertiary }]}>Capture the work you already wrote. No retyping.</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(110).duration(280)} style={[styles.currentCard, clayCard(isDark, 'md')]}>
              <ClaySheen isDark={isDark} radius={Radii.xxl} />
              <View style={[styles.currentIcon, { backgroundColor: isDark ? ss.softDark : ss.soft }]}>
                <MaterialIcons name={ss.icon} size={22} color={ss.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.currentKicker}>Current class</Text>
                <Text style={[styles.currentTitle, { color: theme.colors.textStrong }]} numberOfLines={1}>
                  {current ? `${classLabel(current)} · ${current.subject_name || 'Subject'}` : 'Choose a class'}
                </Text>
                <Text style={[styles.currentMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {periodLabel} · {clockLabel}
                </Text>
              </View>
              <PressScale onPress={() => setClassPickerOpen(true)}>
                <View style={[styles.changeChip, { backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' }]}>
                  <Text style={[styles.changeText, { color: theme.colors.primary }]}>Change</Text>
                </View>
              </PressScale>
            </Animated.View>

            {suggestion && suggestionId ? (
              <PressScale onPress={() => {
                const found = recent.find((item) => item.id === suggestionId);
                if (found) void reuseEntry(found, 'reuse');
              }}>
                <View style={[styles.suggestRow, clayCard(isDark, 'sm')]}>
                  <ClaySheen isDark={isDark} radius={Radii.xl} />
                  <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
                  <Text style={[styles.suggestText, { color: theme.colors.textSecondary }]} numberOfLines={2}>{suggestion}</Text>
                  <Text style={[styles.changeText, { color: theme.colors.primary }]}>Use</Text>
                </View>
              </PressScale>
            ) : null}

            {pendingClassReady ? (
              <PressScale onPress={() => void openPendingClassDiary()}>
                <View style={[styles.suggestRow, clayCard(isDark, 'sm')]}>
                  <ClaySheen isDark={isDark} radius={Radii.xl} />
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                  <Text style={[styles.suggestText, { color: theme.colors.textSecondary }]}>Class diary ready. Review detected subjects.</Text>
                  <Text style={[styles.changeText, { color: theme.colors.primary }]}>Review</Text>
                </View>
              </PressScale>
            ) : null}

            <Animated.View entering={FadeInDown.delay(150).duration(280)} style={styles.actionBoard}>
              <View style={styles.photoWrap}>
                <PressScale fill onPress={() => void capturePhoto(false)} disabled={!canWrite || busy}>
                  <View style={[styles.photoCta, clay(isDark, 'lg')]}>
                    <LinearGradient colors={['#312E81', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                    <View style={styles.photoIconWrap}>
                      <Ionicons name="camera" size={32} color="#FFFFFF" />
                    </View>
                    <Text style={styles.photoCtaTitle}>Photo diary</Text>
                    <Text style={styles.photoCtaHint}>
                      {isWide ? 'Parent alert at 5:30 PM IST · kept 1 month' : 'Parent alert at 5:30 PM IST'}
                    </Text>
                    {isWide ? null : <Text style={styles.photoCtaKeep}>Kept for 1 month</Text>}
                  </View>
                </PressScale>
                <PressScale onPress={() => void capturePhoto(true)} disabled={!canWrite} style={styles.galleryFab}>
                  <View style={styles.galleryChip}>
                    <Ionicons name="images-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.galleryChipText}>Gallery</Text>
                  </View>
                </PressScale>
              </View>

              <View style={styles.secondaryCol}>
                <PressScale fill onPress={() => void (voiceMode === 'recording' ? stopVoice() : startVoice())} disabled={!canWrite || busy}>
                  <View style={[styles.secondaryCta, clayCard(isDark, 'md')]}>
                    <ClaySheen isDark={isDark} radius={Radii.xxl} />
                    <View style={[styles.secondaryIcon, { backgroundColor: voiceMode === 'recording' ? 'rgba(220,38,38,0.12)' : isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' }]}>
                      <Ionicons name={voiceMode === 'recording' ? 'stop-circle' : 'mic'} size={22} color={voiceMode === 'recording' ? '#DC2626' : theme.colors.primary} />
                    </View>
                    <Text style={[styles.secondaryTitle, { color: theme.colors.textStrong }]}>{voiceMode === 'recording' ? 'Stop' : 'Speak diary'}</Text>
                    <Text style={[styles.secondaryHint, { color: theme.colors.textTertiary }]}>{voiceMode === 'recording' ? 'Tap to finish' : 'Say it in 10 seconds'}</Text>
                  </View>
                </PressScale>
                <PressScale fill onPress={() => { setManualTitle(''); setManualContent(''); setManualOpen(true); }} disabled={!canWrite}>
                  <View style={[styles.secondaryCta, clayCard(isDark, 'md')]}>
                    <ClaySheen isDark={isDark} radius={Radii.xxl} />
                    <View style={[styles.secondaryIcon, { backgroundColor: isDark ? 'rgba(148,163,184,0.16)' : '#EEF2FF' }]}>
                      <Ionicons name="create-outline" size={20} color={theme.colors.textSecondary} />
                    </View>
                    <Text style={[styles.secondaryTitle, { color: theme.colors.textStrong }]}>Type / Edit</Text>
                    <Text style={[styles.secondaryHint, { color: theme.colors.textTertiary }]}>Write or tweak homework</Text>
                  </View>
                </PressScale>
              </View>
            </Animated.View>

            <View style={[styles.classDiaryCta, clayCard(isDark, 'md')]}>
              <ClaySheen isDark={isDark} radius={Radii.xxl} />
              <PressScale fill onPress={() => void captureOcr(false)} disabled={!canWrite || busy}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, minWidth: 0 }}>
                  <View style={[styles.secondaryIcon, { backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' }]}>
                    <Ionicons name="scan-outline" size={22} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.secondaryTitle, { color: theme.colors.textStrong, textAlign: 'left' }]}>Extract homework text</Text>
                    <Text style={[styles.currentMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      AI reads the page. Parents get the words, not the photo.
                    </Text>
                  </View>
                </View>
              </PressScale>
              <PressScale onPress={() => void captureOcr(true)} disabled={!canWrite || busy}>
                <View style={[styles.changeChip, { backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' }]}>
                  <Text style={[styles.changeText, { color: theme.colors.primary }]}>Gallery</Text>
                </View>
              </PressScale>
            </View>

            {classTeacherSections.length > 0 ? (
              <PressScale onPress={openClassDiary} disabled={!canWrite || busy}>
                <View style={[styles.classDiaryCta, clayCard(isDark, 'md')]}>
                  <ClaySheen isDark={isDark} radius={Radii.xxl} />
                  <View style={[styles.secondaryIcon, { backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' }]}>
                    <Ionicons name="library-outline" size={22} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.secondaryTitle, { color: theme.colors.textStrong, textAlign: 'left' }]}>Upload class diary</Text>
                    <Text style={[styles.currentMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {classTeacherSections.length === 1
                        ? `${classLabel(classTeacherSections[0])} · all subjects in one photo`
                        : 'Choose a homeroom class'}
                    </Text>
                  </View>
                </View>
              </PressScale>
            ) : null}

            <View style={[styles.panel, clayCard(isDark, 'sm')]}>
              <ClaySheen isDark={isDark} radius={Radii.xl} />
              <Text style={[styles.sectionTitle, { color: theme.colors.textStrong, marginBottom: Spacing.sm }]}>Quick templates</Text>
              <View style={styles.chipWrap}>
                {quickTemplates.map((item) => (
                  <PressScale key={item.id} onPress={() => void applyTemplate(item)}>
                    <View style={[styles.templateChip, { backgroundColor: isDark ? '#161E2E' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.22)' }]}>
                      <Text style={[styles.templateChipText, { color: theme.colors.textStrong }]}>{item.name}</Text>
                    </View>
                  </PressScale>
                ))}
                <PressScale onPress={() => setMoreTemplates(true)}>
                  <View style={[styles.templateChip, { backgroundColor: isDark ? 'rgba(79,70,229,0.16)' : '#EEF2FF', borderColor: 'transparent' }]}>
                    <Text style={[styles.templateChipText, { color: theme.colors.primary }]}>More</Text>
                  </View>
                </PressScale>
              </View>
              {favourites.length > 0 ? (
                <>
                  <Text style={[styles.sectionHint, { color: theme.colors.textTertiary }]}>My favourites</Text>
                  <View style={[styles.chipWrap, { marginBottom: 0 }]}>
                    {favourites.slice(0, 6).map((item) => (
                      <PressScale key={`fav-${item.id}`} onPress={() => void applyTemplate(item)}>
                        <View style={[styles.templateChip, { backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB', borderColor: isDark ? 'rgba(245,158,11,0.25)' : '#FDE68A' }]}>
                          <Text style={[styles.templateChipText, { color: isDark ? '#FBBF24' : '#92400E' }]}>★ {item.name}</Text>
                        </View>
                      </PressScale>
                    ))}
                  </View>
                </>
              ) : null}
            </View>

            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textStrong, marginTop: 0, marginBottom: 0 }]}>Recent</Text>
              <PressScale onPress={() => setCopyFromOpen(true)}>
                <View style={[styles.changeChip, { backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' }]}>
                  <Text style={[styles.changeText, { color: theme.colors.primary }]}>Copy from</Text>
                </View>
              </PressScale>
            </View>
            {recent.length === 0 ? (
              <View style={[styles.emptyRecent, clayCard(isDark, 'sm')]}>
                <ClaySheen isDark={isDark} radius={Radii.xl} />
                <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(79,70,229,0.16)' : '#EEF2FF' }]}>
                  <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.colors.textStrong }]}>Nothing here yet</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
                  After you send a diary, it will show here for one-tap reuse.
                </Text>
              </View>
            ) : recent.slice(0, 6).map((item) => {
              const photos = normalizeDiaryAttachments(item.attachments);
              const photoOnly = photos.length > 0 && isPhotoFallbackContent(item.content);
              return (
              <View key={item.id} style={[styles.recentCard, clayCard(isDark, 'sm')]}>
                <ClaySheen isDark={isDark} radius={Radii.xl} />
                <Text style={[styles.recentMeta, { color: theme.colors.textTertiary }]}>
                  {relativeDayLabel(toDateKey(item.entry_date))} · {item.class_name}{item.section_name} {item.subject_name}
                </Text>
                {photos[0] ? <Image source={{ uri: photos[0] }} style={styles.recentPhoto} /> : null}
                {photoOnly ? null : (
                  <Text style={[styles.recentBody, { color: theme.colors.textStrong }]} numberOfLines={2}>
                    {composeHomeworkLine({ homework: item.content }) || item.content || item.title}
                  </Text>
                )}
                <View style={styles.recentActions}>
                  <PressScale onPress={() => void reuseEntry(item, 'reuse')}>
                    <View style={[styles.actionPill, { backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' }]}>
                      <Text style={[styles.actionPillText, { color: theme.colors.primary }]}>Reuse</Text>
                    </View>
                  </PressScale>
                  <PressScale onPress={() => void reuseEntry(item, 'send')}>
                    <View style={[styles.actionPill, { backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : '#F1F5F9' }]}>
                      <Text style={[styles.actionPillText, { color: theme.colors.textSecondary }]}>Send to class</Text>
                    </View>
                  </PressScale>
                  <PressScale onPress={() => void reuseEntry(item, 'edit')}>
                    <View style={[styles.actionPill, { backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : '#F1F5F9' }]}>
                      <Text style={[styles.actionPillText, { color: theme.colors.textSecondary }]}>Edit</Text>
                    </View>
                  </PressScale>
                  <PressScale onPress={() => setViewEntry(item)}>
                    <View style={[styles.actionPill, { backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : '#F1F5F9' }]}>
                      <Text style={[styles.actionPillText, { color: theme.colors.textSecondary }]}>View</Text>
                    </View>
                  </PressScale>
                </View>
              </View>
              );
            })}
          </>
        ) : (
          <>
            <DiaryHistoryDateSelectorButton selectedYmd={historyDate} onPress={() => setPickerVisible(true)} onSelect={setHistoryDate} />
            <HomeworkDayList
              theme={theme}
              isDark={isDark}
              styles={styles}
              diaryEntries={diaryEntries}
              displayYmd={historyDate}
              onEdit={(entry) => {
                setCurrent({
                  class_section_id: entry.class_section_id,
                  class_name: entry.class_name,
                  section_name: entry.section_name,
                  subject_id: entry.subject_id,
                  subject_name: entry.subject_name,
                  display_class: `${entry.class_name || ''}${entry.section_name || ''}`,
                });
                setManualTitle(diaryDisplayTitle(entry));
                setManualContent(diaryDisplayContent(entry));
                setManualOpen(true);
                setActiveTab('today');
              }}
              onDelete={handleDelete}
              labels={TE}
            />
          </>
        )}
      </ScrollView>

      <DiaryHistoryDatePickerSheet visible={pickerVisible} selectedYmd={historyDate} availableYmds={calendarAvailableYmds} onSelect={setHistoryDate} onClose={() => setPickerVisible(false)} subtitle={TE.calendarHint} />

      <Sheet visible={photoConfirmOpen} onClose={closePhotoConfirm} isDark={isDark} closeDisabled={busy}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>Send this photo?</Text>
        {photoUris.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.confirmThumbs}>
            {photoUris.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.confirmThumb} />
            ))}
          </ScrollView>
        ) : photoUris[0] ? (
          <Image source={{ uri: photoUris[0] }} style={styles.previewImage} />
        ) : null}
        <View style={[styles.retentionNote, clayCard(isDark, 'sm')]}>
          <ClaySheen isDark={isDark} radius={Radii.xl} />
          <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
          <Text style={[styles.retentionText, { color: theme.colors.textSecondary }]}>
            Parents can view the photo after upload. Diary alerts go out daily at 5:30 PM IST. Photos are kept for 1 month.
          </Text>
        </View>
        <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>Optional note</Text>
        <AppTextInput
          value={photoNote}
          onChangeText={setPhotoNote}
          placeholder="Add a short note for parents"
          editable={!busy}
        />
        <View style={styles.sheetActions}>
          <PressScale onPress={closePhotoConfirm} disabled={busy}>
            <View style={styles.ghostBtn}>
              <Text style={[styles.ghostBtnText, { color: theme.colors.primary }]}>Cancel</Text>
            </View>
          </PressScale>
          <PressScale onPress={() => void sendConfirmedPhoto()} disabled={busy || !photoUris.length}>
            <View style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{busy ? 'Uploading…' : 'Send photo'}</Text>
            </View>
          </PressScale>
        </View>
      </Sheet>

      <Sheet visible={photoMode === 'review' && !photoConfirmOpen} onClose={resetFlows} isDark={isDark} closeDisabled={busy}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>
          Extracted homework · {classLabel(current)} {current?.subject_name ? `· ${current.subject_name}` : ''}
        </Text>
        {photoUris[0] ? <Image source={{ uri: photoUris[0] }} style={styles.previewImage} /> : null}
        <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>Homework text</Text>
        <AppTextInput
          value={previewContent}
          onChangeText={setPreviewContent}
          placeholder="Edit the extracted homework"
          multiline
          style={{ minHeight: 90, textAlignVertical: 'top', marginBottom: 8 }}
        />
        {extraction?.dueDate ? (
          <>
            <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>Due date</Text>
            <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>
              {extraction.dueDate}{uncertainFields(extraction).includes('dueDate') ? '  · Check' : ''}
            </Text>
          </>
        ) : null}
        {ocrMessage ? <Text style={[styles.warnText, { color: theme.colors.textSecondary }]}>{ocrMessage}</Text> : null}
        <View style={styles.sheetActions}>
          <PressScale onPress={() => setPhotoConfirmOpen(true)} disabled={busy}>
            <View style={styles.ghostBtn}>
              <Text style={[styles.ghostBtnText, { color: theme.colors.primary }]}>Send original photo instead</Text>
            </View>
          </PressScale>
          <PressScale onPress={() => void sendExtractedHomework()}>
            <View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>{busy ? 'Sending…' : 'Send homework text'}</Text></View>
          </PressScale>
        </View>
      </Sheet>

      <Sheet visible={voiceMode === 'review'} onClose={resetFlows} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>I understood</Text>
        <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{previewContent || voiceText || 'No speech captured yet.'}</Text>
        {ocrMessage ? <Text style={[styles.warnText, { color: theme.colors.textSecondary }]}>{ocrMessage}</Text> : null}
        <View style={styles.sheetActions}>
          <PressScale onPress={() => void startVoice()}><View style={styles.ghostBtn}><Text style={[styles.ghostBtnText, { color: theme.colors.primary }]}>Speak Again</Text></View></PressScale>
          <PressScale onPress={() => { setManualContent(previewContent); setManualOpen(true); }}><View style={styles.ghostBtn}><Text style={[styles.ghostBtnText, { color: theme.colors.primary }]}>Edit</Text></View></PressScale>
          <PressScale onPress={() => void publishNow({ content: previewContent || voiceText, extraction, entrySource: 'VOICE' })}>
            <View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Send</Text></View>
          </PressScale>
        </View>
      </Sheet>

      <Sheet visible={manualOpen} onClose={() => setManualOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>Type / Edit</Text>
        <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>Title</Text>
        <AppTextInput value={manualTitle} onChangeText={setManualTitle} placeholder="Optional title" />
        <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary, marginTop: 10 }]}>Homework / classwork</Text>
        <AppTextInput value={manualContent} onChangeText={setManualContent} placeholder="What should students complete?" multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
        <AppDatePicker label="Due date" value={manualDue} onChange={setManualDue} isDark={isDark} />
        <PressScale onPress={() => setSaveTemplateOpen(true)}><Text style={[styles.galleryLink, { color: theme.colors.primary }]}>Save as template</Text></PressScale>
        <PressScale onPress={() => void saveManual()}><View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>{busy ? 'Sending…' : 'Send'}</Text></View></PressScale>
      </Sheet>

      <Sheet visible={!!templatePrompt} onClose={() => setTemplatePrompt(null)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>{templatePrompt?.name}</Text>
        {(templatePrompt?.variables || []).map((field) => (
          <View key={field.key}>
            <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>{field.label}</Text>
            <AppTextInput value={templateValues[field.key] || ''} onChangeText={(text) => setTemplateValues((prev) => ({ ...prev, [field.key]: text }))} />
          </View>
        ))}
        <Text style={[styles.reviewBody, { color: theme.colors.textSecondary, marginBottom: 12 }]}>{renderTemplateContent(templatePrompt?.content || '', templateValues)}</Text>
        <PressScale onPress={() => void sendTemplatePrompt()}><View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Send</Text></View></PressScale>
      </Sheet>

      <Sheet visible={classPickerOpen} onClose={() => setClassPickerOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>Change class</Text>
        {assignments.map((item) => (
          <PressScale key={item.assignment_id} onPress={() => {
            setCurrent({
              class_section_id: item.class_section_id,
              class_name: item.class_name,
              section_name: item.section_name,
              subject_id: item.subject_id,
              subject_name: item.subject_name,
              display_class: classLabel(item),
              source: 'manual',
            });
            setClassPickerOpen(false);
          }}>
            <View style={styles.pickerRow}>
              <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{item.class_name}{item.section_name} • {item.subject_name}</Text>
            </View>
          </PressScale>
        ))}
      </Sheet>

      <Sheet visible={sendToOpen} onClose={() => setSendToOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>Send to</Text>
        {assignments.filter((item) => item.subject_id === (reuseSource as any)?.subject_id || !('subject_id' in (reuseSource || {}))).map((item) => {
          const selected = selectedTargets.includes(item.class_section_id);
          return (
            <PressScale key={`send-${item.assignment_id}`} onPress={() => {
              setSelectedTargets((prev) => selected ? prev.filter((id) => id !== item.class_section_id) : [...prev, item.class_section_id]);
            }}>
              <View style={[styles.pickerRow, selected && { backgroundColor: isDark ? 'rgba(79,70,229,0.16)' : '#EEF2FF' }]}>
                <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{item.class_name}{item.section_name} • {item.subject_name}</Text>
              </View>
            </PressScale>
          );
        })}
        <PressScale onPress={() => void sendToClasses()}><View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Send</Text></View></PressScale>
      </Sheet>

      <Sheet visible={moreTemplates} onClose={() => setMoreTemplates(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>All templates</Text>
        {myTemplates.length > 0 ? <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>My Templates</Text> : null}
        {myTemplates.map((item) => (
          <PressScale key={`mine-${item.id}`} onPress={() => { setMoreTemplates(false); void applyTemplate(item); }}>
            <View style={styles.pickerRow}><Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{item.name}</Text></View>
          </PressScale>
        ))}
        {schoolTemplates.length > 0 ? <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary, marginTop: 8 }]}>School Templates</Text> : null}
        {schoolTemplates.map((item) => (
          <PressScale key={`school-${item.id}`} onPress={() => { setMoreTemplates(false); void applyTemplate(item); }}>
            <View style={styles.pickerRow}><Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{item.name}</Text></View>
          </PressScale>
        ))}
        <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary, marginTop: 8 }]}>System Templates</Text>
        {templates.filter((item) => !myTemplates.some((mine) => mine.id === item.id) && !schoolTemplates.some((school) => school.id === item.id)).map((item) => (
          <PressScale key={`more-${item.id}`} onPress={() => { setMoreTemplates(false); void applyTemplate(item); }}>
            <View style={styles.pickerRow}><Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{item.name}</Text></View>
          </PressScale>
        ))}
      </Sheet>

      <Sheet visible={copyFromOpen} onClose={() => setCopyFromOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>Copy from</Text>
        <Text style={[styles.warnText, { color: theme.colors.textSecondary }]}>Choose a diary to copy into {classLabel(current)}.</Text>
        {recent.map((item) => (
          <PressScale key={`copy-${item.id}`} onPress={() => {
            setReuseSource(item);
            setManualTitle(item.title || '');
            setManualContent(item.content || '');
            setCopyFromOpen(false);
            setManualOpen(true);
          }}>
            <View style={styles.pickerRow}>
              <Text style={[styles.recentMeta, { color: theme.colors.textTertiary }]}>{relativeDayLabel(toDateKey(item.entry_date))} • {item.class_name}{item.section_name} {item.subject_name}</Text>
              <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]} numberOfLines={2}>{item.content || item.title}</Text>
            </View>
          </PressScale>
        ))}
      </Sheet>

      <Sheet visible={!!viewEntry} onClose={() => setViewEntry(null)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>{viewEntry?.title || 'Diary'}</Text>
        <Text style={[styles.recentMeta, { color: theme.colors.textTertiary }]}>
          {viewEntry ? `${relativeDayLabel(toDateKey(viewEntry.entry_date))} • ${viewEntry.class_name || ''}${viewEntry.section_name || ''} ${viewEntry.subject_name || ''}` : ''}
        </Text>
        <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{viewEntry && 'content' in viewEntry ? String(viewEntry.content || '') : ''}</Text>
        <PressScale onPress={() => { if (viewEntry) void reuseEntry(viewEntry, 'reuse'); }}><View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Reuse</Text></View></PressScale>
      </Sheet>

      <Sheet visible={saveTemplateOpen} onClose={() => setSaveTemplateOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>Save as template</Text>
        <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>Template name</Text>
        <AppTextInput value={saveTemplateName} onChangeText={setSaveTemplateName} placeholder="Corrections + Signature" />
        <PressScale onPress={() => void saveCustomTemplate()}><View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Save</Text></View></PressScale>
      </Sheet>

      <Sheet visible={classDiaryPickerOpen} onClose={() => setClassDiaryPickerOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>Upload Class Diary</Text>
        {classTeacherSections.map((item) => (
          <PressScale key={item.class_section_id} onPress={() => {
            setClassDiaryPickerOpen(false);
            void captureClassDiary(item);
          }}>
            <View style={styles.pickerRow}>
              <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{classLabel(item)}</Text>
            </View>
          </PressScale>
        ))}
      </Sheet>

      <Sheet visible={classDiaryReviewOpen} onClose={() => setClassDiaryReviewOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>
          Class {classLabel(classDiaryClass)}
        </Text>
        <Text style={[styles.warnText, { color: theme.colors.textSecondary }]}>Detected diary entries</Text>
        {classDiaryImage ? <Image source={{ uri: classDiaryImage }} style={styles.previewImage} /> : null}
        {classDiaryEntries.map((item, index) => (
          <PressScale key={`${item.subject}-${index}`} onPress={() => {
            setClassDiaryEntries((prev) => prev.map((row, rowIndex) => (
              rowIndex === index ? { ...row, selected: row.selected === false } : row
            )));
          }}>
            <View style={[styles.classEntryRow, item.selected === false && { opacity: 0.45 }]}>
              <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>
                {(item.unknown ? 'Unknown Subject' : item.subject).toUpperCase()}
              </Text>
              <Text style={[styles.reviewBody, { color: theme.colors.textStrong }]}>{item.homework || item.classwork || 'No text detected'}</Text>
              <Text style={[styles.currentMeta, { color: theme.colors.textSecondary }]}>
                {item.selected === false ? 'Not selected' : (item.confidence_label || 'Looks good')}
              </Text>
              {item.unknown ? (
                <View style={styles.chipWrap}>
                  {classDiarySubjects.map((subject) => (
                    <PressScale key={subject.id} onPress={() => {
                      setClassDiaryEntries((prev) => prev.map((row, rowIndex) => (
                        rowIndex === index ? { ...row, subject: subject.name, subject_id: subject.id, unknown: false, selected: true } : row
                      )));
                    }}>
                      <View style={styles.templateChip}><Text style={styles.templateChipText}>{subject.name}</Text></View>
                    </PressScale>
                  ))}
                </View>
              ) : (
                <PressScale onPress={() => setEditClassIndex(index)}>
                  <Text style={[styles.linkBtn, { color: theme.colors.primary }]}>Edit</Text>
                </PressScale>
              )}
            </View>
          </PressScale>
        ))}
        <PressScale onPress={() => void publishClassDiaryNow(false)}>
          <View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>{busy ? 'Publishing…' : 'Publish All'}</Text></View>
        </PressScale>
        <PressScale onPress={confirmSendOriginalClassDiary}>
          <View style={styles.ghostBtn}><Text style={[styles.ghostBtnText, { color: theme.colors.primary }]}>Send original image</Text></View>
        </PressScale>
      </Sheet>

      <Sheet visible={classDiaryFailedOpen} onClose={() => setClassDiaryFailedOpen(false)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>We couldn't read the diary automatically.</Text>
        <Text style={[styles.warnText, { color: theme.colors.textSecondary }]}>{classDiaryMessage || 'You can still send the original page.'}</Text>
        {classDiaryImage ? <Image source={{ uri: classDiaryImage }} style={styles.previewImage} /> : null}
        <PressScale onPress={() => classDiaryClass && void captureClassDiary(classDiaryClass)}>
          <View style={styles.ghostBtn}><Text style={[styles.ghostBtnText, { color: theme.colors.primary }]}>Try again</Text></View>
        </PressScale>
        <PressScale onPress={confirmSendOriginalClassDiary}>
          <View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Send original image</Text></View>
        </PressScale>
        <PressScale onPress={() => { setClassDiaryFailedOpen(false); setManualOpen(true); }}>
          <View style={styles.ghostBtn}><Text style={[styles.ghostBtnText, { color: theme.colors.primary }]}>Enter manually</Text></View>
        </PressScale>
      </Sheet>

      <Sheet visible={editClassIndex != null} onClose={() => setEditClassIndex(null)} isDark={isDark}>
        <Text style={[styles.sheetTitle, { color: theme.colors.textStrong }]}>{editClassIndex != null ? classDiaryEntries[editClassIndex]?.subject : 'Edit'}</Text>
        {editClassIndex != null ? (
          <>
            <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary }]}>Homework</Text>
            <AppTextInput
              value={classDiaryEntries[editClassIndex]?.homework || ''}
              onChangeText={(text) => setClassDiaryEntries((prev) => prev.map((row, index) => index === editClassIndex ? { ...row, homework: text } : row))}
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <Text style={[styles.reviewLabel, { color: theme.colors.textTertiary, marginTop: 10 }]}>Classwork</Text>
            <AppTextInput
              value={classDiaryEntries[editClassIndex]?.classwork || ''}
              onChangeText={(text) => setClassDiaryEntries((prev) => prev.map((row, index) => index === editClassIndex ? { ...row, classwork: text } : row))}
            />
            <PressScale onPress={() => setEditClassIndex(null)}>
              <View style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Done</Text></View>
            </PressScale>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

function Sheet({ visible, onClose, isDark, children, closeDisabled }: { visible: boolean; onClose: () => void; isDark: boolean; children: React.ReactNode; closeDisabled?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  if (!visible) return null;
  const requestClose = closeDisabled ? () => {} : onClose;
  const side = 12;
  const bottom = Math.max(12, insets.bottom || (Platform.OS === 'web' ? 16 : 12));
  const cardWidth = Math.min(480, Math.max(280, width - side * 2));
  const maxCardH = Math.min(height * 0.88, height - bottom - 12);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={requestClose}>
      <Pressable style={sheetStyles.overlay} onPress={closeDisabled ? undefined : onClose} />
      <View style={[
        sheetStyles.card,
        {
          width: cardWidth,
          left: Math.max(side, (width - cardWidth) / 2),
          bottom,
          maxHeight: maxCardH,
          backgroundColor: isDark ? 'rgba(22,30,46,0.96)' : 'rgba(255,255,255,0.96)',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)',
        },
      ]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          contentContainerStyle={{ paddingBottom: 4 }}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

function HomeworkDayList({
  theme, isDark, styles, diaryEntries, displayYmd, onEdit, onDelete, labels,
}: {
  theme: Theme; isDark: boolean; styles: ReturnType<typeof getStyles>;
  diaryEntries: DiaryEntry[]; displayYmd: string;
  onEdit: (entry: DiaryEntry) => void; onDelete: (entry: DiaryEntry) => void;
  labels: Record<string, string>;
}) {
  const items = diaryEntries.filter((e) => e.entry_date === displayYmd);
  if (items.length === 0) {
    return (
      <View style={[styles.emptyRecent, clayCard(isDark, 'sm')]}>
        <ClaySheen isDark={isDark} radius={Radii.xl} />
        <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(79,70,229,0.16)' : '#EEF2FF' }]}>
          <Ionicons name="book-outline" size={22} color={theme.colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.textStrong }]}>{labels.emptyTitle}</Text>
        <Text style={[styles.emptyText, { color: theme.colors.textSecondary, textAlign: 'center' }]}>{labels.noHomework}</Text>
      </View>
    );
  }
  return (
    <View style={styles.listContainer}>
      {items.map((item) => {
        const ss = getSubjectStyle(item.subject_name);
        return (
          <View key={item.id} style={[styles.postCard, clayCard(isDark, 'sm')]}>
            <View style={[styles.postAccent, { backgroundColor: ss.color }]} />
            <View style={styles.postBody}>
              <Text style={[styles.postClass, { color: ss.color }]}>{item.class_name}-{item.section_name} • {item.subject_name}</Text>
              <Text style={[styles.postTitle, { color: theme.colors.textStrong }]}>{diaryDisplayTitle(item)}</Text>
              {normalizeDiaryAttachments(item.attachments)[0] ? (
                <Image source={{ uri: normalizeDiaryAttachments(item.attachments)[0] }} style={styles.recentPhoto} />
              ) : null}
              {isPhotoFallbackContent(diaryDisplayContent(item)) && normalizeDiaryAttachments(item.attachments).length > 0 ? null : (
                <Text style={[styles.postContent, { color: theme.colors.textSecondary }]} numberOfLines={3}>{diaryDisplayContent(item)}</Text>
              )}
              <View style={styles.actionRow}>
                <PressScale onPress={() => onEdit(item)}><Text style={[styles.editText, { color: theme.colors.primary }]}>{labels.edit}</Text></PressScale>
                <PressScale onPress={() => onDelete(item)}><Text style={[styles.editText, { color: theme.colors.danger }]}>{labels.delete}</Text></PressScale>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,16,32,0.55)' },
  card: {
    position: 'absolute',
    borderRadius: Radii.xxl,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    alignSelf: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
});

const getStyles = (theme: Theme, isDark: boolean, isWide: boolean) => StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: {
    paddingHorizontal: isWide ? Spacing.xl : Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 88,
    maxWidth: isWide ? 1040 : 720,
    width: '100%',
    alignSelf: 'center',
  },
  tabWrap: { marginBottom: Spacing.md },
  greeting: { ...Typography.heading, fontWeight: '800', marginBottom: 4 },
  greetingHint: { ...Typography.caption, fontWeight: '500', marginBottom: Spacing.md },
  currentCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, marginBottom: Spacing.md },
  currentIcon: { width: 48, height: 48, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  currentKicker: { ...Typography.label, color: theme.colors.textTertiary },
  currentTitle: { ...Typography.title, fontWeight: '800', letterSpacing: -0.3 },
  currentMeta: { ...Typography.caption, fontWeight: '500', marginTop: 2 },
  changeChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  changeText: { fontSize: 13, fontWeight: '800' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, padding: Spacing.sm, marginBottom: Spacing.sm },
  suggestText: { flex: 1, fontSize: 13, fontWeight: '600' },
  actionBoard: isWide
    ? { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.md, marginBottom: Spacing.lg, minHeight: 232 }
    : { flexDirection: 'column', gap: Spacing.sm, marginBottom: Spacing.md },
  photoWrap: isWide ? { flex: 1.45, minHeight: 232, position: 'relative' } : { width: '100%', position: 'relative' },
  photoCta: {
    width: '100%',
    minHeight: isWide ? 232 : 176,
    height: isWide ? 232 : 176,
    borderRadius: Radii.xxl + 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: isWide ? 0 : 20,
    paddingBottom: isWide ? 0 : 12,
    overflow: 'hidden',
  },
  photoIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radii.xl,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  photoCtaTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
  photoCtaHint: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: isWide ? 8 : 4,
  },
  photoCtaKeep: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  galleryFab: { position: 'absolute', right: 10, top: 10, zIndex: 2 },
  galleryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: Radii.pill,
    backgroundColor: 'rgba(15,23,42,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  galleryChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  galleryLink: { textAlign: 'center', fontSize: 13, fontWeight: '700', marginBottom: 14 },
  secondaryCol: isWide
    ? { flex: 1, minWidth: 0, gap: Spacing.sm }
    : { flexDirection: 'row', gap: Spacing.sm },
  secondaryCta: {
    flex: 1,
    width: '100%',
    minHeight: isWide ? 110 : 108,
    borderRadius: Radii.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  secondaryIcon: { width: 40, height: 40, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  secondaryTitle: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
  secondaryHint: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  classDiaryCta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, marginBottom: Spacing.md, minHeight: 72 },
  classEntryRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.25)' },
  panel: { padding: Spacing.md, marginBottom: Spacing.md },
  sectionTitle: { ...Typography.title, fontWeight: '800', letterSpacing: -0.3, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: Spacing.sm },
  sectionHint: { fontSize: 12, fontWeight: '700', marginBottom: Spacing.xs, marginTop: Spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: 0 },
  templateChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radii.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  templateChipText: { fontSize: 13, fontWeight: '700' },
  prefCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 14, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
  prefLabel: { fontSize: 14, fontWeight: '700' },
  prefHint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  recentCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  recentPhoto: { width: '100%', height: 168, borderRadius: Radii.lg, marginTop: 8, marginBottom: 8, backgroundColor: 'rgba(15,23,42,0.06)' },
  recentMeta: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  recentBody: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  recentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionPill: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  actionPillText: { fontSize: 12, fontWeight: '800' },
  linkBtn: { fontSize: 13, fontWeight: '800', minHeight: 32, textAlignVertical: 'center' },
  emptyRecent: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: Spacing.lg, gap: 6, marginBottom: Spacing.md },
  emptyIcon: { width: 48, height: 48, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  sheetTitle: { ...Typography.subheading, fontWeight: '800', letterSpacing: -0.4, marginBottom: Spacing.sm },
  previewImage: { width: '100%', height: isWide ? 180 : 132, borderRadius: Radii.lg, marginBottom: Spacing.sm, backgroundColor: 'rgba(15,23,42,0.06)' },
  confirmThumbs: { marginBottom: Spacing.sm },
  confirmThumb: { width: 148, height: 148, borderRadius: Radii.lg, marginRight: 8, backgroundColor: 'rgba(15,23,42,0.06)' },
  retentionNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: Spacing.md },
  retentionText: { flex: 1, flexShrink: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  reviewLabel: { ...Typography.label, marginBottom: 4 },
  reviewBody: { fontSize: 16, fontWeight: '600', lineHeight: 22, marginBottom: 8 },
  warnText: { fontSize: 13, fontWeight: '500', marginBottom: 10 },
  sheetActions: { gap: 10, marginTop: 8 },
  primaryBtn: { height: 52, borderRadius: Radii.lg, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  ghostBtn: { height: 48, borderRadius: Radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(79,70,229,0.12)' : '#EEF2FF' },
  ghostBtnText: { fontSize: 15, fontWeight: '800' },
  pickerRow: { minHeight: 48, justifyContent: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.25)' },
  listContainer: { gap: 12 },
  emptyCard: { alignItems: 'center', paddingVertical: 36, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyText: { fontSize: 13, fontWeight: '500' },
  postCard: { flexDirection: 'row', overflow: 'hidden' },
  postAccent: { width: 4 },
  postBody: { flex: 1, padding: 14 },
  postClass: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  postTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  postContent: { fontSize: 14, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  editText: { fontSize: 13, fontWeight: '800' },
});
