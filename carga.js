// ============================================================
// Nueva carga — formulario de asistencia diaria por grupo
// ============================================================

let catalogoGrupos = null; // cache: [{grupo, horario, participa_fuego_vivo, orden}]
let autoSaveTimer = null;

const ETAPA1_FECHA_FIN = '2026-08-02'; // último día de Etapa 1 — desde el 03/08 es Etapa 2

function etapaSegunFecha(fecha) {
  return fecha <= ETAPA1_FECHA_FIN ? 'Etapa 1' : 'Etapa 2';
}

async function fetchCatalogoGrupos() {
  if (catalogoGrupos) return catalogoGrupos;
  const { data, error } = await supabaseClient
    .from('pae_grupos_catalogo')
    .select('*')
    .order('orden', { ascending: true });
  if (error) throw error;
  catalogoGrupos = data || [];
  return catalogoGrupos;
}

async function renderCarga() {
  const cont = document.getElementById('viewCarga');
  cont.innerHTML = '<div class="placeholder-panel">Cargando...</div>';

  try {
    const grupos = await fetchCatalogoGrupos();
    cont.innerHTML = construirFormularioCarga(grupos);
    document.getElementById('cargaFecha').value = hoyISO();
    document.getElementById('cargaEtapa').value = etapaSegunFecha(hoyISO());
    await cargarDatosDelDia();
    document.getElementById('cargaFecha').addEventListener('change', function() {
      document.getElementById('cargaEtapa').value = etapaSegunFecha(this.value);
      cargarDatosDelDia();
    });
    document.getElementById('btnGuardarCarga').addEventListener('click', () => guardarCarga(false));
    document.getElementById('btnExportarImagen').addEventListener('click', exportarImagenDelDia);
    document.querySelectorAll('.carga-input').forEach(inp => inp.addEventListener('input', function() {
      recalcularCarga();
      programarAutoGuardado();
    }));
    document.querySelectorAll('.carga-table tbody tr .carga-grupo-nombre').forEach(celda => {
      celda.addEventListener('click', () => celda.closest('tr').classList.toggle('abierto'));
    });
    recalcularCarga();
  } catch (e) {
    cont.innerHTML = '<div class="placeholder-panel">No se pudo cargar el formulario: ' + e.message + '</div>';
  }
}

function construirFormularioCarga(grupos) {
  const filas = grupos.map(g => `
    <tr data-grupo="${g.grupo}">
      <td class="carga-grupo-nombre">${g.grupo} <span class="carga-chevron">▾</span></td>
      <td data-label="Convocados"><input type="number" class="carga-input g-conv" min="0" value="0"></td>
      <td data-label="Ausentes"><input type="number" class="carga-input g-aus" min="0" value="0"></td>
      <td data-label="Presentes"><span class="carga-presentes">0</span></td>
      <td data-label="Tutorías"><input type="number" class="carga-input g-tut" min="0" value="0"></td>
      <td data-label="Virtual"><input type="number" class="carga-input g-virt" min="0" value="0"></td>
      <td data-label="Fuego vivo — comprobación">${g.participa_fuego_vivo
        ? '<input type="number" class="carga-input g-fvc" min="0" value="0">'
        : '<span class="carga-na">—</span>'}</td>
    </tr>`).join('');

  return `
    <div id="cargaExportZone">
    <div class="panel">
      <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Configuración del día</span>
        <button class="btn-secundario" id="btnExportarImagen">Exportar imagen</button>
      </div>
      <div class="carga-config-row">
        <div class="campo">
          <label>Fecha</label>
          <input type="date" id="cargaFecha">
        </div>
        <div class="campo">
          <label>Etapa <span class="carga-etapa-auto">(según la fecha)</span></label>
          <select id="cargaEtapa" disabled>
            <option value="Etapa 1">Etapa 1</option>
            <option value="Etapa 2">Etapa 2</option>
          </select>
        </div>
      </div>
      <div class="carga-banner" id="cargaBanner"></div>
      <div class="carga-autosave" id="cargaAutoSaveStatus"></div>
    </div>

    <div class="panel">
      <div class="panel-title">Asistencia por grupo</div>
      <div style="overflow-x:auto;">
        <table class="carga-table">
          <thead>
            <tr>
              <th>Grupo</th><th>Convocados</th><th>Ausentes</th><th>Presentes</th>
              <th>Tutorías</th><th>Virtual</th><th>Fuego vivo — comprobación</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr class="carga-total-row">
              <td class="carga-grupo-nombre">Total</td>
              <td data-label="Convocados" id="totConv">0</td><td data-label="Ausentes" id="totAus">0</td><td data-label="Presentes" id="totPres">0</td>
              <td data-label="Tutorías" id="totTut">0</td><td data-label="Virtual" id="totVirt">0</td><td data-label="Fuego vivo">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Munición</div>
      <div class="carga-config-row">
        <div class="campo">
          <label>Munición retirada</label>
          <input type="number" class="carga-input" id="munRetirada" min="0" value="0">
        </div>
        <div class="kpi kpi-ambar" style="min-width:140px;">
          <div class="kpi-label">Total estimado a usar</div>
          <div class="kpi-val" id="munEstimado">0</div>
        </div>
        <div class="kpi" id="munRestanteBox" style="min-width:140px;">
          <div class="kpi-label">Restante</div>
          <div class="kpi-val" id="munRestante">0</div>
        </div>
      </div>
    </div>
    </div>

    <button class="btn-primario" id="btnGuardarCarga" style="max-width:260px;">Guardar carga del día</button>
  `;
}

async function cargarDatosDelDia() {
  const fecha = document.getElementById('cargaFecha').value;
  const etapa = document.getElementById('cargaEtapa').value;
  if (!fecha) return;

  const [registros, municion] = await Promise.all([
    fetchRegistrosPorFecha(fecha),
    fetchMunicionPorFecha(fecha)
  ]);
  const registrosDia = registros.filter(r => r.etapa === etapa);
  const municionDia = municion.find(m => m.etapa === etapa);

  document.querySelectorAll('.carga-table tbody tr').forEach(tr => {
    const grupo = tr.dataset.grupo;
    const r = registrosDia.find(x => x.grupo === grupo);
    tr.querySelector('.g-conv').value = r ? r.convocados : 0;
    tr.querySelector('.g-aus').value = r ? r.ausentes : 0;
    tr.querySelector('.g-tut').value = r ? r.tutorias : 0;
    tr.querySelector('.g-virt').value = r ? r.virtual : 0;
    const fvc = tr.querySelector('.g-fvc');
    if (fvc) fvc.value = r ? (r.fv_comprobacion || 0) : 0;
  });
  document.getElementById('munRetirada').value = municionDia ? municionDia.mun_retirada : 0;

  actualizarBanner(fecha, etapa, registrosDia.length > 0);
  recalcularCarga();
}

function recalcularCarga() {
  let totConv = 0, totAus = 0, totTut = 0, totVirt = 0;
  let ejercicio = 0, tutoriasUso = 0, comprobacion = 0;

  document.querySelectorAll('.carga-table tbody tr').forEach(tr => {
    const conv = +tr.querySelector('.g-conv').value || 0;
    const aus = +tr.querySelector('.g-aus').value || 0;
    const tut = +tr.querySelector('.g-tut').value || 0;
    const virt = +tr.querySelector('.g-virt').value || 0;
    const fvc = tr.querySelector('.g-fvc');
    const pres = Math.max(0, conv - aus);
    tr.querySelector('.carga-presentes').textContent = pres;

    totConv += conv; totAus += aus; totTut += tut; totVirt += virt;
    if (fvc) {
      ejercicio += Math.max(0, pres - virt) * 20;
      tutoriasUso += tut * 10;
      comprobacion += (+fvc.value || 0) * 10;
    }
  });

  document.getElementById('totConv').textContent = totConv;
  document.getElementById('totAus').textContent = totAus;
  document.getElementById('totPres').textContent = Math.max(0, totConv - totAus);
  document.getElementById('totTut').textContent = totTut;
  document.getElementById('totVirt').textContent = totVirt;

  const total = ejercicio + tutoriasUso + comprobacion;
  const retirada = +document.getElementById('munRetirada').value || 0;
  const restante = retirada - total;
  document.getElementById('munEstimado').textContent = total.toLocaleString('es-AR');
  document.getElementById('munRestante').textContent = restante.toLocaleString('es-AR');
  document.getElementById('munRestanteBox').className = 'kpi ' + (restante < 0 ? 'kpi-rojo' : 'kpi-verde');
}

async function guardarCarga(silencioso) {
  const btn = document.getElementById('btnGuardarCarga');
  const estado = document.getElementById('cargaAutoSaveStatus');
  const fecha = document.getElementById('cargaFecha').value;
  const etapa = document.getElementById('cargaEtapa').value;
  if (!fecha) { if (!silencioso) alert('Seleccioná una fecha'); return; }

  const filas = [];
  document.querySelectorAll('.carga-table tbody tr').forEach(tr => {
    const fvc = tr.querySelector('.g-fvc');
    filas.push({
      fecha, etapa, grupo: tr.dataset.grupo,
      convocados: +tr.querySelector('.g-conv').value || 0,
      ausentes: +tr.querySelector('.g-aus').value || 0,
      tutorias: +tr.querySelector('.g-tut').value || 0,
      virtual: +tr.querySelector('.g-virt').value || 0,
      fv_comprobacion: fvc ? (+fvc.value || 0) : 0
    });
  });

  if (silencioso) { estado.className = 'carga-autosave as-guardando'; estado.textContent = 'Guardando...'; }
  else { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const { error: errRegistros } = await supabaseClient
      .from('pae_registros')
      .upsert(filas, { onConflict: 'fecha,etapa,grupo' });
    if (errRegistros) throw errRegistros;

    const { error: errMunicion } = await supabaseClient
      .from('pae_municion')
      .upsert([{ fecha, etapa, mun_retirada: +document.getElementById('munRetirada').value || 0 }], { onConflict: 'fecha,etapa' });
    if (errMunicion) throw errMunicion;

    if (silencioso) {
      estado.className = 'carga-autosave as-guardado';
      estado.textContent = 'Guardado automáticamente ✓';
    } else {
      btn.textContent = 'Guardado ✓';
      setTimeout(() => { btn.textContent = 'Actualizar carga del día'; btn.disabled = false; }, 1200);
      actualizarBanner(fecha, etapa, true);
    }
  } catch (e) {
    if (silencioso) {
      estado.className = 'carga-autosave as-error';
      estado.textContent = 'No se pudo guardar automáticamente: ' + (e.message || e);
    } else {
      btn.disabled = false;
      btn.textContent = 'Guardar carga del día';
      alert('No se pudo guardar: ' + (e.message || e));
    }
  }
}

function programarAutoGuardado() {
  const fecha = document.getElementById('cargaFecha').value;
  if (!fecha) return;
  const estado = document.getElementById('cargaAutoSaveStatus');
  estado.className = 'carga-autosave as-pendiente';
  estado.textContent = 'Cambios sin guardar...';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => guardarCarga(true), 1800);
}

function actualizarBanner(fecha, etapa, existe) {
  const banner = document.getElementById('cargaBanner');
  if (existe) {
    banner.className = 'carga-banner carga-banner-editar';
    banner.textContent = 'Modificando el registro existente del ' + fmtFecha(fecha) + ' — ' + etapa + '.';
    document.getElementById('btnGuardarCarga').textContent = 'Actualizar carga del día';
  } else {
    banner.className = 'carga-banner carga-banner-nueva';
    banner.textContent = 'Nueva carga para el ' + fmtFecha(fecha) + ' — ' + etapa + '.';
    document.getElementById('btnGuardarCarga').textContent = 'Guardar carga del día';
  }
}

async function exportarImagenDelDia() {
  const btn = document.getElementById('btnExportarImagen');
  btn.disabled = true;
  btn.textContent = 'Generando...';

  try {
    const fecha = document.getElementById('cargaFecha').value;
    const etapa = document.getElementById('cargaEtapa').value;

    // Totales acumulados por etapa (para los 3 bloques de abajo)
    const registrosTodo = await fetchRegistrosDesde('2000-01-01');
    const porEtapaAcum = agregarPorEtapa(registrosTodo);

    // Filas de grupo y totales del día, leídos directo del formulario
    const filasGrupo = [];
    let totConv = 0, totAus = 0, totTut = 0, totVirt = 0;
    let ejercicio = 0, tutoriasUso = 0, comprobacion = 0, fvPresentes = 0;
    document.querySelectorAll('.carga-table tbody tr').forEach(tr => {
      const grupo = tr.dataset.grupo;
      const conv = +tr.querySelector('.g-conv').value || 0;
      const aus = +tr.querySelector('.g-aus').value || 0;
      const tut = +tr.querySelector('.g-tut').value || 0;
      const virt = +tr.querySelector('.g-virt').value || 0;
      const fvcEl = tr.querySelector('.g-fvc');
      const fvc = fvcEl ? (+fvcEl.value || 0) : null;
      const pres = Math.max(0, conv - aus);
      filasGrupo.push({ grupo, conv, aus, pres, tut, virt, fvc });
      totConv += conv; totAus += aus; totTut += tut; totVirt += virt;
      if (fvcEl) {
        ejercicio += Math.max(0, pres - virt) * 20;
        tutoriasUso += tut * 10;
        comprobacion += (fvc || 0) * 10;
        fvPresentes += Math.max(0, pres - virt);
      }
    });
    const totPres = Math.max(0, totConv - totAus);
    const retirada = +document.getElementById('munRetirada').value || 0;
    const totalMun = ejercicio + tutoriasUso + comprobacion;
    const restante = retirada - totalMun;

    const html = construirHtmlExportImagen({
      fecha, etapa, filasGrupo, totConv, totAus, totPres, totTut, totVirt,
      retirada, ejercicio, tutoriasUso, comprobacion, totalMun, restante, fvPresentes,
      porEtapaAcum
    });

    const contenedor = document.createElement('div');
    contenedor.style.position = 'fixed';
    contenedor.style.left = '-9999px';
    contenedor.style.top = '0';
    contenedor.style.width = '900px';
    contenedor.innerHTML = html;
    document.body.appendChild(contenedor);

    await exportarElementoComoPNG(contenedor, 'PAE_' + etapa.replace(' ', '') + '_' + fecha.replace(/-/g, '') + '.png');
    contenedor.remove();
  } catch (e) {
    alert('No se pudo exportar la imagen: ' + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Exportar imagen';
  }
}

function boxMun(color, label, val) {
  return `<div style="flex:1; min-width:110px; border-left:4px solid ${color}; padding:10px 14px; background:#f8f9fb;">
    <div style="font-size:10.5px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">${label}</div>
    <div style="font-size:22px; font-weight:800; color:#1c2230;">${val.toLocaleString('es-AR')}</div>
  </div>`;
}

function bloqueTotales(titulo, datos) {
  return `
    <div style="background:#fff; border:1px solid #e2e5ec; border-radius:12px; padding:18px 20px; margin-top:14px;">
      <div style="font-size:12.5px; font-weight:800; color:#1a2657; text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e5ec;">${titulo}</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        ${boxMun('#34499e', 'Convocados', datos.convocados)}
        ${boxMun('#2f7d5a', 'Presentes', datos.presentes)}
        ${boxMun('#b3402f', 'Ausentes', datos.ausentes)}
        ${boxMun('#c98a2b', 'Tutorías', datos.tutorias)}
        ${boxMun('#2f7d5a', 'Virtual', datos.virtual)}
      </div>
    </div>`;
}

function construirHtmlExportImagen(d) {
  const filasHTML = d.filasGrupo.map(f => `
    <tr>
      <td style="text-align:left; font-weight:600; padding:9px 14px; border-bottom:1px solid #f0f0f0;">${f.grupo}</td>
      <td style="text-align:center; padding:9px; border-bottom:1px solid #f0f0f0;">${f.conv}</td>
      <td style="text-align:center; padding:9px; border-bottom:1px solid #f0f0f0;">${f.aus}</td>
      <td style="text-align:center; padding:9px; border-bottom:1px solid #f0f0f0;"><span style="background:#eef1f6; padding:3px 10px; border-radius:6px; font-weight:700; color:${f.pres > 0 ? '#2f7d5a' : '#b3402f'};">${f.pres}</span></td>
      <td style="text-align:center; padding:9px; border-bottom:1px solid #f0f0f0;">${f.tut}</td>
      <td style="text-align:center; padding:9px; border-bottom:1px solid #f0f0f0;">${f.virt}</td>
      <td style="text-align:center; padding:9px; border-bottom:1px solid #f0f0f0;">${f.fvc === null ? '—' : f.fvc}</td>
    </tr>`).join('');

  const ahora = new Date();
  const generado = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
    ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif; background:#f6f7fb; padding:22px; width:856px;">

    <div style="background:linear-gradient(135deg,#0b1229,#1a2657); border-radius:14px; padding:22px 26px; display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px;">
      <div>
        <div style="color:#fff; font-size:22px; font-weight:800;">Plan Anual de Entrenamiento</div>
        <div style="color:rgba(255,255,255,.55); font-size:12px; margin-top:2px; letter-spacing:.5px;">DIVISIÓN TIRO</div>
        <div style="color:rgba(255,255,255,.75); font-size:12.5px; margin-top:8px;">Fecha: ${fmtFecha(d.fecha)} | Generado: ${generado}</div>
      </div>
      <div style="background:rgba(255,255,255,.15); color:#fff; font-weight:700; font-size:13px; padding:8px 18px; border-radius:20px; white-space:nowrap;">${d.etapa}</div>
    </div>

    <div style="background:#fff; border-radius:12px; overflow:hidden; margin-bottom:18px;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th style="background:#f6f7fb;"></th>
            <th colspan="5" style="background:#1a2657; color:#fff; padding:9px; font-size:11px; text-transform:uppercase; letter-spacing:.5px;">PAE</th>
            <th style="background:#1a2657; color:#fff; padding:9px; font-size:11px; text-transform:uppercase; letter-spacing:.5px;">Fuego vivo</th>
          </tr>
          <tr style="background:#e7eaf6;">
            <th style="text-align:left; padding:9px 14px; color:#1a2657; font-size:11px; text-transform:uppercase;">Grupo</th>
            <th style="padding:9px; color:#1a2657; font-size:11px; text-transform:uppercase;">Convocados</th>
            <th style="padding:9px; color:#1a2657; font-size:11px; text-transform:uppercase;">Ausentes</th>
            <th style="padding:9px; color:#1a2657; font-size:11px; text-transform:uppercase;">Presentes</th>
            <th style="padding:9px; color:#1a2657; font-size:11px; text-transform:uppercase;">Tutorías</th>
            <th style="padding:9px; color:#1a2657; font-size:11px; text-transform:uppercase;">Virtual</th>
            <th style="padding:9px; color:#1a2657; font-size:11px; text-transform:uppercase;">Comprobación</th>
          </tr>
        </thead>
        <tbody>${filasHTML}</tbody>
      </table>
    </div>

    <div style="background:#fff; border-radius:12px; padding:18px 20px; margin-bottom:18px;">
      <div style="font-size:12.5px; font-weight:800; color:#1a2657; text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e5ec;">Munición</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        ${boxMun('#1a2657', 'Retirada', d.retirada)}
        ${boxMun('#34499e', 'Usada ejercicio', d.ejercicio)}
        ${boxMun('#34499e', 'Usada tutorías', d.tutoriasUso)}
        ${boxMun('#c98a2b', 'Total utilizado', d.totalMun)}
        ${boxMun(d.restante < 0 ? '#b3402f' : '#2f7d5a', 'Restante armería', d.restante)}
        ${boxMun('#2f7d5a', 'T. Fuego vivo', d.fvPresentes)}
      </div>
    </div>

    ${bloqueTotales('Totales PAE Diario — ' + fmtFecha(d.fecha), { convocados: d.totConv, presentes: d.totPres, ausentes: d.totAus, tutorias: d.totTut, virtual: d.totVirt })}
    ${bloqueTotales('Totales PAE I — hasta ' + fmtFecha(ETAPA1_FECHA_FIN), d.porEtapaAcum['Etapa 1'])}
    ${bloqueTotales('Totales PAE II — desde ' + fmtFecha(sumarDiasISO(ETAPA1_FECHA_FIN, 1)), d.porEtapaAcum['Etapa 2'])}
    ${bloqueTotales('Totales PAE General', d.porEtapaAcum.general)}
  </div>`;
}

function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d + dias);
  return fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');
}
