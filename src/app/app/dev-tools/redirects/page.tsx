import DevToolShell from "@/components/app/DevToolShell";
export default function RedirectsToolPage() {
  return <DevToolShell tool="redirects" title="Redirect Tracer" targetLabel="URL"
    targetPlaceholder="http://example.com/old-page"
    blurb="Follow this URL hop by hop — status and destination at each step." />;
}
