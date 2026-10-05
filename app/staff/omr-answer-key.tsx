import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import OmrAnswerKeyScreen from '../admin/omr/answer-key';

export default function StaffOmrAnswerKey() {
  return <TourTarget id="screen.staff-omr-answer-key.overview" style={{ flex: 1 }}><TourTarget id="screen.staff-omr-answer-key.workspace" style={{ flex: 1 }}><OmrAnswerKeyScreen /></TourTarget></TourTarget>;
}
