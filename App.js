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

// ✅ IMPORTACIONES CORREGIDAS - AGREGAR getAllMedicamentos
import {
  getAllUsuarios,
  saveUsuario,
  initDatabase,
  getAllMedicamentos, // ✅ ESTA FALTABA
} from './src/services/SQLiteService';

// ✅ IMPORTACIONES CORRECTAS de SyncService
import {
  initialFullSync,
  startPeriodicSync,
  syncWithServer,
  isPocketBaseAvailable,
  stopPeriodicSync,
} from './src/services/SyncService';

LogBox.ignoreLogs(['Setting a timer for a long period of time']);

const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [bottomInset, setBottomInset] = useState(20);

  // ✅ UN SOLO useEffect para inicialización de BD y sincronización
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      if (!isMounted) return;

      console.log('🚀 Inicializando aplicación...');

      // 1. Inicializar SQLite
      await initDatabase();
      console.log('✅ Base de datos SQLite inicializada');

      // 2. Verificar conexión y sincronizar
      const available = await isPocketBaseAvailable();
      console.log(`📡 PocketBase disponible: ${available}`);

      if (available && isMounted) {
        try {
          // Verificar si SQLite tiene datos
          const localMedicamentos = await getAllMedicamentos();
          console.log(`📦 Medicamentos locales: ${localMedicamentos?.length || 0}`);

          if (!localMedicamentos || localMedicamentos.length === 0) {
            console.log('📥 SQLite vacío, haciendo sync inicial completo...');
            await initialFullSync();
          } else {
            console.log('📦 SQLite ya tiene datos, sincronizando cambios...');
            await syncWithServer();
          }

          // Iniciar sincronización periódica SOLO UNA VEZ
          startPeriodicSync(30000);
          console.log('🔄 Sincronización periódica iniciada');
        } catch (syncError) {
          console.error('❌ Error en sincronización inicial:', syncError);
        }
      } else {
        console.log('📡 Sin conexión, usando datos locales');
      }
    };

    initialize();

    // Cleanup al desmontar
    return () => {
      isMounted = false;
      console.log('🛑 Deteniendo sincronización periódica...');
      stopPeriodicSync();
    };
  }, []);

  // ✅ useEffect para API Key y usuario
  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      if (!isMounted) return;

      await checkApiKey();
      await loadStoredUser();

      if (isMounted) {
        setIsLoading(false);
      }
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

    return () => {
      isMounted = false;
    };
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

      // También verificar usuario guardado localmente
      const localUserStr = await AsyncStorage.getItem('currentUser');
      if (localUserStr) {
        const localUser = JSON.parse(localUserStr);
        setUser(localUser);
        setIsLoggedIn(true);
        console.log('✅ Usuario local restaurado:', localUser.nombre);
        return;
      }

      // No hay sesión guardada
      setIsLoggedIn(false);
    } catch (error) {
      console.error('Error loading stored user:', error);
      setIsLoggedIn(false);
    }
  };

  const handleLogin = async (username) => {
    try {
      // ✅ Primero buscar en SQLite local (funciona sin conexión)
      const localUsers = await getAllUsuarios();
      const localUser = localUsers.find(
        (u) => u.nombre?.toLowerCase().trim() === username.toLowerCase().trim()
      );

      if (localUser) {
        setUser(localUser);
        setIsLoggedIn(true);
        await AsyncStorage.setItem('currentUser', JSON.stringify(localUser));
        console.log('✅ Login desde SQLite local:', localUser.nombre);
        return;
      }

      // ✅ Si no está en local, intentar PocketBase
      const result = await pb.collection('usuarios').getList(1, 1, {
        filter: `nombre = "${username}"`,
        requestKey: null,
      });

      if (result.items.length === 0) {
        Alert.alert('Error', 'Usuario no encontrado');
        return;
      }

      const userData = result.items[0];
      // Guardar en SQLite para próximo login offline
      await saveUsuario(userData, 'synced', null);
      setUser(userData);
      setIsLoggedIn(true);
      await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
      console.log('✅ Login desde PocketBase:', userData.nombre);
    } catch (error) {
      console.error('❌ Error de login:', error);
      Alert.alert('Error', 'Usuario no encontrado y sin conexión al servidor');
    }
  };

  const handleLogout = async () => {
    pb.authStore.clear();
    await AsyncStorage.removeItem('pb_auth');
    await AsyncStorage.removeItem('currentUser');
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
