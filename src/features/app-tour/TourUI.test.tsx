import React from 'react';
import { Text } from 'react-native';
import { TourOverlayHost } from './TourUI';
import { acquireOverlay, releaseOverlay } from '../popups/overlayLock';
const { create, act } = require('react-test-renderer');
const mockTour = {
  hub: null, invitation: null, locale: 'en', state: { phase: 'presenting', index: 0, generation: 1, host: 'root', rect: { x: 20, y: 80, width: 200, height: 60 }, skipped: [] },
  tour: { title: { en: 'Welcome' }, steps: [{}, {}] }, step: { body: { en: 'Read the instructions.' }, title: { en: 'Your guide' }, narration: { en: ['Read the instructions.'] }, target: 'student.launcher' },
  preferences: { narration: false, autoAdvance: false, rate: 1 }, exit: jest.fn(), close: jest.fn(), back: jest.fn(), next: jest.fn(), open: jest.fn(), updatePreferences: jest.fn(),
};
jest.mock('./TourProvider', () => ({ useAppTour: () => mockTour }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: require('../../theme/types').defaultLightTheme }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('./narration', () => ({ tourNarration: { subscribe: () => () => {}, getSnapshot: () => mockAudio, stop: jest.fn() } }));
const mockAudio = { status: 'idle', sentence: 0 };
let tree: any;
beforeEach(async () => { jest.useFakeTimers(); mockTour.state.phase = 'presenting'; acquireOverlay('tour'); await act(async () => { tree = create(<TourOverlayHost />); }); });
afterEach(async () => { await act(async () => tree.unmount()); releaseOverlay('tour'); jest.useRealTimers(); });
test('guide navigation stays rendered outside the scrollable instructions', () => {
  const labels = tree.root.findAllByType(Text).map((node: any) => node.props.children);
  expect(labels).toEqual(expect.arrayContaining(['Back', 'Next', 'Skip step', 'Exit']));
});
test('action steps keep manual Next disabled while Skip and Exit remain available', async () => {
  mockTour.state.phase = 'action'; await act(async () => tree.update(<TourOverlayHost />));
  const button = (label: string) => tree.root.findAll((node: any) => node.props.accessibilityRole === 'button').find((node: any) => node.findAllByType(Text).some((text: any) => text.props.children === label));
  expect(button('Next').props.accessibilityState.disabled).toBe(true);
  expect(button('Skip step').props.accessibilityState.disabled).toBe(false);
  expect(button('Exit').props.accessibilityState.disabled).toBe(false);
});
