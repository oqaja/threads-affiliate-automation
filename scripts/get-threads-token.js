/**
 * get-threads-token.js
 * Helper sekali-pakai buat nyiapin secrets Threads.
 *
 * Pakai:
 *   THREADS_APP_SECRET=xxx SHORT_LIVED_TOKEN=yyy node scripts/get-threads-token.js
 *
 * Output: long-lived access token (berlaku 60 hari, bisa auto-refresh) + Threads user id.
 * Masukkan hasilnya ke GitHub Secrets sebagai THREADS_ACCESS_TOKEN dan THREADS_USER_ID.
 */

(async () => {
  const appSecret = process.env.THREADS_APP_SECRET;
  const shortToken = process.env.SHORT_LIVED_TOKEN || process.argv[2];
  if (!appSecret || !shortToken) {
    console.error("Set THREADS_APP_SECRET dan SHORT_LIVED_TOKEN (atau kasih token sebagai argumen pertama).");
    process.exit(1);
  }

  const exUrl = new URL("https://graph.threads.net/access_token");
  exUrl.searchParams.set("grant_type", "th_exchange_token");
  exUrl.searchParams.set("client_secret", appSecret);
  exUrl.searchParams.set("access_token", shortToken);

  const exRes = await fetch(exUrl);
  const ex = await exRes.json();
  if (!exRes.ok) {
    console.error("Gagal exchange token:", ex);
    process.exit(1);
  }
  const longToken = ex.access_token;
  console.log(`\nTHREADS_ACCESS_TOKEN=${longToken}`);
  console.log(`(expires_in: ${ex.expires_in}s ~ ${Math.round(ex.expires_in / 86400)} hari)`);

  const meUrl = new URL("https://graph.threads.net/v1.0/me");
  meUrl.searchParams.set("fields", "id,username");
  meUrl.searchParams.set("access_token", longToken);
  const meRes = await fetch(meUrl);
  const me = await meRes.json();
  if (meRes.ok) {
    console.log(`THREADS_USER_ID=${me.id}   (@${me.username})`);
  } else {
    console.error("Gagal ambil user id:", me);
  }
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
