import React from 'react';
import { View } from 'react-native';
import { TourTarget } from './targets';
import { findTarget } from './registry';
const { create, act } = require('react-test-renderer');
jest.mock('expo-router', () => ({ usePathname: () => '/home' }));
test('nested native targets preserve the original ref and measure the same control', async () => {
  const original = React.createRef<View>();
  let tree: any;
  await act(async () => { tree = create(<TourTarget id="student.outer" native active><TourTarget id="student.inner" native active><View ref={original} /></TourTarget></TourTarget>); });
  expect(original.current).not.toBeNull();
  original.current!.measureInWindow = callback => callback(10, 20, 90, 44);
  expect(await findTarget('/home', 'student.inner')!.measure()).toEqual({ x: 10, y: 20, width: 90, height: 44 });
  expect(await findTarget('/home', 'student.outer')!.measure()).toEqual({ x: 10, y: 20, width: 90, height: 44 });
  await act(async () => tree.unmount());
  expect(findTarget('/home', 'student.inner')).toBeUndefined();
  expect(findTarget('/home', 'student.outer')).toBeUndefined();
});
