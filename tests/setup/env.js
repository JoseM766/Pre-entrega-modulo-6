// Se carga ANTES que la app: garantiza el entorno de testing aunque se ejecute "npx mocha" a mano.
// Con NODE_ENV=test la configuración lee ".env.test" (base de datos de test separada).
process.env.NODE_ENV = "test";
