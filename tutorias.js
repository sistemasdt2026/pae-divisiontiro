// ============================================================
// Tutorías — carga por legajo (contra tabla personal), listado
// agrupado por fecha, edición/eliminación y KPIs
// ============================================================

const TURNOS_TUTORIA = [
  { valor: '07:20', label: '07:20 — Grupo 1' },
  { valor: '08:20', label: '08:20 — Grupo 2' },
  { valor: '09:20', label: '09:20 — Grupo 3' },
  { valor: '10:20', label: '10:20 — Grupo 4' },
  { valor: '11:20', label: '11:20 — Grupo 5' },
  { valor: '12:00', label: '12:00 — Jefes' },
  { valor: '12:20', label: '12:20 — Grupo 6' },
  { valor: '13:00', label: '13:00 — Lactantes' },
  { valor: '13:20', label: '13:20 — Grupo 7' }
];

let tutoriasData = [];
let tutPendiente = [];
let mapaUsuariosTut = {};

async function renderTutorias() {
  const cont = document.getElementById('viewTutorias');
  cont.innerHTML = '<div class="placeholder-panel">Cargando...</div>';

  try {
    const data = await fetchTodasLasFilas(() =>
      supabaseClient.from('pae_tutorias').select('*').order('fecha', { ascending: false })
    );
    tutoriasData = data;
    tutPendiente = [];
    mapaUsuariosTut = (currentProfile.rol === 'administrador') ? await fetchMapaUsuarios() : {};

    cont.innerHTML = construirTutorias();
    conectarEventosTutorias();
    pintarKpisTutorias();
    pintarListadoTutorias();
  } catch (e) {
    cont.innerHTML = '<div class="placeholder-panel">No se pudo cargar Tutorías: ' + e.message + '</div>';
  }
}

function construirTutorias() {
  return `
    <div class="kpi-grid" id="tutKpis" style="margin-bottom:18px;"></div>

    ${tienePermiso('cargar') ? `
    <div class="panel">
      <div class="panel-title">Cargar tutoría</div>
      <div class="carga-config-row" style="margin-bottom:14px;">
        <div class="campo">
          <label>Fecha</label>
          <input type="date" id="tutFecha" value="${hoyISO()}">
        </div>
        <div class="campo">
          <label>Etapa <span class="carga-etapa-auto">(según la fecha)</span></label>
          <select id="tutEtapa" disabled>
            <option value="Etapa 1">Etapa 1</option>
            <option value="Etapa 2">Etapa 2</option>
          </select>
        </div>
        <div class="campo">
          <label>Turno</label>
          <select id="tutTurno">
            ${TURNOS_TUTORIA.map(t => `<option value="${t.valor}">${t.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="carga-config-row">
        <div class="campo">
          <label>Legajo</label>
          <input type="number" id="tutLegajo" placeholder="Nro. legajo" style="width:130px;">
        </div>
        <div class="campo"><label>Grado</label><input type="text" id="tutGrado" readonly></div>
        <div class="campo"><label>Apellido</label><input type="text" id="tutApellido" readonly></div>
        <div class="campo"><label>Nombre</label><input type="text" id="tutNombre" readonly></div>
        <div class="campo"><label>DNI</label><input type="text" id="tutDni" readonly style="width:110px;"></div>
        <div class="campo"><label>Sexo</label><input type="text" id="tutSexo" readonly style="width:60px;"></div>
        <div class="campo">
          <label>&nbsp;</label>
          <button class="btn-primario" id="btnAgregarPendiente" style="width:auto; padding:11px 20px;">+ Agregar</button>
        </div>
      </div>

      <div id="tutPendienteWrap" style="display:none; margin-top:16px;">
        <div style="font-size:12.5px; font-weight:700; color:var(--texto-muted); margin-bottom:8px;">
          Pendientes de guardar: <span id="tutPendienteCount">0</span>
        </div>
        <table class="tabla-generica">
          <thead><tr><th>Legajo</th><th>Grado</th><th>Apellido</th><th>Nombre</th><th>Sexo</th><th></th></tr></thead>
          <tbody id="tutPendienteTbody"></tbody>
        </table>
        <button class="btn-primario" id="btnGuardarTutorias" style="max-width:280px; margin-top:14px;">Guardar tutorías cargadas</button>
      </div>
    </div>` : ''}

    <div class="panel" style="padding:14px 20px; display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
      <div class="campo" style="margin-bottom:0;">
        <label>Etapa</label>
        <select id="tutFiltEtapa"><option value="">Todas</option><option value="Etapa 1">Etapa 1</option><option value="Etapa 2">Etapa 2</option></select>
      </div>
      <div class="campo" style="margin-bottom:0;">
        <label>Mes</label>
        <select id="tutFiltMes">
          <option value="">Todos</option>
          ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}
        </select>
      </div>
      <div class="campo" style="margin-bottom:0; flex:1; min-width:200px;">
        <label>Buscar</label>
        <input type="text" id="tutFiltBuscar" placeholder="Apellido, nombre o legajo" style="width:100%;">
      </div>
      <div class="campo" style="margin-bottom:0; align-self:flex-end;">
        <button class="btn-secundario" id="btnExportarTutorias">Exportar a Excel</button>
      </div>
    </div>

    <div class="panel" id="tutListadoWrap" style="padding:0; overflow:hidden;"></div>
  `;
}

function conectarEventosTutorias() {
  const fechaInp = document.getElementById('tutFecha');
  if (fechaInp) {
    fechaInp.addEventListener('change', function() {
      document.getElementById('tutEtapa').value = etapaSegunFecha(this.value);
    });
    document.getElementById('tutEtapa').value = etapaSegunFecha(fechaInp.value);
  }

  const legajoInp = document.getElementById('tutLegajo');
  if (legajoInp) legajoInp.addEventListener('blur', buscarPorLegajo);

  const btnAgregar = document.getElementById('btnAgregarPendiente');
  if (btnAgregar) btnAgregar.addEventListener('click', agregarATutPendiente);

  const btnGuardarTut = document.getElementById('btnGuardarTutorias');
  if (btnGuardarTut) btnGuardarTut.addEventListener('click', guardarTutoriasPendientes);

  document.getElementById('tutFiltEtapa').addEventListener('change', pintarListadoTutorias);
  document.getElementById('tutFiltMes').addEventListener('change', pintarListadoTutorias);
  document.getElementById('tutFiltBuscar').addEventListener('input', pintarListadoTutorias);
  document.getElementById('btnExportarTutorias').addEventListener('click', exportarTutoriasExcel);
}

function tutoriasFiltradas() {
  const fe = document.getElementById('tutFiltEtapa').value;
  const fm = document.getElementById('tutFiltMes').value;
  const fb = (document.getElementById('tutFiltBuscar').value || '').toUpperCase().trim();

  return tutoriasData.filter(t => {
    if (fe && t.etapa !== fe) return false;
    if (fm && +t.fecha.split('-')[1] !== +fm) return false;
    if (fb) {
      const hay = (t.apellido + ' ' + t.nombre + ' ' + (t.legajo || '') + ' ' + (t.documento || '')).toUpperCase();
      if (!hay.includes(fb)) return false;
    }
    return true;
  });
}

function exportarTutoriasExcel() {
  const filtrado = tutoriasFiltradas().slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const filas = filtrado.map(t => ({
    Fecha: fmtFecha(t.fecha), Etapa: t.etapa, Turno: t.turno ? t.turno.substring(0, 5) : '',
    Legajo: t.legajo || '', Grado: t.grado || '', Apellido: t.apellido, Nombre: t.nombre, Sexo: t.sexo || ''
  }));
  const fechaHoy = hoyISO().split('-').reverse().join('-');
  exportarExcel('Tutorias_PAE_' + fechaHoy + '.xlsx', [{ nombre: 'Tutorías', filas }]);
}

async function buscarPorLegajo() {
  const legajo = document.getElementById('tutLegajo').value.trim();
  if (!legajo) return;
  const { data, error } = await supabaseClient.from('personal').select('*').eq('legajo', legajo).maybeSingle();

  if (error || !data) {
    document.getElementById('tutGrado').value = '';
    document.getElementById('tutApellido').value = '';
    document.getElementById('tutNombre').value = '';
    document.getElementById('tutDni').value = '';
    document.getElementById('tutSexo').value = '';
    alert('Legajo no encontrado en Personal');
    return;
  }
  document.getElementById('tutGrado').value = data.grado || '';
  document.getElementById('tutApellido').value = data.apellido || '';
  document.getElementById('tutNombre').value = data.nombre || '';
  document.getElementById('tutDni').value = data.dni || '';
  document.getElementById('tutSexo').value = data.sexo || '';
}

function agregarATutPendiente() {
  const legajo = document.getElementById('tutLegajo').value.trim();
  const grado = document.getElementById('tutGrado').value;
  const apellido = document.getElementById('tutApellido').value;
  const nombre = document.getElementById('tutNombre').value;
  const dni = document.getElementById('tutDni').value;
  const sexo = document.getElementById('tutSexo').value;

  if (!apellido || !nombre) { alert('Buscá un legajo válido primero'); return; }

  tutPendiente.push({
    fecha: document.getElementById('tutFecha').value,
    etapa: document.getElementById('tutEtapa').value,
    turno: document.getElementById('tutTurno').value + ':00',
    legajo: legajo || null,
    documento: dni || null,
    grado, apellido, nombre, sexo
  });

  document.getElementById('tutLegajo').value = '';
  document.getElementById('tutGrado').value = '';
  document.getElementById('tutApellido').value = '';
  document.getElementById('tutNombre').value = '';
  document.getElementById('tutDni').value = '';
  document.getElementById('tutSexo').value = '';
  document.getElementById('tutLegajo').focus();

  pintarPendiente();
}

function pintarPendiente() {
  const wrap = document.getElementById('tutPendienteWrap');
  document.getElementById('tutPendienteCount').textContent = tutPendiente.length;
  wrap.style.display = tutPendiente.length > 0 ? 'block' : 'none';

  document.getElementById('tutPendienteTbody').innerHTML = tutPendiente.map((p, i) => `
    <tr>
      <td>${p.legajo || '—'}</td><td>${p.grado}</td><td><strong>${p.apellido}</strong></td>
      <td>${p.nombre}</td><td>${p.sexo}</td>
      <td><button class="btn-sm btn-danger" onclick="quitarPendiente(${i})">✕</button></td>
    </tr>`).join('');
}

function quitarPendiente(i) {
  tutPendiente.splice(i, 1);
  pintarPendiente();
}

async function guardarTutoriasPendientes() {
  if (tutPendiente.length === 0) return;
  const btn = document.getElementById('btnGuardarTutorias');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const { error } = await supabaseClient.from('pae_tutorias').insert(tutPendiente);
    if (error) throw error;
    tutPendiente = [];
    await renderTutorias();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Guardar tutorías cargadas';
    alert('No se pudo guardar: ' + (e.message || e));
  }
}

function pintarKpisTutorias() {
  const agr = agregarTutorias(tutoriasData);
  const dias = new Set(tutoriasData.map(t => t.fecha)).size;
  document.getElementById('tutKpis').innerHTML = `
    ${tarjetaKpi('Total tutoriados', agr.total, 'azul')}
    ${tarjetaKpi('Masculino', agr.masc, 'azul')}
    ${tarjetaKpi('Femenino', agr.fem, 'azul')}
    ${tarjetaKpi('Días con tutorías', dias, 'ambar')}
  `;
  const gradoBox = document.createElement('div');
  gradoBox.className = 'kpi kpi-verde';
  gradoBox.innerHTML = `<div class="kpi-label">Grado más frecuente</div><div class="kpi-val" style="font-size:16px;">${agr.gradoTop || '—'}</div>`;
  document.getElementById('tutKpis').appendChild(gradoBox);
}

function pintarListadoTutorias() {
  const wrap = document.getElementById('tutListadoWrap');
  let filtrado = tutoriasFiltradas();

  if (filtrado.length === 0) {
    wrap.innerHTML = '<div class="placeholder-panel">No hay tutorías para los filtros seleccionados.</div>';
    return;
  }

  let filasHTML = '';
  let fechaActual = null;
  filtrado.forEach(t => {
    if (t.fecha !== fechaActual) {
      const cant = filtrado.filter(x => x.fecha === t.fecha).length;
      filasHTML += `<tr><td colspan="8" class="tutorias-sep">${fmtFecha(t.fecha)} <span class="badge badge-azul">${cant} registro${cant !== 1 ? 's' : ''}</span></td></tr>`;
      fechaActual = t.fecha;
    }
    const esAdmin = currentProfile.rol === 'administrador';
    filasHTML += `
      <tr>
        <td><span class="badge badge-${t.etapa === 'Etapa 1' ? 'azul' : 'ambar'}">${t.etapa}</span></td>
        <td>${t.turno ? t.turno.substring(0, 5) : ''}</td>
        <td>${t.legajo || '—'}</td>
        <td>${t.grado || ''}</td>
        <td><strong>${t.apellido}</strong></td>
        <td>${t.nombre}</td>
        <td>${t.sexo || ''}</td>
        ${esAdmin ? `<td>${mapaUsuariosTut[t.creado_por] || (t.creado_por ? 'Usuario desconocido' : '—')}</td>` : ''}
        <td style="white-space:nowrap;">
          ${puedeEditarFecha(t.fecha) ? `<button class="btn-sm btn-info" onclick="abrirEditTutoria('${t.id}')">Editar</button>` : ''}
          ${tienePermiso('eliminar') ? `<button class="btn-sm btn-danger" onclick="eliminarTutoria('${t.id}')">Eliminar</button>` : ''}
        </td>
      </tr>`;
  });

  const esAdminHead = currentProfile.rol === 'administrador';
  wrap.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="tabla-generica">
        <thead><tr><th>Etapa</th><th>Turno</th><th>Legajo</th><th>Grado</th><th>Apellido</th><th>Nombre</th><th>Sexo</th>${esAdminHead ? '<th>Cargado por</th>' : ''}<th></th></tr></thead>
        <tbody>${filasHTML}</tbody>
      </table>
    </div>`;
}

async function eliminarTutoria(id) {
  if (!confirm('¿Eliminar este registro de tutoría?')) return;
  try {
    const { error } = await supabaseClient.from('pae_tutorias').delete().eq('id', id);
    if (error) throw error;
    tutoriasData = tutoriasData.filter(t => t.id !== id);
    pintarKpisTutorias();
    pintarListadoTutorias();
  } catch (e) {
    alert('No se pudo eliminar: ' + (e.message || e));
  }
}

// --------------------------------------------------------------
// Edición — modal simple, inyectado dinámicamente
// --------------------------------------------------------------
function abrirEditTutoria(id) {
  const t = tutoriasData.find(x => x.id === id);
  if (!t) return;

  const existente = document.getElementById('modalEditTut');
  if (existente) existente.remove();

  const div = document.createElement('div');
  div.id = 'modalEditTut';
  div.className = 'modal-overlay show';
  div.innerHTML = `
    <div class="modal-box">
      <div class="modal-box-title">Editar tutoría</div>
      <div class="modal-grid">
        <div class="campo"><label>Legajo</label><input type="number" id="editTutLegajo" value="${t.legajo || ''}"></div>
        <div class="campo"><label>Documento</label><input type="number" id="editTutDocumento" value="${t.documento || ''}"></div>
        <div class="campo" style="grid-column:1/-1;"><label>Grado</label><input type="text" id="editTutGrado" value="${t.grado || ''}"></div>
        <div class="campo"><label>Apellido</label><input type="text" id="editTutApellido" value="${t.apellido || ''}"></div>
        <div class="campo"><label>Nombre</label><input type="text" id="editTutNombre" value="${t.nombre || ''}"></div>
        <div class="campo">
          <label>Sexo</label>
          <select id="editTutSexo">
            <option value="M" ${t.sexo === 'M' ? 'selected' : ''}>M</option>
            <option value="F" ${t.sexo === 'F' ? 'selected' : ''}>F</option>
          </select>
        </div>
        <div class="campo">
          <label>Turno</label>
          <select id="editTutTurno">
            ${TURNOS_TUTORIA.map(op => `<option value="${op.valor}" ${t.turno && t.turno.startsWith(op.valor) ? 'selected' : ''}>${op.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-sm" style="background:var(--fondo); color:var(--texto);" onclick="cerrarEditTutModal()">Cancelar</button>
        <button class="btn-sm" style="background:var(--azul-800); color:white;" onclick="guardarEditTutoria('${t.id}')">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function cerrarEditTutModal() {
  const m = document.getElementById('modalEditTut');
  if (m) m.remove();
}

async function guardarEditTutoria(id) {
  const cambios = {
    legajo: document.getElementById('editTutLegajo').value || null,
    documento: document.getElementById('editTutDocumento').value || null,
    grado: document.getElementById('editTutGrado').value,
    apellido: document.getElementById('editTutApellido').value.toUpperCase(),
    nombre: document.getElementById('editTutNombre').value.toUpperCase(),
    sexo: document.getElementById('editTutSexo').value,
    turno: document.getElementById('editTutTurno').value + ':00'
  };

  try {
    const { error } = await supabaseClient.from('pae_tutorias').update(cambios).eq('id', id);
    if (error) throw error;
    cerrarEditTutModal();
    await renderTutorias();
  } catch (e) {
    alert('No se pudo guardar: ' + (e.message || e));
  }
}
