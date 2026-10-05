import { TourTarget } from '@/src/features/app-tour';
import ApplyLeave from '../staff/leaves';

export default function AccountsLeaves() {
  return <TourTarget id="screen.accounts-leaves.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-leaves.workspace" style={{ flex: 1 }}><ApplyLeave /></TourTarget></TourTarget>;
}
