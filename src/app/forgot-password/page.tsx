import { mailConfigured } from "@/lib/mail";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Honest config banner: reveals whether mail can send at all — never
  // whether a given account exists (that's the API's generic answer).
  return <ForgotPasswordForm mailReady={mailConfigured()} />;
}
