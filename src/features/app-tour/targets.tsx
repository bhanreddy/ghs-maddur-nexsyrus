import React, { createContext, useContext, useEffect, useRef, useCallback, forwardRef } from 'react';
import { Platform, ScrollView, View, type ScrollViewProps, type ViewProps } from 'react-native';
import { usePathname } from 'expo-router';
import { NavigationContext } from '@react-navigation/native';
import { canonicalRoute } from './state';
import { emitTourEvent, registerTarget, setTourCondition } from './registry';
import type { TourRect } from './types';

export const TourHostContext = createContext('root');
const NoNavigationContext = createContext<React.ContextType<typeof NavigationContext>>(undefined);
type Measurable = { measureInWindow: (fn: (x: number, y: number, w: number, h: number) => void) => void };
export function measureView(source: Measurable | ScrollView | null): Promise<TourRect | null> {
  const view = source && 'getNativeScrollRef' in source ? source.getNativeScrollRef() as Measurable : source as Measurable | null;
  return new Promise(resolve => {
    if (!view?.measureInWindow) return resolve(null);
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 250);
    view.measureInWindow((x, y, width, height) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve(width > 0 && height > 0 && [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null);
    });
  });
}
const ScrollContext = createContext<((view: Measurable) => Promise<void>) | null>(null);
/** Native=true preserves the existing layout/ref of a native control. Custom
 * components get a non-collapsible measuring wrapper instead. */
type TourTargetProps = {
  id: string; children: React.ReactElement<any>; native?: boolean; event?: string; style?: ViewProps['style']; readOnly?: boolean; active?: boolean;
};
export const TourTarget = forwardRef<View, TourTargetProps>(function TourTarget({ id, children, native = false, event, style, readOnly = false, active }, forwardedRef) {
  const ref = useRef<View | null>(null);
  const enteredText = useRef('');
  const route = canonicalRoute(usePathname?.() ?? '/');
  const navigation = useContext(NavigationContext ?? NoNavigationContext);
  const focused = React.useSyncExternalStore(useCallback((fn: () => void) => {
    if (!navigation) return () => {};
    const focus = navigation.addListener('focus', fn); const blur = navigation.addListener('blur', fn);
    return () => { focus(); blur(); };
  }, [navigation]), () => navigation?.isFocused() ?? false);
  const host = useContext(TourHostContext);
  const reveal = useContext(ScrollContext);
  useEffect(() => {
    if (!(active ?? focused)) return;
    return registerTarget({ id, route, host, measure: () => measureView(ref.current), reveal: async () => {
      if (ref.current && reveal) await reveal(ref.current);
      else if (Platform.OS === 'web') (ref.current as unknown as HTMLElement | null)?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    } });
  }, [id, route, host, focused, reveal, active]);
  const props: Record<string, unknown> = {};
  if (event && !readOnly) {
    if (children.props.onPress) props.onPress = (...args: unknown[]) => {
      if (children.props.disabled) return;
      children.props.onPress(...args);
      emitTourEvent(event);
    };
    if (children.props.onChangeText) {
      props.onChangeText = (value: string) => { enteredText.current = value; children.props.onChangeText(value); };
      props.onSubmitEditing = (value: { nativeEvent: { text?: string } }) => {
        children.props.onSubmitEditing?.(value);
        if ((value.nativeEvent.text ?? enteredText.current).trim()) emitTourEvent(event);
      };
    }
  }
  if (native) {
    props.dataSet = { ...children.props.dataSet, tourTarget: id };
    props.collapsable = false;
    props.ref = (value: View | null) => {
      ref.current = value;
      if (typeof forwardedRef === 'function') forwardedRef(value);
      else if (forwardedRef) forwardedRef.current = value;
      const original = children.props.ref;
      if (typeof original === 'function') original(value);
      else if (original) original.current = value;
    };
    return React.cloneElement(children, props);
  }
  return <View ref={value => {
    ref.current = value;
    if (typeof forwardedRef === 'function') forwardedRef(value);
    else if (forwardedRef) forwardedRef.current = value;
  }} collapsable={false} {...{ dataSet: { tourTarget: id } }} style={style}>{React.cloneElement(children, props)}</View>;
});

export const TourScrollView = forwardRef<ScrollView, ScrollViewProps>(function TourScrollView({ children, onScroll, ...props }, forwardedRef) {
  const ref = useRef<ScrollView | null>(null);
  const offset = useRef(0);
  const reveal = useCallback(async (view: Measurable) => {
    const [target, box] = await Promise.all([measureView(view), measureView(ref.current)]);
    if (!target || !box) return;
    if (target.y < box.y + 12 || target.y + target.height > box.y + box.height * 0.4) {
      ref.current?.scrollTo({ y: Math.max(0, offset.current + target.y - box.y - 24), animated: false });
    }
  }, []);
  return <ScrollContext.Provider value={reveal}><ScrollView {...props} ref={value => {
    ref.current = value;
    if (typeof forwardedRef === 'function') forwardedRef(value);
    else if (forwardedRef) forwardedRef.current = value;
  }} scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}>
    {children}
  </ScrollView></ScrollContext.Provider>;
});
export function TourCondition({ name, available }: { name: string; available: boolean }) {
  useEffect(() => { setTourCondition(name, available); return () => setTourCondition(name, false); }, [name, available]);
  return null;
}
