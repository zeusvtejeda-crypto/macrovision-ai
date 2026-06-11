import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usersService } from '@services/api/users.service';
import { useAuthStore } from '@store/authStore';
import { MacroRing } from '@components/common/MacroRing';
import { MacroBar } from '@components/dashboard/MacroBar';
import { Card } from '@components/common/Card';
import { formatDate } from '@utils/format';

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const {
    data: dashboard,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => usersService.getDashboard(),
    staleTime: 2 * 60 * 1000,
  });

  const caloriesConsumed = dashboard?.today?.totalCalories ?? 0;
  const caloriesGoal = dashboard?.goals?.dailyCalories ?? 2000;
  const caloriesPct = caloriesGoal > 0 ? Math.min(caloriesConsumed / caloriesGoal, 1) : 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const macroSegments = [
    { color: '#3b82f6', value: dashboard?.today?.totalProtein ?? 0 },
    { color: '#f59e0b', value: dashboard?.today?.totalCarbohydrates ?? 0 },
    { color: '#a855f7', value: dashboard?.today?.totalFat ?? 0 },
  ];

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#10b981"
          />
        }
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <View>
            <Text className="text-text-secondary text-sm">{greeting()},</Text>
            <Text className="text-white text-xl font-bold">
              {user?.name?.split(' ')[0] ?? 'Usuario'} 👋
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center"
          >
            <Text className="text-primary font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase() ?? 'U'}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color="#10b981" />
          </View>
        ) : (
          <View className="px-5 gap-4">
            {/* Calorie ring card */}
            <LinearGradient
              colors={['rgba(16,185,129,0.12)', 'rgba(16,185,129,0.03)']}
              className="rounded-3xl p-5"
            >
              <View className="flex-row items-center">
                <View className="mr-5">
                  <MacroRing
                    size={130}
                    strokeWidth={10}
                    percentage={caloriesPct}
                    segments={macroSegments}
                    center={
                      <View className="items-center">
                        <Text className="text-white text-2xl font-bold">
                          {Math.round(caloriesConsumed)}
                        </Text>
                        <Text className="text-text-muted text-xs">kcal</Text>
                      </View>
                    }
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-text-secondary text-sm mb-1">Calorías hoy</Text>
                  <Text className="text-white text-base">
                    <Text className="font-bold">{Math.round(caloriesConsumed)}</Text>
                    <Text className="text-text-muted"> / {Math.round(caloriesGoal)} kcal</Text>
                  </Text>
                  <Text className="text-text-muted text-sm mt-1">
                    {caloriesGoal - caloriesConsumed > 0
                      ? `${Math.round(caloriesGoal - caloriesConsumed)} kcal restantes`
                      : 'Objetivo alcanzado 🎉'}
                  </Text>

                  {/* Streak */}
                  {(dashboard?.streak?.currentStreak ?? 0) > 0 && (
                    <View className="flex-row items-center gap-1.5 mt-3 bg-amber-500/10 self-start px-2.5 py-1 rounded-full">
                      <Text className="text-sm">🔥</Text>
                      <Text className="text-amber-400 text-xs font-semibold">
                        {dashboard.streak.currentStreak} días
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </LinearGradient>

            {/* Macro bars */}
            <Card>
              <Text className="text-white font-semibold mb-4">Macronutrientes</Text>
              <MacroBar
                label="Proteína"
                consumed={dashboard?.today?.totalProtein ?? 0}
                goal={dashboard?.goals?.dailyProtein ?? 150}
                color={MACRO_COLORS.protein}
              />
              <MacroBar
                label="Carbohidratos"
                consumed={dashboard?.today?.totalCarbohydrates ?? 0}
                goal={dashboard?.goals?.dailyCarbs ?? 200}
                color={MACRO_COLORS.carbs}
              />
              <MacroBar
                label="Grasa"
                consumed={dashboard?.today?.totalFat ?? 0}
                goal={dashboard?.goals?.dailyFat ?? 65}
                color={MACRO_COLORS.fat}
              />
            </Card>

            {/* Quick actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => navigation.navigate('Camera')}
                className="flex-1 bg-primary rounded-2xl py-4 items-center"
              >
                <Ionicons name="camera-outline" size={22} color="#000" />
                <Text className="text-black font-semibold text-sm mt-1">Analizar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('FoodSearch')}
                className="flex-1 bg-background-elevated rounded-2xl py-4 items-center"
              >
                <Ionicons name="search-outline" size={22} color="#10b981" />
                <Text className="text-white font-semibold text-sm mt-1">Buscar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('MainTabs', { screen: 'Diary' })}
                className="flex-1 bg-background-elevated rounded-2xl py-4 items-center"
              >
                <Ionicons name="book-outline" size={22} color="#10b981" />
                <Text className="text-white font-semibold text-sm mt-1">Diario</Text>
              </TouchableOpacity>
            </View>

            {/* Weekly summary */}
            {dashboard?.weeklyTrend && dashboard.weeklyTrend.length > 0 && (
              <Card>
                <Text className="text-white font-semibold mb-4">Últimos 7 días</Text>
                <View className="flex-row items-end justify-between gap-1">
                  {dashboard.weeklyTrend.map((day: any, i: number) => {
                    const pct = caloriesGoal > 0 ? Math.min(day.calories / caloriesGoal, 1) : 0;
                    const isToday = i === dashboard.weeklyTrend.length - 1;
                    return (
                      <View key={day.date} className="flex-1 items-center gap-1">
                        <View
                          className="w-full rounded-t-lg"
                          style={{
                            height: Math.max(4, pct * 80),
                            backgroundColor: isToday ? '#10b981' : '#27272a',
                          }}
                        />
                        <Text className="text-text-muted text-xs">
                          {formatDate(day.date, 'EEE')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {/* Weight progress */}
            {dashboard?.latestWeight && (
              <Card>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-text-secondary text-sm">Peso actual</Text>
                    <Text className="text-white text-3xl font-bold mt-0.5">
                      {dashboard.latestWeight.toFixed(1)}
                      <Text className="text-text-muted text-lg font-normal"> kg</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Profile')}
                    className="bg-primary/15 px-4 py-2 rounded-xl"
                  >
                    <Text className="text-primary text-sm font-semibold">Registrar</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const MACRO_COLORS = {
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fat: '#a855f7',
};
