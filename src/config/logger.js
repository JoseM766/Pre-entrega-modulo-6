import path from "node:path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { config } from "./index.js";
import { LOG_LEVELS, LOG_LEVEL_PRIORITY, LOG_COLORS } from "../constants/index.js";

// Logger centralizado: el resto del proyecto solo hace  import { logger } from "../config/logger.js"
// Niveles (de más a menos severo): fatal, error, warning, info, http, debug.

winston.addColors(LOG_COLORS);

// Línea:  2026-08-01 10:12:03 [info]    mensaje   (+ stack en una línea nueva si lo hay)
const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    info.level = `[${info.level}]`.padEnd(10);
    return info;
  })()
);

const printLine = winston.format.printf(({ timestamp, level, message, stack }) => {
  return `${timestamp} ${level}${message}${stack ? `\n${stack}` : ""}`;
});

const consoleFormat = winston.format.combine(
  baseFormat,
  ...(config.isProduction ? [] : [winston.format.colorize()]),
  printLine
);

const fileFormat = winston.format.combine(baseFormat, printLine);

// Archivos con rotación: un archivo por día, máximo 10 MB cada uno, se conservan 14 días.
// Solo se guardan error y fatal (info, warning, http y debug quedan únicamente en consola).
const errorFileTransport = new DailyRotateFile({
  level: LOG_LEVELS.ERROR,
  dirname: path.join(process.cwd(), config.logs.dir),
  filename: "error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "10m",
  maxFiles: "14d",
  format: fileFormat,
});

export const logger = winston.createLogger({
  levels: LOG_LEVEL_PRIORITY,
  level: config.logs.level,
  silent: config.isTest, // durante los tests no se escribe en consola ni en archivos
  transports: [new winston.transports.Console({ format: consoleFormat }), errorFileTransport],
});

// Cierra el archivo de logs y espera a que termine de escribirse.
// Hay que usarlo antes de cortar el proceso (process.exit): si no, el último log (justo el fatal)
// podría perderse sin llegar al archivo.
export const closeLogger = () => {
  return new Promise((resolve) => {
    const stream = errorFileTransport.logStream;
    if (!stream) return resolve();

    // Si algo se traba, no dejamos el proceso colgado más de 2 segundos.
    const fallback = setTimeout(resolve, 2000);
    stream.once("finish", () => {
      clearTimeout(fallback);
      resolve();
    });

    errorFileTransport.close();
  });
};
