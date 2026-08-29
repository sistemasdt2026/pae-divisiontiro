// ============================================================
// Estadísticas — KPIs y gráficos agregados por período elegido
// ============================================================

let chartEstadPresencia = null;
let chartEstadMunicion = null;
let chartEstadGrupo = null;

async function renderEstadisticas() {
  const cont = document.getElementById('viewEstadisticas');
  cont.innerHTML = '<div class="placeholder-panel">Cargando...</div>';

  try {
    const [registros, municion, grupos, tutorias] = await Promise.all([
      fetchRegistrosDesde('2000-01-01'),
      fetchMunicionTodo(),
      fetchCatalogoGrupos(),
      fetchTodasLasFilas(() => supabaseClient.from('pae_tutorias').select('*'))
    ]);
    window._estadData = { registros, municion, grupos, tutorias };

    cont.innerHTML = construirEstadisticas();
    conectarEventosEstadisticas();
    pintarEstadisticas();
  } catch (e) {
    cont.innerHTML = '<div class="placeholder-panel">No se pudo cargar Estadísticas: ' + e.message + '</div>';
  }
}

function construirEstadisticas() {
  const hoy = new Date();
  return `
    <div class="panel" style="padding:14px 20px; display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
      <div class="campo" style="margin-bottom:0;">
        <label>Período</label>
        <select id="estadPeriodo">
          <option value="semanal">Semanal</option>
          <option value="mensual" selected>Mensual</option>
          <option value="semestral">Semestral</option>
          <option value="anual">Anual</option>
        </select>
      </div>
      <div class="campo" style="margin-bottom:0;" id="estadMesWrap">
        <label>Mes</label>
        <select id="estadMes">
          ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
            .map((m, i) => `<option value="${i + 1}" ${i + 1 === hoy.getMonth() + 1 ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="campo" style="margin-bottom:0;">
        <label>Etapa</label>
        <select id="estadEtapa"><option value="">Todas</option><option value="Etapa 1">Etapa 1</option><option value="Etapa 2">Etapa 2</option></select>
      </div>
      <div class="campo" style="margin-bottom:0; align-self:flex-end;">
        <button class="btn-secundario" id="btnExportarEstadImagen">Exportar imagen</button>
      </div>
      <div class="campo" style="margin-bottom:0; align-self:flex-end;">
        <button class="btn-secundario" id="btnExportarEstad">Exportar a Excel</button>
      </div>
      <div class="campo" style="margin-bottom:0; align-self:flex-end;">
        <button class="btn-primario" id="btnInformePdf" style="width:auto; padding:9px 18px;">Informe PDF completo</button>
      </div>
    </div>

    <div id="estadExportZone">
    <div class="kpi-grid" id="estadKpis" style="margin-bottom:18px;"></div>

    <div class="charts-grid">
      <div class="panel" style="grid-column:1/-1;">
        <div class="panel-title" id="estadChartTitle">Presencia por día</div>
        <div class="chart-wrap" style="height:280px;"><canvas id="chartEstadPresencia"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-title">Munición acumulada</div>
        <div class="chart-wrap"><canvas id="chartEstadMunicion"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-title">% Presencia por grupo</div>
        <div class="chart-wrap"><canvas id="chartEstadGrupo"></canvas></div>
      </div>
    </div>
    </div>

    <div class="panel" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div class="panel-title" style="margin:0; padding:0; border:none;">Nómina</div>
        <div style="font-size:12.5px; color:var(--texto-muted); margin-top:4px;">Exportar la nómina completa de personal.</div>
      </div>
      <button class="btn-secundario" id="btnExportarNomina">Exportar Nómina a Excel</button>
    </div>
  `;
}

function conectarEventosEstadisticas() {
  document.getElementById('estadPeriodo').addEventListener('change', function() {
    document.getElementById('estadMesWrap').style.display = this.value === 'mensual' ? '' : 'none';
    pintarEstadisticas();
  });
  document.getElementById('estadMes').addEventListener('change', pintarEstadisticas);
  document.getElementById('estadEtapa').addEventListener('change', pintarEstadisticas);
  document.getElementById('btnExportarEstad').addEventListener('click', exportarEstadisticasExcel);
  document.getElementById('btnExportarNomina').addEventListener('click', exportarNominaExcel);
  document.getElementById('btnExportarEstadImagen').addEventListener('click', exportarEstadisticasImagen);
  document.getElementById('btnInformePdf').addEventListener('click', generarInformePdf);
}

async function exportarEstadisticasImagen() {
  const zona = document.getElementById('estadExportZone');
  const fechaHoy = hoyISO().split('-').reverse().join('-');
  await exportarElementoComoPNG(zona, 'Estadisticas_PAE_' + fechaHoy + '.png');
}

async function exportarNominaExcel() {
  const btn = document.getElementById('btnExportarNomina');
  btn.disabled = true;
  btn.textContent = 'Exportando...';
  try {
    const personal = await fetchTodasLasFilas(() => supabaseClient.from('personal').select('*').order('legajo', { ascending: true }));
    const filas = personal.map(p => ({
      Legajo: p.legajo, Grado: p.grado, Apellido: p.apellido, Nombre: p.nombre, DNI: p.dni, Sexo: p.sexo
    }));
    const fechaHoy = hoyISO().split('-').reverse().join('-');
    exportarExcel('Nomina_' + fechaHoy + '.xlsx', [{ nombre: 'Nómina', filas }]);
  } catch (e) {
    alert('No se pudo exportar la nómina: ' + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Exportar Nómina a Excel';
  }
}

function exportarEstadisticasExcel() {
  const periodo = document.getElementById('estadPeriodo').value;
  const mes = document.getElementById('estadMes').value;
  const etapa = document.getElementById('estadEtapa').value;

  let registros = filtrarPorPeriodo(window._estadData.registros, periodo, mes);
  if (etapa) registros = registros.filter(r => r.etapa === etapa);

  const filasDetalle = registros
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(r => ({
      Fecha: fmtFecha(r.fecha), Etapa: r.etapa, Grupo: r.grupo,
      Convocados: r.convocados, Ausentes: r.ausentes, Presentes: r.presentes,
      Tutorías: r.tutorias, Virtual: r.virtual, 'FV Comprobación': r.fv_comprobacion
    }));

  const agr = agregarPorEtapa(registros).general;
  const munAgr = sumarMunicionUsada(registros, window._estadData.municion.filter(m => registros.some(r => r.fecha === m.fecha && r.etapa === m.etapa)));
  const filasResumen = [{
    Convocados: agr.convocados, Presentes: agr.presentes, Ausentes: agr.ausentes,
    Tutorías: agr.tutorias, Virtual: agr.virtual, 'Munición usada': munAgr.total
  }];

  const fechaHoy = hoyISO().split('-').reverse().join('-');
  exportarExcel('Estadisticas_PAE_' + fechaHoy + '.xlsx', [
    { nombre: 'Resumen', filas: filasResumen },
    { nombre: 'Detalle por grupo', filas: filasDetalle }
  ]);
}

function filtrarPorPeriodo(registros, periodo, mes) {
  const hoy = new Date();
  return registros.filter(r => {
    const [y, m, d] = r.fecha.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    if (periodo === 'mensual') return m === +mes;
    if (periodo === 'semestral') return m <= 6;
    if (periodo === 'semanal') {
      const diff = (hoy - fecha) / 86400000;
      return diff >= 0 && diff <= 7;
    }
    return true; // anual
  });
}

function pintarEstadisticas() {
  const periodo = document.getElementById('estadPeriodo').value;
  const mes = document.getElementById('estadMes').value;
  const etapa = document.getElementById('estadEtapa').value;

  let registros = filtrarPorPeriodo(window._estadData.registros, periodo, mes);
  if (etapa) registros = registros.filter(r => r.etapa === etapa);
  const municion = window._estadData.municion.filter(m => registros.some(r => r.fecha === m.fecha && r.etapa === m.etapa));

  const agr = agregarPorEtapa(registros).general;
  const munAgr = sumarMunicionUsada(registros, municion);

  document.getElementById('estadKpis').innerHTML = `
    ${tarjetaKpi('Convocados', agr.convocados, 'azul')}
    ${tarjetaKpi('Presentes', agr.presentes, 'verde')}
    ${tarjetaKpi('Ausentes', agr.ausentes, 'rojo')}
    ${tarjetaKpi('Tutorías', agr.tutorias, 'ambar')}
    ${tarjetaKpi('Virtual', agr.virtual, 'azul')}
    ${tarjetaKpi('Munición usada', munAgr.total, 'ambar')}
  `;

  const nombresPeriodo = { semanal: 'Últimos 7 días', mensual: 'Mes seleccionado', semestral: '1er semestre', anual: 'Año completo' };
  document.getElementById('estadChartTitle').textContent = 'Presencia por día — ' + nombresPeriodo[periodo];

  dibujarChartsEstadisticas(registros);
}

function dibujarChartsEstadisticas(registros) {
  const porFecha = {};
  registros.forEach(r => {
    if (!porFecha[r.fecha]) porFecha[r.fecha] = { convocados: 0, presentes: 0, mun: 0 };
    porFecha[r.fecha].convocados += r.convocados;
    porFecha[r.fecha].presentes += r.presentes;
    porFecha[r.fecha].mun += Math.max(0, r.presentes - r.virtual) * 20 + r.tutorias * 10 + (r.fv_comprobacion || 0) * 10;
  });
  const fechas = Object.keys(porFecha).sort();
  const labels = fechas.map(fmtFecha);

  if (chartEstadPresencia) chartEstadPresencia.destroy();
  chartEstadPresencia = new Chart(document.getElementById('chartEstadPresencia'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Convocados', data: fechas.map(f => porFecha[f].convocados), backgroundColor: 'rgba(52,73,158,.3)' },
        { label: 'Presentes', data: fechas.map(f => porFecha[f].presentes), backgroundColor: 'rgba(47,125,90,.75)' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  let acumulado = 0;
  const munAcum = fechas.map(f => { acumulado += porFecha[f].mun; return acumulado; });
  if (chartEstadMunicion) chartEstadMunicion.destroy();
  chartEstadMunicion = new Chart(document.getElementById('chartEstadMunicion'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Munición acumulada', data: munAcum, borderColor: '#c98a2b', backgroundColor: 'rgba(201,138,43,.1)', fill: true, tension: .3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  const grupos = window._estadData.grupos.map(g => g.grupo);
  const porGrupo = grupos.map(g => {
    const filas = registros.filter(r => r.grupo === g);
    const conv = filas.reduce((s, r) => s + r.convocados, 0);
    const pres = filas.reduce((s, r) => s + r.presentes, 0);
    return conv > 0 ? Math.round(pres / conv * 100) : 0;
  });
  const labelsGrupo = grupos.map(g => g.split(' - ')[0]);
  if (chartEstadGrupo) chartEstadGrupo.destroy();
  chartEstadGrupo = new Chart(document.getElementById('chartEstadGrupo'), {
    type: 'bar',
    data: { labels: labelsGrupo, datasets: [{ label: '% Presencia', data: porGrupo, backgroundColor: 'rgba(52,73,158,.65)' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { max: 100 } } }
  });
}
