import { useMemo, useState } from 'react';
import {
  Banknote,
  Bell,
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { StatCard } from './components/StatCard';
import { neonConfigured } from './lib/neon';

type Section = 'dashboard' | 'students' | 'education' | 'attendance' | 'finance' | 'expenses' | 'reports' | 'settings';

const navItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'students', label: 'الطلاب وأولياء الأمور', icon: UsersRound },
  { id: 'education', label: 'الإدارة التعليمية', icon: GraduationCap },
  { id: 'attendance', label: 'الحضور والغياب', icon: ClipboardCheck },
  { id: 'finance', label: 'الاشتراكات والتحصيل', icon: CreditCard },
  { id: 'expenses', label: 'المصروفات والإيرادات', icon: WalletCards },
  { id: 'reports', label: 'التقارير', icon: ChartNoAxesCombined },
  { id: 'settings', label: 'الإعدادات والصلاحيات', icon: Settings },
];

const students: Array<{ name: string; grade: string; attendance: string; balance: string; status: string }> = [];

function App() {
  const [active, setActive] = useState<Section>('dashboard');
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState('');

  const filteredStudents = useMemo(
    () => students.filter((s) => s.name.includes(query) || s.grade.includes(query)),
    [query],
  );

  const title = navItems.find((item) => item.id === active)?.label ?? 'لوحة التحكم';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={25} /></div>
          <div>
            <strong>مدرستي أونلاين</strong>
            <span>نظام الإدارة المتكامل</span>
          </div>
          <button className="icon-button mobile-only" onClick={() => setDrawer(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>

        <nav className="nav-list">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${active === id ? 'active' : ''}`} onClick={() => { setActive(id); setDrawer(false); }}>
              <Icon size={19} />
              <span>{label}</span>
              <ChevronLeft size={16} className="nav-chevron" />
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`connection ${neonConfigured ? 'ok' : 'pending'}`}>
            <ShieldCheck size={16} />
            <span>{neonConfigured ? 'Neon متصل' : 'بيئة Neon تحتاج المتغيرات'}</span>
          </div>
          <button className="nav-item muted"><LogOut size={18} /><span>تسجيل الخروج</span></button>
        </div>
      </aside>

      {drawer && <button className="overlay" onClick={() => setDrawer(false)} aria-label="إغلاق القائمة" />}

      <main className="main">
        <header className="topbar">
          <div className="topbar-start">
            <button className="icon-button mobile-only" onClick={() => setDrawer(true)} aria-label="فتح القائمة"><Menu size={22} /></button>
            <div>
              <h1>{title}</h1>
              <p>الثلاثاء 22 سبتمبر 2026</p>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="search-box desktop-search"><Search size={18} /><input placeholder="بحث سريع..." /></div>
            <button className="icon-button notification"><Bell size={20} /><span /></button>
            <div className="avatar">م</div>
          </div>
        </header>

        <div className="content">
          {active === 'dashboard' ? (
            <>
              <section className="welcome-card">
                <div>
                  <span className="eyebrow">نظرة عامة</span>
                  <h2>متابعة المدرسة التعليمية والمالية من مكان واحد</h2>
                  <p>الواجهة مهيأة للطلاب، أولياء الأمور، المعلمين والإدارة مع صلاحيات مستقلة لكل مستخدم.</p>
                </div>
                <div className="welcome-badge"><BookOpenCheck size={34} /><span>العام الدراسي<br /><strong>2026 / 2027</strong></span></div>
              </section>

              <section className="stats-grid">
                <StatCard title="الطلاب النشطون" value="—" subtitle="بيانات فعلية فقط" icon={UsersRound} tone="primary" />
                <StatCard title="المعلمون النشطون" value="—" subtitle="بيانات فعلية فقط" icon={UserRoundCheck} tone="success" />
                <StatCard title="تحصيل الشهر" value="—" subtitle="بيانات فعلية فقط" icon={TrendingUp} tone="success" />
                <StatCard title="المستحقات" value="—" subtitle="بيانات فعلية فقط" icon={ReceiptText} tone="warning" />
              </section>

              <section className="dashboard-grid">
                <article className="panel large-panel">
                  <div className="panel-head">
                    <div><h3>التحصيل الشهري</h3><p>ملخص الإيرادات والمستحقات</p></div>
                    <button className="text-button">عرض التقرير</button>
                  </div>
                  <div className="chart-placeholder" aria-label="لا توجد بيانات تجريبية">
                    <div className="students-empty">لا يتم عرض أي بيانات إلا بعد تحميلها من النظام.</div>
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-head"><div><h3>حصص اليوم</h3><p>بيانات فعلية فقط</p></div><CalendarDays size={20} /></div>
                  <div className="lesson-list">
                    <div className="students-empty">لا يتم عرض حصص تجريبية.</div>
                  </div>
                </article>
              </section>

              <section className="panel students-panel">
                <div className="panel-head responsive-head">
                  <div><h3>متابعة الطلاب</h3><p>آخر الحالات التي تحتاج انتباه الإدارة</p></div>
                  <div className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث باسم الطالب أو الصف" /></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>الطالب</th><th>الصف</th><th>الحضور</th><th>الحالة المالية</th><th>الحالة</th></tr></thead>
                    <tbody>
                      {filteredStudents.map((student) => (
                        <tr key={student.name}>
                          <td><div className="student-cell"><span className="student-avatar">{student.name.charAt(0)}</span><strong>{student.name}</strong></div></td>
                          <td>{student.grade}</td><td>{student.attendance}</td>
                          <td><span className={student.balance === 'مسدد' ? 'paid' : 'due'}>{student.balance}</span></td>
                          <td><span className={`status ${student.status === 'نشط' ? 'active' : 'watch'}`}>{student.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="module-placeholder">
              <div className="module-icon"><Banknote size={30} /></div>
              <h2>{title}</h2>
              <p>تم تجهيز هيكل هذا القسم وربطه بنموذج الصلاحيات. سيتم إدخال الشاشات التشغيلية التفصيلية في المرحلة التالية.</p>
            </section>
          )}
        </div>
      </main>

      <nav className="bottom-nav">
        {navItems.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={19} /><span>{label.split(' ')[0]}</span></button>
        ))}
      </nav>
    </div>
  );
}

export default App;
