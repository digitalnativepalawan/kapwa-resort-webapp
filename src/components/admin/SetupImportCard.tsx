import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Upload, FileArchive, ShieldAlert, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';

// Simple CSV parser for the export format: header row + rows where every value
// is wrapped in double quotes and internal quotes are escaped as "".
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1)
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

// Fields exported as human-readable helpers that don't exist on the table.
const HELPER_FIELDS = new Set([
  'room_type_name', 'package_name', 'ingredient_name',
  'employee_name', 'role_name', 'permissions_json',
]);

// Convert CSV string values to JS: '' → null, JSON-looking → parsed, "true"/"false" → bool, numeric → number.
function coerceRow(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(row)) {
    if (HELPER_FIELDS.has(k)) continue;
    if (raw === '') { out[k] = null; continue; }
    if (raw === 'true') { out[k] = true; continue; }
    if (raw === 'false') { out[k] = false; continue; }
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
      try { out[k] = JSON.parse(raw); continue; } catch { /* fallthrough */ }
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) { out[k] = Number(raw); continue; }
    out[k] = raw;
  }
  return out;
}

// Ordered so parents load before children (FKs resolve).
const IMPORT_ORDER: { file: string; table: string; conflict?: string }[] = [
  { file: 'resort_profile.csv', table: 'resort_profile' },
  { file: 'invoice_settings.csv', table: 'invoice_settings' },
  { file: 'billing_config.csv', table: 'billing_config' },
  { file: 'payment_methods.csv', table: 'payment_methods' },
  { file: 'resort_tables.csv', table: 'resort_tables' },
  { file: 'order_types.csv', table: 'order_types' },
  { file: 'menu_categories.csv', table: 'menu_categories' },
  { file: 'room_types.csv', table: 'room_types' },
  { file: 'housekeeping_checklists.csv', table: 'housekeeping_checklists' },
  { file: 'cleaning_packages.csv', table: 'cleaning_packages' },
  { file: 'cleaning_package_items.csv', table: 'cleaning_package_items' },
  { file: 'employees.csv', table: 'employees' },
  { file: 'staff_roles.csv', table: 'staff_roles' },
  { file: 'employee_roles.csv', table: 'employee_roles' },
  { file: 'employee_permissions.csv', table: 'employee_permissions' },
];

const SetupImportCard = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => IMPORT_ORDER.map((i) => i.table), []);

  const handleFile = async (file: File) => {
    const confirmed = window.confirm(
      `This will overwrite matching rows (by id) in your setup tables from "${file.name}". Continue?`,
    );
    if (!confirmed) return;

    setLoading(true);
    setProgress('Reading ZIP...');

    try {
      const zip = await JSZip.loadAsync(file);
      const results: { table: string; count: number; error?: string }[] = [];

      for (const { file: fname, table } of IMPORT_ORDER) {
        const entry = zip.file(fname);
        if (!entry) { results.push({ table, count: 0, error: 'missing' }); continue; }
        setProgress(`Importing ${table}...`);
        const text = await entry.async('string');
        const parsed = parseCsv(text);
        if (!parsed.length) { results.push({ table, count: 0 }); continue; }
        const rows = parsed.map(coerceRow);

        const { error } = await (supabase.from(table as any) as any).upsert(rows, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

        if (error) {
          results.push({ table, count: 0, error: error.message });
        } else {
          results.push({ table, count: rows.length });
        }
      }

      const failed = results.filter((r) => r.error);
      const total = results.reduce((sum, r) => sum + r.count, 0);

      if (failed.length) {
        console.error('Setup import errors', failed);
        toast.error(`Imported ${total} rows; ${failed.length} table(s) failed. See console.`);
      } else {
        toast.success(`Setup import complete — ${total} rows across ${results.length} tables.`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Setup import failed');
    } finally {
      setLoading(false);
      setProgress('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-primary" />
          <CardTitle className="font-display text-sm tracking-wider">Upload Setup Data</CardTitle>
        </div>
        <CardDescription className="font-body text-xs">
          Restore setup configuration by uploading a ZIP previously downloaded from this section.
          Existing rows with matching IDs will be overwritten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle className="font-display text-xs tracking-wide">Destructive action</AlertTitle>
          <AlertDescription className="font-body text-xs text-muted-foreground">
            Upsert-by-id across setup tables. Rows not present in the ZIP are left untouched.
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="font-display text-xs tracking-wide text-foreground">Tables restored</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="font-body text-xs text-muted-foreground">• {item}</li>
            ))}
          </ul>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="w-full font-display tracking-wider"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {loading ? (progress || 'Importing...') : 'Upload Setup ZIP'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default SetupImportCard;
