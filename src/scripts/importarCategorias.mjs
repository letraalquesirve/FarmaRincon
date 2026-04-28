// importar_categorias.mjs
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://localhost:8090');
const categorias = [
  'Analgésico',
  'Ansiolítico',
  'Antibiótico',
  'Anticoagulante',
  'Anticonvulsivante',
  'Antidepresivo',
  'Antidiabético',
  'Antidiarreico',
  'Antiemético',
  'Antiespasmódico',
  'Antifúngico',
  'Antigotoso',
  'Antihipertensivo',
  'Antihistamínico',
  'Antiinflamatorio',
  'Antiparasitario',
  'Antipirético',
  'Antiséptico',
  'Antitusivo',
  'Antiulceroso',
  'Antiviral',
  'Antiácido',
  'Broncodilatador',
  'Corticoesteroide',
  'Descongestionante',
  'Diurético',
  'Estimulante',
  'Expectorante',
  'Hepatoprotector',
  'Hormona',
  'Inmunosupresor',
  'Laxante',
  'Otros',
  'Quimioterápico',
  'Relajante muscular',
  'Sedante',
  'Suplemento',
  'Suplemento mineral',
  'Vasoconstrictor',
  'Vasodilatador',
  'Vitamina',
];

async function importarCategorias() {
  console.log('═══════════════════════════════════════════════════');
  console.log('📦 IMPORTANDO CATEGORÍAS A POCKETBASE');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // Autenticar como admin
    await pb.admins.authWithPassword('geovanis.pantoja@letraalquesirve.org', 'admin123456');
    console.log('✅ Login exitoso\n');
  } catch (error) {
    console.error('❌ Error de login:', error.message);
    return;
  }

  // Verificar si la colección 'categorias' existe, si no, crearla
  let coleccionExiste = false;
  try {
    await pb.collection('categorias').getOne('dummy');
    coleccionExiste = true;
  } catch (error) {
    if (error.status === 404) {
      console.log('📁 Colección "categorias" no existe, creándola...');
      try {
        await pb.collections.create({
          name: 'categorias',
          type: 'base',
          schema: [
            {
              name: 'nombre',
              type: 'text',
              required: true,
              unique: true,
            },
            {
              name: 'activo',
              type: 'bool',
              required: false,
            },
          ],
          listRule: '1=1',
          viewRule: '1=1',
          createRule: '1=1',
          updateRule: '1=1',
          deleteRule: '1=1',
        });
        console.log('✅ Colección "categorias" creada\n');
      } catch (createError) {
        console.error('❌ Error creando colección:', createError.message);
        return;
      }
    } else {
      console.error('❌ Error verificando colección:', error.message);
      return;
    }
  }

  // Limpiar categorías existentes
  console.log('🗑️  Limpiando categorías existentes...');
  try {
    const existing = await pb.collection('categorias').getList(1, 100);
    for (const cat of existing.items) {
      await pb.collection('categorias').delete(cat.id);
    }
    console.log(`   ✅ Eliminadas ${existing.items.length} categorías\n`);
  } catch (error) {
    console.log('   ℹ️ No había categorías para eliminar\n');
  }

  // Importar nuevas categorías
  console.log('📥 Importando categorías...');
  let importadas = 0;
  let errores = 0;

  for (const categoria of categorias) {
    try {
      await pb.collection('categorias').create({
        nombre: categoria,
        activo: true,
      });
      importadas++;
      process.stdout.write(`   ✅ ${importadas}/${categorias.length}: ${categoria}\r`);
    } catch (error) {
      errores++;
      console.log(`\n   ❌ Error importando "${categoria}":`, error.message);
    }
  }

  console.log(`\n\n✅ Importación completada:`);
  console.log(`   📊 ${importadas} categorías importadas`);
  if (errores > 0) console.log(`   ⚠️ ${errores} errores`);
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🎉 PROCESO COMPLETADO');
  console.log('═══════════════════════════════════════════════════');
}

importarCategorias().catch(console.error);
