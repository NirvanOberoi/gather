import { Alert, Platform } from 'react-native';

/** Cross-platform destructive confirmation dialog. */
export function confirm(title: string, message: string, ok: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: ok, style: 'destructive', onPress: onOk }]);
}
