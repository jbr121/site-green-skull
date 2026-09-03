const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

function norm(name) {
  return String(name)
    .replace(/^(pack\s*)?10\s*unid\.?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const src = {};
for (const p of db.products) {
  if (!p.options || !p.options.length) continue;
  const k = norm(p.name);
  if (!src[k] || p.options.length > src[k].options.length) src[k] = p;
}

let n = 0;
for (const p of db.products) {
  if (p.options && p.options.length) continue;
  const s = src[norm(p.name)];
  if (!s || s.id === p.id) continue;
  p.optionGroup = s.optionGroup;
  p.options = s.options.map((o) => ({
    id: o.id,
    title: o.title,
    image: o.image || "",
    available: o.available !== false,
  }));
  n += 1;
  console.log(`copied ${p.name} <- ${s.name} (${p.options.length})`);
}

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`packs updated: ${n}`);
