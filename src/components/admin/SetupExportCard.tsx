import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { format } from 'date-fns';
import { Download, FileArchive, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';

type ExportTable = {
  fileName: string;
  rows: Record<string, unknown>[];
};

type LookupRow = {
  id: string;
  name?: string | null;
  table_name?: string | null;
};

type StaffRoleRow = {
  id: string;
  key?: string | null;
  name?: string | null;
  permissions?: unknown;
  created_at?: string | null;
};

const toCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const toCsvRow = (values: unknown[]) =>
  values.map((value) => `"${toCsvValue(value).replace(/"/g, '""')}"`).join(',');

const rowsToCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';

  const headers = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key));
      return acc;
    }, new Set<string>()),
  );

  return [
    headers.join(','),
    ...rows.map((row) => toCsvRow(headers.map((header) => row[header]))),
  ].join('\n');
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const SetupExportCard = () => {
  const [loading, setLoading] = useState(false);

  const exportItems = useMemo(
    () => [
      'Resort profile',
      'Invoice settings',
      'Billing config',
      'Payment methods',
      'Dine-in tables',
      'Order types',
      'Menu categories',
      'Housekeeping checklists',
      'Cleaning packages',
      'Employees, roles, and permissions',
    ],
    [],
  );

  const handleExport = async () => {
    const confirmed = window.confirm(
      'This download includes full employee records, including login-related fields. Continue?',
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const [
        resortProfileResult,
        invoiceSettingsResult,
        billingConfigResult,
        paymentMethodsResult,
        resortTablesResult,
        orderTypesResult,
        menuCategoriesResult,
        roomTypesResult,
        housekeepingChecklistsResult,
        cleaningPackagesResult,
        cleaningPackageItemsResult,
        ingredientsResult,
        employeesResult,
        employeeRolesResult,
        employeePermissionsResult,
        staffRolesResult,
      ] = await Promise.all([
        supabase.from('resort_profile').select('*').order('created_at'),
        (supabase.from('invoice_settings' as any) as any).select('*').order('created_at'),
        (supabase.from('billing_config' as any) as any).select('*').order('created_at'),
        (supabase.from('payment_methods' as any) as any).select('*').order('sort_order'),
        supabase.from('resort_tables').select('*').order('table_name'),
        supabase.from('order_types').select('*').order('sort_order'),
        supabase.from('menu_categories').select('*').order('sort_order'),
        supabase.from('room_types').select('*').order('name'),
        supabase.from('housekeeping_checklists').select('*').order('sort_order'),
        (supabase.from('cleaning_packages' as any) as any).select('*').order('name'),
        (supabase.from('cleaning_package_items' as any) as any).select('*'),
        supabase.from('ingredients').select('id, name').order('name'),
        supabase.from('employees').select('*').order('name'),
        supabase.from('employee_roles').select('*').order('created_at'),
        (supabase.from('employee_permissions' as any) as any).select('*').order('created_at'),
        (supabase.from('staff_roles' as any) as any).select('*').order('created_at'),
      ]);

      const results = [
        resortProfileResult,
        invoiceSettingsResult,
        billingConfigResult,
        paymentMethodsResult,
        resortTablesResult,
        orderTypesResult,
        menuCategoriesResult,
        roomTypesResult,
        housekeepingChecklistsResult,
        cleaningPackagesResult,
        cleaningPackageItemsResult,
        ingredientsResult,
        employeesResult,
        employeeRolesResult,
        employeePermissionsResult,
        staffRolesResult,
      ];

      const failedResult = results.find((result) => result.error);
      if (failedResult?.error) throw failedResult.error;

      const roomTypes = (roomTypesResult.data ?? []) as LookupRow[];
      const cleaningPackages = (cleaningPackagesResult.data ?? []) as LookupRow[];
      const ingredients = (ingredientsResult.data ?? []) as LookupRow[];
      const employees = (employeesResult.data ?? []) as LookupRow[];
      const staffRoles = ((staffRolesResult.data ?? []) as StaffRoleRow[]).map((role) => ({
        ...role,
        permissions_json: role.permissions,
      }));

      const roomTypeNameById = new Map(roomTypes.map((row) => [row.id, row.name ?? '']));
      const packageNameById = new Map(cleaningPackages.map((row) => [row.id, row.name ?? '']));
      const ingredientNameById = new Map(ingredients.map((row) => [row.id, row.name ?? '']));
      const employeeNameById = new Map(employees.map((row) => [row.id, row.name ?? '']));
      const staffRoleNameByKey = new Map(
        staffRoles.map((role) => [String(role.key ?? ''), String(role.name ?? '')]),
      );

      const exportTables: ExportTable[] = [
        { fileName: 'resort_profile.csv', rows: (resortProfileResult.data ?? []) as Record<string, unknown>[] },
        { fileName: 'invoice_settings.csv', rows: (invoiceSettingsResult.data ?? []) as Record<string, unknown>[] },
        { fileName: 'billing_config.csv', rows: (billingConfigResult.data ?? []) as Record<string, unknown>[] },
        { fileName: 'payment_methods.csv', rows: (paymentMethodsResult.data ?? []) as Record<string, unknown>[] },
        { fileName: 'resort_tables.csv', rows: (resortTablesResult.data ?? []) as Record<string, unknown>[] },
        { fileName: 'order_types.csv', rows: (orderTypesResult.data ?? []) as Record<string, unknown>[] },
        { fileName: 'menu_categories.csv', rows: (menuCategoriesResult.data ?? []) as Record<string, unknown>[] },
        { fileName: 'room_types.csv', rows: roomTypes as unknown as Record<string, unknown>[] },
        {
          fileName: 'housekeeping_checklists.csv',
          rows: ((housekeepingChecklistsResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
            ...row,
            room_type_name: roomTypeNameById.get(String(row.room_type_id ?? '')) ?? '',
          })),
        },
        {
          fileName: 'cleaning_packages.csv',
          rows: ((cleaningPackagesResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
            ...row,
            room_type_name: roomTypeNameById.get(String(row.room_type_id ?? '')) ?? '',
          })),
        },
        {
          fileName: 'cleaning_package_items.csv',
          rows: ((cleaningPackageItemsResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
            ...row,
            package_name: packageNameById.get(String(row.package_id ?? '')) ?? '',
            ingredient_name: ingredientNameById.get(String(row.ingredient_id ?? '')) ?? '',
          })),
        },
        { fileName: 'employees.csv', rows: (employeesResult.data ?? []) as Record<string, unknown>[] },
        {
          fileName: 'employee_roles.csv',
          rows: ((employeeRolesResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
            ...row,
            employee_name: employeeNameById.get(String(row.employee_id ?? '')) ?? '',
            role_name: staffRoleNameByKey.get(String(row.role_key ?? '')) ?? '',
          })),
        },
        {
          fileName: 'employee_permissions.csv',
          rows: ((employeePermissionsResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
            ...row,
            employee_name: employeeNameById.get(String(row.employee_id ?? '')) ?? '',
          })),
        },
        { fileName: 'staff_roles.csv', rows: staffRoles },
      ];

      const zip = new JSZip();
      exportTables.forEach(({ fileName, rows }) => {
        zip.file(fileName, rowsToCsv(rows));
      });

      zip.file(
        'README.txt',
        [
          'Setup export generated from Admin → Setup.',
          'This ZIP includes sensitive employee data, including login-related fields.',
          'Relationship helper columns are included for housekeeping and staff mapping.',
        ].join('\n'),
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `setup-export-${format(new Date(), 'yyyyMMdd-HHmm')}.zip`);
      toast.success('Setup export downloaded');
    } catch (error) {
      console.error(error);
      toast.error('Setup export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-primary" />
          <CardTitle className="font-display text-sm tracking-wider">Download Setup Data</CardTitle>
        </div>
        <CardDescription className="font-body text-xs">
          Export your setup configuration as a ZIP of CSV files for importing into the cloned onboarding app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle className="font-display text-xs tracking-wide">Sensitive export</AlertTitle>
          <AlertDescription className="font-body text-xs text-muted-foreground">
            Includes full employee records, roles, permissions, and login-related fields. Keep the ZIP private.
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="font-display text-xs tracking-wide text-foreground">Included CSV files</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {exportItems.map((item) => (
              <li key={item} className="font-body text-xs text-muted-foreground">
                • {item}
              </li>
            ))}
          </ul>
        </div>

        <Button onClick={handleExport} disabled={loading} className="w-full font-display tracking-wider">
          <Download className="h-4 w-4" />
          {loading ? 'Generating ZIP...' : 'Download Setup Data'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default SetupExportCard;
