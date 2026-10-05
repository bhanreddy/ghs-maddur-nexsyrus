import { TourTarget } from '@/src/features/app-tour';
import AdminExams from '../admin/exams';

export default function AccountsExams() {
  return <TourTarget id="screen.accounts-exams.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-exams.workspace" style={{ flex: 1 }}><AdminExams /></TourTarget></TourTarget>;
}
