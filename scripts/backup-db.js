const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "data", "db.json");
const dir = path.join(root, "backups");
const stamp = new Date().toISOString().slice(0, 10);
const dest = path.join(dir, `db-${stamp}.json`);

fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("Backup salvo em:", dest);
