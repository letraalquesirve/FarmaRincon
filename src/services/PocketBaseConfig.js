//const PB_URL = 'http://192.168.1.101:8090'; wifi ATT
//return 'http://10.142.75.89:8090'; //hotspot Pixel

// src/services/PocketBaseConfig.js
import PocketBase from 'pocketbase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PB_URL = 'https://gp.letraalquesirve.org';

export const pb = new PocketBase(PB_URL);

// Configurar persistencia automática
pb.authStore.onChange(() => {
  AsyncStorage.setItem(
    'pb_auth',
    JSON.stringify({
      token: pb.authStore.token,
      model: pb.authStore.model,
    })
  ).catch(console.error);
});

export const loadStoredAuth = async () => {
  try {
    const stored = await AsyncStorage.getItem('pb_auth');
    if (stored) {
      const { token, model } = JSON.parse(stored);
      if (token && model) {
        pb.authStore.save(token, model);
        return true;
      }
    }
  } catch (error) {
    console.error('Error cargando autenticación:', error);
  }
  return false;
};
