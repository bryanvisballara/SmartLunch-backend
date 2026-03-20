require('dotenv').config();

const admin = require('firebase-admin');

function getServiceAccount() {
  const serviceAccountRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (serviceAccountRaw) {
    return JSON.parse(serviceAccountRaw);
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase service account env vars');
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

async function main() {
  const serviceAccount = getServiceAccount();
  const credential = admin.credential.cert(serviceAccount);
  const accessToken = await credential.getAccessToken();

  console.log(JSON.stringify({
    ok: true,
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    tokenType: accessToken?.token_type || null,
    expiresIn: accessToken?.expires_in || null,
    accessTokenPreview: accessToken?.access_token ? `${accessToken.access_token.slice(0, 24)}...` : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }, null, 2));
  process.exit(1);
});