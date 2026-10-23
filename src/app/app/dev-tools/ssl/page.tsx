import DevToolShell from "@/components/app/DevToolShell";
export default function SslToolPage() {
  return <DevToolShell tool="ssl" title="SSL Monitor" targetLabel="Domain"
    targetPlaceholder="example.com"
    blurb="Check the certificate on this domain — issuer, dates, and days left." />;
}
