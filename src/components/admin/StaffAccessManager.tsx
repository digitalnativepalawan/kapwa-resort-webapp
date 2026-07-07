import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { type PermissionLevel, getPermissionLevel } from '@/lib/permissions';
import { Plus, Pencil, Copy, Trash2, X } from 'lucide-react';

const from = (table: string) => supabase.from(table as any);

/* ── Built-in role templates ── */
const BUILTIN_ROLE_TEMPLATES: Record<string, string[]> = {
  admin: ['admin'],
  gm: [
    'orders:edit', 'kitchen:edit', 'bar:edit', 'housekeeping:edit',
    'reception:edit', 'experiences:edit', 'reports:view', 'inventory:view',
    'payroll:view', 'resort_ops:edit', 'rooms:edit', 'schedules:edit',
    'setup:view', 'tasks:edit', 'timesheet:view', 'documents:view',
  ],
  assistantGM: [
    'orders:edit', 'kitchen:edit', 'bar:edit', 'housekeeping:edit',
    'reception:edit', 'experiences:edit', 'reports:view', 'inventory:view',
    'payroll:view', 'resort_ops:edit', 'rooms:edit', 'schedules:edit',
    'setup:view', 'tasks:edit', 'timesheet:edit', 'documents:view',
  ],
  receptionist: [
    'reception:edit', 'rooms:edit', 'orders:view', 'experiences:view',
    'schedules:view', 'timesheet:edit',
  ],
  fbManager: [
    'orders:edit', 'kitchen:edit', 'bar:edit', 'inventory:edit',
    'menu:edit', 'reports:view', 'schedules:edit', 'tasks:edit',
    'timesheet:edit', 'rooms:view', 'reception:view', 'resort_ops:view',
    'experiences:view', 'setup:view', 'documents:view',
  ],
  chef: [
    'kitchen:edit', 'orders:edit', 'inventory:view', 'schedules:view', 'timesheet:edit',
  ],
  cook: [
    'kitchen:view', 'orders:view', 'schedules:view', 'timesheet:edit',
  ],
  kitchenHelper: [
    'kitchen:view', 'orders:view', 'inventory:view', 'tasks:edit',
    'schedules:view', 'timesheet:edit',
  ],
  bartender: [
    'bar:edit', 'orders:edit', 'inventory:view', 'schedules:view', 'timesheet:edit',
  ],
  waiters: [
    'orders:edit', 'kitchen:view', 'bar:view', 'rooms:view',
    'schedules:view', 'timesheet:edit',
  ],
  cashier: [
    'orders:edit', 'reports:view', 'reception:view', 'experiences:view',
    'rooms:view', 'schedules:view', 'timesheet:edit',
  ],
  housekeeping: [
    'housekeeping:edit', 'tasks:edit', 'rooms:view', 'orders:view',
    'schedules:view', 'timesheet:edit',
  ],
  toursManager: [
    'experiences:edit', 'reports:view', 'inventory:view', 'orders:view',
    'reception:view', 'schedules:edit', 'tasks:edit', 'resort_ops:view',
    'rooms:view', 'documents:view', 'timesheet:edit',
  ],
  tours: [
    'experiences:edit', 'orders:view', 'reception:view', 'rooms:view',
    'schedules:view', 'timesheet:edit',
  ],
  transportation: [
    'experiences:edit', 'orders:view', 'reception:view', 'rooms:view',
    'schedules:view', 'timesheet:edit',
  ],
  maintenance: [
    'tasks:edit', 'rooms:view', 'inventory:view', 'reception:view',
    'schedules:view', 'timesheet:edit',
  ],
  landscaping: [
    'tasks:edit', 'inventory:view', 'schedules:view', 'timesheet:edit',
  ],
};

const BUILTIN_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  gm: 'General Manager',
  assistantGM: 'Assistant GM',
  receptionist: 'Receptionist',
  fbManager: 'F&B Manager',
  chef: 'Chef',
  cook: 'Cook',
  kitchenHelper: 'Kitchen Helper',
  bartender: 'Bartender / Barista',
  waiters: 'Waiters',
  cashier: 'Cashier',
  housekeeping: 'Housekeeping',
  toursManager: 'Tours Manager',
  tours: 'Tours',
  transportation: 'Transportation',
  maintenance: 'Maintenance',
  landscaping: 'Landscaping',
};

const GRANULAR_PERMISSIONS = [
  { key: 'orders', label: 'Orders' },
  { key: 'menu', label: 'Menu' },
  { key: 'kitchen', label: 'Kitchen Display' },
  { key: 'bar', label: 'Bar Display' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'reception', label: 'Reception' },
  { key: 'reception_display', label: 'Reception Display' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'reports', label: 'Reports' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'resort_ops', label: 'Resort Ops' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'schedules', label: 'Schedules' },
  { key: 'setup', label: 'Setup' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'timesheet', label: 'Timesheet' },
  { key: 'documents', label: 'Documents' },
] as const;

const LEVEL_LABELS: Record<PermissionLevel, string> = { off: 'Off', view: 'View', edit: 'Edit', manage: 'Edit' };
const LEVEL_COLORS: Record<PermissionLevel, string> = {
  off: 'bg-muted text-muted-foreground',
  view: 'bg-blue-600/20 text-blue-400 border-blue-500/40',
  edit: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40',
  manage: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40',
};

const PERM_LEVELS: Record<string, number> = { off: 0, view: 1, edit: 2, manage: 3 };
const LEVEL_BY_NUM = ['off', 'view', 'edit', 'manage'] as const;

type CustomRole = { id: string; name: string; permissions: string[]; created_at: string };
type EmployeeRole = { id: string; employee_id: string; role_key: string };

/* ── Combine permissions from multiple role templates ── */
function combineRolePermissions(roleKeys: string[], customRoles: CustomRole[]): string[] {
  const moduleMax: Record<string, number> = {};
  let hasAdmin = false;

  for (const rk of roleKeys) {
    let perms: string[] = [];
    if (rk.startsWith('builtin:')) {
      const key = rk.replace('builtin:', '');
      perms = BUILTIN_ROLE_TEMPLATES[key] || [];
    } else if (rk.startsWith('custom:')) {
      const id = rk.replace('custom:', '');
      const cr = customRoles.find(r => r.id === id);
      perms = cr?.permissions || [];
    }
    for (const p of perms) {
      if (p === 'admin') { hasAdmin = true; continue; }
      const parts = p.split(':');
      if (parts.length === 2) {
        const [mod, lvl] = parts;
        const num = PERM_LEVELS[lvl] ?? 0;
        moduleMax[mod] = Math.max(moduleMax[mod] ?? 0, num);
      }
    }
  }

  if (hasAdmin) return ['admin'];
  const result: string[] = [];
  for (const [mod, num] of Object.entries(moduleMax)) {
    if (num > 0) result.push(`${mod}:${LEVEL_BY_NUM[num]}`);
  }
  return result;
}

/* ── Helper to get label for a role_key ── */
function getRoleLabel(roleKey: string, customRoles: CustomRole[]): string {
  if (roleKey.startsWith('builtin:')) {
    return BUILTIN_ROLE_LABELS[roleKey.replace('builtin:', '')] || roleKey;
  }
  if (roleKey.startsWith('custom:')) {
    const cr = customRoles.find(r => r.id === roleKey.replace('custom:', ''));
    return cr?.name || roleKey;
  }
  return roleKey;
}

const StaffAccessManager = () => {
  const qc = useQueryClient();
  const [roleModal, setRoleModal] = useState<{ mode: 'create' | 'edit'; role?: CustomRole } | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [addingRoleFor, setAddingRoleFor] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-access'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('active', true).order('name');
      return data || [];
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['employee-permissions'],
    queryFn: async () => {
      const { data } = await (from('employee_permissions') as any).select('*');
      return (data || []) as { id: string; employee_id: string; permission: string }[];
    },
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ['staff-roles'],
    queryFn: async () => {
      const { data } = await (from('staff_roles') as any).select('*').order('created_at');
      return (data || []) as CustomRole[];
    },
  });

  const { data: employeeRoles = [] } = useQuery({
    queryKey: ['employee-roles'],
    queryFn: async () => {
      const { data } = await (from('employee_roles') as any).select('*');
      return (data || []) as EmployeeRole[];
    },
  });

  const getEmpPermissions = (empId: string) =>
    permissions.filter(p => p.employee_id === empId).map(p => p.permission);

  const getEmpRoles = (empId: string) =>
    employeeRoles.filter(r => r.employee_id === empId);

  /* ── Write combined permissions from roles to employee_permissions ── */
  const syncPermissionsFromRoles = async (empId: string, roleKeys: string[]) => {
    const combined = combineRolePermissions(roleKeys, customRoles);
    // Delete ALL existing permissions for this employee in one query (avoids stale cache issues)
    await from('employee_permissions').delete().eq('employee_id', empId);
    // Insert combined
    if (combined.length > 0) {
      await from('employee_permissions').insert(
        combined.map(perm => ({ employee_id: empId, permission: perm }))
      );
    }
    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
  };

  /* ── Add a role to an employee ── */
  const addRole = async (empId: string, roleKey: string) => {
    const existing = getEmpRoles(empId);
    if (existing.some(r => r.role_key === roleKey)) {
      toast.info('Role already assigned');
      return;
    }
    await from('employee_roles').insert({ employee_id: empId, role_key: roleKey });
    const newRoleKeys = [...existing.map(r => r.role_key), roleKey];
    await syncPermissionsFromRoles(empId, newRoleKeys);
    qc.invalidateQueries({ queryKey: ['employee-roles'] });
    setAddingRoleFor(null);
    toast.success('Role added');
  };

  /* ── Remove a role from an employee ── */
  const removeRole = async (empId: string, roleId: string, roleKey: string) => {
    await from('employee_roles').delete().eq('id', roleId);
    const remaining = getEmpRoles(empId).filter(r => r.id !== roleId).map(r => r.role_key);
    await syncPermissionsFromRoles(empId, remaining);
    qc.invalidateQueries({ queryKey: ['employee-roles'] });
    toast.success('Role removed');
  };

  const toggleAdmin = async (empId: string) => {
    const existing = permissions.find(p => p.employee_id === empId && p.permission === 'admin');
    if (existing) {
      await from('employee_permissions').delete().eq('id', existing.id);
    } else {
      await from('employee_permissions').insert({ employee_id: empId, permission: 'admin' });
    }
    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
    toast.success('Permission updated');
  };

  const cyclePermission = async (empId: string, section: string) => {
    const empPerms = getEmpPermissions(empId);
    const current = getPermissionLevel(empPerms, section);

    const toRemove = permissions.filter(
      p => p.employee_id === empId && (p.permission === section || p.permission === `${section}:view` || p.permission === `${section}:edit` || p.permission === `${section}:manage`)
    );
    for (const p of toRemove) {
      await from('employee_permissions').delete().eq('id', p.id);
    }

    // Always cycle: Off → View → Edit → Off (no manage)
    let nextLevel: PermissionLevel;
    nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : 'off';
    if (nextLevel !== 'off') {
      await from('employee_permissions').insert({ employee_id: empId, permission: `${section}:${nextLevel}` });
    }
    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
    toast.success(`${section} → ${LEVEL_LABELS[nextLevel]}`);
  };

  // Role CRUD
  const openCreateRole = () => {
    setRoleName('');
    setRolePerms([]);
    setRoleModal({ mode: 'create' });
  };

  const openEditRole = (role: CustomRole) => {
    setRoleName(role.name);
    setRolePerms([...role.permissions]);
    setRoleModal({ mode: 'edit', role });
  };

  const duplicateRole = (role: CustomRole) => {
    setRoleName(`${role.name} (copy)`);
    setRolePerms([...role.permissions]);
    setRoleModal({ mode: 'create' });
  };

  const deleteRole = async (roleId: string) => {
    await from('staff_roles').delete().eq('id', roleId);
    qc.invalidateQueries({ queryKey: ['staff-roles'] });
    toast.success('Role deleted');
  };

  const toggleRolePerm = (perm: string) => {
    setRolePerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const cycleRolePerm = (section: string) => {
    const current = getPermissionLevel(rolePerms, section);
    const cleaned = rolePerms.filter(p => p !== section && p !== `${section}:view` && p !== `${section}:edit` && p !== `${section}:manage`);

    // Always cycle: Off → View → Edit → Off (no manage)
    let nextLevel: PermissionLevel;
    nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : 'off';
    if (nextLevel !== 'off') {
      cleaned.push(`${section}:${nextLevel}`);
    }
    setRolePerms(cleaned);
  };

  const prefillFromTemplate = (templateKey: string) => {
    const perms = BUILTIN_ROLE_TEMPLATES[templateKey];
    if (perms) setRolePerms([...perms]);
  };

  const saveRole = async () => {
    if (!roleName.trim()) { toast.error('Enter a role name'); return; }
    if (roleModal?.mode === 'edit' && roleModal.role) {
      await from('staff_roles').update({ name: roleName.trim(), permissions: rolePerms }).eq('id', roleModal.role.id);
      toast.success('Role updated');
    } else {
      await from('staff_roles').insert({ name: roleName.trim(), permissions: rolePerms });
      toast.success('Role created');
    }
    setRoleModal(null);
    qc.invalidateQueries({ queryKey: ['staff-roles'] });
  };

  // All role options for the add-role dropdown
  const allRoleOptions = [
    ...Object.entries(BUILTIN_ROLE_LABELS).map(([key, label]) => ({
      key: `builtin:${key}`, label, isBuiltin: true,
    })),
    ...customRoles.map(r => ({
      key: `custom:${r.id}`, label: r.name, isBuiltin: false,
    })),
  ];

  if (employees.length === 0) {
    return (
      <section>
        <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Staff Access</h3>
        <p className="font-body text-xs text-muted-foreground">No active employees found.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-sm tracking-wider text-foreground">Staff Access</h3>
        <Button size="sm" variant="outline" className="font-display text-xs h-8" onClick={openCreateRole}>
          <Plus className="h-3 w-3 mr-1" /> Create Role
        </Button>
      </div>
      <p className="font-body text-xs text-muted-foreground mb-3">
        Assign multiple roles per staff — permissions combine (highest level wins). Tap badges to cycle individual permissions.
      </p>

      {/* Custom Roles Management */}
      {customRoles.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Custom Roles</p>
          {customRoles.map(role => (
            <div key={role.id} className="border border-border rounded-lg p-2 flex items-center justify-between">
              <div>
                <span className="font-display text-xs text-foreground">{role.name}</span>
                <span className="font-body text-[10px] text-muted-foreground ml-2">({role.permissions.length} perms)</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditRole(role)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-accent">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => duplicateRole(role)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-accent">
                  <Copy className="h-3 w-3" />
                </button>
                <button onClick={() => deleteRole(role.id)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {employees.map((emp: any) => {
          const empPerms = getEmpPermissions(emp.id);
          const empIsAdmin = empPerms.includes('admin');
          const empRoles = getEmpRoles(emp.id);

          return (
            <div key={emp.id} className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <p className="font-display text-sm text-foreground tracking-wider">
                  {emp.display_name || emp.name}
                </p>
                {empRoles.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {empRoles.map((er, idx) => (
                      <Badge key={er.id} variant={idx === 0 ? 'default' : 'secondary'} className="font-display text-[10px] tracking-wider">
                        {getRoleLabel(er.role_key, customRoles)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Assigned Roles as pills */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {empRoles.map(er => (
                  <Badge key={er.id} variant="secondary" className="font-display text-[11px] tracking-wider gap-1 pr-1">
                    {getRoleLabel(er.role_key, customRoles)}
                    <button
                      onClick={() => removeRole(emp.id, er.id, er.role_key)}
                      className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                {addingRoleFor === emp.id ? (
                  <Select onValueChange={(val) => { addRole(emp.id, val); }}>
                    <SelectTrigger className="h-6 text-[11px] font-display tracking-wider w-40 border-dashed">
                      <SelectValue placeholder="Select role…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__divider_builtin" disabled className="text-[10px] text-muted-foreground">— Built-in —</SelectItem>
                      {Object.entries(BUILTIN_ROLE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={`builtin:${key}`} className="text-xs">{label}</SelectItem>
                      ))}
                      {customRoles.length > 0 && (
                        <SelectItem value="__divider_custom" disabled className="text-[10px] text-muted-foreground">— Custom —</SelectItem>
                      )}
                      {customRoles.map(r => (
                        <SelectItem key={r.id} value={`custom:${r.id}`} className="text-xs">{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <button
                    onClick={() => setAddingRoleFor(emp.id)}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-dashed border-border text-[11px] font-display tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" /> Add Role
                  </button>
                )}
              </div>

              {/* Admin toggle */}
              <label className="flex items-center gap-2 cursor-pointer mb-1">
                <Switch
                  checked={empIsAdmin}
                  onCheckedChange={() => toggleAdmin(emp.id)}
                  className="data-[state=checked]:bg-amber-600"
                />
                <span className="font-display text-xs tracking-wider text-foreground">
                  Admin (Full Access)
                </span>
              </label>
              {empIsAdmin && (
                <p className="font-body text-[11px] text-amber-500/80 mb-2 ml-[3.25rem]">
                  Full access to all sections
                </p>
              )}

              {/* Granular permissions — read-only when roles are assigned (roles are source of truth) */}
              <div className={`space-y-1.5 mt-2 ${empIsAdmin ? 'opacity-40 pointer-events-none' : ''}`}>
                {empRoles.length > 0 && !empIsAdmin && (
                  <p className="font-body text-[10px] text-muted-foreground italic mb-1">
                    Permissions set by roles — remove roles to edit manually
                  </p>
                )}
                {GRANULAR_PERMISSIONS.map(({ key, label }) => {
                  const level = empIsAdmin ? 'edit' : getPermissionLevel(empPerms, key);
                  const hasRoles = empRoles.length > 0;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="font-body text-xs text-muted-foreground">{label}</span>
                      <button
                        onClick={() => !hasRoles && cyclePermission(emp.id, key)}
                        disabled={empIsAdmin || hasRoles}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-display tracking-wider border transition-colors ${LEVEL_COLORS[level]} ${hasRoles ? 'opacity-60 cursor-default' : ''}`}
                      >
                        {LEVEL_LABELS[level]}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Role Create/Edit Modal */}
      <Dialog open={!!roleModal} onOpenChange={() => setRoleModal(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">
              {roleModal?.mode === 'edit' ? 'Edit Role' : 'Create Role'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="font-body text-xs text-muted-foreground">Role Name</label>
              <Input value={roleName} onChange={e => setRoleName(e.target.value)}
                placeholder="e.g. Massage Manager" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>


            <div>
              <p className="font-body text-xs text-muted-foreground mb-2">Permissions (tap to cycle)</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-body text-xs text-muted-foreground">Admin (Full)</span>
                  <button
                    onClick={() => toggleRolePerm('admin')}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-display tracking-wider border transition-colors ${
                      rolePerms.includes('admin') ? 'bg-amber-600/20 text-amber-400 border-amber-500/40' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {rolePerms.includes('admin') ? 'On' : 'Off'}
                  </button>
                </div>
                {GRANULAR_PERMISSIONS.map(({ key, label }) => {
                  const level = getPermissionLevel(rolePerms, key);
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="font-body text-xs text-muted-foreground">{label}</span>
                      <button
                        onClick={() => cycleRolePerm(key)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-display tracking-wider border transition-colors ${LEVEL_COLORS[level]}`}
                      >
                        {LEVEL_LABELS[level]}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 font-display text-xs" onClick={() => setRoleModal(null)}>Cancel</Button>
            <Button className="flex-1 font-display text-xs" onClick={saveRole}>
              {roleModal?.mode === 'edit' ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default StaffAccessManager;
