// src/services/AutoEntregaService.js
import {
  pedidosList,
  pedidoUpdate,
  medicamentosList,
  medicamentoUpdate,
  entregaCreate,
  historyCreate,
} from './LocalDataService';
import { normalizeSearchTerm } from '../utils/normalizeText';

// Clave de emparejamiento: nombre + presentación, normalizados (sin
// acentos/mayúsculas) - así "Paracetamol" y "paracetamol" con la misma
// presentación son la MISMA medicina para efectos del reparto.
const clave = (nombre, presentacion) =>
  `${normalizeSearchTerm(nombre || '')}||${normalizeSearchTerm(presentacion || '')}`;

// Saca todos los valores en mg mencionados en un texto de presentación.
// Maneja tanto el caso simple ("75mg") como listas donde la unidad viene
// UNA SOLA VEZ al final ("75, 150 O 300 MG" - las tres dosis son mg,
// aunque solo la última lo diga explícito - así viene el texto genérico
// del catálogo de México).
const extraerMg = (texto) => {
  if (!texto) return [];
  const bloques = [...texto.matchAll(/(\d+(?:[.,]\d+)?(?:\s*(?:,|o|y)\s*\d+(?:[.,]\d+)?)*)\s*mg/gi)];
  const valores = [];
  for (const bloque of bloques) {
    const numeros = bloque[1].match(/\d+(?:[.,]\d+)?/g) || [];
    for (const n of numeros) valores.push(parseFloat(n.replace(',', '.')));
  }
  return valores;
};

// Resuelve a qué "producto" del inventario corresponde un ítem de pedido,
// aunque su presentación no sea el mismo TEXTO exacto. Un pedido armado
// desde el catálogo de México puede traer una presentación genérica
// ("Caja con 14 o 28 cápsulas de 75, 150 o 300 mg"), mientras que el
// inventario real tiene una dosis específica y concreta (como la
// cargada del papel, ej. "Blister 14tab 75mg") - con el match exacto de
// antes, esos dos nunca coincidían aunque fueran la misma medicina.
//
// 1) Intenta el match exacto de siempre (más rápido, y preferido cuando
//    ya coincide tal cual).
// 2) Si no hay match exacto, busca por nombre + alguna dosis (mg) en
//    común entre lo pedido y lo que hay en inventario.
// 3) Si el pedido menciona VARIAS dosis posibles sin especificar cuál
//    (el caso genérico de México) y el inventario tiene más de una en
//    stock, se prefiere la dosis MÁS BAJA como opción conservadora -
//    para no mezclar dosis distintas sin que nadie lo haya decidido.
const resolverClave = (nombre, presentacion, stockPorClave) => {
  const exacta = clave(nombre, presentacion);
  if (stockPorClave.has(exacta)) return exacta;

  const nombreNorm = normalizeSearchTerm(nombre || '');
  const mgPedido = extraerMg(presentacion);
  if (!nombreNorm || mgPedido.length === 0) return exacta;

  const candidatas = [];
  for (const [k, info] of stockPorClave.entries()) {
    if (!k.startsWith(`${nombreNorm}||`)) continue;
    const mgInventario = extraerMg(info.registros[0]?.presentacion || '');
    if (mgInventario.some((mg) => mgPedido.includes(mg))) {
      candidatas.push({ clave: k, mg: Math.min(...mgInventario) });
    }
  }
  if (candidatas.length === 0) return exacta;
  candidatas.sort((a, b) => a.mg - b.mg);
  return candidatas[0].clave;
};

const registrarHistory = async (idMed, user, cantidad, nombreMed) => {
  try {
    await historyCreate({
      id_med: idMed,
      fecha: new Date().toISOString(),
      user,
      movimiento: 'Entrega automática',
      cantidad,
      nombre: nombreMed,
    });
  } catch (error) {
    console.error('Error registrando history del automatismo:', error);
  }
};

// Corre el automatismo completo. Devuelve un resumen para mostrar en
// pantalla - nunca lanza (atrapa sus propios errores por pedido, para
// que uno malo no tumbe el resto del lote).
export const ejecutarAutomatismoEntregas = async (nombreUsuario) => {
  const resumen = {
    pedidosProcesados: 0,
    entregasCreadas: 0,
    entregasVaciasSinVincular: 0,
    medicamentosSinStock: [], // escenario A: nombres que se quedaron sin nada para nadie
    errores: [],
  };

  // 1. Pedidos AUTO, pendientes únicamente
  const todosPedidos = await pedidosList();
  const pedidosAuto = todosPedidos.filter((p) => !p.atendido && p.esAuto);
  resumen.pedidosProcesados = pedidosAuto.length;
  if (pedidosAuto.length === 0) return resumen;

  // 2. Stock disponible real, sumado por clave (nombre+presentación),
  // guardando también los registros reales (para poder descontar
  // después, lote por lote si hace falta)
  const medicamentosActivos = await medicamentosList(true);
  const stockPorClave = new Map();
  for (const med of medicamentosActivos) {
    const k = clave(med.nombre, med.presentacion);
    if (!stockPorClave.has(k)) stockPorClave.set(k, { total: 0, registros: [] });
    const entry = stockPorClave.get(k);
    entry.total += med.cantidad || 0;
    entry.registros.push(med);
  }

  // 3. Total pedido por clave, sumando TODOS los pedidos AUTO juntos
  const pedidoPorClave = new Map();
  for (const pedido of pedidosAuto) {
    for (const item of pedido.medicamentosSolicitados || []) {
      const k = resolverClave(item.nombre, item.presentacion, stockPorClave);
      pedidoPorClave.set(k, (pedidoPorClave.get(k) || 0) + (item.cantidad || 0));
    }
  }

  // 4. Coeficiente de reparto por clave:
  //    - sin stock -> 0 (escenario A: nadie recibe nada de esto)
  //    - stock >= pedido -> 1 (escenario B: se entrega el 100% a cada quien)
  //    - stock < pedido -> stock/pedido (escenario C: reparto proporcional)
  const coeficientePorClave = new Map();
  for (const [k, totalPedido] of pedidoPorClave.entries()) {
    const stockInfo = stockPorClave.get(k);
    const stockDisponible = stockInfo ? stockInfo.total : 0;
    if (stockDisponible === 0) {
      coeficientePorClave.set(k, 0);
    } else if (stockDisponible >= totalPedido) {
      coeficientePorClave.set(k, 1);
    } else {
      coeficientePorClave.set(k, stockDisponible / totalPedido);
    }
  }
  // Nombres que se quedaron en escenario A, para el resumen
  for (const [k, coef] of coeficientePorClave.entries()) {
    if (coef === 0) {
      // Buscar un nombre legible para mostrar (de cualquier pedido que lo pidiera)
      for (const pedido of pedidosAuto) {
        const item = (pedido.medicamentosSolicitados || []).find(
          (i) => resolverClave(i.nombre, i.presentacion, stockPorClave) === k
        );
        if (item) {
          resumen.medicamentosSinStock.push(item.nombre);
          break;
        }
      }
    }
  }

  // 5. Armar una entrega por cada pedido AUTO, y de paso reunir el
  // detalle producto por producto (para el PDF del reporte)
  const descuentosAcumulados = new Map(); // clave -> cantidad total a descontar del stock real
  const detallePorClave = new Map(); // clave -> { nombre, presentacion, stockTotal, totalPedido, asignaciones: [] }

  const obtenerDetalle = (k, nombre, presentacion) => {
    if (!detallePorClave.has(k)) {
      const stockInfo = stockPorClave.get(k);
      detallePorClave.set(k, {
        nombre,
        presentacion: presentacion || '',
        stockTotal: stockInfo ? stockInfo.total : 0,
        totalPedido: pedidoPorClave.get(k) || 0,
        asignaciones: [],
      });
    }
    return detallePorClave.get(k);
  };

  for (const pedido of pedidosAuto) {
    try {
      const itemsEntrega = [];
      for (const item of pedido.medicamentosSolicitados || []) {
        const k = resolverClave(item.nombre, item.presentacion, stockPorClave);
        const coeficiente = coeficientePorClave.get(k) || 0;
        const cantidadADar = coeficiente > 0 ? Math.floor(coeficiente * (item.cantidad || 0)) : 0;

        // Registrar en el detalle SIEMPRE (aunque le haya tocado 0), para
        // que el reporte muestre el panorama completo por producto
        obtenerDetalle(k, item.nombre, item.presentacion).asignaciones.push({
          solicitante: pedido.nombreSolicitante,
          cantidadPedida: item.cantidad || 0,
          cantidadAsignada: cantidadADar,
        });

        if (cantidadADar <= 0) continue; // escenario A, o el redondeo lo dejó en 0

        // Si el match fue por dosis (no exacto), usar la presentación REAL
        // del inventario (específica) en la entrega, no el texto genérico
        // del pedido - para que quien la reciba sepa exactamente qué es.
        const stockInfoItem = stockPorClave.get(k);
        const presentacionReal =
          stockInfoItem?.registros?.[0]?.presentacion || item.presentacion || '';

        itemsEntrega.push({
          medicamentoId: null, // puede salir de varios lotes, no de uno solo
          nombre: item.nombre,
          presentacion: presentacionReal,
          cantidad: cantidadADar,
          ubicacion: item.ubicacion || '',
          fechaAgregado: new Date().toISOString(),
        });

        descuentosAcumulados.set(k, (descuentosAcumulados.get(k) || 0) + cantidadADar);
      }

      const entregaCreada = await entregaCreate({
        destino: pedido.nombreSolicitante,
        fechaCreacion: new Date().toISOString(),
        estado: itemsEntrega.length > 0 ? 'cerrada' : 'abierta',
        items: itemsEntrega,
        creadoPor: nombreUsuario || 'Automatismo',
        pedidoId: itemsEntrega.length > 0 ? pedido.id : null,
        notas: '',
        esAuto: true,
        ultimaModificacion: new Date().toISOString(),
      });

      if (itemsEntrega.length > 0) {
        resumen.entregasCreadas++;
        const entregasActuales = pedido.entregasRealizadas || [];
        await pedidoUpdate(pedido.id, {
          entregasRealizadas: [
            ...entregasActuales,
            {
              entregaId: entregaCreada.id,
              fecha: entregaCreada.fechaCreacion,
              items: itemsEntrega,
              destino: pedido.nombreSolicitante,
              realizadoPor: nombreUsuario || 'Automatismo',
            },
          ],
          atendido: true,
          fechaAtencion: new Date().toISOString(),
          atendidoPor: nombreUsuario || 'Automatismo',
        });
      } else {
        // Nada que darle a este pedido (todo cayó en escenario A) - se
        // deja la entrega vacía y SIN vincular, para revisión manual.
        // El pedido se queda pendiente, no se toca.
        resumen.entregasVaciasSinVincular++;
      }
    } catch (error) {
      console.error(`Error procesando pedido de ${pedido.nombreSolicitante}:`, error);
      resumen.errores.push(pedido.nombreSolicitante);
    }
  }

  // 6. Descontar el stock real, una vez por clave (sumado de todos los
  // pedidos), repartiendo el descuento entre los lotes reales en el
  // orden en que vinieron (lote por lote hasta completar lo necesario)
  for (const [k, cantidadADescontar] of descuentosAcumulados.entries()) {
    const stockInfo = stockPorClave.get(k);
    if (!stockInfo) continue;
    let restante = cantidadADescontar;
    for (const registro of stockInfo.registros) {
      if (restante <= 0) break;
      const aDescontar = Math.min(restante, registro.cantidad);
      if (aDescontar <= 0) continue;
      const nuevaCantidad = registro.cantidad - aDescontar;
      await medicamentoUpdate(registro.id, { cantidad: nuevaCantidad });
      await registrarHistory(registro.id, nombreUsuario || 'Automatismo', aDescontar, registro.nombre);
      restante -= aDescontar;
    }
  }

  resumen.detallePorProducto = Array.from(detallePorClave.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre)
  );

  return resumen;
};
