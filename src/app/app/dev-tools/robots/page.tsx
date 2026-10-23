import DevToolShell from "@/components/app/DevToolShell";
export default function RobotsToolPage() {
  return <DevToolShell tool="robots" title="Robots & Sitemap Tester" targetLabel="Website"
    targetPlaceholder="https://example.com" showTestPath
    blurb="Check robots.txt and sitemap.xml, and whether a path is allowed." />;
}
