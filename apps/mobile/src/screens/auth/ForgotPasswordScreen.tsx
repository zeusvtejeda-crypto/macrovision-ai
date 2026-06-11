import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@services/api/auth.service';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';

export function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email || !email.includes('@')) {
      setError('Ingresa un email válido');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo enviar el correo', [{ text: 'Entendido' }]);
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
        <View className="px-6 pt-4">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-10 h-10 rounded-full bg-background-elevated items-center justify-center mb-6"
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          {sent ? (
            /* Success state */
            <View className="flex-1 items-center pt-12">
              <View className="w-24 h-24 rounded-full bg-primary/15 items-center justify-center mb-6">
                <Ionicons name="mail-outline" size={44} color="#10b981" />
              </View>
              <Text className="text-white text-2xl font-bold text-center mb-3">
                Revisa tu correo
              </Text>
              <Text className="text-text-secondary text-base text-center leading-6 mb-2">
                Enviamos instrucciones para restablecer tu contraseña a
              </Text>
              <Text className="text-primary font-semibold text-base text-center mb-8">
                {email}
              </Text>
              <Text className="text-text-muted text-sm text-center leading-5 mb-8 px-4">
                Si no ves el correo, revisa tu carpeta de spam o espera unos minutos.
              </Text>

              <Button
                title="Volver al inicio de sesión"
                onPress={() => navigation.navigate('Login')}
                variant="secondary"
                size="lg"
              />

              <TouchableOpacity
                onPress={() => {
                  setSent(false);
                  setEmail('');
                }}
                className="mt-4"
              >
                <Text className="text-text-muted text-sm">Reenviar correo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Form state */
            <View>
              <View className="w-16 h-16 rounded-2xl bg-primary/15 items-center justify-center mb-6">
                <Ionicons name="key-outline" size={28} color="#10b981" />
              </View>

              <Text className="text-white text-3xl font-bold mb-2">
                ¿Olvidaste tu contraseña?
              </Text>
              <Text className="text-text-secondary text-base mb-8 leading-6">
                Ingresa tu email y te enviaremos un enlace para restablecerla.
              </Text>

              <Input
                label="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError('');
                }}
                placeholder="tu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                leftIcon="mail-outline"
                error={error}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                autoFocus
              />

              <Button
                title="Enviar instrucciones"
                onPress={handleSubmit}
                loading={loading}
                size="lg"
              />

              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                className="items-center mt-6"
              >
                <Text className="text-text-muted text-sm">
                  Volver a{' '}
                  <Text className="text-primary font-medium">iniciar sesión</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
