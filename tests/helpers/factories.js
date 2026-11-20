import request from "supertest";
import app from "../../src/app.js";
import * as usersRepository from "../../src/repositories/users.repository.js";
import { generateMockUser } from "../../src/mocks/users.mock.js";
import { hashPassword } from "../../src/utils/hash.js";
import { generateToken } from "../../src/utils/jwt.js";
import { USER_ROLES, DELIVERY_PRIORITY } from "../../src/constants/index.js";

// Datos de prueba CONTROLADOS: los usuarios se generan con los mocks del Módulo 2
// y se crean dentro de la base de test. Nada depende de datos cargados a mano.

export const TEST_PASSWORD = "password123";
const ZERO_ID = "0".repeat(24);
export const NON_EXISTENT_ID = ZERO_ID; // id válido (24 hex) que no existe en la base

// El hash se calcula una sola vez para que crear usuarios sea rápido.
let passwordHash;

// Crea un usuario real en la base y devuelve { user, id, cookie }.
// "cookie" es la sesión ya iniciada (JWT firmado igual que en el login) para usar con .set("Cookie", cookie).
export const createUser = async (role = USER_ROLES.USER, overrides = {}) => {
  passwordHash ??= await hashPassword(TEST_PASSWORD);

  const user = await usersRepository.createUser({
    ...generateMockUser(role),
    password: passwordHash,
    ...overrides,
  });

  const id = String(user._id);
  const token = generateToken({ id, email: user.email, role: user.role });

  return { user, id, cookie: `currentUser=${token}` };
};

export const createAdmin = () => createUser(USER_ROLES.ADMIN);
export const createCustomer = () => createUser(USER_ROLES.USER);
export const createDriver = () => createUser(USER_ROLES.DRIVER);

// Body válido para crear un pedido (se puede pisar cualquier campo).
export const validOrderBody = (overrides = {}) => ({
  items: [
    { name: "Caja chica 20x20", quantity: 2, price: 450 },
    { name: "Cinta de embalar", quantity: 1, price: 320 },
  ],
  deliveryAddress: "Av. Maipú 1234, Olivos",
  priority: DELIVERY_PRIORITY.HIGH,
  ...overrides,
});
export const VALID_ORDER_TOTAL = 2 * 450 + 1 * 320; // 1220

// Crea un pedido real a través de la API, como lo haría un cliente.
export const createOrder = async (customer, overrides = {}) => {
  const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).send(validOrderBody(overrides));
  if (res.status !== 201) throw new Error(`No se pudo crear el pedido de prueba: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.payload;
};

// Asigna un pedido a un repartidor a través de la API, como lo haría un admin.
export const createDelivery = async (admin, orderId, driverId, overrides = {}) => {
  const res = await request(app)
    .post("/api/deliveries")
    .set("Cookie", admin.cookie)
    .send({ orderId, driverId, ...overrides });
  if (res.status !== 201) throw new Error(`No se pudo crear la entrega de prueba: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.payload;
};

export const validProductBody = (overrides = {}) => ({
  name: "Bolsa courier",
  description: "Bolsa para envíos",
  category: "embalaje",
  price: 150,
  stock: 200,
  ...overrides,
});
