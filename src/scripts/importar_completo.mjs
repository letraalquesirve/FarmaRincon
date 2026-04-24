// importar_completo.mjs
import PocketBase from 'pocketbase';
import fs from 'fs';

const pb = new PocketBase('http://localhost:8090');

// ==================== DEFINICIÓN DE COLECCIONES ====================

const collections = {
  medicamentos: {
    name: 'medicamentos',
    type: 'base',
    schema: [
      { name: 'nombre', type: 'text', required: true },
      { name: 'presentacion', type: 'text' },
      { name: 'categoria', type: 'text' },
      { name: 'cantidad', type: 'number' },
      { name: 'vencimiento', type: 'date' },
      { name: 'ubicacion', type: 'text' },
      { name: 'imagen', type: 'json' },
      { name: 'userName', type: 'text' },
      { name: 'userId', type: 'text' },
      { name: 'activo', type: 'bool' },
      { name: 'fechaBaja', type: 'date' },
      { name: 'fechaRegistro', type: 'date' },
    ],
    rules: {
      listRule: '1=1',
      viewRule: '1=1',
      createRule: '1=1',
      updateRule: '1=1',
      deleteRule: '1=1',
    },
  },
  pedidos: {
    name: 'pedidos',
    type: 'base',
    schema: [
      { name: 'nombreSolicitante', type: 'text', required: true },
      { name: 'lugarResidencia', type: 'text' },
      { name: 'telefonoContacto', type: 'text' },
      { name: 'notas', type: 'text' },
      { name: 'medicamentosSolicitados', type: 'json' },
      { name: 'atendido', type: 'bool' },
      { name: 'entregasRealizadas', type: 'json' },
      { name: 'fechaPedido', type: 'date' },
      { name: 'fechaAtencion', type: 'date' },
      { name: 'creadoPor', type: 'text' },
      { name: 'atendidoPor', type: 'text' },
    ],
    rules: {
      listRule: '1=1',
      viewRule: '1=1',
      createRule: '1=1',
      updateRule: '1=1',
      deleteRule: '1=1',
    },
  },
  entregas: {
    name: 'entregas',
    type: 'base',
    schema: [
      { name: 'destino', type: 'text', required: true },
      { name: 'fechaCreacion', type: 'date' },
      { name: 'estado', type: 'text' },
      { name: 'items', type: 'json' },
      { name: 'creadoPor', type: 'text' },
      { name: 'pedidoId', type: 'text' },
      { name: 'notas', type: 'text' },
      { name: 'ultimaModificacion', type: 'date' },
    ],
    rules: {
      listRule: '1=1',
      viewRule: '1=1',
      createRule: '1=1',
      updateRule: '1=1',
      deleteRule: '1=1',
    },
  },
  usuarios: {
    name: 'usuarios',
    type: 'base',
    schema: [
      { name: 'nombre', type: 'text', required: true },
      { name: 'tipo', type: 'text' },
    ],
    rules: {
      listRule: '1=1',
      viewRule: '1=1',
      createRule: '1=1',
      updateRule: '1=1',
      deleteRule: '1=1',
    },
  },
};

// ==================== FUNCIONES AUXILIARES ====================

function sanitizeImagen(imagen) {
  if (imagen === null || imagen === undefined) return null;
  if (typeof imagen !== 'string') return null;
  if (imagen === 'null' || imagen === '') return null;
  return imagen;
}

function sanitizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function sanitizeJson(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

// ==================== CREAR O ACTUALIZAR COLECCIÓN ====================

async function crearOAsegurarColeccion(collectionName, config) {
  console.log(`\n📦 Procesando colección: ${collectionName}`);

  try {
    // Verificar si la colección existe
    let coleccion;
    try {
      coleccion = await pb.collections.getOne(collectionName);
      console.log(`   ✅ Colección "${collectionName}" ya existe`);

      // Actualizar reglas
      await pb.collections.update(coleccion.id, {
        listRule: config.rules.listRule,
        viewRule: config.rules.viewRule,
        createRule: config.rules.createRule,
        updateRule: config.rules.updateRule,
        deleteRule: config.rules.deleteRule,
      });
      console.log(`   ✅ Reglas actualizadas para "${collectionName}"`);
    } catch (error) {
      if (error.status === 404) {
        // Crear la colección
        console.log(`   📦 Creando colección "${collectionName}"...`);
        coleccion = await pb.collections.create({
          name: config.name,
          type: config.type,
          schema: config.schema,
          listRule: config.rules.listRule,
          viewRule: config.rules.viewRule,
          createRule: config.rules.createRule,
          updateRule: config.rules.updateRule,
          deleteRule: config.rules.deleteRule,
        });
        console.log(`   ✅ Colección "${collectionName}" creada`);
      } else {
        throw error;
      }
    }

    // Verificar y agregar campos faltantes
    const existingFields = new Set(coleccion.fields?.map((f) => f.name) || []);

    for (const field of config.schema) {
      if (!existingFields.has(field.name)) {
        console.log(`   📝 Agregando campo "${field.name}"...`);
        await pb.collections.update(coleccion.id, {
          fields: [...(coleccion.fields || []), field],
        });
        console.log(`   ✅ Campo "${field.name}" agregado`);
      }
    }

    return coleccion;
  } catch (error) {
    console.error(`   ❌ Error procesando "${collectionName}":`, error.message);
    throw error;
  }
}

// ==================== LIMPIAR COLECCIÓN ====================

async function limpiarColeccion(collectionName) {
  console.log(`   🗑️  Limpiando tabla "${collectionName}"...`);

  try {
    let page = 1;
    let deleted = 0;

    while (true) {
      const records = await pb.collection(collectionName).getList(page, 100, {
        requestKey: null,
      });

      if (records.items.length === 0) break;

      for (const record of records.items) {
        await pb.collection(collectionName).delete(record.id);
        deleted++;
      }

      console.log(`      Eliminados ${deleted} registros...`);
      page++;
    }

    console.log(`   ✅ ${deleted} registros eliminados de "${collectionName}"`);
  } catch (error) {
    console.error(`   ❌ Error limpiando "${collectionName}":`, error.message);
  }
}

// ==================== IMPORTAR DATOS ====================

async function importarMedicamentos(data) {
  console.log(`\n📥 Importando medicamentos...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      await pb.collection('medicamentos').create({
        id: id,
        nombre: record.nombre || '',
        presentacion: sanitizeText(record.presentacion),
        categoria: sanitizeText(record.categoria),
        cantidad: Number(record.cantidad) || 0,
        vencimiento: sanitizeText(record.vencimiento),
        ubicacion: sanitizeText(record.ubicacion),
        imagen: sanitizeImagen(record.imagen),
        userName: sanitizeText(record.userName),
        userId: sanitizeText(record.userId),
        activo: record.activo !== false,
        fechaBaja: sanitizeText(record.fechaBaja),
        fechaRegistro: sanitizeText(record.fechaRegistro),
      });
      count++;
      if (count % 100 === 0) console.log(`   ${count} procesados...`);
    } catch (error) {
      errors++;
      console.error(`   ❌ Error medicamento ${id}:`, error.message);
      if (errors >= 10) break;
    }
  }
  console.log(`   ✅ ${count} medicamentos importados (${errors} errores)`);
}

async function importarPedidos(data) {
  console.log(`\n📥 Importando pedidos...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      await pb.collection('pedidos').create({
        id: id,
        nombreSolicitante: record.nombreSolicitante || '',
        lugarResidencia: sanitizeText(record.lugarResidencia),
        telefonoContacto: sanitizeText(record.telefonoContacto),
        notas: sanitizeText(record.notas),
        medicamentosSolicitados: sanitizeJson(record.medicamentosSolicitados),
        atendido: record.atendido === true ? true : false,
        entregasRealizadas: sanitizeJson(record.entregasRealizadas),
        fechaPedido: sanitizeText(record.fechaPedido),
        fechaAtencion: sanitizeText(record.fechaAtencion),
        creadoPor: sanitizeText(record.creadoPor),
        atendidoPor: sanitizeText(record.atendidoPor),
      });
      count++;
    } catch (error) {
      errors++;
      console.error(`   ❌ Error pedido ${id}:`, error.message);
    }
  }
  console.log(`   ✅ ${count} pedidos importados (${errors} errores)`);
}

async function importarEntregas(data) {
  console.log(`\n📥 Importando entregas...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      await pb.collection('entregas').create({
        id: id,
        destino: record.destino || '',
        fechaCreacion: sanitizeText(record.fechaCreacion),
        estado: record.estado || 'abierta',
        items: sanitizeJson(record.items),
        creadoPor: sanitizeText(record.creadoPor),
        pedidoId: sanitizeText(record.pedidoId),
        notas: sanitizeText(record.notas),
        ultimaModificacion: sanitizeText(record.ultimaModificacion),
      });
      count++;
    } catch (error) {
      errors++;
      console.error(`   ❌ Error entrega ${id}:`, error.message);
    }
  }
  console.log(`   ✅ ${count} entregas importadas (${errors} errores)`);
}

async function importarUsuarios(data) {
  console.log(`\n📥 Importando usuarios...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      await pb.collection('usuarios').create({
        id: id,
        nombre: record.nombre || '',
        tipo: record.tipo || 'user',
      });
      count++;
    } catch (error) {
      errors++;
      console.error(`   ❌ Error usuario ${id}:`, error.message);
    }
  }
  console.log(`   ✅ ${count} usuarios importados (${errors} errores)`);
}

// ==================== MAIN ====================

async function runImport() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🟢 IMPORTACIÓN COMPLETA DESDE CERO');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Login
  try {
    await pb.admins.authWithPassword('geovanis.pantoja@letraalquesirve.org', 'vpsElyon8888*');
    console.log('✅ Login exitoso\n');
  } catch (error) {
    console.error('❌ Error de login:', error.message);
    console.log('\n⚠️ Si no tienes superusuario, créalo con:');
    console.log('   ./pocketbase superuser upsert admin@example.com password123\n');
    return;
  }

  // 2. Leer backup
  let backup;
  try {
    backup = JSON.parse(fs.readFileSync('farmacia-backup.json', 'utf8'));
    console.log('📦 Backup cargado correctamente\n');
  } catch (error) {
    console.error('❌ Error leyendo farmacia-backup.json:', error.message);
    return;
  }

  // 3. Crear/actualizar colecciones
  console.log('═══════════════════════════════════════════════════');
  console.log('📦 CREANDO/ACTUALIZANDO COLECCIONES');
  console.log('═══════════════════════════════════════════════════');

  for (const [name, config] of Object.entries(collections)) {
    await crearOAsegurarColeccion(name, config);
  }

  // 4. Limpiar tablas
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🗑️  LIMPIANDO TABLAS');
  console.log('═══════════════════════════════════════════════════');

  for (const name of Object.keys(collections)) {
    await limpiarColeccion(name);
  }

  // 5. Importar datos
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📤 IMPORTANDO DATOS');
  console.log('═══════════════════════════════════════════════════');

  if (backup.medicamentos) await importarMedicamentos(backup.medicamentos);
  if (backup.pedidos) await importarPedidos(backup.pedidos);
  if (backup.entregas) await importarEntregas(backup.entregas);
  if (backup.usuarios) await importarUsuarios(backup.usuarios);

  // 6. Verificar resultado
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🎉 IMPORTACIÓN COMPLETADA');
  console.log('═══════════════════════════════════════════════════');

  // Mostrar conteos finales
  for (const name of Object.keys(collections)) {
    const result = await pb.collection(name).getList(1, 1);
    console.log(`   📊 ${name}: ${result.totalItems} registros`);
  }
}

runImport().catch(console.error);
