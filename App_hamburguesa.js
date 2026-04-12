// App.js
import React, { useState, useEffect, useRef } from 'react';
import {
  LogBox,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
  StatusBar,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  Home,
  Package,
  PlusCircle,
  History,
  ClipboardList,
  MinusCircle,
  Menu,
  X,
  LogOut,
  User,
} from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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

const Stack = createStackNavigator();
const DRAWER_WIDTH = Dimensions.get('window').width * 0.78;

// ── Drawer lateral hecho a mano ──────────────────────────────
function CustomDrawer({
  visible,
  onClose,
  user,
  onLogout,
  onNavigate,
  currentScreen,
  isUserAdmin,
}) {
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const menuItems = [
    { name: 'Inicio', icon: Home, screen: 'Inicio' },
    { name: 'Inventario', icon: Package, screen: 'Inventario' },
    ...(isUserAdmin ? [{ name: 'Registrar', icon: PlusCircle, screen: 'Registrar' }] : []),
    ...(isUserAdmin ? [{ name: 'Entregas', icon: MinusCircle, screen: 'Entregas' }] : []),
    { name: 'Pedidos', icon: ClipboardList, screen: 'Pedidos' },
    { name: 'Historial', icon: History, screen: 'Historial' },
  ];

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {/* Fondo oscuro */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.5)', opacity: backdropOpacity },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        {/* Panel lateral */}
        <Animated.View
          style={[
            styles.drawer,
            { width: DRAWER_WIDTH, transform: [{ translateX }], paddingTop: insets.top + 8 },
          ]}
        >
          {/* Header del drawer */}
          <View style={styles.drawerHeader}>
            <View style={styles.drawerAvatar}>
              <User color="white" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.drawerUserName}>{user?.nombre}</Text>
              <Text style={styles.drawerUserRole}>
                {user?.tipo === 'admin' ? 'Administrador' : 'Usuario'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.drawerCloseBtn}>
              <X color="#6B7280" size={20} />
            </TouchableOpacity>
          </View>

          {/* Items de navegación */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.screen;
              return (
                <TouchableOpacity
                  key={item.screen}
                  style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                  onPress={() => {
                    onNavigate(item.screen);
                    onClose();
                  }}
                >
                  <Icon color={isActive ? '#7C3AED' : '#6B7280'} size={20} />
                  <Text style={[styles.drawerItemText, isActive && styles.drawerItemTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Cerrar sesión */}
          <View style={[styles.drawerFooter, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => {
                onClose();
                onLogout();
              }}
            >
              <LogOut color="#DC2626" size={20} />
              <Text style={styles.logoutText}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Header personalizado ─────────────────────────────────────
function AppHeader({ title, onOpenDrawer }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <StatusBar backgroundColor="#6B21A8" barStyle="light-content" />
      <TouchableOpacity onPress={onOpenDrawer} style={styles.menuButton}>
        <Menu color="white" size={24} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

// ── Títulos por pantalla ─────────────────────────────────────
const SCREEN_TITLES = {
  Inicio: 'Farmacia Iglesia',
  Inventario: 'Inventario',
  Registrar: 'Registrar',
  Entregas: 'Entregas',
  Pedidos: 'Pedidos',
  Historial: 'Historial',
};

// ── App principal ────────────────────────────────────────────
export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('Inicio');
  const navigationRef = useRef(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const savedKey = await AsyncStorage.getItem('gemini_api_key');
      if (savedKey) setGeminiApiKey(savedKey);
      else setShowApiKeyModal(true);
    } catch (e) {
      console.error('Error checking API key:', e);
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
    setCurrentScreen('Inicio');
  };

  const navigateTo = (screen) => {
    setCurrentScreen(screen);
    navigationRef.current?.navigate(screen);
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

  const isUserAdmin = user ? isAdmin(user) : false;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer
          ref={navigationRef}
          onStateChange={(state) => {
            const route = state?.routes?.[state.index];
            if (route) setCurrentScreen(route.name);
          }}
        >
          {isLoggedIn ? (
            <>
              <Stack.Navigator
                screenOptions={{
                  header: ({ route }) => (
                    <AppHeader
                      title={SCREEN_TITLES[route.name] || route.name}
                      onOpenDrawer={() => setDrawerOpen(true)}
                    />
                  ),
                }}
              >
                <Stack.Screen name="Inicio">
                  {(props) => (
                    <HomeScreen
                      {...props}
                      user={user}
                      onOpenApiKeyModal={() => setShowApiKeyModal(true)}
                      onLogout={handleLogout}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="Inventario">
                  {(props) => <InventoryScreen {...props} user={user} />}
                </Stack.Screen>
                {isUserAdmin && (
                  <Stack.Screen name="Registrar">
                    {(props) => <RegisterScreen {...props} user={user} />}
                  </Stack.Screen>
                )}
                {isUserAdmin && (
                  <Stack.Screen name="Entregas">
                    {(props) => <EntregasScreen {...props} user={user} />}
                  </Stack.Screen>
                )}
                <Stack.Screen name="Pedidos">
                  {(props) => <PedidosScreen {...props} user={user} />}
                </Stack.Screen>
                <Stack.Screen name="Historial">
                  {(props) => <HistoryScreen {...props} user={user} />}
                </Stack.Screen>
              </Stack.Navigator>

              <CustomDrawer
                visible={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                user={user}
                onLogout={handleLogout}
                onNavigate={navigateTo}
                currentScreen={currentScreen}
                isUserAdmin={isUserAdmin}
              />
            </>
          ) : (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Login">
                {() => <LoginModal visible={!isLoggedIn} onLogin={handleLogin} />}
              </Stack.Screen>
            </Stack.Navigator>
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

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6B21A8',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  menuButton: { marginRight: 16, padding: 4 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', flex: 1 },

  // Drawer
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'white',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 8,
  },
  drawerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  drawerUserName: { fontSize: 15, fontWeight: 'bold', color: '#1F2937' },
  drawerUserRole: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  drawerCloseBtn: { padding: 4 },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
    borderRadius: 10,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  drawerItemActive: { backgroundColor: '#F3F0FF' },
  drawerItemText: { fontSize: 15, color: '#4B5563', fontWeight: '500' },
  drawerItemTextActive: { color: '#7C3AED', fontWeight: '700' },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    padding: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
  },
  logoutText: { color: '#DC2626', fontWeight: '600', fontSize: 15 },
});
