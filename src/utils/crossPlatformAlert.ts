import { showAlert } from '../components/CustomAlert';

export type AlertButtonRN = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

/**
 * Drop-in replacement for Alert.alert that renders the premium claymorphic
 * CustomAlert on every platform (requires CustomAlertProvider in app/_layout).
 *
 * Native was previously routed to RN's OS-native Alert.alert, which looks basic
 * and — on RN Web — never even renders. Routing all platforms through
 * CustomAlert gives one consistent, on-brand dialog everywhere.
 */
export function alertCompat(title: string, message?: string, buttons?: AlertButtonRN[]): void {
  void showAlert({
    type: buttons && buttons.length > 1 ? 'confirm' : 'info',
    title,
    message: message ?? '',
    buttons:
      buttons && buttons.length > 0
        ? buttons.map((b) => ({
            text: b.text,
            style: b.style,
            onPress: b.onPress,
          }))
        : undefined,
  });
}
