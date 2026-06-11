import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { foodAnalysisService } from '@services/api/food-analysis.service';
import { ConfidenceBadge } from '@components/nutrition/ConfidenceBadge';
import { Button } from '@components/common/Button';
import { Card } from '@components/common/Card';
import type { FoodAnalysis } from '@macrovision/shared-types';

type RouteParams = { analysisId: string };

const MACRO_COLORS = {
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fat: '#a855f7',
  fiber: '#10b981',
};

export function AnalysisResultScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const insets = useSafeAreaInsets();
  const { analysisId } = route.params;

  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDiary, setSavingDiary] = useState(false);
  const [savedToDiary, setSavedToDiary] = useState(false);

  const [correctionModal, setCorrectionModal] = useState(false);
  const [correctionItemId, setCorrectionItemId] = useState('');
  const [correctionPortion, setCorrectionPortion] = useState('');
  const [correcting, setCorrecting] = useState(false);

  useEffect(() => {
    loadAnalysis();
  }, [analysisId]);

  const loadAnalysis = async () => {
    try {
      const data = await foodAnalysisService.getAnalysis(analysisId);
      setAnalysis(data as any);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el análisis', [
        { text: 'Volver', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToDiary = async () => {
    if (!analysis) return;
    setSavingDiary(true);
    try {
      await foodAnalysisService.addToDiary(analysis.id, analysis.mealType);
      setSavedToDiary(true);
      setTimeout(() => {
        navigation.navigate('MainTabs', { screen: 'Diary' });
      }, 800);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar en el diario');
    } finally {
      setSavingDiary(false);
    }
  };

  const openCorrection = (itemId: string, currentPortion: number) => {
    setCorrectionItemId(itemId);
    setCorrectionPortion(String(Math.round(currentPortion)));
    setCorrectionModal(true);
  };

  const handleCorrection = async () => {
    const portion = parseFloat(correctionPortion);
    if (isNaN(portion) || portion <= 0) {
      Alert.alert('Error', 'Ingresa una porción válida');
      return;
    }
    setCorrecting(true);
    try {
      const updated = await foodAnalysisService.correctAnalysis(
        analysis!.id,
        correctionItemId,
        portion,
      );
      setAnalysis(updated as any);
      setCorrectionModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo corregir');
    } finally {
      setCorrecting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text className="text-text-secondary text-sm mt-3">Cargando análisis...</Text>
      </View>
    );
  }

  if (!analysis) return null;

  const totalMacros = [
    { key: 'protein', label: 'Proteína', value: analysis.totalProtein ?? 0, unit: 'g', color: MACRO_COLORS.protein },
    { key: 'carbs', label: 'Carbohidratos', value: analysis.totalCarbs ?? 0, unit: 'g', color: MACRO_COLORS.carbs },
    { key: 'fat', label: 'Grasa', value: analysis.totalFat ?? 0, unit: 'g', color: MACRO_COLORS.fat },
    { key: 'fiber', label: 'Fibra', value: analysis.totalFiber ?? 0, unit: 'g', color: MACRO_COLORS.fiber },
  ];

  return (
    <>
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-3">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-10 h-10 rounded-full bg-background-elevated items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white font-bold text-base">Resultado del análisis</Text>
          <TouchableOpacity className="w-10 h-10 rounded-full bg-background-elevated items-center justify-center">
            <Ionicons name="share-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        >
          {/* Food image */}
          {analysis.imageUrl && (
            <View className="mx-5 mb-4 rounded-3xl overflow-hidden" style={{ height: 220 }}>
              <Image
                source={{ uri: analysis.imageUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)']}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 }}
              />
            </View>
          )}

          <View className="px-5">
            {/* Confidence badge */}
            <View className="mb-4">
              <ConfidenceBadge
                score={analysis.confidenceScore ?? 0}
                showWarning={(analysis.confidenceScore ?? 0) < 0.65}
              />
            </View>

            {/* Total calories */}
            <Card className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">Total analizado</Text>
              <Text className="text-white text-4xl font-bold mb-4">
                {Math.round(analysis.totalCalories ?? 0)}
                <Text className="text-text-muted text-xl font-normal"> kcal</Text>
              </Text>

              {/* Macro bars */}
              {totalMacros.map((macro) => (
                <View key={macro.key} className="mb-3">
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-text-secondary text-sm">{macro.label}</Text>
                    <Text className="text-white text-sm font-semibold">
                      {Math.round(macro.value)}{macro.unit}
                    </Text>
                  </View>
                  <View className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: macro.color,
                        width: `${Math.min((macro.value / (macro.value + 1)) * 100, 100)}%`,
                      }}
                    />
                  </View>
                </View>
              ))}
            </Card>

            {/* Detected foods */}
            <Text className="text-white font-bold text-lg mb-3">Alimentos detectados</Text>
            {analysis.items?.map((item: any) => (
              <View key={item.id} className="bg-[#111111] rounded-2xl mb-3 overflow-hidden">
                <View className="flex-row items-start p-4 gap-3">
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-base">
                      {item.detectedNameEs || item.detectedName}
                    </Text>
                    <Text className="text-text-muted text-sm mt-0.5">
                      {item.portionDisplay || `${Math.round(item.portionSize)}g`}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-white font-bold">{Math.round(item.calories)} kcal</Text>
                    <TouchableOpacity
                      onPress={() => openCorrection(item.id, item.portionSize)}
                      className="flex-row items-center gap-1 mt-1"
                    >
                      <Ionicons name="create-outline" size={13} color="#52525b" />
                      <Text className="text-text-muted text-xs">Corregir</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Item macros */}
                <View className="flex-row border-t border-background-border">
                  {[
                    { label: 'P', value: item.protein, color: MACRO_COLORS.protein },
                    { label: 'C', value: item.carbohydrates, color: MACRO_COLORS.carbs },
                    { label: 'G', value: item.fat, color: MACRO_COLORS.fat },
                  ].map((m) => (
                    <View key={m.label} className="flex-1 items-center py-2 border-r border-background-border last:border-r-0">
                      <Text className="text-xs font-bold mb-0.5" style={{ color: m.color }}>
                        {Math.round(m.value)}g
                      </Text>
                      <Text className="text-text-muted text-xs">{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* AI note */}
            <View className="flex-row items-start gap-2 bg-background-elevated rounded-2xl p-4 mb-4">
              <Ionicons name="sparkles-outline" size={16} color="#10b981" style={{ marginTop: 1 }} />
              <Text className="text-text-muted text-xs flex-1 leading-5">
                Análisis realizado con IA. Los valores son estimaciones. Puedes corregir las porciones tocando "Corregir".
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Bottom CTA */}
        <View
          className="absolute bottom-0 left-0 right-0 px-5 bg-black/95 border-t border-background-border"
          style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}
        >
          {savedToDiary ? (
            <View className="flex-row items-center justify-center gap-2 py-4">
              <Ionicons name="checkmark-circle" size={22} color="#10b981" />
              <Text className="text-primary font-semibold">Guardado en el diario</Text>
            </View>
          ) : (
            <Button
              title="Añadir al diario"
              onPress={handleAddToDiary}
              loading={savingDiary}
              size="lg"
              leftIcon={<Ionicons name="book-outline" size={18} color="#000" />}
            />
          )}
        </View>
      </View>

      {/* Correction Modal */}
      <Modal
        visible={correctionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setCorrectionModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View
            className="bg-[#111111] rounded-t-3xl px-6 pt-6"
            style={{ paddingBottom: insets.bottom + 24 }}
          >
            <View className="w-10 h-1 bg-background-border rounded-full self-center mb-6" />
            <Text className="text-white text-xl font-bold mb-2">Corregir porción</Text>
            <Text className="text-text-secondary text-sm mb-6">
              Ajusta el peso en gramos para recalcular las calorías.
            </Text>

            <View className="bg-background-elevated rounded-2xl flex-row items-center px-4 mb-6">
              <Ionicons name="scale-outline" size={18} color="#52525b" />
              <TextInput
                value={correctionPortion}
                onChangeText={setCorrectionPortion}
                placeholder="Gramos"
                placeholderTextColor="#52525b"
                keyboardType="decimal-pad"
                className="flex-1 text-white text-base py-4 ml-2"
                autoFocus
              />
              <Text className="text-text-muted">g</Text>
            </View>

            <Button
              title="Recalcular"
              onPress={handleCorrection}
              loading={correcting}
              size="lg"
            />
            <TouchableOpacity
              onPress={() => setCorrectionModal(false)}
              className="items-center py-4"
            >
              <Text className="text-text-muted">Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
