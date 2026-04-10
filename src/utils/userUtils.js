// utils/userUtils.js
export const getUserName = (user) => {
  if (!user) return 'usuario';
  if (user.nombre && user.nombre !== 'desconocido') return user.nombre;
  if (user.email) return user.email.split('@')[0];
  if (user.name) return user.name;
  if (user.userName) return user.userName;
  return 'usuario';
};
