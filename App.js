import EventSource from 'react-native-sse';

global.EventSource = EventSource;
// App.js
import React, { useState, useEffect } from 'react';
import { LogBox, View, ActivityIndicator, Platform, Dimensions, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Home,
  Package,
  PlusCircle,
  History,
  ClipboardList,
  MinusCircle,
} from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Importar PocketBase
import { pb } from './src/services/PocketBaseConfig';

// Importar screens
import HomeScreen from './src/screens/HomeScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import PedidosScreen from './src/screens/PedidosScreen';
import EntregasScreen from './src/screens/EntregasScreen';
import ApiKeyModal from './src/components/ApiKeyModal';
import LoginModal from './src/components/LoginModal';

LogBox.ignoreLogs(['Setting a timer for a long period of time']);

const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [bottomInset, setBottomInset] = useState(20);

  // Cargar usuario guardado al iniciar
  useEffect(() => {
    const initializeApp = async () => {
      await checkApiKey();
      await loadStoredUser();
      setIsLoading(false);
    };
    initializeApp();

    if (Platform.OS === 'android') {
      setTimeout(() => {
        const { height: screenHeight } = Dimensions.get('window');
        const { height: screenHeightFull } = Dimensions.get('screen');
        const navigationBarHeight = screenHeightFull - screenHeight;
        if (navigationBarHeight > 0) {
          setBottomInset(navigationBarHeight + 10);
        } else {
          setBottomInset(32);
        }
      }, 100);
    }
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
    }
  };

  // App.js - loadStoredUser actualizado
  const loadStoredUser = async () => {
    try {
      // Cargar autenticación guardada de PocketBase
      const stored = await AsyncStorage.getItem('pb_auth');
      if (stored) {
        const { token, model } = JSON.parse(stored);
        if (token && model) {
          pb.authStore.save(token, model);
          setUser(model);
          setIsLoggedIn(true);
          console.log('✅ Sesión restaurada:', model.nombre);
          return;
        }
      }

      // No hay sesión guardada
      setIsLoggedIn(false);
    } catch (error) {
      console.error('Error loading stored user:', error);
      setIsLoggedIn(false);
    }
  };

  // App.js - handleLogin simplificado (sin autenticación compleja)
  const handleLogin = async (username) => {
    try {
      const result = await pb.collection('usuarios').getList(1, 1, {
        filter: `nombre = "${username}"`,
      });

      if (result.items.length === 0) {
        Alert.alert('Error', 'Usuario no encontrado');
        return;
      }

      const userData = result.items[0];
      setUser(userData);
      setIsLoggedIn(true);
      await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
    } catch (error) {
      console.error('❌ Error de login:', error);
      Alert.alert('Error', 'No se pudo conectar con el servidor');
    }
  };

  const handleLogout = async () => {
    pb.authStore.clear();
    await AsyncStorage.removeItem('pb_auth');
    setUser(null);
    setIsLoggedIn(false);
  };

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#F3F4F6',
        }}
      >
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  const isUserAdmin = user?.tipo === 'admin';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          {isLoggedIn ? (
            <Tab.Navigator
              screenOptions={{
                tabBarActiveTintColor: '#7C3AED',
                tabBarInactiveTintColor: '#9CA3AF',
                tabBarStyle: {
                  backgroundColor: 'white',
                  borderTopWidth: 1,
                  borderTopColor: '#E5E7EB',
                  height: Platform.OS === 'android' ? 68 + bottomInset : 60,
                  paddingBottom: Platform.OS === 'android' ? bottomInset : 5,
                  paddingTop: 5,
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
              <Tab.Screen name="Inicio" options={{ title: 'FarmaRincón' }}>
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
                <Tab.Screen
                  name="Registrar"
                  options={{
                    tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} />,
                  }}
                >
                  {(props) => <RegisterScreen {...props} user={user} />}
                </Tab.Screen>
              )}

              {isUserAdmin && (
                <Tab.Screen
                  name="Entregas"
                  options={{
                    title: 'Entregas',
                    tabBarIcon: ({ color, size }) => <MinusCircle color={color} size={size} />,
                  }}
                >
                  {(props) => <EntregasScreen {...props} user={user} />}
                </Tab.Screen>
              )}

              <Tab.Screen
                name="Pedidos"
                options={{
                  tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
                }}
              >
                {(props) => <PedidosScreen {...props} user={user} />}
              </Tab.Screen>

              <Tab.Screen
                name="Historial"
                options={{
                  tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
                }}
              >
                {(props) => <HistoryScreen {...props} user={user} />}
              </Tab.Screen>
            </Tab.Navigator>
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
