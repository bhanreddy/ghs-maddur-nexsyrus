import TourPageContent from '../accounts/addStaff';
import { TourTarget } from '@/src/features/app-tour';
export default function TourPage() {
  return <TourTarget id="screen.admin-add-staff.overview" style={{ flex: 1 }}><TourTarget id="screen.admin-add-staff.workspace" style={{ flex: 1 }}><TourPageContent /></TourTarget></TourTarget>;
}
