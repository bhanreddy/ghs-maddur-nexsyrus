import TourPageContent from '../admin/admissions/index';
import { TourTarget } from '@/src/features/app-tour';
export default function TourPage() {
  return <TourTarget id="screen.staff-admissions.overview" style={{ flex: 1 }}><TourTarget id="screen.staff-admissions.workspace" style={{ flex: 1 }}><TourPageContent /></TourTarget></TourTarget>;
}
