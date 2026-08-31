/**
 * threadsClient.js
 * Wrapper tipis buat Threads Graph API (https://developers.facebook.com/docs/threads).
 *
 * Alur publish 1 post:
 *   1. createContainer(...)  -> creation_id
 *   2. waitUntilFinished(creation_id)  (khusus IMAGE/CAROUSEL, TEXT langsung siap)
 *   3. publishContainer(creation_id)  -> media_id (ini yang disimpan sebagai POST ID)
 */

const { CONFIG } = require("./config");

const BASE = CONFIG.THREADS_API_BASE;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiCall(method, path, params) {
  const url = new URL(`${BASE}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    if (method === "GET") url.searchParams.set(k, v);
    else body.set(k, v);
  }

  const res = await fetch(url, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : body,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json.error ? `${json.error.message} (code ${json.error.code})` : text;
    throw new Error(`Threads API ${method} ${path} gagal: ${res.status} ${msg}`);
  }
  return json;
}

function makeClient({ userId, accessToken }) {
  if (!userId || !accessToken) {
    throw new Error("threadsClient butuh userId + accessToken.");
  }
  const auth = { access_token: accessToken };

  const { isDryRun } = require("./env");
  if (isDryRun()) {
    let n = 0;
    return {
      async createContainer(o) {
        n++;
        const kind = o.children ? `CAROUSEL(${o.children.length})` : o.mediaType + (o.imageUrl ? "+img" : "");
        console.log(
          `    [DRY] createContainer #${n} ${kind}${o.replyToId ? ` reply→${o.replyToId}` : ""}` +
            (o.text ? `\n          text: ${JSON.stringify(o.text.slice(0, 120))}${o.text.length > 120 ? "…" : ""}` : "")
        );
        return `DRY-CONTAINER-${n}`;
      },
      async getContainerStatus() {
        return { status: "FINISHED" };
      },
      async waitUntilFinished() {},
      async publishContainer(id) {
        console.log(`    [DRY] publish ${id}`);
        return `DRY-MEDIA-${id.replace("DRY-CONTAINER-", "")}`;
      },
      async getMediaInsights() {
        return {};
      },
      async getMediaTimestamp() {
        return new Date(Date.now() - 3600 * 1000).toISOString();
      },
    };
  }

  return {
    /**
     * Buat media container.
     * @param {object} o
     * @param {"TEXT"|"IMAGE"|"CAROUSEL"} o.mediaType
     * @param {string} [o.text]
     * @param {string} [o.imageUrl]        (IMAGE / carousel item)
     * @param {boolean} [o.isCarouselItem]
     * @param {string[]} [o.children]      (CAROUSEL: array creation_id item)
     * @param {string} [o.replyToId]       (media_id yang di-reply)
     */
    async createContainer(o) {
      const params = {
        ...auth,
        media_type: o.mediaType,
        text: o.text,
        image_url: o.imageUrl,
        reply_to_id: o.replyToId,
      };
      if (o.isCarouselItem) params.is_carousel_item = "true";
      if (o.children && o.children.length) params.children = o.children.join(",");
      const json = await apiCall("POST", `${userId}/threads`, params);
      return json.id;
    },

    async getContainerStatus(creationId) {
      const json = await apiCall("GET", `${creationId}`, {
        ...auth,
        fields: "status,error_message",
      });
      return json; // { status, error_message }
    },

    async waitUntilFinished(creationId) {
      const timeoutMs = CONFIG.THREADS_CONTAINER_TIMEOUT_S * 1000;
      const start = Date.now();
      let delay = 3000;
      while (Date.now() - start < timeoutMs) {
        const { status, error_message } = await this.getContainerStatus(creationId);
        if (status === "FINISHED") return;
        if (status === "ERROR" || status === "EXPIRED") {
          throw new Error(`Container ${creationId} status ${status}: ${error_message || "-"}`);
        }
        await sleep(delay);
        delay = Math.min(delay * 1.5, 15000);
      }
      throw new Error(`Container ${creationId} tidak FINISHED dalam ${CONFIG.THREADS_CONTAINER_TIMEOUT_S}s.`);
    },

    async publishContainer(creationId) {
      const json = await apiCall("POST", `${userId}/threads_publish`, {
        ...auth,
        creation_id: creationId,
      });
      return json.id; // media_id
    },

    /** ISO timestamp saat media dipublish (dipakai hitung jeda Utas 2). */
    async getMediaTimestamp(mediaId) {
      const json = await apiCall("GET", `${mediaId}`, { ...auth, fields: "timestamp" });
      return json.timestamp || null;
    },

    /** Ambil insights 1 media. Return objek { metricName: number }. */
    async getMediaInsights(mediaId, metrics) {
      const json = await apiCall("GET", `${mediaId}/insights`, {
        ...auth,
        metric: (metrics || ["views", "likes", "replies", "reposts", "quotes"]).join(","),
      });
      const out = {};
      for (const row of json.data || []) {
        const val =
          row.total_value && typeof row.total_value.value === "number"
            ? row.total_value.value
            : Array.isArray(row.values) && row.values[0]
            ? row.values[0].value
            : null;
        out[row.name] = val;
      }
      return out;
    },
  };
}

module.exports = { makeClient, apiCall, sleep };
