import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { printHtmlOnWeb } from './pdfGenerator';
import { printAssessmentMarks } from './assessmentMarksPrint';

jest.mock('./pdfGenerator', () => ({ printHtmlOnWeb: jest.fn() }));
jest.mock('expo-print', () => ({ printAsync: jest.fn(), Orientation: { landscape: 'landscape' } }));

describe('assessment marks printing', () => {
  const originalOS = Platform.OS;
  afterEach(() => { Object.defineProperty(Platform, 'OS', { value: originalOS }); jest.clearAllMocks(); });

  it('prints only the supplied register HTML on web', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    await printAssessmentMarks('<html>FA register</html>');
    expect(printHtmlOnWeb).toHaveBeenCalledWith('<html>FA register</html>');
    expect(Print.printAsync).not.toHaveBeenCalled();
  });

  it('uses landscape printing on native', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    await printAssessmentMarks('<html>SA register</html>');
    expect(Print.printAsync).toHaveBeenCalledWith({ html: '<html>SA register</html>', orientation: 'landscape' });
  });
});
