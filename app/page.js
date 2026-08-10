'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMonthDays, isWeekOff, isDayActiveForEmployee, isEmployeeActiveInMonth,
  formatYearMonth, getPrevMonth, getNextMonth, MONTH_NAMES, DAY_SHORT
} from '../lib/dateUtils';
import {
  getEmployees, saveEmployees, getAttendance, saveAttendance,
  getMonthSettings, saveMonthSettings, DEFAULT_SETTINGS
} from '../lib/storage';
import { STATUS_CYCLE, STATUS_LABELS, STATUS_STYLE, getNextStatus, calculateSalary } from '../lib/salaryCalc';
import { downloadReport } from '../lib/exportUtils';

// ─── Helpers ────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

// ─── Modal wrapper ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col ${wide ? 'w-full max-w-4xl' : 'w-full max-w-lg'}`}
           style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Employee Modal ──────────────────────────────────────────────────────────

function EmployeeModal({ initial, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(initial || {
    name: '', designation: '', salary: '', joiningDate: '', resignedDate: ''
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name.trim() && Number(form.salary) > 0 && form.joiningDate;

  return (
    <Modal title={initial ? 'Edit Employee' : 'Add Employee'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rahul Sharma" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Software Engineer" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Salary (₹) *</label>
          <input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="20000" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date *</label>
          <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.joiningDate} onChange={e => set('joiningDate', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resigned / Terminated Date</label>
          <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.resignedDate || ''} onChange={e => set('resignedDate', e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            Employee will still appear in the month they resigned, then auto-hidden from next month.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button disabled={!valid}
            onClick={() => onSave({ ...form, salary: Number(form.salary), id: form.id || uid() })}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-2 rounded-lg text-sm transition">
            {initial ? 'Save Changes' : 'Add Employee'}
          </button>
          {initial && onDelete && (
            <button onClick={() => onDelete(initial.id)}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg text-sm transition">
              Remove
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Week Off Settings Modal ─────────────────────────────────────────────────

function WeekOffModal({ yearMonth, settings, onSave, onClose }) {
  const [wos, setWos] = useState(settings.weekOffSaturdays || [1, 3]);

  const toggle = (n) => setWos(prev =>
    prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort()
  );

  return (
    <Modal title={`Week-Off Settings — ${yearMonth}`} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Sundays</p>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="w-4 h-4 rounded bg-gray-300 inline-block"></span>
            <span className="text-sm text-gray-600">All Sundays are always week-off</span>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Saturdays — select which are week-off</p>
          <div className="grid grid-cols-5 gap-2">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => toggle(n)}
                className={`py-2 rounded-lg text-sm font-medium border-2 transition
                  ${wos.includes(n)
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                {n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n === 4 ? '4th' : '5th'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Default: 1st &amp; 3rd Saturday off. 5th Saturday may not exist every month.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          This setting applies only to <strong>{yearMonth}</strong>. Each month can have independent week-off configuration.
        </div>

        <button onClick={() => onSave({ weekOffSaturdays: wos })}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg text-sm transition">
          Save Settings
        </button>
      </div>
    </Modal>
  );
}

// ─── Salary View Modal ───────────────────────────────────────────────────────

function SalaryModal({ employees, year, month, attendance, settings, onClose }) {
  const ym = formatYearMonth(year, month);

  return (
    <Modal title={`Salary Summary — ${MONTH_NAMES[month]} ${year}`} onClose={onClose} wide>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              {['#','Name','Salary','W.Days','P','WFH','A','L','H','Paid L','Unpaid L','Per Day','Net Salary','Deduction'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap border-b border-gray-100">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => {
              const c = calculateSalary(emp, year, month, attendance, settings);
              return (
                <tr key={emp.id} className="hover:bg-gray-50 border-b border-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i+1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                    {emp.name}
                    {emp.designation && <span className="text-gray-400 ml-1">· {emp.designation}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{fmt(emp.salary)}</td>
                  <td className="px-3 py-2 text-gray-600">{c.workingDays}</td>
                  <td className="px-3 py-2 text-green-700 font-medium">{c.P}</td>
                  <td className="px-3 py-2 text-blue-700">{c.WFH}</td>
                  <td className="px-3 py-2 text-red-700">{c.A}</td>
                  <td className="px-3 py-2 text-amber-700">{c.L}</td>
                  <td className="px-3 py-2 text-purple-700">{c.H}</td>
                  <td className="px-3 py-2 text-indigo-700">{c.paidLeaves}</td>
                  <td className="px-3 py-2 text-red-600">{c.unpaidLeaves}</td>
                  <td className="px-3 py-2 text-gray-600">{fmt(c.perDay)}</td>
                  <td className="px-3 py-2 font-bold text-gray-800">{fmt(c.netSalary)}</td>
                  <td className="px-3 py-2 text-red-600">{c.deduction > 0 ? `-${fmt(c.deduction)}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {employees.length === 0 && (
          <p className="text-center py-8 text-gray-400">No active employees this month.</p>
        )}
      </div>

      <div className="mt-5 bg-indigo-50 rounded-xl p-4 text-xs text-indigo-800 space-y-1">
        <p className="font-semibold">How salary is calculated:</p>
        <p>• Per Day = Monthly Salary ÷ Total Working Days in Month</p>
        <p>• Paid Leave Quota: 1 per month; increases to 2 if employee had <strong>zero</strong> A/L in previous month</p>
        <p>• Net = Per Day × (Present + WFH + Paid Leaves + Half Days × 0.5)</p>
        <p>• Working Days = All days minus Sundays and configured week-off Saturdays</p>
      </div>
    </Modal>
  );
}

// ─── Download Modal ──────────────────────────────────────────────────────────

function DownloadModal({ employees, year, month, attendance, settings, onClose }) {
  const [loading, setLoading] = useState(false);

  const handle = async (type) => {
    setLoading(true);
    try {
      await downloadReport(type, employees, year, month, attendance, settings);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Download Report" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 mb-4">
          Download report for <strong>{MONTH_NAMES[month]} {year}</strong> ({employees.length} employees)
        </p>
        <button onClick={() => handle('attendance')} disabled={loading}
          className="w-full flex items-center gap-3 px-4 py-3 border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl text-left transition disabled:opacity-50">
          <span className="text-2xl">📋</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Attendance Sheet Only</p>
            <p className="text-xs text-gray-500">Day-wise attendance for all employees</p>
          </div>
        </button>
        <button onClick={() => handle('both')} disabled={loading}
          className="w-full flex items-center gap-3 px-4 py-3 border-2 border-gray-200 hover:border-green-300 hover:bg-green-50 rounded-xl text-left transition disabled:opacity-50">
          <span className="text-2xl">📊</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Attendance + Salary Sheet</p>
            <p className="text-xs text-gray-500">Includes salary breakdown with deductions</p>
          </div>
        </button>
        {loading && <p className="text-center text-sm text-indigo-600 animate-pulse">Generating file…</p>}
      </div>
    </Modal>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [employees,  setEmployees]  = useState([]);
  const [attendance, setAttendance] = useState({});
  const [settings,   setSettings]   = useState(DEFAULT_SETTINGS);

  const [modal, setModal] = useState(null); // 'addEmp' | 'editEmp' | 'weekoff' | 'salary' | 'download'
  const [editingEmp, setEditingEmp] = useState(null);

  const ym = formatYearMonth(year, month);

  // Load from localStorage whenever month changes
  useEffect(() => {
    setEmployees(getEmployees());
    setAttendance(getAttendance(ym));
    setSettings(getMonthSettings(ym));
  }, [ym]);

  // Navigate months
  const goMonth = (dir) => {
    const { year: ny, month: nm } = dir === -1 ? getPrevMonth(year, month) : getNextMonth(year, month);
    setYear(ny); setMonth(nm);
  };

  // Active employees for this month
  const activeEmps = employees.filter(e => isEmployeeActiveInMonth(e, year, month));

  const days = getMonthDays(year, month);

  // Click cell: cycle status
  const handleCell = useCallback((empId, dayNum, isOff, isActive) => {
    if (isOff || !isActive) return;
    setAttendance(prev => {
      const updated = { ...prev, [empId]: { ...(prev[empId] || {}) } };
      const cur = updated[empId][dayNum] || '';
      const next = getNextStatus(cur);
      if (next === '') delete updated[empId][dayNum];
      else updated[empId][dayNum] = next;
      saveAttendance(ym, updated);
      return updated;
    });
  }, [ym]);

  // Save employee
  const handleSaveEmp = (emp) => {
    setEmployees(prev => {
      const exists = prev.find(e => e.id === emp.id);
      const next = exists ? prev.map(e => e.id === emp.id ? emp : e) : [...prev, emp];
      saveEmployees(next);
      return next;
    });
    setModal(null);
    setEditingEmp(null);
  };

  // Delete employee
  const handleDeleteEmp = (id) => {
    if (!confirm('Remove this employee? Their attendance data will be kept.')) return;
    setEmployees(prev => {
      const next = prev.filter(e => e.id !== id);
      saveEmployees(next);
      return next;
    });
    setModal(null);
    setEditingEmp(null);
  };

  // Save week-off settings
  const handleSaveSettings = (s) => {
    setSettings(s);
    saveMonthSettings(ym, s);
    setModal(null);
  };

  // Count stats for each employee
  const getStats = (empId) => {
    const ea = attendance[empId] || {};
    const s = { P:0, A:0, WFH:0, L:0, H:0 };
    Object.values(ea).forEach(v => { if (s[v] !== undefined) s[v]++; });
    return s;
  };

  const weekOffCount = days.filter(d => isWeekOff(d, settings)).length;
  const workingCount = days.length - weekOffCount;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f8fafc' }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">

          {/* Brand */}
          <div className="flex items-center gap-2 mr-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">A</div>
            <span className="font-bold text-gray-800 hidden sm:block">AttendPro</span>
          </div>

          {/* Month navigator */}
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            <button onClick={() => goMonth(-1)}
              className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center text-gray-500 transition text-sm font-bold">
              ‹
            </button>
            <span className="px-3 font-semibold text-gray-800 min-w-[140px] text-center text-sm">
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={() => goMonth(1)}
              className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center text-gray-500 transition text-sm font-bold">
              ›
            </button>
          </div>

          {/* Info chips */}
          <div className="hidden md:flex gap-2 ml-1">
            <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
              {workingCount} working days
            </span>
            <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
              {activeEmps.length} employees
            </span>
          </div>

          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setModal('addEmp'); setEditingEmp(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
              <span className="text-base">+</span> Add Employee
            </button>
            <button onClick={() => setModal('weekoff')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
              📅 Week Off
            </button>
            <button onClick={() => setModal('salary')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
              💰 Salary
            </button>
            <button onClick={() => setModal('download')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition">
              ⬇ Download
            </button>
          </div>
        </div>
      </header>

      {/* ── Legend ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-4 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">CLICK TO CYCLE:</span>
          {STATUS_CYCLE.filter(s => s).map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`att-cell text-xs px-1 ${STATUS_STYLE[s]}`} style={{ width: 'auto', height: 22, borderRadius: 4, padding: '0 6px' }}>
                {s}
              </span>
              <span className="text-xs text-gray-500">{STATUS_LABELS[s]}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="att-cell weekoff text-xs" style={{ width: 'auto', height: 22, padding: '0 6px', borderRadius: 4 }}>WO</span>
            <span className="text-xs text-gray-500">Week Off</span>
          </span>
        </div>
      </div>

      {/* ── Attendance Grid ──────────────────────────────────────── */}
      <main className="flex-1 p-4 max-w-screen-2xl mx-auto w-full">
        {activeEmps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl">👥</div>
            <p className="text-gray-500 font-medium">No active employees for this month</p>
            <button onClick={() => setModal('addEmp')}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition">
              + Add First Employee
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="border-collapse" style={{ minWidth: 'max-content' }}>
                <thead>
                  {/* Month header row with day numbers */}
                  <tr className="bg-gray-50">
                    {/* Employee name + designation header */}
                    <th className="sticky-col bg-gray-50 px-4 py-3 text-left" style={{ minWidth: 220, zIndex: 20 }}>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</span>
                    </th>

                    {days.map(d => {
                      const off = isWeekOff(d, settings);
                      const isToday = d.getDate() === today.getDate() &&
                        d.getMonth() === today.getMonth() &&
                        d.getFullYear() === today.getFullYear();
                      return (
                        <th key={d.getDate()}
                          className={`text-center px-0.5 py-2 border-l border-gray-100
                            ${off ? 'text-gray-300' : 'text-gray-600'}
                            ${isToday ? 'bg-indigo-50' : ''}`}
                          style={{ minWidth: 38, width: 38 }}>
                          <div className={`text-xs font-bold ${isToday ? 'text-indigo-600' : ''}`}>
                            {d.getDate()}
                          </div>
                          <div className={`text-[9px] font-normal ${off ? 'text-gray-300' : 'text-gray-400'}`}>
                            {DAY_SHORT[d.getDay()]}
                          </div>
                        </th>
                      );
                    })}

                    {/* Summary columns */}
                    {[['P','green'],['A','red'],['WFH','blue'],['L','amber'],['H','purple']].map(([s,c]) => (
                      <th key={s} className={`text-center px-2 py-3 border-l-2 border-gray-200 text-xs font-bold text-${c}-600`}
                          style={{ minWidth: 36 }}>
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {activeEmps.map((emp, ri) => {
                    const stats = getStats(emp.id);
                    return (
                      <tr key={emp.id}
                        className={`group border-t border-gray-50 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-indigo-50/20`}>

                        {/* Employee name cell */}
                        <td className={`sticky-col px-4 py-2 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} group-hover:bg-indigo-50/20`}
                            style={{ zIndex: 10 }}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <button onClick={() => { setEditingEmp(emp); setModal('editEmp'); }}
                                className="text-sm font-semibold text-gray-800 hover:text-indigo-600 transition text-left">
                                {emp.name}
                              </button>
                              {emp.designation && (
                                <p className="text-xs text-gray-400 leading-none mt-0.5">{emp.designation}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Day cells */}
                        {days.map(d => {
                          const off = isWeekOff(d, settings);
                          const active = isDayActiveForEmployee(emp, d);
                          const dayStr = String(d.getDate());
                          const status = attendance[emp.id]?.[dayStr] || '';
                          const isToday = d.getDate() === today.getDate() &&
                            d.getMonth() === today.getMonth() &&
                            d.getFullYear() === today.getFullYear();

                          return (
                            <td key={d.getDate()}
                              className={`p-0.5 border-l border-gray-50 ${isToday ? 'bg-indigo-50/40' : ''}`}>
                              {off ? (
                                <div className="att-cell weekoff">WO</div>
                              ) : !active ? (
                                <div className="att-cell inactive">—</div>
                              ) : (
                                <div
                                  className={`att-cell ${STATUS_STYLE[status]}`}
                                  onClick={() => handleCell(emp.id, dayStr, off, active)}
                                  title={STATUS_LABELS[status] || 'Click to mark'}>
                                  {status === 'WFH' ? 'W' : status || '·'}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Summary cells */}
                        <td className="text-center px-2 text-xs font-bold text-green-600 border-l-2 border-gray-200">{stats.P || '—'}</td>
                        <td className="text-center px-2 text-xs font-bold text-red-600">{stats.A || '—'}</td>
                        <td className="text-center px-2 text-xs font-bold text-blue-600">{stats.WFH || '—'}</td>
                        <td className="text-center px-2 text-xs font-bold text-amber-600">{stats.L || '—'}</td>
                        <td className="text-center px-2 text-xs font-bold text-purple-600">{stats.H || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resigned employees notice */}
        {employees.filter(e => e.resignedDate && isEmployeeActiveInMonth(e, year, month)).length > 0 && (
          <div className="mt-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-center gap-2">
            <span>⚠️</span>
            <span>
              {employees.filter(e => e.resignedDate && isEmployeeActiveInMonth(e, year, month)).map(e => e.name).join(', ')} resigned/terminated this month — included for salary purposes only.
            </span>
          </div>
        )}
      </main>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {modal === 'addEmp' && (
        <EmployeeModal onSave={handleSaveEmp} onClose={() => setModal(null)} />
      )}
      {modal === 'editEmp' && editingEmp && (
        <EmployeeModal initial={editingEmp} onSave={handleSaveEmp}
          onClose={() => { setModal(null); setEditingEmp(null); }}
          onDelete={handleDeleteEmp} />
      )}
      {modal === 'weekoff' && (
        <WeekOffModal yearMonth={ym} settings={settings}
          onSave={handleSaveSettings} onClose={() => setModal(null)} />
      )}
      {modal === 'salary' && (
        <SalaryModal employees={activeEmps} year={year} month={month}
          attendance={attendance} settings={settings} onClose={() => setModal(null)} />
      )}
      {modal === 'download' && (
        <DownloadModal employees={activeEmps} year={year} month={month}
          attendance={attendance} settings={settings} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
