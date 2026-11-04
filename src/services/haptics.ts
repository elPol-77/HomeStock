import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { settings } from './settings';

function enabled() {
  return Platform.OS !== 'web' && settings().haptics;
}

export const haptic = {
  tap() {
    if (enabled()) Haptics.selectionAsync().catch(() => {});
  },
  light() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
