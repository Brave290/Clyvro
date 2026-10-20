import DevToolShell from "@/components/app/DevToolShell";
export default function RedirectsToolPage() {
  return <DevToolShell tool="redirects" title="Redirect Tracer" targetLabel="URL"
    targetPlaceholder="http://example.com/old-page"
    blurb="Follow a URL hop by hop — status codes, destinations and timing at every step. Long chains cost real speed and SEO value; this shows exactly where each hop goes and where to cut it." />;
}
