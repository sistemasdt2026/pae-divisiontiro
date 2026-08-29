// ============================================================
// Dashboard — KPIs del día, desglose por etapa, tutorías,
// alerta de consistencia y gráficos de tendencia
// ============================================================

let chartTendencia = null;
let chartEtapas = null;

async function renderDashboard() {
  const fecha = hoyISO();
  const cont = document.getElementById('viewDashboard');
  cont.innerHTML = '<div class="placeholder-panel">Cargando...</div>';

  try {
    const [registrosHoy, municionHoy, tutoriasHoy, diferencias, registros30d, registrosTodo] = await Promise.all([
      fetchRegistrosPorFecha(fecha),
      fetchMunicionPorFecha(fecha),
      fetchTutoriasPorFecha(fecha),
      fetchConsistencia(fechaHaceNDias(14)),
      fetchRegistrosDesde(fechaHaceNDias(30)),
      fetchRegistrosDesde('2000-01-01')
    ]);

    const porEtapaHoy = agregarPorEtapa(registrosHoy);
    const porEtapaAcumulado = agregarPorEtapa(registrosTodo);
    const municion = sumarMunicionUsada(registrosHoy, municionHoy);
    const tut = agregarTutorias(tutoriasHoy);

    cont.innerHTML = construirHTML(porEtapaHoy, porEtapaAcumulado, municion, tut, diferencias);
    dibujarGraficos(registros30d);
  } catch (e) {
    cont.innerHTML = '<div class="placeholder-panel">No se pudo cargar el dashboard: ' + e.message + '</div>';
  }
}

function tarjetaKpi(label, valor, tono) {
  return `
    <div class="kpi kpi-${tono}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-val">${valor.toLocaleString('es-AR')}</div>
    </div>`;
}

function bloqueEtapa(titulo, datos, destacado) {
  return `
    <div class="etapa-block${destacado ? ' etapa-block-total' : ''}">
      <div class="etapa-block-title">${titulo}</div>
      <div class="kpi-grid">
        ${tarjetaKpi('Convocados', datos.convocados, 'azul')}
        ${tarjetaKpi('Presentes', datos.presentes, 'verde')}
        ${tarjetaKpi('Ausentes', datos.ausentes, 'rojo')}
        ${tarjetaKpi('Tutorías', datos.tutorias, 'ambar')}
        ${tarjetaKpi('Virtual', datos.virtual, 'azul')}
      </div>
    </div>`;
}

function construirHTML(porEtapaHoy, porEtapaAcumulado, municion, tut, diferencias) {
  const alerta = diferencias.length > 0 ? `
    <div class="alerta-consistencia">
      <div class="alerta-titulo">Diferencias entre tutorías declaradas y cargadas</div>
      <div class="alerta-lista">
        ${diferencias.map(d => `
          <div class="alerta-item">
            <span>${fmtFecha(d.fecha)} — ${d.etapa}</span>
            <span>${d.tutorias_declaradas} declaradas / ${d.tutorias_registradas} cargadas</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
    ${alerta}

    <div class="panel">
      <div class="panel-title">Resumen del día — general</div>
      <div class="kpi-grid">
        ${tarjetaKpi('Convocados', porEtapaHoy.general.convocados, 'azul')}
        ${tarjetaKpi('Presentes', porEtapaHoy.general.presentes, 'verde')}
        ${tarjetaKpi('Ausentes', porEtapaHoy.general.ausentes, 'rojo')}
        ${tarjetaKpi('Tutorías', porEtapaHoy.general.tutorias, 'ambar')}
        ${tarjetaKpi('Virtual', porEtapaHoy.general.virtual, 'azul')}
        ${tarjetaKpi('Munición usada', municion.total, 'ambar')}
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Desglose por etapa — acumulado histórico</div>
      <div class="etapas-stack">
        ${bloqueEtapa('Etapa 1', porEtapaAcumulado['Etapa 1'])}
        ${bloqueEtapa('Etapa 2', porEtapaAcumulado['Etapa 2'])}
        ${bloqueEtapa('Total general', porEtapaAcumulado.general, true)}
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Tutorías del día</div>
      <div class="kpi-grid">
        ${tarjetaKpi('Total', tut.total, 'ambar')}
        ${tarjetaKpi('Masculino', tut.masc, 'azul')}
        ${tarjetaKpi('Femenino', tut.fem, 'azul')}
      </div>
      <div class="grado-top">${tut.gradoTop ? 'Grado más frecuente: <strong>' + tut.gradoTop + '</strong> (' + tut.gradoTopCount + ')' : 'Sin tutorías cargadas hoy.'}</div>
    </div>

    <div class="panel">
      <div class="panel-title">Munición</div>
      <div class="kpi-grid">
        ${tarjetaKpi('Retirada', municion.retirada, 'azul')}
        ${tarjetaKpi('Usada en ejercicio', municion.ejercicio, 'ambar')}
        ${tarjetaKpi('Usada en tutorías', municion.tutoriasUso, 'ambar')}
        ${tarjetaKpi('Comprobación', municion.comprobacion, 'ambar')}
        ${tarjetaKpi('Restante en armería', municion.restante, municion.restante < 0 ? 'rojo' : 'verde')}
      </div>
    </div>

    <div class="charts-grid">
      <div class="panel">
        <div class="panel-title">Tendencia — últimos 30 días</div>
        <div class="chart-wrap"><canvas id="chartTendencia"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-title">Etapa 1 vs Etapa 2 — últimos 30 días</div>
        <div class="chart-wrap"><canvas id="chartEtapas"></canvas></div>
      </div>
    </div>
  `;
}

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

function dibujarGraficos(registros30d) {
  // Agregar por fecha (todas las etapas)
  const porFecha = {};
  registros30d.forEach(r => {
    if (!porFecha[r.fecha]) porFecha[r.fecha] = { convocados: 0, presentes: 0 };
    porFecha[r.fecha].convocados += r.convocados;
    porFecha[r.fecha].presentes += r.presentes;
  });
  const fechas = Object.keys(porFecha).sort();
  const labels = fechas.map(fmtFecha);
  const conv = fechas.map(f => porFecha[f].convocados);
  const pres = fechas.map(f => porFecha[f].presentes);

  if (chartTendencia) chartTendencia.destroy();
  const ctx1 = document.getElementById('chartTendencia');
  if (ctx1) {
    chartTendencia = new Chart(ctx1, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Convocados', data: conv, borderColor: '#34499e', backgroundColor: 'rgba(52,73,158,.08)', fill: true, tension: .3 },
          { label: 'Presentes', data: pres, borderColor: '#2f7d5a', backgroundColor: 'rgba(47,125,90,.08)', fill: true, tension: .3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // Etapa 1 vs Etapa 2 — presentes por fecha
  const porFechaEtapa = { 'Etapa 1': {}, 'Etapa 2': {} };
  registros30d.forEach(r => {
    if (!porFechaEtapa[r.etapa]) return;
    porFechaEtapa[r.etapa][r.fecha] = (porFechaEtapa[r.etapa][r.fecha] || 0) + r.presentes;
  });
  const e1 = fechas.map(f => porFechaEtapa['Etapa 1'][f] || 0);
  const e2 = fechas.map(f => porFechaEtapa['Etapa 2'][f] || 0);

  if (chartEtapas) chartEtapas.destroy();
  const ctx2 = document.getElementById('chartEtapas');
  if (ctx2) {
    chartEtapas = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Etapa 1', data: e1, backgroundColor: 'rgba(52,73,158,.65)' },
          { label: 'Etapa 2', data: e2, backgroundColor: 'rgba(201,138,43,.75)' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: false } } }
    });
  }
}
