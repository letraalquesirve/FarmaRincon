// src/services/AuthService.js
//import { pb } from './PocketBaseConfig';
import { pb } from '../services/PocketBaseConfig';

const normalizeText = (text) => {
  if (!text) return '';
  return text.toLowerCase().trim();
};

// Verificar usuario en PocketBase
export async function verifyUser(username) {
  try {
    const normalizedUsername = normalizeText(username);

    const result = await pb.collection('usuarios').getList(1, 1, {
      filter: `nombre = "${normalizedUsername}"`,
    });

    if (result.items.length > 0) {
      const user = result.items[0];
      return {
        success: true,
        user: {
          id: user.id,
          nombre: user.nombre,
          tipo: user.tipo || 'user',
        },
      };
    } else {
      return {
        success: false,
        error: 'Usuario no encontrado',
      };
    }
  } catch (error) {
    console.error('Error verificando usuario:', error);
    return {
      success: false,
      error: 'Error de conexión',
    };
  }
}

// Verificar si es admin
export function isAdmin(user) {
  return user?.tipo === 'admin';
}

// Verificar si es user normal
export function isRegularUser(user) {
  return user?.tipo === 'user';
}
