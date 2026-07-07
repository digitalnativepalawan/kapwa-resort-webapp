import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';

interface MenuBulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  categories: string[];
}

const MenuBulkImportModal = ({ open, onOpenChange, onComplete, categories }: MenuBulkImportModalProps) => {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number; errorDetails: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const header = 'Category,Name,Description,Price,Sort Order';
    const example = 'Main Courses,Grilled Fish,Fresh catch of the day,450,0';
    const csv = [header, example].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      toast.error('CSV must have a header + at least one data row');
      setImporting(false);
      return;
    }

    const rows: any[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 4) { errors.push(`Row ${i}: Not enough columns (need at least 4)`); continue; }

      const [category, name, description, priceRaw, sortOrderRaw] = cols;

      if (!name) { errors.push(`Row ${i}: Missing name`); continue; }
      if (!category) { errors.push(`Row ${i}: Missing category`); continue; }

      const price = parseFloat(priceRaw);
      if (isNaN(price) || price < 0) { errors.push(`Row ${i}: Invalid price "${priceRaw}"`); continue; }

      const key = `${category.toLowerCase()}::${name.toLowerCase()}`;
      if (seen.has(key)) { errors.push(`Row ${i}: Duplicate "${name}" in "${category}" (skipped)`); continue; }
      seen.add(key);

      rows.push({
        category,
        name,
        description: description || null,
        price,
        sort_order: parseInt(sortOrderRaw) || 0,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('menu_items').insert(rows);
      if (error) {
        errors.push(`DB error: ${error.message}`);
      }
    }

    setResult({ success: rows.length, errors: errors.length, errorDetails: errors });
    if (rows.length > 0) {
      onComplete();
      toast.success(`Imported ${rows.length} menu items`);
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">Bulk Import Menu Items</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="font-body text-sm text-muted-foreground">
            Download the CSV template, fill it in, then upload to bulk import menu items.
          </p>

          <div className="font-body text-xs text-muted-foreground p-2 rounded border border-border bg-muted/50">
            <p className="font-medium text-foreground mb-1">CSV Columns:</p>
            <p>Category, Name, Description, Price, Sort Order</p>
            {categories.length > 0 && (
              <p className="mt-1">Existing categories: {categories.join(', ')}</p>
            )}
          </div>

          <Button size="sm" variant="outline" onClick={downloadTemplate} className="w-full">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV Template
          </Button>

          <div className="space-y-2">
            <label className="font-body text-xs text-muted-foreground">Upload CSV file</label>
            <Input type="file" accept=".csv" ref={fileRef} className="bg-secondary border-border text-foreground font-body" />
          </div>

          <Button size="sm" onClick={handleImport} disabled={importing} className="w-full">
            <Upload className="w-3.5 h-3.5 mr-1.5" /> {importing ? 'Importing...' : 'Import'}
          </Button>

          {result && (
            <div className="p-3 rounded border border-border bg-secondary space-y-1">
              <p className="font-body text-sm text-foreground">
                ✅ {result.success} imported · ❌ {result.errors} errors
              </p>
              {result.errorDetails.length > 0 && (
                <div className="max-h-32 overflow-y-auto">
                  {result.errorDetails.map((e, i) => (
                    <p key={i} className="font-body text-xs text-destructive">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MenuBulkImportModal;
