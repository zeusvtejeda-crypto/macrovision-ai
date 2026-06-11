import React, { useState, forwardRef } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  isPassword?: boolean;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  {
    label,
    error,
    hint,
    leftIcon,
    rightIcon,
    onRightIconPress,
    isPassword = false,
    ...props
  },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const borderAnim = useSharedValue(0);

  const animatedBorder = useAnimatedStyle(() => ({
    borderColor: borderAnim.value === 1 ? '#10b981' : error ? '#ef4444' : '#2a2a2a',
  }));

  const handleFocus = () => {
    setIsFocused(true);
    borderAnim.value = withTiming(1, { duration: 200 });
    props.onFocus?.(null as any);
  };

  const handleBlur = () => {
    setIsFocused(false);
    borderAnim.value = withTiming(0, { duration: 200 });
    props.onBlur?.(null as any);
  };

  return (
    <View className="w-full mb-4">
      {label && (
        <Text className="text-text-secondary text-sm font-medium mb-1.5 ml-0.5">
          {label}
        </Text>
      )}

      <Animated.View
        style={animatedBorder}
        className="flex-row items-center bg-background-elevated rounded-2xl border px-4"
      >
        {leftIcon && (
          <Ionicons
            name={leftIcon as any}
            size={18}
            color={isFocused ? '#10b981' : '#52525b'}
            style={{ marginRight: 10 }}
          />
        )}

        <TextInput
          ref={ref}
          {...props}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={isPassword && !showPassword}
          placeholderTextColor="#52525b"
          style={[
            {
              flex: 1,
              color: '#ffffff',
              fontSize: 16,
              paddingVertical: 16,
              fontFamily: 'System',
            },
            props.style,
          ]}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#52525b"
            />
          </TouchableOpacity>
        )}

        {rightIcon && !isPassword && (
          <TouchableOpacity onPress={onRightIconPress}>
            <Ionicons name={rightIcon as any} size={20} color="#52525b" />
          </TouchableOpacity>
        )}
      </Animated.View>

      {error && (
        <Text className="text-red-400 text-xs mt-1.5 ml-1">{error}</Text>
      )}
      {hint && !error && (
        <Text className="text-text-muted text-xs mt-1.5 ml-1">{hint}</Text>
      )}
    </View>
  );
});
