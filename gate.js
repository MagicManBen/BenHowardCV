/* Password gate – hides page content until the correct password is entered.
   Include this script BEFORE any other scripts on protected pages.
   The page body must contain an element with id="gate-screen". */
(function () {
  var HASH = "fefad194ead6268f01e6e455c552acfa5a5351b803882f8f43af8f79c6a38604";
  var STORAGE_KEY = "gate-token";

  // If already authenticated this session, skip
  if (sessionStorage.getItem(STORAGE_KEY) === HASH) {
    show();
    return;
  }

  // Build gate UI
  var gate = document.getElementById("gate-screen");
  if (!gate) return;
  gate.removeAttribute("hidden");
  hideContent();

  gate.querySelector(".gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = gate.querySelector(".gate-input").value;
    sha256(pw).then(function (h) {
      if (h === HASH) {
        sessionStorage.setItem(STORAGE_KEY, HASH);
        gate.setAttribute("hidden", "");
        show();
      } else {
        gate.querySelector(".gate-error").removeAttribute("hidden");
        gate.querySelector(".gate-input").value = "";
        gate.querySelector(".gate-input").focus();
      }
    });
  });

  function hideContent() {
    var els = document.body.children;
    for (var i = 0; i < els.length; i++) {
      if (els[i].id !== "gate-screen") els[i].style.display = "none";
    }
  }

  function show() {
    var els = document.body.children;
    for (var i = 0; i < els.length; i++) {
      if (els[i].id !== "gate-screen") els[i].style.display = "";
    }
    var g = document.getElementById("gate-screen");
    if (g) g.setAttribute("hidden", "");
  }

  function sha256(str) {
    var buf = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", buf).then(function (hash) {
      return Array.from(new Uint8Array(hash))
        .map(function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }
})();
