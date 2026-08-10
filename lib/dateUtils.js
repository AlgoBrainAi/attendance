export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
export const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function getMonthDays(year, month) {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month, i + 1));
}

export function getSaturdayNumber(date) {
  if (date.getDay() !== 6) return 0;
  let n = 0;
  for (let d = 1; d <= date.getDate(); d++) {
    if (new Date(date.getFullYear(), date.getMonth(), d).getDay() === 6) n++;
  }
  return n;
}

export function isWeekOff(date, settings) {
  const day = date.getDay();
  if (day === 0) return settings?.allSundaysOff ?? true;
  if (day === 6) {
    const satNum = getSaturdayNumber(date);
    return (settings?.weekOffSaturdays ?? [1, 3]).includes(satNum);
  }
  return false;
}

export function isHoliday(date, settings) {
  return (settings?.holidays ?? []).some(h => h.day === date.getDate());
}

export function getHolidayName(date, settings) {
  return (settings?.holidays ?? []).find(h => h.day === date.getDate())?.name || '';
}

export function isDayOff(date, settings) {
  return isWeekOff(date, settings) || isHoliday(date, settings);
}

export function getWorkingDays(year, month, settings) {
  return getMonthDays(year, month).filter(d => !isDayOff(d, settings));
}

export function isDayActiveForEmployee(emp, date) {
  if (emp.joiningDate) {
    const j = new Date(emp.joiningDate); j.setHours(0,0,0,0);
    if (date < j) return false;
  }
  if (emp.resignedDate) {
    const r = new Date(emp.resignedDate); r.setHours(23,59,59,999);
    if (date > r) return false;
  }
  return true;
}

export function isEmployeeActiveInMonth(emp, year, month) {
  const monthStart = new Date(year, month, 1);
  const monthEnd   = new Date(year, month + 1, 0);
  if (emp.joiningDate && new Date(emp.joiningDate) > monthEnd) return false;
  if (emp.resignedDate && new Date(emp.resignedDate) < monthStart) return false;
  return true;
}

export function formatYearMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getPrevMonth(year, month) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

export function getNextMonth(year, month) {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}
