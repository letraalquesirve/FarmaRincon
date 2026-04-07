import { db } from '../../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

// Normalizar texto para búsqueda case-insensitive
const normalizeText = (text) => {
  if (!text) return '';
  return text.toLowerCase().trim();
};

// Verificar usuario en Firestore
export async function verifyUser(username) {
  try {
    const normalizedUsername = normalizeText(username);
    const userRef = doc(db, 'usuarios', normalizedUsername);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      return {
        success: true,
        user: {
          nombre: userDoc.data().nombre,
          tipo: userDoc.data().tipo,
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
