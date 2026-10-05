import TourPageContent from '../../src/features/student-login-qr/StudentQrManagementScreen';
import { TourTarget } from '@/src/features/app-tour';
export default function TourPage() {
  return <TourTarget id="screen.accounts-student-login-qr.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-student-login-qr.workspace" style={{ flex: 1 }}><TourPageContent /></TourTarget></TourTarget>;
}
