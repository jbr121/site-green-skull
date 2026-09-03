const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const UPLOADS = path.join(DATA_DIR, "uploads");
const PUBLIC_UPLOADS = path.join(__dirname, "public", "uploads");

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(PUBLIC_UPLOADS, { recursive: true });

function loadDb() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!Array.isArray(db.ledger)) db.ledger = [];
  return db;
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

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Faça login para continuar." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem fazer isso." });
  }
  next();
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
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    name: "goldskull.sid",
    secret: process.env.SESSION_SECRET || "gold-skull-local-secret-troque-depois",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);
app.use("/uploads", express.static(UPLOADS));
app.use("/uploads", express.static(PUBLIC_UPLOADS));
app.use(express.static(path.join(__dirname, "public")));

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
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const db = loadDb();
  const user = db.users.find((u) => u.username.toLowerCase() === username);
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }
  req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.json({ user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Não logado." });
  res.json({ user: req.session.user });
});

app.get("/api/products", requireAuth, (_req, res) => {
  const db = loadDb();
  res.json({ products: db.products, categories: db.categories });
});

app.post("/api/products", requireAuth, upload.single("image"), (req, res) => {
  const db = loadDb();
  const body = req.body || {};
  const name = String(body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Informe o nome do produto." });
  const product = {
    id: uid("p"),
    name,
    description: String(body.description || "").trim(),
    price: Number(body.price) || 0,
    promoPrice: body.promoPrice ? Number(body.promoPrice) : null,
    category: String(body.category || "Outros").trim() || "Outros",
    image: req.file ? `/uploads/${req.file.filename}` : "",
    stock: body.stock === "" || body.stock == null ? null : Number(body.stock),
    stockActive: body.stockActive === "true" || body.stockActive === true,
    cost: body.cost === "" || body.cost == null ? null : Number(body.cost),
    pin: body.pin === "true" || body.pin === true,
    active: body.active !== "false" && body.active !== false,
    createdAt: new Date().toISOString(),
    ...parseOptionPayload(body, null),
  };
  if (product.category && !db.categories.includes(product.category)) db.categories.push(product.category);
  db.products.unshift(product);
  saveDb(db);
  res.json({ product });
});

app.put("/api/products/:id", requireAuth, upload.single("image"), (req, res) => {
  const db = loadDb();
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Produto não encontrado." });
  const body = req.body || {};
  if (body.name != null) product.name = String(body.name).trim();
  if (body.description != null) product.description = String(body.description).trim();
  if (body.price != null) product.price = Number(body.price) || 0;
  if (body.promoPrice !== undefined) {
    product.promoPrice = body.promoPrice === "" || body.promoPrice == null ? null : Number(body.promoPrice);
  }
  if (body.category != null) {
    product.category = String(body.category).trim() || "Outros";
    if (!db.categories.includes(product.category)) db.categories.push(product.category);
  }
  if (body.stock !== undefined) product.stock = body.stock === "" || body.stock == null ? null : Number(body.stock);
  if (body.stockActive !== undefined) product.stockActive = body.stockActive === "true" || body.stockActive === true;
  if (body.cost !== undefined) product.cost = body.cost === "" || body.cost == null ? null : Number(body.cost);
  if (body.pin !== undefined) product.pin = body.pin === "true" || body.pin === true;
  if (body.active !== undefined) product.active = body.active !== "false" && body.active !== false;
  if (req.file) product.image = `/uploads/${req.file.filename}`;
  if (body.optionGroup !== undefined || body.options !== undefined) {
    const parsed = parseOptionPayload(body, product);
    product.optionGroup = parsed.optionGroup;
    product.options = parsed.options;
  }
  saveDb(db);
  res.json({ product });
});

app.delete("/api/products/:id", requireAuth, (req, res) => {
  const db = loadDb();
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== req.params.id);
  if (db.products.length === before) return res.status(404).json({ error: "Produto não encontrado." });
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/products/:id/duplicate", requireAuth, (req, res) => {
  const db = loadDb();
  const source = db.products.find((p) => p.id === req.params.id);
  if (!source) return res.status(404).json({ error: "Produto não encontrado." });
  const copy = {
    ...JSON.parse(JSON.stringify(source)),
    id: uid("p"),
    name: `${source.name} (cópia)`,
    createdAt: new Date().toISOString(),
    active: false,
  };
  db.products.unshift(copy);
  saveDb(db);
  res.json({ product: copy });
});

app.patch("/api/products/:id/quick", requireAuth, (req, res) => {
  const db = loadDb();
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Produto não encontrado." });
  const b = req.body || {};
  if (b.active !== undefined) product.active = !!b.active;
  if (b.pin !== undefined) product.pin = !!b.pin;
  if (b.stockActive !== undefined) product.stockActive = !!b.stockActive;
  if (b.stock !== undefined) product.stock = b.stock === null || b.stock === "" ? null : Number(b.stock);
  if (b.cost !== undefined) product.cost = b.cost === null || b.cost === "" ? null : Number(b.cost);
  saveDb(db);
  res.json({ product });
});

app.get("/api/ledger", requireAuth, (_req, res) => {
  const db = loadDb();
  res.json({ ledger: db.ledger });
});

app.post("/api/stock/move", requireAuth, (req, res) => {
  const db = loadDb();
  const b = req.body || {};
  const type = String(b.type || "");
  const qty = parseQty(b.qty);
  if (!["in", "sale", "adjust"].includes(type)) {
    return res.status(400).json({ error: "Tipo inválido." });
  }
  if (!qty) return res.status(400).json({ error: "Informe a quantidade." });
  const product = db.products.find((p) => p.id === b.productId);
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
  const unitCost = product.cost == null || product.cost === "" ? null : Number(product.cost);
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
  saveDb(db);
  res.json({ product, entry, ledger: db.ledger });
});

app.delete("/api/ledger/:id", requireAuth, (req, res) => {
  const db = loadDb();
  const idx = db.ledger.findIndex((x) => x.id === req.params.id);
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
  saveDb(db);
  res.json({ ok: true, product: product || null, ledger: db.ledger });
});

app.get("/api/users", requireAdmin, (_req, res) => {
  const db = loadDb();
  res.json({ users: db.users.map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role })) });
});

app.post("/api/users", requireAdmin, (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const name = String(req.body.name || username).trim();
  if (!username || password.length < 4) {
    return res.status(400).json({ error: "Usuário e senha (mínimo 4 caracteres) são obrigatórios." });
  }
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
  saveDb(db);
  res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

app.put("/api/users/:id/password", requireAuth, (req, res) => {
  const db = loadDb();
  const me = req.session.user;
  if (me.role !== "admin" && me.id !== req.params.id) {
    return res.status(403).json({ error: "Você só pode alterar a própria senha." });
  }
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
  const password = String(req.body.password || "");
  if (password.length < 4) return res.status(400).json({ error: "Senha muito curta." });
  const pass = hashPassword(password);
  user.salt = pass.salt;
  user.hash = pass.hash;
  saveDb(db);
  res.json({ ok: true });
});

app.delete("/api/users/:id", requireAdmin, (req, res) => {
  const db = loadDb();
  if (req.params.id === req.session.user.id) {
    return res.status(400).json({ error: "Você não pode excluir o próprio acesso." });
  }
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== req.params.id);
  if (db.users.length === before) return res.status(404).json({ error: "Usuário não encontrado." });
  saveDb(db);
  res.json({ ok: true });
});

app.put("/api/settings", requireAdmin, (req, res) => {
  const db = loadDb();
  const s = db.settings;
  const b = req.body || {};
  ["name", "tagline", "extra", "whatsapp", "instagram", "address", "checkoutMessage"].forEach((k) => {
    if (b[k] != null) s[k] = String(b[k]);
  });
  if (Array.isArray(b.payments)) s.payments = b.payments.map(String);
  if (Array.isArray(b.shipping)) {
    s.shipping = b.shipping.map((x) => ({
      name: String(x.name || ""),
      price: Number(x.price) || 0,
      description: String(x.description || ""),
    }));
  }
  if (Array.isArray(b.categories)) db.categories = b.categories.map(String).filter(Boolean);
  saveDb(db);
  res.json({ settings: db.settings, categories: db.categories });
});

app.post("/api/settings/banner", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Envie uma imagem." });
  const db = loadDb();
  db.settings.banner = `/uploads/${req.file.filename}`;
  saveDb(db);
  res.json({ banner: db.settings.banner });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/admin")) {
    return res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// JSON malformado ou erro de upload não deve derrubar o servidor
app.use((err, _req, res, _next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido." });
  }
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: "Falha no upload: " + err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno." });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Dados inválidos." });
  }
  if (err && err.message && /imagem/i.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno. Tente de novo." });
});

app.listen(PORT, () => {
  console.log(`GOLD SKULL no ar: http://localhost:${PORT}`);
  console.log(`Painel: http://localhost:${PORT}/admin`);
});
