import DevToolShell from "@/components/app/DevToolShell";
export default function SslToolPage() {
  return <DevToolShell tool="ssl" title="SSL Monitor" targetLabel="Domain"
    targetPlaceholder="example.com"
    blurb="Never let a certificate surprise you again. We read the live TLS certificate — issuer, validity window and an honest days-remaining countdown — so you know whether renewal is urgent or already handled by your host." />;
}
