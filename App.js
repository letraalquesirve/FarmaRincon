// App.js
import React, { useState, useEffect } from 'react';
import { LogBox, View, ActivityIndicator, Platform, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Package, PlusCircle, History, ClipboardList, MinusCircle } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

LogBox.ignoreLogs([
  '@firebase/firestore: Firestore (12.11.0): Error using user provided cache.',
  'Setting a timer for a long period of time',
]);

import HomeScreen from './src/screens/HomeScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import PedidosScreen from './src/screens/PedidosScreen';
import EntregasScreen from './src/screens/EntregasScreen';
import ApiKeyModal from './src/components/ApiKeyModal';
import LoginModal from './src/components/LoginModal';
import { isAdmin } from './src/services/AuthService';

const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const savedKey = await AsyncStorage.getItem('gemini_api_key');
      if (savedKey) {
        setGeminiApiKey(savedKey);
      } else {
        setShowApiKeyModal(true);
      }
    } catch (error) {
      console.error('Error checking API key:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (loggedUser) => {
    setUser(loggedUser);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setUser(null);
    setIsLoggedIn(false);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  const isUserAdmin = user ? isAdmin(user) : false;

  // Padding extra para dispositivos con botones de navegación
  const tabBarPadding = Platform.OS === 'android' ? { paddingBottom: 8, height: 65 } : { paddingBottom: 5, height: 60 };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          {isLoggedIn ? (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#6B21A8' }}>
              <Tab.Navigator
                screenOptions={{
                  tabBarActiveTintColor: '#7C3AED',
                  tabBarInactiveTintColor: '#9CA3AF',
                  tabBarStyle: {
                    backgroundColor: 'white',
                    borderTopWidth: 1,
                    borderTopColor: '#E5E7EB',
                    ...tabBarPadding,
                  },
                  headerStyle: {
                    backgroundColor: '#6B21A8',
                  },
                  headerTintColor: 'white',
                  headerTitleStyle: {
                    fontWeight: 'bold',
                  },
                }}
              >
                <Tab.Screen name="Inicio" options={{ title: 'Farmacia Iglesia' }}>
                  {(props) => (
                    <HomeScreen
                      {...props}
                      user={user}
                      onOpenApiKeyModal={() => setShowApiKeyModal(true)}
                      onLogout={handleLogout}
                    />
                  )}
                </Tab.Screen>

                <Tab.Screen name="Inventario" options={{ title: 'Inventario' }}>
                  {(props) => <InventoryScreen {...props} user={user} />}
                </Tab.Screen>

                {isUserAdmin && (
                  <Tab.Screen name="Registrar" options={{ tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} /> }}>
                    {(props) => <RegisterScreen {...props} user={user} />}
                  </Tab.Screen>
                )}

                {isUserAdmin && (
                  <Tab.Screen name="Entregas" options={{ tabBarIcon: ({ color, size }) => <MinusCircle color={color} size={size} /> }}>
                    {(props) => <EntregasScreen {...props} user={user} />}
                  </Tab.Screen>
                )}

                <Tab.Screen name="Pedidos" options={{ tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }}>
                  {(props) => <PedidosScreen {...props} user={user} />}
                </Tab.Screen>

                <Tab.Screen name="Historial" options={{ tabBarIcon: ({ color, size }) => <History color={color} size={size} /> }}>
                  {(props) => <HistoryScreen {...props} user={user} />}
                </Tab.Screen>
              </Tab.Navigator>
            </SafeAreaView>
          ) : (
            <LoginModal visible={!isLoggedIn} onLogin={handleLogin} />
          )}
        </NavigationContainer>

        <ApiKeyModal
          visible={showApiKeyModal}
          onClose={() => setShowApiKeyModal(false)}
          onSave={(key) => {
            setGeminiApiKey(key);
            setShowApiKeyModal(false);
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}