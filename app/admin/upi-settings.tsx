import { TourTarget } from '@/src/features/app-tour';
import UPISettingsScreen from '../../src/screens/UPISettingsScreen';

export default function TourPage() { return <TourTarget id="screen.admin-upi-settings.overview" style={{ flex: 1 }}><TourTarget id="screen.admin-upi-settings.workspace" style={{ flex: 1 }}><UPISettingsScreen /></TourTarget></TourTarget>; }
