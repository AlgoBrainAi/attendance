'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMonthDays, isWeekOff, isHoliday, getHolidayName, isDayOff,
  isDayActiveForEmployee, isEmployeeActiveInMonth,
  formatYearMonth, getPrevMonth, getNextMonth,
  getSaturdayNumber, MONTH_NAMES, DAY_SHORT
} from '../lib/dateUtils';
import {
  getEmployees, saveEmployees, getAttendance, saveAttendance,
  getMonthSettings, saveMonthSettings, DEFAULT_SETTINGS
} from '../lib/storage';
import { STATUS_CYCLE, STATUS_LABELS, STATUS_STYLE, getNextStatus, calculateSalary } from '../lib/salaryCalc';
import { downloadReport } from '../lib/exportUtils';

// ─── Auth helpers ────────────────────────────────────────────────────────────

const AUTH_KEY    = 'att_auth';
const SESSION_KEY = 'att_session';

function getCredentials() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || { id: 'admin', password: 'admin@123' }; }
  catch { return { id: 'admin', password: 'admin@123' }; }
}

function isLoggedIn() {
  return typeof window !== 'undefined' && localStorage.getItem(SESSION_KEY) === 'true';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col ${wide ? 'w-full max-w-4xl' : 'w-full max-w-lg'}`}
           style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 text-xl">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────

function LoginPage({ onLogin }) {
  const [id, setId]       = useState('');
  const [pass, setPass]   = useState('');
  const [error, setError] = useState('');
  const [show, setShow]   = useState(false);

  const handle = (e) => {
    e.preventDefault();
    const creds = getCredentials();
    if (id === creds.id && pass === creds.password) {
      localStorage.setItem(SESSION_KEY, 'true');
      onLogin();
    } else {
      setError('Invalid ID or Password. Please try again.');
      setPass('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-10 pb-6 text-center"
             style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-black text-white">A</span>
          </div>
          <h1 className="text-2xl font-black text-white">AttendPro</h1>
          <p className="text-indigo-200 text-sm mt-1">Attendance Management System</p>
        </div>

        {/* Form */}
        <form onSubmit={handle} className="px-8 py-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Login ID</label>
            <input
              value={id} onChange={e => { setId(e.target.value); setError(''); }}
              placeholder="Enter your ID"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-indigo-500 outline-none transition"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pass} onChange={e => { setPass(e.target.value); setError(''); }}
                placeholder="Enter your password"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-indigo-500 outline-none transition pr-12"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
                {show ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <button type="submit" disabled={!id || !pass}
            className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-40 transition"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
            Login →
          </button>

          <p className="text-xs text-center text-gray-400 pt-1">
            Default: <strong>admin</strong> / <strong>admin@123</strong>
          </p>
        </form>
      </div>
    </div>
  );
}

// ─── Employee Modal ───────────────────────────────────────────────────────────

function EmployeeModal({ initial, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(initial || {
    name: '', designation: '', salary: '', joiningDate: '', resignedDate: ''
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.salary !== '' && Number(form.salary) >= 0 && form.joiningDate;

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
          <p className="text-xs text-gray-400 mt-1">Employee stays visible for their resignation month, then auto-hides.</p>
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

// ─── Settings Modal (Week-off + Holidays + Custom day overrides) ──────────────

function SettingsModal({ yearMonth, year, month, settings, onSave, onClose }) {
  const [wos,        setWos]        = useState(settings.weekOffSaturdays ?? [1, 3]);
  const [sunOff,     setSunOff]     = useState(settings.allSundaysOff ?? true);
  const [holidays,   setHolidays]   = useState(settings.holidays ?? []);
  const [customWOs,  setCustomWOs]  = useState(settings.customWeekOffs ?? []);
  const [exceptions, setExceptions] = useState(settings.weekOffExceptions ?? []);
  const [holDay,     setHolDay]     = useState('');
  const [holName,    setHolName]    = useState('');

  const allDays     = getMonthDays(year, month);
  const daysInMonth = allDays.length;
  const firstDOW    = allDays[0].getDay(); // 0=Sun

  // Check default week-off by day-of-week rules only (no custom overrides)
  const isDefaultOff = (date) => {
    const day = date.getDay();
    if (day === 0) return sunOff;
    if (day === 6) return wos.includes(getSaturdayNumber(date));
    return false;
  };

  // Effective status of each day considering all overrides
  const getDayStatus = (date) => {
    const d = date.getDate();
    if (exceptions.includes(d)) return 'exception';  // forced working
    if (customWOs.includes(d))  return 'custom-wo';  // forced week-off
    if (isDefaultOff(date))     return 'weekoff';    // default week-off
    return 'working';
  };

  const toggleDay = (date) => {
    const d      = date.getDate();
    const status = getDayStatus(date);
    if (status === 'weekoff') {
      // Default WO → force working (add exception)
      setExceptions(prev => [...prev, d].sort((a,b)=>a-b));
      setCustomWOs(prev => prev.filter(x => x !== d));
    } else if (status === 'exception') {
      // Exception → remove exception (back to default WO)
      setExceptions(prev => prev.filter(x => x !== d));
    } else if (status === 'working') {
      // Working → force week-off (add custom WO)
      setCustomWOs(prev => [...prev, d].sort((a,b)=>a-b));
      setExceptions(prev => prev.filter(x => x !== d));
    } else if (status === 'custom-wo') {
      // Custom WO → remove (back to working)
      setCustomWOs(prev => prev.filter(x => x !== d));
    }
  };

  const dayStyle = {
    'weekoff':   'bg-gray-200 text-gray-500 hover:bg-blue-100 hover:text-blue-700',
    'exception': 'bg-blue-100 text-blue-700 ring-2 ring-blue-400 hover:bg-gray-200 hover:text-gray-500',
    'custom-wo': 'bg-amber-200 text-amber-800 hover:bg-gray-50 hover:text-gray-500',
    'working':   'bg-white text-gray-700 border border-gray-200 hover:bg-amber-100 hover:text-amber-700',
  };

  const toggleSat = (n) => setWos(prev =>
    prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort()
  );

  const addHoliday = () => {
    const d = Number(holDay);
    if (!d || !holName.trim() || holidays.find(h => h.day === d)) return;
    setHolidays(prev => [...prev, { day: d, name: holName.trim() }].sort((a,b) => a.day - b.day));
    setHolDay(''); setHolName('');
  };

  const removeHoliday = (day) => setHolidays(prev => prev.filter(h => h.day !== day));

  const saveAll = () => onSave({
    weekOffSaturdays: wos, allSundaysOff: sunOff, holidays,
    customWeekOffs: customWOs, weekOffExceptions: exceptions,
  });

  return (
    <Modal title={`Settings — ${yearMonth}`} onClose={onClose} wide>
      <div className="space-y-6">

        {/* ── Visual Calendar ─────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-1">Monthly Day Override</p>
          <p className="text-xs text-gray-400 mb-3">Click any day to toggle week-off / working day</p>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-3 text-xs">
            {[
              ['bg-gray-200 text-gray-500','Default Week-Off'],
              ['bg-white border border-gray-200 text-gray-700','Working Day'],
              ['bg-amber-200 text-amber-800','Custom Week-Off'],
              ['bg-blue-100 text-blue-700 ring-2 ring-blue-400','Forced Working'],
            ].map(([cls, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`inline-block w-5 h-5 rounded text-center text-[10px] leading-5 font-bold ${cls}`}>·</span>
                <span className="text-gray-500">{label}</span>
              </span>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
              {DAY_SHORT.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1.5">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1 p-2">
              {/* Empty cells for first week alignment */}
              {Array.from({ length: firstDOW }).map((_, i) => <div key={`e${i}`} />)}
              {allDays.map(date => {
                const status = getDayStatus(date);
                const isHol  = holidays.some(h => h.day === date.getDate());
                return (
                  <button key={date.getDate()} onClick={() => toggleDay(date)}
                    title={
                      status === 'exception' ? 'Click to restore as week-off' :
                      status === 'custom-wo' ? 'Click to restore as working day' :
                      status === 'weekoff'   ? 'Click to make working day' :
                                              'Click to make week-off'
                    }
                    className={`relative rounded-lg py-1.5 text-center transition select-none ${dayStyle[status]}`}>
                    <div className="text-xs font-bold leading-none">{date.getDate()}</div>
                    <div className="text-[9px] mt-0.5 opacity-70 leading-none">
                      {status === 'exception' ? 'WORK' :
                       status === 'custom-wo' ? 'WO' :
                       status === 'weekoff'   ? 'WO' : ''}
                    </div>
                    {isHol && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full" title="Holiday" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary of custom changes */}
          {(customWOs.length > 0 || exceptions.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {customWOs.length > 0 && (
                <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700">
                  Extra week-offs: {customWOs.join(', ')}
                </span>
              )}
              {exceptions.length > 0 && (
                <span className="px-2 py-1 bg-blue-50 border border-blue-200 rounded-full text-blue-700">
                  Forced working: {exceptions.join(', ')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Default Rules ────────────────────────────────── */}
        <div className="border-t border-gray-100 pt-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">Default Rules <span className="text-xs font-normal text-gray-400">(updates calendar above)</span></p>

          {/* Sundays */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setSunOff(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${sunOff ? 'bg-indigo-500' : 'bg-gray-200'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${sunOff ? 'left-6' : 'left-1'}`} />
            </div>
            <span className="text-sm text-gray-700">All Sundays are week-off</span>
          </label>

          {/* Saturdays */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Week-off Saturdays</p>
            <div className="grid grid-cols-5 gap-2">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => toggleSat(n)}
                  className={`py-1.5 rounded-lg text-xs font-medium border-2 transition
                    ${wos.includes(n) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                  {['1st','2nd','3rd','4th','5th'][n-1]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Holidays ─────────────────────────────────────── */}
        <div className="border-t border-gray-100 pt-5">
          <p className="text-sm font-semibold text-gray-800 mb-3">Holidays</p>
          <div className="flex gap-2 mb-3">
            <select value={holDay} onChange={e => setHolDay(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-20">
              <option value="">Day</option>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input value={holName} onChange={e => setHolName(e.target.value)}
              placeholder="Holiday name (e.g. Diwali)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              onKeyDown={e => e.key === 'Enter' && addHoliday()} />
            <button onClick={addHoliday} disabled={!holDay || !holName.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition">
              + Add
            </button>
          </div>
          {holidays.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">
              No holidays added for this month
            </p>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {holidays.map(h => (
                <div key={h.day} className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-sm"><strong className="text-emerald-700">{h.day}</strong><span className="text-gray-600 ml-2">{h.name}</span></span>
                  <button onClick={() => removeHoliday(h.day)} className="text-red-400 hover:text-red-600 text-lg ml-2">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={saveAll}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg text-sm transition">
          Save Settings
        </button>
      </div>
    </Modal>
  );
}

// ─── Salary Modal ─────────────────────────────────────────────────────────────

function SalaryModal({ employees, year, month, attendance, settings, onClose }) {
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
                  <td className="px-3 py-2">{fmt(emp.salary)}</td>
                  <td className="px-3 py-2">{c.workingDays}</td>
                  <td className="px-3 py-2 text-green-700 font-bold">{c.P || '—'}</td>
                  <td className="px-3 py-2 text-blue-700">{c.WFH || '—'}</td>
                  <td className="px-3 py-2 text-red-700">{c.A || '—'}</td>
                  <td className="px-3 py-2 text-amber-700">{c.L || '—'}</td>
                  <td className="px-3 py-2 text-purple-700">{c.H || '—'}</td>
                  <td className="px-3 py-2 text-indigo-700">{c.paidLeaves}</td>
                  <td className="px-3 py-2 text-red-600">{c.unpaidLeaves}</td>
                  <td className="px-3 py-2">{fmt(c.perDay)}</td>
                  <td className="px-3 py-2 font-bold text-gray-800">{fmt(c.netSalary)}</td>
                  <td className="px-3 py-2 text-red-600">{c.deduction > 0 ? `-${fmt(c.deduction)}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {employees.length === 0 && <p className="text-center py-8 text-gray-400">No active employees this month.</p>}
      </div>
      <div className="mt-5 bg-indigo-50 rounded-xl p-4 text-xs text-indigo-800 space-y-1">
        <p className="font-semibold">Salary formula:</p>
        <p>• Per Day = Monthly Salary ÷ Working Days (excludes Sundays, week-off Saturdays, holidays)</p>
        <p>• Paid Leave Quota: 2 if previous month had zero A/L, otherwise 1</p>
        <p>• Net = Per Day × (Present + WFH + Paid Leaves + Half Days × 0.5)</p>
      </div>
    </Modal>
  );
}

// ─── Download Modal ───────────────────────────────────────────────────────────

function DownloadModal({ employees, year, month, attendance, settings, onClose }) {
  const [loading, setLoading] = useState(false);
  const handle = async (type) => {
    setLoading(true);
    try { await downloadReport(type, employees, year, month, attendance, settings); }
    finally { setLoading(false); }
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

// ─── Change Password Modal ────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ id: '', oldPass: '', newPass: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handle = () => {
    const creds = getCredentials();
    if (form.id !== creds.id || form.oldPass !== creds.password) {
      setMsg('Current ID or password is incorrect.');
      return;
    }
    if (form.newPass.length < 6) { setMsg('New password must be at least 6 characters.'); return; }
    if (form.newPass !== form.confirm) { setMsg('Passwords do not match.'); return; }
    localStorage.setItem(AUTH_KEY, JSON.stringify({ id: form.id, password: form.newPass }));
    setMsg('✓ Password changed successfully!');
  };

  return (
    <Modal title="Change Password" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Login ID</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.id} onChange={e => set('id', e.target.value)} placeholder="Your login ID" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
          <input type="password" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.oldPass} onChange={e => set('oldPass', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input type="password" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.newPass} onChange={e => set('newPass', e.target.value)} placeholder="Min 6 characters" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
          <input type="password" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.confirm} onChange={e => set('confirm', e.target.value)} />
        </div>
        {msg && (
          <p className={`text-sm font-medium ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>
        )}
        <button onClick={handle}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg text-sm transition">
          Change Password
        </button>
      </div>
    </Modal>
  );
}

// ─── Employees Tab View ───────────────────────────────────────────────────────

function EmployeesView({ employees, onAdd, onEdit, onDelete }) {
  const [filter, setFilter] = useState('all');
  const todayStr = new Date().toISOString().split('T')[0];

  const getStatus = (emp) => {
    if (!emp.resignedDate) return { label: 'Active', cls: 'bg-green-100 text-green-700' };
    if (emp.resignedDate >= todayStr) return { label: 'Notice Period', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Terminated', cls: 'bg-red-100 text-red-700' };
  };

  const filtered = employees.filter(e => {
    if (filter === 'active')     return !e.resignedDate;
    if (filter === 'terminated') return !!e.resignedDate;
    return true;
  });

  const activeCount     = employees.filter(e => !e.resignedDate).length;
  const terminatedCount = employees.filter(e => !!e.resignedDate).length;

  return (
    <div className="flex-1 p-4 max-w-screen-2xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Employee Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active · {terminatedCount} terminated · {employees.length} total
          </p>
        </div>
        <button onClick={onAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition">
          + Add Employee
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4">
        {[['all','All Employees'],['active','Active'],['terminated','Terminated']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
              ${filter === val ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">👤</div>
          <p className="text-gray-400 font-medium">No employees found</p>
          {filter === 'all' && (
            <button onClick={onAdd}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition">
              + Add First Employee
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(emp => {
            const status = getStatus(emp);
            return (
              <div key={emp.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition p-5 flex flex-col">

                {/* Top row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-lg flex-shrink-0">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{emp.name}</p>
                      <p className="text-xs text-gray-400 truncate">{emp.designation || '—'}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0 ml-2 ${status.cls}`}>
                    {status.label}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 space-y-2 text-sm mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Monthly Salary</span>
                    <span className="font-bold text-gray-800">
                      {emp.salary === 0 ? '₹0 (No pay)' : `₹${emp.salary.toLocaleString('en-IN')}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Joined</span>
                    <span className="text-gray-600">
                      {emp.joiningDate
                        ? new Date(emp.joiningDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
                        : '—'}
                    </span>
                  </div>
                  {emp.resignedDate && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Resigned</span>
                      <span className="text-red-600 font-medium">
                        {new Date(emp.resignedDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Note for terminated */}
                {emp.resignedDate && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5 mb-3">
                    Hidden from attendance from{' '}
                    {new Date(new Date(emp.resignedDate + 'T00:00:00').getFullYear(),
                              new Date(emp.resignedDate + 'T00:00:00').getMonth() + 1, 1)
                      .toLocaleDateString('en-IN', { month:'long', year:'numeric' })} onwards
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => onEdit(emp)}
                    className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs transition">
                    ✏️ Edit
                  </button>
                  <button onClick={() => onDelete(emp.id)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg text-xs transition">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function AttendanceApp() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [employees,  setEmployees]  = useState([]);
  const [attendance, setAttendance] = useState({});
  const [settings,   setSettings]   = useState(DEFAULT_SETTINGS);

  const [modal,       setModal]       = useState(null);
  const [editingEmp,  setEditingEmp]  = useState(null);
  const [tab,         setTab]         = useState('attendance');

  const ym = formatYearMonth(year, month);

  useEffect(() => {
    setEmployees(getEmployees());
    setAttendance(getAttendance(ym));
    setSettings(getMonthSettings(ym));
  }, [ym]);

  const goMonth = (dir) => {
    const fn = dir === -1 ? getPrevMonth : getNextMonth;
    const { year: ny, month: nm } = fn(year, month);
    setYear(ny); setMonth(nm);
  };

  const activeEmps = employees.filter(e => isEmployeeActiveInMonth(e, year, month));
  const days = getMonthDays(year, month);
  const workingCount = days.filter(d => !isDayOff(d, settings)).length;

  const handleCell = useCallback((empId, dayStr, off, active) => {
    if (off || !active) return;
    setAttendance(prev => {
      const updated = { ...prev, [empId]: { ...(prev[empId] || {}) } };
      const cur  = updated[empId][dayStr] || '';
      const next = getNextStatus(cur);
      if (next === '') delete updated[empId][dayStr];
      else updated[empId][dayStr] = next;
      saveAttendance(ym, updated);
      return updated;
    });
  }, [ym]);

  const handleSaveEmp = (emp) => {
    setEmployees(prev => {
      const next = prev.find(e => e.id === emp.id)
        ? prev.map(e => e.id === emp.id ? emp : e)
        : [...prev, emp];
      saveEmployees(next);
      return next;
    });
    setModal(null); setEditingEmp(null);
  };

  const handleDeleteEmp = (id) => {
    if (!confirm('Remove this employee? Their attendance data will be kept.')) return;
    setEmployees(prev => { const n = prev.filter(e => e.id !== id); saveEmployees(n); return n; });
    setModal(null); setEditingEmp(null);
  };

  const handleSaveSettings = (s) => {
    setSettings(s); saveMonthSettings(ym, s); setModal(null);
  };

  const getStats = (empId) => {
    const ea = attendance[empId] || {};
    const s = { P:0, A:0, WFH:0, L:0, H:0 };
    Object.values(ea).forEach(v => { if (s[v] !== undefined) s[v]++; });
    return s;
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f8fafc' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">A</div>
            <span className="font-bold text-gray-800 hidden sm:block">AttendPro</span>
          </div>

          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            <button onClick={() => goMonth(-1)}
              className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center text-gray-500 font-bold">‹</button>
            <span className="px-3 font-semibold text-gray-800 min-w-[140px] text-center text-sm">
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={() => goMonth(1)}
              className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center text-gray-500 font-bold">›</button>
          </div>

          <div className="hidden md:flex gap-2 ml-1">
            <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">{workingCount} working days</span>
            <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">{activeEmps.length} employees</span>
            {(settings.holidays || []).length > 0 && (
              <span className="text-xs px-2 py-1 bg-emerald-100 rounded-full text-emerald-700">
                {settings.holidays.length} holiday{settings.holidays.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setModal('addEmp'); setEditingEmp(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
              + Add Employee
            </button>
            <button onClick={() => setModal('settings')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
              ⚙️ Settings
            </button>
            <button onClick={() => setModal('salary')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
              💰 Salary
            </button>
            <button onClick={() => setModal('download')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition">
              ⬇ Download
            </button>
            {/* User menu */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
                👤 Admin ▾
              </button>
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg py-1 w-44 hidden group-hover:block z-50">
                <button onClick={() => setModal('changePass')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">🔑 Change Password</button>
                <button onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">🚪 Logout</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-2xl mx-auto px-4 flex gap-0">
          {[['attendance','📋 Attendance'],['employees','👥 Employees']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition
                ${tab === t
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Legend (attendance tab only) ───────────────────────── */}
      {tab === 'attendance' && <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-4 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">CLICK TO CYCLE:</span>
          {STATUS_CYCLE.filter(Boolean).map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center text-xs font-bold rounded px-1.5 ${STATUS_STYLE[s]}`}
                style={{ height: 22, minWidth: 28 }}>
                {s === 'WFH' ? 'W' : s}
              </span>
              <span className="text-xs text-gray-500">{STATUS_LABELS[s]}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="att-cell weekoff inline-flex items-center justify-center" style={{ width: 'auto', height: 22, padding: '0 6px', borderRadius: 4, fontSize: 9 }}>WO</span>
            <span className="text-xs text-gray-500">Week Off</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="att-cell holiday inline-flex items-center justify-center" style={{ width: 'auto', height: 22, padding: '0 6px', borderRadius: 4, fontSize: 9 }}>HOL</span>
            <span className="text-xs text-gray-500">Holiday</span>
          </span>
        </div>
      </div>}

      {/* ── Employees Tab ──────────────────────────────────────── */}
      {tab === 'employees' && (
        <EmployeesView
          employees={employees}
          onAdd={() => { setEditingEmp(null); setModal('addEmp'); }}
          onEdit={(emp) => { setEditingEmp(emp); setModal('editEmp'); }}
          onDelete={handleDeleteEmp}
        />
      )}

      {/* ── Grid (attendance tab only) ─────────────────────────── */}
      {tab === 'attendance' && <main className="flex-1 p-4 max-w-screen-2xl mx-auto w-full">
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
                  <tr className="bg-gray-50">
                    <th className="sticky-col bg-gray-50 px-4 py-3 text-left" style={{ minWidth: 220, zIndex: 20 }}>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</span>
                    </th>
                    {days.map(d => {
                      const off  = isWeekOff(d, settings);
                      const hol  = isHoliday(d, settings);
                      const isTd = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                      return (
                        <th key={d.getDate()}
                          className={`text-center px-0.5 py-2 border-l border-gray-100
                            ${(off || hol) ? 'text-gray-300' : 'text-gray-600'}
                            ${isTd ? 'bg-indigo-50' : ''}`}
                          style={{ minWidth: 38, width: 38 }}>
                          <div className={`text-xs font-bold ${isTd ? 'text-indigo-600' : ''}`}>{d.getDate()}</div>
                          <div className={`text-[9px] ${(off||hol) ? 'text-gray-300' : 'text-gray-400'}`}>{DAY_SHORT[d.getDay()]}</div>
                        </th>
                      );
                    })}
                    {[['P','green'],['A','red'],['WFH','blue'],['L','amber'],['H','purple']].map(([s,c]) => (
                      <th key={s} className={`text-center px-2 py-3 border-l-2 border-gray-200 text-xs font-bold text-${c}-600`} style={{ minWidth: 36 }}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeEmps.map((emp, ri) => {
                    const stats = getStats(emp.id);
                    return (
                      <tr key={emp.id}
                        className={`group border-t border-gray-50 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-indigo-50/20`}>
                        <td className={`sticky-col px-4 py-2 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} group-hover:bg-indigo-50/20`} style={{ zIndex: 10 }}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <button onClick={() => { setEditingEmp(emp); setModal('editEmp'); }}
                                className="text-sm font-semibold text-gray-800 hover:text-indigo-600 transition text-left">
                                {emp.name}
                              </button>
                              {emp.designation && <p className="text-xs text-gray-400 leading-none mt-0.5">{emp.designation}</p>}
                            </div>
                          </div>
                        </td>

                        {days.map(d => {
                          const off    = isWeekOff(d, settings);
                          const hol    = isHoliday(d, settings);
                          const holNm  = hol ? getHolidayName(d, settings) : '';
                          const active = isDayActiveForEmployee(emp, d);
                          const dayStr = String(d.getDate());
                          const status = attendance[emp.id]?.[dayStr] || '';
                          const isTd   = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

                          return (
                            <td key={d.getDate()} className={`p-0.5 border-l border-gray-50 ${isTd ? 'bg-indigo-50/40' : ''}`}>
                              {off ? (
                                <div className="att-cell weekoff">WO</div>
                              ) : hol ? (
                                <div className="att-cell holiday" title={holNm}>HOL</div>
                              ) : !active ? (
                                <div className="att-cell inactive">—</div>
                              ) : (
                                <div className={`att-cell ${STATUS_STYLE[status]}`}
                                  onClick={() => handleCell(emp.id, dayStr, false, true)}
                                  title={STATUS_LABELS[status] || 'Click to mark'}>
                                  {status === 'WFH' ? 'W' : status || '·'}
                                </div>
                              )}
                            </td>
                          );
                        })}

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
      </main>}

      {/* ── Modals ─────────────────────────────────────────────── */}
      {modal === 'addEmp'      && <EmployeeModal onSave={handleSaveEmp} onClose={() => setModal(null)} />}
      {modal === 'editEmp'     && editingEmp && (
        <EmployeeModal initial={editingEmp} onSave={handleSaveEmp}
          onClose={() => { setModal(null); setEditingEmp(null); }} onDelete={handleDeleteEmp} />
      )}
      {modal === 'settings'    && (
        <SettingsModal yearMonth={ym} year={year} month={month}
          settings={settings} onSave={handleSaveSettings} onClose={() => setModal(null)} />
      )}
      {modal === 'salary'      && (
        <SalaryModal employees={activeEmps} year={year} month={month}
          attendance={attendance} settings={settings} onClose={() => setModal(null)} />
      )}
      {modal === 'download'    && (
        <DownloadModal employees={activeEmps} year={year} month={month}
          attendance={attendance} settings={settings} onClose={() => setModal(null)} />
      )}
      {modal === 'changePass'  && <ChangePasswordModal onClose={() => setModal(null)} />}
    </div>
  );
}

// ─── Root: handles login gate ─────────────────────────────────────────────────

export default function HomePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checked,  setChecked]  = useState(false);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;
  return <AttendanceApp />;
}
