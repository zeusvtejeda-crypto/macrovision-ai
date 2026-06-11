import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { nutritionService } from '@services/api/nutrition.service';
import { diaryService } from '@services/api/diary.service';
import { Card } from '@components/common/Card';
import { useDebounce } from '@hooks/useDebounce';

type RouteParams = { mealType?: string; date?: string };

export function FoodSearchScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { mealType = 'LUNCH', date } = route.params ?? {};

  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<any | null>(null);
  const [portion, setPortion] = useState('100');

  const debouncedQuery = useDebounce(query, 350);
  const inputRef = useRef<TextInput>(null);

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['food-search', debouncedQuery],
    queryFn: () => nutritionService.searchFoods(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60_000,
  });

  const { data: recentFoods } = useQuery({
    queryKey: ['recent-foods'],
    queryFn: () => nutritionService.getRecentFoods(),
    staleTime: 5 * 60_000,
  });

  const { data: frequentFoods } = useQuery({
    queryKey: ['frequent-foods'],
    queryFn: () => nutritionService.getFrequentFoods(),
    staleTime: 10 * 60_000,
  });

  const addMutation = useMutation({
    mutationFn: ({ foodId, grams }: { foodId: string; grams: number }) =>
      diaryService.addFoodEntry({ foodId, grams, mealType, date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigation.goBack();
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'No se pudo añadir al diario');
    },
  });

  const handleAddFood = () => {
    if (!selectedFood) return;
    const grams = parseFloat(portion);
    if (isNaN(grams) || grams <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    addMutation.mutate({ foodId: selectedFood.id, grams });
  };

  const calcNutrients = (food: any, grams: number) => {
    const factor = grams / 100;
    return {
      calories: Math.round((food.caloriesPer100g ?? 0) * factor),
      protein: Math.round((food.proteinPer100g ?? 0) * factor),
      carbs: Math.round((food.carbohydratesPer100g ?? 0) * factor),
      fat: Math.round((food.fatPer100g ?? 0) * factor),
    };
  };

  const displayList =
    debouncedQuery.length >= 2
      ? searchResults ?? []
      : [];

  const nutrients = selectedFood
    ? calcNutrients(selectedFood, parseFloat(portion) || 100)
    : null;

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-3 gap-3">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="w-10 h-10 rounded-full bg-background-elevated items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white font-bold text-base flex-1">Buscar alimento</Text>
      </View>

      {/* Search input */}
      <View className="px-5 mb-4">
        <View className="flex-row items-center bg-background-elevated rounded-2xl px-4 gap-3">
          <Ionicons name="search-outline" size={18} color="#52525b" />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar alimento..."
            placeholderTextColor="#52525b"
            className="flex-1 text-white text-base py-4"
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searching && <ActivityIndicator size="small" color="#10b981" />}
        </View>
      </View>

      {/* Selected food panel */}
      {selectedFood && (
        <View className="mx-5 mb-4 bg-[#111111] rounded-2xl p-4">
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{selectedFood.name}</Text>
              <Text className="text-text-muted text-xs mt-0.5">{selectedFood.brand ?? 'Genérico'}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedFood(null)}>
              <Ionicons name="close-circle" size={22} color="#52525b" />
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center gap-3 mb-3">
            <View className="bg-background-elevated rounded-xl flex-row items-center px-3 flex-1">
              <TextInput
                value={portion}
                onChangeText={setPortion}
                keyboardType="decimal-pad"
                className="text-white text-base py-3 flex-1"
              />
              <Text className="text-text-muted text-sm">g</Text>
            </View>
            {nutrients && (
              <View className="flex-row gap-3">
                <View className="items-center">
                  <Text className="text-white font-bold text-lg">{nutrients.calories}</Text>
                  <Text className="text-text-muted text-xs">kcal</Text>
                </View>
              </View>
            )}
          </View>

          {nutrients && (
            <View className="flex-row gap-3 mb-3">
              {[
                { label: 'P', value: nutrients.protein, color: '#3b82f6' },
                { label: 'C', value: nutrients.carbs, color: '#f59e0b' },
                { label: 'G', value: nutrients.fat, color: '#a855f7' },
              ].map((m) => (
                <View key={m.label} className="flex-1 bg-background-elevated rounded-xl py-2 items-center">
                  <Text className="font-bold text-sm" style={{ color: m.color }}>{m.value}g</Text>
                  <Text className="text-text-muted text-xs">{m.label}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={handleAddFood}
            disabled={addMutation.isPending}
            className="bg-primary rounded-xl py-3 items-center"
          >
            {addMutation.isPending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text className="text-black font-bold">Añadir al diario</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={displayList}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          debouncedQuery.length < 2 ? (
            <View>
              {/* Recent */}
              {(recentFoods?.length ?? 0) > 0 && (
                <View className="mb-4">
                  <Text className="text-text-secondary text-sm font-semibold mb-2">
                    Recientes
                  </Text>
                  {recentFoods!.slice(0, 5).map((food: any) => (
                    <FoodItem key={food.id} food={food} onSelect={setSelectedFood} />
                  ))}
                </View>
              )}
              {/* Frequent */}
              {(frequentFoods?.length ?? 0) > 0 && (
                <View>
                  <Text className="text-text-secondary text-sm font-semibold mb-2">
                    Frecuentes
                  </Text>
                  {frequentFoods!.slice(0, 5).map((food: any) => (
                    <FoodItem key={food.id} food={food} onSelect={setSelectedFood} />
                  ))}
                </View>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          debouncedQuery.length >= 2 && !searching ? (
            <View className="items-center py-12">
              <Ionicons name="search-outline" size={40} color="#27272a" />
              <Text className="text-text-muted text-sm mt-3">
                Sin resultados para "{debouncedQuery}"
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <FoodItem food={item} onSelect={setSelectedFood} />
        )}
      />
    </View>
  );
}

function FoodItem({ food, onSelect }: { food: any; onSelect: (f: any) => void }) {
  return (
    <TouchableOpacity
      onPress={() => onSelect(food)}
      className="flex-row items-center py-3 border-b border-background-border"
      activeOpacity={0.7}
    >
      <View className="flex-1">
        <Text className="text-white text-sm font-medium">{food.name}</Text>
        <Text className="text-text-muted text-xs mt-0.5">
          {food.brand ? `${food.brand} · ` : ''}
          {Math.round(food.caloriesPer100g ?? 0)} kcal/100g
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-text-secondary text-xs">
          P {Math.round(food.proteinPer100g ?? 0)}g
        </Text>
      </View>
    </TouchableOpacity>
  );
}
