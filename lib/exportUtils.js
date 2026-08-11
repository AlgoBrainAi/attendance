import { getMonthDays, isWeekOff, isHoliday, getHolidayName, isDayActiveForEmployee, DAY_SHORT, MONTH_NAMES } from './dateUtils';
import { calculateSalary } from './salaryCalc';

// ─── Colour palette ────────────────────────────────────────────────────────────

const BG = {
  P:      'C6EFCE', // green
  A:      'FFC7CE', // pink-red
  WFH:    'DDEEFF', // light blue
  L:      'FFEB9C', // yellow
  H:      'BDD7EE', // steel blue
  WO:     'D9D9D9', // light grey
  HOL:    'E2EFDA', // light sage green
  HEADER: 'FFFF00', // yellow
  DAYS:   'D9EAD3', // soft green for day-of-week column
  DATE:   'FFF2CC', // light amber for date column
  SALARY: 'FCE4D6', // peach for salary header
  WHITE:  'FFFFFF',
};

const TEXT = {
  P:   '276221',
  A:   '9C0006',
  WFH: '003D7A',
  L:   '7D6608',
  H:   '1F4E79',
  WO:  '595959',
  HOL: '375623',
};

function cell(value, bgRgb, textRgb, bold = false, type = 's') {
  return {
    v: value,
    t: type,
    s: {
      fill: { fgColor: { rgb: bgRgb || BG.WHITE } },
      font: { bold, color: { rgb: textRgb || '000000' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
      border: {
        top:    { style: 'thin', color: { rgb: 'CCCCCC' } },
        bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
        left:   { style: 'thin', color: { rgb: 'CCCCCC' } },
        right:  { style: 'thin', color: { rgb: 'CCCCCC' } },
      },
    },
  };
}

function headerCell(value, bgRgb) {
  return cell(value, bgRgb || BG.HEADER, '000000', true);
}

// ─── Status → display value + colours ─────────────────────────────────────────

function statusCell(status) {
  switch (status) {
    case 'P':   return cell('P',        BG.P,   TEXT.P,   true);
    case 'A':   return cell('A',        BG.A,   TEXT.A,   true);
    case 'WFH': return cell('WFH',      BG.WFH, TEXT.WFH, true);
    case 'L':   return cell('Leave',    BG.L,   TEXT.L,   true);
    case 'H':   return cell('Half',     BG.H,   TEXT.H,   true);
    default:    return cell('-',        BG.WHITE, 'AAAAAA');
  }
}

// ─── Attendance sheet (dates = rows, employees = columns) ─────────────────────

function buildColoredAttSheet(XLSX, employees, year, month, attendance, settings) {
  const days = getMonthDays(year, month);
  const ws   = {};

  const numCols = employees.length + 2; // date col + employee cols + days col
  const numRows = days.length + 1;      // header row + one per day

  // ── Header row ──────────────────────────────────────────────────────────────

  ws[XLSX.utils.encode_cell({ r: 0, c: 0 })] = headerCell('Dates', BG.HEADER);

  employees.forEach((emp, i) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: i + 1 })] = headerCell(emp.name, BG.HEADER);
  });

  ws[XLSX.utils.encode_cell({ r: 0, c: numCols - 1 })] = headerCell('Days', BG.DAYS);

  // ── Data rows ────────────────────────────────────────────────────────────────

  days.forEach((d, ri) => {
    const row      = ri + 1;
    const dateStr  = `${String(d.getDate()).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    const dayName  = DAY_SHORT[d.getDay()];
    const wo       = isWeekOff(d, settings);
    const hol      = isHoliday(d, settings);
    const holName  = hol ? (getHolidayName(d, settings) || 'Holiday') : '';

    // Date cell
    ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = cell(dateStr, BG.DATE, '000000', false);

    // Employee status cells
    employees.forEach((emp, ci) => {
      const addr = XLSX.utils.encode_cell({ r: row, c: ci + 1 });
      if (wo) {
        ws[addr] = cell('Week Off', BG.WO, TEXT.WO);
      } else if (hol) {
        ws[addr] = cell(holName, BG.HOL, TEXT.HOL, true);
      } else if (!isDayActiveForEmployee(emp, d)) {
        ws[addr] = cell('-', BG.WHITE, 'CCCCCC');
      } else {
        const s = (attendance[emp.id] || {})[String(d.getDate())] || '';
        ws[addr] = statusCell(s);
      }
    });

    // Days cell
    ws[XLSX.utils.encode_cell({ r: row, c: numCols - 1 })] = cell(dayName, BG.DAYS, '375623', true);
  });

  // ── Sheet metadata ────────────────────────────────────────────────────────────

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: numRows - 1, c: numCols - 1 } });

  ws['!cols'] = [
    { wch: 13 },                          // Dates
    ...employees.map(() => ({ wch: 11 })), // Employee cols
    { wch: 6 },                           // Days
  ];

  ws['!rows'] = Array.from({ length: numRows }, (_, i) => ({ hpt: i === 0 ? 20 : 16 }));

  return ws;
}

// ─── Salary sheet ──────────────────────────────────────────────────────────────

function buildColoredSalarySheet(XLSX, employees, year, month, attendance, settings) {
  const ws = {};

  const headers = [
    '#', 'Employee', 'Designation', 'Monthly Salary', 'Working Days',
    'Present', 'WFH', 'Absent', 'Leave', 'Half Days',
    'Paid Leave Quota', 'Paid Leaves', 'Unpaid Leaves',
    'Per Day Salary', 'Effective Days', 'Deduction', 'Net Salary',
  ];

  // Header row
  headers.forEach((h, ci) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = headerCell(h, BG.SALARY);
  });

  // Data rows
  employees.forEach((emp, ri) => {
    const row = ri + 1;
    const c   = calculateSalary(emp, year, month, attendance, settings);
    const vals = [
      ri + 1, emp.name, emp.designation || '', emp.salary, c.workingDays,
      c.P, c.WFH, c.A, c.L, c.H,
      c.quota, c.paidLeaves, c.unpaidLeaves,
      c.perDay, c.effectiveDays, c.deduction, c.netSalary,
    ];
    const rowBg = ri % 2 === 0 ? BG.WHITE : 'F5F5F5';
    vals.forEach((v, ci) => {
      const isCurrency = [3, 13, 15, 16].includes(ci);
      ws[XLSX.utils.encode_cell({ r: row, c: ci })] = {
        v,
        t: typeof v === 'number' ? 'n' : 's',
        s: {
          fill: { fgColor: { rgb: ci === 15 && c.deduction > 0 ? 'FFC7CE' : ci === 16 ? 'C6EFCE' : rowBg } },
          font: { sz: 10, bold: [1, 16].includes(ci) },
          alignment: { horizontal: typeof v === 'number' ? 'right' : 'left', vertical: 'center' },
          numFmt: isCurrency ? '"₹"#,##0.00' : undefined,
          border: {
            top:    { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left:   { style: 'thin', color: { rgb: 'CCCCCC' } },
            right:  { style: 'thin', color: { rgb: 'CCCCCC' } },
          },
        },
      };
    });
  });

  const numRows = employees.length + 1;
  const numCols = headers.length;

  ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: numRows - 1, c: numCols - 1 } });
  ws['!cols'] = [
    { wch: 4 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 13 },
    { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 13 },
  ];
  ws['!rows']  = Array.from({ length: numRows }, () => ({ hpt: 18 }));

  return ws;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function downloadReport(type, employees, year, month, attendance, settings) {
  const XLSX = await import('xlsx-js-style');
  const wb   = XLSX.utils.book_new();
  const mn   = MONTH_NAMES[month];

  const attWS = buildColoredAttSheet(XLSX, employees, year, month, attendance, settings);
  XLSX.utils.book_append_sheet(wb, attWS, 'Attendance');

  if (type === 'both') {
    const salWS = buildColoredSalarySheet(XLSX, employees, year, month, attendance, settings);
    XLSX.utils.book_append_sheet(wb, salWS, 'Salary');
  }

  const filename = type === 'both'
    ? `Attendance_Salary_${mn}_${year}.xlsx`
    : `Attendance_${mn}_${year}.xlsx`;

  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
