// App.js
import React, { useState, useEffect } from 'react';
import { LogBox, View, ActivityIndicator, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
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

// BD local (ya no dependemos de PocketBase en vivo para leer/escribir)
import { initDatabase } from './src/services/SQLiteService';
import { usuarioGetByNombre } from './src/services/LocalDataService';

// Importar screens
import HomeScreen from './src/screens/HomeScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import PedidosScreen from './src/screens/PedidosScreen';
import EntregasScreen from './src/screens/EntregasScreen';
import ApiKeyModal from './src/components/ApiKeyModal';
import LoginModal from './src/components/LoginModal';
import CustomDrawerContent from './src/components/CustomDrawerContent';

// ❌ NOTIFICACIONES PUSH COMENTADAS (offline-first)
// import { registerForPushNotifications } from './src/services/NotificationService';

LogBox.ignoreLogs(['Setting a timer for a long period of time']);

const Drawer = createDrawerNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');

  // ── Cargar usuario guardado al iniciar ──
  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      if (!isMounted) return;

      await initDatabase();
      await checkApiKey();
      await loadStoredUser();

      if (isMounted) {
        setIsLoading(false);
      }
    };

    initializeApp();

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
      // Verificar usuario guardado localmente (login es 100% local ahora)
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
      const userData = await usuarioGetByNombre(username);

      if (!userData) {
        Alert.alert(
          'Usuario no encontrado',
          'No existe ese usuario en la base de datos local. Si eres un usuario nuevo, pide al administrador que suba una copia actualizada, o descárgala desde "Cargar desde servidor" en Inicio.'
        );
        return;
      }

      setUser(userData);
      setIsLoggedIn(true);
      await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
      console.log('✅ Login exitoso (local):', userData.nombre);
    } catch (error) {
      console.error('❌ Error de login:', error);
      Alert.alert('Error', 'No se pudo verificar el usuario en la base de datos local');
    }
  };

  const handleLogout = async () => {
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
            <Drawer.Navigator
              drawerContent={(props) => (
                <CustomDrawerContent {...props} user={user} onLogout={handleLogout} />
              )}
              screenOptions={{
                drawerActiveTintColor: '#7C3AED',
                drawerInactiveTintColor: '#4B5563',
                headerStyle: {
                  backgroundColor: '#6B21A8',
                },
                headerTintColor: 'white',
                headerTitleStyle: {
                  fontWeight: 'bold',
                },
              }}
            >
              <Drawer.Screen
                name="Inicio"
                options={{
                  title: 'FarmaRincón',
                  drawerIcon: ({ color, size }) => <Home color={color} size={size} />,
                }}
              >
                {(props) => (
                  <HomeScreen
                    {...props}
                    user={user}
                    onOpenApiKeyModal={() => setShowApiKeyModal(true)}
                    onLogout={handleLogout}
                  />
                )}
              </Drawer.Screen>

              <Drawer.Screen
                name="Inventario"
                options={{
                  title: 'Inventario',
                  drawerIcon: ({ color, size }) => <Package color={color} size={size} />,
                  unmountOnBlur: true,
                }}
              >
                {(props) => <InventoryScreen {...props} user={user} />}
              </Drawer.Screen>

              {isUserAdmin && (
                <Drawer.Screen
                  name="Registrar"
                  options={{
                    title: 'Registrar',
                    drawerIcon: ({ color, size }) => <PlusCircle color={color} size={size} />,
                  }}
                >
                  {(props) => <RegisterScreen {...props} user={user} />}
                </Drawer.Screen>
              )}

              {isUserAdmin && (
                <Drawer.Screen
                  name="Entregas"
                  options={{
                    title: 'Entregas',
                    drawerIcon: ({ color, size }) => <MinusCircle color={color} size={size} />,
                  }}
                >
                  {(props) => <EntregasScreen {...props} user={user} />}
                </Drawer.Screen>
              )}

              <Drawer.Screen
                name="Pedidos"
                options={{
                  title: 'Pedidos',
                  drawerIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
                }}
              >
                {(props) => <PedidosScreen {...props} user={user} />}
              </Drawer.Screen>

              <Drawer.Screen
                name="Historial"
                options={{
                  title: 'Historial',
                  drawerIcon: ({ color, size }) => <History color={color} size={size} />,
                }}
              >
                {(props) => <HistoryScreen {...props} user={user} />}
              </Drawer.Screen>
            </Drawer.Navigator>
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
