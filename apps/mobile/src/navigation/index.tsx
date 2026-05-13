import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors, radius } from '../theme';

import { HomeScreen } from '../screens/HomeScreen';
import { FarmersScreen } from '../screens/FarmersScreen';
import { AddFarmerScreen } from '../screens/AddFarmerScreen';
import { FarmerDetailScreen } from '../screens/FarmerDetailScreen';
import { AddLandPlotScreen } from '../screens/AddLandPlotScreen';
import { GPSProofScreen } from '../screens/GPSProofScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { ActivityScreen } from '../screens/ActivityScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface, elevation: 0, shadowOpacity: 0 },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
  headerBackTitleVisible: false,
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddFarmer" component={AddFarmerScreen} options={{ title: 'Register Farmer' }} />
      <Stack.Screen name="AddPlot" component={AddLandPlotScreen} options={{ title: 'Add Land Plot' }} />
      <Stack.Screen name="GPSProof" component={GPSProofScreen} options={{ title: 'GPS Proof of Action' }} />
      <Stack.Screen name="FarmerDetail" component={FarmerDetailScreen} options={({ route }) => ({ title: (route.params as any)?.farmer?.name ?? 'Farmer' })} />
      <Stack.Screen name="Transactions" component={SyncScreen} options={{ title: 'Transactions' }} />
      <Stack.Screen name="Activity" component={ActivityScreen} options={{ title: 'Live Activity' }} />
    </Stack.Navigator>
  );
}

function FarmersStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="FarmersList" component={FarmersScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddFarmer" component={AddFarmerScreen} options={{ title: 'Register Farmer' }} />
      <Stack.Screen name="FarmerDetail" component={FarmerDetailScreen} options={({ route }) => ({ title: (route.params as any)?.farmer?.name ?? 'Farmer' })} />
      <Stack.Screen name="AddPlot" component={AddLandPlotScreen} options={{ title: 'Add Land Plot' }} />
      <Stack.Screen name="GPSProof" component={GPSProofScreen} options={{ title: 'GPS Proof of Action' }} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 84,
            paddingBottom: 24,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, string> = {
              HomeTab: '🏠', FarmersTab: '👥', GPSTab: '📍', ActivityTab: '📡', SyncTab: '🔄',
            };
            return <Text style={{ fontSize: size - 4 }}>{icons[route.name] ?? '•'}</Text>;
          },
        })}
      >
        <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: 'Dashboard' }} />
        <Tab.Screen name="FarmersTab" component={FarmersStack} options={{ title: 'Farmers' }} />
        <Tab.Screen name="GPSTab" component={GPSProofScreen} options={{ title: 'GPS Proof' }} />
        <Tab.Screen name="ActivityTab" component={ActivityScreen} options={{ title: 'Live Events' }} />
        <Tab.Screen name="SyncTab" component={SyncScreen} options={{ title: 'Sync' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
