import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions, findNodeHandle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { overlayHolder, subscribeOverlay } from '../popups/overlayLock';
import { useAppTour, useOptionalAppTour } from './TourProvider';
import { TourHostContext, TourTarget } from './targets';
import { clearAudioCache, downloadLanguagePack, hasPremiumAudio, tourNarration } from './narration';
import { tourCopy } from './copy';
import { tourCategories } from './catalog';
import { completedSteps, routeCovered, searchGuides } from './library';
import type { TourDefinition, TourPortal } from './types';

export function AppTourQuickAction({ portal, style }: { portal: TourPortal; style?: import('react-native').ViewProps['style'] }) {
  const tour = useOptionalAppTour();
  const { theme } = useTheme();
  const c = tourCopy(tour?.locale ?? 'en');
  if (!tour?.enabled) return null;
  return <TourTarget id={`${portal}.launcher`} native><Pressable accessibilityRole="button" accessibilityLabel={c.appTour} onPress={() => tour.open(portal)} style={[styles.launcher, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, style]}>
    <LinearGradient colors={['#6356D9', '#369CB4']} style={styles.launchIcon}><Ionicons name="compass-outline" size={25} color="#FFFFFF" /></LinearGradient>
    <View style={{ flex: 1 }}><Text style={[styles.launchTitle, { color: theme.colors.textStrong }]}>{c.appTour}</Text><Text style={[styles.launchSubtitle, { color: theme.colors.textSecondary }]}>{c.subtitle}</Text></View>
    <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
  </Pressable></TourTarget>;
}
export function AppTourHeaderButton({ color }: { color?: string } = {}) {
  const tour = useOptionalAppTour();
  const { theme } = useTheme();
  if (!tour?.enabled || !tour.guides.length) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={tourCopy(tour.locale).appTour} onPress={() => tour.open()}
    style={{ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name="help-circle-outline" size={23} color={color ?? theme.colors.primary} />
  </Pressable>;
}

function Button({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: primary ? theme.colors.primary : theme.colors.background, borderColor: theme.colors.border, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
    <Text style={{ color: primary ? '#FFFFFF' : theme.colors.textStrong, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>{label}</Text>
  </Pressable>;
}
function Settings() {
  const tour = useAppTour();
  const c = tourCopy(tour.locale);
  const { theme } = useTheme();
  return <View style={styles.settings}>
    <View style={styles.row}><Text style={[styles.label, { color: theme.colors.textSecondary }]}>{c.language}</Text><View style={styles.wrap}>
      {(['en', 'te'] as const).map(locale => <Pressable key={locale} accessibilityRole="button" accessibilityState={{ selected: tour.locale === locale }} onPress={() => tour.updatePreferences({ locale })} style={[styles.chip, { backgroundColor: tour.locale === locale ? theme.colors.primary : theme.colors.background }]}>
        <Text style={{ fontWeight: '700', color: tour.locale === locale ? '#FFF' : theme.colors.textStrong }}>{locale === 'en' ? 'English' : 'తెలుగు'}</Text>
      </Pressable>)}
    </View></View>
    <View style={styles.row}><Text style={[styles.label, { color: theme.colors.textSecondary }]}>{c.narration}</Text><Switch accessibilityLabel={c.narration} value={tour.preferences.narration} onValueChange={narration => tour.updatePreferences({ narration })} /></View>
    <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{c.speed}</Text>
    <View style={styles.wrap}>{[0.75, 1, 1.25, 1.5].map(rate => <Pressable key={rate} accessibilityRole="button" accessibilityLabel={`${c.speed}: ${rate}`} accessibilityState={{ selected: tour.preferences.rate === rate }} onPress={() => tour.updatePreferences({ rate })} style={[styles.chip, { backgroundColor: tour.preferences.rate === rate ? theme.colors.primary : theme.colors.background }]}>
      <Text style={{ color: tour.preferences.rate === rate ? '#FFF' : theme.colors.textStrong, fontWeight: '700' }}>{rate}×</Text>
    </Pressable>)}</View>
    <View style={styles.row}><Text style={[styles.label, { flex: 1, color: theme.colors.textSecondary }]}>{c.auto}</Text><Switch accessibilityLabel={c.auto} value={tour.preferences.autoAdvance} onValueChange={autoAdvance => tour.updatePreferences({ autoAdvance })} /></View>
  </View>;
}
function GuideCard({ guide, featured = false }: { guide: TourDefinition; featured?: boolean }) {
  const tour = useAppTour(); const c = tourCopy(tour.locale); const { theme } = useTheme();
  const progress = tour.progress[guide.id]; const done = completedSteps(guide, progress);
  const completed = guide.kind === 'complete' ? done === guide.steps.length : progress?.status === 'completed';
  return <View style={[styles.guide, { borderColor: featured ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.background }]}>
    <View style={styles.row}><Ionicons name={completed ? 'checkmark-circle' : featured ? 'compass-outline' : 'trail-sign-outline'} size={24} color={theme.colors.primary} /><Text style={[styles.section, { flex: 1, color: theme.colors.textStrong }]}>{guide.title[tour.locale]}</Text></View>
    <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>{guide.description[tour.locale]}</Text>
    <Text style={[styles.footnote, { color: theme.colors.textSecondary }]}>{done} / {guide.steps.length} {c.explanations}</Text>
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel={guide.title[tour.locale]} accessibilityValue={{ min: 0, max: guide.steps.length, now: done }}><View style={{ height: 4, width: `${done / guide.steps.length * 100}%`, backgroundColor: theme.colors.primary }} /></View>
    <View style={styles.wrap}><Button primary label={completed ? c.replay : progress ? c.resume : c.start} onPress={() => void tour.start(guide.id)} />
      {progress && !completed && <Button label={c.restart} onPress={() => void tour.start(guide.id, true)} />}</View>
  </View>;
}
function Hub() {
  const tour = useAppTour(); const c = tourCopy(tour.locale); const { theme } = useTheme();
  const [download, setDownload] = useState(''); const [busy, setBusy] = useState(false); const [quickGuides, setQuickGuides] = useState(false);
  const [query, setQuery] = useState(''); const [category, setCategory] = useState(''); const [status, setStatus] = useState(''); const [limit, setLimit] = useState(12); const [settings, setSettings] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => setLimit(12), [query, category, status]);
  const pack = async () => {
    controller.current = new AbortController(); const signal = controller.current.signal;
    setBusy(true); setDownload(c.downloading);
    const ok = await downloadLanguagePack(tour.locale, (n, total) => { if (!signal.aborted) setDownload(`${c.downloading} ${n}/${total}`); }, signal);
    if (signal.aborted) return;
    setBusy(false); setDownload(ok ? c.downloaded : c.downloadFailed);
  };
  const features = tour.guides.filter(t => t.kind === 'feature');
  const filtered = searchGuides(tour.guides, query, category, status, tour.progress);
  const full = tour.guides.find(t => t.kind === 'complete');
  const categories = [...new Set(features.map(t => t.category).filter((value): value is string => !!value))];
  const current = features.filter(guide => routeCovered(guide, tour.currentRoute));
  const chip = (label: string, selected: boolean, onPress: () => void, key = label) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? theme.colors.primary : theme.colors.background, borderWidth: 1, borderColor: theme.colors.border }]}><Text style={{ color: selected ? '#FFF' : theme.colors.textStrong, fontWeight: '600' }}>{label}</Text></Pressable>;
  return <>
    <View style={styles.row}><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: theme.colors.primary }]}>{c.appTour}</Text><Text style={[styles.heading, { color: theme.colors.textStrong }]}>{c.features}</Text></View><Button label={c.close} onPress={tour.close} /></View>
    <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>{features.length} {c.coverage}</Text>
    <View style={styles.wrap}>{(['en', 'te'] as const).map(locale => chip(locale === 'en' ? 'English' : 'తెలుగు', tour.locale === locale, () => tour.updatePreferences({ locale }), locale))}<Button label={settings ? c.hideSettings : c.settings} onPress={() => setSettings(v => !v)} /></View>
    {settings && <Settings />}
    {full && <GuideCard guide={full} featured />}
    <Button label={c.quickGuides} onPress={() => setQuickGuides(value => !value)} />
    {quickGuides && <>
    {!!current.length && <View style={{ gap: 12 }}><Text style={[styles.section, { color: theme.colors.textStrong }]}>{c.thisScreen}</Text>{current.slice(0, 3).map(guide => <GuideCard key={guide.id} guide={guide} />)}</View>}
    {(['welcome', 'task'] as const).map(kind => <View key={kind} style={{ gap: 12, marginTop: 16 }}>
      <Text style={[styles.section, { color: theme.colors.textStrong }]}>{kind === 'welcome' ? c.welcome : c.tasks}</Text>
      {tour.guides.filter(t => t.kind === kind).map(guide => <GuideCard key={guide.id} guide={guide} />)}
    </View>)}
    </>}
    <View style={{ gap: 12, marginTop: 24 }}>
      <Text style={[styles.section, { color: theme.colors.textStrong }]}>{c.features}</Text>
      <TextInput accessibilityLabel={c.search} placeholder={c.search} placeholderTextColor={theme.colors.textSecondary} value={query} onChangeText={setQuery} autoCorrect={false} style={{ borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, color: theme.colors.textStrong, borderRadius: 14, padding: 14, minHeight: 48, fontSize: 15 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chip(c.all, !category, () => setCategory(''))}{categories.map(id => chip(tourCategories[id]?.[tour.locale] ?? id, category === id, () => setCategory(id), id))}</ScrollView>
      <View style={styles.wrap}>{[['', c.allStatus], ['paused', c.inProgress], ['completed', c.completed], ['unstarted', c.unstarted]].map(([value, label]) => chip(label, status === value, () => setStatus(value), value))}</View>
      <Text accessibilityLiveRegion="polite" style={[styles.footnote, { color: theme.colors.textSecondary }]}>{filtered.length} / {features.length} {c.features}</Text>
      {!filtered.length && <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>{c.noResults}</Text>}
      {filtered.slice(0, limit).map(guide => <GuideCard key={guide.id} guide={guide} />)}
      {filtered.length > limit && <Button label={`${c.showMore} (${filtered.length - limit})`} onPress={() => setLimit(n => n + 12)} />}
    </View>
    <View style={{ gap: 12, marginTop: 24 }}><Text style={[styles.section, { color: theme.colors.textStrong }]}>{c.packs}</Text>
      <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>{hasPremiumAudio() ? c.device : c.noPremium}</Text>
      <View style={styles.wrap}><Button label={c.download} onPress={() => void pack()} disabled={busy || !hasPremiumAudio()} /><Button label={c.remove} disabled={busy} onPress={() => { void clearAudioCache().then(() => setDownload('')).catch(() => setDownload(c.downloadFailed)); }} /></View>
      {!!download && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textSecondary }}>{download}</Text>}
      <Text style={[styles.footnote, { color: theme.colors.textSecondary }]}>{c.safe}</Text><Text style={[styles.footnote, { color: theme.colors.textSecondary }]}>{c.device}</Text>
    </View>
  </>;
}
function StepCard() {
  const tour = useAppTour();
  const c = tourCopy(tour.locale);
  const { theme } = useTheme();
  const narration = useSyncExternalStore(tourNarration.subscribe, tourNarration.getSnapshot, tourNarration.getSnapshot);
  const [settings, setSettings] = useState(false);
  const [chapters, setChapters] = useState(false);
  const title = useRef<Text>(null);
  useEffect(() => {
    if (Platform.OS === 'web') (title.current as unknown as HTMLElement | null)?.focus();
    else {
      const node = findNodeHandle(title.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }
  }, [tour.state.index, tour.state.phase]);
  const missing = tour.state.phase === 'missing';
  const waiting = ['waiting', 'navigating'].includes(tour.state.phase);
  const completed = tour.state.phase === 'completed';
  const instruction = tour.step?.body[tour.locale] ?? '';
  const spoken = narration.status === 'speaking' ? tour.step?.narration[tour.locale][narration.sentence] ?? '' : '';
  const sentencePosition = spoken ? instruction.indexOf(spoken) : -1;
  return <>
    <View style={styles.row}><Text style={[styles.eyebrow, { flex: 1, color: theme.colors.primary }]}>{tour.tour?.title[tour.locale]}</Text><Button label={c.exit} onPress={tour.exit} /></View>
    <Text accessibilityLiveRegion="polite" style={[styles.footnote, { color: theme.colors.textSecondary }]}>{(tour.state.index + 1).toLocaleString(tour.locale)} / {tour.tour?.steps.length.toLocaleString(tour.locale)}</Text>
    {tour.step?.chapterId && <Text style={[styles.footnote, { color: theme.colors.primary, fontWeight: '700' }]}>{tour.guides.find(g => g.id === tour.step?.chapterId)?.title[tour.locale]}</Text>}
    <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: tour.tour?.steps.length ?? 1, now: tour.state.index + 1 }}><View style={{ height: 4, borderRadius: 2, width: `${((tour.state.index + 1) / (tour.tour?.steps.length ?? 1)) * 100}%`, backgroundColor: theme.colors.primary }} /></View>
    <Text ref={title} tabIndex={-1} accessible accessibilityRole="header" style={[styles.heading, { color: theme.colors.textStrong }]}>{completed ? c.done : missing ? c.missing : waiting ? c.loading : tour.step?.title[tour.locale]}</Text>
    {completed ? <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>{tour.tour?.kind === 'complete' && tour.tour.steps.some(s => !tour.state.visited?.includes(s.id)) ? c.partialDone : tour.state.skipped.length ? c.skippedDone : c.doneBody}</Text>
      : missing ? <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>{tour.state.reason === 'access' ? c.access : c.missingBody}</Text>
      : !waiting && <Text style={[styles.paragraph, { color: theme.colors.textStrong }]}>{sentencePosition >= 0 ? <>{instruction.slice(0, sentencePosition)}<Text style={{ backgroundColor: `${theme.colors.primary}18` }}>{spoken}</Text>{instruction.slice(sentencePosition + spoken.length)}</> : instruction}</Text>}
    {!!spoken && sentencePosition < 0 && <Text style={[styles.paragraph, { color: theme.colors.textStrong, backgroundColor: `${theme.colors.primary}18`, borderRadius: 8 }]}>{spoken}</Text>}
    {tour.state.phase === 'action' && <Text style={[styles.hint, { color: theme.colors.primary }]}>{c.action}</Text>}
    {narration.status === 'unavailable' && <Text accessibilityLiveRegion="polite" style={[styles.footnote, { color: theme.colors.textSecondary }]}>{c.unavailable}</Text>}
    <View style={styles.wrap}>
      {!waiting && !missing && !completed && <Button label={narration.status === 'speaking' || narration.status === 'loading' ? c.pause : narration.status === 'paused' ? c.resumeNarration : c.play} onPress={() => {
        if (narration.status === 'speaking' || narration.status === 'loading') tourNarration.pause();
        else if (narration.status === 'paused') tourNarration.resume();
        else if (!tour.preferences.narration) tour.updatePreferences({ narration: true });
        else if (tour.tour && tour.step) void tourNarration.play(tour.tour, tour.step, tour.locale, tour.preferences.rate, () => { if (tour.preferences.autoAdvance && !tour.step?.event) tour.next(); });
      }} />}
      {!waiting && !missing && !completed && <Button label={c.replayNarration} onPress={() => {
        if (!tour.preferences.narration) tour.updatePreferences({ narration: true });
        else if (tour.tour && tour.step) void tourNarration.play(tour.tour, tour.step, tour.locale, tour.preferences.rate, () => { if (tour.preferences.autoAdvance && !tour.step?.event) tour.next(); });
      }} />}
      <Button label={c.language} onPress={() => setSettings(v => !v)} />
    </View>
    {settings && <Settings />}
    {tour.tour?.kind === 'complete' && <>
      <Button label={c.chapters} onPress={() => setChapters(v => !v)} />
      {chapters && <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8 }}>
        {[...new Set(tour.tour.steps.map(s => s.chapterId))].filter((id): id is string => !!id).map(id => {
          const guide = tour.guides.find(g => g.id === id); const steps = tour.tour!.steps.filter(s => s.chapterId === id); const done = steps.filter(s => tour.state.visited?.includes(s.id)).length;
          return <Button key={id} label={`${guide?.title[tour.locale] ?? id} · ${done}/${steps.length}`} primary={tour.step?.chapterId === id} onPress={() => { tour.jumpToChapter(id); setChapters(false); }} />;
        })}
      </ScrollView>}
    </>}
  </>;
}
function StepNavigation() {
  const tour = useAppTour();
  const c = tourCopy(tour.locale);
  const missing = tour.state.phase === 'missing';
  const waiting = ['waiting', 'navigating'].includes(tour.state.phase);
  const completed = tour.state.phase === 'completed';
  return <View style={[styles.wrap, { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 12, flexShrink: 0 }]}>
    {completed ? <Button primary label={c.appTour} onPress={() => tour.open()} /> : <>
      <Button label={c.back} disabled={tour.state.index === 0 || waiting} onPress={tour.back} />
      {missing ? <Button primary label={c.retry} onPress={tour.retry} /> : <Button primary label={tour.state.index === (tour.tour?.steps.length ?? 0) - 1 ? c.finish : c.next} disabled={waiting || tour.state.phase === 'action'} onPress={() => tour.next()} />}
      <Button label={c.skip} disabled={waiting} onPress={() => tour.next(true)} />
      <Button label={c.exit} onPress={tour.exit} />
    </>}
  </View>;
}

/** Place a named host inside a native Modal when adding tour targets there. */
export function TourOverlayHost({ id = 'root' }: { id?: string }) {
  const tour = useAppTour();
  const { theme } = useTheme();
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const holder = useSyncExternalStore(subscribeOverlay, overlayHolder, overlayHolder);
  const host = useRef<View>(null);
  const card = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [cardHeight, setCardHeight] = useState(300);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!cancelled && !reduced) { loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true })])); loop.start(); }
    });
    return () => { cancelled = true; loop?.stop(); };
  }, [pulse]);
  const active = holder === 'tour' && (tour.hub || tour.invitation || !['idle', 'paused'].includes(tour.state.phase));
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (tour.hub || tour.invitation) tour.close(); else tour.exit(); return true; });
    return () => subscription.remove();
  }, [active, tour]);
  useEffect(() => {
    if (!active || Platform.OS !== 'web') return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = () => {
      const panel = card.current as unknown as HTMLElement | null;
      const selectors = 'button,[role="button"],input,[tabindex="0"]';
      const nodes = Array.from(panel?.querySelectorAll<HTMLElement>(selectors) ?? []).filter(node => node.getAttribute('aria-disabled') !== 'true' && node.getAttribute('disabled') === null);
      if (tour.state.phase === 'action' && tour.step) {
        const target = document.querySelector<HTMLElement>(`[data-tour-target="${tour.step.target}"]`);
        if (target) nodes.unshift(...(target.matches(selectors) ? [target] : Array.from(target.querySelectorAll<HTMLElement>(selectors))));
      }
      return nodes;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (tour.hub || tour.invitation) tour.close(); else tour.exit(); }
      if (event.key === 'Tab') {
        const nodes = focusable(); if (!nodes.length) return;
        const index = nodes.indexOf(document.activeElement as HTMLElement);
        if (index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === nodes.length - 1) { event.preventDefault(); (event.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus(); }
      }
    };
    focusable()[0]?.focus(); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); if (previouslyFocused?.isConnected) previouslyFocused.focus(); };
    // Rectangle remeasurement must not reset keyboard focus every 250 ms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tour.state.generation, tour.state.phase, tour.hub, tour.invitation, tour.step]);
  if (!active || (tour.state.host !== id && !tour.hub && !tour.invitation)) return null;
  const c = tourCopy(tour.locale);
  const rect = tour.state.rect;
  const x = rect ? Math.max(0, rect.x - origin.x - 6) : 0;
  const y = rect ? Math.max(0, rect.y - origin.y - 6) : 0;
  const w = rect ? Math.min(dimensions.width - x, rect.width + 12) : 0;
  const h = rect ? Math.min(dimensions.height - y, rect.height + 12) : 0;
  const hub = !!tour.hub;
  const centered = hub || !!tour.invitation || !rect;
  const wide = dimensions.width >= 900;
  const width = Math.min(hub ? 620 : 430, dimensions.width - 28);
  const roomRight = x + w + width + 32 <= dimensions.width;
  const roomLeft = x - width - 18 >= 14;
  const above = !centered && !wide && y > dimensions.height * 0.55;
  const left = centered ? (dimensions.width - width) / 2 : wide && roomRight ? x + w + 18 : wide && roomLeft ? x - width - 18 : 14;
  const top = centered ? undefined : wide ? Math.max(insets.top + 12, Math.min(roomRight || roomLeft ? y : y + h + 16, dimensions.height - cardHeight - insets.bottom - 16)) : above ? Math.max(insets.top + 12, y - cardHeight - 18) : undefined;
  const controlsBlocked = tour.step?.readOnly === true || tour.state.phase !== 'action';
  return <View ref={host} onLayout={() => host.current?.measureInWindow((x, y) => setOrigin({ x, y }))} pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 90000, elevation: 90 }]}>
    {rect && !centered ? <>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]} />
      {[
        { top: 0, left: 0, right: 0, height: y }, { top: y + h, left: 0, right: 0, bottom: 0 },
        { top: y, left: 0, width: x, height: h }, { top: y, left: x + w, right: 0, height: h },
      ].map((style, i) => <Pressable key={i} accessible={false} style={[{ position: 'absolute', backgroundColor: 'rgba(9,15,31,0.62)' }, style]} />)}
      {controlsBlocked && <Pressable accessible={false} style={{ position: 'absolute', left: x, top: y, width: w, height: h }} />}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 14, borderWidth: 3, borderColor: '#C9C4FF', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }} />
    </> : <Pressable accessible={false} onPress={() => { if (tour.hub || tour.invitation) tour.close(); }} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,15,31,0.62)' }]} />}
    <View ref={card} accessibilityViewIsModal={tour.state.phase !== 'action'} onLayout={event => setCardHeight(event.nativeEvent.layout.height)} style={[styles.card, { width, left, top: centered ? Math.max(insets.top + 12, hub ? 30 : (dimensions.height - Math.min(cardHeight, dimensions.height - 60)) / 2) : top, bottom: centered || wide || above ? undefined : Math.max(insets.bottom + 12, 14), maxHeight: centered ? dimensions.height - insets.top - insets.bottom - 50 : above ? Math.min(dimensions.height * 0.52, y - insets.top - 30) : wide ? dimensions.height * 0.8 : Math.min(dimensions.height * 0.52, Math.max(180, dimensions.height - y - h - insets.bottom - 30)), backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }}>
        {tour.hub ? <Hub /> : tour.invitation ? <>
          <Ionicons name="compass-outline" size={40} color={theme.colors.primary} />
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.textStrong }]}>{c.invite}</Text>
          <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>{c.inviteBody}</Text>
          <View style={styles.wrap}><Button primary label={c.appTour} onPress={() => tour.open()} /><Button label={c.later} onPress={tour.dismissInvite} /></View>
        </> : <StepCard />}
      </ScrollView>
      {tour.hub ? <View style={{ paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 }}><Button label={c.close} onPress={tour.close} /></View> : !tour.invitation && <StepNavigation />}
    </View>
  </View>;
}
export function TourModalContent({ id, children }: { id: string; children: React.ReactNode }) {
  return <TourHostContext.Provider value={id}><View style={{ flex: 1 }}>{children}<TourOverlayHost id={id} /></View></TourHostContext.Provider>;
}
const styles = StyleSheet.create({
  launcher: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 16, minHeight: 80 },
  launchIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  launchTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 }, launchSubtitle: { fontSize: 13, lineHeight: 20 },
  card: { position: 'absolute', borderRadius: 24, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }, heading: { fontSize: 24, fontWeight: '800', lineHeight: 34 },
  paragraph: { fontSize: 15, lineHeight: 25 }, section: { fontSize: 17, fontWeight: '700', lineHeight: 25 },
  footnote: { fontSize: 12, lineHeight: 20 }, hint: { fontSize: 14, fontWeight: '700', lineHeight: 22 },
  label: { fontSize: 13, lineHeight: 21 }, settings: { gap: 12, paddingVertical: 12 }, guide: { gap: 12, borderRadius: 18, borderWidth: 1, padding: 16 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
});
