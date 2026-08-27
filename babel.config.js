module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // El plugin de reanimated debe ir SIEMPRE al final del array.
    // (Nota: si `expo install` trae react-native-reanimated v4+, revisa su
    // propia documentación de instalación por si el plugin cambió de nombre
    // o de paquete — no tengo forma de confirmar esto para versiones muy
    // recientes desde aquí.)
    plugins: ['react-native-reanimated/plugin'],
  };
};
