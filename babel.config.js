module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated v4 movió su plugin de Babel al paquete
    // react-native-worklets. babel-preset-expo ya lo detecta e incluye
    // automáticamente cuando react-native-worklets está instalado -
    // no hay que declararlo a mano aquí (y si se hiciera, el nombre
    // correcto ya NO es 'react-native-reanimated/plugin' sino
    // 'react-native-worklets/plugin').
    plugins: [],
  };
};
