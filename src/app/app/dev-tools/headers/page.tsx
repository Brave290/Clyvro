import DevToolShell from "@/components/app/DevToolShell";
export default function HeadersToolPage() {
  return <DevToolShell tool="headers" title="Headers Debugger" targetLabel="URL"
    targetPlaceholder="https://example.com"
    blurb="What did the server actually say? Final status, response time, the six security headers graded one by one, cookie flags, and every captured response header — the first thing to check when a deploy changes behaviour." />;
}
