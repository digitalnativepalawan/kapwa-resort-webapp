import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { EXPENSE_CATEGORIES, VAT_STATUSES, computeVatFields } from './ResortOpsDashboard';

interface ExpenseBulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const ExpenseBulkImportModal = ({ open, onOpenChange, onComplete }: ExpenseBulkImportModalProps) => {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number; errorDetails: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const header = 'Date,Supplier Name,Supplier TIN,VAT Status,Invoice Number,OR Number,Expense Category,Description,Vatable Sale,VAT Amount,VAT Exempt Amount,Zero Rated Amount,Total Amount,Withholding Tax,Payment Method,Is Paid,Project Unit,Notes,Image URL';
    const example = '02/15/2026,Meralco,123-456-789-000,VAT,,OR-001,Utilities (Electric/Water/Gas/Fuel),Monthly electric bill,,,,,5600,0,Bank Transfer,true,,Monthly billing,';
    const csv = [header, example].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expense-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseDate = (raw: string): string | null => {
    const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdyMatch) {
      const [, m, d, y] = mdyMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) return raw;
    return null;
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

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      // Columns: Date, Supplier Name, Supplier TIN, VAT Status, Invoice #, OR #, Category, Description,
      //          Vatable Sale, VAT Amount, VAT Exempt, Zero Rated, Total Amount, Withholding Tax,
      //          Payment Method, Is Paid, Project Unit, Notes, Image URL
      if (cols.length < 13) { errors.push(`Row ${i}: Not enough columns (need at least 13)`); continue; }
      
      const [dateRaw, supplierName, supplierTin, vatStatusRaw, invoiceNum, orNum, category, description,
             vatableSaleRaw, vatAmountRaw, vatExemptRaw, zeroRatedRaw, totalAmountRaw, withholdingRaw,
             paymentMethod, isPaidRaw, projectUnit, notes, imageUrl] = cols;

      const date = parseDate(dateRaw);
      if (!date) { errors.push(`Row ${i}: Invalid date "${dateRaw}"`); continue; }
      if (!supplierName) { errors.push(`Row ${i}: Missing supplier name`); continue; }

      const totalAmount = parseFloat(totalAmountRaw);
      if (isNaN(totalAmount) || totalAmount <= 0) { errors.push(`Row ${i}: Invalid total amount "${totalAmountRaw}"`); continue; }

      const vatStatus = (VAT_STATUSES as readonly string[]).includes(vatStatusRaw) ? vatStatusRaw : 'Non-VAT';

      if (vatStatus === 'VAT' && !supplierTin) {
        errors.push(`Row ${i}: Supplier TIN required for VAT status`);
        continue;
      }

      // Use provided VAT breakdown or auto-compute
      const hasManualVat = vatableSaleRaw || vatAmountRaw || vatExemptRaw || zeroRatedRaw;
      let vatFields;
      if (hasManualVat) {
        vatFields = {
          vatable_sale: parseFloat(vatableSaleRaw) || 0,
          vat_amount: parseFloat(vatAmountRaw) || 0,
          vat_exempt_amount: parseFloat(vatExemptRaw) || 0,
          zero_rated_amount: parseFloat(zeroRatedRaw) || 0,
        };
      } else {
        vatFields = computeVatFields(vatStatus, totalAmount);
      }

      rows.push({
        expense_date: date,
        name: supplierName,
        supplier_tin: supplierTin || null,
        vat_status: vatStatus,
        invoice_number: invoiceNum || null,
        official_receipt_number: orNum || null,
        category: EXPENSE_CATEGORIES.includes(category) ? category : category || 'Miscellaneous',
        description: description || null,
        vatable_sale: vatFields.vatable_sale,
        vat_amount: vatFields.vat_amount,
        vat_exempt_amount: vatFields.vat_exempt_amount,
        zero_rated_amount: vatFields.zero_rated_amount,
        amount: totalAmount,
        withholding_tax: parseFloat(withholdingRaw) || 0,
        payment_method: paymentMethod || null,
        is_paid: isPaidRaw?.toLowerCase() === 'false' ? false : true,
        project_unit: projectUnit || null,
        notes: notes || null,
        image_url: imageUrl || null,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('resort_ops_expenses' as any).insert(rows as any);
      if (error) {
        errors.push(`DB error: ${error.message}`);
      }
    }

    setResult({ success: rows.length, errors: errors.length, errorDetails: errors });
    if (rows.length > 0) {
      onComplete();
      toast.success(`Imported ${rows.length} expenses`);
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">Bulk Import Expenses</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="font-body text-sm text-muted-foreground">
            Download the CSV template with VAT-compliant columns, fill it in, then upload to bulk import expenses.
          </p>

          <div className="font-body text-xs text-muted-foreground p-2 rounded border border-border bg-muted/50">
            <p className="font-medium text-foreground mb-1">CSV Columns:</p>
            <p>Date, Supplier Name, Supplier TIN, VAT Status, Invoice #, OR #, Category, Description, Vatable Sale, VAT Amount, VAT Exempt, Zero Rated, Total Amount, Withholding Tax, Payment Method, Is Paid, Project Unit, Notes, Image URL</p>
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

export default ExpenseBulkImportModal;
