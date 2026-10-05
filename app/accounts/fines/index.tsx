import TourPageContent from '../../../src/features/fines/FinesAccountsScreen';
import { TourTarget } from '@/src/features/app-tour';
export default function TourPage() {
  return <TourTarget id="screen.accounts-fines.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-fines.workspace" style={{ flex: 1 }}><TourPageContent /></TourTarget></TourTarget>;
}
