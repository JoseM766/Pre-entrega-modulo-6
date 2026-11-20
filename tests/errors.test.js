import { expect } from "chai";
import request from "supertest";
import app from "../src/app.js";
import { expectError } from "./helpers/assertions.js";

describe("Errores generales y health", () => {
  describe("GET /api/health", () => {
    it("200 con la estructura esperada", async () => {
      const res = await request(app).get("/api/health");

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ status: "ok", message: "Servidor activo" });
    });
  });

  describe("Ruta inexistente", () => {
    it("404 ROUTE_NOT_FOUND con la estructura de error uniforme (GET)", async () => {
      const res = await request(app).get("/api/nada");

      expectError(res, 404, "ROUTE_NOT_FOUND");
      // fuera de producción el error incluye details con el método y la ruta
      expect(res.body.details).to.equal("GET /api/nada");
    });

    it("404 ROUTE_NOT_FOUND también para otros métodos", async () => {
      const res = await request(app).delete("/api/users/algo/inexistente");
      expectError(res, 404, "ROUTE_NOT_FOUND");
      expect(res.body.details).to.equal("DELETE /api/users/algo/inexistente");
    });

    it("el error sale en JSON", async () => {
      const res = await request(app).get("/api/nada");
      expect(res.headers["content-type"]).to.match(/application\/json/);
    });
  });

  describe("JSON inválido en el body", () => {
    it("400 INVALID_JSON en cualquier endpoint que lea el body", async () => {
      const res = await request(app).post("/api/sessions/login").set("Content-Type", "application/json").send('{"email": ');
      expectError(res, 400, "INVALID_JSON");
    });
  });
});
