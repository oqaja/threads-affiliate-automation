/**
 * shopeeAffiliateClient.js
 * Client tipis buat Shopee Affiliate Open API (GraphQL, endpoint
 * https://open-api.affiliate.shopee.co.id/graphql).
 *
 * Auth: signature SHA-256 (BUKAN HMAC) atas concat string, sesuai skema resmi Shopee:
 *   Signature = SHA256(AppId + Timestamp + Payload + Secret)
 *   Header:    Authorization: SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={Signature}
 * Timestamp = unix time detik (bukan ms). Window toleransi ±~5 menit dari waktu server Shopee.
 */

const crypto = require("crypto");
const { CONFIG } = require("./config");

function getShopeeCredentials() {
  const appId = process.env[CONFIG.SHOPEE.APP_ID_ENV];
  const secret = process.env[CONFIG.SHOPEE.APP_SECRET_ENV];
  if (!appId || !secret) {
    throw new Error(`${CONFIG.SHOPEE.APP_ID_ENV} / ${CONFIG.SHOPEE.APP_SECRET_ENV} belum di-set.`);
  }
  return { appId, secret };
}

function buildAuthorizationHeader({ appId, secret, payload, timestamp }) {
  const base = `${appId}${timestamp}${payload}${secret}`;
  const signature = crypto.createHash("sha256").update(base, "utf8").digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

/** POST 1 request GraphQL ke Shopee Affiliate Open API. Return `data` (throw kalau ada `errors`). */
async function shopeeGraphQL({ query, variables }) {
  const { appId, secret } = getShopeeCredentials();
  const payload = JSON.stringify({ query, variables: variables || {} });
  const timestamp = Math.floor(Date.now() / 1000);
  const authorization = buildAuthorizationHeader({ appId, secret, payload, timestamp });

  const res = await fetch(CONFIG.SHOPEE.API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: payload,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = json.errors ? json.errors.map((e) => e.message).join("; ") : `${res.status} ${res.statusText}`;
    throw new Error(`Shopee GraphQL error: ${msg}`);
  }
  return json.data;
}

module.exports = { shopeeGraphQL, buildAuthorizationHeader, getShopeeCredentials };
