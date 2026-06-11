import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usersService } from '@services/api/users.service';
import { useAuthStore } from '@store/authStore';
import { authService } from '@services/api/auth.service';
import { Card } from '@components/common/Card';

const GOAL_LABELS: Record<string, string> = {
  LOSE_FAT: 'Perder grasa',
  MAINTAIN: 'Mantenerme',
  GAIN_MUSCLE: 'Ganar músculo',
};

const ACTIVITY_LABELS: Record<string, string> = {
  SEDENTARY: 'Sedentario',
  LIGHT: 'Ligero',
  MODERATE: 'Moderado',
  ACTIVE: 'Activo',
  VERY_ACTIVE: 'Muy activo',
};

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => usersService.getProfile(),
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      queryClient.clear();
      logout();
    },
  });

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => logoutMutation.mutate(),
      },
    ]);
  };

  const isPremium = profile?.subscription?.status === 'ACTIVE';

  const StatCard = ({ label, value }: { label: string; value: string }) => (
    <View className="flex-1 bg-background-elevated rounded-2xl p-3 items-center">
      <Text className="text-white font-bold text-lg">{value}</Text>
      <Text className="text-text-muted text-xs mt-0.5 text-center">{label}</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 90 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
          <Text className="text-white text-2xl font-bold">Perfil</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            className="w-10 h-10 rounded-full bg-background-elevated items-center justify-center"
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color="#10b981" />
          </View>
        ) : (
          <View className="px-5 gap-4">
            {/* User card */}
            <LinearGradient
              colors={
                isPremium
                  ? ['rgba(245,158,11,0.12)', 'rgba(245,158,11,0.03)']
                  : ['rgba(16,185,129,0.12)', 'rgba(16,185,129,0.03)']
              }
              className="rounded-3xl p-5"
            >
              <View className="flex-row items-center gap-4">
                <View className="w-16 h-16 rounded-full bg-primary/20 items-center justify-center">
                  <Text className="text-primary text-2xl font-bold">
                    {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white text-xl font-bold">{user?.name}</Text>
                  <Text className="text-text-secondary text-sm">{user?.email}</Text>
                  {isPremium && (
                    <View className="flex-row items-center gap-1.5 mt-1.5">
                      <Ionicons name="star" size={12} color="#f59e0b" />
                      <Text className="text-amber-400 text-xs font-semibold">Premium</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity className="bg-background-elevated px-3 py-1.5 rounded-xl">
                  <Text className="text-text-secondary text-sm">Editar</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* Stats */}
            <View className="flex-row gap-3">
              <StatCard
                label="Racha actual"
                value={`${profile?.currentStreak ?? 0}🔥`}
              />
              <StatCard
                label="Mejor racha"
                value={`${profile?.longestStreak ?? 0} días`}
              />
              <StatCard
                label="Análisis"
                value={String(profile?.totalAnalyses ?? 0)}
              />
            </View>

            {/* Goals */}
            <Card>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-white font-semibold">Mis objetivos</Text>
                <TouchableOpacity>
                  <Text className="text-primary text-sm">Editar</Text>
                </TouchableOpacity>
              </View>

              {[
                { label: 'Calorías', value: `${profile?.dailyCalories ?? 0} kcal`, icon: 'flame-outline' },
                { label: 'Proteína', value: `${profile?.dailyProtein ?? 0}g`, icon: 'barbell-outline' },
                { label: 'Carbohidratos', value: `${profile?.dailyCarbs ?? 0}g`, icon: 'nutrition-outline' },
                { label: 'Grasa', value: `${profile?.dailyFat ?? 0}g`, icon: 'water-outline' },
              ].map((item) => (
                <View key={item.label} className="flex-row items-center justify-between py-3 border-b border-background-border last:border-0">
                  <View className="flex-row items-center gap-3">
                    <View className="w-8 h-8 rounded-xl bg-background-elevated items-center justify-center">
                      <Ionicons name={item.icon as any} size={16} color="#10b981" />
                    </View>
                    <Text className="text-text-secondary text-sm">{item.label}</Text>
                  </View>
                  <Text className="text-white font-semibold text-sm">{item.value}</Text>
                </View>
              ))}
            </Card>

            {/* Body info */}
            {profile?.weight && (
              <Card>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-white font-semibold">Datos corporales</Text>
                  <TouchableOpacity>
                    <Text className="text-primary text-sm">Actualizar</Text>
                  </TouchableOpacity>
                </View>
                {[
                  { label: 'Peso', value: `${profile.weight} kg` },
                  { label: 'Altura', value: `${profile.height} cm` },
                  { label: 'Objetivo', value: GOAL_LABELS[profile.goal] ?? profile.goal },
                  { label: 'Actividad', value: ACTIVITY_LABELS[profile.activityLevel] ?? profile.activityLevel },
                ].map((item) => (
                  <View key={item.label} className="flex-row justify-between py-2.5 border-b border-background-border last:border-0">
                    <Text className="text-text-secondary text-sm">{item.label}</Text>
                    <Text className="text-white text-sm font-medium">{item.value}</Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Premium CTA */}
            {!isPremium && (
              <TouchableOpacity
                onPress={() => navigation.navigate('Premium')}
                className="overflow-hidden rounded-3xl"
              >
                <LinearGradient
                  colors={['#f59e0b', '#d97706']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  className="p-4 flex-row items-center gap-3"
                >
                  <Ionicons name="star" size={22} color="#000" />
                  <View className="flex-1">
                    <Text className="text-black font-bold">Actualizar a Premium</Text>
                    <Text className="text-black/70 text-xs">Análisis ilimitados y más</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Account settings */}
            <Card noPadding>
              {[
                {
                  icon: 'notifications-outline',
                  label: 'Notificaciones',
                  onPress: () => {},
                  type: 'nav',
                },
                {
                  icon: 'shield-checkmark-outline',
                  label: 'Privacidad',
                  onPress: () => {},
                  type: 'nav',
                },
                {
                  icon: 'help-circle-outline',
                  label: 'Soporte',
                  onPress: () => {},
                  type: 'nav',
                },
                {
                  icon: 'log-out-outline',
                  label: 'Cerrar sesión',
                  onPress: handleLogout,
                  type: 'destructive',
                },
              ].map((item, i, arr) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={item.onPress}
                  className={`flex-row items-center px-4 py-4 ${
                    i < arr.length - 1 ? 'border-b border-background-border' : ''
                  }`}
                  activeOpacity={0.7}
                >
                  <View className="w-8 h-8 rounded-xl bg-background-elevated items-center justify-center mr-3">
                    <Ionicons
                      name={item.icon as any}
                      size={16}
                      color={item.type === 'destructive' ? '#ef4444' : '#52525b'}
                    />
                  </View>
                  <Text
                    className={`flex-1 text-sm font-medium ${
                      item.type === 'destructive' ? 'text-red-400' : 'text-white'
                    }`}
                  >
                    {item.label}
                  </Text>
                  {item.type === 'nav' && (
                    <Ionicons name="chevron-forward" size={16} color="#52525b" />
                  )}
                </TouchableOpacity>
              ))}
            </Card>

            <Text className="text-text-muted text-xs text-center pb-2">
              MacroVision AI v1.0.0
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
