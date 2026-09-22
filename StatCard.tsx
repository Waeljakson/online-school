import type { LucideIcon } from 'lucide-react';

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'primary',
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-icon"><Icon size={21} /></div>
      <div>
        <div className="stat-title">{title}</div>
        <div className="stat-value">{value}</div>
        {subtitle && <div className="stat-subtitle">{subtitle}</div>}
      </div>
    </article>
  );
}
