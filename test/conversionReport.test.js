const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { flattenNodes, mapStatus, buildSubId, dedupKey } = require("../src/lib/conversionReport");
const { buildAuthorizationHeader } = require("../src/lib/shopeeAffiliateClient");
const { generateRowId } = require("../src/lib/rowId");

test("buildAuthorizationHeader: signature = SHA256(AppId+Timestamp+Payload+Secret)", () => {
  const appId = "123456";
  const secret = "s3cr3t";
  const payload = '{"query":"{ x }"}';
  const timestamp = 1577836800;
  const header = buildAuthorizationHeader({ appId, secret, payload, timestamp });

  const expectedSig = crypto
    .createHash("sha256")
    .update(`${appId}${timestamp}${payload}${secret}`, "utf8")
    .digest("hex");
  assert.equal(header, `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${expectedSig}`);
});

test("mapStatus: normalisasi status Shopee -> Pending/Validated/Invalid", () => {
  assert.equal(mapStatus("PENDING"), "Pending");
  assert.equal(mapStatus("unpaid"), "Pending");
  assert.equal(mapStatus("COMPLETED"), "Validated");
  assert.equal(mapStatus("CANCELLED"), "Invalid");
  assert.equal(mapStatus("SomethingElse"), "SomethingElse");
  assert.equal(mapStatus(""), "");
});

test("buildSubId: gabung subId1|subId2, kosong kalau dua-duanya kosong", () => {
  assert.equal(buildSubId({ subId1: "weidenmann02", subId2: "a1b2c3d4" }), "weidenmann02|a1b2c3d4");
  assert.equal(buildSubId({ subId1: "weidenmann02" }), "weidenmann02|");
  assert.equal(buildSubId({}), "");
});

test("dedupKey: kombinasi Order ID + Item ID", () => {
  assert.equal(dedupKey("ORD1", "ITEM1"), "ORD1::ITEM1");
  assert.notEqual(dedupKey("ORD1", "ITEM1"), dedupKey("ORD1ITEM", "1"));
});

test("flattenNodes: 1 baris per (order, item), Sub ID diwarisi dari conversion node", () => {
  const nodes = [
    {
      purchaseTime: 1700000000,
      subId1: "weidenmann02",
      subId2: "a1b2c3d4",
      orders: [
        {
          orderId: "ORD1",
          orderStatus: "COMPLETED",
          items: [
            { itemId: "IT1", itemName: "Produk A", itemPrice: 100000, qty: 2, itemTotalCommission: 5000 },
            { itemId: "IT2", itemName: "Produk B", itemPrice: 50000, qty: 1, itemTotalCommission: 2000 },
          ],
        },
      ],
    },
  ];
  const rows = flattenNodes(nodes);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.itemId),
    ["IT1", "IT2"]
  );
  assert.equal(rows[0].subId, "weidenmann02|a1b2c3d4");
  assert.equal(rows[0].status, "Validated");
  assert.equal(rows[0].orderId, "ORD1");
});

test("generateRowId: 8 hex char, hindari collision dengan existing set", () => {
  const existing = new Set(["aaaaaaaa"]);
  const id = generateRowId(existing);
  assert.match(id, /^[0-9a-f]{8}$/);
  assert.notEqual(id, "aaaaaaaa");
});
