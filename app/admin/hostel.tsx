import { TourTarget } from '@/src/features/app-tour';
import HostelManagementScreen from '../../src/components/hostel/HostelManagementScreen';

export default function AdminHostelScreen() {
  return <TourTarget id="screen.admin-hostel.overview" style={{ flex: 1 }}><TourTarget id="screen.admin-hostel.workspace" style={{ flex: 1 }}><HostelManagementScreen scope="admin" /></TourTarget></TourTarget>;
}
