import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View } from 'react-native';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import HeroSlidesManager from '../../src/features/hero-slides/HeroSlidesManager';

export default function AdminHeroSlidesScreen() {
  const { theme } = useTheme();
  return (
    <TourTarget id="screen.admin-hero-slides.workspace" native><View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TourTarget id="screen.admin-hero-slides.overview"><AdminHeader title="Slide Manager" showBackButton /></TourTarget>
      <HeroSlidesManager />
    </View></TourTarget>
  );
}
