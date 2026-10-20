/**
 * Shared, evidence-first technology detection for the website scanner and
 * Project Readiness.
 *
 * The detector only reports what a public visitor can observe: the served
 * document type, script/style assets, HTML markers, response-header names,
 * cookie *names* (never values), the final hostname, DNS CNAME/nameserver
 * targets, and a small number of well-known platform IP ranges. Backend code
 * that leaves none of those signals cannot honestly be identified from
 * outside, so it is not guessed. Framework dependencies that are necessarily
 * part of a directly detected stack are labelled "inferred" rather than
 * presented as independently observed.
 */

export type TechCategory =
  | "language"
  | "runtime"
  | "framework"
  | "library"
  | "css"
  | "cms"
  | "platform"
  | "service"
  | "build";

export type TechConfidence = "direct" | "inferred";

export interface DetectedTech {
  name: string;
  category: TechCategory;
  evidence: string;
  confidence: TechConfidence;
}

export interface TechDetectionInput {
  html?: string | null;
  headers?: Record<string, string> | null;
  /** Cookie names only. Cookie values must never be passed here. */
  cookieNames?: readonly string[] | null;
  url?: string | null;
  hostname?: string | null;
  contentType?: string | null;
  cnameTargets?: readonly string[] | null;
  nameservers?: readonly string[] | null;
  ipAddresses?: readonly string[] | null;
}

export const TECH_CATEGORY_LABELS: Record<TechCategory, string> = {
  language: "Languages",
  runtime: "Runtimes & servers",
  framework: "Frameworks",
  library: "Libraries",
  css: "CSS & UI",
  cms: "CMS & site builders",
  platform: "Hosting & platform",
  service: "Connected services",
  build: "Build tools",
};

const CATEGORY_ORDER: TechCategory[] = [
  "language", "runtime", "framework", "library", "css", "cms", "platform", "service", "build",
];

const cleanEvidence = (value: string) => value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

const PLATFORM_SUFFIXES: readonly (readonly [string, string])[] = [
  ["vercel.app", "Vercel"],
  ["netlify.app", "Netlify"],
  ["pages.dev", "Cloudflare Pages"],
  ["workers.dev", "Cloudflare Workers"],
  ["github.io", "GitHub Pages"],
  ["gitlab.io", "GitLab Pages"],
  ["web.app", "Firebase Hosting"],
  ["firebaseapp.com", "Firebase Hosting"],
  ["herokuapp.com", "Heroku"],
  ["onrender.com", "Render"],
  ["up.railway.app", "Railway"],
  ["railway.app", "Railway"],
  ["fly.dev", "Fly.io"],
  ["expo.app", "Expo / EAS Hosting"],
  ["azurewebsites.net", "Microsoft Azure App Service"],
  ["azurestaticapps.net", "Microsoft Azure Static Web Apps"],
  ["cloudapp.azure.com", "Microsoft Azure App Service"],
  ["appspot.com", "Google App Engine"],
  ["run.app", "Google Cloud Run"],
  ["amplifyapp.com", "AWS Amplify"],
  ["ondigitalocean.app", "DigitalOcean App Platform"],
  ["deno.dev", "Deno Deploy"],
  ["replit.dev", "Replit"],
  ["surge.sh", "Surge"],
  ["neocities.org", "Neocities"],
  ["bitbucket.io", "Bitbucket Pages"],
  ["glitch.me", "Glitch"],
  ["koyeb.app", "Koyeb"],
  ["hf.space", "Hugging Face Spaces"],
  ["streamlit.app", "Streamlit"],
  ["gitbook.io", "GitBook"],
  ["readthedocs.io", "Read the Docs"],
  ["on.fleek.co", "Fleek"],
  ["srht.site", "SourceHut Pages"],
];

const CNAME_PLATFORM_SUFFIXES: readonly (readonly [string, string])[] = [
  ...PLATFORM_SUFFIXES,
  ["vercel-dns.com", "Vercel"],
  ["cloudfront.net", "AWS CloudFront"],
  ["fastly.net", "Fastly"],
  ["akamaized.net", "Akamai"],
  ["myshopify.com", "Shopify"],
  ["cdn.shopify.com", "Shopify"],
  ["squarespace.com", "Squarespace"],
  ["wixdns.net", "Wix"],
  ["webflow.io", "Webflow"],
  ["proxy-ssl.webflow.com", "Webflow"],
  ["ghost.io", "Ghost(Pro)"],
  ["s3.amazonaws.com", "Amazon S3"],
  ["amazonaws.com", "Amazon Web Services"],
  ["azurefd.net", "Microsoft Azure Front Door"],
  ["trafficmanager.net", "Microsoft Azure"],
  ["googlehosted.com", "Google Cloud"],
];

interface Signature {
  name: string;
  category: TechCategory;
  evidence: string;
  patterns: RegExp[];
}

const sig = (name: string, category: TechCategory, evidence: string, ...patterns: RegExp[]): Signature => ({
  name, category, evidence, patterns,
});

const SIGNATURES: Signature[] = [
  // Frameworks and application shells
  sig("Next.js", "framework", "Next.js data/assets in the served page", /__next_data__|_next\/static|\/_next\//),
  sig("Nuxt", "framework", "Nuxt data/assets in the served page", /__nuxt__|_nuxt\/static|\/_nuxt\//),
  sig("React", "library", "React runtime markers in the served page", /data-reactroot|react\.production|react-dom|react\.development|\/react(?:\.min)?\.js/),
  sig("Vue.js", "framework", "Vue runtime/scoped-style markers in the served page", /data-v-[a-f0-9]{6,}|vue\.runtime|vue\.global|\/vue(?:\.min)?\.js|__vue__/),
  sig("Angular", "framework", "Angular version/bootstrap markers in the served page", /ng-version=|angular\.json|platform-browser|\/angular(?:\.min)?\.js/),
  sig("AngularJS", "framework", "AngularJS bootstrap markers in the served page", /ng-app=|angularjs|angular\.min\.js/),
  sig("SvelteKit", "framework", "SvelteKit runtime/assets in the served page", /__sveltekit|\/_app\/immutable\//),
  sig("Svelte", "framework", "Svelte-scoped classes/runtime in the served page", /class="[^"]*svelte-[a-z0-9]+|\/svelte(?:\.min)?\.js/),
  sig("Astro", "framework", "Astro component/assets markers in the served page", /data-astro-|_astro\/|generator" content="astro/),
  sig("Remix", "framework", "Remix runtime/assets in the served page", /__remixcontext|remix-run|\/build\/_assets\//),
  sig("Gatsby", "framework", "Gatsby page-data/runtime markers in the served page", /___gatsby|gatsby-focus-wrapper|\/page-data\//),
  sig("Ember.js", "framework", "Ember runtime/view markers in the served page", /ember-view|ember\.min\.js|ember-application/),
  sig("Preact", "library", "Preact runtime asset in the served page", /preact(?:\.min)?\.js|preact\/dist/),
  sig("Alpine.js", "library", "Alpine directives/runtime in the served page", /\bx-data=|alpinejs|alpine(?:\.min)?\.js/),
  sig("HTMX", "library", "HTMX attributes/runtime in the served page", /\bhx-(?:get|post|put|delete|boost)=|htmx(?:\.min)?\.js/),
  sig("Lit", "library", "Lit library markers in the served page", /lit-html|@lit\/|\/lit(?:\.min)?\.js/),
  sig("Ionic", "framework", "Ionic application markers in the served page", /<ion-app|@ionic\/|ionic(?:\.min)?\.js/),
  sig("Expo", "framework", "Expo web bundle/router markers in the served page", /_expo\/static|__expo_router|expo-router|data-expo|expo-root|expo-app-loading|expo-dev-client/),
  sig("React Native Web", "framework", "React Native Web markers in the served page", /react-native-web|reactnativeweb/),
  sig("Blazor", "framework", "Blazor framework assets in the served page", /_framework\/blazor|blazor\.webassembly\.js|blazor\.server\.js/),
  sig("Laravel", "framework", "Laravel session/assets markers", /laravel_session|laravel\/|livewire\/livewire/),
  sig("Symfony", "framework", "Symfony markers in the served page", /symfony|sf-toolbar|_sf2/),
  sig("Django", "framework", "Django CSRF/session markers", /csrfmiddlewaretoken|django/),
  sig("Flask", "framework", "Flask/Werkzeug markers", /werkzeug|flask/),
  sig("FastAPI", "framework", "FastAPI/OpenAPI markers in the served page", /fastapi|openapi\.json/),
  sig("Ruby on Rails", "framework", "Rails authenticity-token/assets markers", /authenticity_token|data-turbolinks|rails-ujs|actioncable/),
  sig("NestJS", "framework", "NestJS package/assets markers in the served page", /@nestjs\/|nestjs(?:\.min)?\.js/),
  sig("Spring", "framework", "Java/Spring web markers", /j_spring_security|springframework|spring-boot/),
  sig("ASP.NET", "framework", "ASP.NET Web Forms/runtime markers", /__viewstate|__eventvalidation|asp\.net|\.aspx(?:[?#/"]|$)/),
  sig("Phoenix", "framework", "Phoenix LiveView markers in the served page", /data-phx-|phx-hook|phoenix_live_view/),

  // CMS, commerce and site builders
  sig("WordPress", "cms", "WordPress paths/generator in the served page", /wp-content\/|wp-includes\/|generator" content="wordpress/),
  sig("Drupal", "cms", "Drupal settings/assets in the served page", /drupal\.settings|sites\/default\/files|drupal\.org|generator" content="drupal/),
  sig("Joomla", "cms", "Joomla assets/generator in the served page", /joomla|com_content|generator" content="joomla/),
  sig("Ghost", "cms", "Ghost generator/assets in the served page", /generator" content="ghost|ghost\//),
  sig("Shopify", "cms", "Shopify CDN/theme globals in the served page", /cdn\.shopify\.com|shopify\./),
  sig("Wix", "cms", "Wix static assets in the served page", /static\.wixstatic\.com|wixstatic|_wixcss/),
  sig("Squarespace", "cms", "Squarespace assets in the served page", /squarespace\.com|static1\.squarespace|squarespace-/),
  sig("Webflow", "cms", "Webflow attributes/assets in the served page", /data-wf-|webflow\./),
  sig("Framer", "cms", "Framer site markers in the served page", /data-framer-|framerusercontent|framer\.com/),
  sig("Magento / Adobe Commerce", "cms", "Magento runtime/assets in the served page", /mage\/|magento|static\/version\d+\/frontend/),
  sig("PrestaShop", "cms", "PrestaShop assets in the served page", /prestashop|prestashop\.com/),
  sig("TYPO3", "cms", "TYPO3 assets/generator in the served page", /typo3|typo3conf/),
  sig("Craft CMS", "cms", "Craft CMS markers in the served page", /craftcms|craft\//),
  sig("Hugo", "cms", "Hugo generator marker in the served page", /generator" content="hugo/),
  sig("Jekyll", "cms", "Jekyll generator marker in the served page", /generator" content="jekyll/),
  sig("Eleventy", "cms", "Eleventy generator marker in the served page", /generator" content="eleventy/),

  // Common client libraries
  sig("jQuery", "library", "jQuery script reference in the served page", /jquery(?:-\d|\.min|\.js|\/)/),
  sig("Lodash", "library", "Lodash script reference in the served page", /lodash(?:\.min)?\.js/),
  sig("Axios", "library", "Axios script reference in the served page", /axios(?:\.min)?\.js/),
  sig("Three.js", "library", "Three.js script reference in the served page", /three(?:\.min)?\.js|three@|three\/build/),
  sig("GSAP", "library", "GSAP script reference in the served page", /gsap(?:\.min)?\.js|gsap\//),
  sig("D3.js", "library", "D3 script reference in the served page", /d3(?:\.min)?\.js|d3@/),
  sig("Chart.js", "library", "Chart.js script reference in the served page", /chart(?:\.umd|\.min)?\.js|chart\.js/),
  sig("Leaflet", "library", "Leaflet map library markers in the served page", /leaflet(?:\.min)?\.(?:js|css)|leaflet@/),
  sig("Mapbox GL", "library", "Mapbox GL markers in the served page", /mapbox-gl|api\.mapbox\.com/),
  sig("Swiper", "library", "Swiper library markers in the served page", /swiper(?:-bundle|\.min)?\.(?:js|css)|swiper-container/),
  sig("Socket.IO", "library", "Socket.IO client markers in the served page", /socket\.io(?:\.min)?\.js|socket\.io-client/),

  // CSS and UI systems
  sig("Tailwind CSS", "css", "Tailwind asset/CDN markers in the served page", /tailwindcss|tailwind\.config|cdn\.tailwindcss\.com|tailwind\.min\.css/),
  sig("Bootstrap", "css", "Bootstrap CSS/JS assets in the served page", /bootstrap(?:\.min)?\.(?:css|js)|bootstrap@/),
  sig("Bulma", "css", "Bulma CSS asset in the served page", /bulma(?:\.min)?\.css/),
  sig("Foundation", "css", "Foundation CSS/JS assets in the served page", /foundation(?:\.min)?\.(?:css|js)/),
  sig("Material UI", "css", "Material UI class/runtime markers in the served page", /mui-|@mui\/|material-ui/),
  sig("Ant Design", "css", "Ant Design class/assets markers in the served page", /ant-|antd(?:\.min)?\.(?:js|css)|@ant-design/),
  sig("Chakra UI", "css", "Chakra UI markers in the served page", /chakra-|@chakra-ui/),
  sig("Ionic UI", "css", "Ionic UI components in the served page", /<ion-|ion-/),

  // Connected services and embeds
  sig("Google Tag Manager", "service", "Google Tag Manager loader in the served page", /googletagmanager\.com\/gtm\.js/),
  sig("Google Analytics", "service", "Google Analytics loader/markers in the served page", /gtag\(|google-analytics\.com|googletagmanager\.com\/gtag/),
  sig("Meta Pixel", "service", "Meta Pixel loader in the served page", /connect\.facebook\.net|fbq\(/),
  sig("Hotjar", "service", "Hotjar loader in the served page", /static\.hotjar\.com/),
  sig("Microsoft Clarity", "service", "Microsoft Clarity loader in the served page", /clarity\.ms|microsoft clarity/),
  sig("Plausible", "service", "Plausible analytics loader in the served page", /plausible\.io\/js\//),
  sig("PostHog", "service", "PostHog loader in the served page", /posthog|app\.posthog\.com/),
  sig("Segment", "service", "Segment analytics loader in the served page", /cdn\.segment\.com\/analytics/),
  sig("Mixpanel", "service", "Mixpanel loader in the served page", /cdn\.mxpnl\.com|mixpanel/),
  sig("Intercom", "service", "Intercom loader in the served page", /widget\.intercom\.io|intercom/),
  sig("Crisp", "service", "Crisp chat loader in the served page", /client\.crisp\.chat/),
  sig("HubSpot", "service", "HubSpot loader in the served page", /js\.hs-scripts\.com|hubspot/),
  sig("Stripe", "service", "Stripe.js loader in the served page", /js\.stripe\.com|stripe\.js/),
  sig("PayPal", "service", "PayPal SDK loader in the served page", /paypal\.com\/sdk\/js/),
  sig("Flutterwave", "service", "Flutterwave checkout loader in the served page", /checkout\.flutterwave\.com|flutterwave/),
  sig("Paystack", "service", "Paystack checkout loader in the served page", /js\.paystack\.co|paystack/),
  sig("Google reCAPTCHA", "service", "reCAPTCHA loader in the served page", /google\.com\/recaptcha|grecaptcha/),
  sig("hCaptcha", "service", "hCaptcha loader in the served page", /hcaptcha\.com|h-captcha/),
  sig("Cloudflare Turnstile", "service", "Cloudflare Turnstile loader in the served page", /challenges\.cloudflare\.com\/turnstile/),
  sig("Google Fonts", "service", "Google Fonts stylesheet in the served page", /fonts\.googleapis\.com/),
  sig("Firebase", "service", "Firebase web SDK markers in the served page", /firebase-app|firebasejs|firebaseio\.com/),
  sig("Supabase", "service", "Supabase web client/API markers in the served page", /supabase(?:\.min)?\.js|supabase\.co/),
  sig("Sentry", "service", "Sentry browser SDK markers in the served page", /browser\.sentry-cdn\.com|sentry\.io/),

  // Build tooling visible in production artifacts
  sig("Vite", "build", "Vite client/build markers in the served page", /@vite\/client|vite\/dist|\/vite-[a-z0-9_-]+\.js/),
  sig("webpack", "build", "webpack runtime markers in the served page", /webpackjsonp|webpackChunk|webpack/),
  sig("Parcel", "build", "Parcel build markers in the served page", /parcel(?:-bundler)?|parcel\.js/),
];

export function mergeTechnology(...lists: readonly (readonly DetectedTech[] | null | undefined)[]): DetectedTech[] {
  const byName = new Map<string, DetectedTech>();
  for (const list of lists) {
    for (const item of list ?? []) {
      const key = item.name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || (existing.confidence === "inferred" && item.confidence === "direct")) {
        byName.set(key, { ...item, evidence: cleanEvidence(item.evidence) });
      }
    }
  }
  return [...byName.values()]
    .sort((a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
      || (a.confidence === b.confidence ? a.name.localeCompare(b.name) : a.confidence === "direct" ? -1 : 1))
    .slice(0, 80);
}

export function detectTechnology(input: TechDetectionInput): DetectedTech[] {
  const found: DetectedTech[] = [];
  const add = (name: string, category: TechCategory, evidence: string, confidence: TechConfidence = "direct") => {
    found.push({ name, category, evidence: cleanEvidence(evidence), confidence });
  };

  const html = input.html ?? "";
  const headers = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );
  const cookieNames = new Set((input.cookieNames ?? []).map((v) => v.toLowerCase()));
  const headerText = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n").toLowerCase();
  const urlText = input.url ?? "";
  let hostname = (input.hostname ?? "").toLowerCase();
  if (!hostname && urlText) {
    try { hostname = new URL(urlText).hostname.toLowerCase(); } catch { /* keep empty */ }
  }
  const subject = `${html}\n${urlText}\n${[...cookieNames].join("\n")}`.toLowerCase();

  // Document and asset languages. This is the plain-static-site case that
  // must never come back empty: an HTML response is itself a detection.
  const contentType = (input.contentType ?? headers["content-type"] ?? "").toLowerCase();
  const isHtml = /text\/html|application\/xhtml\+xml/.test(contentType)
    || /<!doctype\s+html|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|<(?:title|main|section|article|div)(?:\s|>)/i.test(html);
  if (isHtml) add("HTML", "language", contentType ? `HTML document served as ${contentType.split(";")[0]}` : "HTML markup in the served response");
  if (/text\/css/.test(contentType) || /<link[^>]+rel=["']?stylesheet|<style(?:\s|>)|\.css(?:[?#"]|$)/i.test(subject)) {
    add("CSS", "language", "Stylesheet/style markers in the served page");
  }
  if (/<script(?:\s|>)|\.(?:m?js)(?:[?#"]|$)/i.test(subject)) {
    add("JavaScript", "language", "JavaScript script/asset references in the served page");
  }
  if (/\.(?:tsx|mts|cts)(?:[?#"]|$)|<script[^>]+src=["'][^"']+\.ts(?:[?#"])|lang=["']ts["']/i.test(subject)) {
    add("TypeScript", "language", "TypeScript source/asset references in the served page", "inferred");
  }
  if (/\.wasm(?:[?#"]|$)|webassembly/i.test(subject)) add("WebAssembly", "language", "WebAssembly asset references in the served page");
  if (/\.php(?:[?#/"]|$)|php_session|phpsessid/i.test(subject) || cookieNames.has("phpsessid")) add("PHP", "language", "PHP page/session markers");
  if (/\.py(?:[?#/"]|$)/i.test(subject)) add("Python", "language", "Python page/asset references in the served page");
  if (/\.rb(?:[?#/"]|$)/i.test(subject)) add("Ruby", "language", "Ruby page/asset references in the served page");
  if (/\.(?:jsp|java)(?:[?#/"]|$)/i.test(subject) || cookieNames.has("jsessionid")) add("Java", "language", "Java web page/session markers");
  if (/\.(?:aspx|asp|ashx|asmx)(?:[?#/"]|$)/i.test(subject) || cookieNames.has("asp.net_sessionid")) add(".NET", "runtime", "ASP.NET page/session markers");
  if (/\.go(?:[?#/"]|$)/i.test(subject)) add("Go", "language", "Go source/asset references in the served page");
  if (/\.rs(?:[?#/"]|$)/i.test(subject)) add("Rust", "language", "Rust source/asset references in the served page", "inferred");

  // Response headers and cookie names (names only; values stay out of reports).
  const powered = headers["x-powered-by"] ?? "";
  const poweredLower = powered.toLowerCase();
  if (powered) {
    if (/php/.test(poweredLower)) add("PHP", "language", "X-Powered-By response header identifies PHP");
    if (/asp\.net/.test(poweredLower)) {
      add("ASP.NET", "framework", "X-Powered-By response header identifies ASP.NET");
      add(".NET", "runtime", "ASP.NET response header", "inferred");
    }
    if (/express/.test(poweredLower)) add("Express", "framework", "X-Powered-By response header identifies Express");
    if (/next\.js/.test(poweredLower)) add("Next.js", "framework", "X-Powered-By response header identifies Next.js");
    if (/python/.test(poweredLower)) add("Python", "language", "X-Powered-By response header identifies Python");
    if (/django/.test(poweredLower)) add("Django", "framework", "X-Powered-By response header identifies Django");
    if (/ruby|rails/.test(poweredLower)) add("Ruby on Rails", "framework", "X-Powered-By response header identifies Ruby/Rails");
    if (/java/.test(poweredLower)) add("Java", "language", "X-Powered-By response header identifies Java");
    if (/node/.test(poweredLower)) add("Node.js", "runtime", "X-Powered-By response header identifies Node.js");
    if (!found.length || !/php|asp\.net|express|next\.js|python|django|ruby|rails|java|node/.test(poweredLower)) {
      const token = powered.split(/[,;]/)[0]?.trim();
      if (token && token.length <= 60) add(token, "runtime", "X-Powered-By response header");
    }
  }

  const server = (headers.server ?? "").toLowerCase();
  if (server.includes("nginx")) add("nginx", "runtime", "Server response header identifies nginx");
  if (server.includes("apache")) add("Apache HTTP Server", "runtime", "Server response header identifies Apache");
  if (server.includes("microsoft-iis") || server.includes("iis")) {
    add("Microsoft IIS", "runtime", "Server response header identifies Microsoft IIS");
    add("ASP.NET", "framework", "Microsoft IIS server header", "inferred");
  }
  if (server.includes("litespeed")) add("LiteSpeed", "runtime", "Server response header identifies LiteSpeed");
  if (server.includes("gunicorn")) add("Gunicorn", "runtime", "Server response header identifies Gunicorn");
  if (server.includes("werkzeug")) add("Werkzeug", "runtime", "Server response header identifies Werkzeug");
  if (server.includes("cloudflare")) add("Cloudflare", "platform", "Server response header identifies Cloudflare");
  if (server.includes("amazons3")) add("Amazon S3", "platform", "Server response header identifies Amazon S3");
  if (server.includes("railway")) add("Railway", "platform", "Server response header identifies Railway");
  if (server.includes("fly.io")) add("Fly.io", "platform", "Server response header identifies Fly.io");

  if (cookieNames.has("phpsessid")) add("PHP", "language", "PHPSESSID cookie name in the response");
  if (cookieNames.has("jsessionid")) add("Java", "language", "JSESSIONID cookie name in the response");
  if (cookieNames.has("asp.net_sessionid")) {
    add("ASP.NET", "framework", "ASP.NET session cookie name in the response");
    add(".NET", "runtime", "ASP.NET session cookie name in the response", "inferred");
  }
  if (cookieNames.has("csrftoken") || cookieNames.has("sessionid")) add("Django", "framework", "Django CSRF/session cookie names in the response");
  if (cookieNames.has("laravel_session")) add("Laravel", "framework", "Laravel session cookie name in the response");
  if (cookieNames.has("connect.sid")) {
    add("Express", "framework", "connect.sid cookie name (commonly Express/Node)", "inferred");
    add("Node.js", "runtime", "connect.sid cookie name (commonly Express/Node)", "inferred");
  }
  if ([...cookieNames].some((n) => n.startsWith("wordpress_logged_in"))) add("WordPress", "cms", "WordPress login cookie name in the response");

  // HTML/framework/library signatures.
  for (const signature of SIGNATURES) {
    if (signature.patterns.some((pattern) => pattern.test(subject))) {
      add(signature.name, signature.category, signature.evidence);
    }
  }

  // Generator metadata can name a stack even when asset paths are generic.
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();
  if (generator) {
    const g = generator.toLowerCase();
    if (g.includes("wordpress")) add("WordPress", "cms", "Generator meta tag identifies WordPress");
    else if (g.includes("hugo")) add("Hugo", "cms", "Generator meta tag identifies Hugo");
    else if (g.includes("jekyll")) add("Jekyll", "cms", "Generator meta tag identifies Jekyll");
    else if (g.includes("ghost")) add("Ghost", "cms", "Generator meta tag identifies Ghost");
    else if (g.includes("drupal")) add("Drupal", "cms", "Generator meta tag identifies Drupal");
    else if (g.includes("astro")) add("Astro", "framework", "Generator meta tag identifies Astro");
  }

  // Platform/domain signals. A platform subdomain is direct evidence; a
  // custom domain CNAME to a platform is equally observable in DNS.
  for (const [suffix, name] of PLATFORM_SUFFIXES) {
    if (hostname && hostMatches(hostname, suffix)) {
      add(name, "platform", `Site is served from the ${suffix} platform domain`);
      break;
    }
  }
  for (const target of input.cnameTargets ?? []) {
    const cname = target.toLowerCase().replace(/\.$/, "");
    for (const [suffix, name] of CNAME_PLATFORM_SUFFIXES) {
      if (hostMatches(cname, suffix)) {
        add(name, "platform", `DNS CNAME points to ${cname}`);
        break;
      }
    }
  }
  if ((input.nameservers ?? []).some((ns) => ns.toLowerCase().includes("cloudflare"))) {
    add("Cloudflare DNS", "platform", "Nameservers are operated by Cloudflare");
  }
  for (const ip of input.ipAddresses ?? []) {
    if (ip.startsWith("76.76.21.") || ip.startsWith("76.76.16.")) add("Vercel", "platform", "A-record IP is in a Vercel range", "inferred");
    if (ip.startsWith("75.2.") || ip.startsWith("99.83.")) add("Netlify", "platform", "A-record IP is in a Netlify range", "inferred");
  }

  // Header-based platform/CDN signals.
  if (headers["cf-ray"]) add("Cloudflare", "platform", "cf-ray response header");
  if (headers["x-vercel-id"]) add("Vercel", "platform", "x-vercel-id response header");
  if (headers["x-nf-request-id"] || headers["x-netlify-id"]) add("Netlify", "platform", "Netlify response header");
  if (Object.keys(headers).some((k) => k.startsWith("x-railway-"))) add("Railway", "platform", "Railway response header");
  if (headers["x-fly-request-id"] || Object.keys(headers).some((k) => k.startsWith("x-fly-"))) add("Fly.io", "platform", "Fly.io response header");
  if (headers["x-azure-ref"]) add("Microsoft Azure", "platform", "Azure response header");
  if (headers["x-amz-cf-id"] || /cloudfront/i.test(headerText)) add("AWS CloudFront", "platform", "CloudFront response headers");
  if (headers["x-amz-apigw-id"]) add("Amazon API Gateway", "platform", "API Gateway response header");
  if (headers["x-served-by"] && /fastly|varnish/i.test(headers["x-served-by"])) add("Fastly", "platform", "Fastly/Varnish response header", "inferred");
  if (headers["x-cache"] && /cloudfront/i.test(headers["x-cache"])) add("AWS CloudFront", "platform", "CloudFront cache response header");

  // Necessary dependencies of directly detected stacks. These are useful
  // context, but are intentionally labelled inferred rather than observed.
  const names = new Set(found.map((f) => f.name));
  const imply = (when: string[], name: string, category: TechCategory, evidence: string) => {
    if (when.some((n) => names.has(n))) add(name, category, evidence, "inferred");
  };
  imply(["Next.js", "Remix", "Gatsby"], "React", "library", "The detected React framework renders with React");
  imply(["Nuxt"], "Vue.js", "framework", "Nuxt is built on Vue");
  imply(["SvelteKit"], "Svelte", "framework", "SvelteKit is built on Svelte");
  imply(["Expo"], "React Native", "framework", "Expo applications are built with React Native");
  imply(["Expo", "React Native Web"], "React", "library", "The detected React Native stack renders with React");
  imply(["WordPress", "Drupal", "Joomla", "Laravel", "Symfony"], "PHP", "language", "The detected platform/framework runs on PHP");
  imply(["Django", "Flask", "FastAPI"], "Python", "language", "The detected framework runs on Python");
  imply(["Ruby on Rails"], "Ruby", "language", "Ruby on Rails runs on Ruby");
  imply(["Phoenix"], "Elixir", "language", "Phoenix runs on Elixir");
  imply(["Spring"], "Java", "language", "Spring runs on Java");
  imply(["ASP.NET", "Blazor"], ".NET", "runtime", "The detected Microsoft web stack runs on .NET");
  imply(["Blazor"], "C#", "language", "Blazor applications are normally written in C#");
  imply(["Express", "NestJS"], "Node.js", "runtime", "The detected server framework runs on Node.js");
  imply(["Gunicorn", "Werkzeug"], "Python", "language", "The detected Python web server serves Python applications");

  return mergeTechnology(found);
}
