const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../server");

describe("servidor exportado", () => {
  it("health responde sem vazar ambiente e com cabeçalhos defensivos", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(res.body.env, undefined);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["x-powered-by"], undefined);
  });
});
