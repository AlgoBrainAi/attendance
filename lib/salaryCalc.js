import { getWorkingDays, getPrevMonth, formatYearMonth } from './dateUtils';
import { getAttendance } from './storage';

export const STATUS_CYCLE  = ['', 'P', 'A', 'WFH', 'L', 'H'];
export const STATUS_LABELS = { '':'Unmarked','P':'Present','A':'Absent','WFH':'Work From Home','L':'Leave','H':'Half Day' };

export const STATUS_STYLE  = {
  '':    'bg-gray-100 text-gray-400 cursor-pointer hover:bg-gray-200',
  'P':   'bg-green-500 text-white font-bold cursor-pointer hover:bg-green-600',
  'A':   'bg-red-500 text-white font-bold cursor-pointer hover:bg-red-600',
  'WFH': 'bg-blue-500 text-white font-bold cursor-pointer hover:bg-blue-600',
  'L':   'bg-amber-500 text-white font-bold cursor-pointer hover:bg-amber-600',
  'H':   'bg-purple-500 text-white font-bold cursor-pointer hover:bg-purple-600',
};

export function getNextStatus(cur) {
  const i = STATUS_CYCLE.indexOf(cur || '');
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

function countStats(empAtt) {
  const s = { P:0, A:0, WFH:0, L:0, H:0 };
  Object.values(empAtt || {}).forEach(v => { if (s[v] !== undefined) s[v]++; });
  return s;
}

export function calculateSalary(emp, year, month, attendanceData, settings) {
  const workingDays     = getWorkingDays(year, month, settings).length;
  const empAtt          = attendanceData[emp.id] || {};
  const stats           = countStats(empAtt);
  const perDay          = emp.salary / workingDays;

  // Previous month: if no A or L → bonus paid leave quota = 2, else 1
  const prev = getPrevMonth(year, month);
  const prevAtt = getAttendance(formatYearMonth(prev.year, prev.month));
  const prevStats = countStats(prevAtt[emp.id] || {});
  const hadLeavePrev = prevStats.A > 0 || prevStats.L > 0;
  const quota = hadLeavePrev ? 1 : 2;

  const totalNonWork    = stats.A + stats.L;
  const paidLeaves      = Math.min(totalNonWork, quota);
  const unpaidLeaves    = totalNonWork - paidLeaves;

  const effectiveDays   = stats.P + stats.WFH + paidLeaves + stats.H * 0.5;
  const netSalary       = Math.round(perDay * effectiveDays * 100) / 100;
  const deduction       = Math.round((emp.salary - netSalary) * 100) / 100;

  return {
    workingDays, perDay: Math.round(perDay * 100) / 100,
    ...stats,
    quota, paidLeaves, unpaidLeaves, hadLeavePrev,
    effectiveDays: Math.round(effectiveDays * 100) / 100,
    grossSalary: emp.salary, deduction, netSalary,
  };
}
