import './src/services/notificationManager';
import { notificationManager } from './src/services/notificationManager';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';

// Background handler MUST be registered at the JS entry point.
// When the app is killed, Android starts a headless JS task that runs index.js.
// If this handler is registered later (e.g. in _layout.tsx), the headless task
// may never load the React component tree, and background notifications will be lost.
if (Platform.OS !== 'web') {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    await notificationManager.displayNotification(remoteMessage, 'background');
  });
}

import 'expo-router/entry';
