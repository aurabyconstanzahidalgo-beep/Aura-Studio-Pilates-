/* Aura · conexión con el servidor (Apps Script) o modo demo en el navegador */
(function () {
  var URL_API = (window.AURA_API || '').trim();
  var DEMO = !URL_API;

  /* ---------- SHA-256 (para el modo demo) ---------- */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var bytes = unescape(encodeURIComponent(ascii)), words = [], i, j, res = '';
    var K = [], H = [], primo = 2, isC = {};
    while (H.length < 8 || K.length < 64) {
      if (!isC[primo]) { for (i = primo * primo; i < 400; i += primo) isC[i] = 1;
        if (H.length < 8) H.push((Math.pow(primo, .5) * 4294967296) | 0);
        K.push((Math.pow(primo, 1 / 3) * 4294967296) | 0); }
      primo++;
    }
    var len = bytes.length * 8; bytes += '\x80';
    while (bytes.length % 64 - 56) bytes += '\x00';
    for (i = 0; i < bytes.length; i++) words[i >> 2] |= bytes.charCodeAt(i) << ((3 - i) % 4) * 8;
    words[words.length] = (len / 4294967296) | 0; words[words.length] = len;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = H.slice(0);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = H[0], e = H[4];
        var t1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + K[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(t1 + t2) | 0].concat(H); H[4] = (H[4] + t1) | 0; H.pop();
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (H[i] >> (j * 8)) & 255; res += (b < 16 ? '0' : '') + b.toString(16); }
    return res;
  }

  /* ---------- Hora de Chile ---------- */
  function ahoraChile() {
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
      .forEach(function (x) { p[x.type] = x.value; });
    return AuraCore.util.msDe(p.year + '-' + p.month + '-' + p.day, (p.hour === '24' ? '00' : p.hour) + ':' + p.minute);
  }

  /* ---------- Base de datos demo (guardada en este navegador) ---------- */
  var CLAVE_DEMO = 'aura_demo_v1', motorDemo = null;
  function cargarDemo() {
    var t = null;
    try { t = JSON.parse(localStorage.getItem(CLAVE_DEMO) || 'null'); } catch (e) {}
    var nueva = !t;
    if (nueva) { t = {}; Object.keys(AuraCore.TABLAS).forEach(function (k) { t[k] = []; }); }
    function guardar() { try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(t)); } catch (e) {} }
    var db = {
      rows: function (n) { return t[n].map(function (r) { return Object.assign({}, r); }); },
      insert: function (n, o) { t[n].push(Object.assign({}, o)); guardar(); },
      update: function (n, id, c) {
        var k = n === 'Config' ? 'clave' : 'id';
        var r = t[n].filter(function (x) { return String(x[k]) === String(id); })[0];
        if (r) { Object.assign(r, c); guardar(); }
      }
    };
    var n = 0;
    var env = { secreto: 'demo-aura', ahora: ahoraChile, hash: sha256, avisar: function () {},
      uid: function () { return Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 5); } };
    var motor = AuraCore.crear(db, env);
    if (nueva) sembrar(t, db, motor, guardar);
    return motor;
  }

  function dv(cuerpo) {
    var s = 0, m = 2; cuerpo = String(cuerpo);
    for (var i = cuerpo.length - 1; i >= 0; i--) { s += +cuerpo[i] * m; m = m === 7 ? 2 : m + 1; }
    var r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }

  function sembrar(t, db, motor, guardar) {
    Object.keys(AuraCore.CONFIG_INICIAL).forEach(function (k) {
      t.Config.push({ clave: k, valor: AuraCore.CONFIG_INICIAL[k] });
    });
    t.Config.forEach(function (c) {
      if (c.clave === 'transferencia') c.valor = "Nombre: Constanza Hidalgo Ramírez\nBanco: Mercado Pago\nTipo de cuenta: Vista\nN° de cuenta: 1007446024\nRUT: 16.303.811-0";
      if (c.clave === 'politicas') c.valor = "El plan contratado es mensual: las clases deben utilizarse dentro de los 30 días posteriores a la compra.\nPodrás agendar todas tus clases desde la aplicación, eligiendo el horario que más te acomode. Se reserva hasta las 21:00 del día anterior.\nEl plazo mínimo para cancelar una clase desde la aplicación es de 12 horas de anticipación. Pasado ese tiempo, la clase no podrá ser reembolsada a tu plan.\nTe recomendamos llegar 5 o 10 minutos antes de tu clase para poder prepararte.\nUna vez iniciada la clase, el tiempo de tolerancia es de 5 minutos. Transcurrido ese plazo no podrás acceder a la sesión para no interrumpirla, y la clase se contará como asistida y se descontará de tu plan.\nTe sugerimos no utilizar tu celular durante la clase, para que te puedas enfocar 100% en la sesión.\nUna vez finalizada la clase, no olvides limpiar tu reformer y los implementos utilizados.";
    });
    AuraCore.PLANES_INICIALES.forEach(function (p) {
      t.Planes.push({ id: p[0], nombre: p[1], clases: String(p[2]), dias_vigencia: String(p[3]), precio: String(p[4]), tope_semanal: String(p[5]), activo: 'si' });
    });
    t.Horario = AuraCore.horarioInicial(5);
    [['PR1', 'Calcetines antideslizantes', 'Grip en la planta, talla única', 6000, 12],
     ['PR2', 'Colet de satén', 'Rosa, lila o arena', 2500, 20],
     ['PR3', 'Botella Aura', '600 ml con logo', 8000, 6]].forEach(function (p) {
      t.Productos.push({ id: p[0], nombre: p[1], descripcion: p[2], precio: String(p[3]), stock: String(p[4]), foto: '', activo: 'si' });
    });
    var h0 = AuraCore.util.fechaDe(ahoraChile());
    t.Eventos.push({ id: 'EV1', fecha: AuraCore.util.sumarDias(h0, 10), hora: '10:00', titulo: 'Taller de respiración y core', descripcion: 'Taller de 90 minutos, cupos limitados.', lugar: 'Aura Studio', precio: '15000', cupos: '8', activo: 'si' });
    var mesA = h0.slice(0, 7);
    [['Arriendo', 'Local', 350000, 'fijo'], ['Servicios', 'Luz y agua', 45000, 'fijo'], ['Insumos', 'Desinfectante y toallas', 18000, 'variable']]
      .forEach(function (g, i) { t.Gastos.push({ id: 'G' + i, fecha: mesA + '-0' + (i + 2), categoria: g[0], detalle: g[1], monto: String(g[2]), tipo: g[3], activo: 'si' }); });
    t.Usuarios.push({ id: 'U1', nombre: 'Constanza Hidalgo', correo: 'demo@aura.cl', usuario: 'aura', rol: 'dueña', clave_hash: motor.hashClave('U1', '1234'), activo: 'si' });
    guardar();
    var gente = [
      ['Valentina Muñoz', 11111111, 'valentina@correo.cl', 'P4', '', '14-03'],
      ['Camila Rojas', 15234876, 'camila@correo.cl', 'P5', 'Lesión de rodilla derecha (2025), evitar saltos.', ''],
      ['Josefa Díaz', 17890123, 'josefa@correo.cl', 'P3', '', ''],
      ['Francisca Soto', 16543210, 'francisca@correo.cl', 'P6', '', ''],
      ['Antonia Vega', 18765432, 'antonia@correo.cl', '', 'Embarazo de 14 semanas.', ''],
      ['Daniela Pérez', 14321987, 'daniela@correo.cl', 'P1', '', '']
    ];
    var hoy = AuraCore.util.fechaDe(ahoraChile());
    var d = hoy.split('-'); gente[0][5] = d[2] + '-' + d[1]; // Valentina está de cumpleaños hoy
    var panel = motor.llamar('entrarPanel', { correo: 'aura', clave: '1234' }).token;
    var tokens = gente.map(function (g) {
      var r = motor.llamar('registro', { nombre: g[0], rut: g[1] + '-' + dv(g[1]), correo: g[2], telefono: '+569' + String(g[1]).slice(0, 8),
        pin: '1234', consentimiento_salud: true, obs_salud: g[4], fecha_nacimiento: g[5], mostrar_nombre: g[0] !== 'Francisca Soto' });
      return r.token;
    });
    var ids = motor.llamar('alumnas', {}, panel);
    gente.forEach(function (g, i) {
      if (!g[3]) return;
      var al = ids.filter(function (x) { return x.nombre === g[0]; })[0];
      motor.llamar('cargarPlan', { alumna_id: al.id, plan_id: g[3], inicio: AuraCore.util.sumarDias(hoy, -6) }, panel);
    });
    // Reservas de ejemplo en los próximos días
    var dias = motor.llamar('clases', { dias: 7 }, tokens[0]);
    var abiertas = [];
    dias.forEach(function (dd) { dd.clases.forEach(function (c) { if (c.abierta) abiertas.push(c.id); }); });
    var plan = [[0, [1, 2, 3]], [1, [0, 3, 4, 5]], [2, [1, 2]], [4, [0, 1, 2, 3, 4]], [6, [3, 5]], [8, [0, 4]]];
    plan.forEach(function (p) {
      var cid = abiertas[p[0]]; if (!cid) return;
      p[1].forEach(function (k) { try { motor.llamar('reservar', { clase_id: cid }, tokens[k]); } catch (e) {} });
    });
    // Una semana de clases pasadas con asistencia (para que los reportes tengan datos)
    var pasadas = 0;
    for (var dd = -6; dd <= -1; dd++) {
      var fp = AuraCore.util.sumarDias(hoy, dd);
      motor.clasesDelDia(fp).forEach(function (c, ci) {
        [1, 2, 3, 5].forEach(function (k, ki) {
          if ((ci + ki + dd) % 3 === 0) return;
          var al = ids.filter(function (x) { return x.nombre === gente[k][0]; })[0];
          var pa = t.PlanesAlumna.filter(function (p) { return p.alumna_id === al.id && +p.clases_usadas < +p.clases_total; })[0];
          if (!pa) return;
          pa.clases_usadas = String(+pa.clases_usadas + 1);
          t.Reservas.push({ id: 'RP' + (pasadas++), clase_id: c.id, alumna_id: al.id, estado: (ci + ki) % 7 === 0 ? 'faltó' : 'asistió',
            plan_alumna_id: pa.id, creada: fp + ' 08:00', cancelada: '' });
        });
      });
    }
    guardar();
    // Clases de hoy (para la vista de la profesora) aunque ya cerraron
    motor.clasesDelDia(hoy).forEach(function (c, i) {
      [0, 1, 2, 3].slice(0, 2 + (i % 3)).forEach(function (k) {
        var al = ids.filter(function (x) { return x.nombre === gente[(k + i) % 6][0]; })[0];
        try { motor.llamar('reservarPor', { alumna_id: al.id, clase_id: c.id }, panel); } catch (e) {}
      });
    });
  }


  /* ---------- Fotos (se guardan en el navegador para no pedirlas de nuevo) ---------- */
  var fotosMem = {};
  try { fotosMem = JSON.parse(sessionStorage.getItem('aura_fotos') || '{}'); } catch (e) {}
  function fotos(ids, token) {
    var faltan = ids.filter(function (id) { return id && !fotosMem[id]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!faltan.length) return Promise.resolve(fotosMem);
    return llamar('fotos', { ids: faltan }, token).then(function (r) {
      for (var k in r) fotosMem[k] = r[k];
      try { sessionStorage.setItem('aura_fotos', JSON.stringify(fotosMem)); } catch (e) {}
      return fotosMem;
    }).catch(function () { return fotosMem; });
  }
  function pintarFotos(raiz, token) {
    raiz = raiz || document;
    var els = raiz.querySelectorAll('[data-foto]'), ids = [];
    els.forEach(function (e) { if (e.dataset.foto) ids.push(e.dataset.foto); });
    if (!ids.length) return;
    fotos(ids, token).then(function (m) {
      els.forEach(function (e) { var d = m[e.dataset.foto]; if (d) { e.style.backgroundImage = 'url(' + d + ')'; e.classList.add('con-foto'); } });
    });
  }
  function achicarFoto(archivo, lado) {
    lado = lado || 200;
    return new Promise(function (ok, mal) {
      var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () {
        var c = document.createElement('canvas'), m = Math.min(img.width, img.height);
        c.width = c.height = lado;
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, lado, lado);
        URL.revokeObjectURL(url);
        var q = 0.85, d = c.toDataURL('image/jpeg', q);
        while (d.length > 45000 && q > 0.3) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
        if (d.length > 45000) return mal({ mensaje: 'La foto es muy pesada.' });
        ok(d);
      };
      img.onerror = function () { mal({ mensaje: 'No se pudo leer la imagen.' }); };
      img.src = url;
    });
  }

  /* ---------- Llamar ---------- */
  function llamar(accion, args, token) {
    if (DEMO) {
      return new Promise(function (ok, mal) {
        setTimeout(function () {
          try { motorDemo = motorDemo || cargarDemo(); ok(motorDemo.llamar(accion, args, token)); }
          catch (e) { mal({ codigo: e.codigo || 'error', mensaje: e.aura ? e.message : 'Error: ' + e.message }); }
        }, 120);
      });
    }
    return fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: accion, args: args || {}, token: token || '' }), redirect: 'follow' })
      .then(function (r) { return r.json(); }, function () { throw { codigo: 'red', mensaje: 'Sin conexión. Revisa tu internet e intenta de nuevo.' }; })
      .then(function (r) { if (!r.ok) throw { codigo: r.codigo, mensaje: r.error }; return r.datos; });
  }

  window.Aura = {
    demo: DEMO, llamar: llamar, fotos: fotos, pintarFotos: pintarFotos, achicarFoto: achicarFoto,
    reiniciarDemo: function () { localStorage.removeItem(CLAVE_DEMO); sessionStorage.removeItem('aura_fotos'); fotosMem = {}; motorDemo = null; },
    util: AuraCore.util
  };
})();
