// Report generation: Excel (ExcelJS) and PDF (jsPDF). The heavy libraries are
// imported dynamically so they only load when a report is actually generated.

const REPORT_TITLE = 'Eti-Osa 3 Special CDS'
const REPORT_SUBTITLE = 'Clearance Attendance Report'
const BRAND = '1B6B3A'

function fmtTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('en-NG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// rows: [{ full_name, state_code, registered_at, queue_number, served_at }]
function buildSummary(rows) {
  const total = rows.length
  const served = rows.filter(r => !!r.served_at).length
  return { total, served, waiting: total - served }
}

export async function generateExcelReport({ rows, sessionLabel }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Attendance')

  ws.columns = [
    { width: 8 },   // Queue #
    { width: 32 },  // Full name
    { width: 20 },  // State code
    { width: 26 },  // Registered time
  ]

  // Title
  ws.mergeCells('A1:D1')
  const t = ws.getCell('A1')
  t.value = REPORT_TITLE
  t.font = { size: 16, bold: true, color: { argb: 'FF' + BRAND } }
  t.alignment = { horizontal: 'center' }

  ws.mergeCells('A2:D2')
  const s = ws.getCell('A2')
  s.value = REPORT_SUBTITLE
  s.font = { size: 12, bold: true, color: { argb: 'FF334155' } }
  s.alignment = { horizontal: 'center' }

  ws.mergeCells('A3:D3')
  const m = ws.getCell('A3')
  m.value = `${sessionLabel}    Generated: ${fmtTime(Date.now())}`
  m.font = { size: 10, color: { argb: 'FF64748B' } }
  m.alignment = { horizontal: 'center' }

  // Summary
  const sum = buildSummary(rows)
  ws.mergeCells('A5:D5')
  const sm = ws.getCell('A5')
  sm.value = `Total registered: ${sum.total}      Served: ${sum.served}      Not served: ${sum.waiting}`
  sm.font = { size: 11, bold: true, color: { argb: 'FF0F172A' } }
  sm.alignment = { horizontal: 'center' }

  // Header row
  const headerRowIdx = 7
  const header = ws.getRow(headerRowIdx)
  header.values = ['Queue #', 'Full Name', 'State Code', 'Registered Time']
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND } }
    cell.alignment = { horizontal: 'left', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }
  })

  // Data
  const sorted = [...rows].sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0))
  sorted.forEach((r, i) => {
    const row = ws.getRow(headerRowIdx + 1 + i)
    row.values = [r.queue_number, r.full_name, r.state_code, fmtTime(r.registered_at)]
    if (i % 2 === 1) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    }
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownload(blob, `eti-osa-3-attendance-${Date.now()}.xlsx`)
}

export async function generatePdfReport({ rows, sessionLabel }) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.setTextColor(27, 107, 58)
  doc.text(REPORT_TITLE, pageWidth / 2, 18, { align: 'center' })

  doc.setFontSize(12)
  doc.setTextColor(51, 65, 85)
  doc.text(REPORT_SUBTITLE, pageWidth / 2, 26, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(`${sessionLabel}    Generated: ${fmtTime(Date.now())}`, pageWidth / 2, 33, { align: 'center' })

  const sum = buildSummary(rows)
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text(
    `Total registered: ${sum.total}     Served: ${sum.served}     Not served: ${sum.waiting}`,
    pageWidth / 2, 41, { align: 'center' }
  )

  const sorted = [...rows].sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0))
  autoTable(doc, {
    startY: 47,
    head: [['Queue #', 'Full Name', 'State Code', 'Registered Time']],
    body: sorted.map(r => [r.queue_number, r.full_name, r.state_code, fmtTime(r.registered_at)]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [27, 107, 58], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 12, right: 12 },
  })

  doc.save(`eti-osa-3-attendance-${Date.now()}.pdf`)
}
