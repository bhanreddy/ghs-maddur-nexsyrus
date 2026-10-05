import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, Keyboard, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { subscribe as subscribeFeatures, getSnapshot as featureSnapshot } from '../../services/featuresStore';
import { getStaffPortalSession, subscribeToStaffPortalSession } from '../../services/staffPortalSession';
import { StaffService } from '../../services/staffService';
import { useAuth } from '../../hooks/useAuth';
import { acquireOverlay, overlayHolder, releaseOverlay, subscribeOverlay } from '../popups/overlayLock';
import { FeatureAccessApi } from '../feature-access/services/featureAccessApi';
import { tourCatalog, TOUR_ENABLED, portalAllowed, portalForContextRoute, availableTourDefinitions } from './catalog';
import { canonicalRoute, initialTourState, tourReducer } from './state';
import { findTarget, subscribeTourEvents, tourCondition, subscribeTourBlockers, subscribeTourConditions, tourBlocked } from './registry';
import { identityKey, invitationKey, invitationSeen, markInvited, readPreferences, readProgress, savePreferences, saveProgress, readTourAccess, saveTourAccess } from './storage';
import { tourNarration } from './narration';
import type { TourDefinition, TourIdentity, TourLocale, TourPortal, TourPreferences, TourProgress, TourState, TourStep } from './types';

type TourContextValue = {
  enabled: boolean; hub: TourPortal | null; invitation: TourPortal | null; state: TourState;
  tour: TourDefinition | undefined; step: TourStep | undefined; locale: TourLocale; preferences: TourPreferences;
  progress: Record<string, TourProgress | null>; guides: TourDefinition[]; currentRoute: string;
  jumpToChapter: (id: string) => void;
  open: (portal?: TourPortal) => void; close: () => void; dismissInvite: () => void;
  start: (id: string, restart?: boolean) => Promise<void>; resume: (id: string) => Promise<void>; next: (skip?: boolean) => void;
  back: () => void; retry: () => void; exit: () => void; updatePreferences: (patch: Partial<TourPreferences>) => void;
};
const Context = createContext<TourContextValue | null>(null);
export const useOptionalAppTour = () => useContext(Context);
export function useAppTour() { const value = useContext(Context); if (!value) throw new Error('AppTour requires TourProvider'); return value; }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const defaultPreferences: TourPreferences = { locale: null, narration: false, rate: 1, autoAdvance: false };
export function TourProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { i18n } = useTranslation();
  const router = useRouter();
  const route = canonicalRoute(usePathname());
  const [state, dispatch] = useReducer(tourReducer, initialTourState);
  const [activeDefinition, setActiveDefinition] = useState<TourDefinition | null>(null);
  const startRequest = useRef(0);
  const invitedProfiles = useRef(new Set<string>());
  const previousPortal = useRef<{ scope: string; portal: TourPortal | null }>({ scope: '', portal: null });
  const dimensions = useWindowDimensions();
  const featureFlags = useSyncExternalStore(subscribeFeatures, featureSnapshot, featureSnapshot).features;
  const context = auth.portalContexts?.activeContext;
  const viewedStaff = useSyncExternalStore(subscribeToStaffPortalSession, getStaffPortalSession, getStaffPortalSession);
  const isViewingStaff = !!viewedStaff.staffId && viewedStaff.actorUserId === auth.user?.userId;
  const roles = context?.role_codes ?? auth.user?.roles ?? (auth.role ? [auth.role] : []);
  const permissions = context?.permissions ?? auth.user?.permissions ?? [];
  const scope = `${auth.user?.userId ?? ''}:${context?.id ?? 'default'}:${context?.school_id ?? auth.user?.schoolId ?? auth.schoolId}:${isViewingStaff ? viewedStaff.staffId : ''}`;
  const prior = previousPortal.current.scope === scope ? previousPortal.current.portal : null;
  const portal = portalForContextRoute(route, roles, prior, activeDefinition && previousPortal.current.scope === scope ? { portal: activeDefinition.portal, route: activeDefinition.steps.find(s => canonicalRoute(s.route) === route)?.route } : null);
  previousPortal.current = { scope, portal };
  const ready = TOUR_ENABLED && auth.authChecked && !auth.loading && !!auth.user && !!portal && portalAllowed(portal, roles);
  const schoolId = context?.school_id ?? auth.user?.schoolId ?? auth.schoolId;
  const userId = auth.user?.userId;
  const contextId = `${context?.id ?? 'default'}${portal === 'staff' && isViewingStaff ? `:view-as:${viewedStaff.staffId}` : ''}`;
  const identity = useMemo<TourIdentity | null>(() => ready && userId && portal && schoolId != null
    ? { schoolId, userId, contextId, portal } : null, [ready, userId, portal, schoolId, contextId]);
  const key = identity ? identityKey(identity) : '';
  const [hub, setHub] = useState<TourPortal | null>(null);
  const [invitation, setInvitation] = useState<TourPortal | null>(null);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [progress, setProgress] = useState<Record<string, TourProgress | null>>({});
  const [access, setAccess] = useState<Record<string, { allowed: boolean; expiresAt: number }>>({});
  const [hydrated, setHydrated] = useState('');
  const [layoutRevision, setLayoutRevision] = useState(0);
  const current = useRef({ state, identity, key, preferences, ready, roles, permissions, route, access, invitation, featureFlags, activeDefinition, progress });
  current.current = { state, identity, key, preferences, ready, roles, permissions, route, access, invitation, featureFlags, activeDefinition, progress };
  const tour = activeDefinition?.id === state.tourId ? activeDefinition : tourCatalog.find(t => t.id === state.tourId);
  const step = tour?.steps[state.index];
  const locale: TourLocale = preferences.locale ?? (i18n.language?.startsWith('te') ? 'te' : 'en');
  const hasPermission = useCallback((permission?: string) => !permission || current.current.roles.includes('admin') || current.current.permissions.includes(permission), []);
  const guides = availableTourDefinitions(hub ?? portal, t => portalAllowed(t.portal, roles)
    && t.steps.every(s => hasPermission(s.permission))
    && t.steps.every(s => !s.featureFlag || featureFlags[s.featureFlag] !== false)
    && t.steps.every(s => { const requirement = s.portalSetting ? `portal-setting:${s.portalSetting}` : s.feature; return !requirement || access[requirement]?.allowed !== false || access[requirement].expiresAt <= Date.now(); }));
  const guidesRef = useRef(guides); guidesRef.current = guides;


  const persist = useCallback((requestedStatus?: 'paused' | 'completed') => {
    const { state: live, identity: who, activeDefinition: definition, progress: records } = current.current;
    if (!who || !definition || live.tourId !== definition.id) return;
    const requested = requestedStatus ?? (live.phase === 'completed' ? 'completed' : 'paused');
    const unfinished = definition.steps.find(s => !live.visited.includes(s.id));
    const incomplete = live.skipped.length > 0 || definition.kind === 'complete' && !!unfinished;
    const stepId = requested === 'completed' && incomplete ? live.skipped[0] ?? unfinished?.id : definition.steps[live.index]?.id;
    if (!stepId) return;
    const updates: Record<string, TourProgress> = {};
    const record: TourProgress = { stepId, status: incomplete ? 'paused' : requested, skipped: live.skipped, visited: live.visited, updatedAt: Date.now() };
    updates[definition.id] = record;
    if (definition.kind === 'complete') {
      const nearby = new Set([definition.steps[live.index]?.chapterId, definition.steps[Math.max(0, live.index - 1)]?.chapterId]);
      for (const chapterId of nearby) {
        const chapter = tourCatalog.find(t => t.id === chapterId && t.kind === 'feature');
        if (!chapter) continue;
        const steps = definition.steps.filter(s => s.chapterId === chapter.id);
        const visited = steps.filter(s => live.visited.includes(s.id)).map(s => s.audioSource?.stepId ?? s.id);
        const skipped = steps.filter(s => live.skipped.includes(s.id)).map(s => s.audioSource?.stepId ?? s.id);
        if (definition.steps[live.index]?.chapterId !== chapter.id && !visited.length && !skipped.length) continue;
        const completed = visited.length === steps.length && !skipped.length;
        if (!completed && records[chapter.id]?.status === 'completed') continue;
        const cursor = definition.steps[live.index];
        const firstIncomplete = steps.find(s => !live.visited.includes(s.id));
        const selected = cursor?.chapterId === chapter.id ? cursor : firstIncomplete ?? steps[steps.length - 1];
        updates[chapter.id] = { stepId: selected.audioSource?.stepId ?? selected.id, status: completed ? 'completed' : 'paused', skipped, visited, updatedAt: Date.now() };
      }
    }
    for (const [id, value] of Object.entries(updates)) {
      const target = id === definition.id ? definition : tourCatalog.find(t => t.id === id)!;
      void saveProgress(who, target, value);
    }
    setProgress(p => ({ ...p, ...updates }));
  }, []);
  const exit = useCallback(() => { startRequest.current++; persist(); tourNarration.stop(); dispatch({ type: 'exit' }); setHub(null); setInvitation(null); releaseOverlay('tour'); }, [persist]);
  const pause = useCallback(() => {
    startRequest.current++;
    if (!['idle', 'paused', 'completed'].includes(current.current.state.phase)) {
      persist(); tourNarration.stop(); dispatch({ type: 'pause' }); releaseOverlay('tour');
    }
    setHub(null); setInvitation(null);
  }, [persist]);
  const close = useCallback(() => { startRequest.current++; setHub(null); setInvitation(null); releaseOverlay('tour'); }, []);

  useEffect(() => {
    startRequest.current++;
    tourNarration.stop(); dispatch({ type: 'exit' }); setHub(null); setInvitation(null); releaseOverlay('tour');
    setActiveDefinition(null); setProgress({}); setAccess({}); setPreferences(defaultPreferences); setHydrated('');
    if (!identity) return;
    let cancelled = false;
    const who = identity;
    void (async () => {
      const screenReader = await AccessibilityInfo.isScreenReaderEnabled().catch(() => true);
      const [prefs, records, decisions] = await Promise.all([readPreferences(who, !screenReader), Promise.all(tourCatalog.filter(t => t.portal === who.portal).map(async t => [t.id, await readProgress(who, t)] as const)), readTourAccess(who)]);
      if (cancelled || current.current.key !== key) return;
      setPreferences(prefs); setProgress(Object.fromEntries(records)); setAccess(decisions); setHydrated(key);
    })();
    // Invalidate the latest request, including starts issued after this effect ran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true; startRequest.current++; };
    // Only identity changes should reset playback; UI language is independent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready || !identity || hydrated !== key || !/\/(home|dashboard)$/.test(route)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const inviteKey = invitationKey(identity);
    const offer = async () => {
      if (cancelled || invitedProfiles.current.has(inviteKey) || current.current.key !== key || tourBlocked() || identity.portal === 'driver' && tourCondition('driver.active-trip') === true || overlayHolder() || current.current.state.phase !== 'idle') return;
      if (await invitationSeen(identity)) { invitedProfiles.current.add(inviteKey); return; }
      if (cancelled || invitedProfiles.current.has(inviteKey) || tourBlocked() || overlayHolder() || current.current.key !== key || identity.portal === 'driver' && tourCondition('driver.active-trip') === true) return;
      if (acquireOverlay('tour')) { invitedProfiles.current.add(inviteKey); setInvitation(identity.portal); void markInvited(identity); }
    };
    timer = setTimeout(() => void offer(), 2200);
    const conditions = subscribeTourConditions(() => {
      if (identity.portal !== 'driver') return;
      if (tourCondition('driver.active-trip') === true && current.current.invitation) { setInvitation(null); releaseOverlay('tour'); }
      else if (tourCondition('driver.active-trip') !== true && !overlayHolder()) { clearTimeout(timer); timer = setTimeout(() => void offer(), 1500); }
    });
    const unsubscribe = subscribeOverlay(() => { if (!overlayHolder()) { clearTimeout(timer); timer = setTimeout(() => void offer(), 1500); } });
    return () => { cancelled = true; clearTimeout(timer); unsubscribe(); conditions(); };
  }, [ready, hydrated, key, route, identity]);

  useEffect(() => {
    const app = AppState.addEventListener('change', value => { if (value !== 'active') pause(); });
    const blockers = subscribeTourBlockers(() => { if (tourBlocked()) pause(); });
    const keyboard = Keyboard.addListener('keyboardDidShow', () => setLayoutRevision(v => v + 1));
    const hide = Keyboard.addListener('keyboardDidHide', () => setLayoutRevision(v => v + 1));
    return () => { app.remove(); blockers(); keyboard.remove(); hide.remove(); tourNarration.stop(); releaseOverlay('tour'); };
  }, [pause]);

  useEffect(() => {
    if (['presenting', 'action', 'navigating', 'missing', 'paused'].includes(state.phase)) persist();
    if (state.phase === 'completed') persist('completed');
  }, [state.phase, state.index, state.generation, persist]);

  const canAccess = useCallback(async (definition: TourDefinition, selected: TourStep) => {
    const live = current.current;
    if (!live.ready || !portalAllowed(definition.portal, live.roles) || !hasPermission(selected.permission)) return false;
    if (selected.featureFlag && live.featureFlags[selected.featureFlag] === false) return false;
    const requirement = selected.portalSetting ? `portal-setting:${selected.portalSetting}` : selected.feature;
    if (!requirement) return true;
    const cached = live.access[requirement];
    if (cached && cached.expiresAt > Date.now()) return cached.allowed;
    try {
      const result = selected.portalSetting === 'staff.payslips_enabled'
        ? { allowed: await StaffService.getPortalConfig().then(config => config.payslips_enabled !== false).catch(() => true) }
        : await FeatureAccessApi.fetchFeatureAccess(selected.feature!);
      if (current.current.key !== live.key) return false;
      const decisions = { ...current.current.access, [requirement]: { allowed: result.allowed, expiresAt: Date.now() + 10 * 60 * 1000 } };
      current.current.access = decisions; setAccess(decisions);
      if (live.identity) void saveTourAccess(live.identity, decisions);
      return result.allowed;
    } catch { return false; }
  }, [hasPermission]);

  useEffect(() => {
    if (!identity || hydrated !== key) return;
    const checks = new Map<string, { definition: TourDefinition; selected: TourStep }>();
    for (const definition of tourCatalog.filter(t => t.portal === identity.portal && t.steps.every(s => hasPermission(s.permission)))) {
      for (const selected of definition.steps) {
        const requirement = selected.portalSetting ? `portal-setting:${selected.portalSetting}` : selected.feature;
        if (requirement && (!selected.featureFlag || featureFlags[selected.featureFlag] !== false)) checks.set(requirement, { definition, selected });
      }
    }
    void Promise.allSettled([...checks.values()].map(({ definition, selected }) => canAccess(definition, selected)));
  }, [identity, hydrated, key, hasPermission, canAccess, featureFlags]);

  useEffect(() => {
    if (!tour || !step || !['navigating', 'presenting', 'action'].includes(state.phase)) return;
    if (tourBlocked() || !current.current.ready) { pause(); return; }
    if (state.phase !== 'navigating' && canonicalRoute(step.route) !== route) { pause(); return; }
    let cancelled = false;
    const generation = state.generation;
    const run = async () => {
      if (state.phase === 'navigating') {
        tourNarration.stop();
        const allowed = await canAccess(tour, step);
        if (cancelled) return;
        if (!allowed) { dispatch({ type: 'missing', generation, reason: 'access' }); return; }
        if (!acquireOverlay('tour')) { pause(); return; }
        if (canonicalRoute(step.route) !== route) {
          const staff = getStaffPortalSession();
          const navigation = step.route.startsWith('/staff/') && staff.staffId && staff.actorUserId === current.current.identity?.userId
            ? { pathname: step.route, params: { staffId: staff.staffId, viewAsName: staff.viewAsName, viewAsUserId: staff.userId, viewAsActorId: staff.actorUserId } } : step.route;
          router.push(navigation as never);
          await sleep(8000);
          if (!cancelled) dispatch({ type: 'missing', generation, reason: 'target' });
          return;
        }
      }
      const until = Date.now() + 8000;
      let revealed = false;
      while (!cancelled && Date.now() < until) {
        if (tourBlocked()) { pause(); return; }
        if (step.prerequisite && tourCondition(step.prerequisite) !== true) {
          dispatch({ type: 'missing', generation, reason: 'prerequisite' }); return;
        }
        const target = findTarget(route, step.target);
        if (target) {
          if (!revealed) { await target.reveal?.(); revealed = true; }
          const rect = await target.measure();
          if (cancelled) return;
          if (rect && rect.y + rect.height > 0 && rect.y < dimensions.height && rect.x < dimensions.width && rect.x + rect.width > 0) {
            dispatch({ type: 'ready', generation, rect, host: target.host, action: !!step.event }); return;
          }
        }
        await sleep(160);
      }
      if (!cancelled) dispatch({ type: 'missing', generation, reason: 'target' });
    };
    void run();
    // Re-measure live controls while the user scrolls or native layout shifts.
    const timer = state.phase === 'presenting' || state.phase === 'action' ? setInterval(() => {
      const target = findTarget(route, step.target);
      if (!target) { tourNarration.stop(); dispatch({ type: 'missing', generation, reason: 'target' }); return; }
      void target.measure().then(rect => {
        if (cancelled) return;
        if (rect && rect.y + rect.height > 0 && rect.y < dimensions.height && rect.x < dimensions.width && rect.x + rect.width > 0) dispatch({ type: 'ready', generation, rect, host: target.host, action: !!step.event });
        else { tourNarration.stop(); dispatch({ type: 'missing', generation, reason: 'target' }); }
      });
    }, 250) : undefined;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [state.generation, state.phase, route, tour, step, dimensions.height, dimensions.width, layoutRevision, canAccess, pause, router, ready]);

  const next = useCallback((skip = false, completedEvent = false) => {
    const live = current.current.state;
    const definition = current.current.activeDefinition;
    if (!definition || !(live.phase === 'presenting' || live.phase === 'action' && (skip || completedEvent) || live.phase === 'missing' && skip)) return;
    tourNarration.stop();
    if (live.index + 1 >= definition.steps.length) {
      dispatch({ type: 'move', index: live.index, skipId: skip ? definition.steps[live.index].id : undefined, resolvedId: skip ? undefined : definition.steps[live.index].id });
      dispatch({ type: 'complete' });
    } else dispatch({ type: 'move', index: live.index + 1, skipId: skip ? definition.steps[live.index].id : undefined, resolvedId: skip ? undefined : definition.steps[live.index].id });
  }, []);
  useEffect(() => subscribeTourEvents(event => {
    const live = current.current.state;
    const active = current.current.activeDefinition?.steps[live.index];
    if (live.phase === 'action' && active?.event === event) { Keyboard.dismiss(); next(false, true); }
  }), [next]);
  useEffect(() => {
    if (!tour || !step || !['presenting', 'action'].includes(state.phase) || !preferences.narration) return;
    const token = state.generation;
    void tourNarration.play(tour, step, locale, preferences.rate, () => {
      if (current.current.state.generation === token && current.current.preferences.autoAdvance && !step.event) next();
    });
    return () => tourNarration.stop();
  }, [tour, step, state.generation, state.phase, locale, preferences.narration, preferences.rate, next]);

  const open = useCallback((requested?: TourPortal) => {
    const who = current.current.identity;
    if (!who || !TOUR_ENABLED || tourBlocked() || requested && requested !== who.portal) return;
    startRequest.current++; persist(); tourNarration.stop(); dispatch({ type: 'exit' });
    if (!acquireOverlay('tour')) return;
    setInvitation(null); setHub(who.portal); invitedProfiles.current.add(invitationKey(who)); void markInvited(who);
  }, [persist]);
  const start = useCallback(async (id: string, restart = false) => {
    const base = tourCatalog.find(t => t.id === id);
    const definition = guidesRef.current.find(t => t.id === id) ?? (base?.kind !== 'complete' ? base : undefined);
    const live = current.current;
    if (!TOUR_ENABLED || !live.ready || !definition || !live.identity || definition.portal !== live.identity.portal || tourBlocked()) return;
    const request = ++startRequest.current;
    const record = restart ? null : await readProgress(live.identity, base ?? definition);
    if (startRequest.current !== request || current.current.key !== live.key || tourBlocked()) return;
    if (!acquireOverlay('tour')) return;
    setHub(null); setInvitation(null);
    const newlyAvailable = definition.kind === 'complete' && record?.status === 'completed' && definition.steps.some(s => !record.visited?.includes(s.id));
    const resuming = record?.status === 'paused' || newlyAvailable;
    const savedIndex = definition.steps.findIndex(s => s.id === record?.stepId);
    const index = resuming ? savedIndex >= 0 && !newlyAvailable ? savedIndex : Math.max(0, definition.steps.findIndex(s => !record?.visited?.includes(s.id))) : 0;
    setActiveDefinition(definition);
    dispatch({ type: 'start', tourId: id, index, skipped: resuming ? record?.skipped.filter(id => definition.steps.some(s => s.id === id)) : [], visited: resuming ? record?.visited : [] });
  }, []);
  const updatePreferences = useCallback((patch: Partial<TourPreferences>) => {
    const nextPreferences = { ...current.current.preferences, ...patch };
    setPreferences(nextPreferences);
    if (current.current.identity) void savePreferences(current.current.identity, nextPreferences);
  }, []);
  const value = useMemo<TourContextValue>(() => ({
    enabled: TOUR_ENABLED && ready, hub, invitation, state, tour, step, locale, preferences, progress, guides, currentRoute: route,
    jumpToChapter: id => {
      const definition = current.current.activeDefinition;
      const index = definition?.steps.findIndex(s => s.chapterId === id) ?? -1;
      if (index < 0 || definition?.kind !== 'complete' || tourBlocked()) return;
      persist(); tourNarration.stop(); dispatch({ type: 'move', index });
    },
    open, close, dismissInvite: close, start, resume: start, next, exit, updatePreferences,
    back: () => { tourNarration.stop(); dispatch({ type: 'move', index: Math.max(0, current.current.state.index - 1) }); },
    retry: () => { if (!tourBlocked() && acquireOverlay('tour')) dispatch({ type: 'retry' }); },
  }), [hub, invitation, state, tour, step, locale, preferences, progress, guides, open, close, start, next, exit, updatePreferences, route, persist, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
