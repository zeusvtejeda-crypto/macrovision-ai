import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface MacroSegment {
  value: number;    // 0-100 porcentaje
  color: string;
  label: string;
}

interface Props {
  segments: MacroSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
  animate?: boolean;
}

export function MacroRing({
  segments,
  size = 180,
  strokeWidth = 14,
  centerLabel,
  centerSubLabel,
  animate = true,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  // Calcular offsets para cada segmento
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (animate) {
      progress.value = withTiming(1, {
        duration: 1200,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [segments]);

  let cumulativePercent = 0;
  const gap = 2; // px de espacio entre segmentos

  const segmentData = segments.map((seg) => {
    const percent = total > 0 ? seg.value / total : 0;
    const startPercent = cumulativePercent;
    cumulativePercent += percent;

    const dashArray = circumference * percent - gap;
    const dashOffset =
      circumference - circumference * startPercent - circumference / 4; // Rotar -90°

    return { ...seg, dashArray, dashOffset };
  });

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size}>
        <G>
          {/* Fondo gris */}
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke="#2a2a2a"
            strokeWidth={strokeWidth}
            fill="none"
          />

          {/* Segmentos de macros */}
          {segmentData.map((seg, i) => (
            <AnimatedCircle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${seg.dashArray} ${circumference}`}
              strokeDashoffset={seg.dashOffset}
              strokeLinecap="round"
              rotation={-90}
              origin={`${cx},${cy}`}
            />
          ))}
        </G>
      </Svg>

      {/* Etiqueta central */}
      {(centerLabel || centerSubLabel) && (
        <View
          className="absolute items-center justify-center"
          pointerEvents="none"
        >
          {centerLabel && (
            <Text className="text-white text-2xl font-bold">{centerLabel}</Text>
          )}
          {centerSubLabel && (
            <Text className="text-text-secondary text-xs mt-0.5">
              {centerSubLabel}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
