// ============================================================
// Informe PDF — Etapa 1 / Etapa 2 / General, con KPIs y
// gráficos, usando jsPDF + jsPDF-AutoTable
// ============================================================

function crearChartOffscreen(tipo, data, options, tituloGrafico) {
  const canvas = document.createElement('canvas');
  canvas.width = 700;
  canvas.height = 320;
  canvas.style.position = 'fixed';
  canvas.style.left = '-9999px';
  document.body.appendChild(canvas);

  const opcionesBase = {
    responsive: false,
    animation: false,
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 13 } } },
      title: tituloGrafico ? { display: true, text: tituloGrafico, font: { size: 15, weight: 'bold' }, color: '#1c2230', padding: { bottom: 12 } } : undefined
    }
  };

  const chart = new Chart(canvas, {
    type: tipo,
    data,
    options: Object.assign(opcionesBase, options || {}, {
      plugins: Object.assign({}, opcionesBase.plugins, (options && options.plugins) || {})
    })
  });

  const imagenBase64 = chart.toBase64Image('image/png', 1);
  chart.destroy();
  canvas.remove();
  return imagenBase64;
}

function agregarPorFechaSimple(registros) {
  const porFecha = {};
  registros.forEach(r => {
    if (!porFecha[r.fecha]) porFecha[r.fecha] = { convocados: 0, presentes: 0 };
    porFecha[r.fecha].convocados += r.convocados;
    porFecha[r.fecha].presentes += r.presentes;
  });
  return porFecha;
}

function construirNarrativa(titulo, registros, agr, munAgr, tutAgr) {
  if (registros.length === 0) {
    return `No hay registros cargados para ${titulo.toLowerCase()} en el período analizado.`;
  }
  const pct = agr.convocados > 0 ? Math.round(agr.presentes / agr.convocados * 100) : 0;
  const dias = new Set(registros.map(r => r.fecha)).size;

  const porFecha = agregarPorFechaSimple(registros);
  let mejorDia = null, peorDia = null;
  Object.entries(porFecha).forEach(([fecha, d]) => {
    const p = d.convocados > 0 ? d.presentes / d.convocados : 0;
    if (!mejorDia || p > mejorDia.p) mejorDia = { fecha, p };
    if (!peorDia || p < peorDia.p) peorDia = { fecha, p };
  });

  let texto = `Durante ${dias} jornada${dias !== 1 ? 's' : ''} registrada${dias !== 1 ? 's' : ''}, se convocó a ${agr.convocados.toLocaleString('es-AR')} efectivos, de los cuales asistieron ${agr.presentes.toLocaleString('es-AR')} (${pct}% de presencia promedio) y estuvieron ausentes ${agr.ausentes.toLocaleString('es-AR')}. `;
  texto += `Participaron de forma virtual ${agr.virtual.toLocaleString('es-AR')} efectivos. `;
  texto += `Se registraron ${tutAgr.total.toLocaleString('es-AR')} tutorías (${tutAgr.masc.toLocaleString('es-AR')} masculino, ${tutAgr.fem.toLocaleString('es-AR')} femenino)${tutAgr.gradoTop ? `, siendo "${tutAgr.gradoTop}" el grado con más tutorías registradas (${tutAgr.gradoTopCount})` : ''}. `;
  texto += `El consumo total de munición fue de ${munAgr.total.toLocaleString('es-AR')} cartuchos. `;
  if (mejorDia && peorDia && dias > 1) {
    texto += `La jornada con mayor presencia fue el ${fmtFecha(mejorDia.fecha)} (${Math.round(mejorDia.p * 100)}%), mientras que la de menor presencia fue el ${fmtFecha(peorDia.fecha)} (${Math.round(peorDia.p * 100)}%).`;
  }
  return texto;
}

function rankingGrados(tutorias) {
  const conteo = {};
  tutorias.forEach(t => {
    const g = (t.grado || 'SIN GRADO').trim().toUpperCase();
    conteo[g] = (conteo[g] || 0) + 1;
  });
  return Object.entries(conteo).sort((a, b) => b[1] - a[1]);
}

function construirSeccionPdf(doc, y, titulo, registros, municionTodo, grupos, tutoriasSeccion) {
  const agr = agregarPorEtapa(registros).general;
  const municionFiltrada = municionTodo.filter(m => registros.some(r => r.fecha === m.fecha && r.etapa === m.etapa));
  const munAgr = sumarMunicionUsada(registros, municionFiltrada);
  const tutAgr = agregarTutorias(tutoriasSeccion);

  doc.setFillColor(52, 73, 158);
  doc.rect(0, y, 210, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(titulo, 14, y + 7);
  y += 16;

  // Resumen narrativo
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9.5);
  doc.setFont(undefined, 'normal');
  const narrativa = construirNarrativa(titulo, registros, agr, munAgr, tutAgr);
  const lineas = doc.splitTextToSize(narrativa, 182);
  doc.text(lineas, 14, y);
  y += lineas.length * 4.6 + 6;

  // Tabla de KPIs generales
  doc.autoTable({
    startY: y,
    head: [['Convocados', 'Presentes', 'Ausentes', 'Virtual', 'Munición usada']],
    body: [[agr.convocados, agr.presentes, agr.ausentes, agr.virtual, munAgr.total]],
    theme: 'grid',
    headStyles: { fillColor: [231, 234, 246], textColor: [26, 38, 87], fontStyle: 'bold' },
    styles: { halign: 'center', fontSize: 9 },
    margin: { left: 14, right: 14 }
  });
  y = doc.lastAutoTable.finalY + 8;

  // Tabla de Tutorías
  doc.autoTable({
    startY: y,
    head: [['Tutorías totales', 'Masculino', 'Femenino']],
    body: [[tutAgr.total, tutAgr.masc, tutAgr.fem]],
    theme: 'grid',
    headStyles: { fillColor: [251, 241, 224], textColor: [168, 111, 28], fontStyle: 'bold' },
    styles: { halign: 'center', fontSize: 9 },
    margin: { left: 14, right: 14 }
  });
  y = doc.lastAutoTable.finalY + 10;

  if (registros.length > 0) {
    // Gráfico de presencia por día
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text('Convocados vs. presentes por jornada — permite ver la asistencia día a día.', 14, y);
    y += 5;

    const porFecha = agregarPorFechaSimple(registros);
    const fechas = Object.keys(porFecha).sort();
    const imgPresencia = crearChartOffscreen('bar', {
      labels: fechas.map(fmtFecha),
      datasets: [
        { label: 'Convocados', data: fechas.map(f => porFecha[f].convocados), backgroundColor: 'rgba(52,73,158,.3)' },
        { label: 'Presentes', data: fechas.map(f => porFecha[f].presentes), backgroundColor: 'rgba(47,125,90,.75)' }
      ]
    }, {
      scales: {
        x: { title: { display: true, text: 'Fecha' } },
        y: { title: { display: true, text: 'Cantidad de efectivos' } }
      }
    }, 'Presencia diaria — ' + titulo);
    doc.addImage(imgPresencia, 'PNG', 14, y, 182, 80);
    y += 86;

    // Gráfico de % presencia por grupo
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text('Porcentaje de presencia por grupo — ayuda a detectar qué grupos tienen mayor ausentismo.', 14, y);
    y += 5;

    const porGrupo = grupos.map(g => {
      const filas = registros.filter(r => r.grupo === g.grupo);
      const conv = filas.reduce((s, r) => s + r.convocados, 0);
      const pres = filas.reduce((s, r) => s + r.presentes, 0);
      return conv > 0 ? Math.round(pres / conv * 100) : 0;
    });
    const imgGrupo = crearChartOffscreen('bar', {
      labels: grupos.map(g => g.grupo.split(' - ')[0]),
      datasets: [{ label: '% Presencia', data: porGrupo, backgroundColor: 'rgba(201,138,43,.75)' }]
    }, {
      plugins: { legend: { display: false } },
      scales: {
        y: { max: 100, title: { display: true, text: '% de presencia' } },
        x: { title: { display: true, text: 'Grupo' } }
      }
    }, '% de presencia por grupo — ' + titulo);
    doc.addImage(imgGrupo, 'PNG', 14, y, 182, 80);
    y += 86;

    // Salto de página si no entra el tercer gráfico completo
    if (y > 200) {
      doc.addPage();
      y = 14;
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(titulo + ' (continuación)', 14, y);
      y += 8;
    }

    // Gráfico de grados con más tutorías
    if (tutoriasSeccion.length > 0) {
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text('Cantidad de tutorías por grado, de mayor a menor.', 14, y);
      y += 5;

      const ranking = rankingGrados(tutoriasSeccion);
      const imgGrados = crearChartOffscreen('bar', {
        labels: ranking.map(([g]) => g),
        datasets: [{ label: 'Tutorías', data: ranking.map(([, c]) => c), backgroundColor: 'rgba(52,73,158,.65)' }]
      }, {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Cantidad de tutorías' } }
        }
      }, 'Tutorías por grado — ' + titulo);
      doc.addImage(imgGrados, 'PNG', 14, y, 182, 80);
      y += 86;
    } else {
      doc.setFontSize(9.5);
      doc.setTextColor(90, 90, 90);
      doc.text('Sin tutorías registradas en esta sección.', 14, y);
      y += 8;
    }
  } else {
    doc.setFontSize(10);
    doc.text('Sin registros para esta sección.', 14, y);
    y += 10;
  }

  return y;
}

async function generarInformePdf() {
  const btn = document.getElementById('btnInformePdf');
  btn.disabled = true;
  btn.textContent = 'Generando...';

  try {
    const { registros, municion, grupos, tutorias } = window._estadData;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // Portada
    doc.setFillColor(11, 18, 41);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(201, 138, 43);
    doc.setFontSize(26);
    doc.setFont(undefined, 'bold');
    doc.text('PAE', 14, 130);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('Plan Anual de Entrenamiento', 14, 142);
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text('División Tiro', 14, 150);
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 200);
    const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    doc.text('Informe estadístico generado el ' + hoy, 14, 160);

    doc.setFontSize(9.5);
    doc.setTextColor(180, 185, 205);
    const intro = 'Este informe resume la asistencia, tutorías y consumo de munición del Plan Anual de Entrenamiento, organizado en tres secciones: Etapa 1, Etapa 2 y el acumulado General de ambas. Cada sección incluye un resumen en texto, una tabla con los totales principales, y dos gráficos: la evolución de convocados y presentes por jornada, y el porcentaje de presencia por grupo.';
    const introLineas = doc.splitTextToSize(intro, 182);
    doc.text(introLineas, 14, 172);

    // Secciones
    const secciones = [
      { titulo: 'Etapa 1 — Resumen', datos: registros.filter(r => r.etapa === 'Etapa 1'), tutorias: tutorias.filter(t => t.etapa === 'Etapa 1') },
      { titulo: 'Etapa 2 — Resumen', datos: registros.filter(r => r.etapa === 'Etapa 2'), tutorias: tutorias.filter(t => t.etapa === 'Etapa 2') },
      { titulo: 'General — Ambas etapas', datos: registros, tutorias: tutorias }
    ];

    secciones.forEach(sec => {
      doc.addPage();
      let y = 14;
      doc.setTextColor(30, 30, 30);
      y = construirSeccionPdf(doc, y, sec.titulo, sec.datos, municion, grupos, sec.tutorias);
    });

    const fechaHoy = hoyISO().split('-').reverse().join('-');
    doc.save('Informe_PAE_' + fechaHoy + '.pdf');
  } catch (e) {
    alert('No se pudo generar el informe: ' + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Informe PDF completo';
  }
}
