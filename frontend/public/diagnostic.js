/* Filet de sécurité AVANT l'application (ES5, aucun module) : si le navigateur ne peut pas lancer Lafia
   (navigateur trop ancien, fichier manquant, erreur au démarrage), on affiche la raison au lieu d'une page noire. */
(function () {
  var shown = false
  function show(msg) {
    if (shown) return
    var root = document.getElementById('root')
    if (!root || root.children.length > 0) return   // l'application s'affiche : on ne touche à rien
    shown = true
    var box = document.createElement('div')
    box.setAttribute('role', 'alert')
    box.style.cssText = 'font-family:system-ui,sans-serif;color:#F4F1EA;background:#0A1615;padding:24px;min-height:100vh;line-height:1.5'
    box.innerHTML = '<h1 style="font-size:22px;font-weight:500;margin:0 0 12px">Lafia n’a pas pu démarrer sur cet appareil</h1>' +
      '<p style="opacity:.75;margin:0 0 16px">Rechargez la page. Si le problème persiste, mettez à jour Chrome, ou envoyez ce message à l’équipe :</p>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:rgba(255,255,255,.06);padding:12px;border-radius:8px;font-size:12px"></pre>' +
      '<button style="margin-top:16px;padding:10px 18px;border-radius:999px;border:0;background:#F4F1EA;color:#0A1615;font-size:15px">Recharger</button>'
    box.querySelector('pre').textContent = String(msg) + '\n\n' + navigator.userAgent
    box.querySelector('button').onclick = function () { location.reload() }
    root.appendChild(box)
  }
  // Erreurs de SCRIPT uniquement (pas une image ou une police qui ne charge pas : celles-là n'empêchent pas l'application).
  window.addEventListener('error', function (e) { if (e.message) show(e.message + (e.filename ? '\n' + e.filename + ':' + e.lineno : '')) })
  window.addEventListener('unhandledrejection', function (e) { show('Promesse rejetée : ' + (e.reason && e.reason.message || e.reason)) })
  // Rien d'affiché au bout de 20 s : chargement bloqué (réseau lent, module refusé…).
  setTimeout(function () { show('L’application ne s’est pas affichée après 20 secondes (chargement bloqué ou trop lent).') }, 20000)
})()
