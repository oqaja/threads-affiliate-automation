/**
 * conversionReport.js
 * Tarik conversionReport dari Shopee Affiliate Open API (GraphQL), lalu append
 * baris baru ke tab "CONVERSION REPORT" di Sheet "JADWAL THREADS".
 *
 * Dedup key: Order ID + Item ID — baris yang sudah ada di tab (berdasar kombinasi
 * itu) di-skip, tidak di-append ulang.
 *
 * ⚠️ QUERY di bawah BELUM DIVERIFIKASI lewat introspection resmi — dokumentasi
 * publik field conversionReport (termasuk nama pasti field sub-ID) tidak lengkap.
 * Sebelum ngandelin cron job ini, jalankan `npm run shopee:introspect` dan
 * cocokkan nama field di QUERY + flattenNodes() kalau Shopee balikin error
 * "Cannot query field ...".
 *
 * Catatan penting: field subId1/subId2 di sini cuma KEMBALI dari Shopee kalau
 * Link Affiliate yang dipakai waktu posting SUDAH ditag pakai sub_id1/sub_id2
 * (kodeProduk + Row ID) saat link itu dibuat. Script ini cuma NARIK laporan —
 * penandaan sub-id di pembuatan link ada di luar scope script ini.
 */

const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, appendRows, ensureSheetWithHeaders } = require("./sheetsHelper");
const { shopeeGraphQL } = require("./shopeeAffiliateClient");
const { toSheetDateString } = require("./dateUtils");

const CC = CONFIG.CONVERSION_COL;

const CONVERSION_HEADERS = [
  CC.TANGGAL_ORDER,
  CC.ORDER_ID,
  CC.ITEM_ID,
  CC.NAMA_PRODUK,
  CC.SUB_ID,
  CC.QTY,
  CC.HARGA,
  CC.KOMISI,
  CC.STATUS,
  CC.TANGGAL_TARIK,
];

const QUERY = `
  query ConversionReport($start: Int!, $end: Int!, $limit: Int!, $scrollId: String) {
    conversionReport(
      purchaseTimeStart: $start
      purchaseTimeEnd: $end
      limit: $limit
      scrollId: $scrollId
    ) {
      nodes {
        conversionId
        purchaseTime
        subId1
        subId2
        orders {
          orderId
          orderStatus
          items {
            itemId
            itemName
            itemPrice
            qty
            itemTotalCommission
          }
        }
      }
      pageInfo {
        hasNextPage
        scrollId
      }
    }
  }
`;

function mapStatus(raw) {
  const v = String(raw || "").trim().toUpperCase();
  if (["PENDING", "UNPAID"].includes(v)) return "Pending";
  if (["VALID", "VALIDATED", "COMPLETED", "CONFIRMED"].includes(v)) return "Validated";
  if (["INVALID", "CANCELLED", "CANCELED", "REJECTED", "FRAUD"].includes(v)) return "Invalid";
  return raw ? String(raw) : "";
}

/** Gabungkan subId1 (kode produk) + subId2 (Row ID JADWAL THREADS) jadi 1 kolom "Sub ID". */
function buildSubId(node) {
  const s1 = node.subId1 != null ? String(node.subId1) : "";
  const s2 = node.subId2 != null ? String(node.subId2) : "";
  if (!s1 && !s2) return "";
  return `${s1}|${s2}`;
}

/** conversionReport.nodes -> flat array 1 baris per (order, item). */
function flattenNodes(nodes) {
  const rows = [];
  for (const node of nodes || []) {
    for (const order of node.orders || []) {
      for (const item of order.items || []) {
        rows.push({
          orderId: order.orderId != null ? String(order.orderId) : "",
          itemId: item.itemId != null ? String(item.itemId) : "",
          itemName: item.itemName || "",
          subId: buildSubId(node),
          qty: item.qty != null ? item.qty : "",
          harga: item.itemPrice != null ? item.itemPrice : "",
          komisi: item.itemTotalCommission != null ? item.itemTotalCommission : "",
          status: mapStatus(order.orderStatus),
          purchaseTime: node.purchaseTime,
        });
      }
    }
  }
  return rows;
}

async function fetchAllConversions({ start, end }) {
  const nodes = [];
  let scrollId;
  let hasNextPage = true;
  let guard = 0;
  while (hasNextPage && guard < 200) {
    guard++;
    const data = await shopeeGraphQL({
      query: QUERY,
      variables: { start, end, limit: CONFIG.SHOPEE.PAGE_LIMIT, scrollId: scrollId || null },
    });
    const report = data.conversionReport;
    nodes.push(...(report.nodes || []));
    hasNextPage = !!(report.pageInfo && report.pageInfo.hasNextPage);
    scrollId = report.pageInfo && report.pageInfo.scrollId;
    if (hasNextPage && !scrollId) break; // no more pagination token dari Shopee, berhenti aman
  }
  return nodes;
}

function dedupKey(orderId, itemId) {
  return `${orderId}::${itemId}`;
}

/** Bangun array row sepanjang jumlah kolom di headerMap, isi berdasar nama kolom -> value. */
function buildRowArray(headerMap, valuesByColName) {
  const maxCol = Math.max(0, ...Object.values(headerMap));
  const arr = new Array(maxCol).fill("");
  for (const [colName, value] of Object.entries(valuesByColName)) {
    const colNum = headerMap[colName];
    if (colNum) arr[colNum - 1] = value;
  }
  return arr;
}

async function runConversionReport({ sheets }) {
  await ensureSheetWithHeaders(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.CONVERSION_SHEET_NAME, CONVERSION_HEADERS);
  const headerMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.CONVERSION_SHEET_NAME, CONFIG.CONVERSION_HEADER_ROW
  );

  const { rows: existingRows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.CONVERSION_SHEET_NAME, CONFIG.CONVERSION_HEADER_ROW
  );
  const existingKeys = new Set(
    existingRows.map((r) => dedupKey(String(r[CC.ORDER_ID] || "").trim(), String(r[CC.ITEM_ID] || "").trim()))
  );
  console.log(`Tab "${CONFIG.CONVERSION_SHEET_NAME}" sudah punya ${existingRows.length} baris.`);

  const now = new Date();
  const end = Math.floor(now.getTime() / 1000);
  const start = end - CONFIG.SHOPEE.LOOKBACK_DAYS * 24 * 60 * 60;
  console.log(`Tarik conversionReport dari Shopee: ${new Date(start * 1000).toISOString()} s/d ${new Date(end * 1000).toISOString()}`);

  const nodes = await fetchAllConversions({ start, end });
  const flat = flattenNodes(nodes);
  console.log(`Shopee balikin ${nodes.length} conversion node -> ${flat.length} baris order-item.`);

  const tarikAt = toSheetDateString(now);
  const newRows = [];
  for (const r of flat) {
    const key = dedupKey(r.orderId, r.itemId);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key); // jaga-jaga ada duplikat di dalam response yang sama

    newRows.push(
      buildRowArray(headerMap, {
        [CC.TANGGAL_ORDER]: r.purchaseTime ? toSheetDateString(new Date(r.purchaseTime * 1000)) : "",
        [CC.ORDER_ID]: r.orderId,
        [CC.ITEM_ID]: r.itemId,
        [CC.NAMA_PRODUK]: r.itemName,
        [CC.SUB_ID]: r.subId,
        [CC.QTY]: r.qty,
        [CC.HARGA]: r.harga,
        [CC.KOMISI]: r.komisi,
        [CC.STATUS]: r.status,
        [CC.TANGGAL_TARIK]: tarikAt,
      })
    );
  }

  if (!newRows.length) {
    console.log("Tidak ada baris baru (semua sudah ada / dedup by Order ID + Item ID).");
    return { fetched: flat.length, appended: 0 };
  }

  await appendRows(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.CONVERSION_SHEET_NAME, newRows);
  console.log(`Append ${newRows.length} baris baru ke "${CONFIG.CONVERSION_SHEET_NAME}".`);
  return { fetched: flat.length, appended: newRows.length };
}

module.exports = { runConversionReport, flattenNodes, mapStatus, buildSubId, dedupKey, QUERY, CONVERSION_HEADERS };
