import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const BAR_CATEGORIES = new Set(['Cocktails', 'Wine', 'Spirits', 'Beer']);

// ── Expense category mapping from your actual data to summary categories ──
const EXPENSE_MAPPING: { summary: string; sourceKeys: string[] }[] = [
  { summary: 'Food & Beverage (COGS)', sourceKeys: ['Cost of Goods Sold (Bar& Resto)'] },
  { summary: 'Labor/Staff', sourceKeys: ['Payroll Expense', 'RENTAL EXPENSE', 'Employee Meals', 'Meal Allowance', 'Employee Benefits & Other\'s'] },
  { summary: 'Utilities', sourceKeys: ['Fuel & Utilities', 'Utilities (Electric/Water/Gas/Fuel)'] },
  { summary: 'Housekeeping', sourceKeys: ['Supplies'] },
  { summary: 'Maintenance/Repairs', sourceKeys: ['Maintenance'] },
  { summary: 'Transportation', sourceKeys: ['Transportation Expense'] },
  { summary: 'Taxes/Government', sourceKeys: ['Business related Taxes'] },
  { summary: 'Miscellaneous', sourceKeys: ['Miscellaneous'] },
  { summary: 'Capital Expenditures', sourceKeys: ['CAPEX'] },
];

// Order for display
const P_AND_L_EXPENSE_ORDER = [
  'Food & Beverage (COGS)',
  'Labor/Staff',
  'Utilities',
  'Housekeeping',
  'Maintenance/Repairs',
  'Transportation',
  'Taxes/Government',
  'Miscellaneous',
  'Capital Expenditures',
];

interface Props {
  monthBookings: any[];
  orders: any[];
  monthExpenses: any[];
  menuItems: any[];
}

const fmt = (n: number) =>
  n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ResortOpsPnLReport = ({ monthBookings, orders, monthExpenses, menuItems }: Props) => {
  // ── Menu-item category lookup ──────────────────────────────────────────
  const menuCategoryMap = useMemo(
    () => new Map<string, string>(menuItems.map((m: any) => [m.name as string, m.category as string])),
    [menuItems],
  );

  // ── Revenue breakdown ──────────────────────────────────────────────────
  const hotelAccommodation = useMemo(
    () => monthBookings.reduce((s: number, b: any) => s + Number(b.paid_amount || 0), 0),
    [monthBookings],
  );

  const hotelServices = useMemo(
    () => monthBookings.reduce((s: number, b: any) => s + Number(b.addons_total || 0), 0),
    [monthBookings],
  );

  const { foodBevRevenue, barRevenue } = useMemo(() => {
    let food = 0;
    let bar = 0;
    for (const order of orders) {
      const items: any[] = order.items || [];
      if (items.length === 0) {
        food += Number(order.total || 0);
        continue;
      }
      let orderFood = 0;
      let orderBar = 0;
      for (const item of items) {
        const price = Number(item.price || 0) * (Number(item.qty) || 1);
        const cat = menuCategoryMap.get(item.name) || '';
        if (BAR_CATEGORIES.has(cat)) {
          orderBar += price;
        } else {
          orderFood += price;
        }
      }
      // Proportional split when order total doesn't match item sum (discounts, etc.)
      const itemSum = orderFood + orderBar;
      const orderTotal = Number(order.total || 0);
      if (itemSum > 0 && Math.abs(itemSum - orderTotal) > 0.01) {
        const ratio = orderTotal / itemSum;
        food += orderFood * ratio;
        bar += orderBar * ratio;
      } else {
        food += orderFood;
        bar += orderBar;
      }
    }
    return { foodBevRevenue: food, barRevenue: bar };
  }, [orders, menuCategoryMap]);

  const totalRevenue = hotelAccommodation + hotelServices + foodBevRevenue + barRevenue;

  // ── Expense breakdown with proper mapping ──────────────────────────────────
  const expenseBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      const cat = (e.category as string) || '';
      map.set(cat, (map.get(cat) || 0) + Number(e.amount || 0));
    }
    return map;
  }, [monthExpenses]);

  const expenseRows = useMemo(() => {
    // First, aggregate by summary category using the mapping
    const summaryMap = new Map<string, number>();
    
    for (const mapping of EXPENSE_MAPPING) {
      let total = 0;
      for (const sourceKey of mapping.sourceKeys) {
        total += expenseBySource.get(sourceKey) || 0;
      }
      if (total > 0) {
        summaryMap.set(mapping.summary, total);
      }
    }
    
    // Also capture any categories not in mapping (as Misc)
    for (const [sourceKey, amount] of expenseBySource.entries()) {
      const isMapped = EXPENSE_MAPPING.some(m => m.sourceKeys.includes(sourceKey));
      if (!isMapped && amount > 0) {
        summaryMap.set('Miscellaneous', (summaryMap.get('Miscellaneous') || 0) + amount);
      }
    }
    
    // Build rows in the correct display order
    return P_AND_L_EXPENSE_ORDER.map(summaryLabel => ({
      label: summaryLabel,
      amount: summaryMap.get(summaryLabel) || 0,
    })).filter(row => row.amount > 0);
  }, [expenseBySource]);

  const totalExpenses = useMemo(
    () => expenseRows.reduce((s, r) => s + r.amount, 0),
    [expenseRows],
  );

  // ── Summary metrics ────────────────────────────────────────────────────
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const metricCards = [
    { label: 'Total Revenue',   value: `₱${fmt(totalRevenue)}`,           color: 'text-green-400' },
    { label: 'Total Expenses',  value: `₱${fmt(totalExpenses)}`,           color: 'text-red-400' },
    { label: 'Net Profit',      value: `₱${fmt(netProfit)}`,               color: netProfit >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Profit Margin',   value: `${profitMargin.toFixed(1)}%`,       color: profitMargin >= 0 ? 'text-blue-400' : 'text-red-400' },
  ];

  const revenueRows = [
    { label: 'Hotel Accommodation', value: hotelAccommodation },
    { label: 'Food & Beverage',     value: foodBevRevenue },
    { label: 'Bar Income',          value: barRevenue },
    { label: 'Hotel Services',      value: hotelServices },
  ];

  // ── PDF export (print-to-PDF) ──────────────────────────────────────────
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const downloadPDF = () => {
    const monthDate = (() => {
      const raw = monthExpenses[0]?.expense_date || monthBookings[0]?.check_in;
      if (raw) {
        const dateOnly = String(raw).slice(0, 10);
        const d = new Date(dateOnly + 'T00:00:00');
        if (!isNaN(d.getTime())) return d;
      }
      return new Date();
    })();
    const monthYearLabel = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const generatedDate = new Date().toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const revenueRowsHTML = revenueRows
      .map((row, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8f9fa'}">
          <td style="padding:8px 12px;border:1px solid #dee2e6">${escapeHtml(row.label)}</td>
          <td style="padding:8px 12px;border:1px solid #dee2e6;text-align:right">&#8369;${fmt(row.value)}</td>
        </tr>`)
      .join('');

    const expenseRowsHTML = expenseRows
      .map((row, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8f9fa'}">
          <td style="padding:8px 12px;border:1px solid #dee2e6">${escapeHtml(row.label)}</td>
          <td style="padding:8px 12px;border:1px solid #dee2e6;text-align:right">&#8369;${fmt(row.amount)}</td>
        </tr>`)
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>KAPWA Hospitality OS P&amp;L Report — ${monthYearLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; }
    .header { background: #1a1a2e; color: #fff; text-align: center; padding: 24px 16px 20px; }
    .header h1 { font-size: 22px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
    .header .subtitle { font-size: 13px; opacity: 0.8; margin-bottom: 6px; }
    .header .report-title { font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
    .content { padding: 24px 32px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .summary-box { border: 1px solid #dee2e6; border-radius: 6px; padding: 14px 16px; text-align: center; }
    .summary-box .box-label { font-size: 11px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .summary-box .box-value { font-size: 16px; font-weight: 700; }
    .box-green { color: #198754; }
    .box-red { color: #dc3545; }
    .box-blue { color: #0d6efd; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1a1a2e; margin-bottom: 10px; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    thead tr { background: #e9ecef; }
    thead th { padding: 9px 12px; border: 1px solid #dee2e6; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #495057; }
    thead th:last-child { text-align: right; }
    .total-row td { padding: 9px 12px; border: 1px solid #dee2e6; font-weight: 700; background: #f1f3f5; }
    .total-row td:last-child { text-align: right; }
    .total-green { color: #198754; }
    .total-red { color: #dc3545; }
    .footer { margin-top: 32px; border-top: 1px solid #dee2e6; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #6c757d; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .header { background: #1a1a2e !important; color: #fff !important; }
      thead tr { background: #e9ecef !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>KAPWA Hospitality OS</h1>
    <div class="subtitle">San Vicente, Palawan</div>
    <div class="report-title">Monthly P&amp;L Report &mdash; ${monthYearLabel}</div>
  </div>
  <div class="content">
    <div class="section-title">Summary</div>
    <div class="summary-grid">
      <div class="summary-box">
        <div class="box-label">Total Revenue</div>
        <div class="box-value box-green">&#8369;${fmt(totalRevenue)}</div>
      </div>
      <div class="summary-box">
        <div class="box-label">Total Expenses</div>
        <div class="box-value box-red">&#8369;${fmt(totalExpenses)}</div>
      </div>
      <div class="summary-box">
        <div class="box-label">Net Profit</div>
        <div class="box-value ${netProfit >= 0 ? 'box-green' : 'box-red'}">&#8369;${fmt(netProfit)}</div>
      </div>
      <div class="summary-box">
        <div class="box-label">Profit Margin</div>
        <div class="box-value ${profitMargin >= 0 ? 'box-blue' : 'box-red'}">${profitMargin.toFixed(1)}%</div>
      </div>
    </div>

    <div class="section-title">Revenue Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${revenueRowsHTML}
        <tr class="total-row">
          <td>Total Revenue</td>
          <td class="total-green">&#8369;${fmt(totalRevenue)}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Expenses Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${expenseRowsHTML}
        <tr class="total-row">
          <td>Total Expenses</td>
          <td class="total-red">&#8369;${fmt(totalExpenses)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <span>Generated: ${generatedDate}</span>
      <span>Powered by KAPWA Hospitality OS</span>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      alert('Popup blocked. Please allow popups for this site to view the PDF report.');
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Section heading ── */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wider text-foreground">Monthly P&amp;L Report</h3>
        <Button
          size="sm"
          variant="outline"
          className="font-display text-xs tracking-wider gap-1 min-h-[36px] whitespace-nowrap flex-shrink-0"
          onClick={downloadPDF}
        >
          <Download className="w-3.5 h-3.5" /> Download PDF
        </Button>
      </div>

      {/* ── Top-row metric cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metricCards.map(card => (
          <Card key={card.label} className="bg-card border-border">
            <CardContent className="p-3">
              <p className="font-body text-xs text-muted-foreground">{card.label}</p>
              <p className={`font-display text-lg ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Revenue & Expense tables ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Revenue Breakdown */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pl-4">Source</TableHead>
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pr-4 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueRows.map(row => (
                  <TableRow key={row.label} className="border-border">
                    <TableCell className="font-body text-sm text-foreground py-2 pl-4">{row.label}</TableCell>
                    <TableCell className="font-body text-sm text-foreground py-2 pr-4 text-right">
                      ₱{fmt(row.value)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-border border-t-2 border-t-border">
                  <TableCell className="font-display text-xs tracking-wider text-foreground py-2 pl-4">Total Revenue</TableCell>
                  <TableCell className="font-display text-sm text-green-400 py-2 pr-4 text-right">
                    ₱{fmt(totalRevenue)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Expenses Breakdown */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Expenses Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pl-4">Category</TableHead>
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pr-4 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseRows.map(row => (
                  <TableRow key={row.label} className="border-border">
                    <TableCell className="font-body text-sm text-foreground py-2 pl-4">{row.label}</TableCell>
                    <TableCell className="font-body text-sm text-foreground py-2 pr-4 text-right">
                      ₱{fmt(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-border border-t-2 border-t-border">
                  <TableCell className="font-display text-xs tracking-wider text-foreground py-2 pl-4">Total Expenses</TableCell>
                  <TableCell className="font-display text-sm text-red-400 py-2 pr-4 text-right">
                    ₱{fmt(totalExpenses)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ── */}
      <div className="space-y-4">
        <h3 className="font-display text-sm tracking-wider text-foreground">Visual Summary</h3>

        {/* Chart 1 — Revenue vs Expenses */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="pr-4">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart
                layout="vertical"
                data={[
                  { name: 'Total Revenue', value: totalRevenue },
                  { name: 'Total Expenses', value: totalExpenses },
                ]}
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`₱${fmt(v)}`, '']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={24}>
                  <Cell fill="hsl(var(--success))" />
                  <Cell fill="hsl(var(--destructive))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 2 — Revenue Breakdown by Source */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Revenue Breakdown by Source</CardTitle>
          </CardHeader>
          <CardContent className="pr-4">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart
                layout="vertical"
                data={[...revenueRows].sort((a, b) => b.value - a.value)}
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`₱${fmt(v)}`, 'Revenue']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="value" fill="hsl(var(--success))" radius={[0, 3, 3, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 3 — Top 5 Expenses by Category */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Top 5 Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent className="pr-4">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart
                layout="vertical"
                data={[...expenseRows]
                  .filter(r => r.amount > 0)
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 5)}
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`₱${fmt(v)}`, 'Expense']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="amount" fill="hsl(var(--warning))" radius={[0, 3, 3, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default ResortOpsPnLReport;
