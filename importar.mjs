// importar.mjs
import PocketBase from 'pocketbase';
import fs from 'fs';

const pb = new PocketBase('http://localhost:8090');

// ── Helpers ──────────────────────────────────────────────────

function sanitizeImagen(imagen) {
  if (imagen === null || imagen === undefined) return null;
  if (typeof imagen !== 'string') return null;
  if (imagen === 'null' || imagen === '') return null;
  return imagen;
}

function sanitizeJson(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function sanitizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

// ── CREAR COLECCIONES SI NO EXISTEN ───────────────────────────

async function crearColeccionSiNoExiste(nombre, schema) {
  try {
    // Intentar obtener la colección
    await pb.collection(nombre).getOne('dummy');
    console.log(`   ✅ Colección "${nombre}" ya existe`);
  } catch (error) {
    if (error.status === 404) {
      console.log(`   📦 Creando colección "${nombre}"...`);
      await pb.collections.create({
        name: nombre,
        type: 'base',
        schema: schema,
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
      });
      console.log(`   ✅ Colección "${nombre}" creada`);
    } else {
      throw error;
    }
  }
}

async function crearColeccionesSiNoExisten() {
  console.log(`📦 Verificando/Creando colecciones...`);

  // Schema para medicamentos
  const medicamentosSchema = [
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
  ];

  // Schema para pedidos
  const pedidosSchema = [
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
  ];

  // Schema para entregas
  const entregasSchema = [
    { name: 'destino', type: 'text', required: true },
    { name: 'fechaCreacion', type: 'date' },
    { name: 'estado', type: 'text' },
    { name: 'items', type: 'json' },
    { name: 'creadoPor', type: 'text' },
    { name: 'pedidoId', type: 'text' },
    { name: 'notas', type: 'text' },
    { name: 'ultimaModificacion', type: 'date' },
  ];

  // Schema para usuarios
  const usuariosSchema = [
    { name: 'nombre', type: 'text', required: true },
    { name: 'tipo', type: 'text' },
  ];

  await crearColeccionSiNoExiste('medicamentos', medicamentosSchema);
  await crearColeccionSiNoExiste('pedidos', pedidosSchema);
  await crearColeccionSiNoExiste('entregas', entregasSchema);
  await crearColeccionSiNoExiste('usuarios', usuariosSchema);

  console.log(`✅ Todas las colecciones verificadas/creadas\n`);
}

// ── LIMPIEZA DE TABLAS (ahora seguro) ─────────────────────────

async function limpiarColeccion(nombreColeccion) {
  console.log(`🧹 Limpiando colección: ${nombreColeccion}...`);

  try {
    const records = await pb.collection(nombreColeccion).getFullList({
      requestKey: null,
    });

    console.log(`   📊 Encontrados ${records.length} registros para eliminar`);

    let eliminados = 0;
    let errores = 0;

    for (const record of records) {
      try {
        await pb.collection(nombreColeccion).delete(record.id);
        eliminados++;
        if (eliminados % 100 === 0) {
          console.log(`   🗑️  ${eliminados} registros eliminados...`);
        }
      } catch (error) {
        errores++;
        console.error(`   ❌ Error eliminando registro ${record.id}:`, error.message);
      }
    }

    console.log(`   ✅ ${eliminados} registros eliminados (${errores} errores)`);
  } catch (error) {
    if (error.status === 404) {
      console.log(`   ⚠️ La colección "${nombreColeccion}" no existe, omitiendo limpieza`);
    } else {
      console.error(`   ❌ Error limpiando colección ${nombreColeccion}:`, error.message);
    }
  }
}

// ── Importadores por colección ───────────────────────────────

async function importMedicamentos(data) {
  console.log(`📥 Importando medicamentos...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      const doc = {
        nombre: record.nombre || '',
        presentacion: sanitizeText(record.presentacion),
        categoria: sanitizeText(record.categoria),
        cantidad: Number(record.cantidad) || 0,
        vencimiento: sanitizeText(record.vencimiento),
        ubicacion: sanitizeText(record.ubicacion),
        imagen: sanitizeImagen(record.imagen),
        userName: sanitizeText(record.userName),
        userId: sanitizeText(record.userId),
        activo:
          record.activo == false || record.activo === 'false' || record.activo === 'False'
            ? false
            : true,
        fechaBaja: sanitizeText(record.fechaBaja),
        fechaRegistro: sanitizeText(record.fechaRegistro),
      };

      await pb.collection('medicamentos').create(doc);
      count++;
      if (count % 100 === 0) console.log(`   ${count} procesados...`);
    } catch (error) {
      errors++;
      console.error(`   ❌ Error medicamento ${id}:`, error.message);
      if (errors >= 5) {
        console.error('   ... deteniendo detalle de errores');
        break;
      }
    }
  }
  console.log(`   ✅ ${count} importados (${errors} errores)\n`);
}

async function importPedidos(data) {
  console.log(`📥 Importando pedidos...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      const doc = {
        nombreSolicitante: record.nombreSolicitante || '',
        lugarResidencia: sanitizeText(record.lugarResidencia),
        telefonoContacto: sanitizeText(record.telefonoContacto),
        notas: sanitizeText(record.notas),
        medicamentosSolicitados: sanitizeJson(record.medicamentosSolicitados),
        atendido:
          record.atendido === false || record.atendido === 'false' || record.atendido === 'False'
            ? false
            : true,
        entregasRealizadas: sanitizeJson(record.entregasRealizadas),
        fechaPedido: sanitizeText(record.fechaPedido),
        fechaAtencion: sanitizeText(record.fechaAtencion),
        creadoPor: sanitizeText(record.creadoPor),
        atendidoPor: sanitizeText(record.atendidoPor),
      };

      await pb.collection('pedidos').create(doc);
      count++;
    } catch (error) {
      errors++;
      console.error(`   ❌ Error pedido ${id}:`, error.message);
    }
  }
  console.log(`   ✅ ${count} importados (${errors} errores)\n`);
}

async function importEntregas(data) {
  console.log(`📥 Importando entregas...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      const doc = {
        destino: record.destino || '',
        fechaCreacion: sanitizeText(record.fechaCreacion),
        estado: record.estado || 'abierta',
        items: sanitizeJson(record.items),
        creadoPor: sanitizeText(record.creadoPor),
        pedidoId: sanitizeText(record.pedidoId),
        notas: sanitizeText(record.notas),
        ultimaModificacion: sanitizeText(record.ultimaModificacion),
      };

      await pb.collection('entregas').create(doc);
      count++;
    } catch (error) {
      errors++;
      console.error(`   ❌ Error entrega ${id}:`, error.message);
    }
  }
  console.log(`   ✅ ${count} importados (${errors} errores)\n`);
}

async function importUsuarios(data) {
  console.log(`📥 Importando usuarios...`);
  let count = 0;
  let errors = 0;

  for (const [id, record] of Object.entries(data)) {
    try {
      const doc = {
        nombre: record.nombre || '',
        tipo: record.tipo || 'user',
      };

      await pb.collection('usuarios').create(doc);
      count++;
    } catch (error) {
      errors++;
      console.error(`   ❌ Error usuario ${id}:`, error.message);
    }
  }
  console.log(`   ✅ ${count} importados (${errors} errores)\n`);
}

// ── Main ─────────────────────────────────────────────────────

async function runImport() {
  console.log('🟢 Iniciando importación a PocketBase...\n');

  try {
    await pb.admins.authWithPassword('geovanis.pantoja@letraalquesirve.org', 'vpsElyon8888*');
    console.log('✅ Login exitoso\n');
  } catch (error) {
    console.error('❌ Error de login:', error.message);
    return;
  }

  // Crear colecciones si no existen
  await crearColeccionesSiNoExisten();

  const backup = JSON.parse(fs.readFileSync('farmacia-backup.json', 'utf8'));
  console.log('📦 Backup cargado correctamente\n');

  console.log('═══════════════════════════════════════════════════');
  console.log('🗑️  INICIANDO LIMPIEZA DE TABLAS');
  console.log('═══════════════════════════════════════════════════\n');

  // Limpiar en orden inverso a las dependencias
  if (backup.entregas) await limpiarColeccion('entregas');
  if (backup.pedidos) await limpiarColeccion('pedidos');
  if (backup.medicamentos) await limpiarColeccion('medicamentos');
  if (backup.usuarios) await limpiarColeccion('usuarios');

  console.log('═══════════════════════════════════════════════════');
  console.log('✨ LIMPIEZA COMPLETADA');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('═══════════════════════════════════════════════════');
  console.log('📤 INICIANDO IMPORTACIÓN DE DATOS');
  console.log('═══════════════════════════════════════════════════\n');

  if (backup.medicamentos) await importMedicamentos(backup.medicamentos);
  if (backup.usuarios) await importUsuarios(backup.usuarios);
  if (backup.pedidos) await importPedidos(backup.pedidos);
  if (backup.entregas) await importEntregas(backup.entregas);

  console.log('═══════════════════════════════════════════════════');
  console.log('🎉 IMPORTACIÓN COMPLETADA EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════════');
}

runImport().catch(console.error);
