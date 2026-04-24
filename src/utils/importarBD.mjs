import PocketBase from 'pocketbase';
import fs from 'fs/promises';

// --- CONFIGURACIÓN ---
const PB_URL = 'http://127.0.0.1:8090';
const ADMIN_EMAIL = 'geovanis.pantoja@letraalquesirve.org';
const ADMIN_PASSWORD = 'vpsElyon8888*';
const JSON_FILE = './farmacia-backup.json';

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const sanitize = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .substring(0, 64);

async function migrate() {
  try {
    console.log('📂 Cargando archivo JSON...');
    const data = JSON.parse(await fs.readFile(JSON_FILE, 'utf8'));

    console.log('🔐 Autenticando en _superusers...');
    await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log('✅ Conectado como Superuser');

    for (const colName in data) {
      const cleanName = sanitize(colName);
      console.log(`\n--- PROCESANDO COLECCIÓN: ${cleanName} ---`);

      try {
        const collections = await pb.collections.getFullList();
        const target = collections.find((c) => c.name === cleanName);
        if (target) {
          console.log(`🗑️ Borrando colección existente: ${target.id}`);
          await pb.collections.delete(target.id);
          await new Promise((r) => setTimeout(r, 800));
        }
      } catch (e) {
        console.log(`⚠️ No se pudo borrar ${cleanName}: ${e.message}`);
      }

      const records = Object.values(data[colName]);
      const fieldsFound = new Set();
      const types = {};

      // ESCANEO PARA DETECTAR TIPOS (Especial atención a Base64)
      records.forEach((r) => {
        Object.keys(r).forEach((k) => {
          if (['id', 'created', 'updated'].includes(k.toLowerCase())) return;
          const ck = sanitize(k);
          fieldsFound.add(ck);
          const val = r[k];

          if (val !== null && !types[ck]) {
            if (typeof val === 'number') types[ck] = 'number';
            else if (typeof val === 'boolean') types[ck] = 'bool';
            else if (typeof val === 'object') types[ck] = 'json';
            // DETECCIÓN DE BASE64 O TEXTO LARGO: Forzamos a JSON para saltar el límite de 5000 chars
            else if (
              typeof val === 'string' &&
              (val.length > 2000 || ck.includes('imagen') || ck.includes('foto'))
            ) {
              types[ck] = 'json';
            } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val))
              types[ck] = 'date';
            else types[ck] = 'text';
          }
        });
      });

      const fieldsConfig = Array.from(fieldsFound).map((name) => ({
        name: name,
        type: types[name] || 'text',
        required: false,
        system: false,
      }));

      console.log(`🛠️ Creando ${cleanName} con ${fieldsConfig.length} campos...`);
      await pb.collections.create({
        name: cleanName,
        type: 'base',
        fields: fieldsConfig,
        listRule: '1=1',
        viewRule: '1=1',
        createRule: '1=1',
        updateRule: '1=1',
        deleteRule: '1=1',
      });

      console.log(`📥 Cargando ${records.length} registros...`);
      let count = 0;
      for (const row of records) {
        try {
          const cleanRow = {};
          for (const key in row) {
            if (key.toLowerCase() === 'id') continue;
            const ck = sanitize(key);
            let val = row[key];
            if (val === null) continue;

            if (types[ck] === 'date') {
              val = new Date(val).toISOString().replace('T', ' ').split('.')[0];
            }
            cleanRow[ck] = val;
          }
          await pb.collection(cleanName).create(cleanRow);
          count++;
        } catch (err) {
          console.log(
            `❌ Error en fila de ${cleanName}: ${JSON.stringify(err.data?.data || err.message)}`
          );
        }
      }
      console.log(`✅ Colección ${cleanName} lista. Registros: ${count}`);
    }
    console.log('\n🚀 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
  } catch (err) {
    console.error('💥 ERROR CRÍTICO:', err.message);
  }
}

migrate();
