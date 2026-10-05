import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/hooks/useTheme';
import ScreenLayout from '../src/components/ScreenLayout';
import StudentSubpageHeader from '../src/components/StudentSubpageHeader';
import PopupHistoryScreen from '../src/features/popups/screens/PopupHistoryScreen';

export default function UpdatesRoute() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <TourTarget id="screen.updates.workspace" style={{ flex: 1 }}><ScreenLayout>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <TourTarget id="screen.updates.overview"><StudentSubpageHeader
          title={t('studentUpdates.title')}
          subtitle={t('studentUpdates.subtitle')}
          onBack={() => router.back()}
        /></TourTarget>
        <PopupHistoryScreen embedded />
      </View>
    </ScreenLayout></TourTarget>
  );
}
