import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DiaryEntry } from '@macrovision/shared-types';
import { MEAL_TYPE_LABELS } from '@constants/config';

interface Props {
  mealType: string;
  entries: DiaryEntry[];
  onAddFood: (mealType: string) => void;
  onDeleteEntry: (entryId: string) => void;
}

const MEAL_ICONS: Record<string, string> = {
  BREAKFAST: 'sunny-outline',
  LUNCH: 'restaurant-outline',
  DINNER: 'moon-outline',
  SNACK: 'nutrition-outline',
  PRE_WORKOUT: 'barbell-outline',
  POST_WORKOUT: 'fitness-outline',
};

export function MealSection({ mealType, entries, onAddFood, onDeleteEntry }: Props) {
  const [expanded, setExpanded] = useState(true);
  const label = MEAL_TYPE_LABELS[mealType] || mealType;
  const icon = MEAL_ICONS[mealType] || 'restaurant-outline';

  const totalCalories = entries.reduce((sum, e) => sum + e.totalCalories, 0);
  const hasEntries = entries.length > 0;

  return (
    <View className="mb-3 bg-[#111111] rounded-3xl overflow-hidden">
      {/* Header de la comida */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between p-4"
        activeOpacity={0.7}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 rounded-xl bg-background-elevated items-center justify-center">
            <Ionicons name={icon as any} size={18} color="#10b981" />
          </View>
          <View>
            <Text className="text-white font-semibold text-base">{label}</Text>
            {hasEntries && (
              <Text className="text-text-muted text-xs mt-0.5">
                {Math.round(totalCalories)} kcal
              </Text>
            )}
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => onAddFood(mealType)}
            className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={18} color="#10b981" />
          </TouchableOpacity>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#52525b"
          />
        </View>
      </TouchableOpacity>

      {/* Lista de alimentos */}
      {expanded && (
        <View>
          {hasEntries ? (
            entries.map((entry) => (
              <View
                key={entry.id}
                className="border-t border-background-border"
              >
                {entry.foods.map((food) => (
                  <View
                    key={food.id}
                    className="flex-row items-center px-4 py-3"
                  >
                    <View className="flex-1">
                      <Text className="text-white text-sm font-medium">
                        {food.foodName}
                      </Text>
                      <Text className="text-text-muted text-xs mt-0.5">
                        {food.portionDisplay || `${Math.round(food.portionSize)}g`}
                        {' · '}
                        {Math.round(food.calories)} kcal
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-text-secondary text-xs">
                        P: {Math.round(food.protein)}g
                      </Text>
                      <Text className="text-text-secondary text-xs">
                        C: {Math.round(food.carbohydrates)}g
                      </Text>
                      <Text className="text-text-secondary text-xs">
                        G: {Math.round(food.fat)}g
                      </Text>
                    </View>
                  </View>
                ))}

                {/* Totales de la entrada */}
                {entry.foods.length > 1 && (
                  <View className="flex-row justify-between px-4 py-2 bg-background-elevated/50">
                    <Text className="text-text-muted text-xs font-medium">
                      Total entrada
                    </Text>
                    <Text className="text-white text-xs font-semibold">
                      {Math.round(entry.totalCalories)} kcal
                    </Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <TouchableOpacity
              onPress={() => onAddFood(mealType)}
              className="border-t border-background-border px-4 py-4 flex-row items-center gap-2"
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color="#52525b" />
              <Text className="text-text-muted text-sm">
                Añadir {label.toLowerCase()}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
