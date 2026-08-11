import { sbSelect, sbUpsert, sbDelete } from './supabase';

export const DEFAULT_SETTINGS = {
  weekOffSaturdays: [1, 3],
  allSundaysOff: true,
  holidays: [],
  customWeekOffs: [],
  weekOffExceptions: [],
};

// ─── Employees ────────────────────────────────────────────────────────────────

export async function getEmployees() {
  const rows = await sbSelect('employees', '?select=*&order=sort_order.asc');
  return rows.map(r => ({
    id:           r.id,
    name:         r.name,
    designation:  r.designation || '',
    salary:       Number(r.salary),
    joiningDate:  r.joining_date  || null,
    resignedDate: r.resigned_date || null,
  }));
}

export async function saveEmployees(employees) {
  if (!employees.length) return;
  await sbUpsert('employees', employees.map((e, idx) => ({
    id:            e.id,
    name:          e.name,
    designation:   e.designation || '',
    salary:        e.salary,
    joining_date:  e.joiningDate  || null,
    resigned_date: e.resignedDate || null,
    sort_order:    idx,
  })));
}

export async function deleteEmployee(id) {
  await sbDelete('employees', 'id', id);
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getAttendance(ym) {
  const rows = await sbSelect('attendance', `?year_month=eq.${ym}&select=employee_id,day_data`);
  const result = {};
  rows.forEach(r => { result[r.employee_id] = r.day_data || {}; });
  return result;
}

export async function saveAttendance(ym, empId, dayData) {
  await sbUpsert('attendance', { year_month: ym, employee_id: empId, day_data: dayData });
}

// ─── Month Settings ───────────────────────────────────────────────────────────

export async function getMonthSettings(ym) {
  const rows = await sbSelect('month_settings', `?year_month=eq.${ym}&select=data`);
  return rows.length ? { ...DEFAULT_SETTINGS, ...rows[0].data } : DEFAULT_SETTINGS;
}

export async function saveMonthSettings(ym, settings) {
  await sbUpsert('month_settings', { year_month: ym, data: settings });
}

// ─── One-time migration: localStorage → Supabase ─────────────────────────────

export async function migrateFromLocalStorage() {
  const raw  = localStorage.getItem('att_employees');
  const emps = raw ? JSON.parse(raw) : [];
  if (emps.length) await saveEmployees(emps);

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('att_attendance_')) {
      const ym  = key.replace('att_attendance_', '');
      const att = JSON.parse(localStorage.getItem(key) || '{}');
      for (const [empId, dayData] of Object.entries(att)) {
        await saveAttendance(ym, empId, dayData);
      }
    }
    if (key.startsWith('att_settings_')) {
      const ym   = key.replace('att_settings_', '');
      const sett = JSON.parse(localStorage.getItem(key) || '{}');
      await saveMonthSettings(ym, sett);
    }
  }
}
