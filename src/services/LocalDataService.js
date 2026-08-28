// src/services/LocalDataService.js
//
// Capa de compatibilidad para migrar de PocketBase (red) a SQLite (local).
// Expone funciones con la misma forma que usaban las pantallas
// (list / create / update / delete) para minimizar cambios en cada
// screen. Todo corre contra el archivo SQLite del dispositivo, sin
// depender de conexión a internet ni al VPS.

import * as SQLite from './SQLiteService';

// PocketBase generaba ids de 15 caracteres alfanuméricos. Generamos algo
// del mismo estilo para no romper nada que dependa del formato del id.
const generateId = () => {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 15);
};

// ───────────────────────── MEDICAMENTOS ─────────────────────────
export const medicamentosList = async (activo = null) => {
  return await SQLite.getAllMedicamentos(activo);
};

export const medicamentoGetOne = async (id) => {
  return await SQLite.getMedicamentoById(id);
};

export const medicamentoCreate = async (data) => {
  const id = data.id || generateId();
  const record = {
    ...data,
    id,
    fechaRegistro: data.fechaRegistro || new Date().toISOString(),
  };
  await SQLite.saveMedicamento(record);
  return record;
};

export const medicamentoUpdate = async (id, data) => {
  const existing = await SQLite.getMedicamentoById(id);
  if (!existing) throw new Error(`Medicamento ${id} no encontrado`);
  const merged = { ...existing, ...data, id };
  await SQLite.saveMedicamento(merged);
  return merged;
};

export const medicamentoDelete = async (id) => {
  await SQLite.deleteMedicamento(id);
};

// ───────────────────────── PEDIDOS ─────────────────────────
export const pedidosList = async () => {
  return await SQLite.getAllPedidos();
};

export const pedidoGetOne = async (id) => {
  return await SQLite.getPedidoById(id);
};

export const pedidoCreate = async (data) => {
  const id = data.id || generateId();
  const record = {
    ...data,
    id,
    fechaPedido: data.fechaPedido || new Date().toISOString(),
  };
  await SQLite.savePedido(record);
  return record;
};

export const pedidoUpdate = async (id, data) => {
  const existing = await SQLite.getPedidoById(id);
  if (!existing) throw new Error(`Pedido ${id} no encontrado`);
  const merged = { ...existing, ...data, id };
  await SQLite.savePedido(merged);
  return merged;
};

export const pedidoDelete = async (id) => {
  await SQLite.deletePedido(id);
};

// ───────────────────────── ENTREGAS ─────────────────────────
export const entregasList = async () => {
  return await SQLite.getAllEntregas();
};

export const entregaGetOne = async (id) => {
  return await SQLite.getEntregaById(id);
};

export const entregaCreate = async (data) => {
  const id = data.id || generateId();
  const record = {
    ...data,
    id,
    fechaCreacion: data.fechaCreacion || new Date().toISOString(),
  };
  await SQLite.saveEntrega(record);
  return record;
};

export const entregaUpdate = async (id, data) => {
  const existing = await SQLite.getEntregaById(id);
  if (!existing) throw new Error(`Entrega ${id} no encontrada`);
  const merged = { ...existing, ...data, id };
  await SQLite.saveEntrega(merged);
  return merged;
};

export const entregaDelete = async (id) => {
  await SQLite.deleteEntrega(id);
};

// ───────────────────────── HISTORY ─────────────────────────
export const historyList = async () => {
  return await SQLite.getAllHistory();
};

export const historyCreate = async (data) => {
  const id = data.id || generateId();
  return await SQLite.saveHistory({ ...data, id });
};

// ───────────────────────── USUARIOS ─────────────────────────
export const usuariosList = async () => {
  return await SQLite.getAllUsuarios();
};

export const usuarioGetByNombre = async (nombre) => {
  return await SQLite.getUsuarioByNombre(nombre);
};

export const usuarioCreate = async (data) => {
  const id = data.id || generateId();
  const record = { ...data, id };
  await SQLite.saveUsuario(record);
  return record;
};

export const usuarioUpdate = async (id, data) => {
  const existing = await SQLite.getUsuarioById(id);
  if (!existing) throw new Error(`Usuario ${id} no encontrado`);
  const merged = { ...existing, ...data, id };
  await SQLite.saveUsuario(merged);
  return merged;
};

export const usuarioDelete = async (id) => {
  await SQLite.deleteUsuario(id);
};

// ───────────────────────── CATEGORIAS ─────────────────────────
export const categoriasList = async () => {
  return await SQLite.getAllCategorias();
};

export const categoriaGetByNombre = async (nombre) => {
  return await SQLite.getCategoriaByNombre(nombre);
};

export const categoriaCreate = async (data) => {
  const id = data.id || generateId();
  const record = { ...data, id };
  await SQLite.saveCategoria(record);
  return record;
};
