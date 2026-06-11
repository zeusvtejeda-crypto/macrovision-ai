import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@store/authStore';
import { authService } from '@services/api/auth.service';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { setUser, setTokens } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const passwordRef = useRef<TextInput>(null);

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!email || !email.includes('@')) newErrors.email = 'Email inválido';
    if (!password || password.length < 6) newErrors.password = 'Contraseña muy corta';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const result = await authService.login({ email: email.trim(), password });
      await setTokens(result.tokens.accessToken, result.tokens.refreshToken);
      setUser(result.user as any);
    } catch (err: any) {
      Alert.alert(
        'Error de inicio de sesión',
        err.message || 'Revisa tu email y contraseña',
        [{ text: 'Entendido' }],
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-black"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header con gradiente */}
        <LinearGradient
          colors={['rgba(16,185,129,0.15)', 'transparent']}
          className="items-center pt-12 pb-10 px-6"
        >
          <View className="w-20 h-20 rounded-3xl bg-primary/20 items-center justify-center mb-5">
            <Text className="text-4xl">🥗</Text>
          </View>
          <Text className="text-white text-3xl font-bold text-center">
            MacroVision AI
          </Text>
          <Text className="text-text-secondary text-base mt-2 text-center">
            Cuenta calorías con inteligencia artificial
          </Text>
        </LinearGradient>

        {/* Formulario */}
        <View className="px-6 pt-2">
          <Text className="text-white text-2xl font-bold mb-6">
            Iniciar sesión
          </Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            leftIcon="mail-outline"
            error={errors.email}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <Input
            ref={passwordRef}
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="Tu contraseña"
            isPassword
            leftIcon="lock-closed-outline"
            error={errors.password}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            className="self-end mb-6 -mt-2"
          >
            <Text className="text-primary text-sm font-medium">
              ¿Olvidaste tu contraseña?
            </Text>
          </TouchableOpacity>

          <Button
            title="Entrar"
            onPress={handleLogin}
            loading={loading}
            size="lg"
          />

          {/* Divisor */}
          <View className="flex-row items-center my-6">
            <View className="flex-1 h-px bg-background-border" />
            <Text className="text-text-muted text-sm mx-4">o continúa con</Text>
            <View className="flex-1 h-px bg-background-border" />
          </View>

          {/* OAuth buttons */}
          <Button
            title="Continuar con Google"
            onPress={() => Alert.alert('Google', 'Próximamente')}
            variant="secondary"
            icon={<Text className="text-lg">G</Text>}
            size="lg"
          />

          {Platform.OS === 'ios' && (
            <Button
              title="Continuar con Apple"
              onPress={() => Alert.alert('Apple', 'Próximamente')}
              variant="secondary"
              icon={<Ionicons name="logo-apple" size={20} color="#fff" />}
              size="lg"
              style={{ marginTop: 12 }}
            />
          )}

          {/* Registro */}
          <View className="flex-row items-center justify-center mt-8">
            <Text className="text-text-secondary text-sm">
              ¿No tienes cuenta?{' '}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text className="text-primary text-sm font-semibold">
                Crear cuenta gratis
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
