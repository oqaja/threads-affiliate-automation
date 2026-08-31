const fs = require("fs");
const { google } = require("googleapis");

function getServiceAccountCredentials() {
  // Urutan: (1) file JSON lokal, (2) JSON inline, (3) pasangan email + private key.
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw && raw.trim().startsWith("{")) {
    return JSON.parse(raw);
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (email && privateKey) {
    // GitHub Secrets sering nyimpen "\n" literal — normalkan jadi newline asli.
    if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");
    return { client_email: email, private_key: privateKey };
  }

  throw new Error(
    "Kredensial Google tidak ditemukan. Set salah satu: GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path), " +
      "GOOGLE_SERVICE_ACCOUNT_KEY (JSON inline), atau GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY."
  );
}

async function getGoogleAuthClients() {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
    ],
  });
  const client = await auth.getClient();
  return {
    sheets: google.sheets({ version: "v4", auth: client }),
    drive: google.drive({ version: "v3", auth: client }),
    docs: google.docs({ version: "v1", auth: client }),
  };
}

function getServiceAccountEmail() {
  try {
    return getServiceAccountCredentials().client_email || "(unknown)";
  } catch {
    return "(unknown)";
  }
}

module.exports = { getGoogleAuthClients, getServiceAccountEmail };
