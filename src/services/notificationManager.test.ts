import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { notificationManager } from './notificationManager';

jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn() }));
jest.mock('@react-native-firebase/messaging', () => ({}));
jest.mock('./apiClient', () => ({ api: {} }));
jest.mock('./pushFanout', () => ({ registerAllVaultedAccountsForPush: jest.fn() }));
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  return Object.defineProperty(Object.create(native), 'Platform', {
    value: { ...native.Platform, OS: 'android', Version: 35 },
  });
});
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getNotificationChannelsAsync: jest.fn().mockResolvedValue([{ id: 'voice_alert_custom' }]),
  deleteNotificationChannelAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('local-notification'),
  AndroidImportance: { MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { HIGH: 1 },
}));

let manager: typeof notificationManager;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  const Manager = notificationManager.constructor as new () => typeof notificationManager;
  manager = new Manager();
});

test('upgrading channels adds the diary sound without deleting existing notification settings', async () => {
  await AsyncStorage.setItem('notification_channel_version', '3');
  await manager.createChannels();

  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('diary_alert_custom', expect.objectContaining({
    name: 'Diary Alerts', sound: 'diary_alert.wav',
  }));
  expect(Notifications.deleteNotificationChannelAsync).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('notification_channel_version')).toBe('4');
  const channelCalls = (Notifications.setNotificationChannelAsync as jest.Mock).mock.calls.length;
  await manager.createChannels();
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(channelCalls);
});

test.each(['diary_alert_custom', 'voice_alert_custom', 'emergency_custom'])(
  'diary foreground notifications use their dedicated sound even when payload channel is %s',
  async (channelId) => {
    await manager.displayNotification({ data: {
      type: 'DIARY_UPDATED', title: 'Diary ready', body: 'Please check the diary.',
      channelId, sound: 'emergency', deepLink: '/Screen/diary',
    } }, 'foreground');

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ sound: 'diary_alert.wav', data: expect.objectContaining({ type: 'DIARY_UPDATED' }) }),
      trigger: { channelId: 'diary_alert_custom' },
    }));
  },
);

test('background data-only diary notifications use the dedicated diary channel', async () => {
  await manager.displayNotification({ data: { type: 'DIARY_UPDATED', title: 'Diary ready' } }, 'background');
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('diary_alert_custom', expect.objectContaining({ sound: 'diary_alert.wav' }));
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ sound: 'diary_alert.wav' }),
    trigger: { channelId: 'diary_alert_custom' },
  }));
});

test('background diary alerts rendered by the OS are not displayed a second time', async () => {
  await manager.displayNotification({
    notification: { title: 'Diary ready', body: 'Please check the diary.' },
    data: { type: 'DIARY_UPDATED', channelId: 'diary_alert_custom', sound: 'diary_alert' },
  }, 'background');
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('complaint notifications keep their existing emergency sound', async () => {
  await manager.displayNotification({ data: {
    type: 'COMPLAINT_CREATED', title: 'New complaint', channelId: 'emergency_custom', sound: 'emergency',
  } }, 'foreground');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ sound: 'emergency.wav' }),
    trigger: { channelId: 'emergency_custom' },
  }));
});
