import { TourTarget } from '@/src/features/app-tour';
import OmrPrintSheetsScreen from '../../src/features/omr/OmrPrintSheetsScreen';

/**
 * Accountant access to print scanner-aligned OMR sheets.
 * Uses the same predefined template geometry as the staff OMR scanner.
 */
export default function AccountsOmrPrintSheets() {
  return <TourTarget id="screen.accounts-omr-print.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-omr-print.workspace" style={{ flex: 1 }}><OmrPrintSheetsScreen /></TourTarget></TourTarget>;
}
