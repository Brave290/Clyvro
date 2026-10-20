import DevToolShell from "@/components/app/DevToolShell";
export default function RobotsToolPage() {
  return <DevToolShell tool="robots" title="Robots & Sitemap Tester" targetLabel="Website"
    targetPlaceholder="https://example.com" showTestPath
    blurb="The two files that decide whether search engines may see you. We fetch robots.txt and sitemap.xml, then answer the only question that matters: is this path crawlable right now?" />;
}
