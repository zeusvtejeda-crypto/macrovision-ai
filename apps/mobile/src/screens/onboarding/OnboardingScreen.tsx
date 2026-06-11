import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usersService } from '@services/api/users.service';
import { useAuthStore } from '@store/authStore';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 5;

type Sex = 'MALE' | 'FEMALE';
type Goal = 'LOSE_FAT' | 'MAINTAIN_WEIGHT' | 'GAIN_MUSCLE';
type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHTLY_ACTIVE'
  | 'MODERATELY_ACTIVE'
  | 'VERY_ACTIVE'
  | 'EXTREMELY_ACTIVE';
type UnitSystem = 'METRIC' | 'IMPERIAL';

interface FormData {
  unitSystem: UnitSystem;
  weightKg: string;
  heightCm: string;
  weightLbs: string;
  heightFt: string;
  heightIn: string;
  sex: Sex | null;
  age: string;
  goal: Goal | null;
  activityLevel: ActivityLevel | null;
}

const GOALS: { key: Goal; label: string; emoji: string; description: string }[] = [
  { key: 'LOSE_FAT', label: 'Perder grasa', emoji: '🔥', description: 'Déficit de 500 kcal/día' },
  { key: 'MAINTAIN_WEIGHT', label: 'Mantenerme', emoji: '⚖️', description: 'Mantener mi peso actual' },
  { key: 'GAIN_MUSCLE', label: 'Ganar músculo', emoji: '💪', description: 'Superávit de 300 kcal/día' },
];

const ACTIVITIES: { key: ActivityLevel; label: string; description: string; multiplier: string }[] = [
  { key: 'SEDENTARY', label: 'Sedentario', description: 'Trabajo de escritorio, poco ejercicio', multiplier: '×1.2' },
  { key: 'LIGHTLY_ACTIVE', label: 'Ligero', description: '1-3 días de ejercicio por semana', multiplier: '×1.375' },
  { key: 'MODERATELY_ACTIVE', label: 'Moderado', description: '3-5 días de ejercicio por semana', multiplier: '×1.55' },
  { key: 'VERY_ACTIVE', label: 'Activo', description: '6-7 días de ejercicio por semana', multiplier: '×1.725' },
  { key: 'EXTREMELY_ACTIVE', label: 'Muy activo', description: 'Entrenamiento 2× al día', multiplier: '×1.9' },
];

function estimateTDEE(data: FormData): { calories: number; protein: number; carbs: number; fat: number } | null {
  const age = parseInt(data.age);
  if (!data.sex || !data.goal || !data.activityLevel || isNaN(age)) return null;

  let weightKg: number;
  let heightCm: number;

  if (data.unitSystem === 'METRIC') {
    weightKg = parseFloat(data.weightKg);
    heightCm = parseFloat(data.heightCm);
  } else {
    weightKg = parseFloat(data.weightLbs) * 0.453592;
    const ft = parseFloat(data.heightFt) || 0;
    const inches = parseFloat(data.heightIn) || 0;
    heightCm = (ft * 12 + inches) * 2.54;
  }

  if (isNaN(weightKg) || isNaN(heightCm) || weightKg <= 0 || heightCm <= 0) return null;

  const bmr =
    data.sex === 'MALE'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const multipliers: Record<ActivityLevel, number> = {
    SEDENTARY: 1.2,
    LIGHTLY_ACTIVE: 1.375,
    MODERATELY_ACTIVE: 1.55,
    VERY_ACTIVE: 1.725,
    EXTREMELY_ACTIVE: 1.9,
  };

  const tdee = bmr * multipliers[data.activityLevel];
  const goalAdjustment = data.goal === 'LOSE_FAT' ? -500 : data.goal === 'GAIN_MUSCLE' ? 300 : 0;
  const calories = Math.max(1200, Math.round(tdee + goalAdjustment));

  const protein = Math.round((calories * 0.3) / 4);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.round((calories * 0.45) / 4);

  return { calories, protein, carbs, fat };
}

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { setUser } = useAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const slideAnim = useSharedValue(0);
  const progressAnim = useSharedValue(0);

  const [form, setForm] = useState<FormData>({
    unitSystem: 'METRIC',
    weightKg: '',
    heightCm: '',
    weightLbs: '',
    heightFt: '',
    heightIn: '',
    sex: null,
    age: '',
    goal: null,
    activityLevel: null,
  });

  const updateForm = (partial: Partial<FormData>) => setForm((f) => ({ ...f, ...partial }));

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      const next = step + 1;
      setStep(next);
      progressAnim.value = withTiming(next / (TOTAL_STEPS - 1), { duration: 400, easing: Easing.out(Easing.cubic) });
    }
  };

  const goBack = () => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      progressAnim.value = withTiming(prev / (TOTAL_STEPS - 1), { duration: 300 });
    }
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  const canAdvance = () => {
    switch (step) {
      case 0: {
        const hasMetric = form.unitSystem === 'METRIC' && form.weightKg && form.heightCm;
        const hasImperial = form.unitSystem === 'IMPERIAL' && form.weightLbs && form.heightFt;
        return !!(hasMetric || hasImperial);
      }
      case 1: return !!(form.sex && form.age && parseInt(form.age) > 0);
      case 2: return !!form.goal;
      case 3: return !!form.activityLevel;
      case 4: return true;
      default: return false;
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const payload: any = {
        unitSystem: form.unitSystem,
        sex: form.sex,
        age: parseInt(form.age),
        goal: form.goal,
        activityLevel: form.activityLevel,
      };

      if (form.unitSystem === 'METRIC') {
        payload.weightKg = parseFloat(form.weightKg);
        payload.heightCm = parseFloat(form.heightCm);
      } else {
        payload.weightLbs = parseFloat(form.weightLbs);
        payload.heightFt = parseFloat(form.heightFt);
        payload.heightIn = parseFloat(form.heightIn) || 0;
      }

      const user = await usersService.completeOnboarding(payload);
      setUser(user as any);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar tu perfil', [{ text: 'Reintentar' }]);
    } finally {
      setLoading(false);
    }
  };

  const macros = estimateTDEE(form);

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Progress bar */}
      <View className="px-6 pt-4 pb-2">
        <View className="flex-row items-center gap-3 mb-1">
          {step > 0 && (
            <TouchableOpacity onPress={goBack}>
              <Ionicons name="arrow-back" size={20} color="#71717a" />
            </TouchableOpacity>
          )}
          <Text className="text-text-muted text-sm flex-1">
            Paso {step + 1} de {TOTAL_STEPS}
          </Text>
          <Text className="text-primary text-sm font-semibold">
            {Math.round(((step + 1) / TOTAL_STEPS) * 100)}%
          </Text>
        </View>
        <View className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
          <Animated.View
            style={[progressStyle, { height: '100%', backgroundColor: '#10b981', borderRadius: 999 }]}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step 0: Body measurements */}
          {step === 0 && (
            <View className="pt-6">
              <Text className="text-white text-3xl font-bold mb-2">Tu cuerpo</Text>
              <Text className="text-text-secondary text-base mb-6 leading-6">
                Necesitamos estos datos para calcular tus calorías de mantenimiento.
              </Text>

              {/* Unit toggle */}
              <View className="flex-row bg-background-elevated rounded-2xl p-1 mb-6">
                {(['METRIC', 'IMPERIAL'] as UnitSystem[]).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    onPress={() => updateForm({ unitSystem: unit })}
                    className={`flex-1 py-2.5 rounded-xl items-center ${
                      form.unitSystem === unit ? 'bg-primary' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        form.unitSystem === unit ? 'text-black' : 'text-text-muted'
                      }`}
                    >
                      {unit === 'METRIC' ? 'Métrico (kg/cm)' : 'Imperial (lbs/ft)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {form.unitSystem === 'METRIC' ? (
                <>
                  <Input
                    label="Peso (kg)"
                    value={form.weightKg}
                    onChangeText={(v) => updateForm({ weightKg: v })}
                    placeholder="70"
                    keyboardType="decimal-pad"
                    leftIcon="fitness-outline"
                  />
                  <Input
                    label="Altura (cm)"
                    value={form.heightCm}
                    onChangeText={(v) => updateForm({ heightCm: v })}
                    placeholder="170"
                    keyboardType="decimal-pad"
                    leftIcon="resize-outline"
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Peso (lbs)"
                    value={form.weightLbs}
                    onChangeText={(v) => updateForm({ weightLbs: v })}
                    placeholder="154"
                    keyboardType="decimal-pad"
                    leftIcon="fitness-outline"
                  />
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Input
                        label="Pies"
                        value={form.heightFt}
                        onChangeText={(v) => updateForm({ heightFt: v })}
                        placeholder="5"
                        keyboardType="number-pad"
                        leftIcon="resize-outline"
                      />
                    </View>
                    <View className="flex-1">
                      <Input
                        label="Pulgadas"
                        value={form.heightIn}
                        onChangeText={(v) => updateForm({ heightIn: v })}
                        placeholder="7"
                        keyboardType="number-pad"
                        leftIcon="resize-outline"
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Step 1: Sex & Age */}
          {step === 1 && (
            <View className="pt-6">
              <Text className="text-white text-3xl font-bold mb-2">Sobre ti</Text>
              <Text className="text-text-secondary text-base mb-6 leading-6">
                Estos datos ajustan el cálculo de tu metabolismo basal.
              </Text>

              <Text className="text-text-secondary text-sm font-medium mb-3">Sexo biológico</Text>
              <View className="flex-row gap-3 mb-6">
                {([
                  { key: 'MALE' as Sex, label: 'Hombre', emoji: '♂️' },
                  { key: 'FEMALE' as Sex, label: 'Mujer', emoji: '♀️' },
                ]).map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => updateForm({ sex: item.key })}
                    className={`flex-1 py-4 rounded-2xl items-center border-2 ${
                      form.sex === item.key
                        ? 'border-primary bg-primary/10'
                        : 'border-background-border bg-background-elevated'
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text className="text-2xl mb-1">{item.emoji}</Text>
                    <Text
                      className={`text-sm font-semibold ${
                        form.sex === item.key ? 'text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label="Edad"
                value={form.age}
                onChangeText={(v) => updateForm({ age: v })}
                placeholder="25"
                keyboardType="number-pad"
                leftIcon="calendar-outline"
              />
            </View>
          )}

          {/* Step 2: Goal */}
          {step === 2 && (
            <View className="pt-6">
              <Text className="text-white text-3xl font-bold mb-2">Tu objetivo</Text>
              <Text className="text-text-secondary text-base mb-6 leading-6">
                ¿Qué quieres lograr? Ajustaremos tus calorías objetivo.
              </Text>

              <View className="gap-3">
                {GOALS.map((goal) => (
                  <TouchableOpacity
                    key={goal.key}
                    onPress={() => updateForm({ goal: goal.key })}
                    className={`flex-row items-center p-4 rounded-2xl border-2 ${
                      form.goal === goal.key
                        ? 'border-primary bg-primary/10'
                        : 'border-background-border bg-background-elevated'
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text className="text-3xl mr-4">{goal.emoji}</Text>
                    <View className="flex-1">
                      <Text
                        className={`font-semibold text-base ${
                          form.goal === goal.key ? 'text-primary' : 'text-white'
                        }`}
                      >
                        {goal.label}
                      </Text>
                      <Text className="text-text-muted text-sm mt-0.5">{goal.description}</Text>
                    </View>
                    {form.goal === goal.key && (
                      <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Step 3: Activity level */}
          {step === 3 && (
            <View className="pt-6">
              <Text className="text-white text-3xl font-bold mb-2">Nivel de actividad</Text>
              <Text className="text-text-secondary text-base mb-6 leading-6">
                ¿Cuánto ejercicio haces en una semana típica?
              </Text>

              <View className="gap-2">
                {ACTIVITIES.map((act) => (
                  <TouchableOpacity
                    key={act.key}
                    onPress={() => updateForm({ activityLevel: act.key })}
                    className={`flex-row items-center p-4 rounded-2xl border-2 ${
                      form.activityLevel === act.key
                        ? 'border-primary bg-primary/10'
                        : 'border-background-border bg-background-elevated'
                    }`}
                    activeOpacity={0.7}
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className={`font-semibold text-sm ${
                            form.activityLevel === act.key ? 'text-primary' : 'text-white'
                          }`}
                        >
                          {act.label}
                        </Text>
                        <View className="bg-background-elevated px-2 py-0.5 rounded-full">
                          <Text className="text-text-muted text-xs">{act.multiplier}</Text>
                        </View>
                      </View>
                      <Text className="text-text-muted text-xs mt-0.5">{act.description}</Text>
                    </View>
                    {form.activityLevel === act.key && (
                      <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Step 4: Macros summary */}
          {step === 4 && (
            <View className="pt-6">
              <View className="w-16 h-16 rounded-2xl bg-primary/15 items-center justify-center mb-5">
                <Ionicons name="nutrition-outline" size={28} color="#10b981" />
              </View>

              <Text className="text-white text-3xl font-bold mb-2">Tu plan está listo</Text>
              <Text className="text-text-secondary text-base mb-8 leading-6">
                Basándonos en tus datos, estos son tus objetivos diarios personalizados.
              </Text>

              {macros ? (
                <>
                  {/* Calories card */}
                  <LinearGradient
                    colors={['rgba(16,185,129,0.15)', 'rgba(16,185,129,0.05)']}
                    className="rounded-3xl p-5 mb-4"
                  >
                    <Text className="text-text-secondary text-sm mb-1">Calorías objetivo</Text>
                    <Text className="text-white text-5xl font-bold">
                      {macros.calories}
                      <Text className="text-text-muted text-2xl font-normal"> kcal</Text>
                    </Text>
                  </LinearGradient>

                  {/* Macros grid */}
                  <View className="flex-row gap-3 mb-6">
                    {[
                      { label: 'Proteína', value: macros.protein, unit: 'g', color: '#3b82f6' },
                      { label: 'Carbs', value: macros.carbs, unit: 'g', color: '#f59e0b' },
                      { label: 'Grasa', value: macros.fat, unit: 'g', color: '#a855f7' },
                    ].map((macro) => (
                      <View
                        key={macro.label}
                        className="flex-1 bg-background-elevated rounded-2xl p-3 items-center"
                      >
                        <View
                          className="w-8 h-1 rounded-full mb-2"
                          style={{ backgroundColor: macro.color }}
                        />
                        <Text className="text-white text-xl font-bold">
                          {macro.value}
                          <Text className="text-text-muted text-sm font-normal">{macro.unit}</Text>
                        </Text>
                        <Text className="text-text-muted text-xs mt-0.5">{macro.label}</Text>
                      </View>
                    ))}
                  </View>

                  <View className="bg-background-elevated rounded-2xl p-4 mb-6">
                    <View className="flex-row items-start gap-2">
                      <Ionicons name="information-circle-outline" size={16} color="#52525b" style={{ marginTop: 1 }} />
                      <Text className="text-text-muted text-sm flex-1 leading-5">
                        Estos valores se pueden ajustar en cualquier momento desde tu perfil.
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View className="bg-background-elevated rounded-2xl p-4 mb-6">
                  <Text className="text-text-muted text-sm">
                    Faltan algunos datos para calcular tus macros. Puedes completarlos después en tu perfil.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* CTA Button */}
          <View className="mt-6">
            {step < TOTAL_STEPS - 1 ? (
              <Button
                title="Continuar"
                onPress={goNext}
                disabled={!canAdvance()}
                size="lg"
                rightIcon={<Ionicons name="arrow-forward" size={18} color={canAdvance() ? '#000' : '#52525b'} />}
              />
            ) : (
              <Button
                title="Empezar a usar MacroVision"
                onPress={handleFinish}
                loading={loading}
                size="lg"
              />
            )}

            {step < TOTAL_STEPS - 1 && (
              <TouchableOpacity onPress={goNext} className="items-center mt-3">
                <Text className="text-text-muted text-sm">Saltar por ahora</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
