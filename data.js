// ============================================================
// Data access — funciones de consulta a Supabase para PAE
// ============================================================

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fechaHaceNDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// --- Registros de asistencia ---
async function fetchRegistrosPorFecha(fecha) {
  const { data, error } = await supabaseClient
    .from('pae_registros')
    .select('*')
    .eq('fecha', fecha);
  if (error) throw error;
  return data || [];
}

// Trae TODAS las filas de una tabla/consulta, sin el límite de 1000
// filas que aplica Supabase por defecto — pagina en bloques de 1000.
async function fetchTodasLasFilas(builderFn) {
  const PAGE = 1000;
  let desde = 0;
  let todas = [];
  while (true) {
    const { data, error } = await builderFn().range(desde, desde + PAGE - 1);
    if (error) throw error;
    todas = todas.concat(data || []);
    if (!data || data.length < PAGE) break;
    desde += PAGE;
  }
  return todas;
}

async function fetchRegistrosDesde(fechaDesde) {
  return fetchTodasLasFilas(() =>
    supabaseClient.from('pae_registros').select('*').gte('fecha', fechaDesde).order('fecha', { ascending: true })
  );
}

// --- Munición ---
async function fetchMunicionPorFecha(fecha) {
  const { data, error } = await supabaseClient
    .from('pae_municion')
    .select('*')
    .eq('fecha', fecha);
  if (error) throw error;
  return data || [];
}

// Mapa id de usuario -> nombre, para mostrar "Cargado por" (visible solo para Administrador en la UI)
async function fetchMapaUsuarios() {
  const { data, error } = await supabaseClient.from('profiles').select('id, nombre');
  if (error) throw error;
  const mapa = {};
  (data || []).forEach(p => { mapa[p.id] = p.nombre || p.id; });
  return mapa;
}

// --- Tutorías ---
async function fetchTutoriasPorFecha(fecha) {
  const { data, error } = await supabaseClient
    .from('pae_tutorias')
    .select('*')
    .eq('fecha', fecha);
  if (error) throw error;
  return data || [];
}

// --- Vista de consistencia (alerta) ---
async function fetchConsistencia(fechaDesde) {
  const { data, error } = await supabaseClient
    .from('pae_consistencia')
    .select('*')
    .gte('fecha', fechaDesde)
    .eq('hay_diferencia', true)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

// --- Helpers de agregación (se calculan en el cliente sobre lo ya traído) ---
function agregarPorEtapa(registros) {
  const base = () => ({ convocados: 0, ausentes: 0, presentes: 0, tutorias: 0, virtual: 0 });
  const out = { general: base(), 'Etapa 1': base(), 'Etapa 2': base() };
  registros.forEach(r => {
    ['general', r.etapa].forEach(key => {
      out[key].convocados += r.convocados;
      out[key].ausentes += r.ausentes;
      out[key].presentes += r.presentes;
      out[key].tutorias += r.tutorias;
      out[key].virtual += r.virtual;
    });
  });
  return out;
}

function sumarMunicionUsada(registros, municionRows) {
  // Ejercicio: presentes físicos (presentes - virtual) × 20, en grupos con fuego vivo.
  // Tutorías: × 10. Comprobación (fv_comprobacion) × 10.
  // Nota: qué grupos participan de fuego vivo se resuelve contra pae_grupos_catalogo
  // cuando se conecte esa tabla; por ahora se usa el total del día como aproximación.
  let ejercicio = 0, tutoriasUso = 0, comprobacion = 0;
  registros.forEach(r => {
    ejercicio += Math.max(0, r.presentes - r.virtual) * 20;
    tutoriasUso += r.tutorias * 10;
    comprobacion += (r.fv_comprobacion || 0) * 10;
  });
  const total = ejercicio + tutoriasUso + comprobacion;
  const retirada = municionRows.reduce((s, m) => s + (m.mun_retirada || 0), 0);
  return { ejercicio, tutoriasUso, comprobacion, total, retirada, restante: retirada - total };
}

function agregarTutorias(tutorias) {
  const cant = t => t.cantidad || 1;
  const total = tutorias.reduce((s, t) => s + cant(t), 0);
  const masc = tutorias.filter(t => t.sexo === 'M').reduce((s, t) => s + cant(t), 0);
  const fem = tutorias.filter(t => t.sexo === 'F').reduce((s, t) => s + cant(t), 0);
  const conteo = {};
  tutorias.forEach(t => {
    const g = (t.grado || '').trim().toUpperCase();
    if (!g) return;
    conteo[g] = (conteo[g] || 0) + cant(t);
  });
  let gradoTop = null, gradoTopCount = 0;
  Object.entries(conteo).forEach(([g, c]) => { if (c > gradoTopCount) { gradoTop = g; gradoTopCount = c; } });
  return { total, masc, fem, gradoTop, gradoTopCount };
}
