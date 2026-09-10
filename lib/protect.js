/**
 * Proteções de sobrecarga e abuso na camada do aplicativo.
 * Não substituem WAF/CDN na borda contra tráfego volumétrico.
 */
const path = require("path");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function envInt(env, name, fallback) {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function protectConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";
  const isTest = nodeEnv === "test";
  return {
    windowMs: envInt(env, "RATE_LIMIT_WINDOW_MS", 60 * 1000),
    generalMax: envInt(env, "RATE_LIMIT_MAX", isTest ? 5000 : isProd ? 300 : 2000),
    apiMax: envInt(env, "RATE_LIMIT_API_MAX", isTest ? 5000 : isProd ? 120 : 2000),
    loginMax: envInt(env, "RATE_LIMIT_LOGIN_MAX", isTest ? 50 : 5),
    loginWindowMs: envInt(env, "RATE_LIMIT_LOGIN_WINDOW_MS", 15 * 60 * 1000),
    maxInFlight: envInt(env, "MAX_IN_FLIGHT", isTest ? 200 : isProd ? 80 : 200),
    requestTimeoutMs: envInt(env, "REQUEST_TIMEOUT_MS", 30 * 1000),
    headersTimeoutMs: envInt(env, "HEADERS_TIMEOUT_MS", 15 * 1000),
    keepAliveTimeoutMs: envInt(env, "KEEP_ALIVE_TIMEOUT_MS", 5 * 1000),
    jsonLimit: env.JSON_BODY_LIMIT || "256kb",
  };
}

function isHealth(req) {
  return req.path === "/api/health";
}

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "deny" },
    noSniff: true,
    hidePoweredBy: true,
    hsts: process.env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
}

function tooManyHandler(_req, res, _next, options) {
  const retry = Math.ceil((options.windowMs || 60000) / 1000);
  res.set("Retry-After", String(retry));
  res.status(429).json({ error: "Muitas requisições. Aguarde um momento e tente de novo." });
}

function generalLimiter(cfg = protectConfig()) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: cfg.generalMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isHealth,
    handler: tooManyHandler,
  });
}

function apiLimiter(cfg = protectConfig()) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: cfg.apiMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isHealth,
    handler: tooManyHandler,
  });
}

function loginLimiter(cfg = protectConfig()) {
  return rateLimit({
    windowMs: cfg.loginWindowMs,
    limit: cfg.loginMax,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: tooManyHandler,
  });
}

function concurrencyGate(max = protectConfig().maxInFlight) {
  let current = 0;
  const gate = (req, res, next) => {
    if (isHealth(req)) return next();
    if (current >= max) {
      res.set("Retry-After", "1");
      return res.status(503).json({ error: "Servidor ocupado. Tente novamente em instantes." });
    }
    current += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      current -= 1;
    };
    res.on("finish", release);
    res.on("close", release);
    next();
  };
  gate._active = () => current;
  return gate;
}

function applyServerTimeouts(server, cfg = protectConfig()) {
  server.keepAliveTimeout = cfg.keepAliveTimeoutMs;
  server.headersTimeout = Math.max(cfg.headersTimeoutMs, cfg.keepAliveTimeoutMs + 1000);
  server.requestTimeout = Math.max(cfg.requestTimeoutMs, server.headersTimeout + 1000);
  server.timeout = server.requestTimeout;
  return server;
}

function isAllowedImage(file) {
  if (!file) return false;
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) return false;
  if (ext && !ALLOWED_IMAGE_EXT.has(ext)) return false;
  return true;
}

function imageFileFilter(_req, file, cb) {
  if (!isAllowedImage(file)) {
    return cb(new Error("Envie uma imagem (jpg, png, webp ou gif)."));
  }
  cb(null, true);
}

module.exports = {
  ALLOWED_IMAGE_EXT,
  ALLOWED_IMAGE_MIME,
  protectConfig,
  securityHeaders,
  generalLimiter,
  apiLimiter,
  loginLimiter,
  concurrencyGate,
  applyServerTimeouts,
  isAllowedImage,
  imageFileFilter,
};
