import { getWorkingDays, isDayActiveForEmployee } from './dateUtils';

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
  // Only count working days when the employee was actually active (respects joining/resigned date)
  const workingDays   = getWorkingDays(year, month, settings).filter(d => isDayActiveForEmployee(emp, d)).length;
  const empAtt        = attendanceData[emp.id] || {};
  const stats         = countStats(empAtt);
  const perDay        = emp.salary / workingDays;

  // L (Leave) = paid — counts as a worked day, no deduction
  // A (Absent) = unpaid — deducted from salary
  const paidLeaves    = stats.L;
  const unpaidAbsent  = stats.A;

  const effectiveDays = stats.P + stats.WFH + paidLeaves + stats.H * 0.5;
  const netSalary     = Math.round(perDay * effectiveDays * 100) / 100;
  const deduction     = Math.round((emp.salary - netSalary) * 100) / 100;

  return {
    workingDays, perDay: Math.round(perDay * 100) / 100,
    ...stats,
    paidLeaves,
    unpaidAbsent,
    effectiveDays: Math.round(effectiveDays * 100) / 100,
    grossSalary: emp.salary, deduction, netSalary,
  };
}
