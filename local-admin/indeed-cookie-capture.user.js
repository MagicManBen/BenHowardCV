// ==UserScript==
// @name         Indeed Cookie Capture → Supabase
// @namespace    https://checkloops.co.uk
// @version      1.1
// @description  Auto-captures Indeed cookies and sends to Supabase (cookies only)
// @author       Ben Howard
// @match        https://uk.indeed.com/*
// @match        https://secure.indeed.com/*
// @grant        GM_xmlhttpRequest
// @connect      jntpyqguonknixyksqbp.supabase.co
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var SAVE_COOKIES_URL = "https://jntpyqguonknixyksqbp.supabase.co/functions/v1/save-cookies";
  var CHECK_INTERVAL = 5000;
  var LAST_SAVE_KEY = "bh_indeed_cookie_last_save";

  function showNotification(msg, color) {
    var bg = color || "#155724";
    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;top:10px;right:10px;z-index:999999;background:" + bg + ";" +
      "color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;" +
      "font-family:system-ui;box-shadow:0 2px 8px rgba(0,0,0,0.3);" +
      "transition:opacity 0.3s;";
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 400);
    }, 4000);
  }

  function isLoggedIn() {
    return document.cookie.length > 20;
  }

  function shouldSaveCookies() {
    var last = localStorage.getItem(LAST_SAVE_KEY);
    if (!last) return true;
    return Date.now() - parseInt(last, 10) > 600000; // 10 min
  }

  function saveCookies() {
    var cookies = document.cookie;
    if (!cookies) return;

    GM_xmlhttpRequest({
      method: "POST",
      url: SAVE_COOKIES_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ source: "indeed", cookies: cookies }),
      onload: function (response) {
        try {
          var data = JSON.parse(response.responseText);
          if (data.ok) {
            localStorage.setItem(LAST_SAVE_KEY, String(Date.now()));
            showNotification("✓ Cookies saved to Supabase", "#155724");
            console.log("[BH] Cookies saved");
          }
        } catch (e) {
          console.error("[BH] Cookie save parse error:", e);
        }
      },
      onerror: function (err) {
        console.error("[BH] Cookie save failed:", err);
      },
    });
  }

  // Initial save
  if (isLoggedIn() && shouldSaveCookies()) {
    saveCookies();
  }

  // Periodic check
  setInterval(function () {
    if (isLoggedIn() && shouldSaveCookies()) {
      saveCookies();
    }
  }, CHECK_INTERVAL);

})();
