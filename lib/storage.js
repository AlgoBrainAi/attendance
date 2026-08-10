const EMP_KEY   = 'att_employees';
const ATT_PRE   = 'att_attendance_';
const SET_PRE   = 'att_settings_';

export const DEFAULT_SETTINGS = {
  weekOffSaturdays: [1, 3],
  allSundaysOff: true,
  holidays: [],
};

function safe(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export const getEmployees     = ()   => typeof window === 'undefined' ? [] : safe(EMP_KEY, []);
export const saveEmployees    = (v)  => localStorage.setItem(EMP_KEY, JSON.stringify(v));

export const getAttendance    = (ym) => typeof window === 'undefined' ? {} : safe(`${ATT_PRE}${ym}`, {});
export const saveAttendance   = (ym, v) => localStorage.setItem(`${ATT_PRE}${ym}`, JSON.stringify(v));

export const getMonthSettings = (ym) => typeof window === 'undefined' ? DEFAULT_SETTINGS : safe(`${SET_PRE}${ym}`, DEFAULT_SETTINGS);
export const saveMonthSettings= (ym, v) => localStorage.setItem(`${SET_PRE}${ym}`, JSON.stringify(v));
