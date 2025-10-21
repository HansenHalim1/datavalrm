'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import {
  Upload,
  FileDown,
  Save,
  CheckCircle,
  Circle,
  XCircle,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const BUCKET = 'datasets';

type Row = {
  sentence: string;
  abbreviation: string;
  long_form: string;
  domain: string;
  completed: boolean;
};

const DOMAIN_OPTIONS = [
  '',
  'Science',
  'Technology',
  'Business',
  'Government',
  'Medical',
  'Education',
  'Economics',
  'Other',
];

export default function Page() {
  const [files, setFiles] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [currentTab, setCurrentTab] = useState<'notCompleted' | 'completed'>('notCompleted');
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listFiles();
  }, []);

  async function listFiles() {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
    if (!error && data) setFiles(data);
  }

  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(file.name, file, { upsert: true });
      if (error) throw error;
      await listFiles();
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadFile(name: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(name);
      if (error || !data) throw error;
      setActiveFile(name);
      const text = await data.text();
      const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
      const normalized = parsed.data.map((r: any) => ({
        sentence: r.sentence ?? '',
        abbreviation: r.abbreviation ?? r.abbr ?? '',
        long_form: r.long_form ?? r.long ?? '',
        domain: r.domain ?? '',
        completed: ['true', '1', 'yes', 'y'].includes((r.completed ?? '').toString().toLowerCase()),
      }));
      setRows(normalized);
    } catch (err: any) {
      alert('Failed to download file: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateRow(idx: number, key: keyof Row, value: string | boolean) {
    setRows(prev => {
      const copy = [...prev];
      const visible = copy.filter(r => r.completed === (currentTab === 'completed'));
      const row = visible[idx];
      const globalIdx = copy.findIndex(r => r === row);
      copy[globalIdx] = { ...row, [key]: value };
      return copy;
    });
  }

  function toggleStatus(idx: number) {
    updateRow(idx, 'completed', !(rows.filter(r => r.completed === (currentTab === 'completed'))[idx]?.completed));
  }

  function removeRow(idx: number) {
    if (!confirm('Remove this row?')) return;
    setRows(prev => {
      const copy = [...prev];
      const visible = copy.filter(r => r.completed === (currentTab === 'completed'));
      const row = visible[idx];
      return copy.filter(r => r !== row);
    });
  }

  async function saveCorrectedToStorage() {
    if (!activeFile) return alert('No file loaded.');
    try {
      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: 'text/csv' });

      const completedCount = rows.filter(r => r.completed).length;
      const totalCount = rows.length;
      const progress = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

      // Smart file naming logic
      let newName;
      if (progress === 100) {
        newName = activeFile.replace('.csv', '') + '{corrected}.csv';
      } else {
        newName = activeFile.replace('.csv', '') + `{${progress}%}.csv`;
      }

      const { error } = await supabase.storage.from(BUCKET).upload(newName, blob, { upsert: true });
      if (error) throw error;
      alert(`Saved as ${newName}`);
      listFiles();
    } catch (err: any) {
      alert('Save failed: ' + (err.message || 'Network or permission issue.'));
    }
  }

  function downloadCSV() {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = (activeFile?.replace('.csv', '') || 'abbreviations') + '-corrected.csv';
    link.click();
  }

  async function deleteFile(name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    await supabase.storage.from(BUCKET).remove([name]);
    if (activeFile === name) {
      setActiveFile(null);
      setRows([]);
    }
    listFiles();
  }

  const completedCount = rows.filter(r => r.completed).length;
  const totalCount = rows.length;
  const progress = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const filteredRows = rows.filter(r => r.completed === (currentTab === 'completed'));

  return (
    <main className="min-h-screen bg-[#f9fafb] py-10 px-6 font-[Inter] text-gray-800">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
              Abbreviation Corrector
            </h1>
            {totalCount > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium text-blue-700">{completedCount}</span> of {totalCount} completed ({progress}%)
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={downloadCSV}
              disabled={!rows.length}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 transition"
            >
              <FileDown className="w-4 h-4" /> Download
            </button>
            <button
              onClick={saveCorrectedToStorage}
              disabled={!rows.length}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition"
            >
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </header>

        {/* Upload Section */}
        <section className="bg-white border border-gray-100 shadow-sm rounded-xl p-5 hover:shadow-md">
          <h2 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" /> Upload CSV File
          </h2>
          <input
            type="file"
            accept=".csv"
            disabled={loading}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
            }}
            className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 text-sm"
          />
        </section>

        {/* File List */}
        <section className="bg-white border border-gray-100 shadow-sm rounded-xl p-5 hover:shadow-md">
          <h2 className="font-medium text-gray-700 mb-3">Files</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-3">File Name</th>
                  <th className="text-center p-3 w-48">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.name} className="border-t hover:bg-gray-50">
                    <td className="p-3">{f.name}</td>
                    <td className="p-3 text-center flex justify-center gap-2">
                      <button
                        onClick={() => loadFile(f.name)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => deleteFile(f.name)}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-gray-500 text-center p-3 italic">
                      No files uploaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Active File Progress */}
        {activeFile && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
            <p className="font-medium text-blue-800">Active File: {activeFile}</p>
            <div className="mt-2 bg-gray-200 h-3 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-700 mt-2">
              <span className="font-medium">{completedCount}</span> completed,{' '}
              <span className="font-medium">{totalCount - completedCount}</span> remaining
            </p>
          </div>
        )}

        {/* Tabs */}
        {rows.length > 0 && (
          <div className="flex gap-2">
            {['notCompleted', 'completed'].map(tab => (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab as 'notCompleted' | 'completed')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  currentTab === tab
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab === 'notCompleted' ? 'Not Completed' : 'Completed'}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        {rows.length > 0 && (
          <section className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-700">
                  <th className="p-3 text-left w-1/3">Sentence</th>
                  <th className="p-3 text-left w-1/10">Abbrev.</th> {/* Less space */}
                  <th className="p-3 text-left w-1/3">Long Form</th>
                  <th className="p-3 text-left w-1/4">Domain</th> {/* More space */}
                  <th className="p-3 text-center w-1/5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="p-3">{row.sentence}</td>
                    <td className="p-3 font-semibold text-blue-700">{row.abbreviation}</td>
                    <td className="p-3">
                      <input
                        className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-400 outline-none transition"
                        value={row.long_form}
                        onChange={e => updateRow(i, 'long_form', e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      <select
                        className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-400 outline-none transition"
                        value={row.domain}
                        onChange={e => updateRow(i, 'domain', e.target.value)}
                      >
                        {DOMAIN_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>
                            {opt || '—'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 flex justify-center gap-2">
                      <button
                        onClick={() => toggleStatus(i)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm transition ${
                          row.completed
                            ? 'bg-amber-400 hover:bg-amber-500'
                            : 'bg-green-500 hover:bg-green-600'
                        }`}
                      >
                        {row.completed ? <Circle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        {row.completed ? 'Incomplete' : 'Complete'}
                      </button>
                      <button
                        onClick={() => removeRow(i)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition"
                      >
                        <XCircle className="w-4 h-4" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-gray-500 text-center p-4 italic">
                      No rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
