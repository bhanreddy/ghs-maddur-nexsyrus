import { TourTarget } from '@/src/features/app-tour';
import OmrPrintSheetsScreen from '../../../src/features/omr/OmrPrintSheetsScreen';

export default function AdminOmrPrintSheets() {
  return <TourTarget id="screen.admin-omr-print.overview" style={{ flex: 1 }}><TourTarget id="screen.admin-omr-print.workspace" style={{ flex: 1 }}><OmrPrintSheetsScreen /></TourTarget></TourTarget>;
}
