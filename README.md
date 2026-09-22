# Online School Management

نسخة تأسيسية لنظام إدارة مدرسة أونلاين متكامل (تعليمي + مالي) مبني بـ React/Vite ومصمم RTL بخط Cairo، مع Neon PostgreSQL/Auth/Data API.

## التشغيل

1. انسخ `.env.example` إلى `.env`.
2. أضف `VITE_NEON_AUTH_URL` و `VITE_NEON_DATA_API_URL` الخاصة بفرع Neon.
3. شغّل `npm install` ثم `npm run dev`.
4. للنشر على GitHub Pages شغّل `npm run build` وانشر مجلد `dist` عبر GitHub Actions.

## البنية الحالية

- Dashboard متجاوب للكمبيوتر والجوال والآيباد.
- أقسام الطلاب، التعليم، الحضور، المالية، المصروفات، التقارير والصلاحيات.
- Neon Auth + Data API client scaffold.
- PWA manifest/service worker.
- قاعدة البيانات موجودة على Neon في فرع تطوير مستقل، مع RLS حسب الدور.
