import DevToolShell from "@/components/app/DevToolShell";
export default function DnsToolPage() {
  return <DevToolShell tool="dns" title="DNS Inspector" targetLabel="Domain"
    targetPlaceholder="example.com"
    blurb="Every record that matters in one lookup: A, AAAA, CNAME, nameservers, MX, plus the email-authentication trio (SPF, DMARC, DKIM via TXT). Perfect for verifying a DNS change actually propagated before you debug your app." />;
}
