import { TourTarget } from '@/src/features/app-tour';
import HostelManagementScreen from '../../src/components/hostel/HostelManagementScreen';

export default function AccountsHostelScreen() {
  return <TourTarget id="screen.accounts-hostel.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-hostel.workspace" style={{ flex: 1 }}><HostelManagementScreen scope="accounts" /></TourTarget></TourTarget>;
}
