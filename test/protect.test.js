const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const {
  securityHeaders,
  generalLimiter,
  loginLimiter,
  concurrencyGate,
  isAllowedImage,
  imageFileFilter,
  applyServerTimeouts,
  protectConfig,
} = require("../lib/protect");

function okApp(middleware) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(middleware);
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/", (_req, res) => res.json({ ok: true }));
  app.post("/api/login", (_req, res) => res.status(401).json({ error: "Usuário ou senha incorretos." }));
  return app;
}

describe("protectConfig", () => {
  it("usa tetos altos em teste e mais rígidos em produção", () => {
    const testCfg = protectConfig({ NODE_ENV: "test" });
    const prodCfg = protectConfig({ NODE_ENV: "production" });
    assert.ok(testCfg.generalMax > prodCfg.generalMax);
    assert.equal(prodCfg.apiMax, 120);
    assert.equal(prodCfg.maxInFlight, 80);
  });

  it("respeita overrides de ambiente", () => {
    const cfg = protectConfig({ RATE_LIMIT_MAX: "7", MAX_IN_FLIGHT: "3" });
    assert.equal(cfg.generalMax, 7);
    assert.equal(cfg.maxInFlight, 3);
  });
});

describe("security headers", () => {
  it("envia cabeçalhos defensivos sem X-Powered-By", async () => {
    const app = okApp(securityHeaders());
    const res = await request(app).get("/");
    assert.equal(res.status, 200);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.match(res.headers["content-security-policy"] || "", /default-src 'self'/);
    assert.equal(res.headers["x-powered-by"], undefined);
    assert.equal(res.headers["strict-transport-security"], undefined);
  });
});

describe("rate limit", () => {
  it("responde 429 com Retry-After depois do teto", async () => {
    const app = okApp(generalLimiter({ windowMs: 60_000, generalMax: 3 }));
    assert.equal((await request(app).get("/")).status, 200);
    assert.equal((await request(app).get("/")).status, 200);
    assert.equal((await request(app).get("/")).status, 200);
    const blocked = await request(app).get("/");
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers["retry-after"]);
    assert.match(blocked.body.error, /Muitas requisições/);
  });

  it("não aplica o limite em /api/health", async () => {
    const app = okApp(generalLimiter({ windowMs: 60_000, generalMax: 1 }));
    assert.equal((await request(app).get("/")).status, 200);
    assert.equal((await request(app).get("/")).status, 429);
    assert.equal((await request(app).get("/api/health")).status, 200);
  });

  it("limita tentativas de login sem sucesso", async () => {
    const app = okApp(loginLimiter({ loginWindowMs: 60_000, loginMax: 2 }));
    assert.equal((await request(app).post("/api/login")).status, 401);
    assert.equal((await request(app).post("/api/login")).status, 401);
    assert.equal((await request(app).post("/api/login")).status, 429);
  });
});

describe("concurrency gate", () => {
  it("responde 503 quando o teto de requisições simultâneas é atingido", () => {
    const { EventEmitter } = require("events");
    const gate = concurrencyGate(1);

    function mockRes() {
      const res = new EventEmitter();
      res.headers = {};
      res.statusCode = 200;
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.set = (key, value) => {
        res.headers[String(key).toLowerCase()] = String(value);
        return res;
      };
      res.json = (body) => {
        res.body = body;
        res.emit("finish");
        return res;
      };
      return res;
    }

    const held = mockRes();
    let passedFirst = false;
    gate({ path: "/hold" }, held, () => {
      passedFirst = true;
    });
    assert.equal(passedFirst, true);
    assert.equal(gate._active(), 1);

    const busy = mockRes();
    gate({ path: "/hold" }, busy, () => {
      throw new Error("gate deveria recusar a segunda requisição");
    });
    assert.equal(busy.statusCode, 503);
    assert.equal(busy.headers["retry-after"], "1");
    assert.match(busy.body.error, /ocupado/);

    const health = mockRes();
    let passedHealth = false;
    gate({ path: "/api/health" }, health, () => {
      passedHealth = true;
    });
    assert.equal(passedHealth, true);

    held.emit("finish");
    assert.equal(gate._active(), 0);
  });
});

describe("upload de imagem", () => {
  it("aceita jpg/png/webp/gif e recusa svg ou mime genérico", () => {
    assert.equal(isAllowedImage({ originalname: "a.jpg", mimetype: "image/jpeg" }), true);
    assert.equal(isAllowedImage({ originalname: "a.png", mimetype: "image/png" }), true);
    assert.equal(isAllowedImage({ originalname: "a.webp", mimetype: "image/webp" }), true);
    assert.equal(isAllowedImage({ originalname: "a.gif", mimetype: "image/gif" }), true);
    assert.equal(isAllowedImage({ originalname: "a.svg", mimetype: "image/svg+xml" }), false);
    assert.equal(isAllowedImage({ originalname: "a.jpg", mimetype: "image/svg+xml" }), false);
    assert.equal(isAllowedImage({ originalname: "a.svg", mimetype: "image/jpeg" }), false);
  });

  it("rejeita no fileFilter do multer", () => {
    let err = null;
    imageFileFilter(null, { originalname: "x.svg", mimetype: "image/svg+xml" }, (e) => {
      err = e;
    });
    assert.ok(err instanceof Error);
  });
});

describe("body size", () => {
  it("recusa JSON acima do limite configurado", async () => {
    const app = express();
    app.use(express.json({ limit: "1kb" }));
    app.post("/echo", (req, res) => res.json({ n: Object.keys(req.body).length }));
    app.use((err, _req, res, _next) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({ error: err.message });
    });
    const big = { payload: "x".repeat(2000) };
    const res = await request(app).post("/echo").send(big);
    assert.equal(res.status, 413);
  });
});

describe("server timeouts", () => {
  it("aplica timeouts de cabeçalho, pedido e keep-alive", () => {
    const fake = {};
    applyServerTimeouts(fake, {
      requestTimeoutMs: 30_000,
      headersTimeoutMs: 15_000,
      keepAliveTimeoutMs: 5_000,
    });
    assert.equal(fake.keepAliveTimeout, 5_000);
    assert.equal(fake.headersTimeout, 15_000);
    assert.equal(fake.requestTimeout, 30_000);
    assert.equal(fake.timeout, 30_000);
  });
});
