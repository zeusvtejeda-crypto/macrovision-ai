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
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@store/authStore';
import { authService } from '@services/api/auth.service';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';

export function RegisterScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { setUser, setTokens } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!name || name.trim().length < 2) newErrors.name = 'Nombre muy corto';
    if (!email || !email.includes('@')) newErrors.email = 'Email inválido';
    if (!password || password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden';
    if (!acceptedTerms) newErrors.terms = 'Debes aceptar los términos';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const result = await authService.register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      await setTokens(result.tokens.accessToken, result.tokens.refreshToken);
      setUser(result.user as any);
    } catch (err: any) {
      Alert.alert(
        'Error al registrarse',
        err.message || 'No se pudo crear la cuenta',
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
        {/* Header */}
        <View className="px-6 pt-4 pb-8">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-10 h-10 rounded-full bg-background-elevated items-center justify-center mb-6"
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <Text className="text-white text-3xl font-bold">Crear cuenta</Text>
          <Text className="text-text-secondary text-base mt-2">
            Empieza a contar calorías con IA
          </Text>
        </View>

        {/* Form */}
        <View className="px-6">
          <Input
            label="Nombre"
            value={name}
            onChangeText={setName}
            placeholder="Tu nombre"
            autoCapitalize="words"
            autoCorrect={false}
            leftIcon="person-outline"
            error={errors.name}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />

          <Input
            ref={emailRef}
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
            placeholder="Mínimo 6 caracteres"
            isPassword
            leftIcon="lock-closed-outline"
            error={errors.password}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          />

          <Input
            ref={confirmPasswordRef}
            label="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repite tu contraseña"
            isPassword
            leftIcon="lock-closed-outline"
            error={errors.confirmPassword}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          {/* Password strength */}
          {password.length > 0 && (
            <View className="mb-4 -mt-2">
              <View className="flex-row gap-1 mb-1">
                {[1, 2, 3, 4].map((level) => (
                  <View
                    key={level}
                    className="flex-1 h-1 rounded-full"
                    style={{
                      backgroundColor:
                        password.length >= level * 3
                          ? level <= 1
                            ? '#ef4444'
                            : level <= 2
                            ? '#f59e0b'
                            : level <= 3
                            ? '#3b82f6'
                            : '#10b981'
                          : '#27272a',
                    }}
                  />
                ))}
              </View>
              <Text className="text-text-muted text-xs">
                {password.length < 6
                  ? 'Muy corta'
                  : password.length < 10
                  ? 'Aceptable'
                  : password.length < 14
                  ? 'Buena'
                  : 'Excelente'}
              </Text>
            </View>
          )}

          {/* Terms */}
          <TouchableOpacity
            onPress={() => setAcceptedTerms((v) => !v)}
            className="flex-row items-start gap-3 mb-6"
            activeOpacity={0.7}
          >
            <View
              className={`w-5 h-5 rounded-md border-2 items-center justify-center mt-0.5 flex-shrink-0 ${
                acceptedTerms ? 'bg-primary border-primary' : 'border-background-border'
              }`}
            >
              {acceptedTerms && <Ionicons name="checkmark" size={12} color="#000" />}
            </View>
            <Text className="text-text-secondary text-sm flex-1 leading-5">
              Acepto los{' '}
              <Text className="text-primary font-medium">Términos de uso</Text>
              {' '}y la{' '}
              <Text className="text-primary font-medium">Política de privacidad</Text>
            </Text>
          </TouchableOpacity>
          {errors.terms && (
            <Text className="text-red-400 text-xs -mt-4 mb-4">{errors.terms}</Text>
          )}

          <Button
            title="Crear cuenta gratis"
            onPress={handleRegister}
            loading={loading}
            size="lg"
          />

          {/* Features list */}
          <View className="mt-6 gap-2">
            {[
              'Analiza fotos de tus comidas con IA',
              '3 análisis gratis al día',
              'Diario nutricional completo',
            ].map((feature) => (
              <View key={feature} className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-primary/20 items-center justify-center">
                  <Ionicons name="checkmark" size={10} color="#10b981" />
                </View>
                <Text className="text-text-muted text-sm">{feature}</Text>
              </View>
            ))}
          </View>

          {/* Login link */}
          <View className="flex-row items-center justify-center mt-8">
            <Text className="text-text-secondary text-sm">¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text className="text-primary text-sm font-semibold">Iniciar sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
