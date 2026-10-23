import DevToolShell from "@/components/app/DevToolShell";
export default function DnsToolPage() {
  return <DevToolShell tool="dns" title="DNS Inspector" targetLabel="Domain"
    targetPlaceholder="example.com"
    blurb="Look up A, AAAA, CNAME, MX, nameservers, SPF, DMARC and DKIM for this domain." />;
}
