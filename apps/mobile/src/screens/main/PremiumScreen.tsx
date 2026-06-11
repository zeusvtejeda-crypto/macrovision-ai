import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { subscriptionsService } from '@services/api/subscriptions.service';
import { Button } from '@components/common/Button';

const FEATURES = [
  { icon: 'camera-outline', label: 'Análisis ilimitados con IA' },
  { icon: 'barcode-outline', label: 'Escáner de código de barras' },
  { icon: 'analytics-outline', label: 'Gráficas y reportes avanzados' },
  { icon: 'restaurant-outline', label: 'Base de datos extendida de alimentos' },
  { icon: 'sync-outline', label: 'Historial ilimitado' },
  { icon: 'notifications-outline', label: 'Recordatorios personalizados' },
  { icon: 'cloudy-outline', label: 'Respaldo en la nube' },
  { icon: 'headset-outline', label: 'Soporte prioritario' },
];

const PLANS = [
  {
    id: 'monthly',
    label: 'Mensual',
    price: '$4.99',
    period: '/mes',
    priceNote: null,
    popular: false,
  },
  {
    id: 'annual',
    label: 'Anual',
    price: '$2.99',
    period: '/mes',
    priceNote: 'Facturado $35.99/año · Ahorra 40%',
    popular: true,
  },
];

export function PremiumScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const plan = PLANS.find((p) => p.id === selectedPlan)!;
      const priceId =
        plan.id === 'annual'
          ? process.env.EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID!
          : process.env.EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID!;

      await subscriptionsService.createCheckoutSession(priceId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo iniciar el pago');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Close button */}
      <View className="px-5 pt-2 pb-1 flex-row justify-end">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="w-10 h-10 rounded-full bg-background-elevated items-center justify-center"
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* Hero */}
        <View className="items-center px-6 pb-8">
          <LinearGradient
            colors={['rgba(245,158,11,0.2)', 'transparent']}
            className="w-20 h-20 rounded-3xl items-center justify-center mb-5"
          >
            <Ionicons name="star" size={36} color="#f59e0b" />
          </LinearGradient>

          <Text className="text-white text-3xl font-bold text-center mb-2">
            MacroVision Premium
          </Text>
          <Text className="text-text-secondary text-base text-center leading-6">
            Desbloquea todo el poder de la IA para alcanzar tus metas más rápido
          </Text>
        </View>

        {/* Features */}
        <View className="px-6 mb-8">
          <View className="bg-[#111111] rounded-3xl p-5 gap-3">
            {FEATURES.map((feature) => (
              <View key={feature.label} className="flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-xl bg-amber-500/15 items-center justify-center flex-shrink-0">
                  <Ionicons name={feature.icon as any} size={16} color="#f59e0b" />
                </View>
                <Text className="text-white text-sm font-medium flex-1">{feature.label}</Text>
                <Ionicons name="checkmark" size={16} color="#10b981" />
              </View>
            ))}
          </View>
        </View>

        {/* Plan selector */}
        <View className="px-6 mb-6 gap-3">
          {PLANS.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              onPress={() => setSelectedPlan(plan.id)}
              className={`rounded-2xl border-2 p-4 ${
                selectedPlan === plan.id
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-background-border bg-background-elevated'
              }`}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                      selectedPlan === plan.id ? 'border-amber-500' : 'border-background-border'
                    }`}
                  >
                    {selectedPlan === plan.id && (
                      <View className="w-3 h-3 rounded-full bg-amber-500" />
                    )}
                  </View>
                  <View>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-white font-semibold">{plan.label}</Text>
                      {plan.popular && (
                        <View className="bg-amber-500 px-2 py-0.5 rounded-full">
                          <Text className="text-black text-xs font-bold">Popular</Text>
                        </View>
                      )}
                    </View>
                    {plan.priceNote && (
                      <Text className="text-text-muted text-xs mt-0.5">{plan.priceNote}</Text>
                    )}
                  </View>
                </View>
                <Text className="text-white font-bold text-xl">
                  {plan.price}
                  <Text className="text-text-muted text-sm font-normal">{plan.period}</Text>
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trial note */}
        <View className="px-6 mb-6 flex-row items-start gap-2">
          <Ionicons name="shield-checkmark-outline" size={16} color="#10b981" style={{ marginTop: 2 }} />
          <Text className="text-text-secondary text-sm flex-1 leading-5">
            7 días de prueba gratuita. Cancela cuando quieras desde {Platform.OS === 'ios' ? 'Ajustes > Apple ID' : 'Google Play'}.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View
        className="absolute bottom-0 left-0 right-0 px-5 bg-black/95 border-t border-background-border"
        style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}
      >
        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={loading}
          className="overflow-hidden rounded-2xl"
        >
          <LinearGradient
            colors={['#f59e0b', '#d97706']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="py-4 items-center"
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text className="text-black font-bold text-base">
                Comenzar prueba gratuita
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <Text className="text-text-muted text-xs text-center mt-2">
          Sin compromisos · Cancela en cualquier momento
        </Text>
      </View>
    </View>
  );
}
