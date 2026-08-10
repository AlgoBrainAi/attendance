import { getMonthDays, isWeekOff, isHoliday, isDayActiveForEmployee, DAY_SHORT, MONTH_NAMES } from './dateUtils';
import { calculateSalary } from './salaryCalc';

function buildAttRows(employees, year, month, attendance, settings) {
  const days = getMonthDays(year, month);
  const header = ['#', 'Employee', 'Designation', 'Salary',
    ...days.map(d => `${d.getDate()}\n${DAY_SHORT[d.getDay()]}`),
    'Present', 'WFH', 'Absent', 'Leave', 'Half Day'];

  const rows = employees.map((emp, i) => {
    const ea = attendance[emp.id] || {};
    let P=0, A=0, WFH=0, L=0, H=0;
    const cells = days.map(d => {
      if (isWeekOff(d, settings))            return 'WO';
      if (isHoliday(d, settings))            return 'HOL';
      if (!isDayActiveForEmployee(emp, d))   return '-';
      const s = ea[String(d.getDate())] || '';
      if (s==='P') P++; else if (s==='A') A++;
      else if (s==='WFH') WFH++; else if (s==='L') L++; else if (s==='H') H++;
      return s || '';
    });
    return [i+1, emp.name, emp.designation||'', emp.salary, ...cells, P, WFH, A, L, H];
  });

  return [header, ...rows];
}

function buildSalaryRows(employees, year, month, attendance, settings) {
  const header = ['#','Employee','Designation','Monthly Salary','Working Days',
    'Present','WFH','Absent','Leave','Half Days',
    'Paid Leave Quota','Paid Leaves','Unpaid Leaves',
    'Per Day Salary','Effective Days','Deduction','Net Salary'];

  const rows = employees.map((emp, i) => {
    const c = calculateSalary(emp, year, month, attendance, settings);
    return [
      i+1, emp.name, emp.designation||'', emp.salary, c.workingDays,
      c.P, c.WFH, c.A, c.L, c.H,
      c.quota, c.paidLeaves, c.unpaidLeaves,
      c.perDay, c.effectiveDays, c.deduction, c.netSalary
    ];
  });

  return [header, ...rows];
}

function styleSheet(ws, XLSX) {
  return ws; // xlsx community edition has limited styling; we keep it data-focused
}

export async function downloadReport(type, employees, year, month, attendance, settings) {
  const XLSX = await import('xlsx');
  const wb   = XLSX.utils.book_new();
  const mn   = MONTH_NAMES[month];

  const attRows = buildAttRows(employees, year, month, attendance, settings);
  const attWS   = XLSX.utils.aoa_to_sheet(attRows);
  XLSX.utils.book_append_sheet(wb, attWS, 'Attendance');

  if (type === 'both') {
    const salRows = buildSalaryRows(employees, year, month, attendance, settings);
    const salWS   = XLSX.utils.aoa_to_sheet(salRows);
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
