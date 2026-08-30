/**
 * threadsAuth.js
 * Ambil client Threads dari environment + auto-refresh long-lived token.
 *
 * Long-lived token Threads berlaku 60 hari dan bisa di-refresh (asal umurnya
 * sudah > 24 jam). Tiap run kita coba refresh; kalau dapat token baru, tulis
 * balik ke GitHub Secret THREADS_ACCESS_TOKEN supaya tidak pernah kedaluwarsa.
 *
 * Secrets yang dibutuhkan:
 *   THREADS_USER_ID       - Threads user id (angka)
 *   THREADS_ACCESS_TOKEN  - long-lived access token
 *   SECRETS_WRITE_PAT     - PAT (scope: repo secrets) buat nulis balik token, opsional saat lokal
 */

const sodium = require("libsodium-wrappers");
const { makeClient } = require("./threadsClient");

async function updateGithubSecret(secretName, secretValue) {
  const pat = process.env.SECRETS_WRITE_PAT;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!pat || !repo) {
    console.log("  (info) SECRETS_WRITE_PAT/GITHUB_REPOSITORY tidak ada - skip nulis balik token (kemungkinan jalan lokal).");
    return;
  }

  await sodium.ready;
  const keyRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!keyRes.ok) throw new Error(`Gagal ambil public key repo: ${keyRes.status} ${await keyRes.text()}`);
  const { key, key_id } = await keyRes.json();

  const encrypted = sodium.crypto_box_seal(
    sodium.from_string(secretValue),
    sodium.from_base64(key, sodium.base64_variants.ORIGINAL)
  );
  const encryptedBase64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/${secretName}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ encrypted_value: encryptedBase64, key_id }),
  });
  if (!putRes.ok) throw new Error(`Gagal update secret ${secretName}: ${putRes.status} ${await putRes.text()}`);
  console.log(`  Secret '${secretName}' berhasil di-update.`);
}

async function refreshLongLivedToken(token) {
  const url = new URL("https://graph.threads.net/refresh_access_token");
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Umur token < 24 jam atau alasan lain -> jalan terus pakai token lama.
    console.log(`  (info) Refresh token Threads dilewati: ${json.error ? json.error.message : res.status}`);
    return token;
  }
  return json.access_token || token;
}

async function getThreadsClient() {
  const userId = process.env.THREADS_USER_ID;
  const currentToken = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !currentToken) {
    throw new Error("THREADS_USER_ID / THREADS_ACCESS_TOKEN belum di-set.");
  }

  const newToken = await refreshLongLivedToken(currentToken);
  if (newToken && newToken !== currentToken) {
    console.log("  Token Threads di-refresh, nulis balik ke GitHub Secret...");
    await updateGithubSecret("THREADS_ACCESS_TOKEN", newToken).catch((e) =>
      console.log(`  (warning) gagal nulis balik token: ${e.message}`)
    );
  }

  return makeClient({ userId, accessToken: newToken || currentToken });
}

module.exports = { getThreadsClient, refreshLongLivedToken, updateGithubSecret };
