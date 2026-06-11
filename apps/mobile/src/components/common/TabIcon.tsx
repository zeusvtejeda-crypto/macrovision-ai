import React from 'react';
import { Ionicons } from '@expo/vector-icons';

const ICON_MAP: Record<string, { outline: string; filled: string }> = {
  home: { outline: 'home-outline', filled: 'home' },
  book: { outline: 'journal-outline', filled: 'journal' },
  camera: { outline: 'camera-outline', filled: 'camera' },
  search: { outline: 'search-outline', filled: 'search' },
  person: { outline: 'person-outline', filled: 'person' },
};

interface Props {
  name: string;
  color: string;
  size: number;
  focused?: boolean;
}

export function TabIcon({ name, color, size, focused = false }: Props) {
  const icons = ICON_MAP[name] || { outline: name, filled: name };
  const iconName = (focused ? icons.filled : icons.outline) as any;
  return <Ionicons name={iconName} size={size} color={color} />;
}
