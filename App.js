// App.js
import React, { useState, useEffect } from 'react';
import { LogBox, View, ActivityIndicator, Alert, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Package, PlusCircle, History, ClipboardList, MinusCircle } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

// BD local (ya no dependemos de PocketBase en vivo para leer/escribir)
import { initDatabase } from './src/services/SQLiteService';
import { usuarioGetByNombre } from './src/services/LocalDataService';
import {
  registrarPushTokenUsuarioActual,
  procesarColaPendiente,
  ejecutarChequeoDiario,
} from './src/services/AdminNotificationService';

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

// Envuelto en un componente aparte porque useSafeAreaInsets() necesita estar
// DENTRO de <SafeAreaProvider> para funcionar - no se puede llamar en el
// mismo componente que lo declara.
function AppNavigator({ user, isUserAdmin, onOpenApiKeyModal, onLogout }) {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          // insets.bottom es el valor REAL que reporta Android para lo que
          // sea que tenga activo (3 botones, gestos, 2 botones) - se
          // actualiza solo si la persona cambia el modo de navegación en
          // Ajustes, sin que la app tenga que adivinar nada.
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 5,
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
      <Tab.Screen
        name="Inicio"
        options={{
          title: 'FarmaRincón',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      >
        {(props) => (
          <HomeScreen {...props} user={user} onOpenApiKeyModal={onOpenApiKeyModal} onLogout={onLogout} />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Inventario"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
          unmountOnBlur: true,
        }}
      >
        {(props) => <InventoryScreen {...props} user={user} />}
      </Tab.Screen>

      {isUserAdmin && (
        <Tab.Screen
          name="Registrar"
          options={{
            title: 'Registrar',
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
          title: 'Pedidos',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      >
        {(props) => <PedidosScreen {...props} user={user} />}
      </Tab.Screen>

      <Tab.Screen
        name="Historial"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      >
        {(props) => <HistoryScreen {...props} user={user} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

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

  // ── Notificaciones: registrar token, vaciar cola pendiente, chequeo
  // diario de vencimientos/seguimiento - se dispara cada vez que hay
  // sesión activa (login fresco o restaurada), y también cada vez que
  // la app vuelve a primer plano (para reintentar la cola sin red).
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const correrNotificaciones = async () => {
      await registrarPushTokenUsuarioActual(user);
      await procesarColaPendiente();
      await ejecutarChequeoDiario();
    };

    correrNotificaciones();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        procesarColaPendiente();
      }
    });

    return () => subscription.remove();
  }, [isLoggedIn, user]);

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
            <AppNavigator
              user={user}
              isUserAdmin={isUserAdmin}
              onOpenApiKeyModal={() => setShowApiKeyModal(true)}
              onLogout={handleLogout}
            />
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
