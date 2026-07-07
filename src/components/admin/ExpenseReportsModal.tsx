import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download } from 'lucide-react';
import jsPDF from 'jspdf';

const CHART_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--accent))', '#22c55e', '#eab308', '#ef4444',
  '#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#ec4899',
  '#6366f1', '#84cc16', '#06b6d4', '#f43f5e',
];

interface ExpenseReportsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: any[];
  monthLabel: string;
  onCategoryClick: (category: string) => void;
}

const ExpenseReportsModal = ({ open, onOpenChange, expenses, monthLabel, onCategoryClick }: ExpenseReportsModalProps) => {
  const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDec = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const grandTotal = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses]);

  // Correct VAT summary: only sum from matching vat_status
  const vatSummary = useMemo(() => {
    return expenses.reduce((acc, e) => {
      const amt = Number(e.amount || 0);
      const vatStatus = e.vat_status || 'Non-VAT';
      return {
        totalVatablePurchases: acc.totalVatablePurchases + (vatStatus === 'VAT' ? Number(e.vatable_sale || 0) : 0),
        totalInputVat: acc.totalInputVat + (vatStatus === 'VAT' ? Number(e.vat_amount || 0) : 0),
        totalNonVat: acc.totalNonVat + (vatStatus === 'Non-VAT' ? amt : 0),
        totalVatExempt: acc.totalVatExempt + (vatStatus === 'VAT-Exempt' ? amt : 0),
        totalZeroRated: acc.totalZeroRated + (vatStatus === 'Zero-Rated' ? amt : 0),
      };
    }, { totalVatablePurchases: 0, totalInputVat: 0, totalNonVat: 0, totalVatExempt: 0, totalZeroRated: 0 });
  }, [expenses]);

  const breakdown = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    expenses.forEach(e => {
      const cat = e.category || 'Uncategorized';
      const cur = map.get(cat) || { total: 0, count: 0 };
      cur.total += Number(e.amount || 0);
      cur.count += 1;
      map.set(cat, cur);
    });
    return Array.from(map.entries())
      .map(([category, { total, count }]) => ({
        category,
        total,
        count,
        pct: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, grandTotal]);

  const exportCSV = () => {
    const rows = [['Category', 'Total Amount', '# of Expenses', '% of Total']];
    breakdown.forEach(r => rows.push([r.category, r.total.toFixed(2), String(r.count), r.pct.toFixed(1) + '%']));
    rows.push([]);
    rows.push(['--- VAT Summary ---']);
    rows.push(['Total VATable Purchases', vatSummary.totalVatablePurchases.toFixed(2)]);
    rows.push(['Total Input VAT', vatSummary.totalInputVat.toFixed(2)]);
    rows.push(['Total Non-VAT Expenses', vatSummary.totalNonVat.toFixed(2)]);
    rows.push(['Total VAT-Exempt', vatSummary.totalVatExempt.toFixed(2)]);
    rows.push(['Total Zero-Rated', vatSummary.totalZeroRated.toFixed(2)]);
    rows.push(['Grand Total', grandTotal.toFixed(2)]);
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${monthLabel.replace(/\s/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Expense Report - ${monthLabel}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Grand Total: ₱${fmt(grandTotal)}`, 14, 30);

    let y = 42;
    doc.setFontSize(9);
    doc.text('Category', 14, y);
    doc.text('Amount', 100, y);
    doc.text('Count', 140, y);
    doc.text('% Total', 165, y);
    y += 6;
    breakdown.forEach(r => {
      doc.text(r.category, 14, y);
      doc.text(`₱${fmt(r.total)}`, 100, y);
      doc.text(String(r.count), 140, y);
      doc.text(`${r.pct.toFixed(1)}%`, 165, y);
      y += 5;
      if (y > 260) { doc.addPage(); y = 20; }
    });

    y += 8;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.text('VAT Summary', 14, y);
    y += 7;
    doc.setFontSize(9);
    const vatRows = [
      ['VATable Purchases', `₱${fmtDec(vatSummary.totalVatablePurchases)}`],
      ['Input VAT (12%)', `₱${fmtDec(vatSummary.totalInputVat)}`],
      ['Non-VAT Expenses', `₱${fmtDec(vatSummary.totalNonVat)}`],
      ['VAT-Exempt', `₱${fmtDec(vatSummary.totalVatExempt)}`],
      ['Zero-Rated', `₱${fmtDec(vatSummary.totalZeroRated)}`],
      ['Grand Total', `₱${fmtDec(grandTotal)}`],
    ];
    vatRows.forEach(([label, val]) => {
      doc.text(label, 14, y);
      doc.text(val, 100, y);
      y += 5;
    });

    doc.save(`expense-report-${monthLabel.replace(/\s/g, '-')}.pdf`);
  };

  const handleCategoryClick = (category: string) => {
    onCategoryClick(category);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-base">Expense Report — {monthLabel}</DialogTitle>
        </DialogHeader>

        {/* Total Expenses Card */}
        <div className="p-4 rounded-lg border border-border bg-secondary">
          <p className="font-body text-xs text-muted-foreground">Total Expenses</p>
          <p className="font-display text-2xl text-foreground">₱{fmt(grandTotal)}</p>
          <p className="font-body text-xs text-muted-foreground mt-1">{breakdown.length} categories · {expenses.length} entries</p>
        </div>

        {/* VAT Summary Card - Stacked for mobile */}
        <div className="p-4 rounded-lg border border-border bg-secondary space-y-2">
          <p className="font-display text-xs tracking-wider text-foreground">VAT Summary</p>
          <div className="space-y-1.5">
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">VATable Purchases</span>
              <span className="text-foreground">₱{fmtDec(vatSummary.totalVatablePurchases)}</span>
            </div>
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">Input VAT (12%)</span>
              <span className="text-foreground font-medium">₱{fmtDec(vatSummary.totalInputVat)}</span>
            </div>
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">Non-VAT</span>
              <span className="text-foreground">₱{fmtDec(vatSummary.totalNonVat)}</span>
            </div>
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">VAT-Exempt</span>
              <span className="text-foreground">₱{fmtDec(vatSummary.totalVatExempt)}</span>
            </div>
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">Zero-Rated</span>
              <span className="text-foreground">₱{fmtDec(vatSummary.totalZeroRated)}</span>
            </div>
            <div className="flex justify-between font-body text-sm border-t border-border pt-1.5">
              <span className="text-foreground font-medium">Grand Total</span>
              <span className="text-foreground font-medium">₱{fmtDec(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Bar chart */}
        {breakdown.length > 0 && (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <XAxis type="number" tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} className="font-body text-xs" />
                <YAxis type="category" dataKey="category" width={100} tick={{ fontSize: 9 }} className="font-body" />
                <Tooltip formatter={(v: number) => [`₱${fmt(v)}`, 'Amount']} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category Breakdown - Mobile-first stacked cards */}
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-foreground">Category Breakdown</p>
          {breakdown.map(r => (
            <div key={r.category} className="p-3 rounded border border-border cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleCategoryClick(r.category)}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-body text-sm text-foreground font-medium">{r.category}</p>
                <Badge variant="outline" className="font-body text-[10px]">{r.count} items</Badge>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-display text-base text-foreground">₱{fmt(r.total)}</p>
                <p className="font-body text-xs text-muted-foreground">{r.pct.toFixed(1)}%</p>
              </div>
              {/* Mini progress bar */}
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(r.pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Export buttons */}
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={exportCSV} className="flex-1">
            <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF} className="flex-1">
            <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseReportsModal;
