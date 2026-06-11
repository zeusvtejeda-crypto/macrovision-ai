import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface Props {
  label: string;
  consumed: number;
  goal: number;
  unit?: string;
  color: string;
}

export function MacroBar({ label, consumed, goal, unit = 'g', color }: Props) {
  const percent = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const progressAnim = useSharedValue(0);

  useEffect(() => {
    progressAnim.value = withTiming(percent, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [percent]);

  const animatedWidth = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  const isOver = consumed > goal;

  return (
    <View className="mb-4">
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-text-secondary text-sm font-medium">{label}</Text>
        <Text className="text-text-primary text-sm font-semibold">
          <Text style={{ color }}>{Math.round(consumed)}</Text>
          <Text className="text-text-muted"> / {Math.round(goal)}{unit}</Text>
        </Text>
      </View>

      <View className="h-2 bg-background-elevated rounded-full overflow-hidden">
        <Animated.View
          style={[
            animatedWidth,
            {
              height: '100%',
              backgroundColor: isOver ? '#ef4444' : color,
              borderRadius: 999,
            },
          ]}
        />
      </View>
    </View>
  );
}
