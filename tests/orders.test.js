import { expect } from "chai";
import request from "supertest";
import app from "../src/app.js";
import {
  createAdmin,
  createCustomer,
  createDriver,
  createOrder,
  validOrderBody,
  VALID_ORDER_TOTAL,
  NON_EXISTENT_ID,
} from "./helpers/factories.js";
import { expectError, expectOrder, expectPage } from "./helpers/assertions.js";
import { ORDER_STATUS, DELIVERY_PRIORITY } from "../src/constants/index.js";

describe("Orders", () => {
  describe("POST /api/orders", () => {
    it("201: un cliente crea un pedido; el total se calcula y el estado inicial es created", async () => {
      const customer = await createCustomer();

      const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).send(validOrderBody());

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal("success");
      expectOrder(res.body.payload);
      expect(res.body.payload.customer).to.equal(customer.id);
      expect(res.body.payload.total).to.equal(VALID_ORDER_TOTAL);
      expect(res.body.payload.status).to.equal(ORDER_STATUS.CREATED);
      expect(res.body.payload.priority).to.equal(DELIVERY_PRIORITY.HIGH);
      expect(res.body.payload.items).to.have.lengthOf(2);
      expect(res.body.payload.deliveryAddress).to.equal("Av. Maipú 1234, Olivos");
    });

    it("201: sin prioridad usa normal por defecto", async () => {
      const customer = await createCustomer();
      const body = validOrderBody();
      delete body.priority;

      const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).send(body);

      expect(res.status).to.equal(201);
      expect(res.body.payload.priority).to.equal(DELIVERY_PRIORITY.NORMAL);
    });

    it("201: el admin también puede crear pedidos", async () => {
      const admin = await createAdmin();
      const res = await request(app).post("/api/orders").set("Cookie", admin.cookie).send(validOrderBody());

      expect(res.status).to.equal(201);
      expect(res.body.payload.customer).to.equal(admin.id);
    });

    it("el pedido creado se puede consultar luego por id (persistió en la base)", async () => {
      const customer = await createCustomer();
      const order = await createOrder(customer);

      const res = await request(app).get(`/api/orders/${order.id}`).set("Cookie", customer.cookie);

      expect(res.status).to.equal(200);
      expect(res.body.payload).to.deep.equal(order);
    });

    it("400 MISSING_FIELDS si no se envían items", async () => {
      const customer = await createCustomer();
      const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).send({ deliveryAddress: "x" });
      expectError(res, 400, "MISSING_FIELDS");
    });

    it("400 MISSING_FIELDS si no se envía la dirección", async () => {
      const customer = await createCustomer();
      const body = validOrderBody();
      delete body.deliveryAddress;
      const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).send(body);
      expectError(res, 400, "MISSING_FIELDS");
    });

    for (const [name, items] of [
      ["items vacío", []],
      ["cantidad 0", [{ name: "Caja", quantity: 0, price: 10 }]],
      ["cantidad decimal", [{ name: "Caja", quantity: 1.5, price: 10 }]],
      ["precio negativo", [{ name: "Caja", quantity: 1, price: -10 }]],
      ["item sin nombre", [{ quantity: 1, price: 10 }]],
    ]) {
      it(`400 INVALID_ORDER_ITEMS con ${name}`, async () => {
        const customer = await createCustomer();
        const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).send(validOrderBody({ items }));
        expectError(res, 400, "INVALID_ORDER_ITEMS");
      });
    }

    it("400 INVALID_PRIORITY con una prioridad inexistente", async () => {
      const customer = await createCustomer();
      const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).send(validOrderBody({ priority: "ya" }));
      expectError(res, 400, "INVALID_PRIORITY");
    });

    it("400 INVALID_JSON con un body que no es JSON", async () => {
      const customer = await createCustomer();
      const res = await request(app).post("/api/orders").set("Cookie", customer.cookie).set("Content-Type", "application/json").send("{x");
      expectError(res, 400, "INVALID_JSON");
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).post("/api/orders").send(validOrderBody());
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("403 FORBIDDEN si es un repartidor", async () => {
      const driver = await createDriver();
      const res = await request(app).post("/api/orders").set("Cookie", driver.cookie).send(validOrderBody());
      expectError(res, 403, "FORBIDDEN");
    });
  });

  describe("GET /api/orders", () => {
    it("200: un cliente ve solo SUS pedidos", async () => {
      const ana = await createCustomer();
      const luis = await createCustomer();
      const anaOrder = await createOrder(ana);
      await createOrder(luis);
      await createOrder(luis);

      const res = await request(app).get("/api/orders").set("Cookie", ana.cookie);

      expect(res.status).to.equal(200);
      expectPage(res.body, { total: 1 });
      res.body.data.forEach(expectOrder);
      expect(res.body.data[0].id).to.equal(anaOrder.id);
    });

    it("200: el admin ve los pedidos de todos", async () => {
      const admin = await createAdmin();
      await createOrder(await createCustomer());
      await createOrder(await createCustomer());

      const res = await request(app).get("/api/orders").set("Cookie", admin.cookie);

      expectPage(res.body, { total: 2 });
      expect(new Set(res.body.data.map((o) => o.customer)).size).to.equal(2);
    });

    it("200: lista vacía si no hay pedidos", async () => {
      const customer = await createCustomer();
      const res = await request(app).get("/api/orders").set("Cookie", customer.cookie);

      expectPage(res.body, { total: 0 });
      expect(res.body.data).to.deep.equal([]);
    });

    it("200: filtra por estado y pagina", async () => {
      const customer = await createCustomer();
      await createOrder(customer);
      await createOrder(customer);
      await createOrder(customer);

      const created = await request(app).get("/api/orders?status=created&limit=2&page=2").set("Cookie", customer.cookie);
      expectPage(created.body, { total: 3, page: 2 });
      expect(created.body.data).to.have.lengthOf(1);

      const delivered = await request(app).get("/api/orders?status=delivered").set("Cookie", customer.cookie);
      expectPage(delivered.body, { total: 0 });
    });

    it("400 INVALID_ORDER_STATUS con un estado inexistente", async () => {
      const customer = await createCustomer();
      const res = await request(app).get("/api/orders?status=zzz").set("Cookie", customer.cookie);
      expectError(res, 400, "INVALID_ORDER_STATUS");
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).get("/api/orders");
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("403 FORBIDDEN si es un repartidor", async () => {
      const driver = await createDriver();
      const res = await request(app).get("/api/orders").set("Cookie", driver.cookie);
      expectError(res, 403, "FORBIDDEN");
    });
  });

  describe("GET /api/orders/:id", () => {
    it("200: el dueño obtiene su pedido", async () => {
      const customer = await createCustomer();
      const order = await createOrder(customer);

      const res = await request(app).get(`/api/orders/${order.id}`).set("Cookie", customer.cookie);

      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("success");
      expectOrder(res.body.payload);
      expect(res.body.payload.id).to.equal(order.id);
    });

    it("200: el admin obtiene el pedido de cualquier cliente", async () => {
      const admin = await createAdmin();
      const order = await createOrder(await createCustomer());

      const res = await request(app).get(`/api/orders/${order.id}`).set("Cookie", admin.cookie);

      expect(res.status).to.equal(200);
      expect(res.body.payload.id).to.equal(order.id);
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).get(`/api/orders/${NON_EXISTENT_ID}`);
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("403 FORBIDDEN si el pedido es de otro cliente", async () => {
      const order = await createOrder(await createCustomer());
      const other = await createCustomer();

      const res = await request(app).get(`/api/orders/${order.id}`).set("Cookie", other.cookie);

      expectError(res, 403, "FORBIDDEN");
    });

    it("404 ORDER_NOT_FOUND con un id que no existe", async () => {
      const customer = await createCustomer();
      const res = await request(app).get(`/api/orders/${NON_EXISTENT_ID}`).set("Cookie", customer.cookie);
      expectError(res, 404, "ORDER_NOT_FOUND");
    });

    it("404 ORDER_NOT_FOUND con un id mal formado", async () => {
      const customer = await createCustomer();
      const res = await request(app).get("/api/orders/zzz").set("Cookie", customer.cookie);
      expectError(res, 404, "ORDER_NOT_FOUND");
    });
  });
});
