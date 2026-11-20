// Configuración de Mocha. Se ejecuta con: npm test
module.exports = {
  spec: "tests/**/*.test.js",
  // 1) fuerza NODE_ENV=test antes de cargar la app; 2) hooks globales (conexión y limpieza de la base de test)
  require: ["tests/setup/env.js", "tests/setup/hooks.js"],
  timeout: 30000,
  exit: true,
};
