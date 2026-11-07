/**
 * Firebase Admin SDK — server-only.
 * Used by /api/auth/firebase to verify the ID token the client sends after
 * completing phone auth.
 *
 * Credentials come from:
 *   Project settings → Service accounts → Generate new private key
 *
 * The private key JSON contains "type", "project_id", "client_email",
 * "private_key" (and more).  We only need the three values below.
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // The private key is stored as a single-line string in .env with literal \n.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin env vars missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.",
    );
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/**
 * Verify a Firebase ID token (returned by `user.getIdToken()` on the client).
 * Returns the decoded token on success, throws on failure.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getAdminApp();
  return getAuth(app).verifyIdToken(idToken);
}
