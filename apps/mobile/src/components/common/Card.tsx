import React from 'react';
import { View, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  noPadding?: boolean;
  className?: string;
}

export function Card({ children, style, elevated = false, noPadding = false, className = '' }: Props) {
  return (
    <View
      className={`
        ${elevated ? 'bg-background-elevated' : 'bg-[#111111]'}
        ${noPadding ? '' : 'p-4'}
        rounded-3xl
        ${className}
      `}
      style={style}
    >
      {children}
    </View>
  );
}
