import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: IconName | string; size?: number; color: string }) {
  return <Ionicons name={name as IconName} size={size} color={color} />;
}
