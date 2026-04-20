import { pb } from './PocketBaseConfig';

// Medicamentos
export const getMedicamentos = async (activo = true) => {
  const result = await pb.collection('medicamentos').getList(1, 100, {
    filter: `activo = ${activo}`,
    sort: 'nombre',
  });
  return result.items;
};

export const createMedicamento = async (data) => {
  return await pb.collection('medicamentos').create(data);
};

export const updateMedicamento = async (id, data) => {
  return await pb.collection('medicamentos').update(id, data);
};

// Pedidos
export const getPedidos = async (atendido = null) => {
  const filter = atendido !== null ? `atendido = ${atendido}` : '';
  const result = await pb.collection('pedidos').getList(1, 100, {
    filter,
    sort: '-fechaPedido',
  });
  return result.items;
};

export const createPedido = async (data) => {
  return await pb.collection('pedidos').create(data);
};

// Entregas
export const getEntregas = async () => {
  const result = await pb.collection('entregas').getList(1, 100, {
    sort: '-fechaCreacion',
  });
  return result.items;
};

export const createEntrega = async (data) => {
  return await pb.collection('entregas').create(data);
};
