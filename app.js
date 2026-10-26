'use strict';
/* Mi tracker · agenda (Google Calendar), hábitos, comidas, plata y pantalla.
   Los datos viven en el navegador y se sincronizan con un archivo oculto en el
   Google Drive de la misma cuenta (appDataFolder). Nadie más los ve. */

const CFG = window.TRACKER_CONFIG || {};
const QS = new URLSearchParams(location.search);
const DEMO = !CFG.CLIENT_ID || QS.has('demo');
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.appdata'
].join(' ');
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const p2 = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const deYmd = s => { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c); };
const sumar = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const lunes = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const conHora = (fecha, h) => { const [a, b] = h.split(':').map(Number); const x = deYmd(fecha); x.setHours(a, b, 0, 0); return x; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const HOY = () => ymd(new Date());
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DC = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = s => { const d = deYmd(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const fechaCorta = s => { const d = deYmd(s); return `${DC[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; };
const plataOculta = () => LS.get('ocultarPlata', false);
const plata = (n, mon) => {
  const sig = mon === 'USD' ? 'US$ ' : '$ ';
  return plataOculta() ? sig + '•••••' : (n < 0 ? '−' : '') + sig + Math.abs(Math.round(n)).toLocaleString('es-AR');
};
const ojo = () => `<button class="ojo" data-a="togglePlata" title="${plataOculta() ? 'Mostrar montos' : 'Ocultar montos'}">${plataOculta() ? '🙈' : '👁️'}</button>`;
const durTxt = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h${m ? ' ' + m + ' min' : ''}` : `${m} min`; };
const numero = v => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };

const LS = {
  get(k, d) { try { const v = localStorage.getItem('mt:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mt:' + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem('mt:' + k); } catch { } }
};

/* ---------- base de datos: registros con fecha de cambio (u) para sincronizar ---------- */
let DB = LS.get('db', null) || { items: {} };
const rec = k => { const r = DB.items[k]; return r && !r.del ? r : null; };
const todos = pre => Object.values(DB.items).filter(r => !r.del && r.k.startsWith(pre));
function poner(k, data) { DB.items[k] = { ...data, k, u: Date.now() }; guardar(); }
function cambiar(k, patch) { poner(k, { ...(rec(k) || {}), ...patch }); }
function borrar(k) { if (DB.items[k]) { DB.items[k] = { k, u: Date.now(), del: 1 }; guardar(); } }
function guardar() { LS.set('db', DB); syncPronto(); }

const CATS_DEF = {
  gasto: ['🛒 Súper', '🍔 Comida afuera', '🚗 Transporte', '🏠 Casa y servicios', '💊 Salud', '🏋️ Gym y deporte', '👕 Ropa', '📱 Suscripciones', '🎉 Salidas', '💼 Trabajo', '🎁 Regalos', '📦 Otros'],
  ingreso: ['💼 Sueldo', '🧾 Clientes', '💻 Freelance', '🎁 Regalo', '📦 Otros'],
  inversion: ['💵 Dólares', '🏦 Plazo fijo', '📊 FCI', '📈 Acciones / CEDEARs', '🪙 Cripto', '📦 Otros']
};
const GRUPOS = [['alm', 'Almidones'], ['car', 'Carnes'], ['ver', 'Verduras'], ['fru', 'Frutas'], ['lac', 'Lácteos'], ['gra', 'Grasas']];
const COMIDAS = [['desayuno', 'Desayuno', '☕'], ['almuerzo', 'Almuerzo', '🍽️'], ['merienda', 'Merienda', '🥪'], ['cena', 'Cena', '🌙']];
const APPS_PANTALLA = ['Instagram', 'TikTok', 'WhatsApp', 'YouTube', 'X / Twitter', 'Juegos', 'Navegador', 'Trabajo', 'Otros'];

function cfg() {
  const c = rec('cfg:main') || {};
  return {
    cats: c.cats || CATS_DEF, dolar: c.dolar || 0, metas: c.metas || {},
    cals: c.cals || null, calDef: c.calDef || null, aviso: c.aviso ?? 10
  };
}
const setCfg = patch => cambiar('cfg:main', patch);
const decimal = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const fmt = n => typeof n === 'number' ? n.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : (n ?? '');

/* ---------- Plan de comidas (opciones por comida, cantidades y porciones) ---------- */
const PLAN_VACIO = { nombre: '', opciones: { desayuno: [], almuerzo: [], merienda: [], cena: [] }, cantidades: {}, metas: {} };
function plan() {
  const p = rec('plan:main');
  return p ? { ...PLAN_VACIO, ...p, opciones: { ...PLAN_VACIO.opciones, ...(p.opciones || {}) }, cantidades: p.cantidades || {} } : PLAN_VACIO;
}
const metas = () => ({ ...(cfg().metas || {}), ...(plan().metas || {}) });
const opcion = (tipo, n) => plan().opciones[tipo]?.find(o => o.n === n);

/* ---------- Mi rutina: actividades que se repiten, guardadas en la app ----------
   rut:<id>  { t, h, f, dias:[0-6] | fecha, quin:'A'|'B' (semana por medio), comida, plan, detalle }
   rutx:<fecha>:<id>  cambios de un solo día { h, f, plan, oculto, extra } */
const REF_A = new Date(2026, 9, 26); // lunes de una semana "A"
const paridad = f => Math.abs(Math.round((lunes(deYmd(f)) - REF_A) / (7 * 864e5))) % 2 === 0 ? 'A' : 'B';
const rutinas = () => todos('rut:').sort((a, b) => a.h.localeCompare(b.h));
function rutinaDelDia(f) {
  const d = deYmd(f).getDay(), par = paridad(f), out = [];
  rutinas().forEach(r => {
    const id = r.k.slice(4), o = rec(`rutx:${f}:${id}`);
    const toca = r.fecha ? r.fecha === f : (r.dias || []).includes(d) && (!r.quin || r.quin === par);
    if (o?.oculto || (!toca && !o?.extra)) return;
    const pl = o?.plan || r.plan || '', ini = conHora(f, o?.h || r.h);
    let fin = conHora(f, o?.f || r.f); if (fin <= ini) fin = sumar(fin, 1);
    const op = r.comida ? opcion(r.comida, pl) : null;
    out.push({
      id: `r:${f}:${id}`, rid: id, calId: 'rutina', rutina: true, titulo: r.t, ini, fin, todoDia: false, color: '#0d9488',
      serie: 'rutina', comida: r.comida || null, plan: pl, cambiado: !!(o && !o.oculto),
      desc: r.comida ? [pl, op?.d].filter(Boolean).join(': ') : (r.detalle || ''), link: ''
    });
  });
  return out;
}
const esComida = e => e.rutina ? !!e.comida : RE_COMIDA.test(e.titulo);


/* ---------- estado de pantalla ---------- */
const S = {
  tab: LS.get('tab', 'hoy'), dia: HOY(), mes: HOY().slice(0, 7), semHab: ymd(lunes(new Date())),
  ev: {}, evCarga: {}, cals: LS.get('cals', []), auth: 'no', sync: 'local', filtroMov: 'todo',
  rango: 'esta'
};

if (!todos('habit:').length && !LS.get('sembrado')) {
  [['Leer 20 minutos', 'hacer', '📖'], ['No fumar', 'dejar', '🚭'], ['Tomar la creatina', 'hacer', '💊'], ['2 litros de agua', 'hacer', '💧']]
    .forEach(([nombre, tipo, emoji], i) => poner('habit:' + uid(), { nombre, tipo, emoji, orden: i }));
  LS.set('sembrado', 1);
}
if (DEMO && !todos('rut:').length && !LS.get('rutDemo')) {
  RUTINA_DEMO.items.forEach(x => poner('rut:' + uid(), x));
  poner('plan:main', RUTINA_DEMO.plan);
  LS.set('rutDemo', 1);
}

/* ---------- Google: login ---------- */
let TOKEN = LS.get('tok', null);
let tokenClient = null, tokenEspera = null;
const tokenOk = () => TOKEN && TOKEN.exp > Date.now() + 60000;

function iniciarGoogle() {
  if (DEMO) { S.auth = 'demo'; return; }
  S.auth = tokenOk() ? 'ok' : (LS.get('conectado') ? 'vencido' : 'no');
  const intentar = () => {
    if (!window.google?.accounts?.oauth2) return setTimeout(intentar, 200);
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.CLIENT_ID, scope: SCOPES,
      callback: r => {
        if (r.error) { aviso('Google no dio permiso: ' + r.error); tokenEspera?.rej(r); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...SCOPES.split(' '))) aviso('Faltan permisos: tildá Calendar y Drive para que ande todo.');
        TOKEN = { t: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
        LS.set('tok', TOKEN); LS.set('conectado', 1); S.auth = 'ok';
        tokenEspera?.res(); tokenEspera = null;
        trasLogin();
      },
      error_callback: e => { aviso(e.type === 'popup_closed' ? 'Cerraste la ventana de Google.' : 'No se pudo abrir Google (¿bloqueador de ventanas?).'); tokenEspera?.rej(e); tokenEspera = null; }
    });
  };
  intentar();
}
function conectar(primeraVez) {
  if (!tokenClient) return aviso('Google todavía está cargando, probá en un segundo.');
  return new Promise((res, rej) => {
    tokenEspera = { res, rej };
    tokenClient.requestAccessToken({ prompt: primeraVez ? 'consent' : '', login_hint: LS.get('email', '') || undefined });
  });
}
function desconectar() {
  if (TOKEN && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(TOKEN.t, () => { });
  TOKEN = null; LS.del('tok'); LS.del('conectado'); S.auth = 'no'; S.ev = {}; render();
}
async function trasLogin() {
  await cargarCalendarios();
  const c = cfg();
  if (!c.cals || !c.cals.length) abrirCalendarios(true);
  S.ev = {}; render(); asegurarSemana(S.dia, true); sincronizar();
}

async function gfetch(url, opt = {}) {
  if (DEMO) throw new Error('demo');
  if (!tokenOk()) { S.auth = LS.get('conectado') ? 'vencido' : 'no'; render(); throw new Error('auth'); }
  const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + TOKEN.t, ...(opt.headers || {}) } });
  if (r.status === 401) { TOKEN = null; LS.del('tok'); S.auth = 'vencido'; render(); throw new Error('auth'); }
  if (!r.ok) { let m = r.status; try { m = (await r.json()).error.message; } catch { } throw new Error(m); }
  return r.status === 204 ? null : r;
}
const gjson = async (url, opt) => { const r = await gfetch(url, opt); return r ? r.json() : null; };
const CAL = 'https://www.googleapis.com/calendar/v3';

/* ---------- Calendario ---------- */
async function cargarCalendarios() {
  if (DEMO) { S.cals = [{ id: 'demo', summary: 'Rutina (demo)', backgroundColor: '#6366f1', primary: true, accessRole: 'owner' }]; return; }
  try {
    const r = await gjson(`${CAL}/users/me/calendarList?minAccessRole=reader&maxResults=250`);
    S.cals = (r.items || []).map(c => ({ id: c.id, summary: c.summaryOverride || c.summary, backgroundColor: c.backgroundColor, primary: !!c.primary, accessRole: c.accessRole }));
    LS.set('cals', S.cals);
    const prim = S.cals.find(c => c.primary); if (prim) LS.set('email', prim.id);
  } catch (e) { if (e.message !== 'auth') aviso('No pude leer tus calendarios: ' + e.message); }
}
const calsVisibles = () => DEMO ? ['demo'] : (cfg().cals || []);
const calInfo = id => S.cals.find(c => c.id === id) || { summary: id, backgroundColor: '#8b8b99' };
const calEscribible = id => DEMO || ['owner', 'writer'].includes(calInfo(id).accessRole);
function calPorDefecto() {
  const c = cfg(), vis = calsVisibles();
  if (c.calDef && calEscribible(c.calDef)) return c.calDef;
  return vis.find(calEscribible) || S.cals.find(x => x.primary)?.id || vis[0];
}

function normalizar(e, calId) {
  const todoDia = !!e.start.date;
  const ini = todoDia ? deYmd(e.start.date) : new Date(e.start.dateTime);
  const fin = todoDia ? deYmd(e.end.date) : new Date(e.end.dateTime);
  return {
    id: e.id, calId, titulo: e.summary || '(sin título)', desc: limpiarHtml(e.description || ''),
    ini, fin, todoDia, color: e.colorId ? null : calInfo(calId).backgroundColor, link: e.htmlLink,
    serie: e.recurringEventId || null, lugar: e.location || '', ical: e.iCalUID || ''
  };
}
const limpiarHtml = s => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function asegurarSemana(fecha, forzar) {
  const lu = lunes(deYmd(fecha)), clave = ymd(lu);
  if (DEMO) { if (!S.ev[clave]) S.ev[clave] = semanaDemo(lu); return; }
  if (S.auth !== 'ok') { if (!S.ev[clave]) S.ev[clave] = LS.get('ev:' + clave, null)?.map(revivir) || null; return; }
  const ult = S.evCarga[clave];
  if (!forzar && ult && Date.now() - ult < 5 * 60000) return;
  S.evCarga[clave] = Date.now();
  const desde = lu.toISOString(), hasta = sumar(lu, 7).toISOString();
  try {
    const listas = await Promise.all(calsVisibles().map(async id => {
      const r = await gjson(`${CAL}/calendars/${encodeURIComponent(id)}/events?singleEvents=true&orderBy=startTime&maxResults=500&timeMin=${encodeURIComponent(desde)}&timeMax=${encodeURIComponent(hasta)}`);
      return (r.items || []).filter(e => e.status !== 'cancelled').map(e => normalizar(e, id));
    }));
    S.ev[clave] = listas.flat().sort((a, b) => a.ini - b.ini);
    LS.set('ev:' + clave, S.ev[clave]);
    limpiarCacheEventos();
    render();
  } catch (e) { S.evCarga[clave] = 0; if (e.message !== 'auth') aviso('No pude leer la agenda: ' + e.message); }
}
const revivir = e => ({ ...e, ini: new Date(e.ini), fin: new Date(e.fin) });
function limpiarCacheEventos() {
  const lim = ymd(sumar(lunes(new Date()), -21));
  Object.keys(localStorage).filter(k => k.startsWith('mt:ev:') && k.slice(6) < lim).forEach(k => localStorage.removeItem(k));
}
// Eventos de Google + mi rutina. Si la rutina también está en Google (mismo nombre y
// hora parecida), se muestra una sola vez: la de Google.
const cargandoSemana = fecha => !DEMO && S.auth === 'ok' && !S.ev[ymd(lunes(deYmd(fecha)))];
function eventosDelDia(fecha) {
  const lista = S.ev[ymd(lunes(deYmd(fecha)))] || [];
  const d0 = deYmd(fecha), d1 = sumar(d0, 1);
  const g = lista.filter(e => e.ini < d1 && e.fin > d0 && !(e.todoDia && e.fin <= d0));
  if (cfg().verRutina === false) return g.sort((a, b) => a.ini - b.ini);
  // La rutina de la app manda: la copia que esté en Google (exportada o importada
  // del .ics) se oculta para no ver todo dos veces.
  const norm = s => s.toLowerCase().trim(), r = rutinaDelDia(fecha);
  const copia = e => e.ical?.startsWith('rut-') || r.some(x => norm(e.titulo).startsWith(norm(x.titulo).slice(0, 12)) && Math.abs(e.ini - x.ini) <= 90 * 60000);
  return [...g.filter(e => e.todoDia || !copia(e)), ...r].sort((a, b) => a.ini - b.ini);
}
function buscarEvento(id) {
  if (id.startsWith('r:')) { const [, f, rid] = id.split(':'); return rutinaDelDia(f).find(x => x.rid === rid) || null; }
  for (const k in S.ev) { const e = (S.ev[k] || []).find(x => x.id === id); if (e) return e; }
  return null;
}

function moverRutina(ev, ini, fin, todas) {
  const r = rec('rut:' + ev.rid), f0 = ymd(ev.ini), f1 = ymd(ini), h = hm(ini), hf = hm(fin);
  if (todas) {
    const cambio = { h, f: hf };
    if (r.fecha) cambio.fecha = f1;
    else if (r.dias.length > 1) {
      // la actividad se repite otros días: solo cambia este día de la semana
      cambiar('rut:' + ev.rid, { dias: r.dias.filter(x => x !== ev.ini.getDay()) });
      const { k, u, ...base } = r; poner('rut:' + uid(), { ...base, ...cambio, dias: [ini.getDay()] });
      const o = rec(`rutx:${f0}:${ev.rid}`); if (o && !o.extra) borrar(`rutx:${f0}:${ev.rid}`);
      return;
    }
    else if (f0 !== f1) cambio.dias = [ini.getDay()];
    cambiar('rut:' + ev.rid, cambio);
    const o = rec(`rutx:${f0}:${ev.rid}`); if (o && !o.extra) borrar(`rutx:${f0}:${ev.rid}`);
  } else if (f0 === f1) cambiar(`rutx:${f0}:${ev.rid}`, { h, f: hf, oculto: 0 });
  else { cambiar(`rutx:${f0}:${ev.rid}`, { oculto: 1 }); cambiar(`rutx:${f1}:${ev.rid}`, { extra: 1, oculto: 0, h, f: hf }); }
}

async function moverEvento(ev, ini, todaLaSerie) {
  const fin = new Date(ini.getTime() + (ev.fin - ev.ini));
  if (ev.rutina) return moverRutina(ev, ini, fin, todaLaSerie);
  if (DEMO) {
    const mov = LS.get('demoMov', {}); mov[ev.id] = { ini: ini.toISOString(), fin: fin.toISOString() }; LS.set('demoMov', mov);
    S.ev = {}; return;
  }
  if (todaLaSerie && ev.serie) {
    const delta = ini - ev.ini;
    const m = await gjson(`${CAL}/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.serie)}`);
    const corre = x => ({ dateTime: new Date(new Date(x.dateTime).getTime() + delta).toISOString(), timeZone: x.timeZone || TZ });
    await gjson(`${CAL}/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.serie)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: corre(m.start), end: corre(m.end) })
    });
  } else {
    await gjson(`${CAL}/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: { dateTime: ini.toISOString(), timeZone: TZ }, end: { dateTime: fin.toISOString(), timeZone: TZ } })
    });
  }
  S.evCarga = {}; S.ev = {};
}
async function crearEvento(calId, { titulo, ini, fin, desc, avisoMin }) {
  if (DEMO) {
    const n = LS.get('demoNew', []), id = 'n' + uid(); n.push({ id, titulo, ini: ini.toISOString(), fin: fin.toISOString(), desc }); LS.set('demoNew', n);
    S.ev = {}; return { id };
  }
  const creado = await gjson(`${CAL}/calendars/${encodeURIComponent(calId)}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: titulo, description: desc || undefined,
      start: { dateTime: ini.toISOString(), timeZone: TZ }, end: { dateTime: fin.toISOString(), timeZone: TZ },
      reminders: avisoMin >= 0 ? { useDefault: false, overrides: [{ method: 'popup', minutes: avisoMin }] } : { useDefault: true }
    })
  });
  S.evCarga = {}; S.ev = {};
  return creado;
}
async function borrarEvento(ev) {
  if (DEMO) { const b = LS.get('demoBorr', []); b.push(ev.id); LS.set('demoBorr', b); LS.set('demoNew', LS.get('demoNew', []).filter(x => x.id !== ev.id)); S.ev = {}; return; }
  await gfetch(`${CAL}/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
  S.evCarga = {}; S.ev = {};
}

/* Demo: un par de eventos de ejemplo como si fueran de Google (la rutina sale de la app) */
function semanaDemo(lu) {
  const mov = LS.get('demoMov', {}), borr = LS.get('demoBorr', []), out = [];
  const ej = ymd(sumar(lu, 1));
  out.push({ id: 'm1' + ej, calId: 'demo', titulo: 'Reunión con cliente (ejemplo)', desc: 'Evento de ejemplo del modo demo.', ini: conHora(ej, '10:00'), fin: conHora(ej, '11:00'), todoDia: false, link: '' });
  LS.get('demoNew', []).forEach(n => out.push({ ...n, calId: 'demo', ini: new Date(n.ini), fin: new Date(n.fin), todoDia: false, link: '' }));
  const fin7 = sumar(lu, 7);
  return out.filter(e => !borr.includes(e.id)).map(e => mov[e.id] ? { ...e, ini: new Date(mov[e.id].ini), fin: new Date(mov[e.id].fin) } : e)
    .filter(e => e.ini >= lu && e.ini < fin7).sort((a, b) => a.ini - b.ini);
}

/* ---------- Comidas: del calendario si las tiene, si no de la rutina base ---------- */
const RE_COMIDA = /^\s*(desayuno|almuerzo|merienda|cena)/i;
const nombreDe = (t, tipo) => {
  t = t.trim().replace(/\.$/, ''); const i = t.indexOf(':');
  if (i > 0 && i < 45) return t.slice(0, i);
  const conocida = tipo && (plan().opciones[tipo] || []).find(v => v.d && t.startsWith(v.d.slice(0, 30)));
  if (conocida) return conocida.n;
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  return t.length > 70 ? t.slice(0, 68) + '…' : t;
};
const restoDe = t => { const i = t.indexOf(':'); return i > 0 && i < 45 ? t.slice(i + 1).trim() : ''; };

function comidaDeEvento(e) {
  if (e.rutina) {
    const p = plan(), op = opcion(e.comida, e.plan);
    return {
      tipo: e.comida, hora: hm(e.ini), plan: e.plan, rid: e.rid, evId: e.id,
      detalle: [op?.d, p.cantidades[e.comida]].filter(Boolean).join('\n\n'),
      variantes: p.opciones[e.comida].filter(o => o.n !== e.plan)
    };
  }
  const VAR = plan().opciones;
  const tipo = e.titulo.match(RE_COMIDA)[1].toLowerCase();
  const desc = e.desc || '';
  const hoy = (desc.match(/HOY:\s*([\s\S]*?)(?:\n\s*\n|$)/) || [])[1]?.trim() || '';
  const vars = (desc.match(/VARIANTES:\s*([\s\S]*?)(?:\n\s*\n|$)/) || [])[1] || '';
  const cant = (desc.match(/(Cantidades:[\s\S]*)$/) || [])[1] || '';
  const tras = e.titulo.split(':').slice(1).join(':').trim();
  const enTexto = !tras && !hoy && (VAR[tipo] || []).find(v => desc.includes(v.n));
  let pl = tras ? nombreDe(tras) : hoy ? nombreDe(hoy, tipo) : enTexto ? enTexto.n : e.titulo.replace(/\+.*$/, '').trim();
  if (/cena libre/i.test(e.titulo)) pl = 'Cena libre';
  const detalle = [hoy && restoDe(hoy), cant].filter(Boolean).join('\n') || (hoy ? '' : desc.split(/\n\s*\n/)[0]);
  let variantes = vars ? vars.split('||').map(x => ({ n: nombreDe(x, tipo), d: restoDe(x) })).filter(x => x.n) : (VAR[tipo] || []).filter(x => x.n !== pl);
  const noLlegas = desc.match(/No llegás:\s*([^\n]+)/);
  if (noLlegas && !variantes.some(v => v.n === 'No llegás')) variantes = [...variantes, { n: 'No llegás', d: noLlegas[1] }];
  return { tipo, hora: hm(e.ini), plan: pl, detalle, variantes, evId: e.id };
}
function comidasDelDia(fecha) {
  const lista = eventosDelDia(fecha).filter(esComida).map(comidaDeEvento);
  const vistos = new Set();
  return lista.filter(c => !vistos.has(c.tipo) && vistos.add(c.tipo))
    .sort((a, b) => COMIDAS.findIndex(c => c[0] === a.tipo) - COMIDAS.findIndex(c => c[0] === b.tipo));
}
const regComida = (fecha, tipo) => rec(`meal:${fecha}:${tipo}`);
function marcarComida(fecha, c, estado, extra = {}) {
  const k = `meal:${fecha}:${c.tipo}`, ya = rec(k);
  if (ya && ya.estado === estado && !Object.keys(extra).length) { borrar(k); return; }
  poner(k, { ...(ya || {}), estado, plan: c.plan, hora: c.hora, ...extra });
}

/* ---------- Hábitos ---------- */
const habitos = () => todos('habit:').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
const regHab = (fecha, id) => rec(`hl:${fecha}:${id}`)?.v;
function ciclarHabito(fecha, id) {
  const k = `hl:${fecha}:${id}`, v = rec(k)?.v;
  if (v === undefined) poner(k, { v: 1 }); else if (v === 1) poner(k, { v: 0 }); else borrar(k);
}
function racha(h) {
  let n = 0, d = new Date();
  if (regHab(ymd(d), h.k.slice(6)) !== 1) d = sumar(d, -1);
  while (regHab(ymd(d), h.k.slice(6)) === 1) { n++; d = sumar(d, -1); }
  return n;
}

/* ---------- Tareas y recordatorios ----------
   tarea:<id> { texto, fecha, hora, hecha, hechaEn, aviso, evId, calId }
   El aviso es un evento en Google Calendar con alarma: así suena aunque la app esté cerrada. */
const tareas = () => todos('tarea:').sort((a, b) => ((a.fecha || '9') + (a.hora || '')).localeCompare((b.fecha || '9') + (b.hora || '')) || (a.creado || 0) - (b.creado || 0));
const tareasHoy = () => tareas().filter(t => t.hecha ? t.hechaEn === HOY() : !t.fecha || t.fecha <= HOY());
const tareasDespues = () => tareas().filter(t => !t.hecha && t.fecha > HOY());
function filaTarea(t) {
  const id = t.k.slice(6), vencida = !t.hecha && t.fecha && t.fecha < HOY();
  const cuando = [t.fecha && t.fecha !== HOY() ? fechaCorta(t.fecha) : '', t.hora || ''].filter(Boolean).join(' ');
  return `<div class="tarea ${t.hecha ? 'hecha' : ''}">
    <button class="tk" data-a="tildarTarea" data-id="${id}" aria-label="Hecha">${t.hecha ? '✓' : ''}</button>
    <button class="tt" data-a="editarTarea" data-id="${id}"><span>${esc(t.texto)}</span>${cuando || t.aviso ? `<small class="${vencida ? 'rojo' : ''}">${t.aviso ? '🔔 ' : ''}${cuando}${vencida ? ' · atrasada' : ''}</small>` : ''}</button>
  </div>`;
}
async function avisoTarea(t, id) {
  const ini = conHora(t.fecha, t.hora), fin = new Date(ini.getTime() + 15 * 60000);
  if (t.evId) { try { await borrarEvento({ id: t.evId, calId: t.calId }); } catch { } }
  const calId = calPorDefecto();
  const ev = await crearEvento(calId, { titulo: '🔔 ' + t.texto, ini, fin, desc: 'Recordatorio de Mi tracker', avisoMin: 0 });
  cambiar('tarea:' + id, { evId: ev?.id || null, calId });
}

/* ---------- Eventos: lo hice a horario / a otra hora / no ---------- */
const claveAct = ev => `act:${ymd(ev.ini)}:${ev.id}`;
const regAct = ev => rec(claveAct(ev));
const seRegistra = ev => !ev.todoDia && !esComida(ev);
function marcarAct(ev, estado, hora) {
  const k = claveAct(ev), ya = rec(k);
  if (ya && ya.estado === estado && estado !== 'otra') { borrar(k); return; }
  poner(k, { estado, hora: hora || null, plan: hm(ev.ini), titulo: ev.titulo });
}
const minutos = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
function pillAct(ev) {
  const r = regAct(ev); if (!r) return '';
  if (r.estado === 'ok') return '<em class="act ok">✓ Hecho</em>';
  if (r.estado === 'no') return '<em class="act no">✗ No</em>';
  const d = minutos(r.hora) - minutos(r.plan);
  return `<em class="act otra">🕒 ${r.hora}${d ? ` (${d > 0 ? '+' : '−'}${durTxt(Math.abs(d))})` : ''}</em>`;
}

/* ---------- Sincronización con Drive (appDataFolder) ---------- */
let syncTimer = null, syncCorriendo = false;
function syncPronto() { if (DEMO || S.auth !== 'ok') return; clearTimeout(syncTimer); syncTimer = setTimeout(sincronizar, 2500); }
async function sincronizar() {
  if (DEMO || S.auth !== 'ok' || syncCorriendo) return;
  syncCorriendo = true; S.sync = 'subiendo'; pintarEstado();
  try {
    let id = LS.get('fileId', null);
    if (!id) {
      const r = await gjson(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id)&q=${encodeURIComponent("name='tracker.json'")}`);
      id = r.files?.[0]?.id || null;
    }
    let remoto = { items: {} };
    if (id) {
      try { remoto = await (await gfetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json(); }
      catch (e) { if (e.message === 'auth') throw e; id = null; }
    }
    let localCambio = false, remotoCambio = !id;
    for (const k in remoto.items || {}) {
      const r = remoto.items[k], l = DB.items[k];
      if (!l || r.u > l.u) { DB.items[k] = r; localCambio = true; }
    }
    for (const k in DB.items) { const r = remoto.items?.[k]; if (!r || DB.items[k].u > r.u) { remotoCambio = true; break; } }
    if (localCambio) { LS.set('db', DB); render(); }
    if (remotoCambio) {
      const cuerpo = JSON.stringify(DB);
      if (id) {
        await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: cuerpo });
      } else {
        const b = 'mtb' + uid();
        const multi = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: 'tracker.json', parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${cuerpo}\r\n--${b}--`;
        const r = await gjson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multi });
        id = r.id;
      }
    }
    LS.set('fileId', id); S.sync = 'ok'; LS.set('ultSync', Date.now());
  } catch (e) { S.sync = e.message === 'auth' ? 'local' : 'error'; console.warn('sync', e); }
  syncCorriendo = false; pintarEstado();
}

/* ---------- Importar la rutina (.ics) a un calendario ---------- */
function parsearIcs(texto) {
  const lineas = texto.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const eventos = []; let ev = null, enAlarma = false;
  const fecha = v => {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/); if (!m) return null;
    if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}` };
    return m[7] ? { dateTime: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`, timeZone: TZ } : { dateTime: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`, timeZone: TZ };
  };
  const des = v => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  for (const l of lineas) {
    if (l === 'BEGIN:VEVENT') { ev = { recurrence: [], avisos: [] }; continue; }
    if (l === 'END:VEVENT') { if (ev) eventos.push(ev); ev = null; continue; }
    if (!ev) continue;
    if (l === 'BEGIN:VALARM') { enAlarma = true; continue; }
    if (l === 'END:VALARM') { enAlarma = false; continue; }
    const i = l.indexOf(':'); if (i < 0) continue;
    const nombre = l.slice(0, i).split(';')[0].toUpperCase(), valor = l.slice(i + 1);
    if (enAlarma) { if (nombre === 'TRIGGER') { const m = valor.match(/-?PT?(?:(\d+)H)?(?:(\d+)M)?/); if (m) ev.avisos.push((+m[1] || 0) * 60 + (+m[2] || 0)); } continue; }
    if (nombre === 'UID') ev.uid = valor;
    else if (nombre === 'SUMMARY') ev.titulo = des(valor);
    else if (nombre === 'DESCRIPTION') ev.desc = des(valor);
    else if (nombre === 'DTSTART') ev.ini = fecha(valor);
    else if (nombre === 'DTEND') ev.fin = fecha(valor);
    else if (nombre === 'RRULE' || nombre === 'EXDATE' || nombre === 'RDATE') ev.recurrence.push(l);
  }
  return eventos.filter(e => e.ini && e.titulo);
}
// Mi rutina en el mismo formato que parsearIcs, para mandarla a Google Calendar
// (así suenan los avisos del celu). Cada actividad queda como evento que se repite.
function rutinaComoEventos() {
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const iso = (f, h) => conHora(f, h).toISOString();
  return rutinas().filter(r => r.fecha ? r.fecha >= HOY() : r.dias?.length).map(r => {
    let f = r.fecha;
    if (!f) {
      for (let i = 0; i < 21 && !f; i++) {
        const d = ymd(sumar(hoy, i));
        if (r.dias.includes(deYmd(d).getDay()) && (!r.quin || paridad(d) === r.quin)) f = d;
      }
    }
    if (!f) return null;
    const fin = r.f > r.h ? iso(f, r.f) : sumar(conHora(f, r.f), 1).toISOString();
    const recurrence = r.fecha ? [] : [`RRULE:FREQ=WEEKLY;${r.quin ? 'INTERVAL=2;' : ''}BYDAY=${r.dias.map(d => BY[d]).join(',')}`];
    const titulo = r.comida && r.plan && /almuerzo|cena/.test(r.comida) ? `${r.t}: ${r.plan}` : r.t;
    const op = r.comida ? opcion(r.comida, r.plan) : null;
    const desc = r.comida ? [`HOY: ${r.plan}${op?.d ? ': ' + op.d : ''}`, plan().opciones[r.comida].filter(o => o.n !== r.plan).length ? 'VARIANTES: ' + plan().opciones[r.comida].filter(o => o.n !== r.plan).map(o => o.n + (o.d ? ': ' + o.d : '')).join(' || ') : '', plan().cantidades[r.comida] || ''].filter(Boolean).join('\n\n') : r.detalle;
    return { uid: `rut-${r.k.slice(4)}@mi-tracker`, titulo, desc, ini: { dateTime: iso(f, r.h), timeZone: TZ }, fin: { dateTime: fin, timeZone: TZ }, recurrence, avisos: [r.comida ? 10 : 30] };
  }).filter(Boolean);
}
const importarIcs = (texto, calId, progreso) => importarEventos(parsearIcs(texto), calId, progreso);
async function importarEventos(evs, calId, progreso) {
  let ok = 0, mal = 0, error = '';
  for (const e of evs) {
    const cuerpo = {
      iCalUID: e.uid || uid() + '@mi-tracker', summary: e.titulo, description: e.desc || undefined,
      start: e.ini, end: e.fin || e.ini, recurrence: e.recurrence.length ? e.recurrence : undefined,
      reminders: e.avisos.length ? { useDefault: false, overrides: e.avisos.slice(0, 5).map(m => ({ method: 'popup', minutes: m })) } : { useDefault: true }
    };
    try { await gjson(`${CAL}/calendars/${encodeURIComponent(calId)}/events/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }); ok++; }
    catch (err) { mal++; error = error || err.message; console.warn('import', e.titulo, err); if (err.message === 'auth') { error = 'se venció la sesión de Google, tocá Actualizar y cargala de nuevo'; break; } }
    progreso(ok + mal, evs.length);
  }
  S.evCarga = {}; S.ev = {};
  return { ok, mal, total: evs.length, error };
}

/* ====================================================================== */
/* ---------- Vistas ---------- */
const TABS = [['hoy', 'Hoy', 'M3 12l9-8 9 8M5 10v10h14V10'], ['agenda', 'Agenda', 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4'], ['habitos', 'Hábitos', 'M5 12l4 4L19 6'], ['comidas', 'Comidas', 'M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 8v10'], ['plata', 'Plata', 'M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6']];
const icono = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

function render() {
  const v = { hoy: vHoy, agenda: vAgenda, habitos: vHabitos, comidas: vComidas, plata: vPlata, ajustes: vAjustes, rutina: vRutina, plan: vPlan }[S.tab] || vHoy;
  $('#vista').innerHTML = bannerAuth() + v();
  $('#nav').innerHTML = TABS.map(([id, t, d]) => `<button class="${S.tab === id || (id === 'comidas' && S.tab === 'plan') || (id === 'agenda' && S.tab === 'rutina') ? 'on' : ''}" data-a="tab" data-t="${id}">${icono(d)}<span>${t}</span></button>`).join('');
  $('#titulo').textContent = { hoy: 'Hoy', agenda: 'Agenda', habitos: 'Hábitos', comidas: 'Comidas', plata: 'Plata', ajustes: 'Ajustes', rutina: 'Mi rutina', plan: 'Mi plan' }[S.tab];
  $('#fab').hidden = !['hoy', 'plata', 'agenda'].includes(S.tab);
  pintarEstado();
}
function pintarEstado() {
  const el = $('#estado'); if (!el) return;
  const pendiente = Object.values(DB.items).some(r => r.u > LS.get('ultSync', 0));
  const t = DEMO ? ['demo', 'Modo demo'] :
    S.auth === 'vencido' ? ['off', pendiente ? '↑ Subir a Drive' : '↻ Actualizar'] : S.auth !== 'ok' ? ['off', 'Sin conectar'] :
    S.sync === 'subiendo' ? ['sync', 'Guardando…'] : S.sync === 'error' ? ['err', 'No se pudo guardar en Drive'] : ['ok', 'Guardado en tu Drive'];
  el.className = 'estado ' + t[0]; el.title = t[1]; el.innerHTML = `<i></i><span>${t[1]}</span>`;
  if (S.auth === 'vencido') el.dataset.a = 'conectar'; else delete el.dataset.a;
}
function bannerAuth() {
  if (DEMO) return `<div class="banner demo">Modo demo: la agenda es tu rutina de ejemplo y nada sale de este navegador. Para conectar tu Google Calendar, seguí la guía y cargá el ID de cliente en <b>config.js</b>.</div>`;
  if (S.auth === 'no') return `<div class="banner"><div><b>Conectá tu Google</b><br>Para ver tu agenda y guardar todo en tu Drive. Los permisos los das vos, en tu cuenta.</div><button class="btn prim" data-a="conectar" data-p="1">Entrar con Google</button></div>`;
  return '';
}

/* --- Hoy --- */
function vHoy() {
  const f = HOY(); asegurarSemana(f);
  const ahora = new Date(), evs = eventosDelDia(f);
  const saludo = ahora.getHours() < 13 ? 'Buen día' : ahora.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';
  const prox = (evs || []).filter(e => !e.todoDia && e.fin > ahora).slice(0, 4);
  const mes = movsDelMes(f.slice(0, 7));
  const gHoy = mes.filter(m => m.fecha === f && m.tipo === 'gasto');
  const hab = habitos();
  const hechos = hab.filter(h => regHab(f, h.k.slice(6)) === 1).length;
  const com = comidasDelDia(f);
  const comOk = com.filter(c => regComida(f, c.tipo)).length;
  const pasados = (evs || []).filter(e => seRegistra(e) && e.ini <= ahora && !regAct(e));
  const sinDatos = !DEMO && !todos('rut:').length && !todos('plan:').length;
  return `
  <section class="hola"><h1>${saludo}</h1><p>${fechaLarga(f)}</p></section>
  ${sinDatos ? `<div class="banner"><div><b>Cargá tu rutina, tu plan y tus medidas</b><br>Elegí el archivo <i>mi-tracker-datos.json</i> que te dejó Claude en Descargas. Es una sola vez: después viaja solo por tu Drive al celu.</div><button class="btn prim" data-a="restaurar">Cargar archivo</button></div>` : ''}
  <div class="rapidos">
    <button data-a="nuevoMov" data-t="gasto"><span>💸</span>Gasto</button>
    <button data-a="nuevoMov" data-t="ingreso"><span>💰</span>Ingreso</button>
    <button data-a="nuevoEvento"><span>📅</span>Reunión</button>
    <button data-a="editarTarea"><span>✅</span>Tarea</button>
  </div>
  <section class="card">
    <header><h2>Lo que sigue</h2><button class="link" data-a="tab" data-t="agenda">Agenda →</button></header>
    ${prox.length ? prox.map((e, i) => filaEvento(e, i === 0)).join('') : (cargandoSemana(f) ? '<p class="vacio">Cargando agenda…</p>' : '<p class="vacio">No queda nada en la agenda de hoy.</p>')}
  </section>
  <section class="card">
    <header><h2>Tareas</h2><span class="cont">${tareasHoy().filter(t => t.hecha).length}/${tareasHoy().length}</span></header>
    <form class="tq" data-form="tareaRapida"><input id="tq" class="in" placeholder="Anotá algo para hacer y tocá Enter" autocomplete="off"><button type="button" class="btn" data-a="editarTarea" title="Con fecha, hora o aviso">🔔</button></form>
    ${tareasHoy().map(filaTarea).join('')}
    ${tareasDespues().length ? `<details class="ayuda"><summary>${tareasDespues().length} para más adelante</summary>${tareasDespues().map(filaTarea).join('')}</details>` : ''}
  </section>
  ${pasados.length ? `<section class="card">
    <header><h2>¿Cómo te fue?</h2><span class="cont">${pasados.length} sin marcar</span></header>
    ${pasados.map(e => `<div class="com">
      <button class="com-t" data-a="verEvento" data-id="${esc(e.id)}"><span class="e">🗓️</span><span><b>${esc(e.titulo)}</b><br><span class="sub">Planeado ${hm(e.ini)}</span></span></button>
      <div class="com-b">
        <button data-a="act" data-est="ok" data-id="${esc(e.id)}" title="Lo hice a horario">✓</button>
        <button data-a="verEvento" data-id="${esc(e.id)}" data-otra="1" title="Lo hice a otra hora">🕒</button>
        <button data-a="act" data-est="no" data-id="${esc(e.id)}" title="No lo hice">✗</button>
      </div></div>`).join('')}
  </section>` : ''}
  <section class="card">
    <header><h2>Hábitos de hoy</h2><span class="cont">${hechos}/${hab.length}</span></header>
    <div class="chips-hab">${hab.map(h => chipHabito(f, h)).join('')}<button class="hab nuevo" data-a="editarHabito">+ Hábito</button></div>
  </section>
  <section class="card">
    <header><h2>Comidas</h2><span class="cont">${comOk}/${com.length}</span></header>
    ${com.map(c => filaComida(f, c)).join('')}
  </section>
  <section class="card">
    <header><h2>Plata ${ojo()}</h2><button class="link" data-a="tab" data-t="plata">Ver mes →</button></header>
    <div class="dupla">
      <div><small>Gastaste hoy</small><b>${totalesTxt(gHoy)}</b></div>
      <div><small>Gastos de ${MESES[+f.slice(5, 7) - 1]}</small><b>${totalesTxt(mes.filter(m => m.tipo === 'gasto'))}</b></div>
    </div>
  </section>`;
}
function totalesTxt(movs) {
  const t = { ARS: 0, USD: 0 }; movs.forEach(m => t[m.moneda] += m.monto);
  const p = []; if (t.ARS || !t.USD) p.push(plata(t.ARS, 'ARS')); if (t.USD) p.push(plata(t.USD, 'USD'));
  return p.join(' + ');
}
function filaEvento(e, destacar) {
  const ahora = new Date(), enCurso = e.ini <= ahora && e.fin > ahora;
  const falta = e.ini > ahora ? Math.round((e.ini - ahora) / 60000) : 0;
  const cuando = enCurso ? 'Ahora' : falta && falta < 120 ? `En ${durTxt(falta)}` : '';
  return `<button class="ev ${destacar ? 'dest' : ''}" data-a="verEvento" data-id="${esc(e.id)}" style="--c:${e.color || '#6366f1'}">
    <span class="h">${e.todoDia ? 'Todo el día' : hm(e.ini)}</span><span class="t">${esc(e.titulo)}${cuando ? `<em>${cuando}</em>` : ''}</span></button>`;
}
function chipHabito(f, h) {
  const v = regHab(f, h.k.slice(6));
  const cls = v === 1 ? 'si' : v === 0 ? 'no' : '';
  return `<button class="hab ${cls}" data-a="habito" data-id="${h.k.slice(6)}" data-f="${f}"><span>${esc(h.emoji || '•')}</span>${esc(h.nombre)}<i>${v === 1 ? '✓' : v === 0 ? '✗' : ''}</i></button>`;
}
function filaComida(f, c) {
  const r = regComida(f, c.tipo), info = COMIDAS.find(x => x[0] === c.tipo);
  const est = r?.estado;
  const sub = est === 'cambio' ? '↺ ' + ([r.variante, r.nota].filter(Boolean).join(' · ') || 'Con cambios') : est === 'no' ? 'No la hice' + (r.nota ? ' · ' + r.nota : '') : c.plan;
  return `<div class="com ${est || ''}">
    <button class="com-t" data-a="verComida" data-f="${f}" data-tipo="${c.tipo}"><span class="e">${info[2]}</span><span><b>${info[1]}</b> <small>${c.hora}</small><br><span class="sub">${esc(sub)}</span></span></button>
    <div class="com-b">
      <button class="${est === 'ok' ? 'on' : ''}" data-a="comida" data-est="ok" data-f="${f}" data-tipo="${c.tipo}" title="La hice">✓</button>
      <button class="${est === 'cambio' ? 'on' : ''}" data-a="verComida" data-f="${f}" data-tipo="${c.tipo}" data-cambio="1" title="Comí otra cosa">↺</button>
      <button class="${est === 'no' ? 'on' : ''}" data-a="comida" data-est="no" data-f="${f}" data-tipo="${c.tipo}" title="No la hice">✗</button>
    </div></div>`;
}

/* --- Agenda --- */
function vAgenda() {
  asegurarSemana(S.dia);
  const lu = lunes(deYmd(S.dia)), evs = eventosDelDia(S.dia), sem = S.ev[ymd(lu)];
  const tira = [...Array(7)].map((_, i) => {
    const d = sumar(lu, i), f = ymd(d), n = eventosDelDia(f).length;
    return `<button class="${f === S.dia ? 'on' : ''} ${f === HOY() ? 'hoy' : ''}" data-a="dia" data-f="${f}"><small>${DC[d.getDay()]}</small><b>${d.getDate()}</b><i>${n ? '•' : ''}</i></button>`;
  }).join('');
  const ahora = new Date(); let marcado = false;
  const filas = (evs || []).map(e => {
    let linea = '';
    if (!marcado && S.dia === HOY() && e.ini > ahora) { marcado = true; linea = `<div class="ahora"><span>${hm(ahora)}</span></div>`; }
    return linea + `<button class="ag-ev" data-a="verEvento" data-id="${esc(e.id)}" style="--c:${e.color || '#6366f1'}">
      <span class="h">${e.todoDia ? 'Todo<br>el día' : `${hm(e.ini)}<br><small>${hm(e.fin)}</small>`}</span>
      <span class="t"><b>${esc(e.titulo)}</b>${pillAct(e)}${e.desc ? `<small>${esc(e.desc.split('\n')[0].replace(/^HOY:\s*/, '').slice(0, 90))}</small>` : ''}</span></button>`;
  }).join('');
  return `
  <div class="semana-nav">
    <button class="icon" data-a="semana" data-n="-7" aria-label="Semana anterior">‹</button>
    <b>${fechaLarga(S.dia)}</b>
    <button class="icon" data-a="semana" data-n="7" aria-label="Semana siguiente">›</button>
  </div>
  <div class="tira">${tira}</div>
  ${S.dia !== HOY() ? `<button class="link centro" data-a="dia" data-f="${HOY()}">Volver a hoy</button>` : ''}
  ${(() => { const ts = tareas().filter(t => t.fecha === S.dia); return ts.length ? `<section class="card"><header><h2>Tareas del día</h2></header>${ts.map(filaTarea).join('')}</section>` : ''; })()}
  <section class="agenda">${cargandoSemana(S.dia) ? '<p class="nota">Trayendo tu agenda de Google…</p>' : ''}${filas || '<p class="vacio">Día libre. Tocá + para agendar algo.</p>'}</section>
  <p class="nota"><span class="punto" style="background:#0d9488"></span> Mi rutina · <button class="link" data-a="tab" data-t="rutina">editar</button>
  ${!DEMO && S.auth === 'ok' ? `<br>Google: ${calsVisibles().map(id => esc(calInfo(id).summary)).join(', ')} · <button class="link" data-a="calendarios">cambiar</button>` : ''}</p>`;
}

/* --- Hábitos + pantalla --- */
function vHabitos() {
  const lu = deYmd(S.semHab), dias = [...Array(7)].map((_, i) => ymd(sumar(lu, i))), hab = habitos();
  const fin = sumar(lu, 6);
  const titulo = `${lu.getDate()}/${lu.getMonth() + 1} al ${fin.getDate()}/${fin.getMonth() + 1}`;
  const filas = hab.map(h => {
    const id = h.k.slice(6), si = dias.filter(f => regHab(f, id) === 1).length, r = racha(h);
    return `<div class="hg-fila">
      <button class="hg-n" data-a="editarHabito" data-id="${id}"><span>${esc(h.emoji || '•')}</span><span><b>${esc(h.nombre)}</b><small>${h.tipo === 'dejar' ? 'Dejar' : 'Hacer'} · ${si}/7${r > 1 ? ` · 🔥 ${r} días` : ''}</small></span><i class="lapiz" title="Editar o borrar">✎</i></button>
      <div class="hg-d">${dias.map(f => { const v = regHab(f, id); return `<button class="${v === 1 ? 'si' : v === 0 ? 'no' : ''} ${f > HOY() ? 'fut' : ''}" data-a="habito" data-id="${id}" data-f="${f}">${v === 1 ? '✓' : v === 0 ? '✗' : ''}</button>`; }).join('')}</div>
    </div>`;
  }).join('');
  const totalSi = hab.reduce((a, h) => a + dias.filter(f => regHab(f, h.k.slice(6)) === 1).length, 0);
  const posibles = hab.length * dias.filter(f => f <= HOY()).length;
  return `
  <div class="semana-nav">
    <button class="icon" data-a="semHab" data-n="-7">‹</button><b>Semana del ${titulo}</b><button class="icon" data-a="semHab" data-n="7">›</button>
  </div>
  <section class="card">
    <header><h2>Esta semana</h2><span class="cont">${posibles ? Math.round(totalSi / posibles * 100) : 0}% cumplido</span></header>
    <div class="hg-cab"><span></span><div class="hg-d">${dias.map(f => `<small class="${f === HOY() ? 'hoy' : ''}">${DC[deYmd(f).getDay()][0]}<br>${deYmd(f).getDate()}</small>`).join('')}</div></div>
    ${filas || '<p class="vacio">Sumá tu primer hábito.</p>'}
    <p class="nota">Tocá un día: ✓ lo cumpliste, otra vez ✗ no, otra vez lo borra. En "dejar" (como no fumar), ✓ es un día sin hacerlo. Para cambiar el nombre o borrar un hábito, tocá el ✎.</p>
    <button class="btn ancho" data-a="editarHabito">+ Nuevo hábito</button>
  </section>
  ${vRutinaSemana(dias)}
  ${vPantalla(lu)}`;
}
function vRutinaSemana(dias) {
  const g = {};
  dias.forEach(f => todos(`act:${f}:`).forEach(r => {
    const n = r.titulo.replace(/\s*\(.*\)$/, '').trim();
    const x = g[n] = g[n] || { ok: 0, otra: 0, no: 0, dif: [] };
    x[r.estado]++; if (r.estado === 'otra') x.dif.push(minutos(r.hora) - minutos(r.plan));
  }));
  const filas = Object.entries(g).sort((a, b) => (b[1].ok + b[1].otra + b[1].no) - (a[1].ok + a[1].otra + a[1].no));
  return `<section class="card">
    <header><h2>Rutina de la semana</h2></header>
    ${filas.length ? filas.map(([n, x]) => {
      const tot = x.ok + x.otra + x.no, prom = x.dif.length ? Math.round(x.dif.reduce((a, b) => a + b, 0) / x.dif.length) : 0;
      return `<div class="rut"><b>${esc(n)}</b><span>${x.ok + x.otra} de ${tot} hechas${x.otra ? ` · ${x.otra} a otra hora${prom ? ` (${prom > 0 ? '+' : '−'}${durTxt(Math.abs(prom))} en promedio)` : ''}` : ''}${x.no ? ` · ${x.no} no` : ''}</span></div>`;
    }).join('') : '<p class="vacio">Todavía no marcaste eventos esta semana. Tocá un evento de la agenda (ej: Gym) y poné ✓, 🕒 otra hora o ✗.</p>'}
  </section>`;
}
function vPantalla(lu) {
  const dias = [...Array(7)].map((_, i) => ymd(sumar(lu, i)));
  const ant = dias.map(f => ymd(sumar(deYmd(f), -7)));
  const sumaApps = fs => { const t = {}; fs.forEach(f => (rec('pant:' + f)?.apps || []).forEach(a => t[a.n] = (t[a.n] || 0) + a.min)); return t; };
  const t = sumaApps(dias), tAnt = sumaApps(ant);
  const total = Object.values(t).reduce((a, b) => a + b, 0), totAnt = Object.values(tAnt).reduce((a, b) => a + b, 0);
  const cargados = dias.filter(f => rec('pant:' + f)).length;
  const orden = Object.entries(t).sort((a, b) => b[1] - a[1]), max = orden[0]?.[1] || 1;
  const dif = totAnt ? Math.round((total - totAnt) / totAnt * 100) : null;
  const porDia = dias.map(f => (rec('pant:' + f)?.apps || []).reduce((a, x) => a + x.min, 0)), maxD = Math.max(...porDia, 1);
  return `
  <section class="card">
    <header><h2>Tiempo en pantalla</h2><button class="link" data-a="nuevaPantalla">+ Cargar</button></header>
    ${total ? `
    <div class="dupla"><div><small>Total de la semana</small><b>${durTxt(total)}</b></div><div><small>Promedio por día cargado</small><b>${durTxt(total / Math.max(cargados, 1))}</b></div></div>
    ${dif !== null ? `<p class="frase ${dif > 0 ? 'mal' : 'bien'}">${dif > 0 ? `Subió ${dif}%` : `Bajó ${-dif}%`} contra la semana anterior.</p>` : ''}
    <div class="barras-d">${porDia.map((m, i) => `<button data-a="nuevaPantalla" data-f="${dias[i]}"><i style="height:${Math.round(m / maxD * 100)}%"></i><small>${DC[deYmd(dias[i]).getDay()][0]}</small></button>`).join('')}</div>
    ${orden.map(([n, m]) => `<div class="barra"><span>${esc(n)}</span><div><i style="width:${m / max * 100}%"></i></div><b>${durTxt(m)}</b></div>`).join('')}`
    : `<p class="vacio">Sin datos esta semana.</p>`}
    <details class="ayuda"><summary>¿Por qué lo cargo a mano?</summary>
      <p>Ni el iPhone ni Android dejan que una página web lea el tiempo de pantalla: es un dato que solo ven las apps del sistema. Lo más rápido es mirar <b>Ajustes → Tiempo en pantalla</b> (iPhone) o <b>Bienestar digital</b> (Android) y pasar las 3 o 4 apps que más usaste. Lleva 30 segundos y con eso te armo el resumen de la semana.</p></details>
  </section>`;
}

/* --- Comidas --- */
function vComidas() {
  asegurarSemana(S.dia);
  const f = S.dia, com = comidasDelDia(f), c = cfg();
  const it = rec('int:' + f)?.g || {};
  return `
  <div class="semana-nav">
    <button class="icon" data-a="diaMas" data-n="-1">‹</button><b>${f === HOY() ? 'Hoy, ' : ''}${fechaLarga(f)}</b><button class="icon" data-a="diaMas" data-n="1">›</button>
  </div>
  <div class="atajos"><button data-a="tab" data-t="plan">🥗 Mi plan y opciones</button><button data-a="tab" data-t="rutina">🗓️ Mi rutina</button></div>
  <section class="card">${com.map(x => filaComida(f, x)).join('') || '<p class="vacio">No hay comidas en la rutina de este día. Agregalas en Mi rutina.</p>'}</section>
  <details class="card plegable" ${Object.keys(metas()).length || Object.keys(it).length ? 'open' : ''}>
    <summary><h2>Porciones del día</h2><small>Opcional</small></summary>
    <p class="nota">La nutri te dio una cantidad de porciones por grupo para cumplir en el día ("intercambios"). Por ejemplo, 1 huevo = 1 porción de carnes; un scoop o una milanesa = 3. Si querés controlarlo, sumá acá lo que vas comiendo. Si con marcar las comidas te alcanza, ignorá esta parte.</p>
    <button class="link" data-a="metas">Cargar cuántas porciones te tocan por día</button>
    <div class="inter">${GRUPOS.map(([g, n]) => {
      const v = it[g] || 0, m = metas()[g];
      return `<div class="${m && v >= m ? 'listo' : ''}"><span>${n}</span><div><button data-a="inter" data-g="${g}" data-n="-1">−</button><b>${v}${m ? `<small>/${m}</small>` : ''}</b><button data-a="inter" data-g="${g}" data-n="1">+</button></div></div>`;
    }).join('')}</div>
  </details>
  <section class="card">
    <header><h2>Para la nutri</h2></header>
    <div class="seg">${[['esta', 'Esta semana'], ['pasada', 'Anterior'], ['14', '14 días'], ['30', '30 días']].map(([k, t]) => `<button class="${S.rango === k ? 'on' : ''}" data-a="rango" data-r="${k}">${t}</button>`).join('')}</div>
    ${resumenNutri()}
    <div class="fila-b"><button class="btn prim" data-a="compartirNutri">Compartir</button><button class="btn" data-a="imprimirNutri">Imprimir / PDF</button></div>
  </section>
  <section class="card">
    <header><h2>Tu cuerpo</h2><button class="link" data-a="nuevaMedida">+ Cargar medición</button></header>
    ${vObjetivo()}
    ${tablaMedidas()}
  </section>`;
}
function vObjetivo() {
  const o = rec('obj:main'), m = todos('med:').sort((a, b) => a.k < b.k ? -1 : 1);
  if (!o && !m.length) return '';
  const pri = m[0], ult = m[m.length - 1], num = v => decimal(v);
  const dif = (k, u) => pri && ult && pri !== ult && num(pri[k]) != null && num(ult[k]) != null ? ` <small class="${num(ult[k]) - num(pri[k]) <= 0 ? 'verde' : 'rojo'}">${num(ult[k]) - num(pri[k]) > 0 ? '+' : '−'}${fmt(Math.abs(num(ult[k]) - num(pri[k])))} ${u}</small>` : '';
  const falta = o?.pesoObj && ult?.peso ? num(ult.peso) - num(o.pesoObj) : null;
  return `<div class="cuerpo">
    ${ult ? `<div><small>Peso</small><b>${fmt(num(ult.peso))} kg${dif('peso', 'kg')}</b></div>
    <div><small>% grasa</small><b>${ult.grasa != null ? fmt(num(ult.grasa)) + '%' : '–'}${dif('grasa', '%')}</b></div>
    <div><small>Músculo</small><b>${ult.musculo != null ? fmt(num(ult.musculo)) + ' kg' : '–'}${dif('musculo', 'kg')}</b></div>` : ''}
    ${o?.pesoObj ? `<div><small>Objetivo</small><b>${fmt(num(o.pesoObj))} kg</b>${falta != null ? `<small>${falta > 0 ? `faltan ${fmt(falta)} kg` : '¡llegaste!'}</small>` : ''}</div>` : ''}
  </div>
  ${o?.nota || o?.kcal ? `<p class="nota">${o.kcal ? `Plan de ${fmt(o.kcal)} kcal por día${o.gasto ? ` (gastás unas ${fmt(o.gasto)})` : ''}. ` : ''}${esc(o.nota || '')}</p>` : ''}`;
}
function diasRango() {
  const hoy = new Date(); let ini, fin;
  if (S.rango === 'esta') { ini = lunes(hoy); fin = hoy; }
  else if (S.rango === 'pasada') { ini = sumar(lunes(hoy), -7); fin = sumar(lunes(hoy), -1); }
  else { fin = hoy; ini = sumar(hoy, -(+S.rango) + 1); }
  const out = []; for (let d = new Date(ini); ymd(d) <= ymd(fin); d = sumar(d, 1)) out.push(ymd(d));
  return out;
}
function datosNutri() {
  const dias = diasRango(); let ok = 0, cambio = 0, no = 0, sin = 0;
  const detalle = dias.map(f => {
    const pl = comidasPlaneadas(f);
    const tipos = new Set([...pl.map(c => c.tipo), ...COMIDAS.map(c => c[0]).filter(t => regComida(f, t))]);
    const filas = COMIDAS.filter(c => tipos.has(c[0])).map(([t, n]) => {
      const r = regComida(f, t), p = pl.find(x => x.tipo === t);
      if (!r) sin++; else if (r.estado === 'ok') ok++; else if (r.estado === 'cambio') cambio++; else no++;
      return { n, plan: r?.plan || p?.plan || '', r };
    });
    return { f, filas, int: rec('int:' + f)?.g };
  });
  const total = ok + cambio + no;
  return { dias, detalle, ok, cambio, no, sin, total };
}
const comidasPlaneadas = f => comidasDelDia(f);
function resumenNutri() {
  const d = datosNutri();
  if (!d.total) return '<p class="vacio">Todavía no marcaste comidas en este período.</p>';
  const pct = Math.round(d.ok / d.total * 100);
  return `
  <div class="trio"><div class="ok"><b>${d.ok}</b><small>Como estaba</small></div><div class="cambio"><b>${d.cambio}</b><small>Con cambios</small></div><div class="no"><b>${d.no}</b><small>No la hice</small></div></div>
  <p class="frase">${pct}% de las comidas marcadas fueron como estaban planeadas${d.sin ? ` · ${d.sin} sin marcar` : ''}.</p>
  <div class="nutri-lista">${d.detalle.filter(x => x.filas.some(y => y.r) || x.int).map(x => `
    <div><b>${fechaCorta(x.f)}</b>${x.filas.filter(y => y.r && y.r.estado !== 'ok').map(y => `<p class="${y.r.estado}">${y.n}: ${y.r.estado === 'no' ? 'no la hice' : esc(y.r.variante || 'cambié')}${y.r.nota ? ' · ' + esc(y.r.nota) : ''}<small>Plan: ${esc(y.plan)}</small></p>`).join('') || '<p class="ok">Todo como estaba</p>'}</div>`).join('')}
  </div>`;
}
function textoNutri() {
  const d = datosNutri(), c = cfg();
  const l = [`Registro de comidas · ${fechaCorta(d.dias[0])} al ${fechaCorta(d.dias[d.dias.length - 1])}`, ''];
  l.push(`Como estaba planeado: ${d.ok} · Con cambios: ${d.cambio} · No la hice: ${d.no}${d.sin ? ' · Sin marcar: ' + d.sin : ''}`, '');
  d.detalle.forEach(x => {
    if (!x.filas.some(y => y.r) && !x.int) return;
    l.push(fechaLarga(x.f).replace(/^./, m => m.toUpperCase()));
    x.filas.forEach(y => {
      if (!y.r) { l.push(`  ${y.n}: sin marcar (plan: ${y.plan})`); return; }
      if (y.r.estado === 'ok') l.push(`  ${y.n}: ✓ ${y.plan}`);
      else if (y.r.estado === 'no') l.push(`  ${y.n}: ✗ no la hice${y.r.nota ? ' (' + y.r.nota + ')' : ''}`);
      else l.push(`  ${y.n}: ↺ ${y.r.variante || ''}${y.r.nota ? (y.r.variante ? ' · ' : '') + y.r.nota : ''} (plan: ${y.plan})`);
    });
    if (x.int) l.push('  Porciones (intercambios): ' + GRUPOS.filter(([g]) => x.int[g]).map(([g, n]) => `${n} ${x.int[g]}${metas()[g] ? "/" + metas()[g] : ''}`).join(', '));
    l.push('');
  });
  const med = todos('med:').sort((a, b) => a.k < b.k ? 1 : -1).slice(0, 3);
  if (med.length) { l.push('Medidas:'); const v = x => fmt(decimal(x)); med.forEach(m => l.push(`  ${fechaCorta(m.k.slice(4))}: ${[m.peso != null && v(m.peso) + ' kg', m.grasa != null && v(m.grasa) + '% grasa', m.musculo != null && v(m.musculo) + ' kg músculo', m.cintura != null && v(m.cintura) + ' cm cintura', m.pliegues != null && v(m.pliegues) + ' mm (6 pliegues)'].filter(Boolean).join(' · ')}`)); }
  return l.join('\n');
}
function tablaMedidas() {
  const m = todos('med:').sort((a, b) => a.k < b.k ? 1 : -1);
  if (!m.length) return '<p class="vacio">Cargá peso, % de grasa o cintura cuando te midas. Sirve para ver la evolución con la nutri.</p>';
  const v = x => x == null || x === '' ? '–' : fmt(decimal(x));
  const conDetalle = m.find(x => x.detalle);
  return `<table class="tabla"><tr><th>Fecha</th><th>Peso</th><th>% grasa</th><th>Músculo</th><th>Cintura</th><th>Σ pliegues</th></tr>${m.slice(0, 8).map(x => `<tr data-a="nuevaMedida" data-f="${x.k.slice(4)}"><td>${fechaCorta(x.k.slice(4))}</td><td>${v(x.peso)}</td><td>${v(x.grasa)}</td><td>${v(x.musculo)}</td><td>${v(x.cintura)}</td><td>${v(x.pliegues)}</td></tr>`).join('')}</table>
  ${conDetalle ? `<details class="ayuda"><summary>Ver el informe completo del ${fechaCorta(conDetalle.k.slice(4))}${conDetalle.nota ? ' · ' + esc(conDetalle.nota) : ''}</summary>
    ${Object.entries(conDetalle.detalle).map(([grupo, vals]) => `<h4 class="det-t">${esc(grupo)}</h4><div class="det">${Object.entries(vals).map(([k, x]) => `<span>${esc(k)}</span><b>${esc(typeof x === 'number' ? fmt(x) : x)}</b>`).join('')}</div>`).join('')}</details>` : ''}`;
}

/* --- Mi rutina --- */
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
function frecuenciaTxt(r) {
  if (r.fecha) return 'solo el ' + fechaCorta(r.fecha);
  if (!r.quin) return '';
  const lu = lunes(new Date()), esta = paridad(ymd(lu)) === r.quin;
  return esta ? 'semana por medio (esta sí)' : 'semana por medio (la próxima)';
}
function vRutina() {
  const rs = rutinas();
  const porDia = d => rs.filter(r => !r.fecha && r.dias?.includes(d));
  const filaR = r => `<button class="rut-it" data-a="editarRut" data-id="${r.k.slice(4)}">
    <span class="h">${r.h}<br><small>${r.f}</small></span>
    <span class="t"><b>${r.comida ? COMIDAS.find(c => c[0] === r.comida)[2] + ' ' : ''}${esc(r.t)}</b>${r.comida && r.plan ? `<small>${esc(r.plan)}</small>` : r.detalle ? `<small>${esc(r.detalle.slice(0, 70))}</small>` : ''}${frecuenciaTxt(r) ? `<em class="act otra">${frecuenciaTxt(r)}</em>` : ''}</span></button>`;
  const sueltos = rs.filter(r => r.fecha && r.fecha >= HOY());
  return `
  <p class="nota">Tu semana tipo. Lo que cambies acá vale para todas las semanas; para cambiar un solo día, tocá el evento en la Agenda.</p>
  ${ORDEN_DIAS.map(d => `<section class="card">
    <header><h2>${DIAS[d].replace(/^./, x => x.toUpperCase())}</h2><button class="link" data-a="editarRut" data-dia="${d}">+ Agregar</button></header>
    ${porDia(d).map(filaR).join('') || '<p class="vacio">Nada todavía.</p>'}
  </section>`).join('')}
  ${sueltos.length ? `<section class="card"><header><h2>Solo una vez</h2></header>${sueltos.map(filaR).join('')}</section>` : ''}
  <section class="card">
    <header><h2>Avisos en el celu</h2></header>
    <p class="nota">Si querés que el celu te avise antes de cada cosa, pasá la rutina a tu Google Calendar. Si la cambiás, volvé a tocar el botón y se actualiza.</p>
    <button class="btn" data-a="exportarRutina" ${DEMO || S.auth !== 'ok' ? 'disabled' : ''}>Pasar mi rutina a Google Calendar</button>
  </section>`;
}

/* --- Mi plan de comidas --- */
function vPlan() {
  const p = plan(), o = rec('obj:main');
  const usos = n => rutinas().filter(r => r.plan === n).map(r => r.dias ? r.dias.map(d => DC[d]).join(' ') : '').join(' · ');
  return `
  <section class="card">
    <header><h2>${esc(p.nombre || 'Mi plan')}</h2>${p.desde ? `<span class="cont">desde ${fechaCorta(p.desde)}</span>` : ''}</header>
    ${o?.kcal ? `<p class="nota">${fmt(o.kcal)} kcal por día${p.profesional ? ' · ' + esc(p.profesional) : ''}.</p>` : ''}
    ${p.notas ? `<div class="desc">${esc(p.notas)}</div>` : ''}
    <div class="fila-b"><button class="btn prim" data-a="cargarPlan">Cargar plan nuevo</button><button class="btn" data-a="metas">Porciones por día</button></div>
    <p class="nota">¿La nutri te cambió el plan? Pasale el PDF a Claude y te arma el archivo. Al cargarlo, las comidas de tu rutina se reacomodan solas con las opciones nuevas.</p>
  </section>
  ${COMIDAS.map(([t, n, e]) => `<section class="card">
    <header><h2>${e} ${n}</h2><button class="link" data-a="editarOpcion" data-tipo="${t}">+ Opción</button></header>
    ${p.opciones[t].map((op, i) => `<button class="op" data-a="editarOpcion" data-tipo="${t}" data-i="${i}"><b>${esc(op.n)}</b>${op.d ? `<small>${esc(op.d)}</small>` : ''}${usos(op.n) ? `<em class="act ok">${usos(op.n)}</em>` : ''}</button>`).join('') || '<p class="vacio">Sin opciones cargadas.</p>'}
    ${t === 'almuerzo' || t === 'cena' ? `<label class="campo"><span>Cantidades</span><textarea class="in" rows="3" data-cant="${t}" placeholder="Ej: 1 mano de carne + 2/3 taza de arroz…">${esc(p.cantidades[t] || '')}</textarea></label>` : ''}
  </section>`).join('')}`;
}

/* --- Plata --- */
const movs = () => todos('mov:');
const movsDelMes = mes => movs().filter(m => m.fecha.startsWith(mes));
function vPlata() {
  const [a, m] = S.mes.split('-').map(Number), lista = movsDelMes(S.mes), c = cfg();
  const suma = (tipo, mon) => lista.filter(x => x.tipo === tipo && x.moneda === mon).reduce((s, x) => s + x.monto, 0);
  const tarjeta = mon => {
    const i = suma('ingreso', mon), g = suma('gasto', mon), inv = suma('inversion', mon);
    if (!i && !g && !inv && mon === 'USD') return '';
    return `<div class="saldo"><small>${mon === 'USD' ? 'Dólares' : 'Pesos'}</small>
      <div class="s3"><div><span>Entró</span><b class="verde">${plata(i, mon)}</b></div><div><span>Gastaste</span><b class="rojo">${plata(g, mon)}</b></div><div><span>Invertiste</span><b>${plata(inv, mon)}</b></div></div>
      <p>Te quedan <b>${plata(i - g - inv, mon)}</b> del mes</p></div>`;
  };
  const gastos = lista.filter(x => x.tipo === 'gasto');
  const enPesos = x => x.moneda === 'USD' ? x.monto * (c.dolar || 0) : x.monto;
  const porCat = {}; gastos.forEach(x => porCat[x.cat] = (porCat[x.cat] || 0) + (x.moneda === 'USD' && !c.dolar ? 0 : enPesos(x)));
  const cats = Object.entries(porCat).filter(x => x[1]).sort((a, b) => b[1] - a[1]), max = cats[0]?.[1] || 1, totCat = cats.reduce((s, x) => s + x[1], 0);
  const filtrada = lista.filter(x => S.filtroMov === 'todo' || x.tipo === S.filtroMov).sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
  const porDia = {}; filtrada.forEach(x => (porDia[x.fecha] = porDia[x.fecha] || []).push(x));
  return `
  <div class="semana-nav"><button class="icon" data-a="mes" data-n="-1">‹</button><b>${MESES[m - 1].replace(/^./, x => x.toUpperCase())} ${a} ${ojo()}</b><button class="icon" data-a="mes" data-n="1">›</button></div>
  ${tarjeta('ARS')}${tarjeta('USD')}
  <section class="card">
    <header><h2>Gastos por categoría</h2>${gastos.some(x => x.moneda === 'USD') && !c.dolar ? '<button class="link" data-a="ajustes">Cargar dólar</button>' : ''}</header>
    ${cats.length ? cats.map(([n, v]) => `<div class="barra"><span>${esc(n)}</span><div><i style="width:${v / max * 100}%"></i></div><b>${plata(v, 'ARS')}<small>${Math.round(v / totCat * 100)}%</small></b></div>`).join('') : '<p class="vacio">Sin gastos este mes.</p>'}
    ${gastos.some(x => x.moneda === 'USD') && c.dolar ? `<p class="nota">Los gastos en dólares se pasan a pesos a $ ${c.dolar.toLocaleString('es-AR')}.</p>` : ''}
  </section>
  <section class="card">
    <header><h2>Movimientos</h2></header>
    <div class="seg">${[['todo', 'Todo'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['inversion', 'Inversiones']].map(([k, t]) => `<button class="${S.filtroMov === k ? 'on' : ''}" data-a="filtroMov" data-k="${k}">${t}</button>`).join('')}</div>
    ${Object.keys(porDia).length ? Object.entries(porDia).map(([f, xs]) => `<div class="mov-dia"><small>${fechaCorta(f)}</small>${xs.map(x => `
      <button class="mov" data-a="nuevoMov" data-id="${x.k.slice(4)}"><span class="c">${esc(x.cat.split(' ')[0])}</span><span class="t">${x.nota ? `${esc(x.nota)}<small>${esc(x.cat.split(' ').slice(1).join(' '))}</small>` : esc(x.cat.split(' ').slice(1).join(' '))}</span><b class="${x.tipo === 'ingreso' ? 'verde' : x.tipo === 'gasto' ? '' : 'azul'}">${x.tipo === 'gasto' ? '−' : x.tipo === 'ingreso' ? '+' : '→'} ${plata(x.monto, x.moneda)}</b></button>`).join('')}</div>`).join('') : '<p class="vacio">Nada cargado. Tocá + para sumar el primero.</p>'}
  </section>`;
}

/* --- Ajustes --- */
function vAjustes() {
  const c = cfg(), ult = LS.get('ultSync', 0);
  return `
  <section class="card">
    <header><h2>Cuenta de Google</h2></header>
    ${DEMO ? '<p>Modo demo. Para conectar tu cuenta, cargá el ID de cliente en config.js (ver GUIA.md).</p>' :
      S.auth === 'ok' ? `<p>Conectado${LS.get('email') ? ' como <b>' + esc(LS.get('email')) + '</b>' : ''}.${ult ? ` Último guardado en Drive: ${new Date(ult).toLocaleString('es-AR')}.` : ''}</p>
      <div class="fila-b"><button class="btn" data-a="calendarios">Elegir calendarios</button><button class="btn" data-a="syncYa">Sincronizar ahora</button><button class="btn" data-a="desconectar">Desconectar</button></div>`
      : `<button class="btn prim" data-a="conectar" data-p="1">Entrar con Google</button>`}
  </section>
  <section class="card">
    <header><h2>Rutina y plan</h2></header>
    <div class="fila-b"><button class="btn" data-a="tab" data-t="rutina">🗓️ Mi rutina</button><button class="btn" data-a="tab" data-t="plan">🥗 Mi plan</button></div>
    <label class="campo chk"><input type="checkbox" data-a="verRutina" ${c.verRutina === false ? '' : 'checked'}> Mostrar mi rutina en la agenda</label>
    <p class="nota">¿Tenés un .ics de otra persona o una versión vieja? Lo podés cargar directo a Google Calendar.</p>
    <button class="btn" data-a="importar" ${DEMO || S.auth !== 'ok' ? 'disabled' : ''}>Cargar un archivo .ics a Google</button>
  </section>
  <section class="card">
    <header><h2>Plata</h2></header>
    <label class="campo"><span>Dólar para convertir (pesos por US$)</span><input type="text" inputmode="decimal" id="aj-dolar" value="${c.dolar || ''}" placeholder="Ej: 1450"></label>
    ${['gasto', 'ingreso', 'inversion'].map(t => `<label class="campo"><span>Categorías de ${t === 'gasto' ? 'gastos' : t === 'ingreso' ? 'ingresos' : 'inversiones'} (una por renglón)</span><textarea id="aj-cat-${t}" rows="4">${esc(c.cats[t].join('\n'))}</textarea></label>`).join('')}
    <button class="btn prim" data-a="guardarAjustes">Guardar</button>
  </section>
  <section class="card">
    <header><h2>Datos</h2></header>
    <p class="nota">"Cargar archivo" sirve para el archivo de datos que te armó Claude (rutina, plan y medidas) o para una copia que descargaste antes. Suma lo que trae sin borrar lo tuyo.</p>
    <div class="fila-b"><button class="btn" data-a="exportar">Descargar copia (.json)</button><button class="btn" data-a="restaurar">Cargar archivo</button></div>
  </section>`;
}

/* ====================================================================== */
/* ---------- Hojas (formularios) ---------- */
let hojaN = 0;
function hoja(html, onAbrir) {
  const o = $('#hoja'); hojaN++;
  o.innerHTML = `<div class="fondo" data-a="cerrar"></div><div class="panel" role="dialog"><div class="agarre"></div>${html}</div>`;
  o.hidden = false; requestAnimationFrame(() => o.classList.add('abierta'));
  onAbrir?.(o);
}
function cerrar() {
  const o = $('#hoja'), n = hojaN; o.classList.remove('abierta');
  setTimeout(() => { if (n === hojaN) { o.hidden = true; o.innerHTML = ''; } }, 200);
}

let avisoT = null;
function aviso(t) { const a = $('#aviso'); a.textContent = t; a.classList.add('ver'); clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove('ver'), 3200); }

function hojaMov(tipo, id) {
  const ya = id ? rec('mov:' + id) : null;
  tipo = ya?.tipo || tipo || 'gasto';
  const c = cfg(), uso = LS.get('catUso', {});
  const mon = ya?.moneda || LS.get('ultMoneda:' + tipo, 'ARS');
  const cats = [...c.cats[tipo]].sort((a, b) => (uso[b] || 0) - (uso[a] || 0));
  const sel = ya?.cat || cats[0];
  hoja(`
    <div class="seg tipo">${[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['inversion', 'Inversión']].map(([k, t]) => `<button class="${k === tipo ? 'on' : ''}" data-a="cambiaTipoMov" data-t="${k}" ${id ? 'disabled' : ''}>${t}</button>`).join('')}</div>
    <div class="monto"><button class="mon" data-a="moneda" data-m="${mon}">${mon === 'USD' ? 'US$' : '$'}</button><input id="mv-monto" type="text" inputmode="decimal" placeholder="0" value="${ya ? String(ya.monto).replace('.', ',') : ''}" autocomplete="off"></div>
    <div class="cats" id="mv-cats">${cats.map(x => `<button class="${x === sel ? 'on' : ''}" data-a="cat" data-c="${esc(x)}">${esc(x)}</button>`).join('')}<button class="nueva" data-a="nuevaCat">+ Nueva</button></div>
    <div class="fila-b" id="mv-nc" hidden><input id="mv-nc-t" class="in" placeholder="Ej: 🐶 Mascota"><button class="btn prim" data-a="guardarCat" data-t="${tipo}">Agregar</button></div>
    <input id="mv-nota" class="in" placeholder="Nota (opcional): ej. nafta, almuerzo con Ivo" value="${esc(ya?.nota || '')}">
    <div class="fila-b"><input id="mv-fecha" class="in" type="date" value="${ya?.fecha || HOY()}">
      ${id ? '<button class="btn peligro" data-a="borrarMov" data-id="' + id + '">Borrar</button>' : ''}
      <button class="btn prim grande" data-a="guardarMov" data-t="${tipo}" data-id="${id || ''}">Guardar</button></div>`,
    o => setTimeout(() => $('#mv-monto', o)?.focus(), 250));
}
function hojaEvento(ev, abrirOtra) {
  const c = esComida(ev) ? comidaDeEvento(ev) : null;
  const f = ymd(ev.ini), r = c ? regComida(f, c.tipo) : null;
  const ra = seRegistra(ev) ? regAct(ev) : null, yaEmpezo = ev.ini <= new Date();
  const fuente = ev.rutina ? 'Mi rutina' + (ev.cambiado ? ' (cambiado este día)' : '') : !DEMO ? calInfo(ev.calId).summary : '';
  hoja(`
    <h3 class="h-t" style="--c:${ev.color || '#6366f1'}">${esc(ev.titulo)}</h3>
    <p class="h-s">${fechaCorta(f)} · ${ev.todoDia ? 'Todo el día' : `${hm(ev.ini)} a ${hm(ev.fin)}`}${fuente ? ' · ' + esc(fuente) : ''}</p>
    ${ev.rutina && c && c.variantes.length ? `<h4>Para comer este día</h4><div class="cats">${[{ n: c.plan }, ...c.variantes].filter(o => o.n).map(o => `<button class="${o.n === c.plan ? 'on' : ''}" data-a="planDia" data-v="${esc(o.n)}">${esc(o.n)}</button>`).join('')}</div>` : ''}
    ${c ? `<div class="com-b grande">
      <button class="${r?.estado === 'ok' ? 'on' : ''}" data-a="comida" data-est="ok" data-f="${f}" data-tipo="${c.tipo}">✓ La hice</button>
      <button class="${r?.estado === 'cambio' ? 'on' : ''}" data-a="verComida" data-f="${f}" data-tipo="${c.tipo}" data-cambio="1">↺ Cambié</button>
      <button class="${r?.estado === 'no' ? 'on' : ''}" data-a="comida" data-est="no" data-f="${f}" data-tipo="${c.tipo}">✗ No</button></div>` : ''}
    ${seRegistra(ev) && (yaEmpezo || ra) ? `<h4>¿Cómo te fue?</h4>
    <div class="com-b grande">
      <button class="${ra?.estado === 'ok' ? 'on' : ''}" data-a="act" data-est="ok" data-id="${esc(ev.id)}">✓ A horario</button>
      <button class="${ra?.estado === 'otra' || abrirOtra ? 'on' : ''}" data-a="mostrarOtra">🕒 Otra hora</button>
      <button class="${ra?.estado === 'no' ? 'on' : ''}" data-a="act" data-est="no" data-id="${esc(ev.id)}">✗ No</button></div>
    <div id="otra" class="fila-b" ${ra?.estado === 'otra' || abrirOtra ? '' : 'hidden'}>
      <span class="nota">¿A qué hora fuiste?</span><input id="ot-h" class="in" type="time" value="${ra?.hora || hm(ev.ini)}">
      <button class="btn prim" data-a="guardarOtra" data-id="${esc(ev.id)}">Guardar</button></div>` : ''}
    ${ev.desc ? `<div class="desc">${esc(ev.desc)}</div>` : ''}
    ${ev.todoDia || !(ev.rutina || calEscribible(ev.calId)) ? '' : `
    <h4>Mover</h4>
    <div class="cats">${[[-15, '−15 min'], [15, '+15 min'], [30, '+30 min'], [60, '+1 h'], [1440, 'Mañana']].map(([n, t]) => `<button data-a="correr" data-n="${n}">${t}</button>`).join('')}</div>
    <div class="fila-b"><input id="mo-f" class="in" type="date" value="${f}"><input id="mo-h" class="in" type="time" value="${hm(ev.ini)}"></div>
    ${ev.serie ? `<div class="seg"><button class="on" data-a="alcance" data-v="uno">Solo este día</button><button data-a="alcance" data-v="serie">${ev.rutina ? `Todos los ${DIAS[ev.ini.getDay()].replace(/([^s])$/, "$1s")}` : 'Todas las semanas'}</button></div>` : ''}
    <div class="fila-b">${ev.rutina ? `<button class="btn peligro" data-a="ocultarRutDia">Hoy no va</button><button class="btn" data-a="editarRut" data-id="${ev.rid}">✎ Editar</button>` : `<button class="btn peligro" data-a="borrarEvento">Borrar</button>`}${ev.link ? `<a class="btn" href="${esc(ev.link)}" target="_blank" rel="noopener">Abrir en Google</a>` : ''}<button class="btn prim grande" data-a="guardarMover">Mover</button></div>
    ${ev.rutina && ev.cambiado ? '<button class="link" data-a="restaurarRutDia">Volver a como estaba en la rutina</button>' : ''}`}`);
  $('#hoja').dataset.ev = ev.id; $('#hoja').dataset.alc = 'uno';
}
function hojaComida(f, tipo, abrirCambio) {
  const c = comidasDelDia(f).find(x => x.tipo === tipo) || { tipo, plan: '', variantes: plan().opciones[tipo] || [], hora: '' };
  const r = regComida(f, tipo), info = COMIDAS.find(x => x[0] === tipo);
  hoja(`
    <h3>${info[2]} ${info[1]} · ${fechaCorta(f)}</h3>
    <p class="h-s">Plan: <b>${esc(c.plan)}</b></p>
    ${c.detalle ? `<div class="desc">${esc(c.detalle)}</div>` : ''}
    <div class="com-b grande">
      <button class="${r?.estado === 'ok' ? 'on' : ''}" data-a="comida" data-est="ok" data-f="${f}" data-tipo="${tipo}">✓ La hice</button>
      <button class="${r?.estado === 'cambio' || abrirCambio ? 'on' : ''}" data-a="mostrarCambio">↺ Cambié</button>
      <button class="${r?.estado === 'no' ? 'on' : ''}" data-a="comida" data-est="no" data-f="${f}" data-tipo="${tipo}">✗ No</button>
    </div>
    <div id="cambio" ${r?.estado === 'cambio' || abrirCambio || r?.estado === 'no' ? '' : 'hidden'}>
      <h4>¿Qué comiste?</h4>
      ${c.variantes.length ? `<div class="cats">${c.variantes.map(v => `<button class="${r?.variante === v.n ? 'on' : ''}" data-a="variante" data-v="${esc(v.n)}">${esc(v.n)}</button>`).join('')}</div>` : ''}
      <textarea id="co-nota" class="in" rows="3" placeholder="Ej: pollo con fideos en vez de arroz · comí la mitad · salteé la merienda">${esc(r?.nota || '')}</textarea>
      <button class="btn prim ancho" data-a="guardarComida" data-f="${f}" data-tipo="${tipo}">Guardar</button>
    </div>`);
  $('#hoja').dataset.var = r?.variante || '';
}
function hojaNuevoEvento() {
  const vis = DEMO ? ['demo'] : S.cals.filter(c => calEscribible(c.id)).map(c => c.id), def = calPorDefecto();
  const ahora = new Date(); ahora.setMinutes(Math.ceil(ahora.getMinutes() / 30) * 30, 0, 0);
  hoja(`
    <h3>Agendar</h3>
    <input id="ne-t" class="in" placeholder="¿Qué es? Ej: Reunión con Upper" autocomplete="off">
    <div class="cats">${[['hoy', 'Hoy'], ['man', 'Mañana'], ['pas', 'Pasado']].map(([k, t], i) => `<button class="${i === 0 ? 'on' : ''}" data-a="neDia" data-d="${i}">${t}</button>`).join('')}</div>
    <div class="fila-b"><input id="ne-f" class="in" type="date" value="${S.tab === 'agenda' ? S.dia : HOY()}"><input id="ne-h" class="in" type="time" value="${hm(ahora)}"></div>
    <h4>Duración</h4>
    <div class="cats" id="ne-dur">${[15, 30, 45, 60, 90, 120].map(m => `<button class="${m === 60 ? 'on' : ''}" data-a="neDur" data-m="${m}">${durTxt(m)}</button>`).join('')}</div>
    ${vis.length > 1 ? `<label class="campo"><span>Calendario</span><select id="ne-c" class="in">${vis.map(id => `<option value="${esc(id)}" ${id === def ? 'selected' : ''}>${esc(calInfo(id).summary)}</option>`).join('')}</select></label>` : ''}
    <textarea id="ne-d" class="in" rows="2" placeholder="Notas (opcional)"></textarea>
    <button class="btn prim ancho grande" data-a="guardarEvento">Agendar</button>`, o => setTimeout(() => $('#ne-t', o)?.focus(), 250));
  $('#hoja').dataset.dur = 60;
}
function hojaPantalla(f) {
  f = f || HOY();
  const ya = rec('pant:' + f)?.apps || [];
  const filas = ya.length ? ya : [{ n: 'Instagram', min: 0 }, { n: 'WhatsApp', min: 0 }, { n: 'TikTok', min: 0 }];
  hoja(`
    <h3>Tiempo en pantalla</h3>
    <label class="campo"><span>Día</span><input id="pa-f" class="in" type="date" value="${f}" data-a2="pantFecha"></label>
    <div id="pa-filas">${filas.map(filaPantalla).join('')}</div>
    <div class="cats">${APPS_PANTALLA.map(n => `<button data-a="pantApp" data-n="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>
    <button class="btn prim ancho grande" data-a="guardarPantalla">Guardar</button>`);
}
const filaPantalla = a => `<div class="pa-fila"><input class="in pa-n" value="${esc(a.n)}" placeholder="App"><input class="in pa-h" type="number" min="0" inputmode="numeric" value="${Math.floor(a.min / 60) || ''}" placeholder="h"><span>h</span><input class="in pa-m" type="number" min="0" max="59" inputmode="numeric" value="${a.min % 60 || ''}" placeholder="min"><span>min</span></div>`;
function hojaHabito(id) {
  const h = id ? rec('habit:' + id) : null;
  hoja(`
    <h3>${h ? 'Editar hábito' : 'Nuevo hábito'}</h3>
    <div class="seg"><button class="${h?.tipo !== 'dejar' ? 'on' : ''}" data-a="habTipo" data-t="hacer">Quiero hacerlo</button><button class="${h?.tipo === 'dejar' ? 'on' : ''}" data-a="habTipo" data-t="dejar">Quiero dejarlo</button></div>
    <div class="fila-b"><input id="hb-e" class="in emoji" value="${esc(h?.emoji || '✨')}" maxlength="4"><input id="hb-n" class="in" placeholder="Ej: Leer 20 minutos" value="${esc(h?.nombre || '')}"></div>
    <div class="fila-b">${h ? `<button class="btn peligro" data-a="borrarHabito" data-id="${id}">Borrar</button>` : ''}<button class="btn prim grande" data-a="guardarHabito" data-id="${id || ''}">Guardar</button></div>`,
    o => !h && setTimeout(() => $('#hb-n', o)?.focus(), 250));
  $('#hoja').dataset.tipo = h?.tipo || 'hacer';
}
const CAMPOS_MED = [['peso', 'Peso (kg)'], ['grasa', '% de grasa'], ['musculo', 'Masa muscular (kg)'], ['cintura', 'Cintura (cm)'], ['pliegues', 'Suma 6 pliegues (mm)'], ['grasaKg', 'Masa adiposa (kg)']];
function hojaMedida(f) {
  f = f || HOY(); const m = rec('med:' + f) || {};
  hoja(`
    <h3>Medición</h3>
    <label class="campo"><span>Fecha</span><input id="md-f" class="in" type="date" value="${f}"></label>
    <div class="grilla2">${CAMPOS_MED.map(([k, t]) => `<label class="campo"><span>${t}</span><input id="md-${k}" class="in" type="text" inputmode="decimal" value="${m[k] == null ? '' : esc(fmt(decimal(m[k])))}"></label>`).join('')}</div>
    <p class="nota">Cargá lo que tengas: con el peso de la balanza alcanza. Los pliegues y el % de grasa salen del informe de la nutri.</p>
    <button class="btn prim ancho" data-a="guardarMedida">Guardar</button>`);
}
function hojaRut(id, dia) {
  const r = id ? rec('rut:' + id) : null, p = plan();
  const dias = new Set(r?.dias || (dia != null ? [+dia] : []));
  const lu = ymd(lunes(new Date())), estaSem = paridad(lu);
  const frec = r?.fecha ? 'una' : !r?.quin ? 'todas' : r.quin === estaSem ? 'esta' : 'proxima';
  hoja(`
    <h3>${r ? 'Editar actividad' : 'Nueva actividad'}</h3>
    <input id="ru-t" class="in" placeholder="Ej: Gym, Leer, Almuerzo" value="${esc(r?.t || '')}">
    <div class="fila-b"><label class="campo"><span>Desde</span><input id="ru-h" class="in" type="time" value="${r?.h || '09:00'}"></label><label class="campo"><span>Hasta</span><input id="ru-f" class="in" type="time" value="${r?.f || '10:00'}"></label></div>
    <h4>Días</h4>
    <div class="cats" id="ru-dias">${ORDEN_DIAS.map(d => `<button class="${dias.has(d) ? 'on' : ''}" data-a="ruDia" data-d="${d}">${DC[d]}</button>`).join('')}</div>
    <div class="seg" id="ru-frec">${[['todas', 'Todas las semanas'], ['esta', 'Semana por medio (esta)'], ['proxima', 'Semana por medio (próxima)']].map(([k, t]) => `<button class="${frec === k ? 'on' : ''}" data-a="ruFrec" data-v="${k}">${t}</button>`).join('')}</div>
    ${r?.fecha ? `<p class="nota">Esta actividad es de un solo día (${fechaCorta(r.fecha)}). Si elegís días, pasa a repetirse.</p>` : ''}
    <label class="campo"><span>¿Es una comida?</span><select id="ru-c" class="in" data-a2="ruComida"><option value="">No</option>${COMIDAS.map(([t, n]) => `<option value="${t}" ${r?.comida === t ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="campo" id="ru-pl-c" ${r?.comida ? '' : 'hidden'}><span>Qué comer (del plan)</span><select id="ru-pl" class="in">${r?.comida ? p.opciones[r.comida].map(o => `<option ${o.n === r.plan ? 'selected' : ''}>${esc(o.n)}</option>`).join('') : ''}</select></label>
    <textarea id="ru-d" class="in" rows="3" placeholder="Notas (opcional): ej. salí 17:00 en punto, mochila lista">${esc(r?.detalle || '')}</textarea>
    <div class="fila-b">${r ? `<button class="btn peligro" data-a="borrarRut" data-id="${id}">Borrar</button>` : ''}<button class="btn prim grande" data-a="guardarRut" data-id="${id || ''}">Guardar</button></div>`,
    o => !r && setTimeout(() => $('#ru-t', o)?.focus(), 250));
  $('#hoja').dataset.frec = frec;
}
function hojaTarea(id, conAviso) {
  const t = id ? rec('tarea:' + id) : null, aviso = t ? !!t.aviso : !!conAviso;
  const man = ymd(sumar(new Date(), 1));
  const f = t?.fecha || (aviso ? HOY() : '');
  hoja(`
    <h3>${t ? 'Editar' : aviso ? 'Nuevo recordatorio' : 'Nueva tarea'}</h3>
    <input id="ta-t" class="in" placeholder="Ej: Pagar el monotributo, llamar a la nutri" value="${esc(t?.texto || '')}" autocomplete="off">
    <h4>¿Para cuándo?</h4>
    <div class="cats" id="ta-dias">${[['', 'Sin fecha'], [HOY(), 'Hoy'], [man, 'Mañana']].map(([v, n]) => `<button class="${f === v ? 'on' : ''}" data-a="taDia" data-v="${v}">${n}</button>`).join('')}</div>
    <div class="fila-b"><input id="ta-f" class="in" type="date" value="${f}"><input id="ta-h" class="in" type="time" value="${t?.hora || ''}"></div>
    <label class="campo chk"><input type="checkbox" id="ta-av" ${aviso ? 'checked' : ''}> 🔔 Avisarme en el celu a esa hora</label>
    <p class="nota">El aviso se crea como evento en tu Google Calendar, así te suena aunque la app esté cerrada. Necesita fecha y hora.</p>
    <div class="fila-b">${t ? `<button class="btn peligro" data-a="borrarTarea" data-id="${id}">Borrar</button>` : ''}<button class="btn prim grande" data-a="guardarTarea" data-id="${id || ''}">Guardar</button></div>`,
    o => !t && setTimeout(() => $('#ta-t', o)?.focus(), 250));
}
function hojaOpcion(tipo, i) {
  const op = i != null ? plan().opciones[tipo][+i] : null, info = COMIDAS.find(c => c[0] === tipo);
  hoja(`
    <h3>${info[2]} ${op ? 'Editar opción' : 'Nueva opción'} de ${info[1].toLowerCase()}</h3>
    <input id="op-n" class="in" placeholder="Nombre corto. Ej: Tostada con huevos" value="${esc(op?.n || '')}">
    <textarea id="op-d" class="in" rows="4" placeholder="Qué lleva y cuánto. Ej: 1 tostada integral + 2 huevos + café con leche">${esc(op?.d || '')}</textarea>
    <div class="fila-b">${op ? `<button class="btn peligro" data-a="borrarOpcion" data-tipo="${tipo}" data-i="${i}">Borrar</button>` : ''}<button class="btn prim grande" data-a="guardarOpcion" data-tipo="${tipo}" data-i="${i ?? ''}">Guardar</button></div>`,
    o => !op && setTimeout(() => $('#op-n', o)?.focus(), 250));
}
// Plan nuevo: reemplaza las opciones y reacomoda las comidas de la rutina que
// apuntaban a opciones que ya no existen (las reparte en orden entre las nuevas).
function aplicarPlan(nuevo) {
  const ops = nuevo.opciones || {};
  if (!COMIDAS.some(([t]) => ops[t]?.length)) throw new Error('El archivo no trae opciones de comidas.');
  const ant = plan();
  cambiar('plan:main', {
    nombre: nuevo.nombre || 'Plan nuevo', desde: nuevo.desde || HOY(), profesional: nuevo.profesional || ant.profesional || '',
    notas: nuevo.notas || '', opciones: { ...PLAN_VACIO.opciones, ...ops }, cantidades: nuevo.cantidades || {}, metas: nuevo.metas || ant.metas || {}
  });
  if (nuevo.kcal) cambiar('obj:main', { kcal: nuevo.kcal });
  let cambios = 0; const giro = {};
  rutinas().filter(r => r.comida).forEach(r => {
    const lista = (ops[r.comida] || []).filter(o => !/libre/i.test(o.n));
    if (!lista.length || lista.some(o => o.n === r.plan) || /libre/i.test(r.plan || '')) return;
    giro[r.comida] = (giro[r.comida] || 0);
    cambiar(r.k, { plan: lista[giro[r.comida]++ % lista.length].n }); cambios++;
  });
  return cambios;
}
function hojaImportar(texto, nombre) {
  const n = parsearIcs(texto).length;
  if (!n) return aviso('Ese archivo no tiene eventos.');
  const opciones = S.cals.filter(c => calEscribible(c.id));
  if (!opciones.length) return aviso('No encontré calendarios donde puedas escribir. Probá Reconectar.');
  const rut = opciones.find(c => /rutina/i.test(c.summary));
  hoja(`<h3>Cargar ${n} eventos</h3><p class="nota">${esc(nombre)}. Se repiten solos cada semana y traen sus avisos. Si la volvés a cargar, actualiza los mismos eventos: no duplica.</p>
    <label class="campo"><span>¿En qué calendario?</span><select id="im-c" class="in">${opciones.map(c => `<option value="${esc(c.id)}" ${c === rut ? 'selected' : ''}>${esc(c.summary)}</option>`).join('')}</select></label>
    ${rut ? '' : '<p class="nota">Tip: si creás un calendario "Rutina" en Google Calendar (Configuración → Añadir calendario → Crear calendario), la podés mostrar u ocultar aparte.</p>'}
    <p id="im-p" class="nota"></p><button class="btn prim ancho grande" id="im-ok">Cargar</button>`);
  $('#im-ok').onclick = async () => {
    $('#im-ok').disabled = true;
    const calId = $('#im-c').value;
    const r = await importarIcs(texto, calId, (i, t) => { $('#im-p').textContent = `Cargando ${i} de ${t}…`; });
    const vis = cfg().cals || []; if (!vis.includes(calId)) setCfg({ cals: [...vis, calId] });
    $('#im-p').textContent = r.mal ? `Cargué ${r.ok} de ${r.total}. ${r.mal} dieron error: ${r.error}` : `Listo: ${r.ok} eventos cargados.`;
    $('#im-ok').textContent = 'Cerrar'; $('#im-ok').disabled = false; $('#im-ok').onclick = () => { cerrar(); render(); };
  };
}
function hojaMetas() {
  const c = cfg();
  hoja(`<h3>Porciones por día</h3><p class="nota">Copiá los números del primer cuadro del plan de la nutri (ej: Almidones 6). Dejá vacío lo que no quieras seguir.</p>
    <div class="grilla2">${GRUPOS.map(([g, n]) => `<label class="campo"><span>${n}</span><input id="mt-${g}" class="in" type="number" inputmode="numeric" min="0" value="${metas()[g] || ''}"></label>`).join('')}</div>
    <button class="btn prim ancho" data-a="guardarMetas">Guardar</button>`);
}
function abrirCalendarios(primera) {
  const c = cfg(), sel = new Set(c.cals || S.cals.filter(x => x.primary).map(x => x.id));
  hoja(`<h3>${primera ? '¿Qué calendarios querés ver?' : 'Calendarios'}</h3>
    <p class="nota">Tildá los que querés en la agenda. La estrella marca dónde se crean las reuniones nuevas.</p>
    <div class="cal-lista">${S.cals.map(x => `<div class="cal-it"><label><input type="checkbox" value="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''}><i style="background:${x.backgroundColor}"></i>${esc(x.summary)}${x.primary ? ' <small>(principal)</small>' : ''}</label>
      ${calEscribible(x.id) ? `<button class="estrella ${x.id === calPorDefecto() ? 'on' : ''}" data-a="calDef" data-id="${esc(x.id)}" title="Crear acá">★</button>` : '<small>solo lectura</small>'}</div>`).join('') || '<p class="vacio">No encontré calendarios.</p>'}</div>
    <button class="btn prim ancho" data-a="guardarCalendarios">Listo</button>`);
  $('#hoja').dataset.def = calPorDefecto() || '';
}

/* ====================================================================== */
/* ---------- Acciones ---------- */
const A = {
  tab(b) { S.tab = b.dataset.t; LS.set('tab', S.tab); if (S.tab === 'agenda' || S.tab === 'comidas') S.dia = S.dia || HOY(); render(); scrollTo(0, 0); },
  ajustes() { S.tab = 'ajustes'; render(); scrollTo(0, 0); },
  togglePlata() { LS.set('ocultarPlata', !plataOculta()); render(); },
  editarTarea(b) { hojaTarea(b.dataset.id, b.dataset.aviso); },
  taDia(b) { $('#ta-f').value = b.dataset.v; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  tildarTarea(b) {
    const k = 'tarea:' + b.dataset.id, t = rec(k); if (!t) return;
    cambiar(k, t.hecha ? { hecha: false, hechaEn: null } : { hecha: true, hechaEn: HOY() });
    if (!t.hecha && navigator.vibrate) navigator.vibrate(10);
    render();
  },
  async guardarTarea(b) {
    const texto = $('#ta-t').value.trim(); if (!texto) return aviso('Escribí la tarea.');
    const fecha = $('#ta-f').value || null, hora = $('#ta-h').value || null, quiereAviso = $('#ta-av').checked;
    if (quiereAviso && (!fecha || !hora)) return aviso('Para el aviso poné fecha y hora.');
    const id = b.dataset.id || uid(), ya = rec('tarea:' + id);
    poner('tarea:' + id, { ...(ya || {}), texto, fecha, hora, aviso: quiereAviso, creado: ya?.creado || Date.now(), hecha: ya?.hecha || false });
    const cambioAviso = quiereAviso && (!ya?.aviso || ya.fecha !== fecha || ya.hora !== hora || ya.texto !== texto);
    if (!quiereAviso && ya?.evId) { borrarEvento({ id: ya.evId, calId: ya.calId }).catch(() => { }); cambiar('tarea:' + id, { evId: null }); }
    cerrar(); render();
    if (!cambioAviso) return aviso('Tarea guardada');
    try {
      if (!DEMO && S.auth !== 'ok') await conectar(false);
      await avisoTarea(rec('tarea:' + id), id); aviso(`🔔 Te aviso el ${fechaCorta(fecha)} a las ${hora}`);
    } catch (e) { aviso('La tarea quedó guardada, pero no pude crear el aviso en Google. Probá de nuevo desde la tarea.'); }
  },
  borrarTarea(b) {
    const k = 'tarea:' + b.dataset.id, t = rec(k);
    if (t?.evId) borrarEvento({ id: t.evId, calId: t.calId }).catch(() => { });
    borrar(k); cerrar(); render();
  },
  cerrar,
  conectar(b) { conectar(!!b.dataset.p || !LS.get('conectado')).catch(() => { }); },
  desconectar() { if (confirm('¿Desconectar tu cuenta de Google en este navegador? Tus datos quedan guardados.')) desconectar(); },
  syncYa() { sincronizar().then(() => aviso(S.sync === 'ok' ? 'Sincronizado' : 'No se pudo sincronizar')); },
  calendarios() { abrirCalendarios(false); },
  calDef(b) { $('#hoja').dataset.def = b.dataset.id; document.querySelectorAll('.estrella').forEach(x => x.classList.toggle('on', x === b)); },
  guardarCalendarios() {
    const ids = [...document.querySelectorAll('.cal-lista input:checked')].map(x => x.value);
    if (!ids.length) return aviso('Elegí al menos uno.');
    setCfg({ cals: ids, calDef: $('#hoja').dataset.def || null }); S.ev = {}; S.evCarga = {}; cerrar(); render();
  },
  dia(b) { S.dia = b.dataset.f; render(); },
  diaMas(b) { S.dia = ymd(sumar(deYmd(S.dia), +b.dataset.n)); render(); },
  semana(b) { S.dia = ymd(sumar(deYmd(S.dia), +b.dataset.n)); render(); },
  semHab(b) { S.semHab = ymd(sumar(deYmd(S.semHab), +b.dataset.n)); render(); },
  mes(b) { const [a, m] = S.mes.split('-').map(Number), d = new Date(a, m - 1 + +b.dataset.n, 1); S.mes = ymd(d).slice(0, 7); render(); },
  filtroMov(b) { S.filtroMov = b.dataset.k; render(); },
  rango(b) { S.rango = b.dataset.r; render(); },

  habito(b) { ciclarHabito(b.dataset.f, b.dataset.id); if (navigator.vibrate) navigator.vibrate(8); render(); },
  editarHabito(b) { hojaHabito(b.dataset.id); },
  habTipo(b) { $('#hoja').dataset.tipo = b.dataset.t; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  guardarHabito(b) {
    const nombre = $('#hb-n').value.trim(); if (!nombre) return aviso('Ponele un nombre.');
    const id = b.dataset.id || uid(), ya = rec('habit:' + id);
    poner('habit:' + id, { nombre, emoji: $('#hb-e').value.trim() || '•', tipo: $('#hoja').dataset.tipo, orden: ya?.orden ?? habitos().length });
    cerrar(); render();
  },
  borrarHabito(b) { if (confirm('¿Borrar este hábito? Se pierde su historial.')) { borrar('habit:' + b.dataset.id); cerrar(); render(); } },

  comida(b) {
    const f = b.dataset.f, c = comidasDelDia(f).find(x => x.tipo === b.dataset.tipo) || { tipo: b.dataset.tipo, plan: '', hora: '' };
    marcarComida(f, c, b.dataset.est);
    if (!$('#hoja').hidden) cerrar();
    if (b.dataset.est === 'no') aviso('Anotado. Tocá la comida si querés sumar qué pasó.');
    render();
  },
  verComida(b) { hojaComida(b.dataset.f, b.dataset.tipo, !!b.dataset.cambio); },
  mostrarCambio(b) { $('#cambio').hidden = false; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  variante(b) { const h = $('#hoja'), on = !b.classList.contains('on'); b.parentNode.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.toggle('on', on); h.dataset.var = on ? b.dataset.v : ''; },
  guardarComida(b) {
    const f = b.dataset.f, tipo = b.dataset.tipo, c = comidasDelDia(f).find(x => x.tipo === tipo) || { tipo, plan: '', hora: '' };
    const variante = $('#hoja').dataset.var, nota = $('#co-nota').value.trim();
    const ya = regComida(f, tipo);
    const estado = ya?.estado === 'no' && !variante ? 'no' : 'cambio';
    if (estado === 'cambio' && !variante && !nota) return aviso('Elegí qué comiste o escribilo.');
    poner(`meal:${f}:${tipo}`, { estado, plan: c.plan, hora: c.hora, variante, nota });
    cerrar(); render();
  },
  inter(b) {
    const k = 'int:' + S.dia, g = { ...(rec(k)?.g || {}) };
    g[b.dataset.g] = Math.max(0, (g[b.dataset.g] || 0) + +b.dataset.n); poner(k, { g }); render();
  },
  metas: hojaMetas,
  guardarMetas() { const m = {}; GRUPOS.forEach(([g]) => { const v = +$('#mt-' + g).value; if (v) m[g] = v; }); cambiar('plan:main', { ...plan(), metas: m }); cerrar(); render(); },
  async compartirNutri() {
    const t = textoNutri();
    if (navigator.share) { try { await navigator.share({ title: 'Registro de comidas', text: t }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(t); aviso('Copiado. Pegalo en el chat con la nutri.'); } catch { hoja(`<h3>Copiá el texto</h3><textarea class="in" rows="14">${esc(t)}</textarea>`); }
  },
  imprimirNutri() {
    const w = window.open('', '_blank'); if (!w) return aviso('Permití las ventanas emergentes para imprimir.');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Registro de comidas</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:680px;margin:32px auto;padding:0 16px;color:#111}pre{white-space:pre-wrap;font:inherit}</style><pre>${esc(textoNutri())}</pre><script>print()<\/script>`);
    w.document.close();
  },
  nuevaMedida(b) { hojaMedida(b.dataset.f); },
  guardarMedida() {
    const f = $('#md-f').value || HOY(), d = {};
    CAMPOS_MED.forEach(([k]) => { const v = decimal($('#md-' + k).value); if (v != null) d[k] = v; });
    if (!Object.keys(d).length) return aviso('Cargá al menos un dato.');
    const ya = rec('med:' + f); poner('med:' + f, { ...(ya || {}), ...d }); cerrar(); render();
  },

  nuevoMov(b) { hojaMov(b.dataset.t, b.dataset.id); },
  cambiaTipoMov(b) { hojaMov(b.dataset.t); },
  moneda(b) { const m = b.dataset.m === 'USD' ? 'ARS' : 'USD'; b.dataset.m = m; b.textContent = m === 'USD' ? 'US$' : '$'; },
  cat(b) { b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  nuevaCat() { $('#mv-nc').hidden = false; $('#mv-nc-t').focus(); },
  guardarCat(b) {
    const n = $('#mv-nc-t').value.trim(); if (!n) return aviso('Escribí el nombre de la categoría.');
    const c = cfg(), tipo = b.dataset.t, lista = c.cats[tipo];
    if (!lista.includes(n)) setCfg({ cats: { ...c.cats, [tipo]: [...lista, n] } });
    const nb = Object.assign(document.createElement('button'), { textContent: n }); nb.dataset.a = 'cat'; nb.dataset.c = n;
    $('#mv-cats').insertBefore(nb, $('#mv-cats .nueva')); A.cat(nb);
    $('#mv-nc').hidden = true; $('#mv-nc-t').value = ''; aviso('Categoría agregada');
  },
  guardarMov(b) {
    const monto = numero($('#mv-monto').value); if (!monto) { $('#mv-monto').focus(); return aviso('Poné el monto.'); }
    const tipo = b.dataset.t, cat = $('.cats button.on', $('#hoja'))?.dataset.c || cfg().cats[tipo][0];
    const moneda = $('.mon', $('#hoja')).dataset.m, id = b.dataset.id || uid(), ya = rec('mov:' + id);
    poner('mov:' + id, { tipo, monto, moneda, cat, nota: $('#mv-nota').value.trim(), fecha: $('#mv-fecha').value || HOY(), creado: ya?.creado || new Date().toISOString() });
    const uso = LS.get('catUso', {}); uso[cat] = (uso[cat] || 0) + 1; LS.set('catUso', uso); LS.set('ultMoneda:' + tipo, moneda);
    cerrar(); aviso(`${tipo === 'gasto' ? 'Gasto' : tipo === 'ingreso' ? 'Ingreso' : 'Inversión'} guardado: ${plata(monto, moneda)}`); render();
  },
  borrarMov(b) { if (confirm('¿Borrar este movimiento?')) { borrar('mov:' + b.dataset.id); cerrar(); render(); } },

  verEvento(b) { const e = buscarEvento(b.dataset.id); if (e) hojaEvento(e, !!b.dataset.otra); },
  act(b) {
    const e = buscarEvento(b.dataset.id); if (!e) return;
    marcarAct(e, b.dataset.est); if (!$('#hoja').hidden) cerrar(); render();
  },
  mostrarOtra(b) { $('#otra').hidden = false; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('#ot-h').focus(); },
  guardarOtra(b) {
    const e = buscarEvento(b.dataset.id), h = $('#ot-h').value; if (!e || !h) return aviso('Poné la hora.');
    marcarAct(e, 'otra', h); cerrar(); aviso(`Anotado: ${e.titulo} a las ${h}`); render();
  },
  correr(b) {
    const e = buscarEvento($('#hoja').dataset.ev), n = +b.dataset.n;
    const actual = new Date(`${$('#mo-f').value}T${$('#mo-h').value}`);
    const nuevo = new Date((isNaN(actual) ? e.ini : actual).getTime() + n * 60000);
    $('#mo-f').value = ymd(nuevo); $('#mo-h').value = hm(nuevo);
  },
  alcance(b) { $('#hoja').dataset.alc = b.dataset.v; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  async guardarMover(b) {
    const e = buscarEvento($('#hoja').dataset.ev), nuevo = new Date(`${$('#mo-f').value}T${$('#mo-h').value}`);
    if (isNaN(nuevo)) return aviso('Fecha u hora inválida.');
    const serie = $('#hoja').dataset.alc === 'serie';
    if (serie && !e.rutina && ymd(nuevo) !== ymd(e.ini)) return aviso('Para todas las semanas solo se puede cambiar la hora, no el día.');
    b.disabled = true; b.textContent = 'Moviendo…';
    try { await moverEvento(e, nuevo, serie); cerrar(); aviso(serie ? 'Movido en todas las semanas' : 'Movido'); S.dia = ymd(nuevo); await asegurarSemana(S.dia, true); render(); }
    catch (err) { b.disabled = false; b.textContent = 'Mover'; aviso('No se pudo mover: ' + err.message); }
  },
  async borrarEvento() {
    const e = buscarEvento($('#hoja').dataset.ev);
    if (!confirm(`¿Borrar "${e.titulo}"${e.serie ? ' (solo este día)' : ''} de tu calendario?`)) return;
    try { await borrarEvento(e); cerrar(); aviso('Borrado'); await asegurarSemana(S.dia, true); render(); } catch (err) { aviso('No se pudo borrar: ' + err.message); }
  },
  nuevoEvento() { if (!DEMO && S.auth !== 'ok') return aviso('Primero conectá tu Google.'); hojaNuevoEvento(); },
  neDia(b) { $('#ne-f').value = ymd(sumar(new Date(), +b.dataset.d)); b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  neDur(b) { $('#hoja').dataset.dur = b.dataset.m; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  async guardarEvento(b) {
    const titulo = $('#ne-t').value.trim(); if (!titulo) { $('#ne-t').focus(); return aviso('¿Cómo se llama?'); }
    const ini = new Date(`${$('#ne-f').value}T${$('#ne-h').value}`); if (isNaN(ini)) return aviso('Revisá fecha y hora.');
    const fin = new Date(ini.getTime() + +$('#hoja').dataset.dur * 60000);
    b.disabled = true; b.textContent = 'Agendando…';
    try {
      await crearEvento($('#ne-c')?.value || calPorDefecto(), { titulo, ini, fin, desc: $('#ne-d').value.trim(), avisoMin: cfg().aviso });
      cerrar(); aviso(`Agendado: ${fechaCorta(ymd(ini))} ${hm(ini)}`); await asegurarSemana(ymd(ini), true); render();
    } catch (err) { b.disabled = false; b.textContent = 'Agendar'; aviso('No se pudo agendar: ' + err.message); }
  },

  nuevaPantalla(b) { hojaPantalla(b.dataset.f); },
  pantApp(b) {
    const vacia = [...document.querySelectorAll('.pa-fila')].find(x => !x.querySelector('.pa-n').value.trim());
    if (vacia) vacia.querySelector('.pa-n').value = b.dataset.n;
    else $('#pa-filas').insertAdjacentHTML('beforeend', filaPantalla({ n: b.dataset.n, min: 0 }));
    const filas = document.querySelectorAll('.pa-fila'); (vacia || filas[filas.length - 1]).querySelector('.pa-h').focus();
  },
  guardarPantalla() {
    const apps = [...document.querySelectorAll('.pa-fila')].map(x => ({ n: x.querySelector('.pa-n').value.trim(), min: (+x.querySelector('.pa-h').value || 0) * 60 + (+x.querySelector('.pa-m').value || 0) })).filter(a => a.n && a.min > 0);
    const f = $('#pa-f').value || HOY();
    if (apps.length) poner('pant:' + f, { apps }); else borrar('pant:' + f);
    cerrar(); aviso('Guardado'); render();
  },

  guardarAjustes() {
    const cats = {}; ['gasto', 'ingreso', 'inversion'].forEach(t => { const l = $('#aj-cat-' + t).value.split('\n').map(x => x.trim()).filter(Boolean); cats[t] = l.length ? l : CATS_DEF[t]; });
    setCfg({ dolar: numero($('#aj-dolar').value), cats }); aviso('Guardado'); render();
  },
  importar() {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.ics,text/calendar' });
    inp.onchange = async () => { const file = inp.files[0]; if (file) hojaImportar(await file.text(), file.name); };
    inp.click();
  },
  exportarRutina(b) {
    const evs = rutinaComoEventos(); if (!evs.length) return aviso('Tu rutina está vacía.');
    const opciones = S.cals.filter(c => calEscribible(c.id)), rut = opciones.find(c => /rutina/i.test(c.summary));
    hoja(`<h3>Pasar ${evs.length} actividades a Google</h3><p class="nota">Quedan como eventos que se repiten, con aviso 10 min antes de las comidas y 30 min antes del resto. En la agenda de la app se ven una sola vez.</p>
      <label class="campo"><span>¿En qué calendario?</span><select id="im-c" class="in">${opciones.map(c => `<option value="${esc(c.id)}" ${c === rut ? 'selected' : ''}>${esc(c.summary)}</option>`).join('')}</select></label>
      ${rut ? '' : '<p class="nota">Tip: creá antes un calendario "Rutina" en Google Calendar (Configuración → Añadir calendario → Crear calendario) para poder ocultarlo aparte.</p>'}
      <p id="im-p" class="nota"></p><button class="btn prim ancho grande" id="im-ok">Pasar a Google</button>`);
    $('#im-ok').onclick = async () => {
      $('#im-ok').disabled = true; const calId = $('#im-c').value;
      const r = await importarEventos(rutinaComoEventos(), calId, (i, t) => { $('#im-p').textContent = `Cargando ${i} de ${t}…`; });
      const vis = cfg().cals || []; if (!vis.includes(calId)) setCfg({ cals: [...vis, calId] });
      $('#im-p').textContent = r.mal ? `Pasé ${r.ok} de ${r.total}. ${r.mal} dieron error: ${r.error}` : `Listo: ${r.ok} actividades en Google Calendar.`;
      $('#im-ok').textContent = 'Cerrar'; $('#im-ok').disabled = false; $('#im-ok').onclick = () => { cerrar(); render(); };
    };
  },
  verRutina() { setCfg({ verRutina: cfg().verRutina === false }); render(); },
  editarRut(b) { hojaRut(b.dataset.id, b.dataset.dia); },
  ruDia(b) { b.classList.toggle('on'); },
  ruFrec(b) { $('#hoja').dataset.frec = b.dataset.v; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
  guardarRut(b) {
    const t = $('#ru-t').value.trim(); if (!t) return aviso('Ponele un nombre.');
    const h = $('#ru-h').value, f = $('#ru-f').value; if (!h || !f) return aviso('Poné la hora.');
    const dias = [...document.querySelectorAll('#ru-dias button.on')].map(x => +x.dataset.d);
    const id = b.dataset.id || uid(), ya = rec('rut:' + id);
    if (!dias.length && !ya?.fecha) return aviso('Elegí al menos un día.');
    const frec = $('#hoja').dataset.frec, estaSem = paridad(ymd(lunes(new Date())));
    const comida = $('#ru-c').value || null;
    const d = { t, h, f, comida, plan: comida ? $('#ru-pl').value : null, detalle: $('#ru-d').value.trim() };
    if (dias.length) { d.dias = dias; d.fecha = null; d.quin = frec === 'esta' ? estaSem : frec === 'proxima' ? (estaSem === 'A' ? 'B' : 'A') : null; }
    poner('rut:' + id, { ...(ya || {}), ...d }); cerrar(); aviso('Rutina guardada'); render();
  },
  borrarRut(b) { if (confirm('¿Sacar esta actividad de tu rutina? Deja de aparecer todas las semanas.')) { borrar('rut:' + b.dataset.id); cerrar(); render(); } },
  planDia(b) {
    const e = buscarEvento($('#hoja').dataset.ev); if (!e) return;
    cambiar(`rutx:${ymd(e.ini)}:${e.rid}`, { plan: b.dataset.v, oculto: 0 });
    hojaEvento(buscarEvento(e.id)); render();
  },
  ocultarRutDia() {
    const e = buscarEvento($('#hoja').dataset.ev); if (!e) return;
    cambiar(`rutx:${ymd(e.ini)}:${e.rid}`, { oculto: 1 }); cerrar(); aviso(`Sacado solo del ${fechaCorta(ymd(e.ini))}`); render();
  },
  restaurarRutDia() {
    const e = buscarEvento($('#hoja').dataset.ev); if (!e) return;
    const k = `rutx:${ymd(e.ini)}:${e.rid}`;
    if (rec(k)?.extra) { cambiar(k, { oculto: 1 }); } else borrar(k);
    cerrar(); render();
  },
  editarOpcion(b) { hojaOpcion(b.dataset.tipo, b.dataset.i); },
  guardarOpcion(b) {
    const n = $('#op-n').value.trim(); if (!n) return aviso('Ponele un nombre.');
    const p = plan(), t = b.dataset.tipo, lista = [...p.opciones[t]], i = b.dataset.i;
    const vieja = i !== '' ? lista[+i]?.n : null, op = { n, d: $('#op-d').value.trim() };
    if (i !== '') lista[+i] = op; else lista.push(op);
    cambiar('plan:main', { ...p, opciones: { ...p.opciones, [t]: lista } });
    if (vieja && vieja !== n) rutinas().filter(r => r.comida === t && r.plan === vieja).forEach(r => cambiar(r.k, { plan: n }));
    cerrar(); render();
  },
  borrarOpcion(b) {
    if (!confirm('¿Borrar esta opción del plan?')) return;
    const p = plan(), t = b.dataset.tipo, lista = p.opciones[t].filter((_, j) => j !== +b.dataset.i);
    const n = aplicarPlan({ ...p, opciones: { ...p.opciones, [t]: lista } });
    cerrar(); if (n) aviso(`Reacomodé ${n} comidas de tu rutina.`); render();
  },
  cargarPlan() {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => {
      try {
        const d = JSON.parse(await inp.files[0].text()), nuevo = d.plan || d;
        const n = aplicarPlan(nuevo);
        aviso(`Plan "${nuevo.nombre || 'nuevo'}" cargado.${n ? ` Reacomodé ${n} comidas de tu rutina.` : ''}`); render();
      } catch (e) { aviso('No pude leer el plan: ' + (e.message || 'archivo inválido')); }
    };
    inp.click();
  },
  exportar() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(DB)], { type: 'application/json' }));
    a.download = `mi-tracker-${HOY()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  restaurar() {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => {
      try {
        const d = JSON.parse(await inp.files[0].text()); if (!d.items) throw 0;
        let n = 0; for (const k in d.items) { if (!DB.items[k] || d.items[k].u > DB.items[k].u) { DB.items[k] = d.items[k]; n++; } }
        guardar(); aviso(`Copia cargada: ${n} registros.`); render();
      } catch { aviso('Ese archivo no es una copia de Mi tracker.'); }
    };
    inp.click();
  }
};

// Anotar nunca pide Google: todo se guarda en el celu al instante. Google solo hace
// falta para subir a Drive y traer reuniones; eso se hace tocando el puntito de arriba.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  const f = A[b.dataset.a]; if (!f) return;
  e.preventDefault(); f(b, e);
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'tareaRapida') return;
  e.preventDefault();
  const texto = $('#tq').value.trim(); if (!texto) return;
  poner('tarea:' + uid(), { texto, fecha: null, hora: null, hecha: false, creado: Date.now() });
  render(); $('#tq')?.focus();
});
document.addEventListener('change', e => {
  if (e.target.id === 'ru-c') {
    const t = e.target.value; $('#ru-pl-c').hidden = !t;
    $('#ru-pl').innerHTML = t ? plan().opciones[t].map(o => `<option>${esc(o.n)}</option>`).join('') : '';
  }
  if (e.target.dataset.cant) { const p = plan(); cambiar('plan:main', { ...p, cantidades: { ...p.cantidades, [e.target.dataset.cant]: e.target.value.trim() } }); aviso('Guardado'); }
  if (e.target.id === 'pa-f') { const f = e.target.value; const ya = rec('pant:' + f)?.apps; if (ya) $('#pa-filas').innerHTML = ya.map(filaPantalla).join(''); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#hoja').hidden) cerrar();
  if (e.key === 'Enter' && e.target.id === 'mv-monto') A.guardarMov($('[data-a="guardarMov"]'));
});
$('#fab').addEventListener('click', () => {
  if (S.tab === 'agenda') return A.nuevoEvento();
  if (S.tab === 'plata') return hojaMov('gasto');
  hoja(`<h3>¿Qué querés cargar?</h3><div class="menu-r">
    <button data-a="nuevoMov" data-t="gasto"><span>💸</span>Gasto</button><button data-a="nuevoMov" data-t="ingreso"><span>💰</span>Ingreso</button>
    <button data-a="nuevoMov" data-t="inversion"><span>📈</span>Inversión</button><button data-a="nuevoEvento"><span>📅</span>Reunión</button>
    <button data-a="nuevaPantalla"><span>📱</span>Pantalla</button><button data-a="editarHabito"><span>✨</span>Hábito</button>
    <button data-a="editarTarea"><span>✅</span>Tarea</button><button data-a="editarTarea" data-aviso="1"><span>🔔</span>Recordatorio</button></div>`);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (S.dia < HOY() && S.tab === 'hoy') S.dia = HOY();
  if (S.auth === 'ok' && !tokenOk()) S.auth = 'vencido';
  render(); asegurarSemana(S.tab === 'hoy' ? HOY() : S.dia); sincronizar();
});

/* ---------- arranque ---------- */
iniciarGoogle();
if (QS.get('tab')) S.tab = QS.get('tab');
if (DEMO) cargarCalendarios();
render();
if (S.auth === 'ok') { cargarCalendarios().then(() => { asegurarSemana(HOY(), true); }); sincronizar(); }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });
