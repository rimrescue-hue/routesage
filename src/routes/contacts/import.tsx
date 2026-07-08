import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const FIELD_MAP: Record<string, string> = {
  "business name": "business_name", "business_name": "business_name",
  "company": "business_name", "company name": "business_name", "name": "business_name",
  "contact name": "contact_name", "contact": "contact_name", "contact_name": "contact_name",
  "first name": "contact_name", "title": "title", "role": "title",
  "phone": "phone", "telephone": "phone", "tel": "phone", "mobile": "phone",
  "email": "email", "e-mail": "email", "website": "website", "web": "website", "url": "website",
  "address": "address_line1", "address1": "address_line1", "address_line1": "address_line1",
  "address line 1": "address_line1", "address 1": "address_line1",
  "address2": "address_line2", "address_line2": "address_line2", "address line 2": "address_line2",
  "address 2": "address_line2", "city": "city", "town": "city",
  "state": "state", "province": "state", "region": "state",
  "zip": "zip", "zip code": "zip", "postal code": "zip", "postcode": "zip",
  "country": "country",
  "category": "category", "industry": "category", "type": "category",
  "notes": "notes", "note": "notes", "comments": "notes",
  "latitude": "latitude", "lat": "latitude",
  "longitude": "longitude", "long": "longitude", "lng": "longitude",
};

// Server function: import contacts from parsed rows (JSON)
const importContacts = createServerFn({ method: "POST" }).handler(
  async (payload: {
    rows: Record<string, string>[];
    headers: string[];
  }): Promise<{
    totalRows: number;
    successCount: number;
    errorCount: number;
    errors: string[];
  }> => {
    const sql = getDb();
    const errors: string[] = [];
    let successCount = 0;
    const totalRows = payload.rows.length;

    // Check contact limit
    const teamId = '00000000-0000-0000-0000-000000000001';
    const [team] = await sql`SELECT max_contacts FROM teams WHERE id = ${teamId}`;
    const [countRow] = await sql`SELECT COUNT(*) as c FROM contacts WHERE team_id = ${teamId}`;
    const currentCount = parseInt(countRow.c);
    const maxAllowed = team?.max_contacts ?? 50;
    const remainingSlots = maxAllowed - currentCount;

    if (remainingSlots <= 0) {
      return { totalRows, successCount: 0, errorCount: 1, errors: [`Contact limit reached (${maxAllowed}). Please upgrade your plan to add more contacts.`], importedIds: [] };
    }

    let imported = 0;
    for (let i = 0; i < payload.rows.length && imported < remainingSlots; i++) {
      const row = payload.rows[i];

      const contact: Record<string, any> = {};
      let hasBusinessName = false;

      for (const [header, value] of Object.entries(row)) {
        const lower = header.toLowerCase().trim();
        const mapped = FIELD_MAP[lower];
        if (mapped) {
          contact[mapped] = value?.toString().trim() || null;
          if (mapped === "business_name" && contact[mapped]) hasBusinessName = true;
        }
      }

      if (!hasBusinessName) {
        errors.push(`Row ${i + 1}: Missing business name — skipped`);
        continue;
      }

      if (contact.latitude) contact.latitude = parseFloat(contact.latitude) || null;
      if (contact.longitude) contact.longitude = parseFloat(contact.longitude) || null;

      try {
        await sql`
          INSERT INTO contacts (
            team_id, created_by, business_name, contact_name, title,
            phone, email, website,
            address_line1, address_line2, city, state, zip, country,
            latitude, longitude, category, status, notes, source
          ) VALUES (
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000001',
            ${contact.business_name},
            ${contact.contact_name || null}, ${contact.title || null},
            ${contact.phone || null}, ${contact.email || null},
            ${contact.website || null}, ${contact.address_line1 || null},
            ${contact.address_line2 || null}, ${contact.city || null},
            ${contact.state || null}, ${contact.zip || null},
            ${contact.country || 'US'}, ${contact.latitude || null},
            ${contact.longitude || null}, ${contact.category || null},
            'active', ${contact.notes || null}, 'csv_import'
          )
        `;
        successCount++;
        imported++;
      } catch (err: any) {
        errors.push(`Row ${i + 1} ("${contact.business_name}"): ${err.message || "Database error"}`);
      }
    }

    return { totalRows, successCount, errorCount: errors.length, errors };
  },
);

export const Route = createFileRoute("/contacts/import")({
  component: ImportContacts,
});

function ImportContacts() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<{
    totalRows: number;
    successCount: number;
    errorCount: number;
    errors: string[];
  } | null>(null);

  const handleFile = async (file: File) => {
    setError("");
    setResult(null);

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
      setError("Please upload a CSV or Excel (.xlsx / .xls) file");
      return;
    }

    setParsing(true);

    try {
      let rows: Record<string, string>[] = [];
      let headersList: string[] = [];

      if (ext === "csv") {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
        headersList = (result.meta as any).fields || [];
        rows = result.data as Record<string, string>[];
      } else {
        // Parse xlsx on the client where FileReader is available
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (sheetName) {
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (jsonData.length > 0) {
            headersList = Object.keys(jsonData[0] as Record<string, string>);
          }
          rows = jsonData as Record<string, string>[];
        }
      }

      if (headersList.length === 0) {
        setError("Could not parse any columns from the file. Make sure it has a header row.");
        setParsing(false);
        return;
      }

      if (rows.length === 0) {
        setError("The file appears to be empty or has no data rows.");
        setParsing(false);
        return;
      }

      setHeaders(headersList);
      setAllRows(rows);
      setTotalRows(rows.length);
      setPreview(rows.slice(0, 5));
    } catch (err: any) {
      setError(`Failed to parse file: ${err.message}`);
    }

    setParsing(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (allRows.length === 0) return;
    setImporting(true);
    setError("");

    try {
      const res = await importContacts({ rows: allRows, headers });
      setResult(res);
    } catch (err: any) {
      setError(`Import failed: ${err.message}`);
    }

    setImporting(false);
  };

  // Build mapped field display
  const mappedFields: Record<string, string> = {};
  for (const h of headers) {
    const lower = h.toLowerCase().trim();
    if (FIELD_MAP[lower]) mappedFields[h] = FIELD_MAP[lower];
  }

  // Result screen
  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-6 text-sm text-gray-500">
          <Link to="/contacts" className="hover:text-indigo-600">Contacts</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">Results</span>
        </nav>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          {result.errorCount === 0 ? (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
              <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
          )}
          <h2 className="text-2xl font-bold text-gray-900">Import Complete</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-2xl font-bold text-gray-900">{result.totalRows}</p>
              <p className="text-sm text-gray-500">Total Rows</p>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-2xl font-bold text-green-600">{result.successCount}</p>
              <p className="text-sm text-green-600">Imported</p>
            </div>
            <div className="rounded-lg bg-red-50 p-4">
              <p className="text-2xl font-bold text-red-600">{result.errorCount}</p>
              <p className="text-sm text-red-600">Errors</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-6 text-left">
              <h3 className="mb-2 font-semibold text-gray-900">Error Details</h3>
              <div className="max-h-48 overflow-y-auto rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {result.errors.map((err, i) => <p key={i} className="mb-1">{err}</p>)}
              </div>
            </div>
          )}
          <div className="mt-8 flex justify-center gap-4">
            <Link to="/contacts" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">View Contacts</Link>
            <button onClick={() => { setResult(null); setPreview(null); setAllRows([]); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Import Another File</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-6 text-sm text-gray-500">
        <Link to="/contacts" className="hover:text-indigo-600">Contacts</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">Import</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Import Contacts</h1>
        <p className="mt-1 text-sm text-gray-500">Upload a CSV or Excel file to bulk-add contacts. The first row should contain column headers.</p>
      </div>

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!preview && (
        <div
          onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition ${
            dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 bg-white hover:border-gray-400"
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
          {parsing ? (
            <div className="flex flex-col items-center gap-3">
              <svg className="h-10 w-10 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-600">Parsing file...</p>
            </div>
          ) : (
            <>
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
              </svg>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Drop your file here, or click to browse</h3>
              <p className="mt-2 text-sm text-gray-500">Supports CSV and Excel (.xlsx, .xls) files</p>
            </>
          )}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">File Preview</h2>
                <p className="text-sm text-gray-500">{totalRows} rows found — showing first {preview.length}</p>
              </div>
              <button onClick={() => { setPreview(null); setAllRows([]); }} className="text-sm text-gray-500 hover:text-gray-700">Choose different file</button>
            </div>
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700">Column Mapping</h3>
              <div className="rounded-lg bg-gray-50 p-4">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900">{h}</span>
                    <span className="text-gray-400">→</span>
                    <span className={mappedFields[h] ? "text-indigo-600" : "text-gray-400 italic"}>
                      {mappedFields[h] || "not mapped"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Business Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">City</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {preview.map((row, i) => (
                    <tr key={i} className="text-sm text-gray-700">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {row.business_name || <span className="italic text-red-400">Missing</span>}
                      </td>
                      <td className="px-4 py-3">{row.contact_name || "—"}</td>
                      <td className="px-4 py-3">{row.phone || "—"}</td>
                      <td className="px-4 py-3">{row.email || "—"}</td>
                      <td className="px-4 py-3">{[row.city, row.state].filter(Boolean).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4">
            <button onClick={() => { setPreview(null); setAllRows([]); }} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-500">Cancel</button>
            <button onClick={handleImport} disabled={importing}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
              {importing ? (
                <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Importing {totalRows} contacts...</>
              ) : `Import ${totalRows} Contacts`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
