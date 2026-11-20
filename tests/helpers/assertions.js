import { expect } from "chai";
import {
  USER_ROLES,
  PRODUCT_STATUS,
  ORDER_STATUS,
  DELIVERY_STATUS,
  DELIVERY_PRIORITY,
} from "../../src/constants/index.js";
import { ERROR_DICTIONARY } from "../../src/errors/index.js";

const OBJECT_ID = /^[0-9a-f]{24}$/;

// Verifica el formato de error definido en el módulo de errores:
// { status: "error", error: "<CODIGO>", message: "<texto>" } + el status HTTP del diccionario.
export const expectError = (res, status, code) => {
  expect(res.status, `status HTTP (body: ${JSON.stringify(res.body)})`).to.equal(status);
  expect(res.body).to.include.keys("status", "error", "message");
  expect(res.body.status).to.equal("error");
  expect(res.body.error).to.equal(code);
  expect(res.body.message).to.be.a("string").that.is.not.empty;
  // El status del diccionario de errores debe coincidir con el de la respuesta
  expect(ERROR_DICTIONARY[code].status).to.equal(status);
};

export const expectUser = (user) => {
  expect(user).to.include.keys("id", "first_name", "last_name", "email", "role");
  expect(user.id).to.match(OBJECT_ID);
  expect(user.email).to.be.a("string").that.includes("@");
  expect(Object.values(USER_ROLES)).to.include(user.role);
  expect(user).to.not.have.property("password");
};

export const expectProduct = (product) => {
  expect(product).to.include.keys("id", "name", "description", "category", "price", "stock", "status");
  expect(product.id).to.match(OBJECT_ID);
  expect(product.price).to.be.a("number");
  expect(product.stock).to.be.a("number");
  expect(Object.values(PRODUCT_STATUS)).to.include(product.status);
};

export const expectOrder = (order) => {
  expect(order).to.include.keys("id", "customer", "items", "deliveryAddress", "total", "status", "priority", "createdAt");
  expect(order.id).to.match(OBJECT_ID);
  expect(order.customer).to.match(OBJECT_ID);
  expect(order.items).to.be.an("array").that.is.not.empty;
  order.items.forEach((item) => {
    expect(item).to.have.all.keys("name", "quantity", "price");
    expect(item.name).to.be.a("string");
    expect(item.quantity).to.be.a("number");
    expect(item.price).to.be.a("number");
  });
  expect(order.total).to.be.a("number");
  expect(Object.values(ORDER_STATUS)).to.include(order.status);
  expect(Object.values(DELIVERY_PRIORITY)).to.include(order.priority);
};

export const expectDelivery = (delivery) => {
  expect(delivery).to.include.keys("id", "order", "driver", "status", "priority", "createdAt");
  expect(delivery.id).to.match(OBJECT_ID);
  expect(delivery.order).to.match(OBJECT_ID);
  expect(delivery.driver).to.match(OBJECT_ID);
  expect(Object.values(DELIVERY_STATUS)).to.include(delivery.status);
  expect(Object.values(DELIVERY_PRIORITY)).to.include(delivery.priority);
};

// Listados paginados: { status, data: [...], page, limit, total, totalPages }
export const expectPage = (body, { total, page = 1 } = {}) => {
  expect(body).to.include.keys("status", "data", "page", "limit", "total", "totalPages");
  expect(body.status).to.equal("success");
  expect(body.data).to.be.an("array");
  expect(body.page).to.equal(page);
  expect(body.limit).to.be.a("number");
  expect(body.totalPages).to.be.a("number");
  if (total !== undefined) expect(body.total).to.equal(total);
};
