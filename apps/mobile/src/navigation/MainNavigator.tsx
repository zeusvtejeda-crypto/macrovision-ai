import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Platform, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { DashboardScreen } from '@screens/main/DashboardScreen';
import { DiaryScreen } from '@screens/main/DiaryScreen';
import { CameraScreen } from '@screens/main/CameraScreen';
import { ProfileScreen } from '@screens/main/ProfileScreen';
import { TabIcon } from '@components/common/TabIcon';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Botón de cámara central elevado
function CameraTabButton({ onPress }: { onPress: () => void }) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className="items-center justify-center"
      style={{ marginBottom: 8 }}
    >
      <View
        className="w-16 h-16 rounded-full items-center justify-center"
        style={{
          backgroundColor: '#10b981',
          shadowColor: '#10b981',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.5,
          shadowRadius: 12,
          elevation: 8,
          marginBottom: Platform.OS === 'ios' ? 16 : 8,
        }}
      >
        <TabIcon name="camera" size={28} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

export function MainNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111111',
          borderTopColor: '#2a2a2a',
          borderTopWidth: 0.5,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: '#52525b',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} size={22} focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Diary"
        component={DiaryScreen}
        options={{
          tabBarLabel: 'Diario',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="book" color={color} size={22} focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Camera"
        component={CameraScreen}
        options={{
          tabBarLabel: '',
          tabBarButton: (props) => (
            <CameraTabButton onPress={props.onPress as () => void} />
          ),
        }}
      />

      <Tab.Screen
        name="Nutrition"
        component={DiaryScreen}
        options={{
          tabBarLabel: 'Alimentos',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="search" color={color} size={22} focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person" color={color} size={22} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
