/* Clyvro Shield widget — branded check, not a puzzle captcha.
   <script src="https://clyvro.vercel.app/shield.js" data-sitekey="clys_…"></script>
*/
(function () {
  var script = document.currentScript;
  if (!script) return;
  var siteKey = script.getAttribute("data-sitekey") || "";
  var base = script.src.replace(/\/shield\.js(?:\?.*)?$/, "");
  var path = location.pathname || "/";
  var search = location.search || "";

  function post(body) {
    return fetch(base + "/api/v1/guard/widget", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function hide() {
    var el = document.getElementById("clyvro-shield");
    if (el) el.remove();
  }

  function showModal(token) {
    if (document.getElementById("clyvro-shield")) return;
    var wrap = document.createElement("div");
    wrap.id = "clyvro-shield";
    wrap.setAttribute("role", "dialog");
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(15,23,42,.55)";
    wrap.innerHTML =
      '<div style="width:100%;max-width:420px;background:#fff;color:#111827;border-radius:24px;padding:24px;font-family:ui-sans-serif,system-ui,sans-serif">' +
      '<p style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#2563eb;margin:0">Clyvro Shield</p>' +
      '<h2 style="margin:8px 0 0;font-size:22px">Quick check</h2>' +
      '<p style="margin:10px 0 0;font-size:14px;line-height:1.5;color:#475569">This site uses Clyvro. Confirm you are a person to continue — no puzzles.</p>' +
      '<button type="button" id="clyvro-shield-go" style="margin-top:18px;width:100%;min-height:46px;border:0;border-radius:12px;background:#2563eb;color:#fff;font-weight:650;font-size:14px">Continue</button>' +
      "</div>";
    document.body.appendChild(wrap);
    wrap.querySelector("#clyvro-shield-go").addEventListener("click", function () {
      post({ siteKey: siteKey, token: token, path: path, search: search }).then(function (json) {
        if (json && (json.ok || json.action === "allow")) hide();
      });
    });
  }

  if (!siteKey) return;
  post({
    siteKey: siteKey,
    method: "GET",
    path: path,
    search: search,
    userAgent: navigator.userAgent,
  }).then(function (json) {
    if (!json) return;
    if (json.action === "block") {
      document.documentElement.innerHTML = "";
      document.write("Not found");
    } else if (json.action === "challenge" && json.challengeToken) {
      showModal(json.challengeToken);
    }
  }).catch(function () { /* fail open for the page owner */ });
})();
