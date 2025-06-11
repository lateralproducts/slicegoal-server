// lib/firebase-admin.ts
import * as admin from "firebase-admin";

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY_JSON environment variable is not defined");
}

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export { admin };