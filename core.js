/* =====================================================================
   AURA STUDIO PILATES · Lógica de reservas (Core)
   ---------------------------------------------------------------------
   Este archivo es el MISMO en Apps Script (Core.gs) y en la página
   (core.js, para el modo demo). No depende de Google ni del navegador:
   recibe una "db" (tablas) y un "env" (hora, hash, secreto, avisos).
   ===================================================================== */
var AuraCore = (function () {

  /* ---------- Estructura de las hojas ---------- */
  var TABLAS = {
    Config:       ['clave', 'valor'],
    Usuarios:     ['id', 'nombre', 'correo', 'rol', 'clave_hash', 'activo', 'usuario'],
    Alumnas:      ['id', 'nombre', 'rut', 'correo', 'telefono', 'pin_hash', 'fecha_nacimiento',
                   'mostrar_nombre', 'alta', 'estado', 'consentimiento_salud', 'obs_salud', 'notas',
                   'intentos', 'bloqueada_hasta', 'foto'],
    Planes:       ['id', 'nombre', 'clases', 'dias_vigencia', 'precio', 'tope_semanal', 'activo'],
    PlanesAlumna: ['id', 'alumna_id', 'plan_id', 'clases_total', 'clases_usadas', 'inicio', 'vence',
                   'estado', 'pago_id'],
    Pagos:        ['id', 'fecha', 'alumna_id', 'monto', 'medio', 'plan_alumna_id', 'registrado_por', 'nota',
                   'tipo', 'producto_id', 'cantidad'],
    Gastos:       ['id', 'fecha', 'categoria', 'detalle', 'monto', 'tipo', 'activo'],
    Productos:    ['id', 'nombre', 'descripcion', 'precio', 'stock', 'foto', 'activo'],
    Eventos:      ['id', 'fecha', 'hora', 'titulo', 'descripcion', 'lugar', 'precio', 'cupos', 'activo'],
    Fotos:        ['id', 'dueno', 'data'],
    Horario:      ['id', 'dia_semana', 'inicio', 'fin', 'tipo', 'profesora_id', 'cupos', 'activo'],
    Clases:       ['id', 'fecha', 'inicio', 'fin', 'tipo', 'profesora_id', 'cupos', 'estado', 'motivo'],
    Reservas:     ['id', 'clase_id', 'alumna_id', 'estado', 'plan_alumna_id', 'creada', 'cancelada'],
    ListaEspera:  ['id', 'clase_id', 'alumna_id', 'creada', 'estado'],
    Log:          ['fecha', 'usuario', 'accion', 'detalle']
  };

  var CONFIG_INICIAL = {
    nombre_estudio: 'Aura Studio Pilates',
    whatsapp: '56947483746',      // WhatsApp del estudio (sin + ni espacios)
    soporte: '56951954852',       // WhatsApp de soporte técnico de la app
    instagram: 'aura_bycontanzahidalgo',
    transferencia: '',            // datos para transferir
    politicas: '',                // políticas del estudio (las ven las alumnas)
    cupos_por_clase: '5',
    cierre_modo: 'dia_anterior',  // 'dia_anterior' = se reserva hasta cierre_hora del día anterior · 'horas' = horas_cierre_reserva antes
    cierre_hora: '21:00',
    horas_cierre_reserva: '12',
    horas_cancelacion: '12',      // cancelar sin costo hasta X horas antes
    dias_adelanto: '14',          // cuántos días hacia adelante se ve el horario
    permitir_sin_saldo: 'si',     // 'si' = reserva y queda debiendo / 'no' = se bloquea
    regalo_cumple: ''
  };

  var PLANES_INICIALES = [
    ['P1', 'Aura Clase de prueba', 1, 7, 10000, 0],
    ['P2', 'Aura 1 clase', 1, 0, 13000, 0],
    ['P3', 'Aura Esencial', 4, 30, 48000, 0],
    ['P4', 'Aura Equilibrio', 8, 30, 85000, 0],
    ['P5', 'Aura Vitalidad', 12, 30, 118000, 0],
    ['P6', 'Aura Plenitud', 16, 30, 140000, 0],
    ['P7', 'Aura Constancia', 20, 30, 160000, 0]
  ];

  function horarioInicial(cupos) {
    var filas = [], n = 1;
    var semana = ['08:10', '09:10', '10:10', '11:10', '17:10', '19:10'];
    var sabado = ['09:10', '10:10', '11:10'];
    for (var d = 1; d <= 5; d++) semana.forEach(function (h) {
      filas.push({ id: 'H' + (n++), dia_semana: String(d), inicio: h, fin: sumarMin(h, 50),
        tipo: 'Reformer full body', profesora_id: 'U1', cupos: String(cupos), activo: 'si' });
    });
    sabado.forEach(function (h) {
      filas.push({ id: 'H' + (n++), dia_semana: '6', inicio: h, fin: sumarMin(h, 50),
        tipo: 'Reformer full body', profesora_id: 'U1', cupos: String(cupos), activo: 'si' });
    });
    return filas;
  }

  /* ---------- Fechas (todo en hora de Chile, como "hora local ingenua") ---------- */
  var MIN = 60000, HORA = 3600000, DIA = 86400000;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function msDe(fecha, hora) {
    var f = String(fecha).split('-'), h = String(hora || '00:00').split(':');
    return Date.UTC(+f[0], +f[1] - 1, +f[2], +h[0], +h[1]);
  }
  function fechaDe(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function horaDe(ms) { var d = new Date(ms); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function sellos(ms) { return fechaDe(ms) + ' ' + horaDe(ms); }
  function sumarDias(fecha, n) { return fechaDe(msDe(fecha) + n * DIA); }
  function sumarMin(h, m) { return horaDe(msDe('2000-01-01', h) + m * MIN); }
  function diaSemana(fecha) { var d = new Date(msDe(fecha)).getUTCDay(); return d === 0 ? 7 : d; } // 1=lun..7=dom
  function lunesDe(fecha) { return sumarDias(fecha, 1 - diaSemana(fecha)); }

  /* ---------- Utilidades ---------- */
  function err(codigo, mensaje) { var e = new Error(mensaje); e.codigo = codigo; e.aura = true; return e; }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function limpiarRut(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function formatoRut(r) {
    r = limpiarRut(r); if (r.length < 2) return r;
    return r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + r.slice(-1);
  }
  function rutValido(r) {
    r = limpiarRut(r); if (r.length < 2) return false;
    var cuerpo = r.slice(0, -1), dv = r.slice(-1), s = 0, m = 2;
    for (var i = cuerpo.length - 1; i >= 0; i--) { s += +cuerpo[i] * m; m = m === 7 ? 2 : m + 1; }
    var esperado = 11 - (s % 11);
    esperado = esperado === 11 ? '0' : esperado === 10 ? 'K' : String(esperado);
    return esperado === dv;
  }
  function nombreCorto(a) {
    var p = String(a.nombre || '').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[1].charAt(0).toUpperCase() + '.' : p[0];
  }

  /* =====================================================================
     Motor: recibe db y env
     db.rows(tabla) -> [obj]   db.insert(tabla, obj)   db.update(tabla, id, cambios)
     env.ahora() -> ms (hora de Chile)   env.hash(texto) -> hex   env.secreto
     env.uid() -> texto único   env.avisar(correo, asunto, texto) (opcional)
     ===================================================================== */
  function crear(db, env) {

    var cfgCache = null;
    function cfg(k) {
      if (!cfgCache) {
        cfgCache = {};
        for (var key in CONFIG_INICIAL) cfgCache[key] = CONFIG_INICIAL[key];
        db.rows('Config').forEach(function (r) { if (r.clave) cfgCache[r.clave] = String(r.valor); });
      }
      return cfgCache[k];
    }
    function ahora() { return env.ahora(); }
    function hoy() { return fechaDe(ahora()); }
    function nuevoId(p) { return p + env.uid(); }
    function log(usuario, accion, detalle) {
      try { db.insert('Log', { fecha: sellos(ahora()), usuario: usuario, accion: accion, detalle: detalle || '' }); } catch (e) {}
    }
    function porId(tabla, id) {
      var r = db.rows(tabla).filter(function (x) { return String(x.id) === String(id); });
      return r[0] || null;
    }
    function hashPin(id, pin) { return env.hash(env.secreto + '|pin|' + id + '|' + pin); }
    function hashClave(id, clave) { return env.hash(env.secreto + '|clave|' + id + '|' + clave); }

    /* ---------- Sesiones ---------- */
    function firmar(rol, id) {
      var exp = ahora() + (rol === 'alumna' ? 90 : 14) * DIA;
      var carga = rol + '.' + id + '.' + exp;
      return carga + '.' + env.hash(env.secreto + '|tk|' + carga).slice(0, 32);
    }
    function sesion(token) {
      var p = String(token || '').split('.');
      if (p.length !== 4) throw err('sesion', 'Tu sesión expiró. Vuelve a entrar.');
      var carga = p[0] + '.' + p[1] + '.' + p[2];
      if (env.hash(env.secreto + '|tk|' + carga).slice(0, 32) !== p[3] || num(p[2]) < ahora())
        throw err('sesion', 'Tu sesión expiró. Vuelve a entrar.');
      return { rol: p[0], id: p[1] };
    }

    /* ---------- Clases (generadas desde el Horario + excepciones) ---------- */
    function clasesDelDia(fecha) {
      var dow = String(diaSemana(fecha)), lista = {};
      db.rows('Horario').forEach(function (h) {
        if (String(h.activo) === 'no' || String(h.dia_semana) !== dow) return;
        var id = fecha + 'T' + h.inicio;
        lista[id] = { id: id, fecha: fecha, inicio: h.inicio, fin: h.fin, tipo: h.tipo,
          profesora_id: h.profesora_id, cupos: num(h.cupos) || num(cfg('cupos_por_clase')), estado: 'normal', motivo: '' };
      });
      db.rows('Clases').forEach(function (c) {
        if (String(c.fecha) !== fecha) return;
        var id = c.id || (fecha + 'T' + c.inicio);
        var base = lista[id] || { id: id, fecha: fecha, inicio: c.inicio, fin: c.fin || sumarMin(c.inicio, 50),
          tipo: c.tipo || 'Clase especial', profesora_id: c.profesora_id || 'U1', cupos: num(cfg('cupos_por_clase')), estado: 'especial' };
        if (c.cupos !== '' && c.cupos !== undefined && c.cupos !== null) base.cupos = num(c.cupos) || base.cupos;
        if (c.estado) base.estado = c.estado;
        base.motivo = c.motivo || '';
        if (c.tipo) base.tipo = c.tipo;
        lista[id] = base;
      });
      return Object.keys(lista).map(function (k) { return lista[k]; })
        .sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
    }
    function clase(id) {
      var fecha = String(id).split('T')[0];
      var c = clasesDelDia(fecha).filter(function (x) { return x.id === id; })[0];
      if (!c) throw err('clase', 'Esa clase no existe.');
      return c;
    }
    var OCUPA = { 'reservada': 1, 'asistió': 1, 'faltó': 1 };
    function reservasDe(claseId) {
      return db.rows('Reservas').filter(function (r) { return r.clase_id === claseId; });
    }
    function ocupados(claseId) { return reservasDe(claseId).filter(function (r) { return OCUPA[r.estado]; }).length; }
    function inicioMs(c) { return msDe(c.fecha, c.inicio); }
    function limiteReserva(c) {
      if (cfg('cierre_modo') === 'dia_anterior') return msDe(sumarDias(c.fecha, -1), cfg('cierre_hora') || '21:00');
      return inicioMs(c) - num(cfg('horas_cierre_reserva')) * HORA;
    }
    function textoCierre() {
      return cfg('cierre_modo') === 'dia_anterior' ? 'hasta las ' + (cfg('cierre_hora') || '21:00') + ' del día anterior'
        : 'hasta ' + cfg('horas_cierre_reserva') + ' horas antes';
    }
    function reservable(c) {
      return c.estado !== 'feriado' && c.estado !== 'cancelada' && ahora() <= limiteReserva(c) && ahora() < inicioMs(c);
    }

    /* ---------- Planes y saldo ---------- */
    function planesDe(alumnaId) {
      var cat = {}; db.rows('Planes').forEach(function (p) { cat[p.id] = p; });
      return db.rows('PlanesAlumna').filter(function (pa) { return pa.alumna_id === alumnaId; })
        .map(function (pa) {
          var libres = num(pa.clases_total) - num(pa.clases_usadas);
          var vencido = pa.vence && pa.vence < hoy();
          return { id: pa.id, plan_id: pa.plan_id, nombre: (cat[pa.plan_id] || {}).nombre || pa.plan_id,
            total: num(pa.clases_total), usadas: num(pa.clases_usadas), libres: libres,
            inicio: pa.inicio, vence: pa.vence, estado: pa.estado,
            vigente: pa.estado === 'activo' && !vencido && libres > 0, vencido: !!vencido };
        });
    }
    function saldo(alumnaId) {
      return planesDe(alumnaId).filter(function (p) { return p.vigente; })
        .reduce(function (s, p) { return s + p.libres; }, 0);
    }
    function deudas(alumnaId) {
      return db.rows('Reservas').filter(function (r) {
        return r.alumna_id === alumnaId && !r.plan_alumna_id && (OCUPA[r.estado] || r.estado === 'tardía');
      }).length;
    }
    // Elige el plan que vence primero y que sirve para la fecha de la clase
    function elegirPlan(alumnaId, c) {
      var cat = {}; db.rows('Planes').forEach(function (p) { cat[p.id] = p; });
      var reservas = db.rows('Reservas');
      var lunes = lunesDe(c.fecha), domingo = sumarDias(lunes, 6);
      var candidatos = db.rows('PlanesAlumna').filter(function (pa) {
        if (pa.alumna_id !== alumnaId || pa.estado !== 'activo') return false;
        if (num(pa.clases_usadas) >= num(pa.clases_total)) return false;
        if (pa.inicio && pa.inicio > c.fecha) return false;
        if (pa.vence && pa.vence < c.fecha) return false;
        var tope = num((cat[pa.plan_id] || {}).tope_semanal);
        if (tope > 0) {
          var enSemana = reservas.filter(function (r) {
            var f = String(r.clase_id).split('T')[0];
            return r.plan_alumna_id === pa.id && (OCUPA[r.estado] || r.estado === 'tardía') && f >= lunes && f <= domingo;
          }).length;
          if (enSemana >= tope) return false;
        }
        return true;
      });
      candidatos.sort(function (a, b) { return (a.vence || '9999') < (b.vence || '9999') ? -1 : 1; });
      return candidatos[0] || null;
    }
    function usarClase(pa, delta) {
      if (!pa) return;
      var fresco = porId('PlanesAlumna', pa.id || pa);
      db.update('PlanesAlumna', fresco.id, { clases_usadas: String(Math.max(0, num(fresco.clases_usadas) + delta)) });
    }

    /* ---------- Reservar / cancelar / lista de espera ---------- */
    function reservarInterno(alumnaId, c, opciones) {
      opciones = opciones || {};
      if (c.estado === 'feriado' || c.estado === 'cancelada') throw err('cerrada', 'Esta clase fue cancelada' + (c.motivo ? ': ' + c.motivo : '.'));
      if (inicioMs(c) <= ahora()) throw err('pasada', 'Esta clase ya empezó.');
      if (!opciones.desdePanel) {
        if (!reservable(c)) throw err('cerrada', 'Las reservas para esta clase cerraron (se reserva ' + textoCierre() + ').');
        if (!opciones.serie && c.fecha > sumarDias(hoy(), num(cfg('dias_adelanto')))) throw err('lejos', 'Todavía no se abre esa fecha.');
      }
      var ya = reservasDe(c.id).filter(function (r) { return r.alumna_id === alumnaId && OCUPA[r.estado]; });
      if (ya.length) throw err('ya', 'Ya tienes esta clase reservada.');
      if (ocupados(c.id) >= c.cupos) throw err('llena', 'La clase está llena. Puedes anotarte en la lista de espera.');
      var pa = elegirPlan(alumnaId, c);
      if (!pa && opciones.serie) throw err('sin_saldo', 'Sin clases disponibles en tu plan para esa fecha.');
      if (!pa && cfg('permitir_sin_saldo') !== 'si' && !opciones.desdePanel)
        throw err('sin_saldo', 'No tienes clases disponibles. Compra o renueva tu plan.');
      if (pa) usarClase(pa, +1);
      var r = { id: nuevoId('R'), clase_id: c.id, alumna_id: alumnaId, estado: 'reservada',
        plan_alumna_id: pa ? pa.id : '', creada: sellos(ahora()), cancelada: '' };
      db.insert('Reservas', r);
      db.rows('ListaEspera').forEach(function (e) {
        if (e.clase_id === c.id && e.alumna_id === alumnaId && e.estado === 'esperando')
          db.update('ListaEspera', e.id, { estado: 'asignada' });
      });
      return r;
    }

    function asignarEspera(c) {
      var asignadas = [];
      if (!reservable(c)) return asignadas;
      var cola = db.rows('ListaEspera').filter(function (e) { return e.clase_id === c.id && e.estado === 'esperando'; })
        .sort(function (a, b) { return a.creada < b.creada ? -1 : 1; });
      for (var i = 0; i < cola.length && ocupados(c.id) < c.cupos; i++) {
        try {
          reservarInterno(cola[i].alumna_id, c);
          asignadas.push(cola[i].alumna_id);
          var a = porId('Alumnas', cola[i].alumna_id);
          log('sistema', 'espera_asignada', c.id + ' → ' + cola[i].alumna_id);
          if (a && a.correo && env.avisar) env.avisar(a.correo, '¡Se liberó tu cupo en Aura!',
            'Hola ' + String(a.nombre).split(' ')[0] + ', se liberó un cupo y quedaste reservada en la clase del ' +
            c.fecha + ' a las ' + c.inicio + '. Si no puedes ir, cancélala en la app.');
        } catch (e) {
          db.update('ListaEspera', cola[i].id, { estado: 'expiró' });
        }
      }
      return asignadas;
    }

    function cancelarReserva(r, porQuien) {
      var c = clase(r.clase_id);
      var aTiempo = ahora() <= inicioMs(c) - num(cfg('horas_cancelacion')) * HORA;
      var estado = aTiempo || porQuien === 'panel' ? 'cancelada' : 'tardía';
      db.update('Reservas', r.id, { estado: estado, cancelada: sellos(ahora()) });
      if (estado === 'cancelada' && r.plan_alumna_id) usarClase(r.plan_alumna_id, -1);
      var asignadas = asignarEspera(c);
      return { estado: estado, devuelta: estado === 'cancelada' && !!r.plan_alumna_id, asignadas: asignadas.length };
    }

    /* ---------- Vistas ---------- */
    function vistaClase(c, alumnaId) {
      var alumnas = {}; db.rows('Alumnas').forEach(function (a) { alumnas[a.id] = a; });
      var rs = reservasDe(c.id).filter(function (r) { return OCUPA[r.estado]; });
      var mia = rs.filter(function (r) { return r.alumna_id === alumnaId; })[0];
      var cola = db.rows('ListaEspera').filter(function (e) { return e.clase_id === c.id && e.estado === 'esperando'; })
        .sort(function (a, b) { return a.creada < b.creada ? -1 : 1; });
      var pos = -1; cola.forEach(function (e, i) { if (e.alumna_id === alumnaId) pos = i + 1; });
      return {
        id: c.id, fecha: c.fecha, inicio: c.inicio, fin: c.fin, tipo: c.tipo, estado: c.estado, motivo: c.motivo,
        cupos: c.cupos, ocupados: rs.length, libres: Math.max(0, c.cupos - rs.length),
        abierta: reservable(c), pasada: inicioMs(c) <= ahora(),
        cancela_sin_costo: ahora() <= inicioMs(c) - num(cfg('horas_cancelacion')) * HORA,
        mi_reserva: mia ? mia.id : null, en_espera: pos > 0 ? pos : 0,
        asistentes: rs.map(function (r) {
          var a = alumnas[r.alumna_id] || { nombre: 'Alumna' };
          if (r.alumna_id === alumnaId) return { nombre: 'Tú', foto: a.foto || '', yo: true };
          return String(a.mostrar_nombre) === 'no' ? { nombre: 'Alumna', foto: '' } : { nombre: nombreCorto(a), foto: a.foto || '' };
        })
      };
    }

    function perfil(a) {
      return { id: a.id, nombre: a.nombre, rut: a.rut, correo: a.correo, telefono: a.telefono,
        fecha_nacimiento: a.fecha_nacimiento, mostrar_nombre: String(a.mostrar_nombre) !== 'no',
        obs_salud: a.obs_salud, consentimiento_salud: a.consentimiento_salud === 'si', foto: a.foto || '' };
    }
    function cumpleHoy(a, fecha) {
      var f = String(a.fecha_nacimiento || '').split('-'); // DD-MM o DD-MM-AAAA
      if (f.length < 2) return false;
      var d = String(fecha).split('-');
      return pad(+f[0]) === d[2] && pad(+f[1]) === d[1];
    }

    function catalogo() {
      return db.rows('Planes').filter(function (p) { return p.activo !== 'no'; }).map(function (p) {
        return { id: p.id, nombre: p.nombre, clases: num(p.clases), dias: num(p.dias_vigencia), precio: num(p.precio), tope_semanal: num(p.tope_semanal) };
      });
    }


    function productos(todos) {
      return db.rows('Productos').filter(function (p) { return todos || p.activo !== 'no'; }).map(function (p) {
        return { id: p.id, nombre: p.nombre, descripcion: p.descripcion, precio: num(p.precio),
          stock: p.stock === '' ? null : num(p.stock), foto: p.foto || '', activo: p.activo !== 'no' };
      });
    }
    function eventos(todos) {
      return db.rows('Eventos').filter(function (e) { return todos || (e.activo !== 'no' && e.fecha >= hoy()); }).map(function (e) {
        return { id: e.id, fecha: e.fecha, hora: e.hora, titulo: e.titulo, descripcion: e.descripcion, lugar: e.lugar,
          precio: e.precio === '' ? null : num(e.precio), cupos: e.cupos === '' ? null : num(e.cupos), activo: e.activo !== 'no' };
      }).sort(function (a, b) { return (a.fecha + a.hora) < (b.fecha + b.hora) ? -1 : 1; });
    }
    function upsert(tabla, prefijo, datos, campos) {
      var fila = {};
      campos.forEach(function (k) { if (datos[k] !== undefined && datos[k] !== null) fila[k] = String(datos[k]); });
      if (datos.id && porId(tabla, datos.id)) { db.update(tabla, datos.id, fila); return datos.id; }
      fila.id = nuevoId(prefijo);
      TABLAS[tabla].forEach(function (k) { if (fila[k] === undefined) fila[k] = k === 'activo' ? 'si' : ''; });
      db.insert(tabla, fila); return fila.id;
    }
    function validarNuevaAlumna(a, desdePanel) {
      var nombre = String(a.nombre || '').trim().replace(/\s+/g, ' ');
      var rut = limpiarRut(a.rut), correo = String(a.correo || '').trim().toLowerCase();
      var tel = String(a.telefono || '').replace(/[^0-9+]/g, ''), pin = String(a.pin || '');
      if (nombre.split(' ').length < 2) throw err('datos', 'Escribe nombre y apellido.');
      if (rut && !rutValido(rut)) throw err('datos', 'El RUT no es válido.');
      if (!desdePanel && !rut) throw err('datos', 'El RUT no es válido.');
      if (correo && !/^\S+@\S+\.\S+$/.test(correo)) throw err('datos', 'El correo no es válido.');
      if (!desdePanel && !correo) throw err('datos', 'El correo no es válido.');
      if (!rut && !correo) throw err('datos', 'Pon el RUT o el correo para que pueda entrar.');
      if ((!desdePanel || tel) && tel.replace(/\D/g, '').length < 8) throw err('datos', 'Escribe el teléfono.');
      if (!/^\d{4}$/.test(pin)) throw err('datos', 'El PIN debe tener 4 números.');
      var existe = db.rows('Alumnas').filter(function (x) {
        return (rut && limpiarRut(x.rut) === rut) || (correo && String(x.correo).toLowerCase() === correo);
      });
      if (existe.length) throw err('existe', 'Ya hay una cuenta con ese RUT o correo.');
      var id = nuevoId('A');
      db.insert('Alumnas', { id: id, nombre: nombre, rut: rut ? formatoRut(rut) : '', correo: correo, telefono: tel,
        pin_hash: hashPin(id, pin), fecha_nacimiento: String(a.fecha_nacimiento || ''),
        mostrar_nombre: a.mostrar_nombre === false ? 'no' : 'si', alta: hoy(), estado: 'activa',
        consentimiento_salud: 'si', obs_salud: String(a.obs_salud || '').slice(0, 500), notas: String(a.notas || ''),
        intentos: '0', bloqueada_hasta: '', foto: '' });
      return { id: id, nombre: nombre };
    }
    function guardarFoto(dueno, data, anterior) {
      data = String(data || '');
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) throw err('foto', 'La imagen no es válida.');
      if (data.length > 48000) throw err('foto', 'La imagen es muy pesada.');
      if (anterior && porId('Fotos', anterior)) { db.update('Fotos', anterior, { data: data }); return anterior; }
      var id = nuevoId('F'); db.insert('Fotos', { id: id, dueno: dueno, data: data }); return id;
    }
    function mesDe(f) { return String(f).slice(0, 7); }
    function diasDelMes(mes) {
      var out = [], f = mes + '-01';
      while (mesDe(f) === mes) { out.push(f); f = sumarDias(f, 1); }
      return out;
    }
    function sumaMes(mes, n) { var p = mes.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }

    function soloPanel(s, rol) {
      if (s.rol !== 'dueña' && s.rol !== 'profesora') throw err('permiso', 'No tienes permiso para esto.');
      if (rol && s.rol !== rol) throw err('permiso', 'Solo la dueña puede hacer esto.');
      var u = porId('Usuarios', s.id);
      if (!u || u.activo === 'no') throw err('sesion', 'Tu usuario no está activo.');
      return u;
    }
    function soloAlumna(s) {
      if (s.rol !== 'alumna') throw err('permiso', 'Entra con tu cuenta de alumna.');
      var a = porId('Alumnas', s.id);
      if (!a || a.estado === 'inactiva') throw err('sesion', 'Tu cuenta no está activa. Escríbenos por WhatsApp.');
      return a;
    }

    /* =====================================================================
       Acciones (lo que llama la página)
       ===================================================================== */
    var acciones = {

      /* ----- Públicas ----- */
      publico: function () {
        return { nombre: cfg('nombre_estudio'), whatsapp: cfg('whatsapp'), transferencia: cfg('transferencia'),
          soporte: cfg('soporte'), instagram: cfg('instagram'), politicas: cfg('politicas'),
          horas_cierre: num(cfg('horas_cierre_reserva')), texto_cierre: textoCierre(), horas_cancelacion: num(cfg('horas_cancelacion')),
          dias_adelanto: num(cfg('dias_adelanto')), planes: catalogo(), productos: productos(false), eventos: eventos(false),
          hoy: hoy(), ahora: horaDe(ahora()) };
      },

      registro: function (a) {
        if (a.consentimiento_salud !== true && a.consentimiento_salud !== 'si')
          throw err('datos', 'Debes aceptar el uso de tus datos para la clase.');
        var r = validarNuevaAlumna(a, false);
        log(r.id, 'registro', r.nombre);
        return { token: firmar('alumna', r.id), nombre: r.nombre };
      },

      entrar: function (a) {
        var ident = String(a.usuario || '').trim().toLowerCase(), rut = limpiarRut(ident);
        var al = db.rows('Alumnas').filter(function (x) {
          return String(x.correo).toLowerCase() === ident || (rut.length > 6 && limpiarRut(x.rut) === rut);
        })[0];
        if (!al) throw err('login', 'No encontramos ese RUT o correo.');
        if (al.estado === 'inactiva') throw err('login', 'Tu cuenta no está activa. Escríbenos por WhatsApp.');
        if (al.bloqueada_hasta && sellos(ahora()) < al.bloqueada_hasta)
          throw err('login', 'Demasiados intentos. Prueba de nuevo a las ' + String(al.bloqueada_hasta).slice(11) + '.');
        if (hashPin(al.id, String(a.pin || '')) !== al.pin_hash) {
          var n = num(al.intentos) + 1;
          db.update('Alumnas', al.id, n >= 5 ? { intentos: '0', bloqueada_hasta: sellos(ahora() + 15 * MIN) } : { intentos: String(n) });
          throw err('login', n >= 5 ? 'PIN incorrecto. Tu cuenta queda bloqueada 15 minutos.' : 'PIN incorrecto.');
        }
        if (num(al.intentos)) db.update('Alumnas', al.id, { intentos: '0', bloqueada_hasta: '' });
        return { token: firmar('alumna', al.id), nombre: al.nombre };
      },

      entrarPanel: function (a) {
        var correo = String(a.correo || a.usuario || '').trim().toLowerCase();
        var u = db.rows('Usuarios').filter(function (x) {
          return x.activo !== 'no' && (String(x.correo).toLowerCase() === correo || (x.usuario && String(x.usuario).toLowerCase() === correo));
        })[0];
        if (!u || hashClave(u.id, String(a.clave || '')) !== u.clave_hash) throw err('login', 'Correo o clave incorrectos.');
        log(u.id, 'entrar_panel', '');
        return { token: firmar(u.rol, u.id), nombre: u.nombre, rol: u.rol };
      },

      /* ----- Alumna ----- */
      yo: function (a, s) {
        var al = soloAlumna(s);
        var cat = {}; db.rows('Planes').forEach(function (p) { cat[p.id] = p; });
        var mias = db.rows('Reservas').filter(function (r) { return r.alumna_id === al.id; });
        var proximas = [], historial = [];
        mias.forEach(function (r) {
          var f = r.clase_id.split('T');
          var item = { id: r.id, clase_id: r.clase_id, fecha: f[0], inicio: f[1], estado: r.estado, sin_plan: !r.plan_alumna_id };
          if (r.estado === 'reservada' && msDe(f[0], f[1]) > ahora()) proximas.push(item); else historial.push(item);
        });
        proximas.sort(function (x, y) { return x.clase_id < y.clase_id ? -1 : 1; });
        historial.sort(function (x, y) { return x.clase_id > y.clase_id ? -1 : 1; });
        var espera = db.rows('ListaEspera').filter(function (e) { return e.alumna_id === al.id && e.estado === 'esperando'; })
          .map(function (e) { var f = e.clase_id.split('T'); return { clase_id: e.clase_id, fecha: f[0], inicio: f[1] }; });
        return { perfil: perfil(al), saldo: saldo(al.id), deudas: deudas(al.id), planes: planesDe(al.id),
          proximas: proximas, historial: historial.slice(0, 20), espera: espera,
          cumple: cumpleHoy(al, hoy()), regalo_cumple: cfg('regalo_cumple') };
      },

      clases: function (a, s) {
        var al = soloAlumna(s);
        var desde = a.desde && a.desde >= hoy() ? a.desde : hoy();
        var dias = Math.min(num(a.dias) || 7, num(cfg('dias_adelanto')) + 1);
        var out = [];
        for (var i = 0; i < dias; i++) {
          var f = sumarDias(desde, i);
          if (f > sumarDias(hoy(), num(cfg('dias_adelanto')))) break;
          out.push({ fecha: f, clases: clasesDelDia(f).map(function (c) { return vistaClase(c, al.id); }) });
        }
        return out;
      },

      reservar: function (a, s) {
        var al = soloAlumna(s);
        var r = reservarInterno(al.id, clase(a.clase_id));
        log(al.id, 'reservar', a.clase_id);
        return { ok: true, reserva: r.id, sin_plan: !r.plan_alumna_id, saldo: saldo(al.id) };
      },

      cancelar: function (a, s) {
        var al = soloAlumna(s);
        var r = porId('Reservas', a.reserva_id);
        if (!r || r.alumna_id !== al.id || r.estado !== 'reservada') throw err('reserva', 'No encontramos esa reserva.');
        if (msDe.apply(null, r.clase_id.split('T')) <= ahora()) throw err('pasada', 'La clase ya empezó.');
        var res = cancelarReserva(r, 'alumna');
        log(al.id, 'cancelar', r.clase_id + ' ' + res.estado);
        res.saldo = saldo(al.id);
        return res;
      },

      esperar: function (a, s) {
        var al = soloAlumna(s), c = clase(a.clase_id);
        if (!reservable(c)) throw err('cerrada', 'Esta clase ya no recibe reservas.');
        if (ocupados(c.id) < c.cupos) throw err('hay_cupo', 'Hay cupo: puedes reservar directo.');
        var ya = db.rows('ListaEspera').filter(function (e) { return e.clase_id === c.id && e.alumna_id === al.id && e.estado === 'esperando'; });
        if (ya.length) throw err('ya', 'Ya estás en la lista de espera.');
        db.insert('ListaEspera', { id: nuevoId('E'), clase_id: c.id, alumna_id: al.id, creada: sellos(ahora()) + ':' + env.uid(), estado: 'esperando' });
        log(al.id, 'espera', c.id);
        return { ok: true, posicion: vistaClase(c, al.id).en_espera };
      },

      salirEspera: function (a, s) {
        var al = soloAlumna(s);
        db.rows('ListaEspera').forEach(function (e) {
          if (e.clase_id === a.clase_id && e.alumna_id === al.id && e.estado === 'esperando') db.update('ListaEspera', e.id, { estado: 'expiró' });
        });
        return { ok: true };
      },

      guardarPerfil: function (a, s) {
        var al = soloAlumna(s), cambios = {};
        if (a.mostrar_nombre !== undefined) cambios.mostrar_nombre = a.mostrar_nombre ? 'si' : 'no';
        if (a.telefono) cambios.telefono = String(a.telefono).replace(/[^0-9+]/g, '');
        if (a.obs_salud !== undefined) cambios.obs_salud = String(a.obs_salud).slice(0, 500);
        if (a.fecha_nacimiento !== undefined) cambios.fecha_nacimiento = String(a.fecha_nacimiento);
        if (a.pin_nuevo) {
          if (hashPin(al.id, String(a.pin_actual || '')) !== al.pin_hash) throw err('pin', 'El PIN actual no es correcto.');
          if (!/^\d{4}$/.test(String(a.pin_nuevo))) throw err('pin', 'El PIN nuevo debe tener 4 números.');
          cambios.pin_hash = hashPin(al.id, String(a.pin_nuevo));
        }
        db.update('Alumnas', al.id, cambios);
        return { ok: true, perfil: perfil(porId('Alumnas', al.id)) };
      },

      /* ----- Panel (profesora y dueña) ----- */
      dia: function (a, s) {
        var u = soloPanel(s), fecha = a.fecha || hoy();
        var alumnas = {}; db.rows('Alumnas').forEach(function (x) { alumnas[x.id] = x; });
        var todas = db.rows('Reservas');
        var asistio = {}; todas.forEach(function (r) { if (r.estado === 'asistió' && r.clase_id < fecha + 'T00:00') asistio[r.alumna_id] = 1; });
        var espera = db.rows('ListaEspera');
        return { fecha: fecha, rol: u.rol, clases: clasesDelDia(fecha).map(function (c) {
          var rs = todas.filter(function (r) { return r.clase_id === c.id && r.estado !== 'cancelada'; });
          return {
            id: c.id, inicio: c.inicio, fin: c.fin, tipo: c.tipo, estado: c.estado, motivo: c.motivo,
            cupos: c.cupos, ocupados: rs.filter(function (r) { return OCUPA[r.estado]; }).length,
            lista: rs.map(function (r) {
              var al = alumnas[r.alumna_id] || { nombre: '?' };
              return { reserva_id: r.id, alumna_id: r.alumna_id, nombre: al.nombre, telefono: al.telefono, foto: al.foto || '',
                estado: r.estado, saldo: saldo(r.alumna_id), sin_plan: !r.plan_alumna_id,
                primera: !asistio[r.alumna_id], salud: al.consentimiento_salud === 'si' ? (al.obs_salud || '') : '',
                cumple: cumpleHoy(al, fecha) };
            }),
            espera: espera.filter(function (e) { return e.clase_id === c.id && e.estado === 'esperando'; })
              .sort(function (x, y) { return x.creada < y.creada ? -1 : 1; })
              .map(function (e) { var al = alumnas[e.alumna_id] || {}; return { alumna_id: e.alumna_id, nombre: al.nombre, telefono: al.telefono }; })
          };
        }) };
      },

      asistencia: function (a, s) {
        var u = soloPanel(s), r = porId('Reservas', a.reserva_id);
        if (!r) throw err('reserva', 'No encontramos esa reserva.');
        if (['asistió', 'faltó', 'reservada'].indexOf(a.estado) < 0) throw err('datos', 'Estado no válido.');
        if (!OCUPA[r.estado]) throw err('datos', 'Esa reserva está cancelada.');
        db.update('Reservas', r.id, { estado: a.estado });
        log(u.id, 'asistencia', r.id + ' ' + a.estado);
        return { ok: true };
      },

      alumnas: function (a, s) {
        soloPanel(s);
        return db.rows('Alumnas').map(function (al) {
          var ps = planesDe(al.id).filter(function (p) { return p.vigente; });
          var vence = ps.map(function (p) { return p.vence; }).filter(Boolean).sort()[0] || '';
          return { id: al.id, nombre: al.nombre, rut: al.rut, telefono: al.telefono, correo: al.correo,
            estado: al.estado, saldo: saldo(al.id), deudas: deudas(al.id), vence: vence, alta: al.alta, foto: al.foto || '' };
        }).sort(function (x, y) { return x.nombre < y.nombre ? -1 : 1; });
      },

      ficha: function (a, s) {
        var u = soloPanel(s), al = porId('Alumnas', a.id);
        if (!al) throw err('alumna', 'No encontramos a esa alumna.');
        var rs = db.rows('Reservas').filter(function (r) { return r.alumna_id === al.id; })
          .sort(function (x, y) { return x.clase_id > y.clase_id ? -1 : 1; }).slice(0, 30)
          .map(function (r) { return { id: r.id, clase_id: r.clase_id, estado: r.estado, sin_plan: !r.plan_alumna_id }; });
        var out = { alumna: { id: al.id, nombre: al.nombre, rut: al.rut, correo: al.correo, telefono: al.telefono,
            fecha_nacimiento: al.fecha_nacimiento, alta: al.alta, estado: al.estado,
            obs_salud: al.consentimiento_salud === 'si' ? al.obs_salud : '', notas: al.notas, foto: al.foto || '' },
          saldo: saldo(al.id), deudas: deudas(al.id), planes: planesDe(al.id), reservas: rs, catalogo: catalogo() };
        if (u.rol === 'dueña') out.pagos = db.rows('Pagos').filter(function (p) { return p.alumna_id === al.id; });
        return out;
      },

      cargarPlan: function (a, s) {
        var u = soloPanel(s), al = porId('Alumnas', a.alumna_id), p = porId('Planes', a.plan_id);
        if (!al || !p) throw err('datos', 'Falta la alumna o el plan.');
        var inicio = a.inicio || hoy();
        var dias = num(p.dias_vigencia);
        var paId = nuevoId('PA'), pagoId = nuevoId('PG');
        db.insert('Pagos', { id: pagoId, fecha: hoy(), alumna_id: al.id, monto: String(a.monto !== undefined && a.monto !== '' ? num(a.monto) : num(p.precio)),
          medio: a.medio || 'transferencia', plan_alumna_id: paId, registrado_por: u.id, nota: String(a.nota || ''), tipo: 'plan', producto_id: '', cantidad: '1' });
        db.insert('PlanesAlumna', { id: paId, alumna_id: al.id, plan_id: p.id, clases_total: String(num(p.clases)),
          clases_usadas: '0', inicio: inicio, vence: dias > 0 ? sumarDias(inicio, dias - 1) : '', estado: 'activo', pago_id: pagoId });
        // Las clases que quedó debiendo se pagan con el plan nuevo (las más antiguas primero)
        var pagadas = 0;
        db.rows('Reservas').filter(function (r) {
          return r.alumna_id === al.id && !r.plan_alumna_id && (OCUPA[r.estado] || r.estado === 'tardía');
        }).sort(function (x, y) { return x.clase_id < y.clase_id ? -1 : 1; }).forEach(function (r) {
          var pa = porId('PlanesAlumna', paId);
          if (num(pa.clases_usadas) >= num(pa.clases_total)) return;
          db.update('Reservas', r.id, { plan_alumna_id: paId });
          usarClase(paId, +1); pagadas++;
        });
        log(u.id, 'cargar_plan', al.id + ' ' + p.nombre);
        return { ok: true, saldo: saldo(al.id), deudas_pagadas: pagadas };
      },

      editarAlumna: function (a, s) {
        var u = soloPanel(s), al = porId('Alumnas', a.id);
        if (!al) throw err('alumna', 'No encontramos a esa alumna.');
        var c = {};
        ['notas', 'obs_salud', 'telefono', 'correo', 'fecha_nacimiento'].forEach(function (k) { if (a[k] !== undefined) c[k] = String(a[k]); });
        if (a.estado === 'activa' || a.estado === 'inactiva') c.estado = a.estado;
        db.update('Alumnas', al.id, c);
        log(u.id, 'editar_alumna', al.id);
        return { ok: true };
      },

      nuevoPin: function (a, s) {
        var u = soloPanel(s, 'dueña'), al = porId('Alumnas', a.id);
        if (!al) throw err('alumna', 'No encontramos a esa alumna.');
        if (!/^\d{4}$/.test(String(a.pin))) throw err('pin', 'El PIN debe tener 4 números.');
        db.update('Alumnas', al.id, { pin_hash: hashPin(al.id, String(a.pin)), intentos: '0', bloqueada_hasta: '' });
        log(u.id, 'nuevo_pin', al.id);
        return { ok: true };
      },

      reservarPor: function (a, s) {
        var u = soloPanel(s);
        var r = reservarInterno(a.alumna_id, clase(a.clase_id), { desdePanel: true });
        log(u.id, 'reservar_por', a.alumna_id + ' ' + a.clase_id);
        return { ok: true, sin_plan: !r.plan_alumna_id };
      },

      cancelarPor: function (a, s) {
        var u = soloPanel(s), r = porId('Reservas', a.reserva_id);
        if (!r || !OCUPA[r.estado]) throw err('reserva', 'No encontramos esa reserva.');
        var res = cancelarReserva(r, a.devolver === false ? 'alumna' : 'panel');
        log(u.id, 'cancelar_por', r.id + ' ' + res.estado);
        return res;
      },

      cancelarClase: function (a, s) {
        var u = soloPanel(s), c = clase(a.clase_id);
        var motivo = String(a.motivo || 'Clase suspendida');
        var existe = db.rows('Clases').filter(function (x) { return x.id === c.id; })[0];
        if (existe) db.update('Clases', c.id, { estado: 'feriado', motivo: motivo });
        else db.insert('Clases', { id: c.id, fecha: c.fecha, inicio: c.inicio, fin: c.fin, tipo: c.tipo,
          profesora_id: c.profesora_id, cupos: '', estado: 'feriado', motivo: motivo });
        var n = 0;
        reservasDe(c.id).forEach(function (r) {
          if (r.estado !== 'reservada') return;
          db.update('Reservas', r.id, { estado: 'cancelada', cancelada: sellos(ahora()) });
          if (r.plan_alumna_id) usarClase(r.plan_alumna_id, -1);
          n++;
          var al = porId('Alumnas', r.alumna_id);
          if (al && al.correo && env.avisar) env.avisar(al.correo, 'Clase suspendida en Aura',
            'Hola ' + String(al.nombre).split(' ')[0] + ', la clase del ' + c.fecha + ' a las ' + c.inicio +
            ' se suspendió (' + motivo + '). Te devolvimos la clase a tu saldo.');
        });
        db.rows('ListaEspera').forEach(function (e) { if (e.clase_id === c.id && e.estado === 'esperando') db.update('ListaEspera', e.id, { estado: 'expiró' }); });
        log(u.id, 'cancelar_clase', c.id + ' ' + motivo);
        return { ok: true, devueltas: n };
      },

      /* ----- Horario del mes (alumna) ----- */
      serie: function (a, s) {
        var al = soloAlumna(s);
        var vig = planesDe(al.id).filter(function (p) { return p.vigente; });
        var hasta = vig.length ? (vig.map(function (p) { return p.vence; }).filter(Boolean).sort().pop() || sumarDias(hoy(), 34)) : sumarDias(hoy(), 34);
        if (hasta > sumarDias(hoy(), 62)) hasta = sumarDias(hoy(), 62);
        var resultado = [], libres = saldo(al.id);
        for (var f = hoy(); f <= hasta; f = sumarDias(f, 1)) {
          if (String(diaSemana(f)) !== String(a.dia_semana)) continue;
          var c = clasesDelDia(f).filter(function (k) { return k.inicio === a.inicio; })[0];
          if (!c) continue;
          var item = { clase_id: c.id, fecha: f, estado: '' };
          var mia = reservasDe(c.id).filter(function (r) { return r.alumna_id === al.id && OCUPA[r.estado]; })[0];
          if (mia) item.estado = 'ya';
          else if (!reservable(c)) item.estado = 'cerrada';
          else if (ocupados(c.id) >= c.cupos) item.estado = 'llena';
          else if (!elegirPlan(al.id, c)) item.estado = 'sin_saldo';
          else if (a.confirmar) {
            try { reservarInterno(al.id, c, { serie: true }); item.estado = 'reservada'; }
            catch (e) { item.estado = e.codigo || 'error'; }
          } else item.estado = 'disponible';
          resultado.push(item);
        }
        if (a.confirmar) log(al.id, 'serie', a.dia_semana + ' ' + a.inicio);
        return { clases: resultado, saldo: saldo(al.id), saldo_antes: libres, hasta: hasta };
      },

      /* ----- Fotos ----- */
      subirFoto: function (a, s) {
        if (s.rol === 'alumna') {
          var al = soloAlumna(s), id = guardarFoto(al.id, a.data, al.foto);
          db.update('Alumnas', al.id, { foto: id }); return { foto: id };
        }
        soloPanel(s);
        if (a.producto_id) {
          var p = porId('Productos', a.producto_id); if (!p) throw err('datos', 'No existe el producto.');
          var idp = guardarFoto(p.id, a.data, p.foto); db.update('Productos', p.id, { foto: idp }); return { foto: idp };
        }
        var x = porId('Alumnas', a.alumna_id); if (!x) throw err('alumna', 'No encontramos a esa alumna.');
        var idx = guardarFoto(x.id, a.data, x.foto); db.update('Alumnas', x.id, { foto: idx }); return { foto: idx };
      },
      fotos: function (a, s) {
        var ids = (a.ids || []).slice(0, 80).map(String), out = {};
        db.rows('Fotos').forEach(function (f) { if (ids.indexOf(String(f.id)) >= 0) out[f.id] = f.data; });
        return out;
      },

      /* ----- Panel: alumnas nuevas ----- */
      crearAlumna: function (a, s) {
        var u = soloPanel(s), r = validarNuevaAlumna(a, true);
        log(u.id, 'crear_alumna', r.id + ' ' + r.nombre);
        return { ok: true, id: r.id };
      },

      importarAlumnas: function (a, s) {
        var u = soloPanel(s, 'dueña'), out = [];
        var existentes = {}; db.rows('Alumnas').forEach(function (x) { if (x.correo) existentes[String(x.correo).toLowerCase()] = 1; });
        (a.lista || []).slice(0, 300).forEach(function (item) {
          var correo = String(item.correo || '').trim().toLowerCase();
          var nombre = String(item.nombre || '').replace(/[^\p{L}\p{M}\s'.-]/gu, '').replace(/\s+/g, ' ').trim();
          if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(correo)) { out.push({ nombre: nombre, correo: correo, estado: 'correo inválido' }); return; }
          if (existentes[correo]) { out.push({ nombre: nombre, correo: correo, estado: 'ya existía' }); return; }
          var sinNombre = !nombre;
          if (sinNombre) nombre = correo.split('@')[0];
          nombre = nombre.split(' ').map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' ');
          var pin = /^\d{4}$/.test(String(a.pin || '')) ? String(a.pin) : '1234', id = nuevoId('A');
          db.insert('Alumnas', { id: id, nombre: nombre, rut: '', correo: correo, telefono: String(item.telefono || '').replace(/[^0-9+]/g, ''),
            pin_hash: hashPin(id, pin), fecha_nacimiento: '', mostrar_nombre: 'si', alta: hoy(), estado: 'activa',
            consentimiento_salud: 'si', obs_salud: '', notas: sinNombre ? 'Completar nombre (importada)' : 'Importada de la app anterior',
            intentos: '0', bloqueada_hasta: '', foto: '' });
          existentes[correo] = 1;
          // Plan que traía de la app anterior (sin registrar venta nueva)
          var planTxt = '';
          if (item.plan) {
            var q = String(item.plan).toLowerCase().replace(/^aura\s*/, '').trim();
            var pl = db.rows('Planes').filter(function (p) { var n = String(p.nombre).toLowerCase(); return p.id.toLowerCase() === q || n === q || n === 'aura ' + q || n.indexOf(q) >= 0; })[0];
            if (pl) {
              var total = num(pl.clases), libres = item.libres === '' || item.libres === undefined || item.libres === null ? total : Math.max(0, Math.min(total, num(item.libres)));
              var ini = /^\d{4}-\d{2}-\d{2}$/.test(String(item.inicio || '')) ? item.inicio : hoy();
              var dv = num(pl.dias_vigencia);
              db.insert('PlanesAlumna', { id: nuevoId('PA'), alumna_id: id, plan_id: pl.id, clases_total: String(total), clases_usadas: String(total - libres),
                inicio: ini, vence: dv > 0 ? sumarDias(ini, dv - 1) : '', estado: 'activo', pago_id: '' });
              planTxt = pl.nombre + ' · ' + libres + ' clases';
            } else planTxt = 'plan no encontrado: ' + item.plan;
          }
          var enviado = false;
          if (a.avisar && env.avisar) {
            env.avisar(correo, 'Tu nueva app de reservas de Aura Studio Pilates',
              'Hola ' + (sinNombre ? '' : nombre.split(' ')[0]) + '\n\nAura Studio Pilates tiene nueva app para reservar tus clases.\n\n' +
              'Entra aquí: ' + (a.link || '') + '\nUsuario: ' + correo + '\nPIN: ' + pin + '\n\n' +
              'Desde tu perfil puedes cambiar el PIN, agregar tu foto y tu teléfono. Instálala en tu celular con "Agregar a inicio".\n\nNos vemos en clases,\nConstanza');
            enviado = true;
          }
          out.push({ id: id, nombre: nombre, correo: correo, pin: pin, estado: 'creada', enviado: enviado, plan: planTxt });
        });
        log(u.id, 'importar', out.filter(function (x) { return x.estado === 'creada'; }).length + ' alumnas');
        return out;
      },

      calendario: function (a, s) {
        soloPanel(s);
        var mes = /^\d{4}-\d{2}$/.test(String(a.mes || '')) ? a.mes : mesDe(hoy());
        var porFecha = {};
        db.rows('Reservas').forEach(function (r) {
          if (!OCUPA[r.estado] || mesDe(r.clase_id) !== mes) return;
          var f = String(r.clase_id).split('T')[0]; porFecha[f] = (porFecha[f] || 0) + 1;
        });
        return { mes: mes, hoy: hoy(), dias: diasDelMes(mes).map(function (f) {
          var cs = clasesDelDia(f), activas = cs.filter(function (c) { return c.estado !== 'feriado'; });
          return { fecha: f, clases: activas.length, feriado: cs.length > 0 && !activas.length,
            reservas: porFecha[f] || 0, cupos: activas.reduce(function (t, c) { return t + c.cupos; }, 0) };
        }) };
      },

      /* ----- Panel: horario, feriados, avisos ----- */
      horario: function (a, s) {
        soloPanel(s);
        return db.rows('Horario').filter(function (h) { return h.activo !== 'no'; })
          .map(function (h) { return { id: h.id, dia_semana: num(h.dia_semana), inicio: h.inicio, fin: h.fin, tipo: h.tipo, cupos: num(h.cupos) }; })
          .sort(function (x, y) { return x.dia_semana - y.dia_semana || (x.inicio < y.inicio ? -1 : 1); });
      },
      guardarHorario: function (a, s) {
        var u = soloPanel(s, 'dueña');
        if (!/^[1-7]$/.test(String(a.dia_semana)) || !/^\d{2}:\d{2}$/.test(String(a.inicio))) throw err('datos', 'Revisa el día y la hora.');
        var datos = { id: a.id, dia_semana: a.dia_semana, inicio: a.inicio, fin: a.fin || sumarMin(a.inicio, 50),
          tipo: a.tipo || 'Reformer full body', profesora_id: a.profesora_id || 'U1', cupos: num(a.cupos) || num(cfg('cupos_por_clase')), activo: a.activo === 'no' ? 'no' : 'si' };
        var id = upsert('Horario', 'H', datos, ['dia_semana', 'inicio', 'fin', 'tipo', 'profesora_id', 'cupos', 'activo']);
        log(u.id, 'horario', id + ' ' + datos.dia_semana + ' ' + datos.inicio + ' ' + datos.activo);
        return { ok: true, id: id };
      },
      cancelarDia: function (a, s) {
        var u = soloPanel(s), total = 0, clases = 0;
        clasesDelDia(a.fecha).forEach(function (c) {
          if (c.estado === 'feriado') return;
          total += acciones.cancelarClase({ clase_id: c.id, motivo: a.motivo || 'Feriado' }, s).devueltas; clases++;
        });
        log(u.id, 'cancelar_dia', a.fecha + ' ' + (a.motivo || ''));
        return { ok: true, clases: clases, devueltas: total };
      },
      avisoGeneral: function (a, s) {
        var u = soloPanel(s);
        var asunto = String(a.asunto || '').trim(), texto = String(a.texto || '').trim();
        if (!asunto || !texto) throw err('datos', 'Escribe el asunto y el mensaje.');
        var n = 0;
        db.rows('Alumnas').forEach(function (al) {
          if (al.estado === 'inactiva' || !al.correo) return;
          if (env.avisar) { env.avisar(al.correo, asunto, 'Hola ' + String(al.nombre).split(' ')[0] + ',\n\n' + texto + '\n\nAura Studio Pilates'); n++; }
        });
        log(u.id, 'aviso_general', asunto + ' (' + n + ')');
        return { ok: true, enviados: n };
      },
      semana: function (a, s) {
        soloPanel(s);
        var desde = a.desde || lunesDe(hoy()), out = [];
        for (var i = 0; i < 7; i++) {
          var f = sumarDias(desde, i);
          out.push({ fecha: f, clases: clasesDelDia(f).map(function (c) {
            var o = ocupados(c.id); return { inicio: c.inicio, fin: c.fin, estado: c.estado, motivo: c.motivo, cupos: c.cupos, ocupados: o, libres: Math.max(0, c.cupos - o) };
          }) });
        }
        return out;
      },

      /* ----- Panel: planes, configuración ----- */
      guardarPlan: function (a, s) {
        var u = soloPanel(s, 'dueña');
        if (!String(a.nombre || '').trim() || num(a.clases) < 1) throw err('datos', 'Revisa el nombre y las clases.');
        var id = upsert('Planes', 'P', { id: a.id, nombre: a.nombre, clases: num(a.clases), dias_vigencia: num(a.dias), precio: num(a.precio),
          tope_semanal: num(a.tope_semanal), activo: a.activo === 'no' ? 'no' : 'si' }, ['nombre', 'clases', 'dias_vigencia', 'precio', 'tope_semanal', 'activo']);
        log(u.id, 'plan', id); return { ok: true, id: id };
      },
      ajustes: function (a, s) {
        soloPanel(s, 'dueña');
        var out = {}; for (var k in CONFIG_INICIAL) out[k] = cfg(k); return out;
      },
      guardarAjustes: function (a, s) {
        var u = soloPanel(s, 'dueña');
        var permitidas = ['nombre_estudio', 'whatsapp', 'soporte', 'instagram', 'transferencia', 'politicas', 'cupos_por_clase',
          'cierre_modo', 'cierre_hora', 'horas_cierre_reserva', 'horas_cancelacion', 'dias_adelanto', 'permitir_sin_saldo', 'regalo_cumple'];
        var existentes = {}; db.rows('Config').forEach(function (r) { existentes[r.clave] = 1; });
        var n = 0;
        Object.keys(a.valores || {}).forEach(function (k) {
          if (permitidas.indexOf(k) < 0) return;
          var v = String(a.valores[k]).slice(0, 20000);
          if (k === 'whatsapp' || k === 'soporte') v = v.replace(/\D/g, '');
          if (existentes[k]) db.update('Config', k, { valor: v }); else db.insert('Config', { clave: k, valor: v });
          n++;
        });
        log(u.id, 'ajustes', n + ' valores'); return { ok: true };
      },

      /* ----- Panel: tienda ----- */
      productos: function (a, s) { soloPanel(s); return productos(true); },
      guardarProducto: function (a, s) {
        var u = soloPanel(s, 'dueña');
        if (!String(a.nombre || '').trim()) throw err('datos', 'Escribe el nombre del producto.');
        var id = upsert('Productos', 'PR', { id: a.id, nombre: a.nombre, descripcion: a.descripcion || '', precio: num(a.precio),
          stock: a.stock === '' || a.stock === null || a.stock === undefined ? '' : num(a.stock), activo: a.activo === 'no' ? 'no' : 'si' },
          ['nombre', 'descripcion', 'precio', 'stock', 'activo']);
        log(u.id, 'producto', id); return { ok: true, id: id };
      },
      venderProducto: function (a, s) {
        var u = soloPanel(s), p = porId('Productos', a.producto_id);
        if (!p) throw err('datos', 'No existe el producto.');
        var cant = Math.max(1, num(a.cantidad) || 1);
        if (p.stock !== '' && num(p.stock) < cant) throw err('stock', 'No hay stock suficiente (quedan ' + num(p.stock) + ').');
        var monto = a.monto !== undefined && a.monto !== '' ? num(a.monto) : num(p.precio) * cant;
        db.insert('Pagos', { id: nuevoId('PG'), fecha: hoy(), alumna_id: a.alumna_id || '', monto: String(monto), medio: a.medio || 'transferencia',
          plan_alumna_id: '', registrado_por: u.id, nota: p.nombre, tipo: 'producto', producto_id: p.id, cantidad: String(cant) });
        if (p.stock !== '') db.update('Productos', p.id, { stock: String(num(p.stock) - cant) });
        log(u.id, 'venta', p.nombre + ' x' + cant); return { ok: true };
      },

      /* ----- Panel: eventos ----- */
      eventos: function (a, s) { soloPanel(s); return eventos(true); },
      guardarEvento: function (a, s) {
        var u = soloPanel(s);
        if (!String(a.titulo || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha))) throw err('datos', 'Escribe el título y la fecha.');
        var id = upsert('Eventos', 'EV', { id: a.id, fecha: a.fecha, hora: a.hora || '', titulo: a.titulo, descripcion: a.descripcion || '', lugar: a.lugar || '',
          precio: a.precio === '' || a.precio === undefined || a.precio === null ? '' : num(a.precio), cupos: a.cupos === '' || a.cupos === undefined || a.cupos === null ? '' : num(a.cupos),
          activo: a.activo === 'no' ? 'no' : 'si' }, ['fecha', 'hora', 'titulo', 'descripcion', 'lugar', 'precio', 'cupos', 'activo']);
        log(u.id, 'evento', id); return { ok: true, id: id };
      },

      /* ----- Panel: gastos y reportes (dueña) ----- */
      gastos: function (a, s) {
        soloPanel(s, 'dueña'); var mes = a.mes || mesDe(hoy());
        return db.rows('Gastos').filter(function (g) { return g.activo !== 'no' && mesDe(g.fecha) === mes; })
          .map(function (g) { return { id: g.id, fecha: g.fecha, categoria: g.categoria, detalle: g.detalle, monto: num(g.monto), tipo: g.tipo }; })
          .sort(function (x, y) { return x.fecha < y.fecha ? 1 : -1; });
      },
      guardarGasto: function (a, s) {
        var u = soloPanel(s, 'dueña');
        if (!(num(a.monto) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha || ''))) throw err('datos', 'Revisa la fecha y el monto.');
        var id = upsert('Gastos', 'G', { id: a.id, fecha: a.fecha, categoria: a.categoria || 'Otros', detalle: a.detalle || '', monto: num(a.monto),
          tipo: a.tipo === 'variable' ? 'variable' : 'fijo', activo: a.activo === 'no' ? 'no' : 'si' }, ['fecha', 'categoria', 'detalle', 'monto', 'tipo', 'activo']);
        log(u.id, 'gasto', id); return { ok: true, id: id };
      },
      reporte: function (a, s) {
        soloPanel(s, 'dueña');
        var mes = a.mes || mesDe(hoy()), h = hoy();
        var cat = {}; db.rows('Planes').forEach(function (p) { cat[p.id] = p; });
        var pas = {}; db.rows('PlanesAlumna').forEach(function (p) { pas[p.id] = p; });
        var pagos = db.rows('Pagos'), gastosT = db.rows('Gastos').filter(function (g) { return g.activo !== 'no'; });
        function ventasMes(m) { return pagos.filter(function (p) { return mesDe(p.fecha) === m; }).reduce(function (t, p) { return t + num(p.monto); }, 0); }
        function gastosMes(m) { return gastosT.filter(function (g) { return mesDe(g.fecha) === m; }).reduce(function (t, g) { return t + num(g.monto); }, 0); }
        var pm = pagos.filter(function (p) { return mesDe(p.fecha) === mes; });
        var ventas = 0, vPlanes = 0, vProd = 0, nPlanes = 0, porPlan = {}, porProducto = {};
        pm.forEach(function (p) {
          var m = num(p.monto); ventas += m;
          if (p.tipo === 'producto') { vProd += m; porProducto[p.nota || 'Producto'] = (porProducto[p.nota || 'Producto'] || 0) + m; }
          else {
            vPlanes += m; nPlanes++;
            var pa = pas[p.plan_alumna_id], nom = pa && cat[pa.plan_id] ? cat[pa.plan_id].nombre : 'Plan';
            porPlan[nom] = porPlan[nom] || { cantidad: 0, monto: 0 }; porPlan[nom].cantidad++; porPlan[nom].monto += m;
          }
        });
        var gm = gastosT.filter(function (g) { return mesDe(g.fecha) === mes; });
        var gastos = 0, fijos = 0, porCategoria = {};
        gm.forEach(function (g) { var m = num(g.monto); gastos += m; if (g.tipo !== 'variable') fijos += m; porCategoria[g.categoria || 'Otros'] = (porCategoria[g.categoria || 'Otros'] || 0) + m; });
        var reservas = db.rows('Reservas'), clasesDictadas = 0, cuposTot = 0, ocupTot = 0, asist = 0, faltas = 0, tardias = 0, activas = {};
        diasDelMes(mes).forEach(function (f) {
          if (f > h) return;
          clasesDelDia(f).forEach(function (c) {
            if (c.estado === 'feriado' || msDe(c.fecha, c.inicio) > ahora()) return;
            var rs = reservas.filter(function (r) { return r.clase_id === c.id; });
            var o = rs.filter(function (r) { return OCUPA[r.estado]; });
            cuposTot += c.cupos; ocupTot += o.length;
            if (o.length) clasesDictadas++;
            rs.forEach(function (r) {
              if (r.estado === 'asistió') asist++; else if (r.estado === 'faltó') faltas++; else if (r.estado === 'tardía') tardias++;
              if (OCUPA[r.estado] || r.estado === 'tardía') activas[r.alumna_id] = 1;
            });
          });
        });
        var porCobrar = reservas.filter(function (r) { return !r.plan_alumna_id && (OCUPA[r.estado] || r.estado === 'tardía'); }).length;
        var precioSuelta = num((cat.P2 || {}).precio) || 13000;
        var vencidas = 0, vencieron = {}, renovaron = 0;
        db.rows('PlanesAlumna').forEach(function (pa) {
          if (pa.vence && mesDe(pa.vence) === mes && pa.vence < h) {
            vencidas += Math.max(0, num(pa.clases_total) - num(pa.clases_usadas));
            vencieron[pa.alumna_id] = pa.vence;
          }
        });
        Object.keys(vencieron).forEach(function (id) {
          var otro = db.rows('PlanesAlumna').filter(function (pa) { return pa.alumna_id === id && pa.inicio >= sumarDias(vencieron[id], -10) && pa.vence !== vencieron[id]; });
          if (otro.length) renovaron++;
        });
        var ticket = nPlanes ? Math.round(vPlanes / nPlanes) : 0;
        var precioRef = ticket || Math.round(catalogo().reduce(function (t, p) { return t + p.precio; }, 0) / Math.max(1, catalogo().length));
        var serie = [];
        for (var i = 5; i >= 0; i--) { var m = sumaMes(mes, -i); serie.push({ mes: m, ventas: ventasMes(m), gastos: gastosMes(m) }); }
        return {
          mes: mes, ventas: ventas, ventas_planes: vPlanes, ventas_productos: vProd, planes_vendidos: nPlanes,
          gastos: gastos, gastos_fijos: fijos, utilidad: ventas - gastos, margen: ventas ? Math.round((ventas - gastos) / ventas * 100) : 0,
          punto_equilibrio_planes: precioRef ? Math.ceil(gastos / precioRef) : 0, ticket_promedio: ticket,
          clases_dictadas: clasesDictadas, ocupacion: cuposTot ? Math.round(ocupTot / cuposTot * 100) : 0,
          ingreso_por_clase: clasesDictadas ? Math.round(vPlanes / clasesDictadas) : 0, costo_por_clase: clasesDictadas ? Math.round(gastos / clasesDictadas) : 0,
          asistencias: asist, faltas: faltas, tardias: tardias, alumnas_activas: Object.keys(activas).length,
          alumnas_nuevas: db.rows('Alumnas').filter(function (al) { return mesDe(al.alta) === mes; }).length,
          por_cobrar_clases: porCobrar, por_cobrar_monto: porCobrar * precioSuelta, vencidas_sin_usar: vencidas,
          renovacion: Object.keys(vencieron).length ? Math.round(renovaron / Object.keys(vencieron).length * 100) : null,
          por_plan: Object.keys(porPlan).map(function (k) { return { nombre: k, cantidad: porPlan[k].cantidad, monto: porPlan[k].monto }; }),
          por_producto: Object.keys(porProducto).map(function (k) { return { nombre: k, monto: porProducto[k] }; }),
          por_categoria: Object.keys(porCategoria).map(function (k) { return { categoria: k, monto: porCategoria[k] }; }),
          serie: serie
        };
      },
      exportar: function (a, s) {
        soloPanel(s, 'dueña');
        var mes = a.mes || mesDe(hoy());
        var al = {}; db.rows('Alumnas').forEach(function (x) { al[x.id] = x; });
        var cat = {}; db.rows('Planes').forEach(function (p) { cat[p.id] = p; });
        var pas = {}; db.rows('PlanesAlumna').forEach(function (p) { pas[p.id] = p; });
        return {
          pagos: db.rows('Pagos').filter(function (p) { return mesDe(p.fecha) === mes; }).map(function (p) {
            var pa = pas[p.plan_alumna_id];
            return [p.fecha, (al[p.alumna_id] || {}).nombre || '', p.tipo === 'producto' ? 'Producto' : 'Plan',
              p.tipo === 'producto' ? p.nota : (pa && cat[pa.plan_id] ? cat[pa.plan_id].nombre : ''), p.cantidad || '1', p.medio, num(p.monto)];
          }),
          gastos: db.rows('Gastos').filter(function (g) { return g.activo !== 'no' && mesDe(g.fecha) === mes; }).map(function (g) {
            return [g.fecha, g.categoria, g.detalle, g.tipo, num(g.monto)]; }),
          reservas: db.rows('Reservas').filter(function (r) { return mesDe(r.clase_id) === mes; }).map(function (r) {
            var f = r.clase_id.split('T'); return [f[0], f[1], (al[r.alumna_id] || {}).nombre || '', r.estado, r.plan_alumna_id ? 'Plan' : 'Sin plan']; })
            .sort(function (x, y) { return (x[0] + x[1]) < (y[0] + y[1]) ? -1 : 1; }),
          alumnas: db.rows('Alumnas').map(function (x) { return [x.nombre, x.rut, x.correo, x.telefono, x.alta, x.estado, saldo(x.id)]; })
        };
      },

      cambiarClave: function (a, s) {
        var u = soloPanel(s);
        if (hashClave(u.id, String(a.actual || '')) !== u.clave_hash) throw err('clave', 'La clave actual no es correcta.');
        var nueva = String(a.nueva || '');
        if (nueva.length < 4) throw err('clave', 'La clave nueva debe tener al menos 4 caracteres.');
        var cambios = { clave_hash: hashClave(u.id, nueva) };
        if (a.usuario !== undefined) {
          var us = String(a.usuario).trim().toLowerCase();
          if (us && !/^[a-z0-9._-]{3,30}$/.test(us)) throw err('clave', 'El usuario solo puede tener letras, números, punto o guion.');
          var otro = db.rows('Usuarios').filter(function (x) { return x.id !== u.id && us && String(x.usuario).toLowerCase() === us; });
          if (otro.length) throw err('clave', 'Ese usuario ya existe.');
          cambios.usuario = us;
        }
        db.update('Usuarios', u.id, cambios);
        log(u.id, 'cambiar_clave', '');
        return { ok: true };
      },

      /* ----- Panel: Drive (dueña) ----- */
      drive: function (a, s) {
        soloPanel(s, 'dueña');
        return env.drive ? env.drive.info() : { demo: true };
      },
      respaldar: function (a, s) {
        var u = soloPanel(s, 'dueña');
        if (!env.drive) throw err('demo', 'En la demo no hay Drive conectado.');
        var url = env.drive.respaldo(); log(u.id, 'respaldo', url); return { ok: true, url: url };
      },
      guardarEnDrive: function (a, s) {
        var u = soloPanel(s, 'dueña');
        if (!env.drive) throw err('demo', 'En la demo no hay Drive conectado.');
        var filas = (a.filas || []).slice(0, 5000).map(function (f) { return (f || []).slice(0, 30).map(function (c) { return c === null || c === undefined ? '' : c; }); });
        var url = env.drive.tabla(String(a.nombre || 'Reporte Aura').slice(0, 100), filas);
        log(u.id, 'reporte_drive', a.nombre); return { ok: true, url: url };
      },

      reabrirClase: function (a, s) {
        var u = soloPanel(s);
        var existe = porId('Clases', a.clase_id);
        if (existe) db.update('Clases', existe.id, { estado: 'normal', motivo: '' });
        log(u.id, 'reabrir_clase', a.clase_id);
        return { ok: true };
      }
    };

    function llamar(accion, args, token) {
      cfgCache = null;
      var f = acciones[accion];
      if (!f) throw err('accion', 'Acción desconocida: ' + accion);
      var s = (accion === 'publico' || accion === 'registro' || accion === 'entrar' || accion === 'entrarPanel') ? null : sesion(token);
      return f(args || {}, s);
    }

    return { llamar: llamar, hashPin: hashPin, hashClave: hashClave, clasesDelDia: clasesDelDia };
  }

  return {
    TABLAS: TABLAS, CONFIG_INICIAL: CONFIG_INICIAL, PLANES_INICIALES: PLANES_INICIALES,
    horarioInicial: horarioInicial, crear: crear,
    util: { msDe: msDe, fechaDe: fechaDe, horaDe: horaDe, sumarDias: sumarDias, sellos: sellos, rutValido: rutValido, formatoRut: formatoRut }
  };
})();

if (typeof module !== 'undefined') module.exports = AuraCore;
