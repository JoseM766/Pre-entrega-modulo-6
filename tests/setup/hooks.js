import mongoose from "mongoose";
import { config } from "../../src/config/index.js";
import { connectDB, disconnectDB } from "../../src/config/db.config.js";
import "../../src/app.js"; // carga los modelos y la app (sin abrir ningún puerto)

// Hooks globales (aplican a TODOS los archivos de tests).
// Estrategia de limpieza:
//   - antes de CADA test se vacían todas las colecciones -> ningún test depende de otro ni del orden;
//   - al terminar la suite se elimina la base de test completa y se cierra la conexión.
export const mochaHooks = {
  async beforeAll() {
    // Seguridad: nunca borrar datos si no estamos en el entorno y la base de TEST.
    await connectDB();

    const dbName = mongoose.connection.name;
    if (!config.isTest || !/test/i.test(dbName)) {
      await disconnectDB();
      throw new Error(
        `Los tests solo pueden correr contra una base de datos de test (el nombre debe contener "test"). ` +
          `Base detectada: "${dbName}". Revisá MONGODB_URI en .env.test`
      );
    }

    // Asegura que los índices únicos (nombre de producto, entrega por pedido) existan antes de testear.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  },

  async beforeEach() {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  },

  async afterAll() {
    // Si la conexión nunca se abrió (por ej. MongoDB apagado) no hay nada que limpiar.
    if (mongoose.connection.readyState !== 1) return;

    try {
      await mongoose.connection.dropDatabase();
    } catch {
      // Algunos usuarios (ej. en Atlas) no tienen permiso para borrar la base: se vacían las colecciones.
      await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    }
    await disconnectDB();
  },
};
