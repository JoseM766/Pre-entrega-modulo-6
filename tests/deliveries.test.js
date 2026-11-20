import { expect } from "chai";
import request from "supertest";
import app from "../src/app.js";
import {
  createAdmin,
  createCustomer,
  createDriver,
  createOrder,
  createDelivery,
  NON_EXISTENT_ID,
} from "./helpers/factories.js";
import { expectError, expectDelivery, expectPage } from "./helpers/assertions.js";
import { ORDER_STATUS, DELIVERY_STATUS, DELIVERY_PRIORITY } from "../src/constants/index.js";

// Prepara un escenario completo: admin, cliente con un pedido, y un repartidor.
const setup = async () => {
  const admin = await createAdmin();
  const customer = await createCustomer();
  const driver = await createDriver();
  const order = await createOrder(customer);
  return { admin, customer, driver, order };
};

const getOrder = async (customer, orderId) => (await request(app).get(`/api/orders/${orderId}`).set("Cookie", customer.cookie)).body.payload;

describe("Deliveries", () => {
  describe("POST /api/deliveries", () => {
    it("201: el admin asigna un pedido a un repartidor; la entrega queda assigned y el pedido también", async () => {
      const { admin, customer, driver, order } = await setup();

      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: order.id, driverId: driver.id });

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal("success");
      expectDelivery(res.body.payload);
      expect(res.body.payload).to.include({ order: order.id, driver: driver.id, status: DELIVERY_STATUS.ASSIGNED });
      // sin priority en el body hereda la del pedido
      expect(res.body.payload.priority).to.equal(order.priority);
      expect((await getOrder(customer, order.id)).status).to.equal(ORDER_STATUS.ASSIGNED);
    });

    it("201: permite indicar una prioridad propia", async () => {
      const { admin, driver, order } = await setup();
      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: order.id, driverId: driver.id, priority: DELIVERY_PRIORITY.URGENT });

      expect(res.status).to.equal(201);
      expect(res.body.payload.priority).to.equal(DELIVERY_PRIORITY.URGENT);
    });

    it("400 MISSING_FIELDS si falta el repartidor", async () => {
      const { admin, order } = await setup();
      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: order.id });
      expectError(res, 400, "MISSING_FIELDS");
    });

    it("400 INVALID_ORDER_STATUS si el pedido ya fue asignado", async () => {
      const { admin, driver, order } = await setup();
      await createDelivery(admin, order.id, driver.id);

      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: order.id, driverId: driver.id });

      expectError(res, 400, "INVALID_ORDER_STATUS");
    });

    it("400 INVALID_DRIVER si el usuario indicado no es repartidor", async () => {
      const { admin, customer, order } = await setup();
      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: order.id, driverId: customer.id });
      expectError(res, 400, "INVALID_DRIVER");
    });

    it("400 INVALID_PRIORITY con una prioridad inexistente", async () => {
      const { admin, driver, order } = await setup();
      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: order.id, driverId: driver.id, priority: "ya" });
      expectError(res, 400, "INVALID_PRIORITY");
    });

    it("400 INVALID_JSON con un body que no es JSON", async () => {
      const admin = await createAdmin();
      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).set("Content-Type", "application/json").send("{x");
      expectError(res, 400, "INVALID_JSON");
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).post("/api/deliveries").send({});
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("403 FORBIDDEN si no es admin", async () => {
      const { driver, order } = await setup();
      const res = await request(app).post("/api/deliveries").set("Cookie", driver.cookie).send({ orderId: order.id, driverId: driver.id });
      expectError(res, 403, "FORBIDDEN");
    });

    it("404 ORDER_NOT_FOUND si el pedido no existe", async () => {
      const { admin, driver } = await setup();
      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: NON_EXISTENT_ID, driverId: driver.id });
      expectError(res, 404, "ORDER_NOT_FOUND");
    });

    it("404 USER_NOT_FOUND si el repartidor no existe", async () => {
      const { admin, order } = await setup();
      const res = await request(app).post("/api/deliveries").set("Cookie", admin.cookie).send({ orderId: order.id, driverId: NON_EXISTENT_ID });
      expectError(res, 404, "USER_NOT_FOUND");
    });
  });

  describe("GET /api/deliveries", () => {
    it("200: un repartidor ve solo SUS entregas", async () => {
      const { admin, driver, order } = await setup();
      const otherDriver = await createDriver();
      const delivery = await createDelivery(admin, order.id, driver.id);
      await createDelivery(admin, (await createOrder(await createCustomer())).id, otherDriver.id);

      const res = await request(app).get("/api/deliveries").set("Cookie", driver.cookie);

      expect(res.status).to.equal(200);
      expectPage(res.body, { total: 1 });
      res.body.data.forEach(expectDelivery);
      expect(res.body.data[0].id).to.equal(delivery.id);
    });

    it("200: el admin ve todas y puede filtrar por estado", async () => {
      const { admin, driver, order } = await setup();
      await createDelivery(admin, order.id, driver.id);
      await createDelivery(admin, (await createOrder(await createCustomer())).id, driver.id);

      const all = await request(app).get("/api/deliveries").set("Cookie", admin.cookie);
      expectPage(all.body, { total: 2 });

      const assigned = await request(app).get("/api/deliveries?status=assigned").set("Cookie", admin.cookie);
      expectPage(assigned.body, { total: 2 });

      const delivered = await request(app).get("/api/deliveries?status=delivered").set("Cookie", admin.cookie);
      expectPage(delivered.body, { total: 0 });
    });

    it("400 INVALID_DELIVERY_STATUS con un estado inexistente", async () => {
      const admin = await createAdmin();
      const res = await request(app).get("/api/deliveries?status=zzz").set("Cookie", admin.cookie);
      expectError(res, 400, "INVALID_DELIVERY_STATUS");
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).get("/api/deliveries");
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("403 FORBIDDEN si es un cliente", async () => {
      const customer = await createCustomer();
      const res = await request(app).get("/api/deliveries").set("Cookie", customer.cookie);
      expectError(res, 403, "FORBIDDEN");
    });
  });

  describe("GET /api/deliveries/:id", () => {
    it("200: el repartidor dueño obtiene su entrega", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);

      const res = await request(app).get(`/api/deliveries/${delivery.id}`).set("Cookie", driver.cookie);

      expect(res.status).to.equal(200);
      expectDelivery(res.body.payload);
      expect(res.body.payload.id).to.equal(delivery.id);
    });

    it("200: el admin obtiene cualquier entrega", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);

      const res = await request(app).get(`/api/deliveries/${delivery.id}`).set("Cookie", admin.cookie);

      expect(res.status).to.equal(200);
      expect(res.body.payload.id).to.equal(delivery.id);
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).get(`/api/deliveries/${NON_EXISTENT_ID}`);
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("403 FORBIDDEN si la entrega es de otro repartidor", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);
      const otherDriver = await createDriver();

      const res = await request(app).get(`/api/deliveries/${delivery.id}`).set("Cookie", otherDriver.cookie);

      expectError(res, 403, "FORBIDDEN");
    });

    it("404 DELIVERY_NOT_FOUND con un id que no existe", async () => {
      const admin = await createAdmin();
      const res = await request(app).get(`/api/deliveries/${NON_EXISTENT_ID}`).set("Cookie", admin.cookie);
      expectError(res, 404, "DELIVERY_NOT_FOUND");
    });
  });

  describe("PATCH /api/deliveries/:id/status", () => {
    const patch = (cookie, id, body) => request(app).patch(`/api/deliveries/${id}/status`).set("Cookie", cookie).send(body);

    it("200: el repartidor avanza assigned → picked_up → in_transit → delivered y el pedido se sincroniza en cada paso", async () => {
      const { admin, customer, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);

      for (const status of [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT, DELIVERY_STATUS.DELIVERED]) {
        const res = await patch(driver.cookie, delivery.id, { status });

        expect(res.status).to.equal(200);
        expect(res.body.status).to.equal("success");
        expectDelivery(res.body.payload);
        expect(res.body.payload.status).to.equal(status);
        expect((await getOrder(customer, order.id)).status).to.equal(status); // mismos nombres de estado
      }
    });

    it("200: el admin también puede avanzar la entrega", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);

      const res = await patch(admin.cookie, delivery.id, { status: DELIVERY_STATUS.PICKED_UP });

      expect(res.status).to.equal(200);
      expect(res.body.payload.status).to.equal(DELIVERY_STATUS.PICKED_UP);
    });

    it("400 MISSING_FIELDS si no se envía el estado", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);
      expectError(await patch(driver.cookie, delivery.id, {}), 400, "MISSING_FIELDS");
    });

    it("400 INVALID_DELIVERY_STATUS con un estado inexistente", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);
      expectError(await patch(driver.cookie, delivery.id, { status: "volando" }), 400, "INVALID_DELIVERY_STATUS");
    });

    it("400 INVALID_DELIVERY_STATUS si se saltea un paso (assigned → delivered)", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);

      const res = await patch(driver.cookie, delivery.id, { status: DELIVERY_STATUS.DELIVERED });

      expectError(res, 400, "INVALID_DELIVERY_STATUS");
      expect(res.body.message).to.include(DELIVERY_STATUS.ASSIGNED).and.include(DELIVERY_STATUS.DELIVERED);
    });

    it("400 INVALID_DELIVERY_STATUS si se intenta retroceder una entrega ya entregada", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);
      for (const status of [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT, DELIVERY_STATUS.DELIVERED]) {
        await patch(driver.cookie, delivery.id, { status });
      }
      expectError(await patch(admin.cookie, delivery.id, { status: DELIVERY_STATUS.ASSIGNED }), 400, "INVALID_DELIVERY_STATUS");
    });

    it("400 INVALID_JSON con un body que no es JSON", async () => {
      const admin = await createAdmin();
      const res = await request(app).patch(`/api/deliveries/${NON_EXISTENT_ID}/status`).set("Cookie", admin.cookie).set("Content-Type", "application/json").send("{x");
      expectError(res, 400, "INVALID_JSON");
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).patch(`/api/deliveries/${NON_EXISTENT_ID}/status`).send({ status: DELIVERY_STATUS.PICKED_UP });
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("403 FORBIDDEN si es un cliente", async () => {
      const { admin, customer, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);
      expectError(await patch(customer.cookie, delivery.id, { status: DELIVERY_STATUS.PICKED_UP }), 403, "FORBIDDEN");
    });

    it("403 FORBIDDEN si la entrega es de otro repartidor (y no se modifica)", async () => {
      const { admin, driver, order } = await setup();
      const delivery = await createDelivery(admin, order.id, driver.id);
      const otherDriver = await createDriver();

      expectError(await patch(otherDriver.cookie, delivery.id, { status: DELIVERY_STATUS.PICKED_UP }), 403, "FORBIDDEN");

      const check = await request(app).get(`/api/deliveries/${delivery.id}`).set("Cookie", admin.cookie);
      expect(check.body.payload.status).to.equal(DELIVERY_STATUS.ASSIGNED);
    });

    it("404 DELIVERY_NOT_FOUND con un id que no existe", async () => {
      const admin = await createAdmin();
      expectError(await patch(admin.cookie, NON_EXISTENT_ID, { status: DELIVERY_STATUS.PICKED_UP }), 404, "DELIVERY_NOT_FOUND");
    });
  });
});
