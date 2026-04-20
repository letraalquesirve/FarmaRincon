import PocketBase from 'pocketbase';

// URL de tu PocketBase en el VPS (cuando esté público)
// Por ahora usamos localhost con túnel SSH
const PB_URL = 'http://localhost:8090';

export const pb = new PocketBase(PB_URL);

// Autenticación de administrador (para operaciones que requieren admin)
export const loginAdmin = async (email, password) => {
  try {
    const authData = await pb.admins.authWithPassword(email, password);
    return authData;
  } catch (error) {
    console.error('Error login admin:', error);
    throw error;
  }
};
