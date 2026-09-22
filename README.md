# Rivan School — Direct GitHub Pages Build

هذه النسخة لا تحتاج npm أو Vite أو GitHub Actions.

## طريقة النشر
1. احذف محتويات مستودع `online-school` الحالية أو استبدلها بهذه الملفات.
2. ارفع `index.html` و `.nojekyll` مباشرة في جذر فرع `main`.
3. GitHub → Settings → Pages.
4. Build and deployment → Source: **Deploy from a branch**.
5. Branch: **main** / Folder: **/(root)** ثم Save.
6. افتح: https://waeljakson.github.io/online-school/

الصفحة نفسها تنظف Service Workers وCaches القديمة تلقائيًا عند الفتح.
