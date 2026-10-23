import DevToolShell from "@/components/app/DevToolShell";
export default function HeadersToolPage() {
  return <DevToolShell tool="headers" title="Headers Debugger" targetLabel="URL"
    targetPlaceholder="https://example.com"
    blurb="See the status, security headers and cookies this URL sends back." />;
}
