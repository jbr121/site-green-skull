const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = NODE_ENV === "test" ? path.join(DATA_DIR, "db.test.json") : path.join(DATA_DIR, "db.json");
const DB_FIXTURE = path.join(DATA_DIR, "db.test.json");
const UPLOADS = path.join(DATA_DIR, "uploads");
const PUBLIC_UPLOADS = path.join(__dirname, "public", "uploads");

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(PUBLIC_UPLOADS, { recursive: true });

function loadDb() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!Array.isArray(db.ledger)) db.ledger = [];
  return db;
}

function saveDbAtomic(db) {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

// Simple async-safe DB lock so concurrent writes don't clobber each other.
let dbLock = Promise.resolve();
function withDb(handler) {
  return (dbLock = dbLock.then(() => {
    const db = loadDb();
    const result = handler(db);
    if (result && typeof result.then === "function") {
      return result.then((res) => {
        saveDbAtomic(db);
        return res;
      });
    }
    saveDbAtomic(db);
    return result;
  }));
}

function sellPrice(p) {
  if (p.promoPrice != null && Number(p.promoPrice) < Number(p.price)) return Number(p.promoPrice) || 0;
  return Number(p.price) || 0;
}

function parseQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), s, 64).toString("hex");
  return { salt: s, hash };
}

function verifyPassword(password, user) {
  try {
    const { hash } = hashPassword(password, user.salt);
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(user.hash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

/* ---------- validation helpers ---------- */
const MAX_NAME = 120;
const MAX_DESC = 4000;
const MAX_CATEGORY = 40;
const MAX_USERNAME = 32;

function validString(value, max = 200, allowEmpty = false) {
  const s = String(value ?? "").trim();
  if (!allowEmpty && s === "") return null;
  if (s.length > max) return null;
  return s;
}

function validNumber(value, min = -Infinity, max = Infinity, allowNull = false) {
  if (value === null || value === undefined || value === "") return allowNull ? null : null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function validId(value) {
  const s = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(s)) return null;
  return s;
}

function validUsername(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(s) || s.length < 2 || s.length > MAX_USERNAME) return null;
  return s;
}

function validPassword(value) {
  const s = String(value ?? "");
  if (s.length < 6 || s.length > 128) return null;
  return s;
}

function validShipping(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const x of arr) {
    const name = validString(x && x.name, 60);
    if (!name) return null;
    const price = validNumber(x && x.price, 0, 100000, false);
    if (price === null) return null;
    out.push({ name, price, description: validString(x && x.description, 200, true) || "" });
  }
  return out;
}

function validPayments(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

function sanitizeProductBody(body, existing, file) {
  const name = validString(body.name, MAX_NAME);
  if (!name) return { error: "Informe um nome válido (até 120 caracteres)." };
  const price = validNumber(body.price, 0, 10000000, false);
  if (price === null) return { error: "Informe um preço válido." };
  const promoPrice = body.promoPrice === "" || body.promoPrice == null ? null : validNumber(body.promoPrice, 0, 10000000, true);
  if (promoPrice === null && body.promoPrice != null && body.promoPrice !== "") return { error: "Preço promocional inválido." };
  const category = validString(body.category, MAX_CATEGORY, true) || "Outros";
  const stock = body.stock === "" || body.stock == null ? null : validNumber(body.stock, 0, 999999, true);
  if (stock === null && body.stock != null && body.stock !== "") return { error: "Estoque inválido." };
  const cost = body.cost === "" || body.cost == null ? null : validNumber(body.cost, 0, 10000000, true);
  if (cost === null && body.cost != null && body.cost !== "") return { error: "Custo inválido." };
  const description = validString(body.description, MAX_DESC, true) || "";
  const optionPayload = parseOptionPayload(body, existing);

  return {
    product: {
      ...(existing || {}),
      name,
      description,
      price,
      promoPrice,
      category,
      stock,
      stockActive: body.stockActive === "true" || body.stockActive === true || (stock != null && body.stockActive !== false),
      cost,
      pin: body.pin === "true" || body.pin === true,
      active: body.active !== "false" && body.active !== false,
      image: file ? `/uploads/${file.filename}` : existing ? existing.image : "",
      ...optionPayload,
    },
  };
}

function parseOptionPayload(body, existing) {
  const optionGroup =
    body.optionGroup != null
      ? String(body.optionGroup).trim()
      : existing
        ? existing.optionGroup || ""
        : "";
  if (body.options == null) {
    return { optionGroup, options: existing ? existing.options || [] : [] };
  }
  let raw = body.options;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { optionGroup, options: [] };
    try {
      raw = JSON.parse(trimmed);
    } catch {
      raw = trimmed.split(/\r?\n/);
    }
  }
  if (!Array.isArray(raw)) raw = [];
  const prev = (existing && existing.options) || [];
  const options = raw
    .map((item, i) => {
      const title = String(typeof item === "string" ? item : (item && item.title) || "").trim();
      if (!title) return null;
      const match = prev.find((o) => o.title === title);
      return {
        id: (match && match.id) || `opt-${i}`,
        title,
        image: match ? match.image || "" : "",
        available: match && match.available === false ? false : true,
      };
    })
    .filter(Boolean);
  return { optionGroup, options };
}

/* ---------- auth ---------- */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Faça login para continuar." });
  next();
}

function requireRoles(roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: "Faça login para continuar." });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: "Acesso negado." });
    next();
  };
}

const requireAdmin = requireRoles(["admin"]);
const requireEditor = requireRoles(["admin", "editor"]);

// Simple in-memory rate limiter for login
const loginAttempts = new Map();
function checkLoginRate(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (record.until > now) return { blocked: true, waitSeconds: Math.ceil((record.until - now) / 1000) };
  return { blocked: false, record };
}
function registerLoginFailure(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, until: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.until = now + 15 * 60 * 1000;
    record.count = 0;
  }
  loginAttempts.set(ip, record);
  // cleanup stale entries occasionally
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (v.until < now) loginAttempts.delete(k);
    }
  }
}
function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

function clientIp(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${uid("img")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error("Envie uma imagem (jpg, png, webp)."));
    cb(null, true);
  },
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

const sessionSecret = process.env.SESSION_SECRET || "gold-skull-local-secret-troque-depois";
if (!process.env.SESSION_SECRET) {
  console.warn("[WARN] SESSION_SECRET não definido. Em produção defina uma chave forte.");
}
app.use(
  session({
    name: "goldskull.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use("/uploads", express.static(UPLOADS));
app.use("/uploads", express.static(PUBLIC_UPLOADS));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

app.get("/api/public/store", (_req, res) => {
  const db = loadDb();
  const products = db.products
    .filter((p) => p.active !== false)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      promoPrice: p.promoPrice,
      category: p.category,
      image: p.image,
      stock: p.stock,
      stockActive: p.stockActive,
      pin: p.pin,
      optionGroup: p.optionGroup || "",
      options: Array.isArray(p.options) ? p.options : [],
    }));
  res.json({ settings: db.settings, categories: db.categories, products });
});

app.post("/api/login", (req, res) => {
  const username = validUsername(req.body.username);
  const password = validPassword(req.body.password);
  const ip = clientIp(req);
  const rate = checkLoginRate(ip);
  if (rate.blocked) {
    return res.status(429).json({ error: `Muitas tentativas. Aguarde ${rate.waitSeconds}s.` });
  }
  if (!username || !password) {
    registerLoginFailure(ip);
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }
  const db = loadDb();
  const user = db.users.find((u) => u.username.toLowerCase() === username);
  if (!user || !verifyPassword(password, user)) {
    registerLoginFailure(ip);
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }
  clearLoginFailures(ip);
  req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.json({ user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

app.get("/api/products", requireAuth, (_req, res) => {
  const db = loadDb();
  res.json({ products: db.products, categories: db.categories });
});

app.post("/api/products", requireEditor, upload.single("image"), (req, res, next) => {
  withDb((db) => {
    const parsed = sanitizeProductBody(req.body || {}, null, req.file);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const product = {
      ...parsed.product,
      id: uid("p"),
      createdAt: new Date().toISOString(),
    };
    if (product.category && !db.categories.includes(product.category)) db.categories.push(product.category);
    db.products.unshift(product);
    return res.json({ product });
  }).catch(next);
});

app.put("/api/products/:id", requireEditor, upload.single("image"), (req, res, next) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido." });
  withDb((db) => {
    const product = db.products.find((p) => p.id === id);
    if (!product) return res.status(404).json({ error: "Produto não encontrado." });
    const body = req.body || {};
    const parsed = sanitizeProductBody(body, product, req.file);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    Object.assign(product, parsed.product);
    if (product.category && !db.categories.includes(product.category)) db.categories.push(product.category);
    return res.json({ product });
  }).catch(next);
});

app.delete("/api/products/:id", requireEditor, (req, res, next) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido." });
  withDb((db) => {
    const before = db.products.length;
    db.products = db.products.filter((p) => p.id !== id);
    if (db.products.length === before) return res.status(404).json({ error: "Produto não encontrado." });
    return res.json({ ok: true });
  }).catch(next);
});

app.post("/api/products/:id/duplicate", requireEditor, (req, res, next) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido." });
  withDb((db) => {
    const source = db.products.find((p) => p.id === id);
    if (!source) return res.status(404).json({ error: "Produto não encontrado." });
    const copy = {
      ...JSON.parse(JSON.stringify(source)),
      id: uid("p"),
      name: `${source.name} (cópia)`,
      createdAt: new Date().toISOString(),
      active: false,
    };
    db.products.unshift(copy);
    return res.json({ product: copy });
  }).catch(next);
});

app.patch("/api/products/:id/quick", requireEditor, (req, res, next) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido." });
  withDb((db) => {
    const product = db.products.find((p) => p.id === id);
    if (!product) return res.status(404).json({ error: "Produto não encontrado." });
    const b = req.body || {};
    if (b.active !== undefined) product.active = !!b.active;
    if (b.pin !== undefined) product.pin = !!b.pin;
    if (b.stockActive !== undefined) product.stockActive = !!b.stockActive;
    if (b.stock !== undefined) product.stock = b.stock === null || b.stock === "" ? null : validNumber(b.stock, 0, 999999, true);
    if (b.cost !== undefined) product.cost = b.cost === null || b.cost === "" ? null : validNumber(b.cost, 0, 10000000, true);
    return res.json({ product });
  }).catch(next);
});

app.get("/api/ledger", requireAuth, (_req, res) => {
  const db = loadDb();
  res.json({ ledger: db.ledger });
});

app.post("/api/stock/move", requireEditor, (req, res, next) => {
  const type = String(req.body.type || "");
  const qty = parseQty(req.body.qty);
  const productId = validId(req.body.productId);
  const cost = req.body.cost === "" || req.body.cost == null ? null : validNumber(req.body.cost, 0, 10000000, true);
  if (!["in", "sale", "adjust"].includes(type)) return res.status(400).json({ error: "Tipo inválido." });
  if (!qty) return res.status(400).json({ error: "Informe uma quantidade válida." });
  if (!productId) return res.status(400).json({ error: "Produto inválido." });
  withDb((db) => {
    const product = db.products.find((p) => p.id === productId);
    if (!product) return res.status(404).json({ error: "Produto não encontrado." });

    const current = product.stock == null ? 0 : Number(product.stock) || 0;
    if (type === "in") {
      product.stock = current + qty;
      product.stockActive = true;
    } else if (type === "sale") {
      if (product.stockActive && current < qty) {
        return res.status(400).json({ error: `Estoque insuficiente (${current} un.).` });
      }
      if (product.stockActive || product.stock != null) {
        product.stock = Math.max(0, current - qty);
        product.stockActive = true;
      }
    } else {
      product.stock = Math.max(0, current - qty);
      product.stockActive = true;
    }

    const unitPrice = sellPrice(product);
    const unitCost = cost != null ? cost : product.cost == null || product.cost === "" ? null : Number(product.cost);
    const entry = {
      id: uid("l"),
      type,
      productId: product.id,
      productName: product.name,
      category: product.category || "",
      qty,
      price: type === "sale" ? unitPrice : 0,
      cost: type === "sale" ? unitCost : null,
      createdAt: new Date().toISOString(),
      userName: (req.session.user && (req.session.user.name || req.session.user.username)) || "",
    };
    db.ledger.unshift(entry);
    return res.json({ product, entry, ledger: db.ledger });
  }).catch(next);
});

app.delete("/api/ledger/:id", requireAdmin, (req, res, next) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido." });
  withDb((db) => {
    const idx = db.ledger.findIndex((x) => x.id === id);
    if (idx < 0) return res.status(404).json({ error: "Registro não encontrado." });
    const entry = db.ledger[idx];
    const product = db.products.find((p) => p.id === entry.productId);
    if (product) {
      const current = product.stock == null ? 0 : Number(product.stock) || 0;
      if (entry.type === "in") product.stock = Math.max(0, current - (entry.qty || 0));
      else if (entry.type === "sale" || entry.type === "adjust") {
        if (product.stockActive || product.stock != null) {
          product.stock = current + (entry.qty || 0);
          product.stockActive = true;
        }
      }
    }
    db.ledger.splice(idx, 1);
    return res.json({ ok: true, product: product || null, ledger: db.ledger });
  }).catch(next);
});

app.get("/api/users", requireAdmin, (_req, res) => {
  const db = loadDb();
  res.json({ users: db.users.map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role })) });
});

app.post("/api/users", requireAdmin, (req, res, next) => {
  const username = validUsername(req.body.username);
  const password = validPassword(req.body.password);
  const name = validString(req.body.name || username, MAX_NAME, true) || username;
  if (!username || !password) {
    return res.status(400).json({ error: "Usuário válido (a-z, 0-9, 2-32 chars) e senha (mínimo 6 caracteres) são obrigatórios." });
  }
  withDb((db) => {
    if (db.users.some((u) => u.username.toLowerCase() === username)) {
      return res.status(400).json({ error: "Esse usuário já existe." });
    }
    const pass = hashPassword(password);
    const user = {
      id: uid("u"),
      username,
      name,
      role: req.body.role === "admin" ? "admin" : "editor",
      salt: pass.salt,
      hash: pass.hash,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  }).catch(next);
});

app.put("/api/users/:id/password", requireAuth, (req, res, next) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido." });
  const me = req.session.user;
  if (me.role !== "admin" && me.id !== id) {
    return res.status(403).json({ error: "Você só pode alterar a própria senha." });
  }
  const password = validPassword(req.body.password);
  if (!password) return res.status(400).json({ error: "Senha inválida (mínimo 6 caracteres)." });
  withDb((db) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    const pass = hashPassword(password);
    user.salt = pass.salt;
    user.hash = pass.hash;
    return res.json({ ok: true });
  }).catch(next);
});

app.delete("/api/users/:id", requireAdmin, (req, res, next) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido." });
  withDb((db) => {
    if (id === req.session.user.id) {
      return res.status(400).json({ error: "Você não pode excluir o próprio acesso." });
    }
    const before = db.users.length;
    db.users = db.users.filter((u) => u.id !== id);
    if (db.users.length === before) return res.status(404).json({ error: "Usuário não encontrado." });
    return res.json({ ok: true });
  }).catch(next);
});

app.put("/api/settings", requireAdmin, (req, res, next) => {
  withDb((db) => {
    const s = db.settings;
    const b = req.body || {};
    ["name", "tagline", "extra", "whatsapp", "instagram", "address", "checkoutMessage"].forEach((k) => {
      if (b[k] != null) s[k] = validString(b[k], k === "extra" ? 2000 : 300, true) || "";
    });
    if (b.themeColor != null) s.themeColor = validString(b.themeColor, 30, true) || s.themeColor;
    const payments = validPayments(b.payments);
    if (payments) s.payments = payments;
    const shipping = validShipping(b.shipping);
    if (shipping) s.shipping = shipping;
    if (Array.isArray(b.categories)) {
      db.categories = b.categories.map(String).map((c) => c.trim()).filter(Boolean).slice(0, 50);
    }
    return res.json({ settings: db.settings, categories: db.categories });
  }).catch(next);
});

app.post("/api/settings/banner", requireAdmin, upload.single("image"), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "Envie uma imagem." });
  withDb((db) => {
    db.settings.banner = `/uploads/${req.file.filename}`;
    return res.json({ banner: db.settings.banner });
  }).catch(next);
});

// Test-only helpers for deterministic E2E
if (NODE_ENV === "test") {
  app.post("/api/test/reset", (_req, res) => {
    if (!fs.existsSync(DB_FIXTURE)) return res.status(500).json({ error: "Fixture db.test.json não encontrado." });
    fs.copyFileSync(DB_FIXTURE, DB_PATH);
    return res.json({ ok: true });
  });
  app.post("/api/test/login", (req, res) => {
    const role = req.body.role === "editor" ? "editor" : "admin";
    req.session.user = { id: "test-user", username: role, name: "Test", role };
    res.json({ user: req.session.user });
  });
  app.post("/api/test/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });
}

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/admin")) {
    return res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Centralized error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido." });
  }
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: "Falha no upload: " + err.message });
  }
  if (err && err.message && /imagem/i.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: "Erro interno. Tente de novo." });
});

app.listen(PORT, () => {
  console.log(`GOLD SKULL no ar: http://localhost:${PORT}`);
  console.log(`Painel: http://localhost:${PORT}/admin`);
});
