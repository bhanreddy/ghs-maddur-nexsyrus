import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { printHtmlOnWeb } from './pdfGenerator';

/** Print the isolated assessment document; web users can also select Save as PDF. */
export async function printAssessmentMarks(html: string): Promise<void> {
  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html);
    return;
  }
  await Print.printAsync({ html, orientation: Print.Orientation.landscape });
}
