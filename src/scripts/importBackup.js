// scripts/importBackup.js
// Ejecutar con: npx expo run:android o npx expo start y luego en consola aparte
// O crear un botón temporal en la app para ejecutar esta importación

import * as FileSystem from 'expo-file-system';
import { initDatabase, importBackup } from '../services/SQLiteService';

export const runImport = async () => {
  console.log('🚀 Iniciando importación del backup...');

  try {
    // Ubicar el archivo JSON (puede estar en assets o descargado)
    const backupPath = FileSystem.documentDirectory + 'farmacia-backup.json';

    // Verificar si existe
    const fileInfo = await FileSystem.getInfoAsync(backupPath);

    if (!fileInfo.exists) {
      console.error('❌ No se encontró farmacia-backup.json en:', backupPath);
      console.log('📌 Coloca el archivo en:', backupPath);
      return;
    }

    // Leer el archivo
    const content = await FileSystem.readAsStringAsync(backupPath);
    const backup = JSON.parse(content);

    // Inicializar BD
    await initDatabase();

    // Importar
    const counts = await importBackup(backup);

    console.log('🎉 Importación exitosa!');
    console.log(`   Medicamentos: ${counts.medicamentos}`);
    console.log(`   Pedidos: ${counts.pedidos}`);
    console.log(`   Entregas: ${counts.entregas}`);
    console.log(`   Usuarios: ${counts.usuarios}`);
  } catch (error) {
    console.error('❌ Error en importación:', error);
  }
};

// Para ejecutar directamente
if (require.main === module) {
  runImport();
}
