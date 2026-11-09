import { connection } from "next/server";
import { googleSignInEnabled } from "@/lib/auth";
import { LoginScreen } from "./login-form";

// Read at request time, so turning Google sign-in on needs only a restart, not a new build.
export default async function LoginPage() {
  await connection();
  return <LoginScreen google={googleSignInEnabled()} />;
}
