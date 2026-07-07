import { supabase } from '@/integrations/supabase/client';

/**
 * Log an audit entry for any staff modification made through the Manager dashboard.
 * Reads employee identity from localStorage.
 */
export const logAudit = async (
  action: 'created' | 'updated' | 'deleted',
  tableName: string,
  recordId: string,
  details: string = ''
) => {
  const employeeId = localStorage.getItem('emp_id') || null;
  const employeeName = localStorage.getItem('emp_name') || 'Unknown';

  await (supabase.from('audit_log' as any) as any).insert({
    employee_id: employeeId,
    employee_name: employeeName,
    action,
    table_name: tableName,
    record_id: recordId,
    details,
  });
};
