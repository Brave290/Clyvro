import AdminEmailTest from "@/components/app/AdminEmailTest";
import { mailConfigurationStatus } from "@/lib/mail";

export const dynamic = "force-dynamic";

export default function AdminEmailPage() {
  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Email delivery</h1>
        <p className="mt-1 text-sm text-ink-mute">Check transactional SMTP readiness and send a safe test to your signed-in admin address.</p>
      </div>
      <AdminEmailTest initialStatus={mailConfigurationStatus()} />
    </div>
  );
}
