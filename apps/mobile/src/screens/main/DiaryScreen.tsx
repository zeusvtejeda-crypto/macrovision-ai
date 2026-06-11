import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { diaryService } from '@services/api/diary.service';
import { MealSection } from '@components/diary/MealSection';
import { Card } from '@components/common/Card';
import { formatDate, addDays } from '@utils/format';

const MEAL_ORDER = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'PRE_WORKOUT', 'POST_WORKOUT'];

export function DiaryScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateKey = selectedDate.toISOString().split('T')[0];

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['diary', dateKey],
    queryFn: () => diaryService.getDailyDiary(dateKey),
    staleTime: 30_000,
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => diaryService.deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diary', dateKey] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'No se pudo eliminar la entrada');
    },
  });

  const handleDeleteEntry = (entryId: string) => {
    Alert.alert(
      'Eliminar entrada',
      '¿Quieres eliminar esta entrada del diario?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => deleteEntryMutation.mutate(entryId),
        },
      ],
    );
  };

  const changeDate = (days: number) => {
    const newDate = addDays(selectedDate, days);
    if (newDate <= new Date()) {
      setSelectedDate(newDate);
    }
  };

  const isToday = dateKey === new Date().toISOString().split('T')[0];

  const entriesByMeal: Record<string, any[]> = {};
  MEAL_ORDER.forEach((meal) => {
    entriesByMeal[meal] = data?.entries?.filter((e: any) => e.mealType === meal) ?? [];
  });

  const activeMeals = MEAL_ORDER.filter(
    (meal) =>
      entriesByMeal[meal].length > 0 ||
      ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'].includes(meal),
  );

  const totalCalories = data?.totals?.totalCalories ?? 0;
  const goalCalories = data?.goals?.dailyCalories ?? 2000;
  const remaining = goalCalories - totalCalories;

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#10b981" />
        }
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-3">
          <Text className="text-white text-2xl font-bold">Diario</Text>
        </View>

        {/* Date selector */}
        <View className="flex-row items-center px-5 mb-4 gap-3">
          <TouchableOpacity
            onPress={() => changeDate(-1)}
            className="w-9 h-9 rounded-full bg-background-elevated items-center justify-center"
          >
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </TouchableOpacity>

          <View className="flex-1 items-center">
            <Text className="text-white font-semibold text-base">
              {isToday ? 'Hoy' : formatDate(selectedDate, 'EEE d MMM')}
            </Text>
            {!isToday && (
              <Text className="text-text-muted text-xs">{formatDate(selectedDate, 'yyyy')}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => changeDate(1)}
            disabled={isToday}
            className="w-9 h-9 rounded-full bg-background-elevated items-center justify-center"
            style={{ opacity: isToday ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>

          {!isToday && (
            <TouchableOpacity
              onPress={() => setSelectedDate(new Date())}
              className="bg-primary/15 px-3 py-1.5 rounded-full"
            >
              <Text className="text-primary text-xs font-semibold">Hoy</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color="#10b981" />
          </View>
        ) : (
          <View className="px-5 gap-3">
            {/* Daily summary */}
            <LinearGradient
              colors={
                remaining < 0
                  ? ['rgba(239,68,68,0.12)', 'rgba(239,68,68,0.04)']
                  : ['rgba(16,185,129,0.12)', 'rgba(16,185,129,0.04)']
              }
              className="rounded-3xl p-4"
            >
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-text-secondary text-sm">Calorías consumidas</Text>
                  <Text className="text-white text-3xl font-bold">
                    {Math.round(totalCalories)}
                    <Text className="text-text-muted text-base font-normal"> / {Math.round(goalCalories)}</Text>
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: remaining < 0 ? '#ef4444' : '#10b981' }}
                  >
                    {remaining < 0 ? '+' : ''}{Math.abs(Math.round(remaining))} kcal
                  </Text>
                  <Text className="text-text-muted text-xs">
                    {remaining < 0 ? 'sobre el objetivo' : 'restantes'}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View className="h-2 bg-black/20 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min((totalCalories / goalCalories) * 100, 100)}%`,
                    backgroundColor: remaining < 0 ? '#ef4444' : '#10b981',
                  }}
                />
              </View>

              {/* Macro mini totals */}
              {data?.totals && (
                <View className="flex-row mt-3 gap-4">
                  {[
                    { label: 'P', value: data.totals.totalProtein, color: '#3b82f6' },
                    { label: 'C', value: data.totals.totalCarbohydrates, color: '#f59e0b' },
                    { label: 'G', value: data.totals.totalFat, color: '#a855f7' },
                  ].map((m) => (
                    <Text key={m.label} className="text-text-muted text-xs">
                      <Text style={{ color: m.color }}>{m.label}</Text>
                      {' '}{Math.round(m.value)}g
                    </Text>
                  ))}
                </View>
              )}
            </LinearGradient>

            {/* Meal sections */}
            {activeMeals.map((meal) => (
              <MealSection
                key={meal}
                mealType={meal}
                entries={entriesByMeal[meal]}
                onAddFood={(mealType) =>
                  navigation.navigate('FoodSearch', { mealType, date: dateKey })
                }
                onDeleteEntry={handleDeleteEntry}
              />
            ))}

            {/* Water tracker placeholder */}
            <Card>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-xl bg-blue-500/15 items-center justify-center">
                    <Ionicons name="water-outline" size={18} color="#3b82f6" />
                  </View>
                  <View>
                    <Text className="text-white font-semibold text-sm">Agua</Text>
                    <Text className="text-text-muted text-xs">0 / 8 vasos</Text>
                  </View>
                </View>
                <TouchableOpacity className="bg-blue-500/15 p-2 rounded-xl">
                  <Ionicons name="add" size={18} color="#3b82f6" />
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
