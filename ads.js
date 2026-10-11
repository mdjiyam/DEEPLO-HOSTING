/* ==========================================================================
   DEEPLO ADS  —  এই একটা ফাইলেই আপনার সব বিজ্ঞাপন (ads) ম্যানেজ হবে।
   শুধু নিচের CONFIG অংশ এডিট করুন। বাকি কোড ছোঁয়ার দরকার নেই।
   প্রতিটি অ্যাডে  enabled:true  করলে তবেই সেটা দেখাবে।
   ========================================================================== */
const DEEPLO_ADS_CONFIG = {
  enabled: true,              // false করলে সব অ্যাড একসাথে বন্ধ
  requireConsent: false,      // true = ভিজিটর "Accept" চাপলে তবেই অ্যাড লোড হবে (কুকি নোটিশ)
  hideOnPages: ["admin.html", "editor.html", "upgrade.html", "analytics.html"], // এই পেজগুলোতে কখনো অ্যাড নয়
  adsenseClient: "",          // Google AdSense: "ca-pub-XXXXXXXXXXXXXXXX"

  /* ---- স্লট (পেজে যেখানে বসবে): "top", "sidebar", "bottom" ----
     প্রতিটি অ্যাডের  slot  ঠিক করে দেয় কোথায় দেখাবে।  একই স্লটে একাধিক অ্যাড থাকলে
     একটা র‍্যান্ডমভাবে (weight অনুযায়ী) বেছে নেওয়া হয়।  pages:["index.html"] দিলে শুধু ওই পেজে দেখাবে। */
  ads: [
    /* 1) GOOGLE ADSENSE (ডিসপ্লে বিজ্ঞাপন) */
    { id: "adsense-top", enabled: false, slot: "top", type: "adsense", slotId: "1234567890", format: "auto" },

    /* 2) নিজের ব্যানার / অ্যাফিলিয়েট লিংক (ছবি + লিংক) — যেকোনো নেটওয়ার্ক বা সরাসরি স্পন্সর */
    { id: "banner-1", enabled: false, slot: "top", type: "banner", weight: 1,
      image: "https://example.com/banner-728x90.png", link: "https://example.com/?ref=you",
      alt: "Sponsor", width: 728, height: 90 },

    /* 3) যেকোনো অ্যাড-নেটওয়ার্কের স্ক্রিপ্ট কোড (Adsterra, Monetag, PropellerAds, Media.net, Ezoic ইত্যাদি)
          নেটওয়ার্ক যে কোড দেয় সেটা হুবহু code এর ভেতরে বসান। এটা নিরাপদ "sandbox" ফ্রেমে চলে। */
    { id: "network-sidebar", enabled: false, slot: "sidebar", type: "script", width: 300, height: 250,
      code: `<script async src="https://NETWORK.example/ad.js"></script>` },

    /* 4) কাস্টম HTML (টেক্সট অ্যাড, নেটিভ অ্যাড, অ্যাফিলিয়েট উইজেট) — sandbox ফ্রেমে */
    { id: "native-bottom", enabled: false, slot: "bottom", type: "html", width: 320, height: 120,
      code: `<a href="https://example.com/?ref=you" target="_blank" rel="sponsored noopener">আপনার অফার এখানে</a>` },

    /* 5) পুরো পেজের স্ক্রিপ্ট (Social Bar, Popunder, Push, In-page push)
          ⚠ এগুলো পেজেই চলে (sandbox নয়), তাই শুধু নির্ভরযোগ্য নেটওয়ার্ক ব্যবহার করুন এবং
          pages দিয়ে ইউজার-লগইন নেই এমন পেজে সীমাবদ্ধ রাখুন (নিচের নিরাপত্তা নোট দেখুন)। */
    { id: "social-bar", enabled: false, slot: "global", type: "page-script",
      pages: ["legal.html", "report.html"], src: "https://NETWORK.example/socialbar.js" }
  ]
};

/* ----------------------- নিচে ইঞ্জিন — এডিট করার দরকার নেই ----------------------- */
(function () {
  "use strict";
  var C = DEEPLO_ADS_CONFIG;
  if (!C || !C.enabled) return;
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if ((C.hideOnPages || []).map(function (x) { return x.toLowerCase(); }).indexOf(page) !== -1) return;

  var okUrl = function (u) { return /^https?:\/\//i.test(String(u || "")); };
  var okImg = function (u) { return okUrl(u) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(String(u || "")); };
  var CONSENT_KEY = "deeplo_ads_consent";

  function consent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }

  function style() {
    var s = document.createElement("style");
    s.textContent = ".ad-slot:empty{display:none}.ad-wrap{margin:14px auto;text-align:center;max-width:100%;overflow:hidden}" +
      ".ad-label{display:block;font:700 9px/1 sans-serif;letter-spacing:1.5px;color:#7f9887;margin-bottom:5px}" +
      ".ad-wrap iframe,.ad-wrap img{max-width:100%;border:0}" +
      "#adConsent{position:fixed;left:12px;right:12px;bottom:12px;z-index:200;background:#0c1710;border:1px solid #294735;color:#d8e9dd;border-radius:12px;padding:12px 14px;font:12px/1.5 sans-serif;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}" +
      "#adConsent button{background:#22b861;color:#041008;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}#adConsent button.no{background:#1b3526;color:#d8e9dd}";
    document.head.appendChild(s);
  }

  function wrap(slotEl, ad) {
    var w = document.createElement("div"); w.className = "ad-wrap"; w.setAttribute("data-ad-id", ad.id || "");
    var l = document.createElement("span"); l.className = "ad-label"; l.textContent = "ADVERTISEMENT"; w.appendChild(l);
    slotEl.appendChild(w); return w;
  }

  var adsenseLoaded = false;
  function loadAdsense() {
    if (adsenseLoaded || !C.adsenseClient) return; adsenseLoaded = true;
    var s = document.createElement("script"); s.async = true; s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(C.adsenseClient);
    document.head.appendChild(s);
  }

  var render = {
    adsense: function (w, ad) {
      if (!C.adsenseClient || !ad.slotId) return false; loadAdsense();
      var ins = document.createElement("ins"); ins.className = "adsbygoogle"; ins.style.display = "block";
      ins.setAttribute("data-ad-client", C.adsenseClient); ins.setAttribute("data-ad-slot", ad.slotId);
      ins.setAttribute("data-ad-format", ad.format || "auto"); ins.setAttribute("data-full-width-responsive", "true");
      w.appendChild(ins); try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {} return true;
    },
    banner: function (w, ad) {
      if (!okUrl(ad.link) || !okImg(ad.image)) return false;
      var a = document.createElement("a"); a.href = ad.link; a.target = "_blank"; a.rel = "sponsored nofollow noopener noreferrer";
      var i = document.createElement("img"); i.src = ad.image; i.alt = ad.alt || "Advertisement"; i.loading = "lazy";
      if (ad.width) i.width = ad.width; if (ad.height) i.height = ad.height; i.style.height = "auto";
      a.appendChild(i); w.appendChild(a); return true;
    },
    // script / html run inside a sandboxed iframe WITHOUT allow-same-origin, so the ad code cannot read your login session.
    script: function (w, ad) {
      if (!ad.code) return false;
      var f = document.createElement("iframe");
      f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation");
      f.setAttribute("referrerpolicy", "no-referrer"); f.setAttribute("scrolling", "no"); f.setAttribute("loading", "lazy");
      f.width = ad.width || 300; f.height = ad.height || 250;
      f.srcdoc = "<!doctype html><html><head><meta charset=\"utf-8\"><base target=\"_blank\"></head><body style=\"margin:0;font-family:sans-serif\">" + ad.code + "</body></html>";
      w.appendChild(f); return true;
    },
    page: function (ad) {
      if (ad.src) { if (!okUrl(ad.src)) return false; var s = document.createElement("script"); s.async = true; s.src = ad.src; document.body.appendChild(s); return true; }
      if (ad.code) { var d = document.createElement("div"); d.innerHTML = ad.code; Array.prototype.forEach.call(d.querySelectorAll("script"), function (o) { var n = document.createElement("script"); for (var k = 0; k < o.attributes.length; k++) n.setAttribute(o.attributes[k].name, o.attributes[k].value); n.text = o.text; document.body.appendChild(n); }); return true; }
      return false;
    }
  };
  render.html = render.script;

  function pickWeighted(list) {
    var t = list.reduce(function (n, a) { return n + (a.weight > 0 ? a.weight : 1); }, 0), r = Math.random() * t;
    for (var i = 0; i < list.length; i++) { r -= (list[i].weight > 0 ? list[i].weight : 1); if (r <= 0) return list[i]; }
    return list[0];
  }

  function run() {
    var active = (C.ads || []).filter(function (a) {
      return a && a.enabled && (!a.pages || a.pages.map(function (x) { return x.toLowerCase(); }).indexOf(page) !== -1);
    });
    // page-wide scripts
    active.filter(function (a) { return a.type === "page-script"; }).forEach(function (a) { try { render.page(a); } catch (e) {} });
    // slot ads: one per slot
    var slots = {};
    active.filter(function (a) { return a.type !== "page-script"; }).forEach(function (a) { (slots[a.slot || "top"] = slots[a.slot || "top"] || []).push(a); });
    Object.keys(slots).forEach(function (name) {
      var el = document.querySelector('.ad-slot[data-slot="' + name + '"]'); if (!el) return;
      var ad = pickWeighted(slots[name]); var fn = render[ad.type]; if (!fn) return;
      try { var w = wrap(el, ad); if (!fn(w, ad)) el.removeChild(w); } catch (e) {}
    });
  }

  function start() {
    style();
    if (!C.requireConsent || consent() === "yes") return run();
    if (consent() === "no") return;
    var b = document.createElement("div"); b.id = "adConsent";
    b.innerHTML = "<span>এই সাইটে বিজ্ঞাপন দেখানো হয় এবং বিজ্ঞাপন নেটওয়ার্ক কুকি ব্যবহার করতে পারে। / This site shows ads and ad networks may use cookies.</span><span><button id=\"adYes\">Accept</button> <button class=\"no\" id=\"adNo\">Decline</button></span>";
    document.body.appendChild(b);
    document.getElementById("adYes").onclick = function () { try { localStorage.setItem(CONSENT_KEY, "yes"); } catch (e) {} b.remove(); run(); };
    document.getElementById("adNo").onclick = function () { try { localStorage.setItem(CONSENT_KEY, "no"); } catch (e) {} b.remove(); };
  }
  try { document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start(); } catch (e) {}
})();
