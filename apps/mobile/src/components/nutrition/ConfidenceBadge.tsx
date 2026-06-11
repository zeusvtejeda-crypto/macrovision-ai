import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  score: number; // 0-1
  label?: string;
  showWarning?: boolean;
  size?: 'sm' | 'md';
}

function getConfig(score: number) {
  if (score >= 0.85) return { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: 'checkmark-circle', text: 'Alta precisión' };
  if (score >= 0.65) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: 'warning', text: 'Precisión media' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: 'alert-circle', text: 'Baja precisión' };
}

export function ConfidenceBadge({ score, label, showWarning, size = 'md' }: Props) {
  const config = getConfig(score);
  const displayLabel = label || config.text;
  const percent = Math.round(score * 100);

  return (
    <View className="gap-2">
      <View
        className={`flex-row items-center self-start ${size === 'sm' ? 'px-2.5 py-1 rounded-xl' : 'px-3 py-1.5 rounded-2xl'} gap-1.5`}
        style={{ backgroundColor: config.bg }}
      >
        <Ionicons
          name={config.icon as any}
          size={size === 'sm' ? 12 : 14}
          color={config.color}
        />
        <Text
          className={`font-semibold ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
          style={{ color: config.color }}
        >
          {displayLabel} · {percent}%
        </Text>
      </View>

      {showWarning && (
        <View className="flex-row items-start gap-1.5 bg-amber-500/10 rounded-xl p-3">
          <Ionicons name="information-circle-outline" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
          <Text className="text-amber-400 text-xs flex-1 leading-5">
            La IA no está segura de este análisis. Revisa los ingredientes y porciones antes de guardar.
          </Text>
        </View>
      )}
    </View>
  );
}
