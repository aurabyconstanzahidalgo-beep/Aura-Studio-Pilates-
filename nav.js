/* Aura · volver atrás con el gesto del celular (deslizar desde el borde izquierdo) y el botón atrás de Android.
   Cada página define AuraNav.mostrar(estado) para redibujar la vista del historial. */
(function () {
  var ignorar = 0;
  var Nav = window.AuraNav = {
    mostrar: function () {},
    ir: function (estado) { history.pushState(estado, ''); },
    base: function (estado) { history.replaceState(estado, ''); },
    modalAbierto: function () { history.pushState({ modal: 1, previo: history.state }, ''); },
    modalCerrado: function () { if (history.state && history.state.modal) { ignorar++; history.back(); } }
  };
  window.addEventListener('popstate', function (e) {
    if (ignorar > 0) { ignorar--; return; }
    var velo = document.getElementById('velo');
    if (velo) { velo.remove(); return; }
    Nav.mostrar(e.state || {});
  });
  // Gesto de deslizar desde el borde izquierdo (en Safari normal el gesto ya existe; aquí sirve para la app instalada)
  var instalada = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (!instalada) return;
  var x0 = null, y0 = 0;
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0]; x0 = t.clientX < 28 ? t.clientX : null; y0 = t.clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var t = e.changedTouches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
    x0 = null;
    if (dx > 70 && dy < 60) history.back();
  }, { passive: true });
})();
