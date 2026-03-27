import React, { useState, useEffect } from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Package, PlusCircle, History, MinusCircle, ClipboardList } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Ignorar warnings específicos de Firebase (no afectan el funcionamiento)
LogBox.ignoreLogs([
  '@firebase/firestore: Firestore (12.11.0): Error using user provided cache.',
  'Setting a timer for a long period of time',
]);

import HomeScreen from './src/screens/HomeScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import SubtractScreen from './src/screens/SubtractScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import PedidosScreen from './src/screens/PedidosScreen';
import ApiKeyModal from './src/components/ApiKeyModal';

const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
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

  if (isLoading) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              tabBarActiveTintColor: '#7C3AED',
              tabBarInactiveTintColor: '#9CA3AF',
              tabBarStyle: {
                backgroundColor: 'white',
                borderTopWidth: 1,
                borderTopColor: '#E5E7EB',
                paddingBottom: 5,
                paddingTop: 5,
                height: 60,
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
              options={{ title: 'Farmacia Iglesia' }}
            >
              {(props) => <HomeScreen {...props} onOpenApiKeyModal={() => setShowApiKeyModal(true)} />}
            </Tab.Screen>

            <Tab.Screen 
              name="Inventario" 
              component={InventoryScreen}
              options={{
                tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
              }}
            />

            <Tab.Screen 
              name="Registrar" 
              component={RegisterScreen}
              options={{
                tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} />,
              }}
            />

            <Tab.Screen 
              name="Baja" 
              component={SubtractScreen}
              options={{
                tabBarIcon: ({ color, size }) => <MinusCircle color={color} size={size} />,
              }}
            />

            <Tab.Screen 
              name="Pedidos" 
              component={PedidosScreen}
              options={{
                tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
              }}
            />

            <Tab.Screen 
              name="Historial" 
              component={HistoryScreen}
              options={{
                tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
              }}
            />
          </Tab.Navigator>
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