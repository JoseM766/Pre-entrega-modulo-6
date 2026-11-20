import { expect } from "chai";
import request from "supertest";
import app from "../src/app.js";
import { createCustomer, TEST_PASSWORD } from "./helpers/factories.js";
import { expectError, expectUser } from "./helpers/assertions.js";
import { USER_ROLES } from "../src/constants/index.js";

const validRegister = (overrides = {}) => ({
  first_name: "Ana",
  last_name: "Pérez",
  email: "ana.perez@test.com",
  password: TEST_PASSWORD,
  ...overrides,
});

describe("Sessions", () => {
  describe("POST /api/sessions/register", () => {
    it("registra un usuario y responde 201 con el usuario sin contraseña", async () => {
      const res = await request(app).post("/api/sessions/register").send(validRegister());

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal("success");
      expectUser(res.body.payload);
      expect(res.body.payload.email).to.equal("ana.perez@test.com");
    });

    it("siempre crea el usuario con rol user, aunque se envíe otro rol", async () => {
      const res = await request(app).post("/api/sessions/register").send(validRegister({ role: USER_ROLES.ADMIN }));

      expect(res.status).to.equal(201);
      expect(res.body.payload.role).to.equal(USER_ROLES.USER);
    });

    it("400 MISSING_FIELDS si faltan campos", async () => {
      const res = await request(app).post("/api/sessions/register").send({ email: "a@a.com" });
      expectError(res, 400, "MISSING_FIELDS");
    });

    it("400 INVALID_EMAIL si el email no tiene formato válido", async () => {
      const res = await request(app).post("/api/sessions/register").send(validRegister({ email: "no-es-un-email" }));
      expectError(res, 400, "INVALID_EMAIL");
    });

    it("400 INVALID_PASSWORD si la contraseña es muy corta", async () => {
      const res = await request(app).post("/api/sessions/register").send(validRegister({ password: "123" }));
      expectError(res, 400, "INVALID_PASSWORD");
    });

    it("400 INVALID_JSON si el body no es un JSON válido", async () => {
      const res = await request(app).post("/api/sessions/register").set("Content-Type", "application/json").send("{malo");
      expectError(res, 400, "INVALID_JSON");
    });

    it("409 EMAIL_EXISTS si el email ya está registrado", async () => {
      await request(app).post("/api/sessions/register").send(validRegister());
      const res = await request(app).post("/api/sessions/register").send(validRegister());
      expectError(res, 409, "EMAIL_EXISTS");
    });
  });

  describe("POST /api/sessions/login", () => {
    it("200 y guarda el JWT en la cookie currentUser (httpOnly)", async () => {
      await request(app).post("/api/sessions/register").send(validRegister());

      const res = await request(app).post("/api/sessions/login").send({ email: "ana.perez@test.com", password: TEST_PASSWORD });

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ status: "success", message: "Login correcto" });
      const cookie = res.headers["set-cookie"].find((c) => c.startsWith("currentUser="));
      expect(cookie).to.be.a("string");
      expect(cookie).to.match(/HttpOnly/i);
    });

    it("401 INVALID_CREDENTIALS con contraseña incorrecta", async () => {
      await request(app).post("/api/sessions/register").send(validRegister());
      const res = await request(app).post("/api/sessions/login").send({ email: "ana.perez@test.com", password: "incorrecta" });
      expectError(res, 401, "INVALID_CREDENTIALS");
    });

    it("401 INVALID_CREDENTIALS con un email inexistente (mismo error, sin dar pistas)", async () => {
      const res = await request(app).post("/api/sessions/login").send({ email: "nadie@test.com", password: TEST_PASSWORD });
      expectError(res, 401, "INVALID_CREDENTIALS");
    });

    it("400 INVALID_JSON si el body no es un JSON válido", async () => {
      const res = await request(app).post("/api/sessions/login").set("Content-Type", "application/json").send("{x");
      expectError(res, 400, "INVALID_JSON");
    });
  });

  describe("GET /api/sessions/current", () => {
    it("200 con id, email y rol de la sesión", async () => {
      const customer = await createCustomer();

      const res = await request(app).get("/api/sessions/current").set("Cookie", customer.cookie);

      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("success");
      expect(res.body.payload).to.have.all.keys("id", "email", "role");
      expect(res.body.payload.id).to.equal(customer.id);
      expect(res.body.payload.role).to.equal(USER_ROLES.USER);
    });

    it("401 UNAUTHORIZED sin sesión", async () => {
      const res = await request(app).get("/api/sessions/current");
      expectError(res, 401, "UNAUTHORIZED");
    });

    it("401 UNAUTHORIZED con un token inválido", async () => {
      const res = await request(app).get("/api/sessions/current").set("Cookie", "currentUser=token.falso.invalido");
      expectError(res, 401, "UNAUTHORIZED");
    });
  });

  describe("POST /api/sessions/logout", () => {
    it("200 y borra la cookie de sesión", async () => {
      const res = await request(app).post("/api/sessions/logout");

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ status: "success", message: "Sesión cerrada" });
      const cookie = res.headers["set-cookie"].find((c) => c.startsWith("currentUser="));
      expect(cookie).to.match(/Expires=Thu, 01 Jan 1970/i);
    });
  });
});
