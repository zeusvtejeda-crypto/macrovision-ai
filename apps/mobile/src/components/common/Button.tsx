import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-background-elevated border border-background-border',
  ghost: 'bg-transparent',
  danger: 'bg-red-500',
};

const TEXT_VARIANTS: Record<Variant, string> = {
  primary: 'text-white font-semibold',
  secondary: 'text-text-primary font-semibold',
  ghost: 'text-primary font-semibold',
  danger: 'text-white font-semibold',
};

const SIZES: Record<Size, string> = {
  sm: 'py-2.5 px-4 rounded-xl',
  md: 'py-4 px-6 rounded-2xl',
  lg: 'py-5 px-8 rounded-2xl',
};

const TEXT_SIZES: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <AnimatedTouchable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={disabled || loading}
      style={[animatedStyle, style]}
      className={`
        ${VARIANTS[variant]}
        ${SIZES[size]}
        ${fullWidth ? 'w-full' : 'self-start'}
        ${disabled ? 'opacity-40' : 'opacity-100'}
        items-center justify-center flex-row
      `}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#fff' : '#10b981'}
          size="small"
        />
      ) : (
        <>
          {icon && <View className="mr-2">{icon}</View>}
          <Text className={`${TEXT_VARIANTS[variant]} ${TEXT_SIZES[size]}`}>
            {title}
          </Text>
        </>
      )}
    </AnimatedTouchable>
  );
}
