const fs = require("fs");
const path = require("path");

const AID = "frUfvecQQ3WxIB";
const KEY = "62dafa86be9543879a9b32d347c40ab9";
const BASE = "https://kyte-api-gateway.azure-api.net/api/catalogv2";
const IMG_BASE = "https://images-cdn.kyte.site/v0/b/kyte-7c484.appspot.com/o";
const BANNER =
  "https://firebasestorage.googleapis.com/v0/b/kyte-7c484.appspot.com/o/frUfvecQQ3WxIB%2FD36F5D38-0840-4896-9836-A708BE34A84B.jpg?alt=media&token=9520bc55-da15-4612-bca8-1b79e7b98904";

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");

function hashPassword(password, salt) {
  const crypto = require("crypto");
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64).toString("hex");
  return { salt: s, hash };
}

function cleanCategory(name) {
  if (!name) return "Outros";
  const n = name.replace(/[🍯🍁📦]/g, "").trim();
  if (/itaj/i.test(n)) return "Itajaí e Região";
  if (/joinville/i.test(n)) return "Joinville";
  if (/atacado/i.test(n)) return "Atacado";
  return n || "Outros";
}

function imageUrl(rel) {
  if (!rel) return "";
  if (/^https?:/i.test(rel)) return rel;
  return IMG_BASE + rel;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": KEY,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchAllProducts() {
  const all = [];
  let skip = 0;
  const limit = 50;
  while (true) {
    const url = `${BASE}/product/${AID}?aid=${AID}&limit=${limit}&skip=${skip}&isCatalog=true`;
    const data = await fetchJson(url);
    const batch = data._products || [];
    all.push(...batch);
    console.log(`Baixados ${all.length} de ${data.count} produtos...`);
    if (batch.length === 0 || all.length >= data.count) break;
    skip += batch.length;
  }
  const seen = new Set();
  return all.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return p.active !== false && p.showOnCatalog !== false;
  });
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return true;
}

(async () => {
  fs.mkdirSync(UPLOADS, { recursive: true });
  const raw = await fetchAllProducts();
  const products = [];

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const ext = path.extname((p.image || "").split("?")[0]) || ".jpg";
    const file = `${p.id}${ext}`;
    const dest = path.join(UPLOADS, file);
    const src = imageUrl(p.image || p.imageLarge || p.imageMedium);
    let image = "";
    if (src) {
      try {
        const ok = await downloadFile(src, dest);
        image = ok ? `/uploads/${file}` : src;
        process.stdout.write(`Foto ${i + 1}/${raw.length} ${ok ? "ok" : "remoto"}\n`);
      } catch {
        image = src;
      }
    }
    products.push({
      id: p.id,
      name: (p.name || "").trim(),
      description: p.description || "",
      price: Number(p.salePrice) || 0,
      promoPrice: p.salePromotionalPrice ? Number(p.salePromotionalPrice) : null,
      category: cleanCategory(p.category && p.category.name),
      image,
      stock: p.stock && typeof p.stock.current === "number" ? p.stock.current : null,
      stockActive: !!p.stockActive,
      pin: !!p.pin,
      active: true,
      createdAt: p.dateCreation || new Date().toISOString(),
    });
  }

  products.sort((a, b) => Number(b.pin) - Number(a.pin) || a.name.localeCompare(b.name, "pt-BR"));

  const bannerFile = path.join(UPLOADS, "banner.jpg");
  try {
    await downloadFile(BANNER, bannerFile);
  } catch {}

  const adminPass = hashPassword("goldskull");
  const db = {
    settings: {
      name: "GOLD SKULL",
      tagline: "Loja online de flavors THC",
      extra: "Produtos Premium · Delta-9 · Live Resin · Live Rosin · Liquid Diamond · Pods THC\nAtendimento para clientes exclusivos · Entrega rápida e discreta",
      whatsapp: "5583920027847",
      instagram: "GREENSKULL",
      address: "Santa Catarina",
      themeColor: "#ffbe0e",
      banner: fs.existsSync(bannerFile) ? "/uploads/banner.jpg" : "",
      payments: ["Pix (solicite a chave no atendimento)", "Cartão via link de pagamento"],
      shipping: [
        { name: "Motoboy", price: 15, description: "Joinville, Itajaí, Florianópolis e Curitiba" },
        { name: "Transportadora", price: 50, description: "Envio para outras cidades" },
      ],
      checkoutMessage: "Em breve confirmamos os detalhes da sua compra. Obrigado pela preferência!",
    },
    categories: ["Itajaí e Região", "Joinville", "Atacado"],
    products,
    users: [
      {
        id: "u-admin",
        username: "admin",
        name: "Administrador",
        role: "admin",
        salt: adminPass.salt,
        hash: adminPass.hash,
        createdAt: new Date().toISOString(),
      },
    ],
  };

  fs.writeFileSync(path.join(DATA, "db.json"), JSON.stringify(db, null, 2));
  console.log(`Pronto: ${products.length} produtos importados.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
