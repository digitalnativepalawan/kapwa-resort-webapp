import { toast } from 'sonner';

interface MessengerEmployee {
  name: string;
  display_name?: string;
  messenger_link: string;
  active: boolean;
}

export async function sendMessengerMessage(
  employee: MessengerEmployee,
  messageContent: string,
  resortName: string
) {
  if (!employee.messenger_link?.trim()) {
    toast.error('No Messenger link configured for ' + (employee.display_name || employee.name));
    return;
  }

  if (!employee.active) {
    toast.error('Employee is inactive');
    return;
  }

  const displayName = employee.display_name || employee.name;
  const formatted = `Hi ${displayName},\n${messageContent}\n\n-- ${resortName} Admin`;

  // Copy message to clipboard for pasting
  try {
    await navigator.clipboard.writeText(formatted);
    toast.success('Message copied to clipboard');
  } catch {
    toast.info('Could not copy to clipboard — please copy manually');
  }

  // Open Messenger conversation — handle full Facebook URLs or plain usernames
  const raw = employee.messenger_link.trim();
  let username = raw;
  if (raw.includes('facebook.com')) {
    // Extract username from URLs like https://www.facebook.com/davidlesmith
    const parts = raw.replace(/\/+$/, '').split('/');
    username = parts[parts.length - 1];
  } else if (raw.startsWith('http')) {
    // Some other URL format — try to extract last path segment
    const parts = raw.replace(/\/+$/, '').split('/');
    username = parts[parts.length - 1];
  }
  const messengerUrl = `https://m.me/${username}`;
  window.open(messengerUrl, '_blank');
  toast.info('Messenger opened — paste and send your message');
}

interface WhatsAppTask {
  title: string;
  status: string;
  due_date?: string | null;
}

interface WhatsAppShift {
  clock_in: string;
  clock_out?: string | null;
  hours_worked?: number | null;
}

export function buildTeamWhatsAppMessage(
  employeeName: string,
  tasks: WhatsAppTask[],
  shifts: WhatsAppShift[],
  resortName: string
): string {
  let msg = `Hi ${employeeName},\n\n`;

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  if (pendingTasks.length > 0) {
    msg += `📋 *Your Tasks:*\n`;
    pendingTasks.forEach(t => {
      const due = t.due_date ? ` (due ${new Date(t.due_date).toLocaleDateString()})` : '';
      msg += `• ${t.title}${due}\n`;
    });
    msg += '\n';
  }

  if (shifts.length > 0) {
    msg += `🕐 *Recent Shifts:*\n`;
    shifts.slice(0, 5).forEach(s => {
      const date = new Date(s.clock_in).toLocaleDateString();
      const hrs = s.hours_worked ? ` — ${Number(s.hours_worked).toFixed(1)}h` : '';
      msg += `• ${date}${hrs}\n`;
    });
    msg += '\n';
  }

  if (pendingTasks.length === 0 && shifts.length === 0) {
    msg += `No pending tasks or recent shifts to report.\n\n`;
  }

  msg += `— ${resortName} Admin`;
  return msg;
}

export function openWhatsApp(number: string, message: string) {
  const cleaned = number.replace(/[^0-9+]/g, '');
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${cleaned}?text=${encoded}`, '_blank');
}
