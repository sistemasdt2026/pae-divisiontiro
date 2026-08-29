// ============================================================
// Exportaciones — Excel (SheetJS) e imagen PNG (html2canvas)
// ============================================================

function exportarExcel(nombreArchivo, hojas) {
  // hojas: [{ nombre: 'Hoja1', filas: [ {col1:v, col2:v}, ... ] }, ...]
  const wb = XLSX.utils.book_new();
  hojas.forEach(h => {
    const ws = XLSX.utils.json_to_sheet(h.filas);
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.substring(0, 31));
  });
  XLSX.writeFile(wb, nombreArchivo);
}

async function exportarElementoComoPNG(elemento, nombreArchivo) {
  const canvas = await html2canvas(elemento, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.download = nombreArchivo;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
