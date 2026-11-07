/**
 * Firebase client-side SDK initialisation.
 * Import `firebaseAuth` wherever you need signInWithPhoneNumber or RecaptchaVerifier.
 *
 * The three NEXT_PUBLIC_ vars come from Project settings → General → Your apps in
 * the Firebase Console.  They are safe to ship to the browser.
 *
 * If the env vars are missing the module exports null and the login page shows
 * an error banner instead of crashing the whole app.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

/** True when all three NEXT_PUBLIC_FIREBASE_* vars are present. */
export const firebaseConfigured = Boolean(apiKey && authDomain && projectId);

let _auth: Auth | null = null;

if (firebaseConfigured) {
  // Next.js hot-reload creates multiple module evaluations — guard with getApps().
  let app: FirebaseApp;
  if (getApps().length === 0) {
    app = initializeApp({ apiKey, authDomain, projectId });
  } else {
    app = getApps()[0]!;
  }
  _auth = getAuth(app);
} else {
  console.warn(
    "[firebase-client] NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID are not set.\n" +
    "Phone sign-in will not work until you add them to .env and restart the dev server.",
  );
}

export const firebaseAuth: Auth = _auth as Auth;
