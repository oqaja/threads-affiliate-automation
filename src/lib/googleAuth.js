const fs = require("fs");
const { google } = require("googleapis");

function getServiceAccountCredentials() {
  // CI: JSON inline di env. Lokal: path ke file JSON via GOOGLE_SERVICE_ACCOUNT_KEY_FILE.
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "Set GOOGLE_SERVICE_ACCOUNT_KEY (JSON inline) atau GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path ke file JSON)."
    );
  }
  return JSON.parse(raw);
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
