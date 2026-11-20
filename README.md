# ShipNow — Pre-entrega Módulo 6: Testing funcional con Mocha, Chai y Supertest

Suite de tests funcionales automatizados que validan los endpoints de ShipNow contra una base de datos de testing, cubriendo casos exitosos y errores esperados (status HTTP + estructura del body + formato de error del módulo de errores).

## Herramientas

| Herramienta | Para qué se usa |
|---|---|
| **Mocha** | Organiza y ejecuta los tests |
| **Chai** | Aserciones (`expect`) sobre el status y la estructura del body |
| **Supertest** | Hace las peticiones HTTP a la app de Express sin abrir un puerto |
| **cross-env** | Define `NODE_ENV=test` de forma compatible con Windows, Mac y Linux |

La app de Express está separada del servidor: `src/app.js` exporta `app` (los tests lo importan) y `src/server.js` es el que conecta a la base y escucha en un puerto.

## Cómo ejecutar los tests

```bash
npm install
cp .env.test.example .env.test     # y completar MONGODB_URI (ver abajo)
npm test
```

Resultado esperado: **177 tests passing**. La suite se puede correr las veces que se quiera seguidas, sin borrar nada a mano.

## ¿Se necesita una base de datos de testing? Sí

Los tests usan una **base de datos separada y descartable** (por ejemplo `shipnow_test`), distinta de la de desarrollo. Pueden ser:

- **MongoDB local:** `mongodb://127.0.0.1:27017/shipnow_test`
- **MongoDB Atlas:** la misma cluster que usás para desarrollo, pero con otro nombre de base: `mongodb+srv://USUARIO:PASSWORD@cluster0.xxxxx.mongodb.net/shipnow_test`. No hace falta crearla: se crea sola.

**Protección:** antes de correr, los tests verifican que el nombre de la base contenga `test`. Si no es así (por ejemplo, si apuntás por error a la base de desarrollo), la suite se detiene con un error y **no borra nada**.

## Variables de entorno necesarias

El entorno de testing tiene su propio archivo, `.env.test` (no se sube al repo; el modelo es `.env.test.example`). Con `NODE_ENV=test` la aplicación lee `.env.test` en lugar de `.env`.

| Variable | Valor para testing |
|---|---|
| `NODE_ENV` | `test` |
| `PORT` | `8081` (no se abre ningún puerto, pero la configuración lo exige) |
| `MONGODB_URI` | URI de la base **de test** (el nombre debe contener `test`) |
| `JWT_SECRET` | `test_secret` (cualquier valor) |

Durante los tests el logger queda en silencio (no escribe en consola ni en `logs/`).

## Módulos cubiertos

Los tests están en la carpeta `tests/`, agrupados por recurso:

| Archivo | Qué cubre |
|---|---|
| `users.test.js` | Obtener usuarios y obtener un usuario por id |
| `orders.test.js` | Obtener pedidos, crear pedido y consultar pedido por id |
| `deliveries.test.js` | Asignar pedido a repartidor y **actualizar estados** (assigned → picked_up → in_transit → delivered) |
| `mocks.test.js` | Mocks de usuarios, pedidos y entregas; carga en MongoDB (`seed` y `generateData`) |
| `logger.test.js` | Endpoint `/api/loggerTest`, niveles y registro de errores |
| `swagger.test.js` | Ruta `/api/docs` y coherencia de la documentación con la API |
| `sessions.test.js` | Registro, login, sesión actual y logout |
| `products.test.js` | CRUD de productos |
| `errors.test.js` | Ruta inexistente, JSON inválido y health |

**Casos exitosos:** listados correctos, crear un pedido con datos válidos (el total se calcula, el estado inicial es `created`), generar mocks y verificar que se guardan con sus relaciones (pedido ↔ cliente, entrega ↔ pedido ↔ repartidor), acceder al logger y a Swagger.

**Casos de error** (siempre con status HTTP + código + mensaje del formato de error del Módulo 3): datos incompletos (`MISSING_FIELDS`), recurso inexistente (`USER_NOT_FOUND`, `ORDER_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `DELIVERY_NOT_FOUND`), estado inválido (`INVALID_ORDER_STATUS`, `INVALID_DELIVERY_STATUS`), mocks con cantidades inválidas (`INVALID_MOCK_AMOUNT`), falla de MongoDB durante la carga (`MOCK_GENERATION_ERROR`), ruta inexistente (`ROUTE_NOT_FOUND`), sin sesión (`401`) y sin permisos (`403`).

Cada test valida **la estructura del body y sus propiedades importantes**, no solo que el endpoint responda. Por ejemplo, un pedido se verifica con sus campos (`id`, `customer`, `items`, `total`, `status`, `priority`…) y sus tipos.

## Coherencia con Swagger

Todo comportamiento documentado en Swagger tiene su test: cada error documentado (por ejemplo, el `404` ante un recurso inexistente) está probado. Además, `swagger.test.js` comprueba de forma automática que:

- todas las rutas reales de la API están documentadas y viceversa;
- cada error documentado existe en el diccionario de errores con el mismo status HTTP;
- la documentación incluye los tags Users, Orders, Deliveries, Mocks y Logger, y los schemas reutilizables.

## Datos de prueba y limpieza

- **Datos controlados y repetibles:** cada test crea lo que necesita dentro de la base de test (por ejemplo, un cliente y un repartidor antes de probar un pedido o una entrega) usando los generadores de mocks del Módulo 2 (`tests/helpers/factories.js`). No se usa ningún dato cargado a mano.
- **Estrategia de limpieza** (`tests/setup/hooks.js`): antes de **cada test** se vacían todas las colecciones, y al terminar la suite se elimina la base de test y se cierra la conexión. Por eso ningún test depende de otro ni del orden de ejecución, y la suite se puede repetir sin límite.

## Estructura de la carpeta de tests

```
tests/
├── setup/
│   ├── env.js            # fuerza NODE_ENV=test antes de cargar la app
│   └── hooks.js          # conexión, protección y limpieza de la base de test
├── helpers/
│   ├── factories.js      # crea usuarios, pedidos y entregas de prueba
│   └── assertions.js     # validadores de estructura (usuario, pedido, error...)
├── users.test.js
├── orders.test.js
├── deliveries.test.js
├── mocks.test.js
├── logger.test.js
├── swagger.test.js
├── sessions.test.js
├── products.test.js
└── errors.test.js
```

La configuración de Mocha está en `.mocharc.cjs` y el script en `package.json`:

```json
"test": "cross-env NODE_ENV=test mocha"
```