// ============================================================
// Historial — tabla de días cargados, filtros, detalle
// expandible y alerta de consistencia por fila
// ============================================================

let historialData = { registros: [], municion: [], consistencia: [], usuarios: {} };

async function renderHistorial() {
  const cont = document.getElementById('viewHistorial');
  cont.innerHTML = '<div class="placeholder-panel">Cargando...</div>';

  try {
    const [registros, consistencia] = await Promise.all([
      fetchRegistrosDesde('2000-01-01'),
      fetchConsistenciaTodo()
    ]);
    const municion = await fetchMunicionTodo();
    const usuarios = (currentProfile.rol === 'administrador') ? await fetchMapaUsuarios() : {};
    historialData = { registros, municion, consistencia, usuarios };

    cont.innerHTML = construirHistorial();
    document.getElementById('histEtapa').addEventListener('change', pintarTablaHistorial);
    document.getElementById('histMes').addEventListener('change', pintarTablaHistorial);
    pintarTablaHistorial();
  } catch (e) {
    cont.innerHTML = '<div class="placeholder-panel">No se pudo cargar el historial: ' + e.message + '</div>';
  }
}

async function fetchMunicionTodo() {
  return fetchTodasLasFilas(() => supabaseClient.from('pae_municion').select('*'));
}

async function fetchConsistenciaTodo() {
  // Solo los días con diferencia real — no toda la vista (que trae también
  // los días donde declaradas = cargadas, sin nada que alertar).
  return fetchTodasLasFilas(() => supabaseClient.from('pae_consistencia').select('*').eq('hay_diferencia', true));
}

function construirHistorial() {
  return `
    <div class="panel" style="padding:14px 20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
      <div class="campo" style="margin-bottom:0;">
        <label>Etapa</label>
        <select id="histEtapa">
          <option value="">Todas</option>
          <option value="Etapa 1">Etapa 1</option>
          <option value="Etapa 2">Etapa 2</option>
        </select>
      </div>
      <div class="campo" style="margin-bottom:0;">
        <label>Mes</label>
        <select id="histMes">
          <option value="">Todos</option>
          ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
            .map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="panel" id="histTablaWrap" style="padding:0; overflow:hidden;"></div>
  `;
}

function agruparPorFechaEtapa(registros) {
  const map = {};
  registros.forEach(r => {
    const key = r.fecha + '|' + r.etapa;
    if (!map[key]) map[key] = { fecha: r.fecha, etapa: r.etapa, convocados: 0, ausentes: 0, presentes: 0, tutorias: 0, virtual: 0, ejercicio: 0, tutoriasUso: 0, comprobacion: 0, filas: [] };
    const d = map[key];
    d.convocados += r.convocados;
    d.ausentes += r.ausentes;
    d.presentes += r.presentes;
    d.tutorias += r.tutorias;
    d.virtual += r.virtual;
    d.ejercicio += Math.max(0, r.presentes - r.virtual) * 20;
    d.tutoriasUso += r.tutorias * 10;
    d.comprobacion += (r.fv_comprobacion || 0) * 10;
    d.filas.push(r);
  });
  return Object.values(map).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function pintarTablaHistorial() {
  const filtroEtapa = document.getElementById('histEtapa').value;
  const filtroMes = document.getElementById('histMes').value;
  const wrap = document.getElementById('histTablaWrap');

  let registrosFiltrados = historialData.registros;
  if (filtroEtapa) registrosFiltrados = registrosFiltrados.filter(r => r.etapa === filtroEtapa);
  if (filtroMes) registrosFiltrados = registrosFiltrados.filter(r => +r.fecha.split('-')[1] === +filtroMes);

  const dias = agruparPorFechaEtapa(registrosFiltrados);

  if (dias.length === 0) {
    wrap.innerHTML = '<div class="placeholder-panel">No hay registros para los filtros seleccionados.</div>';
    return;
  }

  const consistPorKey = {};
  historialData.consistencia.forEach(c => { consistPorKey[c.fecha + '|' + c.etapa] = c; });

  const filas = dias.map((d, i) => {
    const key = d.fecha + '|' + d.etapa;
    const c = consistPorKey[key];
    const pct = d.convocados > 0 ? Math.round(d.presentes / d.convocados * 100) : 0;
    const munUsada = d.ejercicio + d.tutoriasUso + d.comprobacion;
    const badgeConsist = c
      ? `<span class="badge badge-rojo" title="Diferencia: ${c.tutorias_declaradas} declaradas vs ${c.tutorias_registradas} cargadas">⚠ ${c.tutorias_declaradas}/${c.tutorias_registradas}</span>`
      : `<span class="badge badge-verde">✓ OK</span>`;

    return `
      <tr>
        <td><button class="btn-expandir" onclick="toggleDetalleHistorial(${i})">▶</button></td>
        <td><strong>${fmtFecha(d.fecha)}</strong></td>
        <td><span class="badge badge-${d.etapa === 'Etapa 1' ? 'azul' : 'ambar'}">${d.etapa}</span></td>
        <td>${d.convocados}</td>
        <td><strong style="color:var(--verde-600)">${d.presentes}</strong></td>
        <td style="color:var(--rojo-600)">${d.ausentes}</td>
        <td>${d.tutorias}</td>
        <td>${d.virtual}</td>
        <td>${munUsada.toLocaleString('es-AR')}</td>
        <td>${pct}%</td>
        <td>${badgeConsist}</td>
        <td style="white-space:nowrap;">
          ${puedeEditarFecha(d.fecha) ? `<button class="btn-sm btn-info" onclick="cambiarVista('carga','${d.fecha}')">Editar</button>` : ''}
          ${tienePermiso('eliminar') ? `<button class="btn-sm btn-danger" onclick="eliminarDiaHistorial('${d.fecha}','${d.etapa}')">Eliminar</button>` : ''}
        </td>
      </tr>
      <tr class="detalle-row" id="detHist${i}" style="display:none;">
        <td colspan="11">${construirDetalleHistorial(d)}</td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="tabla-generica">
        <thead><tr>
          <th></th><th>Fecha</th><th>Etapa</th><th>Convocados</th><th>Presentes</th>
          <th>Ausentes</th><th>Tutorías</th><th>Virtual</th><th>Munición</th><th>% Pres.</th>
          <th>Tutorías OK</th><th></th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  window._historialDiasActuales = dias;
}

function construirDetalleHistorial(d) {
  const esAdmin = currentProfile.rol === 'administrador';
  const nombreDe = id => historialData.usuarios[id] || (id ? 'Usuario desconocido' : '—');

  const filasGrupo = d.filas.map(r => `
    <tr>
      <td style="text-align:left; font-weight:600;">${r.grupo}</td>
      <td>${r.convocados}</td><td>${r.ausentes}</td>
      <td><strong style="color:var(--verde-600)">${r.presentes}</strong></td>
      <td>${r.tutorias}</td><td>${r.virtual}</td>
      <td>${r.fv_comprobacion || 0}</td>
      ${esAdmin ? `<td style="text-align:left;">${nombreDe(r.modificado_por || r.creado_por)}</td>` : ''}
    </tr>`).join('');

  return `
    <div style="padding:16px 20px; background:var(--fondo);">
      <table class="tabla-generica" style="font-size:12.5px;">
        <thead><tr>
          <th style="text-align:left;">Grupo</th><th>Convocados</th><th>Ausentes</th><th>Presentes</th>
          <th>Tutorías</th><th>Virtual</th><th>FV Comprob.</th>
          ${esAdmin ? '<th style="text-align:left;">Cargado / modificado por</th>' : ''}
        </tr></thead>
        <tbody>${filasGrupo}</tbody>
      </table>
      <div style="margin-top:12px; display:flex; gap:18px; flex-wrap:wrap; font-size:12.5px;">
        <span>Ejercicio: <strong>${d.ejercicio}</strong></span>
        <span>Tutorías: <strong>${d.tutoriasUso}</strong></span>
        <span>Comprobación: <strong>${d.comprobacion}</strong></span>
        <span>Total usado: <strong>${d.ejercicio + d.tutoriasUso + d.comprobacion}</strong></span>
      </div>
    </div>`;
}

function toggleDetalleHistorial(i) {
  const row = document.getElementById('detHist' + i);
  const abierta = row.style.display !== 'none';
  row.style.display = abierta ? 'none' : 'table-row';
}

async function eliminarDiaHistorial(fecha, etapa) {
  if (!confirm('¿Eliminar todos los registros del ' + fmtFecha(fecha) + ' — ' + etapa + '? Esta acción no se puede deshacer.')) return;

  try {
    const { error: e1 } = await supabaseClient.from('pae_registros').delete().eq('fecha', fecha).eq('etapa', etapa);
    if (e1) throw e1;
    const { error: e2 } = await supabaseClient.from('pae_municion').delete().eq('fecha', fecha).eq('etapa', etapa);
    if (e2) throw e2;
    await renderHistorial();
  } catch (e) {
    alert('No se pudo eliminar: ' + (e.message || e));
  }
}
