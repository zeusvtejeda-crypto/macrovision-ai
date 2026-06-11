import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { foodAnalysisService } from '@services/api/food-analysis.service';
import { useAuthStore } from '@store/authStore';

type FlashMode = 'off' | 'on' | 'auto';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
const MEAL_LABELS: Record<string, string> = {
  BREAKFAST: 'Desayuno',
  LUNCH: 'Comida',
  DINNER: 'Cena',
  SNACK: 'Snack',
};

export function CameraScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [selectedMeal, setSelectedMeal] = useState<string>('LUNCH');
  const [analyzing, setAnalyzing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const shutterAnim = useSharedValue(1);

  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterAnim.value }],
  }));

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || analyzing) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    shutterAnim.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withSpring(1, { damping: 8 }),
    );

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        exif: false,
      });
      if (photo) {
        await analyzePhoto(photo.uri);
      }
    } catch {
      Alert.alert('Error', 'No se pudo tomar la foto');
    }
  }, [analyzing]);

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      await analyzePhoto(result.assets[0].uri);
    }
  }, []);

  const analyzePhoto = async (uri: string) => {
    setAnalyzing(true);
    setCaptureProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setCaptureProgress((p) => Math.min(p + 8, 85));
      }, 300);

      const analysis = await foodAnalysisService.analyzeImage(uri, selectedMeal);
      clearInterval(progressInterval);
      setCaptureProgress(100);

      await new Promise((r) => setTimeout(r, 300));

      navigation.navigate('AnalysisResult', { analysisId: analysis.id });
    } catch (err: any) {
      const message = err.message || 'No se pudo analizar la imagen';
      const isLimitError = message.includes('límite') || message.includes('limit');

      Alert.alert(
        isLimitError ? 'Límite diario alcanzado' : 'Error de análisis',
        isLimitError
          ? 'Has usado tus 3 análisis gratuitos de hoy. Actualiza a Premium para análisis ilimitados.'
          : message,
        isLimitError
          ? [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Ver Premium', onPress: () => navigation.navigate('Premium') },
            ]
          : [{ text: 'Entendido' }],
      );
    } finally {
      setAnalyzing(false);
      setCaptureProgress(0);
    }
  };

  const cycleFlash = () => {
    setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'));
  };

  const flashIcon = flash === 'on' ? 'flash' : flash === 'auto' ? 'flash-outline' : 'flash-off-outline';

  if (!permission) return <View className="flex-1 bg-black" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Ionicons name="camera-outline" size={64} color="#10b981" />
        <Text className="text-white text-xl font-bold mt-6 mb-3 text-center">
          Acceso a la cámara
        </Text>
        <Text className="text-text-secondary text-base text-center mb-8 leading-6">
          MacroVision necesita acceso a tu cámara para analizar tus comidas con IA.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="bg-primary px-8 py-4 rounded-2xl"
        >
          <Text className="text-black font-bold text-base">Permitir acceso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Camera */}
      <CameraView
        ref={cameraRef}
        className="flex-1"
        facing={facing}
        flash={flash}
      >
        {/* Top overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent']}
          style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 20 }}
        >
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>

            <Text className="text-white font-semibold text-base">
              Analizar comida
            </Text>

            <TouchableOpacity
              onPress={cycleFlash}
              className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <Ionicons name={flashIcon as any} size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Meal type selector */}
          <View className="flex-row mt-4 gap-2 justify-center">
            {MEAL_TYPES.map((meal) => (
              <TouchableOpacity
                key={meal}
                onPress={() => setSelectedMeal(meal)}
                className={`px-3 py-1.5 rounded-full ${
                  selectedMeal === meal ? 'bg-primary' : 'bg-black/50'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    selectedMeal === meal ? 'text-black' : 'text-white'
                  }`}
                >
                  {MEAL_LABELS[meal]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* Center: viewfinder corners */}
        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-64 relative">
            {/* Corner brackets */}
            {[
              { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
              { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
              { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
              { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
            ].map((style, i) => (
              <View
                key={i}
                style={[
                  { position: 'absolute', width: 24, height: 24, borderColor: '#10b981' },
                  style,
                ]}
              />
            ))}
          </View>
          {!analyzing && (
            <Text className="text-white/60 text-sm mt-6 text-center">
              Centra tu comida en el encuadre
            </Text>
          )}
        </View>

        {/* Bottom overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 24, paddingTop: 32 }}
        >
          {/* Analysis progress */}
          {analyzing && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-white text-sm font-medium">Analizando con IA...</Text>
                <Text className="text-primary text-sm">{captureProgress}%</Text>
              </View>
              <View className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${captureProgress}%` }}
                />
              </View>
            </View>
          )}

          {/* Controls */}
          <View className="flex-row items-center justify-between">
            {/* Gallery */}
            <TouchableOpacity
              onPress={pickFromGallery}
              disabled={analyzing}
              className="w-14 h-14 rounded-2xl bg-white/15 items-center justify-center"
            >
              <Ionicons name="images-outline" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Shutter */}
            <Animated.View style={shutterStyle}>
              <TouchableOpacity
                onPress={takePhoto}
                disabled={analyzing}
                className="w-20 h-20 rounded-full bg-white items-center justify-center"
                style={{ opacity: analyzing ? 0.5 : 1 }}
              >
                {analyzing ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <View className="w-16 h-16 rounded-full border-4 border-black" />
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Flip camera */}
            <TouchableOpacity
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              disabled={analyzing}
              className="w-14 h-14 rounded-2xl bg-white/15 items-center justify-center"
            >
              <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Free plan indicator */}
          {!user?.subscription && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Premium')}
              className="flex-row items-center justify-center gap-1.5 mt-5"
            >
              <Ionicons name="flash-outline" size={14} color="#f59e0b" />
              <Text className="text-amber-400 text-xs">
                Plan gratuito · 3 análisis/día · Actualizar
              </Text>
            </TouchableOpacity>
          )}
        </LinearGradient>
      </CameraView>
    </View>
  );
}
