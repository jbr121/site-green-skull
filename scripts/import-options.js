const fs = require("fs");
const path = require("path");

const UID = "frUfvecQQ3WxIBIItEWqzJkz09i2";
const IMG_BASE = "https://images-cdn.kyte.site/v0/b/kyte-7c484.appspot.com/o";
const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "db.json");
const UPLOADS = path.join(ROOT, "data", "uploads");
const PUBLIC_UPLOADS = path.join(ROOT, "public", "uploads");

function optionImageUrl(filename) {
  if (!filename) return "";
  return `${IMG_BASE}/${UID}%2F${filename}?alt=media`;
}

function extractGroups(html, productId) {
  const u = html.replace(/\\"/g, '"');
  const idx = u.indexOf(`"id":"${productId}"`);
  if (idx < 0) return null;
  const chunk = u.slice(idx, idx + 50000);
  const start = chunk.indexOf('"variations":[');
  const end = chunk.indexOf('],"variants":');
  if (start < 0 || end < 0) return { optionGroup: "", options: [] };
  try {
    const groups = JSON.parse(chunk.slice(start + '"variations":'.length, end + 1));
    const g = groups[0];
    if (!g || !Array.isArray(g.options) || !g.options.length) return { optionGroup: "", options: [] };
    const stockMap = {};
    const vChunk = chunk.slice(chunk.indexOf('"variants":['), chunk.indexOf('"variants":[') + 20000);
    const re = /"title":"([^"]+)"[\s\S]{0,900}?"stockStatus":"([^"]+)"/g;
    let m;
    while ((m = re.exec(vChunk))) stockMap[m[1]] = m[2] !== "OUT_OF_STOCK";
    return {
      optionGroup: g.name || "Opção",
      options: g.options.map((o, i) => ({
        id: `opt-${i}`,
        title: o.title || `Opção ${i + 1}`,
        imageFile: (o.photos && o.photos.image) || "",
        available: stockMap[o.title] !== false,
      })),
    };
  } catch {
    return { optionGroup: "", options: [] };
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) return false;
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

async function fetchProductPage(id) {
  const url = `https://goldskullpodthc.kyte.site/pt-BR/p/x/${id}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

(async () => {
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(PUBLIC_UPLOADS, { recursive: true });
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  let withOpts = 0;
  for (let i = 0; i < db.products.length; i++) {
    const p = db.products[i];
    process.stdout.write(`[${i + 1}/${db.products.length}] ${p.name.slice(0, 40)}... `);
    try {
      const html = await fetchProductPage(p.id);
      const parsed = extractGroups(html, p.id);
      if (!parsed || !parsed.options.length) {
        p.optionGroup = p.optionGroup || "";
        p.options = p.options || [];
        console.log("sem opções");
        continue;
      }
      for (let j = 0; j < parsed.options.length; j++) {
        const opt = parsed.options[j];
        if (!opt.imageFile) continue;
        const file = `opt-${p.id}-${j}.jpg`;
        const dest = path.join(UPLOADS, file);
        const ok = await downloadFile(optionImageUrl(opt.imageFile), dest);
        opt.image = ok ? `/uploads/${file}` : "";
        if (ok) fs.copyFileSync(dest, path.join(PUBLIC_UPLOADS, file));
        delete opt.imageFile;
      }
      p.optionGroup = parsed.optionGroup;
      p.options = parsed.options.map(({ id, title, image, available }) => ({ id, title, image: image || "", available }));
      withOpts++;
      console.log(`${parsed.options.length} sabores (${parsed.optionGroup})`);
    } catch (err) {
      console.log("erro", err.message);
      p.optionGroup = p.optionGroup || "";
      p.options = p.options || [];
    }
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`Pronto: ${withOpts} produtos com opções.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
