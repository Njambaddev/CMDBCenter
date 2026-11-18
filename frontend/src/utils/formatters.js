import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function formatDateTime(value) {
  if (!value || value === '—') return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('DD MMM YYYY, HH:mm') : String(value);
}

export function formatRelative(value) {
  if (!value || value === '—') return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.fromNow() : '';
}

export function formatSlaCountdown(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return 'No Active Timer';
  }
  const num = Number(seconds);
  const abs = Math.abs(num);
  const hrs = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);

  if (num < 0) {
    return hrs > 0 ? `Overdue by ${hrs}h ${mins}m` : `Overdue by ${mins}m`;
  }
  return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
}

export function getIncidentColor(state = '') {
  const s = String(state).toLowerCase();
  if (s === 'operational') return 'success';
  if (s === 'warning') return 'warning';
  if (s === 'incident') return 'error';
  return 'default';
}

export function getDeploymentColor(state = '') {
  const s = String(state).toLowerCase();
  if (s === 'production') return 'blue';
  if (s === 'retired' || s === 'inactive') return 'default';
  if (s.includes('maintenance') || s.includes('repair')) return 'orange';
  if (s.includes('planned') || s.includes('pilot') || s.includes('test')) return 'purple';
  return 'geekblue';
}

export function getPriorityColor(priority = '') {
  const p = String(priority).toLowerCase();
  if (p.includes('critical') || p.includes('5') || p.includes('4')) return 'red';
  if (p.includes('major') || p.includes('high') || p.includes('3')) return 'orange';
  if (p.includes('minor') || p.includes('2')) return 'blue';
  return 'default';
}

export function getTicketStateColor(state = '') {
  const s = String(state).toLowerCase();
  if (s === 'new') return 'purple';
  if (s === 'open') return 'processing';
  if (s.includes('pending')) return 'warning';
  if (s.includes('closed')) return 'success';
  return 'default';
}

export function getSlaStatusMeta(status = '') {
  switch (status) {
    case 'breached':
      return { color: 'error', label: 'SLA Breached' };
    case 'approaching_breach':
      return { color: 'warning', label: 'Approaching Breach' };
    case 'within_sla':
      return { color: 'processing', label: 'Within SLA' };
    case 'met':
      return { color: 'success', label: 'SLA Met' };
    default:
      return { color: 'default', label: 'No SLA' };
  }
}
