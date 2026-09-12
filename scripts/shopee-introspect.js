/**
 * shopee-introspect.js — introspect schema GraphQL Shopee Affiliate Open API,
 * cari tipe & field yang berhubungan dengan "conversion" (conversionReport dkk).
 *
 * Dokumentasi resmi field conversionReport (termasuk nama pasti field sub-ID)
 * tidak lengkap dipublish Shopee — jalankan ini dulu buat mastiin nama field
 * sebelum mengandalkan query tebakan di src/lib/conversionReport.js.
 *
 *   npm run shopee:introspect
 *   FILTER=order npm run shopee:introspect   # filter nama tipe (default: "conversion")
 */

const { shopeeGraphQL } = require("../src/lib/shopeeAffiliateClient");

const INTROSPECTION_QUERY = `
  query IntrospectSchema {
    __schema {
      queryType { name }
      types {
        name
        kind
        fields {
          name
          type {
            name
            kind
            ofType { name kind ofType { name kind } }
          }
        }
      }
    }
  }
`;

function typeLabel(t) {
  if (!t) return "?";
  if (t.kind === "NON_NULL") return `${typeLabel(t.ofType)}!`;
  if (t.kind === "LIST") return `[${typeLabel(t.ofType)}]`;
  return t.name || t.kind;
}

(async () => {
  console.log("=== Shopee Affiliate — GraphQL schema introspection ===");
  const filter = (process.env.FILTER || "conversion").toLowerCase();

  const data = await shopeeGraphQL({ query: INTROSPECTION_QUERY });
  const types = (data.__schema && data.__schema.types) || [];

  console.log(`Query root: ${data.__schema.queryType.name}`);
  console.log(`Filter tipe yang namanya mengandung "${filter}":\n`);

  const matches = types.filter((t) => t.name && t.name.toLowerCase().includes(filter) && t.fields);
  if (!matches.length) {
    console.log(`  (tidak ada tipe yang cocok — coba FILTER=order atau FILTER="" buat lihat semua tipe)`);
  }
  for (const t of matches) {
    console.log(`type ${t.name} {`);
    for (const f of t.fields || []) {
      console.log(`  ${f.name}: ${typeLabel(f.type)}`);
    }
    console.log(`}\n`);
  }

  if (!filter) {
    console.log("Semua nama tipe:");
    console.log(types.map((t) => t.name).filter(Boolean).join(", "));
  }
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
