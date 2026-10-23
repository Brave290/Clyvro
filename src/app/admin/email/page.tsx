import AdminEmailTest from "@/components/app/AdminEmailTest";
import AdminEmailLog from "@/components/app/AdminEmailLog";
import { mailConfigurationStatus } from "@/lib/mail";
import { listEmailLog } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const log = await listEmailLog();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Email delivery</h1>
        <p className="mt-1 text-sm text-ink-mute">
          SMTP readiness, a safe test to your admin address, and a log of every message since this project started.
        </p>
      </div>
      <AdminEmailTest initialStatus={mailConfigurationStatus()} />
      <AdminEmailLog rows={log.rows} counts={log.counts} />
    </div>
  );
}
