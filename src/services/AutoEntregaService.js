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
      const k = clave(item.nombre, item.presentacion);
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
          (i) => clave(i.nombre, i.presentacion) === k
        );
        if (item) {
          resumen.medicamentosSinStock.push(item.nombre);
          break;
        }
      }
    }
  }

  // 5. Armar una entrega por cada pedido AUTO
  const descuentosAcumulados = new Map(); // clave -> cantidad total a descontar del stock real

  for (const pedido of pedidosAuto) {
    try {
      const itemsEntrega = [];
      for (const item of pedido.medicamentosSolicitados || []) {
        const k = clave(item.nombre, item.presentacion);
        const coeficiente = coeficientePorClave.get(k) || 0;
        if (coeficiente === 0) continue; // escenario A: no entra a la entrega

        const cantidadADar = Math.floor(coeficiente * (item.cantidad || 0));
        if (cantidadADar <= 0) continue; // el redondeo lo dejó en 0

        itemsEntrega.push({
          medicamentoId: null, // puede salir de varios lotes, no de uno solo
          nombre: item.nombre,
          presentacion: item.presentacion || '',
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

  return resumen;
};
